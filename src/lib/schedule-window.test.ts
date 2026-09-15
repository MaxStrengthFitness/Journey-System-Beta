import { beforeEach, describe, expect, it } from "vitest";
import { setActiveTimeZone, studioDateKey } from "./studio-time";
import {
  SCHEDULE_STALE_MS,
  WEEK_AHEAD_DAYS,
  dayKeysBetween,
  freshnessLabel,
  liveWindow,
  mergeSchedules,
  msUntilNextStudioDay,
  rangeToFetch,
} from "./schedule-window";
import type { ScheduleEntry } from "../types";

const ET = "America/New_York";

beforeEach(() => {
  setActiveTimeZone(ET);
});

/**
 * Instants are built as full date-times WITH a zone so the tests mean the same
 * thing in CI (UTC) and on a studio PC (Eastern). Never `new Date("yyyy-mm-dd")`.
 */
const at = (iso: string) => new Date(iso);

function entry(
  id: string,
  start: Date | string | { toDate: () => Date },
  status: ScheduleEntry["status"] = "Scheduled",
): ScheduleEntry {
  return {
    id,
    clientName: `Client ${id}`,
    trainerName: "T",
    studioId: "westlake",
    startTime: start,
    endTime: null,
    status,
    serviceName: "Session",
    source: "MindBody",
    createdAt: null,
  };
}

describe("mergeSchedules", () => {
  it("dedupes by id with the live copy winning", () => {
    const fetched = entry("a", at("2026-09-15T14:00:00Z"));
    fetched.clientName = "Stale name";
    const live = entry("a", at("2026-09-15T14:00:00Z"));
    live.clientName = "Fresh name";
    const out = mergeSchedules([live], [fetched]);
    expect(out).toHaveLength(1);
    expect(out[0].clientName).toBe("Fresh name");
  });

  it("drops cancelled bookings from either source", () => {
    const out = mergeSchedules(
      [entry("a", at("2026-09-15T14:00:00Z"), "Cancelled")],
      [entry("b", at("2026-09-15T15:00:00Z"), "Cancelled"), entry("c", at("2026-09-15T16:00:00Z"))],
    );
    expect(out.map((s) => s.id)).toEqual(["c"]);
  });

  it("sorts by start time whether it is a Timestamp, a Date or an ISO string", () => {
    const ts = { toDate: () => at("2026-09-15T13:00:00Z") };
    const out = mergeSchedules(
      [entry("date", at("2026-09-15T15:00:00Z"))],
      [entry("iso", "2026-09-15T14:00:00Z"), entry("ts", ts)],
    );
    expect(out.map((s) => s.id)).toEqual(["ts", "iso", "date"]);
  });

  it("keeps a booking with no readable start rather than losing it", () => {
    const out = mergeSchedules([entry("bad", "not a date")], [entry("ok", at("2026-09-15T14:00:00Z"))]);
    expect(out.map((s) => s.id)).toEqual(["ok", "bad"]);
  });
});

describe("dayKeysBetween", () => {
  it("lists every studio day inclusive of both ends", () => {
    // 11 PM Eastern on Sep 14 through 1 AM Eastern on Sep 17.
    const keys = dayKeysBetween(at("2026-09-15T03:00:00Z"), at("2026-09-17T05:00:00Z"));
    expect(keys).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
  });

  it("returns one key when from and to are on the same day", () => {
    expect(dayKeysBetween(at("2026-09-15T12:00:00Z"), at("2026-09-15T22:00:00Z"))).toEqual(["2026-09-15"]);
  });

  it("returns nothing for a backwards range", () => {
    expect(dayKeysBetween(at("2026-09-17T12:00:00Z"), at("2026-09-15T12:00:00Z"))).toEqual([]);
  });

  it("does not skip or repeat a day across the DST change", () => {
    // Clocks fall back on Nov 1 2026 in Eastern.
    const keys = dayKeysBetween(at("2026-10-31T12:00:00Z"), at("2026-11-02T12:00:00Z"));
    expect(keys).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("rangeToFetch", () => {
  const now = at("2026-09-15T16:00:00Z").getTime(); // noon Eastern
  const from = at("2026-09-15T16:00:00Z");
  const to = at("2026-09-17T16:00:00Z");

  it("returns null when every day is covered and fresh", () => {
    const coverage = new Map([
      ["2026-09-15", now - 1000],
      ["2026-09-16", now - 1000],
      ["2026-09-17", now - 1000],
    ]);
    expect(rangeToFetch(coverage, from, to, now, SCHEDULE_STALE_MS)).toBeNull();
  });

  it("returns the whole range when a day in the middle is missing", () => {
    const coverage = new Map([
      ["2026-09-15", now - 1000],
      ["2026-09-17", now - 1000],
    ]);
    const r = rangeToFetch(coverage, from, to, now, SCHEDULE_STALE_MS);
    expect(r).not.toBeNull();
    expect(studioDateKey(r!.from)).toBe("2026-09-16");
    expect(studioDateKey(r!.to)).toBe("2026-09-16");
    // Bounds are whole studio days: 00:00:00.000 and 23:59:59.999 Eastern.
    expect(r!.from.toISOString()).toBe("2026-09-16T04:00:00.000Z");
    expect(r!.to.toISOString()).toBe("2026-09-17T03:59:59.999Z");
  });

  it("trims fresh days off the edges: the live days at the front of a week request are not re-read", () => {
    const coverage = new Map([
      ["2026-09-15", now - 1000],
      ["2026-09-16", now - 1000],
    ]);
    const r = rangeToFetch(coverage, from, to, now, SCHEDULE_STALE_MS);
    expect(studioDateKey(r!.from)).toBe("2026-09-17");
    expect(studioDateKey(r!.to)).toBe("2026-09-17");
    expect(r!.from.toISOString()).toBe("2026-09-17T04:00:00.000Z");
    expect(r!.to.toISOString()).toBe("2026-09-18T03:59:59.999Z");
  });

  it("keeps a stale day in the middle inside one read", () => {
    const coverage = new Map([
      ["2026-09-15", now - SCHEDULE_STALE_MS - 1],
      ["2026-09-16", now - 1000],
      ["2026-09-17", now - SCHEDULE_STALE_MS - 1],
    ]);
    const r = rangeToFetch(coverage, from, to, now, SCHEDULE_STALE_MS);
    expect(studioDateKey(r!.from)).toBe("2026-09-15");
    expect(studioDateKey(r!.to)).toBe("2026-09-17");
  });

  it("returns the whole range when one day is stale", () => {
    const coverage = new Map([
      ["2026-09-15", now - 1000],
      ["2026-09-16", now - SCHEDULE_STALE_MS - 1],
      ["2026-09-17", now - 1000],
    ]);
    expect(rangeToFetch(coverage, from, to, now, SCHEDULE_STALE_MS)).not.toBeNull();
  });

  it("treats a day fetched exactly at the stale boundary as still fresh", () => {
    const coverage = new Map([["2026-09-15", now - SCHEDULE_STALE_MS]]);
    expect(rangeToFetch(coverage, from, from, now, SCHEDULE_STALE_MS)).toBeNull();
  });

  it("returns null for a backwards range, which has no days to fetch", () => {
    expect(rangeToFetch(new Map(), to, from, now, SCHEDULE_STALE_MS)).toBeNull();
  });
});

describe("liveWindow", () => {
  it("spans the start of yesterday to the end of tomorrow in studio time", () => {
    const w = liveWindow(at("2026-09-15T16:00:00Z"));
    expect(w.from.toISOString()).toBe("2026-09-14T04:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-09-17T03:59:59.999Z");
    expect(dayKeysBetween(w.from, w.to)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("anchors on the studio's day, not UTC's, late in the evening", () => {
    // 11 PM Eastern on Sep 15 is already Sep 16 in UTC.
    const w = liveWindow(at("2026-09-16T03:00:00Z"));
    expect(dayKeysBetween(w.from, w.to)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("is three days across the DST change", () => {
    const w = liveWindow(at("2026-11-01T12:00:00Z"));
    expect(dayKeysBetween(w.from, w.to)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("msUntilNextStudioDay", () => {
  it("counts to one second past the studio's midnight", () => {
    // 11 PM Eastern: one hour to the day's last millisecond, plus the one-second
    // margin — so it lands at 00:00:00.999 on the new day, never before it.
    const ms = msUntilNextStudioDay(at("2026-09-16T03:00:00Z"));
    expect(ms).toBe(60 * 60 * 1000 - 1 + 1000);
  });

  it("never returns less than a second", () => {
    expect(msUntilNextStudioDay(at("2026-09-16T03:59:59.999Z"))).toBeGreaterThanOrEqual(1000);
  });
});

describe("freshnessLabel", () => {
  const now = at("2026-09-15T16:00:00Z").getTime();

  it("says so when nothing has loaded", () => {
    expect(freshnessLabel(null, now)).toBe("Not loaded yet");
  });

  it("rounds down to minutes and hours", () => {
    expect(freshnessLabel(now, now)).toBe("Updated just now");
    expect(freshnessLabel(now - 59_000, now)).toBe("Updated just now");
    expect(freshnessLabel(now - 60_000, now)).toBe("Updated 1 min ago");
    expect(freshnessLabel(now - 3 * 60_000 - 20_000, now)).toBe("Updated 3 min ago");
    expect(freshnessLabel(now - 59 * 60_000, now)).toBe("Updated 59 min ago");
    expect(freshnessLabel(now - 60 * 60_000, now)).toBe("Updated 1 h ago");
    expect(freshnessLabel(now - 150 * 60_000, now)).toBe("Updated 2 h ago");
  });

  it("treats a clock that went backwards as just now", () => {
    expect(freshnessLabel(now + 5000, now)).toBe("Updated just now");
  });
});

describe("constants", () => {
  it("keeps the roster's week and a 15-minute freshness", () => {
    expect(WEEK_AHEAD_DAYS).toBe(8);
    expect(SCHEDULE_STALE_MS).toBe(15 * 60 * 1000);
  });
});
