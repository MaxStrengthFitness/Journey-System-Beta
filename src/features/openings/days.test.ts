import { describe, expect, it } from "vitest";
import type { CoverageRecord } from "./coverage";
import { DAY_OPEN_SHARE, countDays, median, openAgainst } from "./days";

const record = (days: string[]): CoverageRecord => {
  const byMonth = new Map<string, Set<string>>();
  for (const d of days) {
    const m = d.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    byMonth.get(m)!.add(d);
  }
  return byMonth;
};

/** The eight Thursdays Oct 8 - Nov 26 2026. */
const THURSDAYS = ["2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29", "2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"];

describe("the numbers", () => {
  it("a day counts from a quarter of its weekday's usual", () => {
    expect(DAY_OPEN_SHARE).toBe(0.25);
    expect(openAgainst(9, 38)).toBe(false);
    expect(openAgainst(10, 38)).toBe(true);
    expect(openAgainst(0, null)).toBe(true);
    expect(openAgainst(0, 0)).toBe(true);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("countDays", () => {
  it("a day Journey didn't read in full doesn't count, however many bookings it holds", () => {
    const days = countDays([{ day: "2026-10-05", booked: 40 }], record([]));
    expect(days[0]).toMatchObject({ verdict: "unread", weekday: 1 });
  });

  it("a record that couldn't be read is can't tell, so the day doesn't count", () => {
    const failed: CoverageRecord = new Map([["2026-10", null]]);
    expect(countDays([{ day: "2026-10-05", booked: 40 }], failed)[0].verdict).toBe("unread");
  });

  it("a partly read week the old volume test would have passed: only the days read in full count", () => {
    // Mon and Tue pulled whole; Wed to Sat hold a handful each, from the webhook alone.
    const week = [
      { day: "2026-10-05", booked: 38 },
      { day: "2026-10-06", booked: 36 },
      { day: "2026-10-07", booked: 4 },
      { day: "2026-10-08", booked: 3 },
      { day: "2026-10-09", booked: 5 },
      { day: "2026-10-10", booked: 2 },
    ];
    const out = countDays(week, record(["2026-10-05", "2026-10-06"]));
    expect(out.map((d) => d.verdict)).toEqual(["counted", "counted", "unread", "unread", "unread", "unread"]);
    // Against its own weekday alone, each of those days is its own median: a volume test passes them all.
    expect(countDays(week, record(week.map((d) => d.day))).every((d) => d.verdict === "counted")).toBe(true);
  });

  it("the closure test: a holiday Thursday is closed, or nearly", () => {
    const days = THURSDAYS.map((day) => ({ day, booked: day === "2026-11-26" ? 2 : 38 }));
    const out = countDays(days, record(THURSDAYS));
    expect(out.find((d) => d.day === "2026-11-26")).toMatchObject({ verdict: "closed", booked: 2, usual: 38 });
    expect(out.filter((d) => d.verdict === "counted")).toHaveLength(7);
  });

  it("the usual is the median of the days read in full, so an unread quiet day doesn't drag it down", () => {
    const days = THURSDAYS.map((day, i) => ({ day, booked: i < 4 ? 2 : 38 }));
    const out = countDays(days, record(THURSDAYS.slice(4)));
    expect(out.slice(0, 4).every((d) => d.verdict === "unread")).toBe(true);
    expect(out[4]).toMatchObject({ verdict: "counted", usual: 38 });
  });

  it("Demo Mode: every day was written by the seeder, so every open day counts", () => {
    const out = countDays([{ day: "2026-10-05", booked: 3 }, { day: "2026-10-12", booked: 2 }], record([]), { everyDayRead: true });
    expect(out.map((d) => d.verdict)).toEqual(["counted", "counted"]);
  });

  it("a weekday with nothing usually booked is open with nothing", () => {
    const out = countDays([{ day: "2026-10-10", booked: 0 }, { day: "2026-10-17", booked: 0 }], record(["2026-10-10", "2026-10-17"]));
    expect(out.map((d) => d.verdict)).toEqual(["counted", "counted"]);
  });
});
