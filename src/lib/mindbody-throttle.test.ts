import { describe, it, expect } from "vitest";
import {
  isRetryable,
  retryAfterMs,
  backoffMs,
  newBucket,
  takeFromBucket,
  recordResult,
  breakerPausedMs,
  NEW_BREAKER,
  RETRY_CAP_MS,
  RETRY_BASE_MS,
  tokenKeepUntil,
  TOKEN_FALLBACK_MS,
  TOKEN_MAX_KEEP_MS,
  TOKEN_SAFETY_MS,
} from "./mindbody-throttle";

describe("isRetryable", () => {
  it("retries the ones that can change", () => {
    expect(isRetryable(429)).toBe(true); // the whole point
    expect(isRetryable(408)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(503)).toBe(true);
  });

  it("does not retry an answer that will be the same next time", () => {
    // Retrying these spends money and a trainer's patience for nothing.
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(403)).toBe(false);
    expect(isRetryable(404)).toBe(false);
    expect(isRetryable(200)).toBe(false);
  });
});

describe("retryAfterMs", () => {
  const now = Date.parse("2026-09-22T12:00:00Z");

  it("reads seconds", () => {
    expect(retryAfterMs("2", now)).toBe(2000);
    expect(retryAfterMs("0", now)).toBe(0);
  });

  it("reads an HTTP date", () => {
    expect(retryAfterMs("Tue, 22 Sep 2026 12:00:03 GMT", now)).toBe(3000);
  });

  it("never lets Mindbody hang a request a trainer is standing over", () => {
    expect(retryAfterMs("3600", now)).toBe(RETRY_CAP_MS);
    expect(retryAfterMs("Tue, 22 Sep 2026 13:00:00 GMT", now)).toBe(RETRY_CAP_MS);
  });

  it("is null when there is nothing usable, so the caller backs off itself", () => {
    expect(retryAfterMs(null, now)).toBeNull();
    expect(retryAfterMs("", now)).toBeNull();
    expect(retryAfterMs("soon please", now)).toBeNull();
  });

  it("treats a date already past as no wait, not a negative one", () => {
    expect(retryAfterMs("Tue, 22 Sep 2026 11:59:00 GMT", now)).toBe(0);
  });
});

describe("backoffMs", () => {
  it("doubles", () => {
    expect(backoffMs(1, 1)).toBe(RETRY_BASE_MS);
    expect(backoffMs(2, 1)).toBe(RETRY_BASE_MS * 2);
    expect(backoffMs(3, 1)).toBe(RETRY_BASE_MS * 4);
  });

  it("jitters down to half, never to zero", () => {
    // Sixteen calls fail together in the nightly job. Without this they would
    // all wait exactly the same time and retry together.
    expect(backoffMs(1, 0)).toBe(RETRY_BASE_MS / 2);
    expect(backoffMs(1, 0.5)).toBe(RETRY_BASE_MS * 0.75);
    expect(backoffMs(4, 0)).toBeGreaterThan(0);
  });

  it("is capped", () => {
    expect(backoffMs(20, 1)).toBe(RETRY_CAP_MS);
  });
});

describe("the token bucket", () => {
  const limits = { perSecond: 5, burst: 10 };

  it("lets a whole Master Sync through without waiting", () => {
    // Five calls for one client. A trainer pressing Sync must not queue.
    let s = newBucket(limits, 0);
    for (let i = 0; i < 5; i++) {
      const r = takeFromBucket(s, limits, 0);
      expect(r.waitMs).toBe(0);
      s = r.state;
    }
  });

  it("holds the line once the burst is spent", () => {
    let s = newBucket(limits, 0);
    for (let i = 0; i < 10; i++) s = takeFromBucket(s, limits, 0).state;
    const r = takeFromBucket(s, limits, 0);
    expect(r.waitMs).toBe(200); // one permit at 5/s
  });

  it("refills over time and never past the burst", () => {
    let s = newBucket(limits, 0);
    for (let i = 0; i < 10; i++) s = takeFromBucket(s, limits, 0).state;
    // A second later: five permits back.
    const after = takeFromBucket(s, limits, 1000);
    expect(after.waitMs).toBe(0);
    expect(after.state.tokens).toBeCloseTo(4, 5);
    // An hour later it is full, not overflowing.
    const idle = takeFromBucket(newBucket(limits, 0), limits, 3_600_000);
    expect(idle.state.tokens).toBeCloseTo(limits.burst - 1, 5);
  });

  it("paces the nightly job rather than blocking it", () => {
    // 600 calls at 5/s is about two minutes - fine for a job, and the point
    // is that it is paced at all rather than fired in one burst.
    let s = newBucket(limits, 0);
    let now = 0;
    let sent = 0;
    while (sent < 600 && now < 300_000) {
      const r = takeFromBucket(s, limits, now);
      s = r.state;
      if (r.waitMs === 0) sent++;
      else now += r.waitMs;
    }
    expect(sent).toBe(600);
    expect(now).toBeGreaterThan(100_000);
    expect(now).toBeLessThan(130_000);
  });
});

describe("the circuit breaker", () => {
  const limits = { fails: 5, cooldownMs: 60_000 };

  it("stays shut while calls are working", () => {
    let s = NEW_BREAKER;
    for (let i = 0; i < 50; i++) s = recordResult(s, true, limits, 0);
    expect(breakerPausedMs(s, 0)).toBe(0);
  });

  it("opens after a run of failures", () => {
    let s = NEW_BREAKER;
    for (let i = 0; i < 4; i++) s = recordResult(s, false, limits, 0);
    expect(breakerPausedMs(s, 0)).toBe(0); // four is not a run
    s = recordResult(s, false, limits, 0);
    expect(breakerPausedMs(s, 0)).toBe(60_000);
  });

  it("counts a RUN, not a total - one success clears it", () => {
    // A studio with the odd flaky call must never accumulate its way to quiet.
    let s = NEW_BREAKER;
    for (let i = 0; i < 4; i++) s = recordResult(s, false, limits, 0);
    s = recordResult(s, true, limits, 0);
    for (let i = 0; i < 4; i++) s = recordResult(s, false, limits, 0);
    expect(breakerPausedMs(s, 0)).toBe(0);
  });

  it("lets one call through after the cooldown, and re-opens if it fails", () => {
    let s = NEW_BREAKER;
    for (let i = 0; i < 5; i++) s = recordResult(s, false, limits, 0);
    expect(breakerPausedMs(s, 59_999)).toBe(1);
    expect(breakerPausedMs(s, 60_000)).toBe(0); // the probe goes

    // It fails. The count was reset when it opened, so it takes another run -
    // which is the deliberate trade: a probe failing does not slam it shut,
    // but a site that is still broken goes quiet again quickly.
    for (let i = 0; i < 5; i++) s = recordResult(s, false, limits, 60_000);
    expect(breakerPausedMs(s, 60_000)).toBe(60_000);
  });

  it("re-opens from a clean slate when the probe succeeds", () => {
    let s = NEW_BREAKER;
    for (let i = 0; i < 5; i++) s = recordResult(s, false, limits, 0);
    s = recordResult(s, true, limits, 60_000);
    expect(breakerPausedMs(s, 60_000)).toBe(0);
    expect(s.fails).toBe(0);
  });
});

describe("tokenKeepUntil (the cost plan, A4)", () => {
  const NOW = Date.UTC(2026, 8, 26, 14, 0, 0);
  const HOUR = 60 * 60_000;

  it("keeps a token until a little before the time Mindbody gave", () => {
    const expires = new Date(NOW + 6 * HOUR).toISOString();
    expect(tokenKeepUntil(expires, NOW)).toBe(NOW + 6 * HOUR - TOKEN_SAFETY_MS);
  });

  it("never keeps one longer than a day, whatever Mindbody says", () => {
    const expires = new Date(NOW + 7 * 24 * HOUR).toISOString();
    expect(tokenKeepUntil(expires, NOW)).toBe(NOW + TOKEN_MAX_KEEP_MS);
  });

  it("falls back to 55 minutes when there is no Expires it can read", () => {
    expect(tokenKeepUntil(undefined, NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
    expect(tokenKeepUntil("", NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
    expect(tokenKeepUntil("not a date", NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
    expect(tokenKeepUntil({}, NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
  });

  it("falls back when the Expires is already past, or inside the safety margin", () => {
    // A zone-less time read the wrong way round can land in the past.
    expect(tokenKeepUntil(new Date(NOW - HOUR).toISOString(), NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
    expect(tokenKeepUntil(new Date(NOW + 60_000).toISOString(), NOW)).toBe(NOW + TOKEN_FALLBACK_MS);
  });

  it("reads an epoch number too", () => {
    expect(tokenKeepUntil(NOW + 2 * HOUR, NOW)).toBe(NOW + 2 * HOUR - TOKEN_SAFETY_MS);
  });
});
