/**
 * WHO IS IN, WHETHER A DAY CAN BE JUDGED, AND THE WORD FOR ONE TIME (Openings,
 * docs/rounds/2026-09-27-openings.md, "Times and bookings", "Who is in",
 * "Whether a day's room can be judged", "One time, in one counted week").
 *
 * The one rule for past weeks (the Sunday job's fold) and for the next 7 days
 * (next-days.ts, offer.ts), so the grid and the lines can't disagree.
 *
 * WHAT COUNTS AS BOOKED:
 *
 *   a booking, as Journey last saw it        booked (a moved one, at the time
 *                                            it moved to)
 *   cancelled LATE_CANCEL_HOURS or more       not booked; a cancellation on
 *     before its start                        the time's sheet
 *   cancelled less than that before           still booked for the usual word:
 *                                            by then the time couldn't be
 *                                            offered to anyone. A LATE
 *                                            cancellation on the sheet. In the
 *                                            next 7 days it is room, like any
 *   cancelled with no stamp (the old          not booked, and not a
 *     sweep, or before stamps began)          cancellation either
 *   cancelled, stamped at or after its        not booked; a cancellation,
 *     own start (a back-read found it)        never a late one
 *   the studio rotation                       booked, for nobody in particular:
 *                                            it takes one free trainer's place
 *   a booking Journey can't place             booked; room that day can't be
 *                                            judged
 *   a Mindbody "Unavailable" block            not a booking (isStaffBlock)
 *
 * WHO IS IN. On a past day: an agreed week was in force that day with them
 * taking clients across the whole half-hour, AND they had at least one
 * booking at the studio that day (a trainer with none may not have worked,
 * and Journey can't tell). In the next 7 days: their agreed week has them in
 * then, they still work at the studio, and the day isn't one of their days
 * away. A day that hasn't happened can't prove more, so room ahead is always
 * worded as "usually takes clients then".
 *
 * A PAST DAY CAN BE JUDGED only when everyone who had a booking there is
 * known: every trainer with a booking had an agreed week in force that day,
 * and no booking is one Journey couldn't place. Rotation bookings don't stop
 * it. Kim, whose week isn't agreed, with bookings at 7:00 and 9:00 was
 * probably in and free at 8:00; if only Sam counted, 8:00 would read "full"
 * when Kim had room. The same rule holds for "full" and "room", so neither
 * word is favoured. Ahead, a claim is only ever "room with" someone in, and
 * the only booking that could quietly be theirs is one Journey couldn't
 * place AT THAT TIME, so the next 7 days judge the half-hour, not the day.
 *
 * THE WORD FOR ONE TIME IN ONE WEEK:
 *
 *   full        judged; someone is in; everyone in is booked, once each
 *               rotation booking has taken a free trainer's place
 *   room        judged; someone in is left with no booking
 *   none        room, with no booking at all at that time ("nobody booked")
 *   out         nobody is in ("nobody in"); any bookings are just counted
 *   booked      the day can't be judged: how many were booked, nothing more
 *
 * PURE MODULE: the Sunday job imports it.
 */
import type { ScheduleEntry } from "../../types";
import { toDate, type DateLike } from "../../lib/studio-time";
import { awayOn, type StandingWeekDoc, type WorkHours } from "../standing-week/week";
import { weekdayOf } from "../studio-tasks/recurrence";
import { takesClientsAt } from "./agreed";
import type { Place } from "./whose";

/** A cancellation less than this long before its start is late. */
export const LATE_CANCEL_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 *   none          not cancelled
 *   early         cancelled LATE_CANCEL_HOURS or more before its start
 *   late          cancelled less than that before its start
 *   unstamped     cancelled, with no stamp saying when
 *   after-start   stamped at or after its own start
 */
export type Cancellation = "none" | "early" | "late" | "unstamped" | "after-start";

export function cancellationOf(entry: Pick<ScheduleEntry, "status" | "startTime"> & { cancelledAt?: unknown }): Cancellation {
  if (entry.status !== "Cancelled") return "none";
  const at = toDate(entry.cancelledAt as DateLike);
  if (!at) return "unstamped";
  const start = toDate(entry.startTime as DateLike);
  if (!start || at.getTime() >= start.getTime()) return "after-start";
  return start.getTime() - at.getTime() < LATE_CANCEL_HOURS * HOUR_MS ? "late" : "early";
}

/** Booked, for the usual word: live, or cancelled too late for anyone else to take the time. */
export function bookedForUsual(c: Cancellation): boolean {
  return c === "none" || c === "late";
}

/** A cancellation the time's sheet counts: stamped ones only. */
export function countedCancellation(c: Cancellation): boolean {
  return c === "early" || c === "late" || c === "after-start";
}

/** One booking of a day, placed. */
export interface PlacedBooking {
  rows: readonly number[];
  place: Place;
  cancellation: Cancellation;
}

/** One studio day, as room reads it. Staff blocks are already left out. */
export interface RoomDay {
  weekday: number;
  bookings: readonly PlacedBooking[];
  /** The blocks of each trainer's agreed week in force that day, by trainers/{id}; a trainer with none that day is absent. */
  agreed: ReadonlyMap<string, readonly WorkHours[]>;
}

/** The trainers with a booking at the studio that day (booked for the usual word). */
export function trainersBooked(day: RoomDay): Set<string> {
  const out = new Set<string>();
  for (const b of day.bookings) if (b.place.kind === "trainer" && bookedForUsual(b.cancellation)) out.add(b.place.trainerId);
  return out;
}

/**
 * Why a past day can't be judged, or null when it can:
 *
 *   unagreed   a trainer with a booking that day had no agreed week in force
 *   unplaced   a booking that day is one Journey couldn't place with a trainer
 */
export type NotJudged = "unagreed" | "unplaced";

export function whyNotJudged(day: RoomDay): NotJudged | null {
  for (const id of trainersBooked(day)) if (!day.agreed.has(id)) return "unagreed";
  if (day.bookings.some((b) => b.place.kind === "unplaced" && bookedForUsual(b.cancellation))) return "unplaced";
  return null;
}

/** Who was in at a half-hour of a past day, by trainers/{id}, sorted. */
export function inOnPastDay(day: RoomDay, row: number): string[] {
  const booked = trainersBooked(day);
  const out: string[] = [];
  for (const [id, blocks] of day.agreed) if (booked.has(id) && takesClientsAt(blocks, day.weekday, row)) out.push(id);
  return out.sort();
}

/**
 * Who usually takes clients at a half-hour of a day ahead, by trainers/{id},
 * sorted: an agreed week has them in then, they still work at the studio
 * (`worksHere`; left out, everyone with an agreed week does), and the day
 * isn't one of their days away.
 */
export function inAhead(docs: readonly StandingWeekDoc[], dateKey: string, row: number, worksHere?: (trainerId: string) => boolean): string[] {
  const weekday = weekdayOf(dateKey);
  const out = new Set<string>();
  for (const doc of docs) {
    if (!doc.final || !doc.trainerId) continue;
    if (worksHere && !worksHere(doc.trainerId)) continue;
    if (awayOn(doc.away, dateKey)) continue;
    if (takesClientsAt(doc.final.hours, weekday, row)) out.add(doc.trainerId);
  }
  return [...out].sort();
}

/** What is booked at one half-hour. */
export interface AtRow {
  /** Booked bookings placed with a trainer, by trainers/{id} (one entry per booking). */
  placed: string[];
  rotation: number;
  unplaced: number;
  /** Every booking counted as booked: placed, rotation and unplaced. */
  booked: number;
  /** Stamped cancellations, and of them the late ones. */
  cancelled: number;
  late: number;
}

export function atRow(bookings: readonly PlacedBooking[], row: number): AtRow {
  const out: AtRow = { placed: [], rotation: 0, unplaced: 0, booked: 0, cancelled: 0, late: 0 };
  for (const b of bookings) {
    if (!b.rows.includes(row)) continue;
    if (countedCancellation(b.cancellation)) {
      out.cancelled += 1;
      if (b.cancellation === "late") out.late += 1;
    }
    if (!bookedForUsual(b.cancellation)) continue;
    out.booked += 1;
    if (b.place.kind === "trainer") out.placed.push(b.place.trainerId);
    else if (b.place.kind === "rotation") out.rotation += 1;
    else out.unplaced += 1;
  }
  return out;
}

export type Word = "full" | "room" | "none" | "out" | "booked";

export interface Free {
  /** The trainers in with nothing placed with them at the half-hour, sorted. */
  free: string[];
  /** How many of them are left once each rotation booking has taken a place. */
  room: number;
  /** Whether `free` says exactly who has room: no rotation booking took an unnamed place. */
  namesKnown: boolean;
}

/** Who is in and has no booking at the half-hour, and how many places the rotation leaves. */
export function freeAt(inIds: readonly string[], at: Pick<AtRow, "placed" | "rotation">): Free {
  const busy = new Set(at.placed);
  const free = [...new Set(inIds)].filter((id) => !busy.has(id)).sort();
  return { free, room: Math.max(0, free.length - at.rotation), namesKnown: at.rotation === 0 };
}

/** The word for one half-hour (the header's table). */
export function wordAt(judged: boolean, inIds: readonly string[], at: Pick<AtRow, "placed" | "rotation" | "booked">): Word {
  if (!judged) return "booked";
  if (inIds.length === 0) return "out";
  if (freeAt(inIds, at).room > 0) return at.booked === 0 ? "none" : "room";
  return "full";
}

/** One half-hour of a past counted day, everything the summary keeps about it. */
export interface PastRow extends AtRow {
  word: Word;
  inIds: string[];
}

export function pastRow(day: RoomDay, row: number, judged: boolean): PastRow {
  const at = atRow(day.bookings, row);
  const inIds = inOnPastDay(day, row);
  return { ...at, inIds, word: wordAt(judged, inIds, at) };
}
