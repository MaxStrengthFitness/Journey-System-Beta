/**
 * TIMES, AND A BOOKING'S TIMES (Openings, docs/rounds/2026-09-27-openings.md,
 * "Times and bookings").
 *
 * A TIME is a half-hour of a weekday, Monday to Saturday, on the studio's
 * clock: "Monday 8:00 AM" means 8:00 to 8:30 (ROW_MINUTES, the slot a session
 * is booked in). One key names a time everywhere, the summary's cells and the
 * marks alike: "1-0800" (the weekday 1 to 6, then the half-hour's start).
 *
 * A BOOKING FILLS EVERY TIME IT OVERLAPS, from its start to its end. A
 * 30-minute booking at 8:00 fills Monday 8:00; a rare one at 8:15 fills both
 * 8:00 and 8:30; a 60-minute one at 8:00 fills 8:00 and 8:30. A booking with
 * no readable end runs ROW_MINUTES, as the Relay's own reading of the
 * schedule does (relay/board/now-context.ts).
 *
 * Every clock is the studio's wall clock, read from the instant in the
 * studio's own time zone (never the device's), so the week of the clock
 * change reads 8:00 as 8:00 on both sides of it.
 *
 * PURE MODULE: the Sunday job imports it (server/machine-trends-job.ts).
 */
import { studioDateKey, toDate, zonedHM, type DateLike } from "../../lib/studio-time";
import { minutesToClock } from "../relay/board/now-context";
import { clockOf, minutesOf, WEEKDAY_NAME } from "../standing-week/week";
import { weekdayOf } from "../studio-tasks/recurrence";

/** Minutes in a time: the slot a session is booked in. */
export const ROW_MINUTES = 30;

/** The weekdays Openings reads, Monday first (Sundays are left out, as AJ described the week). */
export const OPENINGS_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/**
 * The longest a booking is read as lasting. A row whose end is hours after
 * its start is bad data, not a session, and would otherwise fill the whole
 * afternoon; the same cap leaves such a session out of "Your week".
 */
export const LONGEST_BOOKING_MINUTES = 180;

const DAY_MINUTES = 24 * 60;

/** A time's key: "1-0800". */
export type TimeKey = string;

/** The half-hour a minute of the day falls in: 8:15 -> 8:00. */
export function rowOf(minutes: number): number {
  return Math.floor(minutes / ROW_MINUTES) * ROW_MINUTES;
}

export function isOpeningsWeekday(weekday: number): boolean {
  return OPENINGS_WEEKDAYS.includes(weekday);
}

/** "1-0800" for Monday 8:00 (any minute inside the half-hour names it). */
export function timeKey(weekday: number, minutes: number): TimeKey {
  return `${weekday}-${clockOf(rowOf(minutes)).replace(":", "")}`;
}

/** The weekday and the half-hour a key names, or null for anything that isn't one. */
export function parseTimeKey(key: unknown): { weekday: number; row: number } | null {
  if (typeof key !== "string") return null;
  const m = /^([1-6])-([01]\d|2[0-3])([0-5]\d)$/.exec(key);
  if (!m) return null;
  const row = Number(m[2]) * 60 + Number(m[3]);
  if (row % ROW_MINUTES !== 0) return null;
  return { weekday: Number(m[1]), row };
}

/** The rows a span of the day overlaps, [start, end): 8:15 to 8:45 is 8:00 and 8:30. */
export function rowsBetween(startMinutes: number, endMinutes: number): number[] {
  const start = Math.max(0, startMinutes);
  const end = Math.min(DAY_MINUTES, endMinutes);
  const rows: number[] = [];
  for (let row = rowOf(start); row < end; row += ROW_MINUTES) rows.push(row);
  return rows;
}

/** A booking placed on the studio's clock. */
export interface BookingTime {
  /** Its studio day, "YYYY-MM-DD". */
  dateKey: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** Minutes since the studio's midnight. */
  startMinutes: number;
  endMinutes: number;
  /** Every half-hour it overlaps. */
  rows: number[];
  startAt: Date;
}

/**
 * Where a booking sits on the studio's clock, or null when its start can't be
 * read. Its length is real minutes (end minus start) laid from the wall-clock
 * start: none, or none that makes sense, is ROW_MINUTES; more than
 * LONGEST_BOOKING_MINUTES is cut there; and nothing runs past midnight.
 */
export function bookingTime(entry: { startTime: unknown; endTime?: unknown }, tz: string): BookingTime | null {
  const startAt = toDate(entry.startTime as DateLike);
  if (!startAt) return null;
  const dateKey = studioDateKey(startAt, tz);
  const hm = zonedHM(startAt, tz);
  if (!dateKey || !hm) return null;
  const endAt = toDate(entry.endTime as DateLike);
  const length = endAt ? Math.round((endAt.getTime() - startAt.getTime()) / 60_000) : 0;
  const minutes = length > 0 ? Math.min(length, LONGEST_BOOKING_MINUTES) : ROW_MINUTES;
  const startMinutes = hm.hour * 60 + hm.minute;
  const endMinutes = Math.min(DAY_MINUTES, startMinutes + minutes);
  return { dateKey, weekday: weekdayOf(dateKey), startMinutes, endMinutes, rows: rowsBetween(startMinutes, endMinutes), startAt };
}

/** "8:00 AM": always with AM or PM, because a studio day runs from 5:30 in the morning to 8:00 at night. */
export function clockLabel(minutes: number): string {
  return minutesToClock(minutes);
}

/** "08:00", the standing week's own clock. */
export function rowClock(minutes: number): string {
  return clockOf(minutes);
}

/** "Monday 8:00 AM". */
export function timeName(key: TimeKey): string {
  const t = parseTimeKey(key);
  return t ? `${WEEKDAY_NAME[t.weekday]} ${clockLabel(t.row)}` : key;
}

/** "Mondays". */
export function weekdayPlural(weekday: number): string {
  return `${WEEKDAY_NAME[weekday] ?? "day"}s`;
}

/** Minutes since midnight for a standing-week clock ("08:10"), or null. */
export function clockMinutes(clock: string): number | null {
  return minutesOf(clock);
}
