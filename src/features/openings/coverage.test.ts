import { describe, expect, it } from "vitest";
import {
  MAX_DAYS_A_MONTH,
  MAX_DAYS_A_WRITE,
  READ_AHEAD_DAYS,
  addDays,
  coverageWrites,
  daysReadInFull,
  isDayKey,
  isMonthId,
  monthOf,
  readWhole,
  recordedDays,
  wasReadInFull,
  type CoverageRecord,
} from "./coverage";

/**
 * The whole-read record's pure half (Sep 27 2026,
 * docs/rounds/2026-09-27-coverage-record.md). Every instant below is written
 * in UTC with its Eastern reading beside it, so the tests mean the same thing
 * on any machine; the suite still runs in Eastern time.
 */

const EASTERN = "America/New_York";
/** Sun Sep 27 2026, 9:00 AM Eastern (EDT, UTC-4). */
const SUN_9AM = new Date("2026-09-27T13:00:00Z");
/** A whole answer that held the studio's bookings (the sync swept on it). */
const whole = { windowComplete: true, studioAnswered: 12 };

describe("the numbers", () => {
  it("counts a read for a day from the day before it, and holds a month to 31 days", () => {
    expect(READ_AHEAD_DAYS).toBe(1);
    expect(MAX_DAYS_A_MONTH).toBe(31);
    expect(MAX_DAYS_A_WRITE).toBe(366);
  });
});

describe("a whole answer", () => {
  it("is one Mindbody answered for its whole window and Journey took in", () => {
    expect(readWhole(whole)).toBe(true);
    expect(readWhole({ windowComplete: true, studioAnswered: 12, sweepDeferred: 0 })).toBe(true);
    expect(
      readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 2, settledWithMonth: true, settleAnswered: 40 }),
    ).toBe(true);
  });

  it("is not an answer holding none of the studio's bookings: the sync swept nothing on it", () => {
    // mindbody-api-sync.ts returns before its sweep on an empty answer ("it
    // can be a glitch"), and a wrong Location ID answers empty on every pull.
    expect(readWhole({ windowComplete: true })).toBe(false);
    expect(readWhole({ windowComplete: true, studioAnswered: 0 })).toBe(false);
    expect(readWhole({ windowComplete: true, studioAnswered: 0, sweepDeferred: 0 })).toBe(false);
  });

  it("is an empty near answer that lost a booking once a month that held bookings settled it", () => {
    // The month's own sweep covered today and tomorrow and decided the loss.
    expect(
      readWhole({ windowComplete: true, studioAnswered: 0, sweepDeferred: 1, settledWithMonth: true, settleAnswered: 40 }),
    ).toBe(true);
  });

  it("is not a partial answer, a failed pull, or an older proxy's silence", () => {
    expect(readWhole({ windowComplete: false })).toBe(false);
    expect(readWhole({})).toBe(false);
    expect(readWhole(null)).toBe(false);
    expect(readWhole(undefined)).toBe(false);
  });

  it("is not a near pull that lost a booking until the wider pull that settles it was whole too", () => {
    // Journey still holds, on today or tomorrow, a booking Mindbody no longer has.
    expect(readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 1 })).toBe(false);
    expect(readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 1, settledWithMonth: false })).toBe(false);
    expect(
      readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 1, settledWithMonth: false, settleAnswered: 40 }),
    ).toBe(false);
  });

  it("is not a near pull whose settling month came back empty: that pull returned before its sweep too", () => {
    // Whole, so settledWithMonth is true, but the lost booking was neither
    // found nor cancelled.
    expect(
      readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 1, settledWithMonth: true, settleAnswered: 0 }),
    ).toBe(false);
    expect(readWhole({ windowComplete: true, studioAnswered: 5, sweepDeferred: 2, settledWithMonth: true })).toBe(false);
  });
});

describe("the days a whole read records", () => {
  it("records today and tomorrow from the thirty-minute pull (today and tomorrow)", () => {
    expect(daysReadInFull({ start: "2026-09-27", end: "2026-09-28" }, SUN_9AM, EASTERN)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("records today and tomorrow from the morning month pull and the header's week: never further ahead", () => {
    expect(daysReadInFull({ start: "2026-09-27", end: "2026-10-27" }, SUN_9AM, EASTERN)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(daysReadInFull({ start: "2026-09-27", end: "2026-10-05" }, SUN_9AM, EASTERN)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("records the past days a back-read asked for, up to tomorrow", () => {
    // Operations -> Mindbody, Pull from the Monday eight weeks ago to yesterday.
    const back = daysReadInFull({ start: "2026-08-03", end: "2026-09-26" }, SUN_9AM, EASTERN);
    expect(back).toHaveLength(55);
    expect(back[0]).toBe("2026-08-03");
    expect(back[54]).toBe("2026-09-26");
    // A back-read that runs on into the month ahead stops at tomorrow.
    const through = daysReadInFull({ start: "2026-09-21", end: "2026-10-21" }, SUN_9AM, EASTERN);
    expect(through).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]);
  });

  it("records nothing for a window wholly after tomorrow: a read two days early proves nothing", () => {
    expect(daysReadInFull({ start: "2026-09-29", end: "2026-10-27" }, SUN_9AM, EASTERN)).toEqual([]);
  });

  it("records nothing for something that isn't a window", () => {
    expect(daysReadInFull(null, SUN_9AM, EASTERN)).toEqual([]);
    expect(daysReadInFull({ start: "", end: "2026-09-28" }, SUN_9AM, EASTERN)).toEqual([]);
    expect(daysReadInFull({ start: "2026-09-28", end: "2026-09-27" }, SUN_9AM, EASTERN)).toEqual([]);
    expect(daysReadInFull({ start: "2026-02-30", end: "2026-03-02" }, SUN_9AM, EASTERN)).toEqual([]);
    expect(daysReadInFull({ start: "Sep 27", end: "2026-09-28" }, SUN_9AM, EASTERN)).toEqual([]);
    expect(daysReadInFull({ start: "2026-09-27", end: "2026-09-28" }, new Date("not a date"), EASTERN)).toEqual([]);
  });

  it("takes the first ten characters of a day-time key, as the pull does", () => {
    expect(daysReadInFull({ start: "2026-09-27T00:00:00", end: "2026-09-28T23:59:59" }, SUN_9AM, EASTERN)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("keeps the newest year and a day of a back-read typed years back", () => {
    const days = daysReadInFull({ start: "2020-01-01", end: "2026-09-26" }, SUN_9AM, EASTERN);
    expect(days).toHaveLength(MAX_DAYS_A_WRITE);
    expect(days[days.length - 1]).toBe("2026-09-26");
    expect(days[0]).toBe(addDays("2026-09-26", -(MAX_DAYS_A_WRITE - 1)));
  });

  it("accepts the pull's start as milliseconds, as the background pull holds it", () => {
    expect(daysReadInFull({ start: "2026-09-27", end: "2026-09-28" }, SUN_9AM.getTime(), EASTERN)).toEqual(["2026-09-27", "2026-09-28"]);
  });
});

describe("the studio's own day", () => {
  it("at 11:30 PM Eastern is still today, whatever UTC says", () => {
    // Wed Sep 30 2026, 11:30 PM EDT = Oct 1, 03:30 UTC.
    const late = new Date("2026-10-01T03:30:00Z");
    expect(daysReadInFull({ start: "2026-09-30", end: "2026-10-30" }, late, EASTERN)).toEqual(["2026-09-30", "2026-10-01"]);
  });

  it("at 12:30 AM Eastern is the new day", () => {
    // Thu Oct 1 2026, 12:30 AM EDT = Oct 1, 04:30 UTC.
    const early = new Date("2026-10-01T04:30:00Z");
    expect(daysReadInFull({ start: "2026-10-01", end: "2026-10-31" }, early, EASTERN)).toEqual(["2026-10-01", "2026-10-02"]);
    // The day just ended is not re-dated: asked for, it is a past day read in full.
    expect(daysReadInFull({ start: "2026-09-30", end: "2026-10-31" }, early, EASTERN)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("follows the studio's clock, and Eastern when the studio has none or a bad one", () => {
    // Sep 28, 04:30 UTC: 12:30 AM Monday in New York, 11:30 PM Sunday in Chicago.
    const at = new Date("2026-09-28T04:30:00Z");
    const month = { start: "2026-09-27", end: "2026-10-28" };
    expect(daysReadInFull(month, at, "America/Chicago")).toEqual(["2026-09-27", "2026-09-28"]);
    expect(daysReadInFull(month, at, EASTERN)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(daysReadInFull(month, at, null)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
    expect(daysReadInFull(month, at, "Mars/Olympus")).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
  });
});

describe("the week the clocks go back (Sun Nov 1 2026)", () => {
  it("reads 12:30 AM on the Sunday, before the change, as Sunday", () => {
    // Nov 1, 00:30 EDT = 04:30 UTC. The pull's own near window is Sunday only
    // here (it adds 24 hours, and this Sunday is 25), and only Sunday is
    // recorded; asked for Monday too, Monday is tomorrow.
    const early = new Date("2026-11-01T04:30:00Z");
    expect(daysReadInFull({ start: "2026-11-01", end: "2026-11-01" }, early, EASTERN)).toEqual(["2026-11-01"]);
    expect(daysReadInFull({ start: "2026-11-01", end: "2026-11-02" }, early, EASTERN)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("reads 11:30 PM on the Sunday, after the change, as still Sunday", () => {
    // Nov 1, 23:30 EST = Nov 2, 04:30 UTC.
    const late = new Date("2026-11-02T04:30:00Z");
    expect(daysReadInFull({ start: "2026-11-01", end: "2026-12-01" }, late, EASTERN)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("counts every day of the week once, none skipped and none twice", () => {
    const after = new Date("2026-11-09T14:00:00Z"); // Mon Nov 9, 9:00 AM EST
    const week = daysReadInFull({ start: "2026-10-26", end: "2026-11-08" }, after, EASTERN);
    expect(week).toHaveLength(14);
    expect(new Set(week).size).toBe(14);
    expect(week).toContain("2026-11-01");
    expect(week).toContain("2026-11-02");
    expect(week[week.length - 1]).toBe("2026-11-08");
  });
});

describe("the month documents", () => {
  it("is one document for days in one month", () => {
    expect(coverageWrites(["2026-09-27", "2026-09-28"])).toEqual([{ month: "2026-09", days: ["2026-09-27", "2026-09-28"] }]);
  });

  it("is two documents across a month's end", () => {
    expect(coverageWrites(["2026-09-30", "2026-10-01"])).toEqual([
      { month: "2026-09", days: ["2026-09-30"] },
      { month: "2026-10", days: ["2026-10-01"] },
    ]);
    // And across a year's end.
    expect(coverageWrites(["2026-12-31", "2027-01-01"]).map((w) => w.month)).toEqual(["2026-12", "2027-01"]);
  });

  it("orders the months and the days, and drops repeats and anything that isn't a day", () => {
    expect(coverageWrites(["2026-10-02", "2026-09-30", "2026-10-01", "2026-10-02", "someday", "2026-02-30"])).toEqual([
      { month: "2026-09", days: ["2026-09-30"] },
      { month: "2026-10", days: ["2026-10-01", "2026-10-02"] },
    ]);
    expect(coverageWrites([])).toEqual([]);
  });

  it("never holds more than a month's days in one document", () => {
    const writes = coverageWrites(daysReadInFull({ start: "2026-01-01", end: "2026-12-31" }, new Date("2027-01-05T14:00:00Z"), EASTERN));
    expect(writes).toHaveLength(12);
    for (const w of writes) expect(w.days.length).toBeLessThanOrEqual(MAX_DAYS_A_MONTH);
    expect(writes.find((w) => w.month === "2026-02")?.days).toHaveLength(28);
  });
});

describe("was a day read in full (the reader's question)", () => {
  const record: CoverageRecord = new Map<string, ReadonlySet<string> | null>([
    ["2026-09", recordedDays("2026-09", { days: ["2026-09-27", "2026-09-28", "2026-10-01"] })],
    ["2026-10", recordedDays("2026-10", undefined)],
    ["2026-11", null],
  ]);

  it("says yes for a recorded day, and no for a day of a month with no record", () => {
    expect(wasReadInFull("2026-09-27", record)).toBe(true);
    expect(wasReadInFull("2026-09-26", record)).toBe(false);
    expect(wasReadInFull("2026-10-01", record)).toBe(false); // filed under the wrong month: not counted
  });

  it("can't tell when the month's read failed, or wasn't made", () => {
    expect(wasReadInFull("2026-11-02", record)).toBeNull();
    expect(wasReadInFull("2026-12-01", record)).toBeNull();
  });

  it("reads a stored document safely", () => {
    expect(recordedDays("2026-09", null)).toEqual(new Set());
    expect(recordedDays("2026-09", { days: ["2026-09-01", 7, "2026-09-31", "2026-09-02"] })).toEqual(new Set(["2026-09-01", "2026-09-02"]));
    expect(recordedDays("2026-09", { days: "2026-09-01" })).toBeNull();
    expect(recordedDays("2026-09", "2026-09-01")).toBeNull();
    expect(wasReadInFull("not a day", record)).toBe(false);
  });
});

describe("the keys", () => {
  it("knows a real day from a string that looks like one", () => {
    expect(isDayKey("2026-09-27")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-9-27")).toBe(false);
    expect(isDayKey(20260927)).toBe(false);
  });

  it("knows a month id", () => {
    expect(isMonthId("2026-10")).toBe(true);
    expect(isMonthId("2026-13")).toBe(false);
    expect(isMonthId("2026-10-01")).toBe(false);
    expect(monthOf("2026-10-31")).toBe("2026-10");
  });

  it("adds calendar days across a month's end, a year's end and a leap day", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});
