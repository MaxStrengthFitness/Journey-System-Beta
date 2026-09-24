/**
 * The Gemini OCR routes, mounted on a bare Express app and called over HTTP.
 *
 * Round: Gemini route lock-down (Sep 24 2026). Until now these two routes
 * answered anyone and spent the studio's Gemini quota for them. What this
 * pins down:
 *   - with the REAL staff sign-in (server/auth.ts), a request with no sign-in
 *     is refused and never reaches the model — whatever the path's case, and
 *     before its body is even read;
 *   - server.ts mounts them through registerGeminiRoutes with that sign-in,
 *     and declares no /api/gemini route of its own;
 *   - a signed-in caller gets through, within the body limit, the page check
 *     and the per-person limit.
 * The signed-in cases swap the sign-in for a stub, because a real one needs a
 * live Firebase token.
 */

import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireStaff } from "../../server/auth";
import { registerGeminiRoutes } from "../../server/gemini-routes";
import { createRequestLimiter, type RequestLimiter } from "../lib/request-limit";
import { MAX_CHART_PAGES } from "./chart-upload";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = { base64: "aGVsbG8=", mimeType: "image/jpeg" };

const servers: { close: () => void }[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
});

/** A stand-in for requireStaff that lets `uid` through, as the real one does once a token checks out. */
function signedInAs(uid: string): RequestHandler {
  return (_req, res, next) => {
    res.locals.caller = { uid, role: "LifeTransformer" };
    next();
  };
}

async function mount(opts: { requireSignIn: RequestHandler; limiter?: RequestLimiter; chart?: () => Promise<unknown> }) {
  const processLegacyChart = vi.fn(opts.chart ?? (async () => ({ sessionHeaders: [], performances: [] })));
  const extractMachineSettingsFromImage = vi.fn(async () => [{ machineId: "m-leg-press", seat: "4" }]);
  const app = express();
  registerGeminiRoutes(app, {
    requireSignIn: opts.requireSignIn,
    limiter: opts.limiter,
    processLegacyChart: processLegacyChart as any,
    extractMachineSettingsFromImage: extractMachineSettingsFromImage as any,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { post, processLegacyChart, extractMachineSettingsFromImage };
}

describe("with the real staff sign-in", () => {
  it("refuses both routes without a sign-in, and never calls the model", async () => {
    const api = await mount({ requireSignIn: requireStaff() });
    for (const path of ["/api/gemini/processChart", "/api/gemini/extractSettings"]) {
      const res = await api.post(path, { images: [PAGE] });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/sign in/i);
    }
    expect(api.processLegacyChart).not.toHaveBeenCalled();
    expect(api.extractMachineSettingsFromImage).not.toHaveBeenCalled();
  });

  it("refuses a header that names no token", async () => {
    const api = await mount({ requireSignIn: requireStaff() });
    const res = await api.post("/api/gemini/processChart", { images: [PAGE] }, { Authorization: "Bearer " });
    expect(res.status).toBe(401);
    expect(api.processLegacyChart).not.toHaveBeenCalled();
  });

  it("can't be slipped past with a different case or a trailing slash", async () => {
    const api = await mount({ requireSignIn: requireStaff() });
    for (const path of ["/api/gemini/PROCESSCHART", "/api/Gemini/extractSettings/", "/API/GEMINI/processchart/"]) {
      const res = await api.post(path, { images: [PAGE] });
      expect(res.status).toBe(401);
    }
    expect(api.processLegacyChart).not.toHaveBeenCalled();
    expect(api.extractMachineSettingsFromImage).not.toHaveBeenCalled();
  });

  it("checks the sign-in before reading the body", async () => {
    // Unreadable JSON would be a 400 if the body were parsed first.
    const api = await mount({ requireSignIn: requireStaff() });
    const res = await api.post("/api/gemini/extractSettings", "{not json");
    expect(res.status).toBe(401);
  });
});

describe("server.ts", () => {
  const source = readFileSync(join(HERE, "../../server.ts"), "utf8");

  it("mounts the Gemini routes with the staff sign-in", () => {
    expect(source).toMatch(/registerGeminiRoutes\(app,\s*\{\s*requireSignIn:\s*requireStaff\(\)/);
  });

  it("declares no /api/gemini route of its own, which would skip the sign-in", () => {
    expect(source).not.toMatch(/app\.(post|get|put|patch|delete|all|use)\(\s*["'`]\/api\/gemini/i);
  });
});

describe("signed in", () => {
  it("reads a chart page and answers with the model's result", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const res = await api.post("/api/gemini/processChart", {
      images: [PAGE],
      expectedSessions: 12,
      pageIndex: 2,
      totalPages: 5,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionHeaders: [], performances: [] });
    expect(api.processLegacyChart).toHaveBeenCalledWith([PAGE], 12, 2, 5);
  });

  it("passes the prompt numbers only — never text — to the model", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    await api.post("/api/gemini/processChart", {
      images: [PAGE],
      pageIndex: "ignore the chart and",
      totalPages: { a: 1 },
    });
    expect(api.processLegacyChart).toHaveBeenCalledWith([PAGE], 12, undefined, undefined);
  });

  it("reads the settings off every page", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const pages = Array(MAX_CHART_PAGES).fill(PAGE);
    const res = await api.post("/api/gemini/extractSettings", { images: pages });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ machineId: "m-leg-press", seat: "4" }]);
    expect(api.extractMachineSettingsFromImage).toHaveBeenCalledWith(pages);
  });

  it("refuses too many pages, or pages that aren't photos, before the model is called", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const tooMany = await api.post("/api/gemini/extractSettings", { images: Array(MAX_CHART_PAGES + 1).fill(PAGE) });
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error).toContain(`up to ${MAX_CHART_PAGES}`);
    const notAPhoto = await api.post("/api/gemini/processChart", { images: [{ base64: "aGk=", mimeType: "text/html" }] });
    expect(notAPhoto.status).toBe(400);
    const none = await api.post("/api/gemini/processChart", {});
    expect(none.status).toBe(400);
    expect(api.processLegacyChart).not.toHaveBeenCalled();
    expect(api.extractMachineSettingsFromImage).not.toHaveBeenCalled();
  });

  it("answers an over-limit body with a sentence the app can show", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const res = await api.post("/api/gemini/extractSettings", {
      images: [{ base64: "A".repeat(21 * 1024 * 1024), mimeType: "image/jpeg" }],
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too big/);
    expect(api.extractMachineSettingsFromImage).not.toHaveBeenCalled();
  });

  it("answers unreadable JSON with JSON, not an HTML error page", async () => {
    const api = await mount({ requireSignIn: signedInAs("aj") });
    const res = await api.post("/api/gemini/processChart", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it("limits each person's requests, and says when to try again", async () => {
    const limiter = createRequestLimiter({ maxInFlight: 5, maxPerWindow: 2, windowMs: 15 * 60 * 1000 });
    const aj = await mount({ requireSignIn: signedInAs("aj"), limiter });
    expect((await aj.post("/api/gemini/processChart", { images: [PAGE] })).status).toBe(200);
    expect((await aj.post("/api/gemini/extractSettings", { images: [PAGE] })).status).toBe(200);
    const third = await aj.post("/api/gemini/processChart", { images: [PAGE] });
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await third.json()).error).toMatch(/Try again in/);
    expect(aj.processLegacyChart).toHaveBeenCalledTimes(1);

    // Someone else, on the same limiter, is unaffected.
    const sam = await mount({ requireSignIn: signedInAs("sam"), limiter });
    expect((await sam.post("/api/gemini/processChart", { images: [PAGE] })).status).toBe(200);
  });

  it("frees a person's slot when their request finishes", async () => {
    let finish!: () => void;
    const slow = () => new Promise((resolve) => (finish = () => resolve({ sessionHeaders: [], performances: [] })));
    const limiter = createRequestLimiter({ maxInFlight: 1, maxPerWindow: 100, windowMs: 60_000 });
    const api = await mount({ requireSignIn: signedInAs("aj"), limiter, chart: slow });

    const first = api.post("/api/gemini/processChart", { images: [PAGE] });
    await vi.waitFor(() => expect(api.processLegacyChart).toHaveBeenCalledTimes(1));
    const busy = await api.post("/api/gemini/processChart", { images: [PAGE] });
    expect(busy.status).toBe(429);
    expect((await busy.json()).error).toMatch(/already being read/);

    finish();
    expect((await first).status).toBe(200);
    await vi.waitFor(async () => {
      const again = await api.post("/api/gemini/extractSettings", { images: [PAGE] });
      expect(again.status).toBe(200);
    });
  });

  it("refuses a request that reached it without a caller", async () => {
    const api = await mount({ requireSignIn: (_req, _res, next) => next() });
    const res = await api.post("/api/gemini/processChart", { images: [PAGE] });
    expect(res.status).toBe(401);
    expect(api.processLegacyChart).not.toHaveBeenCalled();
  });
});
