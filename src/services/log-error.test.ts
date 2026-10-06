/**
 * POST /api/log-error (server/log-error.ts), mounted on a bare Express app and
 * called over HTTP. The speed round, Oct 5 2026: a limit per address before
 * the body is read, its own 16 KB body, trimmed fields, and the reporter's
 * contract unchanged.
 */

import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReportLimiter,
  isLogErrorPath,
  LOG_ERROR_LIMITS,
  registerLogErrorRoute,
  trimReport,
} from "../../server/log-error";

const HERE = dirname(fileURLToPath(import.meta.url));
const servers: { close: () => void }[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
});

async function mount(limits = LOG_ERROR_LIMITS) {
  const log = vi.fn();
  const app = express();
  registerLogErrorRoute(app, { limits, log, writeFile: false });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, from = "203.0.113.7") =>
    fetch(base + "/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": from },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { post, log };
}

describe("the route", () => {
  it("logs a report and answers { ok: true }, as the reporter expects", async () => {
    const api = await mount();
    const res = await api.post({ message: "boom", type: "window_error", stack: "at x" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(api.log).toHaveBeenCalledWith("CLIENT ERROR:", { message: "boom", type: "window_error", stack: "at x" });
  });

  it("lets a boot report through whole", async () => {
    const api = await mount();
    const boot = {
      kind: "boot",
      message: "cold boot",
      timings: { html: 120, eager: 840, auth: 310, firstData: 1290, chunks: ["index", "hub", "session"] },
      version: "2026-10-05T20:00:00Z",
    };
    expect(JSON.stringify(boot).length).toBeLessThan(2048);
    expect((await api.post(boot)).status).toBe(200);
    const logged = api.log.mock.calls.find((c) => c[0] === "CLIENT ERROR:")![1];
    expect(logged.kind).toBe("boot");
    expect(JSON.parse(logged.timings)).toEqual(boot.timings);
  });

  it("refuses a body over 16 KB in JSON, and still says one was refused", async () => {
    const api = await mount();
    const res = await api.post({ message: "x", stack: "y".repeat(20 * 1024) });
    expect(res.status).toBe(413);
    expect((await res.json()).ok).toBe(false);
    expect(api.log.mock.calls.some((c) => String(c[0]).includes("over 16 KB"))).toBe(true);
  });

  it("answers unreadable JSON with JSON", async () => {
    const api = await mount();
    const res = await api.post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("limits one address, leaves another alone, and says how many it dropped", async () => {
    let t = 0;
    const log = vi.fn();
    const app = express();
    registerLogErrorRoute(app, { limits: { perAddressPerMinute: 3, allPerMinute: 100, windowMs: 60_000 }, log, now: () => t, writeFile: false });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (from: string) =>
      fetch(base + "/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `${from}, 10.0.0.1` },
        body: JSON.stringify({ message: "storm" }),
      });

    for (let i = 0; i < 3; i++) expect((await post("198.51.100.1")).status).toBe(200);
    expect((await post("198.51.100.1")).status).toBe(429);
    expect((await post("198.51.100.2")).status).toBe(200);

    t = 61_000;
    expect((await post("198.51.100.1")).status).toBe(200);
    expect(log.mock.calls.some((c) => String(c[0]).includes("1 report(s) over the limit"))).toBe(true);
  });
});

describe("the limiter", () => {
  it("caps every address together too, since X-Forwarded-For can be written by anyone", () => {
    const limiter = createReportLimiter({ perAddressPerMinute: 10, allPerMinute: 4, windowMs: 60_000 }, () => 0);
    const results = ["a", "b", "c", "d", "e"].map((a) => limiter.take(a).ok);
    expect(results).toEqual([true, true, true, true, false]);
  });

  it("gives a studio of six iPads behind one address room for a boot report each and a storm", () => {
    expect(LOG_ERROR_LIMITS.perAddressPerMinute).toBeGreaterThanOrEqual(60);
    expect(LOG_ERROR_LIMITS.allPerMinute).toBeGreaterThan(LOG_ERROR_LIMITS.perAddressPerMinute);
  });
});

describe("trimReport", () => {
  it("cuts the stack, the message and anything else to size", () => {
    const out = trimReport({
      message: "m".repeat(5_000),
      stack: "s".repeat(10_000),
      componentStack: "c".repeat(3_000),
      type: "t".repeat(800),
      undefinedField: undefined,
      count: 3,
    });
    expect((out.message as string).startsWith("m".repeat(1_000) + "... [cut, 5000")).toBe(true);
    expect((out.stack as string).length).toBeLessThan(4_100);
    expect(out.componentStack).toBe("c".repeat(3_000));
    expect((out.type as string).length).toBeLessThan(600);
    expect("undefinedField" in out).toBe(false);
    expect(out.count).toBe(3);
  });

  it("keeps at most 24 fields and says how many it left out", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, i]));
    const out = trimReport(many);
    expect(Object.keys(out)).toHaveLength(25);
    expect(out.droppedFields).toBe(6);
  });

  it("reads a body that isn't an object", () => {
    expect(trimReport("plain")).toEqual({ body: "plain" });
    expect(trimReport([1, 2])).toEqual({ body: "[1,2]" });
  });
});

describe("server.ts", () => {
  const server = readFileSync(join(HERE, "../../server.ts"), "utf8");

  it("mounts the route through registerLogErrorRoute and skips it in the shared 1 MB parser", () => {
    expect(server).toMatch(/registerLogErrorRoute\(app\)/);
    expect(server).toMatch(/isGeminiPath\(req\.path\) \|\| isLogErrorPath\(req\.path\)/);
    expect(server).not.toMatch(/app\.post\("\/api\/log-error"/);
  });

  it("matches the path the way Express does", () => {
    for (const p of ["/api/log-error", "/API/Log-Error", "/api/log-error/"]) expect(isLogErrorPath(p), p).toBe(true);
    for (const p of ["/api/log-errors", "/api/log-error/x", "/api/gemini/processChart"]) expect(isLogErrorPath(p), p).toBe(false);
  });
});
