// @vitest-environment jsdom
/**
 * The boot timing (the speed round, Oct 5 2026, R30): marks once each, one
 * small report on a cold open only, never offline, never twice, under 2 KB,
 * and nothing about the person in it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: Record<string, unknown>[] = [];
vi.mock("../../lib/client-error-report", () => ({
  sendClientReport: (p: Record<string, unknown>) => sent.push(p),
}));

import {
  BOOT_SEEN_KEY,
  MAX_REPORT_BYTES,
  REPORT_AFTER_MS,
  bootReport,
  markBoot,
  resetBootTimingForTests,
  shouldReport,
  startBootTiming,
} from "./boot-timing";

beforeEach(() => {
  sent.length = 0;
  sessionStorage.clear();
  resetBootTimingForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the report", () => {
  it("is small, rounded, and says cold or warm, tab or Home Screen", () => {
    const r = bootReport({ cold: true, standalone: true, marks: { "auth-ready": 812.4, "hub-data": 2011.6 }, userAgent: "Mozilla/5.0 (iPad)", build: "b1" });
    expect(r).toMatchObject({ type: "boot", kind: "boot", cold: true, standalone: true, marks: { "auth-ready": 812, "hub-data": 2012 } });
    expect(r.message).toBe("boot cold home-screen");
    expect(JSON.stringify(r).length).toBeLessThan(MAX_REPORT_BYTES);
  });

  it("stays under 2 KB however long the user agent", () => {
    const r = bootReport({ cold: true, standalone: false, marks: {}, userAgent: "x".repeat(10_000), build: "b" });
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_REPORT_BYTES);
  });

  it("goes only on a cold open, once, and online", () => {
    expect(shouldReport({ cold: true, sent: false, online: true })).toBe(true);
    expect(shouldReport({ cold: false, sent: false, online: true })).toBe(false);
    expect(shouldReport({ cold: true, sent: true, online: true })).toBe(false);
    expect(shouldReport({ cold: true, sent: false, online: false })).toBe(false);
  });
});

describe("a page load", () => {
  it("cold: sends one report when the Hub's data lands, with the marks", () => {
    const mark = vi.spyOn(performance, "mark");
    startBootTiming();
    expect(sessionStorage.getItem(BOOT_SEEN_KEY)).toBe("1");
    markBoot("auth-ready");
    markBoot("auth-ready");
    markBoot("trainer-ready");
    expect(sent).toHaveLength(0);
    markBoot("hub-data");
    markBoot("hub-data");
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].marks as object).sort()).toEqual(["auth-ready", "hub-data", "trainer-ready"]);
    expect(mark).toHaveBeenCalledWith("journey:auth-ready");
    expect(mark.mock.calls.filter((c) => c[0] === "journey:auth-ready")).toHaveLength(1);
    // Nothing about the person.
    expect(Object.keys(sent[0]).sort()).toEqual(["build", "cold", "kind", "marks", "message", "standalone", "type", "userAgent"]);
  });

  it("warm (the tab opened Journey before): no report", () => {
    sessionStorage.setItem(BOOT_SEEN_KEY, "1");
    startBootTiming();
    markBoot("hub-data");
    expect(sent).toHaveLength(0);
  });

  it("offline: no report", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    startBootTiming();
    markBoot("hub-data");
    expect(sent).toHaveLength(0);
  });

  it("no Hub (a sign-in screen left open): reports what it has after a minute", () => {
    vi.useFakeTimers();
    startBootTiming();
    markBoot("auth-ready");
    vi.advanceTimersByTime(REPORT_AFTER_MS);
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].marks as object)).toEqual(["auth-ready"]);
    markBoot("hub-data");
    expect(sent).toHaveLength(1);
  });
});
