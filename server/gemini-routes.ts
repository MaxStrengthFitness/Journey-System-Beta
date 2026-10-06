/**
 * The two Gemini routes the legacy chart importer calls:
 *   POST /api/gemini/processChart     — one chart page → its sessions
 *   POST /api/gemini/extractSettings  — every page → the machine settings
 *
 * Round: Gemini route lock-down (Sep 24 2026). Until now these were declared
 * in server.ts ABOVE the /api/mindbody sign-in check, so they answered anyone
 * who found the URL, took a 50 MB body, and had no limit: a stranger could
 * spend the studio's Gemini quota, and a few large bodies at once could run
 * the single web process out of memory.
 *
 * Every request now passes, IN THIS ORDER:
 *   1. the same staff sign-in as /api/mindbody/* (server/auth.ts), so a
 *      caller with no sign-in is refused before a byte of the body is read;
 *   2. a per-person limit (src/lib/request-limit.ts) — two at once, sixty in
 *      fifteen minutes; a twelve-page scan is thirteen requests;
 *   3. ONE SCAN AT A TIME for the whole process (the speed round, R20, Oct 5
 *      2026), taken before the body is read: while one request is with the
 *      model, another is answered 503 { error: "busy" } at once rather than
 *      queued with up to 20 MB of pages held in memory. The importer sends
 *      one request at a time and shows "Journey is reading another scan";
 *      this is what lets the service run on a small instance (render.yaml);
 *   4. the body, capped at CHART_BODY_LIMIT (src/services/chart-upload.ts,
 *      which also says why that number);
 *   5. a check of the pages themselves (at most MAX_CHART_PAGES, photos or
 *      PDFs), before anything is sent to the model.
 * server.ts's own body parser skips /api/gemini/* so that step 3 happens here,
 * after the sign-in, and not before it.
 *
 * The browser half is src/services/geminiService.ts, which calls these with
 * authedFetch. The route handlers and the sign-in are passed in, so
 * src/services/gemini-routes.test.ts can mount them on a bare Express app.
 */

import express, { type Express, type RequestHandler } from "express";
import {
  createRequestLimiter,
  type RequestLimiter,
  type RequestLimitOptions,
} from "../src/lib/request-limit.ts";
import { CHART_BODY_LIMIT, readChartImages, SCAN_BUSY } from "../src/services/chart-upload.ts";
import type { extractMachineSettingsFromImage, processLegacyChart } from "./gemini.ts";

export const GEMINI_LIMITS: RequestLimitOptions = {
  maxInFlight: 2,
  maxPerWindow: 60,
  windowMs: 15 * 60 * 1000,
};

/** Paths server.ts's shared body parser leaves alone: these routes read their own body, after the sign-in. Case-insensitive, as Express matches routes. */
export function isGeminiPath(path: string): boolean {
  return /^\/api\/gemini(\/|$)/i.test(path);
}

export interface GeminiRouteDeps {
  /** The staff sign-in check: requireStaff() from server/auth.ts. */
  requireSignIn: RequestHandler;
  processLegacyChart: typeof processLegacyChart;
  extractMachineSettingsFromImage: typeof extractMachineSettingsFromImage;
  /** Defaults to one built from GEMINI_LIMITS. */
  limiter?: RequestLimiter;
  /** Defaults to one slot for both routes. */
  gate?: ScanGate;
}

/** How many scans the process reads at once, across both routes and everyone. */
export const SCANS_AT_ONCE = 1;

export interface ScanGate {
  /** A release function when a slot was free (safe to call twice), else null. */
  tryTake(): (() => void) | null;
  /** Scans running now; for tests. */
  running(): number;
}

export function createScanGate(slots: number = SCANS_AT_ONCE): ScanGate {
  let running = 0;
  return {
    tryTake() {
      if (running >= slots) return null;
      running++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        running--;
      };
    },
    running: () => running,
  };
}

/**
 * Takes the process's scan slot before the body is read. The slot is freed
 * when the answer has gone, or the connection closed, before the model was
 * asked (a refused page, an oversized body, a caller who gave up); once the
 * model has been asked, only when it has answered (`withScanSlot`'s finally).
 * That wait is bounded: each attempt at the model has 90 s, and the request
 * as a whole, retries included, at most GEMINI_SCAN_DEADLINE_MS (120 s) in
 * server/gemini.ts. A caller who walks away while the model works does NOT
 * free the slot (a deliberate difference from "release on client abort"):
 * freeing it then would let a second scan in while the first one's pages are
 * still in memory, which is what the slot is for.
 */
function oneScanAtATime(gate: ScanGate): RequestHandler {
  return (_req, res, next) => {
    const release = gate.tryTake();
    if (!release) {
      res.set("Retry-After", "5");
      res.status(503).json({ error: SCAN_BUSY });
      return;
    }
    res.locals.scanSlot = release;
    const freeUnlessWorking = () => {
      if (!res.locals.scanWorking) release();
    };
    res.on("finish", freeUnlessWorking);
    res.on("close", freeUnlessWorking);
    next();
  };
}

/** Runs the model call holding the slot, and frees it when the call is over. */
async function withScanSlot<T>(res: express.Response, work: () => Promise<T>): Promise<T> {
  res.locals.scanWorking = true;
  try {
    return await work();
  } finally {
    res.locals.scanWorking = false;
    res.locals.scanSlot?.();
  }
}

function perCallerLimit(limiter: RequestLimiter): RequestHandler {
  return (_req, res, next) => {
    // Set by requireStaff. Refuse rather than share one bucket if it's missing.
    const uid = res.locals.caller?.uid;
    if (typeof uid !== "string" || uid === "") {
      res.status(401).json({ error: "Please sign in again — this request carried no sign-in." });
      return;
    }
    const decision = limiter.acquire(uid);
    if (!decision.ok) {
      res.set("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({ error: decision.error });
      return;
    }
    res.on("finish", decision.release);
    res.on("close", decision.release);
    next();
  };
}

/** express.json with the chart ceiling, answering in JSON (the app can't read Express's HTML error page). */
function chartBody(): RequestHandler {
  const parse = express.json({ limit: CHART_BODY_LIMIT });
  return (req, res, next) =>
    parse(req, res, (err?: any) => {
      if (!err) return next();
      if (err.type === "entity.too.large") {
        console.warn("Rejected oversized chart upload on", req.path);
        res.status(413).json({
          error: "Those chart pages are too big to send in one go. Try fewer pages at a time.",
        });
        return;
      }
      if (typeof err.status === "number" && err.status >= 400 && err.status < 500) {
        res.status(err.status).json({ error: "That request couldn't be read." });
        return;
      }
      next(err);
    });
}

/** A number the prompt can print, or undefined. */
function finiteOrUndefined(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function registerGeminiRoutes(app: Express, deps: GeminiRouteDeps): void {
  const guard = [
    deps.requireSignIn,
    perCallerLimit(deps.limiter ?? createRequestLimiter(GEMINI_LIMITS)),
    oneScanAtATime(deps.gate ?? createScanGate()),
    chartBody(),
  ];

  app.post("/api/gemini/processChart", ...guard, async (req, res) => {
    const pages = readChartImages(req.body?.images);
    if (!pages.ok) return res.status(400).json({ error: pages.error });
    try {
      const { expectedSessions, pageIndex, totalPages } = req.body;
      const data = await withScanSlot(res, () =>
        deps.processLegacyChart(
          pages.images,
          finiteOrUndefined(expectedSessions) ?? 12,
          finiteOrUndefined(pageIndex),
          finiteOrUndefined(totalPages),
        ),
      );
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/extractSettings", ...guard, async (req, res) => {
    const pages = readChartImages(req.body?.images);
    if (!pages.ok) return res.status(400).json({ error: pages.error });
    try {
      const data = await withScanSlot(res, () => deps.extractMachineSettingsFromImage(pages.images));
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}
