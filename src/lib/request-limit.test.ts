import { describe, expect, it } from "vitest";
import { createRequestLimiter } from "./request-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const MINUTE = 60 * 1000;

describe("createRequestLimiter — in flight", () => {
  it("refuses a request beyond the in-flight limit until one finishes", () => {
    const limiter = createRequestLimiter({ maxInFlight: 2, maxPerWindow: 100, windowMs: MINUTE });
    const a = limiter.acquire("aj");
    const b = limiter.acquire("aj");
    expect(a.ok && b.ok).toBe(true);

    const c = limiter.acquire("aj");
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/already being read/);
    expect(c.retryAfterSeconds).toBeGreaterThan(0);

    a.release();
    expect(limiter.acquire("aj").ok).toBe(true);
  });

  it("counts a release once, however many times it is called", () => {
    const limiter = createRequestLimiter({ maxInFlight: 1, maxPerWindow: 100, windowMs: MINUTE });
    const a = limiter.acquire("aj");
    a.release();
    a.release();
    const b = limiter.acquire("aj");
    expect(b.ok).toBe(true);
    // A second release of `a` must not free `b`'s slot.
    a.release();
    expect(limiter.acquire("aj").ok).toBe(false);
  });

  it("releasing a refusal does nothing", () => {
    const limiter = createRequestLimiter({ maxInFlight: 1, maxPerWindow: 100, windowMs: MINUTE });
    limiter.acquire("aj");
    const refused = limiter.acquire("aj");
    refused.release();
    expect(limiter.acquire("aj").ok).toBe(false);
  });

  it("keeps each person's limit to themselves", () => {
    const limiter = createRequestLimiter({ maxInFlight: 1, maxPerWindow: 1, windowMs: MINUTE });
    expect(limiter.acquire("aj").ok).toBe(true);
    expect(limiter.acquire("aj").ok).toBe(false);
    expect(limiter.acquire("sam").ok).toBe(true);
  });
});

describe("createRequestLimiter — per window", () => {
  it("refuses once the window is full, and lets the next in as the oldest ages out", () => {
    const c = clock();
    const limiter = createRequestLimiter({ maxInFlight: 10, maxPerWindow: 3, windowMs: 15 * MINUTE }, c.now);

    for (let i = 0; i < 3; i++) {
      limiter.acquire("aj").release();
      c.advance(MINUTE);
    }
    const refused = limiter.acquire("aj");
    expect(refused.ok).toBe(false);
    // The first request was 3 minutes ago, so it ages out in 12.
    expect(refused.retryAfterSeconds).toBe(12 * 60);
    expect(refused.error).toMatch(/Try again in 12 minutes/);

    c.advance(12 * MINUTE);
    expect(limiter.acquire("aj").ok).toBe(true);
  });

  it("does not count a refused request against the window", () => {
    const c = clock();
    const limiter = createRequestLimiter({ maxInFlight: 10, maxPerWindow: 2, windowMs: 10 * MINUTE }, c.now);
    limiter.acquire("aj").release();
    limiter.acquire("aj").release();
    for (let i = 0; i < 5; i++) expect(limiter.acquire("aj").ok).toBe(false);
    c.advance(10 * MINUTE + 1);
    expect(limiter.acquire("aj").ok).toBe(true);
    expect(limiter.acquire("aj").ok).toBe(true);
  });

  it("says one minute, not '1 minutes', and never less than a second", () => {
    const c = clock();
    const limiter = createRequestLimiter({ maxInFlight: 10, maxPerWindow: 1, windowMs: 30 * 1000 }, c.now);
    limiter.acquire("aj").release();
    const refused = limiter.acquire("aj");
    expect(refused.error).toMatch(/Try again in 1 minute\./);
    expect(refused.retryAfterSeconds).toBe(30);
  });
});
