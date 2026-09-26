import { describe, it, expect } from "vitest";
import type { Trainer } from "../../types";
import { deriveTrainerStats, relativeDay } from "./stats";

const NOW = Date.UTC(2026, 8, 6, 12);
const stamp = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });

const withRollups = (rollups: Record<string, unknown> | undefined): Trainer =>
  ({ id: "t1", fullName: "T", initials: "T", role: "LifeTransformer", rollups }) as unknown as Trainer;

describe("deriveTrainerStats", () => {
  it("withholds the lifetime figure until the backfill has run", () => {
    // A counter that started at deploy time, labelled "Sessions Coached",
    // would be a wrong number presented confidently. Better to show nothing.
    const stats = deriveTrainerStats(withRollups({ sessionsCoached: 12, sessionsCoached30d: 12 }), NOW);
    expect(stats.backfilled).toBe(false);
    expect(stats.lifetime).toBeNull();
    expect(stats.last30).toBe(12);
  });

  it("reports the lifetime figure once rollupVersion is stamped", () => {
    const stats = deriveTrainerStats(
      withRollups({ rollupVersion: 1, sessionsCoached: 1284, sessionsCoached30d: 63 }),
      NOW,
    );
    expect(stats.backfilled).toBe(true);
    expect(stats.lifetime).toBe(1284);
  });

  it("reports zero, not null, for a backfilled trainer with no sessions", () => {
    // A new hire has genuinely coached zero. That is a fact, not missing data.
    expect(deriveTrainerStats(withRollups({ rollupVersion: 1 }), NOW).lifetime).toBe(0);
  });

  it("handles a trainer with no rollups at all", () => {
    const stats = deriveTrainerStats(withRollups(undefined), NOW);
    expect(stats).toMatchObject({
      lifetime: null,
      last30: null,
      clients90: null,
      backfilled: false,
      windowsStale: false,
    });
  });

  it("flags windows the nightly job has not refreshed in two days", () => {
    const fresh = deriveTrainerStats(
      withRollups({ sessionsCoached30d: 5, windowsUpdatedAt: stamp(NOW - 3600_000) }),
      NOW,
    );
    const stale = deriveTrainerStats(
      withRollups({ sessionsCoached30d: 5, windowsUpdatedAt: stamp(NOW - 3 * 86_400_000) }),
      NOW,
    );
    expect(fresh.windowsStale).toBe(false);
    expect(stale.windowsStale).toBe(true);
  });

  it("does not call windows stale before the job has ever run", () => {
    // Two warnings about the same missing setup is one warning too many.
    const stats = deriveTrainerStats(withRollups({ windowsUpdatedAt: stamp(NOW - 9e9) }), NOW);
    expect(stats.windowsStale).toBe(false);
  });

  it("ignores non-numeric junk in the counters", () => {
    const stats = deriveTrainerStats(
      withRollups({ rollupVersion: 1, sessionsCoached: "many", sessionsCoached30d: NaN }),
      NOW,
    );
    expect(stats.lifetime).toBe(0);
    expect(stats.last30).toBeNull();
  });
});

describe("relativeDay", () => {
  it("reads the way a person would say it", () => {
    expect(relativeDay(new Date(NOW), NOW)).toBe("today");
    expect(relativeDay(new Date(NOW - 86_400_000), NOW)).toBe("yesterday");
    expect(relativeDay(new Date(NOW - 5 * 86_400_000), NOW)).toBe("5 days ago");
    expect(relativeDay(new Date(NOW - 21 * 86_400_000), NOW)).toBe("3 weeks ago");
    expect(relativeDay(new Date(NOW - 200 * 86_400_000), NOW)).toBe("7 months ago");
    expect(relativeDay(null, NOW)).toBeNull();
  });
});

describe("deriveTrainerStats reads the counters document first (the cost plan, D3c)", () => {
  it("prefers the counters document, and falls back to the old map on the trainer", () => {
    const trainer = { id: "t1", rollups: { sessionsCoached: 412, rollupVersion: 1, sessionsCoached30d: 30 } } as never;
    const fresh = deriveTrainerStats(trainer, Date.UTC(2026, 8, 26), {
      sessionsCoached: 413,
      rollupVersion: 1,
      sessionsCoached30d: 31,
    } as never);
    expect(fresh.lifetime).toBe(413);
    expect(fresh.last30).toBe(31);
    const old = deriveTrainerStats(trainer, Date.UTC(2026, 8, 26), null);
    expect(old.lifetime).toBe(412);
  });
});
