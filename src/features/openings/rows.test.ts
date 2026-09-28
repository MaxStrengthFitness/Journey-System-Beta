import { describe, expect, it } from "vitest";
import {
  LONGEST_BOOKING_MINUTES,
  OPENINGS_WEEKDAYS,
  ROW_MINUTES,
  bookingTime,
  clockLabel,
  isOpeningsWeekday,
  parseTimeKey,
  rowOf,
  rowsBetween,
  timeKey,
  timeName,
  weekdayPlural,
} from "./rows";

const TZ = "America/New_York";

describe("the numbers", () => {
  it("a time is a half-hour, Monday to Saturday", () => {
    expect(ROW_MINUTES).toBe(30);
    expect(OPENINGS_WEEKDAYS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isOpeningsWeekday(0)).toBe(false);
    expect(LONGEST_BOOKING_MINUTES).toBe(180);
  });
});

describe("time keys", () => {
  it("names a half-hour of a weekday, one key everywhere", () => {
    expect(timeKey(1, 8 * 60)).toBe("1-0800");
    expect(timeKey(1, 8 * 60 + 15)).toBe("1-0800");
    expect(timeKey(6, 17 * 60 + 30)).toBe("6-1730");
    expect(rowOf(8 * 60 + 29)).toBe(480);
  });

  it("reads a key back, and nothing that isn't one", () => {
    expect(parseTimeKey("1-0800")).toEqual({ weekday: 1, row: 480 });
    expect(parseTimeKey("6-1730")).toEqual({ weekday: 6, row: 1050 });
    for (const bad of ["0-0800", "7-0800", "1-0815", "1-2400", "1-800", "1-0800 ", 18, null]) expect(parseTimeKey(bad)).toBeNull();
  });

  it("says a time the way the studio does, always with AM or PM", () => {
    expect(timeName("1-0800")).toBe("Monday 8:00 AM");
    expect(timeName("4-1700")).toBe("Thursday 5:00 PM");
    expect(clockLabel(12 * 60 + 30)).toBe("12:30 PM");
    expect(weekdayPlural(2)).toBe("Tuesdays");
  });
});

describe("a booking fills every time it overlaps", () => {
  const at = (iso: string, minutes?: number) => ({
    startTime: new Date(iso),
    endTime: minutes === undefined ? null : new Date(new Date(iso).getTime() + minutes * 60_000),
  });

  it("a 30-minute booking at 8:00 fills 8:00", () => {
    expect(bookingTime(at("2026-10-05T08:00:00-04:00", 30), TZ)).toMatchObject({ dateKey: "2026-10-05", weekday: 1, startMinutes: 480, endMinutes: 510, rows: [480] });
  });

  it("a 60-minute booking fills both of its half-hours", () => {
    expect(bookingTime(at("2026-10-05T08:00:00-04:00", 60), TZ)?.rows).toEqual([480, 510]);
  });

  it("a rare one at 8:15 fills both 8:00 and 8:30", () => {
    expect(bookingTime(at("2026-10-05T08:15:00-04:00", 30), TZ)?.rows).toEqual([480, 510]);
  });

  it("with no end, or an end before its start, it runs one half-hour", () => {
    expect(bookingTime(at("2026-10-05T08:00:00-04:00"), TZ)?.rows).toEqual([480]);
    expect(bookingTime(at("2026-10-05T08:00:00-04:00", -30), TZ)?.rows).toEqual([480]);
  });

  it("a row whose end is hours out is cut at the longest a booking runs, and never past midnight", () => {
    expect(bookingTime(at("2026-10-05T08:00:00-04:00", 600), TZ)?.rows).toHaveLength(LONGEST_BOOKING_MINUTES / ROW_MINUTES);
    expect(bookingTime(at("2026-10-05T23:30:00-04:00", 120), TZ)).toMatchObject({ endMinutes: 1440, rows: [1410] });
  });

  it("reads the studio's clock on both sides of the clock change (Sun Nov 1 2026)", () => {
    // 8:00 EDT on Friday Oct 30, 8:00 EST on Monday Nov 2: the same wall-clock time.
    expect(bookingTime(at("2026-10-30T08:00:00-04:00", 30), TZ)).toMatchObject({ weekday: 5, rows: [480] });
    expect(bookingTime(at("2026-11-02T08:00:00-05:00", 30), TZ)).toMatchObject({ weekday: 1, rows: [480] });
    // The same UTC instant is 7:00 AM once the clocks have gone back.
    expect(bookingTime(at("2026-11-02T12:00:00Z", 30), TZ)?.rows).toEqual([420]);
  });

  it("can't place a booking whose start can't be read", () => {
    expect(bookingTime({ startTime: "not a date" }, TZ)).toBeNull();
    expect(rowsBetween(-30, 30)).toEqual([0]);
  });
});
