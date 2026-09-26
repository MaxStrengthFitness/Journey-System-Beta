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
  DEEP_PULL_HOURS,
  deepPullBlock,
  isFirstDeepOfWeek,
  studioWeekKey,
  wantsDeepPull,
  withinPullHours,
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

/* ------------------------------------------------------------------ *
 * The lean pull (Sep 25 2026)
 * ------------------------------------------------------------------ */

const NY = "America/New_York";
const LA = "America/Los_Angeles";
/** An instant at a wall-clock time in New York in September (UTC-4). */
const nyAt = (h: number, m = 0, day = 25) => Date.UTC(2026, 8, day, h + 4, m, 0);

describe("deepPullBlock", () => {
  it("puts the whole studio day in one block (the cost plan: the month once each morning)", () => {
    expect(deepPullBlock(nyAt(0, 0), NY)).toBe("2026-09-25#0");
    expect(deepPullBlock(nyAt(5, 30), NY)).toBe("2026-09-25#0");
    expect(deepPullBlock(nyAt(10, 0), NY)).toBe("2026-09-25#0");
    expect(deepPullBlock(nyAt(18, 0), NY)).toBe("2026-09-25#0");
    expect(deepPullBlock(nyAt(23, 59), NY)).toBe("2026-09-25#0");
  });

  it("reads the day in the studio's own zone, not the device's", () => {
    // 1:30 am in New York is 10:30 pm the day before in Los Angeles.
    expect(deepPullBlock(nyAt(1, 30), NY)).toBe("2026-09-25#0");
    expect(deepPullBlock(nyAt(1, 30), LA)).toBe("2026-09-24#0");
  });

  it("has one block a day", () => {
    expect(DEEP_PULL_HOURS).toEqual([0]);
  });
});

describe("wantsDeepPull", () => {
  it("reaches the whole month when no month pull has ever succeeded", () => {
    expect(wantsDeepPull(null, nyAt(9), NY)).toBe(true);
  });

  it("reaches the whole month at the day's first pull", () => {
    // Last good month pull at 5:30 yesterday, first pull this morning.
    expect(wantsDeepPull(nyAt(5, 30, 24), nyAt(4, 30), NY)).toBe(true);
  });

  it("asks only for today and tomorrow for the rest of the day once the morning's month pull stands", () => {
    expect(wantsDeepPull(nyAt(4, 30), nyAt(9, 45), NY)).toBe(false);
    expect(wantsDeepPull(nyAt(4, 30), nyAt(10, 20), NY)).toBe(false);
    expect(wantsDeepPull(nyAt(4, 30), nyAt(18, 5), NY)).toBe(false);
  });

  it("is not fooled by a near pull that finished just past midnight (review finding)", () => {
    // The last GOOD month pull was yesterday morning; a lease stamped at
    // 00:00:04 by a late near pull does not count, so the first pull of the
    // morning still reaches the month.
    expect(wantsDeepPull(nyAt(4, 30, 24), nyAt(4, 30), NY)).toBe(true);
  });

  it("tries the month again when the morning's never finished (review finding)", () => {
    // A month pull claimed at 4:30 whose tab was closed stamped nothing, so
    // the last good one is still yesterday's and the 5:00 pull tries again.
    expect(wantsDeepPull(nyAt(4, 30, 24), nyAt(5, 0), NY)).toBe(true);
  });

  it("gives one whole-month pull in an open day of thirty-minute pulls", () => {
    let lastDeep: number | null = nyAt(4, 30, 24);
    let deep = 0;
    for (let t = nyAt(4, 30); t <= nyAt(21, 0); t += 31 * MIN) {
      if (wantsDeepPull(lastDeep, t, NY)) {
        deep++;
        lastDeep = t;
      }
    }
    expect(deep).toBe(1);
  });
});

describe("studioWeekKey", () => {
  it("names the Monday that starts the week", () => {
    expect(studioWeekKey("2026-09-21")).toBe("2026-09-21"); // a Monday
    expect(studioWeekKey("2026-09-26")).toBe("2026-09-21"); // Saturday
    expect(studioWeekKey("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(studioWeekKey("2026-09-28")).toBe("2026-09-28"); // the next Monday
    expect(studioWeekKey("2027-01-01")).toBe("2026-12-28"); // across a year
  });

  it("is null for anything that is not a studio day", () => {
    expect(studioWeekKey(null)).toBeNull();
    expect(studioWeekKey("Sep 26")).toBeNull();
  });
});

describe("isFirstDeepOfWeek (the cost plan, A5)", () => {
  it("is the first month pull when the last one was last week or never", () => {
    expect(isFirstDeepOfWeek(null, nyAt(5, 30), NY)).toBe(true);
    // Last good month pull Saturday Sep 19; this is Friday Sep 25.
    expect(isFirstDeepOfWeek(nyAt(5, 30, 19), nyAt(5, 30), NY)).toBe(true);
  });

  it("is not when a month pull already succeeded this week", () => {
    // Monday Sep 21, then Friday Sep 25.
    expect(isFirstDeepOfWeek(nyAt(5, 30, 21), nyAt(5, 30), NY)).toBe(false);
    expect(isFirstDeepOfWeek(nyAt(5, 30, 24), nyAt(5, 30), NY)).toBe(false);
  });

  it("reads the week in the studio's zone", () => {
    // 1 am Monday Sep 28 in New York is still Sunday Sep 27 in Los Angeles.
    const lastDeepLA = Date.UTC(2026, 8, 25, 12, 0); // Friday, 5 am in Los Angeles
    expect(isFirstDeepOfWeek(lastDeepLA, nyAt(1, 0, 28), LA)).toBe(false);
    expect(isFirstDeepOfWeek(lastDeepLA, nyAt(1, 0, 28), NY)).toBe(true);
  });
});

describe("withinPullHours", () => {
  it("uses 5:30 am to 8 pm, with an hour either side, when no hours are set", () => {
    expect(withinPullHours(nyAt(4, 29), NY)).toBe(false);
    expect(withinPullHours(nyAt(4, 30), NY)).toBe(true);
    expect(withinPullHours(nyAt(21, 0), NY)).toBe(true);
    expect(withinPullHours(nyAt(21, 1), NY)).toBe(false);
  });

  it("follows the hours a leader set", () => {
    const hours = { open: "07:00", close: "19:00" };
    expect(withinPullHours(nyAt(5, 59), NY, hours)).toBe(false);
    expect(withinPullHours(nyAt(6, 0), NY, hours)).toBe(true);
    expect(withinPullHours(nyAt(20, 0), NY, hours)).toBe(true);
    expect(withinPullHours(nyAt(20, 1), NY, hours)).toBe(false);
  });

  it("reads the clock in the studio's zone", () => {
    // 11 pm in New York is 8 pm in Los Angeles: a western studio is still open.
    expect(withinPullHours(nyAt(23, 0), NY)).toBe(false);
    expect(withinPullHours(nyAt(23, 0), LA)).toBe(true);
  });
});

describe("decideSync — pull hours", () => {
  it("does not pull after hours", () => {
    expect(decideSync(ctx({ withinPullHours: false }))).toEqual({
      run: false,
      reason: "after-hours",
      retryInMs: null,
    });
  });

  it("pulls as before when the caller does not know the studio's hours", () => {
    expect(decideSync(ctx()).run).toBe(true);
    expect(decideSync(ctx({ withinPullHours: true })).run).toBe(true);
  });

  it("still reports a hidden tab before the hours", () => {
    expect(decideSync(ctx({ visible: false, withinPullHours: false })).reason).toBe("hidden");
  });
});
