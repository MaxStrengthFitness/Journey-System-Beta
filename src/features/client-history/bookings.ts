/**
 * CLIENT HISTORY — what her bookings say about a day. The pure half.
 *
 * Round: the calendar shows her bookings, Sep 26 2026. AJ, reviewing the
 * Activity Archive's calendar: "we could always show the clients upcoming
 * sessions also on this calendar view. We can also log like, oh, here was a
 * canceled session ... Are the rescheduled sessions here? Are there upcoming
 * sessions here? Are there past sessions? It's like kind of like the whole
 * history and they're all looking at it just from above."
 *
 * The calendar draws the past from her SESSIONS (what Journey logged). This
 * module reads her BOOKINGS (`schedules`, what Mindbody holds) for the three
 * things a session cannot say:
 *
 *   BOOKED     a booking still to come: its start is later than now, today's
 *              later bookings included. Read through lib/booking-state.ts,
 *              never from `status` alone (CLAUDE.md, done-means-logged).
 *   CANCELLED  a booking Journey SAW being cancelled: status "Cancelled" AND
 *              a `cancelledAt` stamp. With another live booking the same
 *              Monday-to-Sunday week it MAY be a reschedule, by the
 *              Operations Changes list's own rule (admin/changes/changes.ts,
 *              `changesForDay`) rather than a second one — but it is named as
 *              "rebooked" only when that booking first appeared around or
 *              after the cancellation (`isRealRebook`, AJ, Sep 26 2026: a
 *              twice-a-week client's standing Thursday is not a rebook), and
 *              never when it had already started (nobody rebooks into the
 *              past; see below).
 *   MOVED      a booking that left this day for another (`movedFromDay`).
 *              A time change inside the same day is not a move: the day still
 *              has her booking.
 *
 * A PAST still-booked row adds nothing. The visit layer speaks for the past,
 * and "missed" is not something a booking can prove: bookings never come
 * back Completed (docs/rounds/2026-09-24-done-means-logged.md).
 *
 * WHY AN UNSTAMPED "CANCELLED" IS NEVER DRAWN. Until about Sep 16 2026 an old
 * sweep marked every past booking "Cancelled" on every sync, and those rows
 * were never repaired. They carry no `cancelledAt` — the stamps arrived with
 * the Operations overhaul, about Sep 19. Drawn, they would cover a client's
 * summer in cancellations that never happened: a confident wrong claim, which
 * is worse than none. So a cancellation is drawn only when the pull or the
 * webhook stamped the moment it happened, and one from before the stamps
 * existed is simply not on the calendar.
 *
 * PURE: no React, no Firestore. Days are studio day keys (yyyy-mm-dd).
 */
import type { ScheduleEntry } from "../../types";
import { bookingState, type LoggedSessions } from "../../lib/booking-state";
import { formatStudioTime, studioDateKey, toDate } from "../../lib/studio-time";
import { changesForDay, weekStartOf } from "../admin/changes/changes";
import { shortNameOf } from "../calendar/trainer-tone";
import { monthKeyOf, shortDate, weekdayOf, type DayKey, type VisitDay } from "./model";

export type BookingMarkKind = "booked" | "cancelled" | "moved";

export interface BookingMark {
  kind: BookingMarkKind;
  /** The schedule document (Mindbody's appointment id). */
  id: string;
  /** The studio day the mark sits on: the day booked, the day cancelled, the day a moved booking left. */
  day: DayKey;
  /** The start that day: the booked time, the cancelled time, the time it was moved from. */
  start: Date;
  /** Booked only: the trainer's first name, when one is known. */
  trainer: string | null;
  /**
   * Where it went. Cancelled: her other live booking that week, when there
   * is one (the reschedule reading). Moved: where the booking lives now.
   */
  to: { day: DayKey; start: Date } | null;
}

export interface BookingLayer {
  /** Soonest first. */
  marks: BookingMark[];
  /** The latest day a mark sits on: how far forward the calendar draws. */
  lastDay: DayKey | null;
}

export const NO_BOOKINGS: BookingLayer = { marks: [], lastDay: null };

/** Where the booking read is. "idle": nothing was asked (no client, or nothing drawn to read for). */
export type BookingsStatus = "idle" | "loading" | "ready" | "error";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The id changes.ts gives the same row, so the two can be matched. */
const idOf = (row: ScheduleEntry) => row.id ?? row.mindbodyAppointmentId ?? "";

/** Journey saw the cancellation happen: the pull or the webhook stamped it. */
export function isStampedCancellation(row: Pick<ScheduleEntry, "status" | "cancelledAt">): boolean {
  return row.status === "Cancelled" && toDate(row.cancelledAt ?? null) !== null;
}

/**
 * How long before the cancellation her other booking may have first appeared
 * and still be its rebook. The front desk often books the new slot first and
 * cancels the old one after, and the thirty-minute pull can see the two on
 * different runs; a booking Journey saw days before is her standing one.
 */
export const REBOOK_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * A REAL rebook (AJ, Sep 26 2026): the other booking that week first
 * appeared around or after the cancellation — `createdAt`, when Journey first
 * wrote the row. The Changes list's rule reads ANY other live booking that
 * week as the reschedule, and for a twice-a-week client that is nearly always
 * her standing Thursday, booked all along: "cancelled, rebooked Thu" would be
 * a confident wrong claim about most cancellations. With no `createdAt` to go
 * on, nothing is claimed.
 */
export function isRealRebook(
  other: Pick<ScheduleEntry, "createdAt"> | undefined,
  cancelledAt: Date | null,
): boolean {
  if (!other || !cancelledAt) return false;
  const created = toDate(other.createdAt ?? null);
  return created !== null && created.getTime() >= cancelledAt.getTime() - REBOOK_WINDOW_MS;
}

/**
 * The trainer's first name, the way the rest of the History tab names people
 * (`shortName`): the roster's own name when the booking is linked to a
 * trainer on it, else the name Mindbody sent. The pull's placeholder for an
 * appointment with no staff member, "{studio} Rotation"
 * (lib/mindbody-api-sync.ts), is nobody, so it names no one.
 */
export function bookingTrainerName(
  row: Pick<ScheduleEntry, "trainerId" | "trainerName">,
  rosterNames?: ReadonlyMap<string, string>,
): string | null {
  const fromRoster = row.trainerId ? rosterNames?.get(row.trainerId)?.trim() : undefined;
  if (fromRoster) return shortNameOf(fromRoster);
  const raw = typeof row.trainerName === "string" ? row.trainerName.trim() : "";
  if (!raw || /\srotation$/i.test(raw)) return null;
  return shortNameOf(raw);
}

export interface BookingLayerInput {
  /** Her bookings, cancelled rows included — every row from the first day the calendar draws. */
  rows: readonly ScheduleEntry[];
  now: Date;
  tz?: string;
  /**
   * Journey's sessions for her (`loggedSessions`, lib/booking-state.ts), or
   * null when they are not known. A booking on a day she already trained is
   * done, not still to come — the rule the Overview reads.
   */
  logged: LoggedSessions | null;
  /** Trainer id to full name, from the roster. */
  rosterNames?: ReadonlyMap<string, string>;
}

/** Every mark her bookings put on the calendar, soonest first. */
export function bookingLayer({ rows, now, tz, logged, rosterNames }: BookingLayerInput): BookingLayer {
  const all = [...rows];
  const dayOf = (value: unknown) => studioDateKey(toDate(value as Parameters<typeof toDate>[0]), tz);
  const marks: BookingMark[] = [];

  // BOOKED — still to come, as booking-state reads it.
  for (const row of all) {
    if (bookingState(row, logged, now, tz) !== "upcoming") continue;
    const start = toDate(row.startTime);
    const day = start ? studioDateKey(start, tz) : null;
    if (!start || !day) continue;
    marks.push({ kind: "booked", id: idOf(row), day, start, trainer: bookingTrainerName(row, rosterNames), to: null });
  }

  // CANCELLED and MOVED — the Changes list's rule, asked about each day a
  // stamped cancellation or a move names.
  const stamped = new Set(all.filter(isStampedCancellation).map(idOf));
  const days = new Set<DayKey>();
  for (const row of all) {
    if (stamped.has(idOf(row))) {
      const day = dayOf(row.startTime);
      if (day) days.add(day);
    } else if (row.status !== "Cancelled" && typeof row.movedFromDay === "string" && DAY_KEY.test(row.movedFromDay)) {
      days.add(row.movedFromDay);
    }
  }
  for (const day of days) {
    for (const change of changesForDay(all, day, tz)) {
      const toStart = change.movedTo?.start ?? null;
      const toDay = toStart ? studioDateKey(toStart, tz) : null;
      const to = toStart && toDay ? { day: toDay, start: toStart } : null;
      if (change.kind === "cancelled") {
        // Unstamped: the old sweep's, or older than the stamps. Not drawn.
        if (!stamped.has(change.id)) continue;
        // Nobody rebooks into the past. The Changes list falls back to a
        // booking EARLIER in the week when there is no later one, and for a
        // Tue/Thu client cancelling Thursday that is Tuesday's session,
        // already over when she cancelled. "Cancelled, rebooked Tue" would
        // be a confident wrong claim, so a destination that had started by
        // the time the cancellation was stamped is not named. Nor is one she
        // already held: only a booking that appeared with the cancellation
        // is its rebook (`isRealRebook`).
        const other = to
          ? all.find((r) => r.status !== "Cancelled" && toDate(r.startTime)?.getTime() === to.start.getTime())
          : undefined;
        const rebook =
          to &&
          change.detectedAt &&
          to.start.getTime() > change.detectedAt.getTime() &&
          isRealRebook(other, change.detectedAt)
            ? to
            : null;
        marks.push({ kind: "cancelled", id: change.id, day, start: change.originalStart, trainer: null, to: rebook });
      } else if (to && to.day !== day) {
        marks.push({ kind: "moved", id: change.id, day, start: change.originalStart, trainer: null, to });
      }
    }
  }

  marks.sort(
    (a, b) =>
      (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
      a.start.getTime() - b.start.getTime() ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
  const lastDay = marks.reduce<DayKey | null>((last, m) => (!last || m.day > last ? m.day : last), null);
  return { marks, lastDay };
}

const KIND_ORDER: Record<BookingMarkKind, number> = { cancelled: 0, moved: 1, booked: 2 };

/**
 * The first studio day the booking read needs: the Monday on or before the
 * first day the calendar draws (the 1st of the first visit's month), so the
 * same-week reschedule rule can see all of that first week. Null when there is
 * no visit to draw: the calendar draws nothing, so there is nothing to read.
 */
export function bookingsReadFrom(days: readonly VisitDay[]): DayKey | null {
  const first = days[0]?.key;
  if (!first) return null;
  return weekStartOf(`${monthKeyOf(first)}-01`);
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue Sep 22", or "Tue Jan 5, 2027" when the year is not the month card's. */
function dayWithWeekday(key: DayKey, year: number): string {
  return `${DOW_SHORT[weekdayOf(key)]} ${shortDate(key, year)}`;
}

export interface BookingLine {
  id: string;
  kind: BookingMarkKind;
  text: string;
}

/**
 * The words under a month, one line per mark, in the style the month already
 * uses for client events:
 *
 *   Mon Sep 28 · 3:00 PM · booked with Giovanni
 *   Sep 20 · cancelled
 *   Sep 23 · cancelled, rebooked Fri Sep 25
 *   Sep 18 · moved to Tue Sep 22
 *
 * `year` is the month card's year, so a date in another year says which. A
 * day with two cancellations or moves gives each its time, so the two lines
 * are not the same line twice.
 */
export function bookingLines(marks: readonly BookingMark[], year: number, tz?: string): BookingLine[] {
  const changesOn = new Map<DayKey, number>();
  for (const m of marks) {
    if (m.kind !== "booked") changesOn.set(m.day, (changesOn.get(m.day) ?? 0) + 1);
  }
  return marks.map((m) => ({
    id: `${m.kind}:${m.id}:${m.day}`,
    kind: m.kind,
    text: bookingLine(m, year, { tz, withTime: (changesOn.get(m.day) ?? 0) > 1 }),
  }));
}

export function bookingLine(mark: BookingMark, year: number, opts: { tz?: string; withTime?: boolean } = {}): string {
  const time = formatStudioTime(mark.start, opts.tz);
  if (mark.kind === "booked") {
    return `${dayWithWeekday(mark.day, year)} · ${time} · booked${mark.trainer ? ` with ${mark.trainer}` : ""}`;
  }
  const when = opts.withTime ? `${shortDate(mark.day, year)} · ${time}` : shortDate(mark.day, year);
  if (mark.kind === "moved") {
    return mark.to ? `${when} · moved to ${dayWithWeekday(mark.to.day, year)}` : `${when} · moved`;
  }
  if (!mark.to) return `${when} · cancelled`;
  const where = mark.to.day === mark.day ? formatStudioTime(mark.to.start, opts.tz) : dayWithWeekday(mark.to.day, year);
  return `${when} · cancelled, rebooked ${where}`;
}
