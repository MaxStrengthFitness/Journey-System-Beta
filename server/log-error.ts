/**
 * POST /api/log-error: the app's own error reports, written to the log Render
 * keeps (the speed round, Oct 5 2026).
 *
 * The browser sends one when a screen breaks (ErrorBoundary, LoadBoundary),
 * when the page throws (main.tsx, capped at 50 reports a page load), and once
 * per cold boot a small "boot" report (kind "boot", under 2 KB). The route
 * needs no sign-in, on purpose: a page that failed before anyone signed in is
 * exactly the one worth hearing about. That made it the one door where a
 * stranger, or an error storm, could make this single process parse a 1 MB
 * body and print it, as often as they liked. Now, in this order:
 *
 *   1. A LIMIT PER ADDRESS, before the body is read: 120 reports a minute.
 *      A studio puts about six iPads behind ONE public address, so this is a
 *      studio's limit, not an iPad's. Six iPads each hitting the page cap of
 *      50 in the same minute is 300, but a storm is one error repeated, and
 *      the first 120 carry every distinct thing a studio is seeing; an
 *      ordinary minute (a boot report per iPad, the odd broken screen) is a
 *      handful. And a limit over EVERY address (1,200 a minute), because the
 *      address is read from X-Forwarded-For, which a caller can write.
 *      A refused report gets 429 and one log line a minute says how many.
 *   2. ITS OWN BODY LIMIT, 16 KB, instead of the shared 1 MB (server.ts's
 *      shared parser skips this path). A real report is a message, a stack
 *      and a component stack: a few KB. One over the limit is still logged
 *      as a line, so it isn't lost in silence.
 *   3. TRUNCATED FIELDS: the stack and component stack at 4,000 characters,
 *      the message at 1,000, any other text at 500 and a nested value (kept
 *      as JSON) at 2,000, at most 24 fields. A boot report fits whole.
 *
 * The browser ignores the answer, so the reporter's contract is unchanged:
 * the same POST, the same JSON, { ok: true } when it was logged.
 */

import fs from "node:fs";
import express, { type Express, type Request, type RequestHandler } from "express";

export const LOG_ERROR_BODY_LIMIT = "16kb";
export const LOG_ERROR_LIMITS = {
  perAddressPerMinute: 120,
  allPerMinute: 1_200,
  windowMs: 60_000,
};

const FIELD_CAPS: Record<string, number> = { stack: 4_000, componentStack: 4_000, message: 1_000 };
const OTHER_CAP = 500;
/** A nested value (a boot report's timings, say) is kept as JSON up to this. */
const OBJECT_CAP = 2_000;
const MAX_FIELDS = 24;

/** Paths server.ts's shared body parser leaves alone (this route reads its own). Case-insensitive, as Express matches routes. */
export function isLogErrorPath(path: string): boolean {
  return /^\/api\/log-error\/?$/i.test(path);
}

function cut(text: string, cap: number): string {
  return text.length > cap ? `${text.slice(0, cap)}... [cut, ${text.length} characters]` : text;
}

/** The report as it is logged: every field capped, nothing undefined. */
export function trimReport(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { body: cut(typeof body === "string" ? body : JSON.stringify(body) ?? String(body), OTHER_CAP) };
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(body as Record<string, unknown>);
  for (const [key, value] of entries.slice(0, MAX_FIELDS)) {
    const cap = FIELD_CAPS[key] ?? OTHER_CAP;
    if (value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = cut(value, cap);
    else out[key] = cut(JSON.stringify(value) ?? String(value), FIELD_CAPS[key] ?? OBJECT_CAP);
  }
  if (entries.length > MAX_FIELDS) out.droppedFields = entries.length - MAX_FIELDS;
  return out;
}

/** Who sent it, as near as the server can tell: the first X-Forwarded-For address, else the socket's. */
export function reporterAddress(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export interface LogErrorLimits {
  perAddressPerMinute: number;
  allPerMinute: number;
  windowMs: number;
}

/** Fixed one-minute windows: enough for telemetry, and a map no bigger than the addresses seen this minute. */
export function createReportLimiter(limits: LogErrorLimits, now: () => number = Date.now) {
  let windowStart = now();
  let all = 0;
  let dropped = 0;
  let byAddress = new Map<string, number>();
  return {
    /** true: log it. Also says, once a window, how many the last window dropped. */
    take(address: string): { ok: boolean; droppedLastWindow: number } {
      const t = now();
      let droppedLastWindow = 0;
      if (t - windowStart >= limits.windowMs) {
        droppedLastWindow = dropped;
        windowStart = t;
        all = 0;
        dropped = 0;
        byAddress = new Map();
      }
      const mine = byAddress.get(address) ?? 0;
      if (mine >= limits.perAddressPerMinute || all >= limits.allPerMinute) {
        dropped++;
        return { ok: false, droppedLastWindow };
      }
      byAddress.set(address, mine + 1);
      all++;
      return { ok: true, droppedLastWindow };
    },
  };
}

export interface LogErrorDeps {
  limits?: LogErrorLimits;
  now?: () => number;
  log?: (...args: unknown[]) => void;
  /** The local file copy; off in production. */
  writeFile?: boolean;
}

export function registerLogErrorRoute(app: Express, deps: LogErrorDeps = {}): void {
  const log = deps.log ?? ((...args: unknown[]) => console.log(...args));
  const limiter = createReportLimiter(deps.limits ?? LOG_ERROR_LIMITS, deps.now);
  const writeFile = deps.writeFile ?? process.env.NODE_ENV !== "production";

  const limit: RequestHandler = (req, res, next) => {
    const decision = limiter.take(reporterAddress(req));
    if (decision.droppedLastWindow > 0) {
      log(`CLIENT ERROR: ${decision.droppedLastWindow} report(s) over the limit were not logged last minute.`);
    }
    if (!decision.ok) {
      res.status(429).json({ ok: false });
      return;
    }
    next();
  };

  const parse = express.json({ limit: LOG_ERROR_BODY_LIMIT });
  const body: RequestHandler = (req, res, next) =>
    parse(req, res, (err?: any) => {
      if (!err) return next();
      if (err.type === "entity.too.large") {
        log("CLIENT ERROR: a report over 16 KB was refused", { length: req.headers["content-length"] });
        res.status(413).json({ ok: false, error: "Report too large" });
        return;
      }
      res.status(typeof err.status === "number" && err.status < 500 ? err.status : 400).json({ ok: false });
    });

  app.post("/api/log-error", limit, body, (req, res) => {
    const report = trimReport(req.body);
    // Always goes to stdout, which is what the hosting platform captures.
    log("CLIENT ERROR:", report);

    // The file copy is a local-development convenience only. It used to be a
    // bare appendFileSync: one unhandled throw (read-only or full disk)
    // returned a 500, and a client error storm (the Firestore assertion bug
    // produced 3,664 in one session) blocked the single Node thread on every
    // write, which stalls the whole server.
    if (writeFile) {
      fs.appendFile("client-errors.log", JSON.stringify(report) + "\n", (err) => {
        if (err) console.warn("Could not write client-errors.log:", err.message);
      });
    }
    res.json({ ok: true });
  });
}
