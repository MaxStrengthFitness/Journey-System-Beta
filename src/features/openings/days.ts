/**
 * WHICH DAYS COUNT (Openings, docs/rounds/2026-09-27-openings.md, "Which days
 * count").
 *
 * A past studio day counts only when both of these hold:
 *
 *   1. JOURNEY READ IT IN FULL: the whole-read record (coverage.ts,
 *      `wasReadInFull`) holds the day. A day with no such record doesn't
 *      count, however many bookings it holds, and a record that couldn't be
 *      read ("can't tell") doesn't count either.
 *   2. THE STUDIO WAS OPEN: its bookings are at least DAY_OPEN_SHARE of that
 *      weekday's usual, the median of the days of that weekday read in full
 *      in the window. Below that it reads as closed, or nearly (a holiday, a
 *      snow day).
 *
 * WHY NOT A VOLUME TEST ALONE (the first draft's). Before launch no iPad pulls
 * every day, and a standing booking made months ago reaches Journey only
 * through a pull, so every week may hold only part of its bookings. Then
 * every day passes a test against its own weekday, and a standing hot spot
 * reads "Usually has room": the exact opposite of the truth. Only a record
 * made at the time of the read can tell a whole day from a partial one.
 *
 * THE CLOSURE TEST COUNTS LIVE BOOKINGS ONLY. A snow day's bookings are
 * cancelled that morning, late; counting late cancellations here (as the
 * usual word does, room.ts) would make the closed day look full.
 *
 * DEMO MODE is the exception to the first test: the seeder wrote every Demo
 * booking, so every Demo day was, in effect, read in full.
 *
 * PURE MODULE: the Sunday job imports it.
 */
import { wasReadInFull, type CoverageRecord } from "./coverage";
import { weekdayOf } from "../studio-tasks/recurrence";

/** A day counts when its live bookings reach this share of its weekday's usual. */
export const DAY_OPEN_SHARE = 0.25;

/**
 *   counted   read in full, and open
 *   unread    Journey didn't read it in full (or can't tell whether it did)
 *   closed    read in full, but closed or nearly
 */
export type DayVerdict = "counted" | "unread" | "closed";

export interface DayInput {
  /** The studio day, "YYYY-MM-DD". */
  day: string;
  /** Live bookings on file that day: not cancelled, staff blocks left out. */
  booked: number;
}

export interface DayCount extends DayInput {
  weekday: number;
  verdict: DayVerdict;
  /** The weekday's usual (the median of its days read in full), for the "closed" sentence; null when none was read. */
  usual: number | null;
}

/** The median of a list of counts, or null for none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Is a day open, against its weekday's usual? A weekday nothing is usually booked on is open with nothing. */
export function openAgainst(booked: number, usual: number | null): boolean {
  if (usual === null) return true;
  return booked >= DAY_OPEN_SHARE * usual;
}

/**
 * Which of the days count. `everyDayRead` is Demo Mode's exception: every day
 * was written by the seeder, so the whole-read test is skipped (the closure
 * test is not).
 */
export function countDays(days: readonly DayInput[], record: CoverageRecord, options: { everyDayRead?: boolean } = {}): DayCount[] {
  const read = days.map((d) => ({ ...d, weekday: weekdayOf(d.day), read: options.everyDayRead === true || wasReadInFull(d.day, record) === true }));
  const usualByWeekday = new Map<number, number | null>();
  for (const weekday of new Set(read.map((d) => d.weekday))) {
    usualByWeekday.set(weekday, median(read.filter((d) => d.read && d.weekday === weekday).map((d) => d.booked)));
  }
  return read.map(({ read: wasRead, ...d }) => {
    const usual = usualByWeekday.get(d.weekday) ?? null;
    const verdict: DayVerdict = !wasRead ? "unread" : openAgainst(d.booked, usual) ? "counted" : "closed";
    return { ...d, verdict, usual: usual === null ? null : Math.round(usual) };
  });
}
