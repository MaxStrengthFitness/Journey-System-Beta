import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERVAL_MINUTES,
  MAX_BACKOFF_MS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  claimIsStillDue,
  decideSync,
  intervalWithBackoff,
  nextDueAt,
  normaliseInterval,
  type SyncContext,
} from "./syncPolicy";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);
const MIN = 60_000;

const ctx = (over: Partial<SyncContext> = {}): SyncContext => ({
  now: NOW,
  enabled: true,
  intervalMinutes: 15,
  lastSyncAt: NOW - 20 * MIN,
  failures: 0,
  inFlight: false,
  visible: true,
  online: true,
  configured: true,
  ...over,
});

describe("normaliseInterval", () => {
  it("defaults when the studio has never set one", () => {
    expect(normaliseInterval(undefined)).toBe(DEFAULT_INTERVAL_MINUTES);
    expect(normaliseInterval(null)).toBe(DEFAULT_INTERVAL_MINUTES);
  });

  it("clamps a value that would be a self-inflicted denial of service", () => {
    expect(normaliseInterval(1)).toBe(MIN_INTERVAL_MINUTES);
    expect(normaliseInterval(0)).toBe(MIN_INTERVAL_MINUTES);
    expect(normaliseInterval(-30)).toBe(MIN_INTERVAL_MINUTES);
  });

  it("clamps a value that would not be a sync", () => {
    expect(normaliseInterval(60 * 24)).toBe(MAX_INTERVAL_MINUTES);
  });

  it("survives nonsense", () => {
    expect(normaliseInterval(NaN)).toBe(DEFAULT_INTERVAL_MINUTES);
    expect(normaliseInterval(Infinity)).toBe(DEFAULT_INTERVAL_MINUTES);
  });
});

describe("intervalWithBackoff", () => {
  it("is just the interval when nothing has failed", () => {
    expect(intervalWithBackoff(15, 0)).toBe(15 * MIN);
  });

  it("doubles per consecutive failure", () => {
    expect(intervalWithBackoff(15, 1)).toBe(30 * MIN);
    expect(intervalWithBackoff(15, 2)).toBe(60 * MIN);
    expect(intervalWithBackoff(15, 3)).toBe(120 * MIN);
  });

  it("stops at four hours rather than backing off forever", () => {
    // A studio with a wrong Site ID should go quiet and wait for a human,
    // not drift out to a retry next Tuesday.
    expect(intervalWithBackoff(15, 99)).toBe(MAX_BACKOFF_MS);
    expect(intervalWithBackoff(240, 99)).toBe(MAX_BACKOFF_MS);
  });
});

describe("decideSync", () => {
  it("runs when the interval has elapsed", () => {
    expect(decideSync(ctx())).toEqual({ run: true, reason: "due" });
  });

  it("runs immediately for a studio that has never synced", () => {
    expect(decideSync(ctx({ lastSyncAt: null }))).toEqual({
      run: true,
      reason: "never-synced",
    });
  });

  it("waits, and says how long, when the interval has not elapsed", () => {
    const v = decideSync(ctx({ lastSyncAt: NOW - 5 * MIN }));
    expect(v).toEqual({ run: false, reason: "not-due", retryInMs: 10 * MIN });
  });

  it("never syncs a hidden tab", () => {
    // An iPad left on the counter overnight would otherwise run 96 syncs
    // before anyone looked at the screen.
    expect(decideSync(ctx({ visible: false })).run).toBe(false);
    expect(decideSync(ctx({ visible: false }))).toMatchObject({
      reason: "hidden",
    });
  });

  it("reports hidden without a retry delay, so the caller wakes on visibility instead", () => {
    // A tab that comes back after four hours should sync at once rather than
    // wait out whatever the timer had left.
    const v = decideSync(ctx({ visible: false }));
    expect(v).toEqual({ run: false, reason: "hidden", retryInMs: null });
  });

  it("does not stack a second sync on top of a running one", () => {
    expect(decideSync(ctx({ inFlight: true }))).toMatchObject({
      reason: "in-flight",
    });
  });

  it("stays quiet when auto-sync is switched off", () => {
    expect(decideSync(ctx({ enabled: false }))).toEqual({
      run: false,
      reason: "disabled",
      retryInMs: null,
    });
  });

  it("stays quiet when the studio is not configured for it", () => {
    // Same guard the manual Refresh button applies: no Site ID, or a shared
    // site with no Location ID. Retrying cannot succeed, and the error only
    // teaches people to ignore errors.
    expect(decideSync(ctx({ configured: false }))).toEqual({
      run: false,
      reason: "not-configured",
      retryInMs: null,
    });
  });

  it("stays quiet offline", () => {
    expect(decideSync(ctx({ online: false }))).toMatchObject({
      reason: "offline",
    });
  });

  it("reports a permanent reason ahead of a temporary one", () => {
    // The caller stops polling on a null retryInMs, so "disabled" must win
    // over "not due" or a switched-off studio keeps waking up every minute.
    const v = decideSync(
      ctx({ enabled: false, lastSyncAt: NOW - 1 * MIN, visible: false }),
    );
    expect(v.reason).toBe("disabled");
  });

  it("holds off longer after failures", () => {
    // 20 minutes since the last attempt, two failures: the gap is now 60.
    expect(decideSync(ctx({ failures: 2 }))).toMatchObject({
      run: false,
      reason: "not-due",
    });
    expect(decideSync(ctx({ failures: 2, now: NOW + 45 * MIN })).run).toBe(true);
  });
});

describe("nextDueAt", () => {
  it("is null for a studio that has never synced", () => {
    expect(nextDueAt(ctx({ lastSyncAt: null }))).toBeNull();
  });

  it("is the last sync plus the backed-off interval", () => {
    expect(nextDueAt(ctx({ lastSyncAt: NOW, failures: 1 }))).toBe(
      NOW + 30 * MIN,
    );
  });
});

describe("claimIsStillDue", () => {
  it("lets the first device through", () => {
    expect(claimIsStillDue(null, { now: NOW, intervalMinutes: 15, failures: 0 })).toBe(
      true,
    );
  });

  it("stops the second device when another just claimed", () => {
    // Six iPads on one floor read the same stale timestamp and all decide to
    // sync. The transaction re-reads, and only the winner proceeds — the
    // whole reason the lease lives on the studio document rather than in
    // each device's memory.
    expect(
      claimIsStillDue(NOW - 30_000, {
        now: NOW,
        intervalMinutes: 15,
        failures: 0,
      }),
    ).toBe(false);
  });

  it("lets a genuinely overdue claim through", () => {
    expect(
      claimIsStillDue(NOW - 20 * MIN, {
        now: NOW,
        intervalMinutes: 15,
        failures: 0,
      }),
    ).toBe(true);
  });

  it("respects backoff inside the transaction too", () => {
    expect(
      claimIsStillDue(NOW - 20 * MIN, {
        now: NOW,
        intervalMinutes: 15,
        failures: 2,
      }),
    ).toBe(false);
  });
});
