/**
 * The cached studio-time readings give exactly the answers Intl gives.
 *
 * zonedYMD / zonedHM / studioDateKey stopped calling formatToParts on every
 * call (the iPad round, Oct 2026): the zone's offset is read once per UTC hour
 * and the rest is arithmetic. These tests walk every minute around both 2026
 * transitions and around midnight Eastern, and a spread of instants in zones
 * with half-hour, 45-minute and half-hour-DST rules, and compare each answer
 * with the old Intl reading.
 */
import { describe, it, expect } from "vitest";
import {
  zonedYMD,
  zonedHM,
  studioDateKey,
  startOfStudioDay,
  wallClockToInstant,
  studioDayBoundsForKey,
  __intlReadingsForTests,
  formatDateWords,
} from "./studio-time";

const { intlYMD, intlHM, intlOffsetMs } = __intlReadingsForTests;
const ET = "America/New_York";
const MIN = 60_000;

function expectSameAsIntl(ms: number, tz: string) {
  const d = new Date(ms);
  expect(zonedYMD(d, tz), `${d.toISOString()} ${tz}`).toEqual(intlYMD(d, tz));
  expect(zonedHM(d, tz), `${d.toISOString()} ${tz}`).toEqual(intlHM(d, tz));
}

/** The old two-pass start of day, read straight from Intl. */
function oldStartOfDay(ms: number, tz: string): number {
  const ymd = intlYMD(new Date(ms), tz);
  const naive = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  let instant = naive - intlOffsetMs(new Date(naive), tz);
  instant = naive - intlOffsetMs(new Date(instant), tz);
  return instant;
}

describe("the cached readings match Intl", () => {
  it("every minute from 10 PM to 6 AM around the spring-forward night (Mar 8 2026)", () => {
    // 2 AM EST -> 3 AM EDT is 07:00 UTC.
    const from = Date.UTC(2026, 2, 8, 3, 0);
    for (let ms = from; ms <= from + 8 * 60 * MIN; ms += MIN) expectSameAsIntl(ms, ET);
    expect(zonedHM(new Date(Date.UTC(2026, 2, 8, 6, 59)), ET)).toEqual({ hour: 1, minute: 59 });
    expect(zonedHM(new Date(Date.UTC(2026, 2, 8, 7, 0)), ET)).toEqual({ hour: 3, minute: 0 });
  });

  it("every minute from 10 PM to 6 AM around the fall-back night (Nov 1 2026)", () => {
    // 2 AM EDT -> 1 AM EST is 06:00 UTC; 1:xx happens twice.
    const from = Date.UTC(2026, 10, 1, 2, 0);
    for (let ms = from; ms <= from + 8 * 60 * MIN; ms += MIN) expectSameAsIntl(ms, ET);
    expect(zonedHM(new Date(Date.UTC(2026, 10, 1, 5, 59)), ET)).toEqual({ hour: 1, minute: 59 });
    expect(zonedHM(new Date(Date.UTC(2026, 10, 1, 6, 0)), ET)).toEqual({ hour: 1, minute: 0 });
  });

  it("the last and first seconds and milliseconds of a day, in summer and in winter", () => {
    for (const midnightUtc of [Date.UTC(2026, 8, 15, 4), Date.UTC(2026, 0, 15, 5)]) {
      for (const delta of [-61_000, -1000, -1, 0, 1, 999, 1000, 59_999, 60_000]) {
        expectSameAsIntl(midnightUtc + delta, ET);
      }
      expect(studioDateKey(new Date(midnightUtc - 1), ET)).not.toBe(studioDateKey(new Date(midnightUtc), ET));
    }
    expect(studioDateKey(new Date(Date.UTC(2026, 8, 15, 3, 59, 59, 999)), ET)).toBe("2026-09-14");
    expect(studioDateKey(new Date(Date.UTC(2026, 8, 15, 4, 0, 0, 0)), ET)).toBe("2026-09-15");
  });

  it("instants across six years, in zones with odd rules", () => {
    const zones = [ET, "America/Chicago", "America/Phoenix", "UTC", "Europe/London", "Asia/Kolkata", "Asia/Kathmandu", "America/St_Johns", "Australia/Lord_Howe", "Pacific/Chatham"];
    // A fixed pseudo-random walk, so the test is the same every run.
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const from = Date.UTC(2022, 0, 1);
    const span = 6 * 365 * 24 * 60 * MIN;
    for (const tz of zones) {
      for (let i = 0; i < 400; i++) expectSameAsIntl(from + (next() % span) + (next() % 1000), tz);
    }
  });

  it("every 5 minutes through Lord Howe's half-hour transitions (2026)", () => {
    // Lord Howe moves by 30 minutes, at 2 AM local, which is not on a UTC hour.
    for (const day of [Date.UTC(2026, 3, 4, 12), Date.UTC(2026, 9, 3, 12)]) {
      for (let ms = day; ms <= day + 6 * 60 * MIN; ms += 5 * MIN) expectSameAsIntl(ms, "Australia/Lord_Howe");
    }
  });

  it("years the arithmetic leaves to Intl (before 1000, after 9999, before standard time)", () => {
    for (const iso of ["0020-06-01T12:00:00Z", "0999-12-31T23:30:00Z", "1850-03-01T10:00:00Z", "1883-11-18T17:00:00Z", "9999-12-31T23:59:00Z"]) {
      expectSameAsIntl(Date.parse(iso), ET);
    }
    expectSameAsIntl(Date.UTC(10000, 0, 1), ET);
  });

  it("start of day, day bounds and wall-clock times agree with the Intl path on both transition days", () => {
    for (const day of ["2026-03-07", "2026-03-08", "2026-03-09", "2026-10-31", "2026-11-01", "2026-11-02"]) {
      const [y, m, d] = day.split("-").map(Number);
      for (let h = 0; h < 24; h++) {
        const at = Date.UTC(y, m - 1, d, h, 17, 3, 250);
        expect(startOfStudioDay(new Date(at), ET).getTime()).toBe(oldStartOfDay(at, ET));
      }
      const bounds = studioDayBoundsForKey(day, ET);
      expect(studioDateKey(bounds.start, ET)).toBe(day);
      expect(studioDateKey(bounds.end, ET)).toBe(day);
      expect(studioDateKey(new Date(bounds.end.getTime() + 1), ET)).not.toBe(day);
    }
    // 1:30 on the fall-back night happens twice; the two-pass rule picks one, as it always did.
    const twice = wallClockToInstant("2026-11-01T01:30:00", ET)!;
    expect(zonedHM(twice, ET)).toEqual({ hour: 1, minute: 30 });
    expect(wallClockToInstant("2026-03-08T07:00:00", ET)!.toISOString()).toBe("2026-03-08T11:00:00.000Z");
    expect(wallClockToInstant("2026-11-01T07:00:00", ET)!.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
});

describe("formatDateWords says what toLocaleDateString says", () => {
  const optionSets: Intl.DateTimeFormatOptions[] = [
    { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" },
    { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
    { weekday: "long", timeZone: "UTC" },
    { month: "short", day: "numeric" },
    { timeZone: "UTC", month: "long", year: "numeric" },
  ];
  it("for every option set the app uses, on days across two years and both transitions", () => {
    for (const options of optionSets) {
      for (const day of ["2026-01-01", "2026-03-08", "2026-11-01", "2026-12-31", "2027-02-28"]) {
        const [y, m, d] = day.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        expect(formatDateWords(date, options, "en-US")).toBe(date.toLocaleDateString("en-US", options));
        expect(formatDateWords(date, options)).toBe(date.toLocaleDateString([], options));
      }
    }
  });
  it("an invalid date reads as toLocaleDateString reads it", () => {
    const bad = new Date(Number.NaN);
    expect(formatDateWords(bad, { month: "short", timeZone: "UTC" }, "en-US")).toBe(bad.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }));
  });
});
