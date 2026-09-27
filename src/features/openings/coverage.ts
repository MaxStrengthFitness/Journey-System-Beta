/**
 * WHICH DAYS JOURNEY READ IN FULL (the whole-read record, Sep 27 2026).
 *
 * The first piece of Openings (docs/rounds/2026-09-27-openings.md, "Which
 * days count"), shipped on its own so the weeks start counting now
 * (docs/rounds/2026-09-27-coverage-record.md).
 *
 * WHY A RECORD AT ALL. A day in `schedules` can hold a handful of bookings
 * that arrived one at a time through the webhook, and it then looks exactly
 * like a quiet day. Before launch no iPad pulls every day, and a standing
 * booking made months ago reaches Journey only through a pull. Only a record
 * made at the time of the read can tell a whole day from a partial one, so
 * after every pull Mindbody answered in full, the iPad that pulled writes
 * down which studio days it read:
 *
 *   studios/{studioId}/scheduleCoverage/{yyyy-mm}
 *     days   ["2026-10-01", "2026-10-02", ...]   add-only, at most 31
 *
 * A DAY COUNTS when its answer came back whole on the day before, on the day
 * itself, or any time after (READ_AHEAD_DAYS). A read two days early proves
 * nothing about the day: bookings keep changing until then. So a pull of
 * the month ahead records today and tomorrow, and a back-read of the past
 * ("Pull from" on Operations -> Mindbody) records the past days it asked for.
 *
 * Pure: the writer is `coverage-record.ts`, and the reader to come is the
 * Sunday job and Openings' usual week (`wasReadInFull` below).
 */

import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../../lib/studio-time";

/** `studios/{studioId}/scheduleCoverage/{yyyy-mm}`. */
export const COVERAGE_COLLECTION = "scheduleCoverage";

/** A read counts for a day from the day before it: today's read records tomorrow, never the day after. */
export const READ_AHEAD_DAYS = 1;

/** The most days a month's document holds (the rules hold it too). */
export const MAX_DAYS_A_MONTH = 31;

/**
 * The most days one record carries: a year and a day, the newest kept. A
 * "Pull from" typed years back would otherwise be a write per month of it.
 */
export const MAX_DAYS_A_WRITE = 366;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_ID = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A real calendar day written `yyyy-mm-dd` ("2026-02-30" is not one). */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY_KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
}

/** A month document's id: `yyyy-mm`. */
export function isMonthId(value: unknown): value is string {
  return typeof value === "string" && MONTH_ID.test(value);
}

/** The month a day belongs to: "2026-10-31" -> "2026-10". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/**
 * A calendar day plus `n` days. Calendar arithmetic on the key, never 24
 * hours on an instant: on the Sunday the clocks go back a day is 25 hours
 * long, and on the Sunday they go forward 23.
 */
export function addDays(day: string, n: number): string {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * What a pull says about itself (`MindbodySyncResult` in
 * lib/mindbody-api-sync.ts; only these three fields are read).
 */
export interface PullAnswer {
  /** Mindbody answered for the WHOLE window (every page arrived) and Journey took it in. */
  windowComplete?: boolean;
  /** Bookings that left a near window, handed to a wider pull to settle. */
  sweepDeferred?: number;
  /** That wider pull ran, and its answer was whole. */
  settledWithMonth?: boolean;
}

/**
 * Did Journey take in Mindbody's whole answer for the window?
 *
 * `windowComplete` is the test the sync lease already uses. One case more: a
 * near pull that LOST a booking hands it to a wider pull to decide whether it
 * moved or was cancelled (`settleSweepWith`). Until that pull is whole too,
 * Journey still holds, on today or tomorrow, a booking Mindbody no longer
 * has, so the day is not recorded.
 */
export function readWhole(answer: PullAnswer | null | undefined): boolean {
  if (!answer || answer.windowComplete !== true) return false;
  if ((answer.sweepDeferred ?? 0) > 0 && answer.settledWithMonth !== true) return false;
  return true;
}

/**
 * The studio days a pull of `window` (inclusive `yyyy-mm-dd` keys, the
 * studio's own days, as every pull asks for them) read in full, if its
 * answer was whole: every day of the window up to tomorrow.
 *
 * `startedAt` is when the pull began, and "tomorrow" is counted from it. The
 * answer arrived after that, so the record can only ever be too modest,
 * never claim a day read two days early. The studio's day, never the iPad's:
 * a pull at 11:30 PM Eastern is still today's.
 *
 * Anything that isn't a window (a blank "Pull from", an end before its
 * start) records nothing.
 */
export function daysReadInFull(
  window: { start?: string | null; end?: string | null } | null | undefined,
  startedAt: Date | number,
  timeZone?: string | null,
): string[] {
  if (!window) return [];
  const start = typeof window.start === "string" ? window.start.slice(0, 10) : "";
  const end = typeof window.end === "string" ? window.end.slice(0, 10) : "";
  if (!isDayKey(start) || !isDayKey(end) || start > end) return [];
  const at = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (isNaN(at.getTime())) return [];
  const zone = isValidTimeZone(timeZone) ? (timeZone as string) : DEFAULT_TIME_ZONE;
  const tomorrow = addDays(studioTodayKey(at, zone), READ_AHEAD_DAYS);
  const last = end < tomorrow ? end : tomorrow;
  if (last < start) return [];
  const earliest = addDays(last, -(MAX_DAYS_A_WRITE - 1));
  const days: string[] = [];
  for (let day = start < earliest ? earliest : start; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** One month's document, and the days to add to it. */
export interface CoverageWrite {
  month: string;
  days: string[];
}

/**
 * The days grouped into their months' documents, oldest month first and each
 * month's days in order. A window across a month's end is two documents.
 */
export function coverageWrites(days: readonly string[]): CoverageWrite[] {
  const byMonth = new Map<string, Set<string>>();
  for (const day of days) {
    if (!isDayKey(day)) continue;
    const month = monthOf(day);
    if (!byMonth.has(month)) byMonth.set(month, new Set());
    byMonth.get(month)!.add(day);
  }
  return [...byMonth.keys()].sort().map((month) => ({ month, days: [...byMonth.get(month)!].sort() }));
}

/**
 * A stored month document, read safely: the days it records.
 *
 *   no document          an empty set: nothing was read in full that month
 *   a document           its days that belong to that month
 *   anything else        null: it can't be read, so it can't be told
 */
export function recordedDays(month: string, data: unknown): Set<string> | null {
  if (data === undefined || data === null) return new Set();
  if (typeof data !== "object") return null;
  const days = (data as { days?: unknown }).days;
  if (!Array.isArray(days)) return null;
  return new Set(days.filter((d): d is string => isDayKey(d) && monthOf(d) === month));
}

/**
 * The months a reader has read: month id -> its days, or null when that
 * month's read failed. A month the reader did not read is simply absent.
 */
export type CoverageRecord = ReadonlyMap<string, ReadonlySet<string> | null>;

/**
 * Was this studio day read in full? `null` is "can't tell": its month was not
 * read, or its read failed. A failed read is never "not read in full", and
 * never "read in full" either.
 */
export function wasReadInFull(day: string, record: CoverageRecord): boolean | null {
  if (!isDayKey(day)) return false;
  const month = monthOf(day);
  if (!record.has(month)) return null;
  const days = record.get(month);
  if (!days) return null;
  return days.has(day);
}
