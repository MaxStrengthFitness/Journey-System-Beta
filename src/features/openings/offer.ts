/**
 * A NEW REGULAR TIME (Openings, docs/rounds/2026-09-27-openings.md, "A new
 * regular time"): AJ's "we always have that 10:30 available on Tuesdays. So
 * if you wanted to, we could just take that for good for you."
 *
 * The times whose usual word is Usually has room, and any time marked so. A
 * time that reads or is marked Always full is never listed (marks.ts,
 * `offerable`). Each is then checked against today:
 *
 *   AN AGREED REGULAR. A trainer whose agreed week has a regular within
 *   SLOT_TOLERANCE_MINUTES of the time can't offer it. With a trainer chosen,
 *   the time must be theirs to offer (they usually take clients then and
 *   have no regular there); under "Anyone", a time is left out when every
 *   trainer usually in then has a regular there, or nobody is usually in.
 *
 *   THE COMING WEEKS. When the month was read in full today, the next
 *   OFFER_AHEAD_WEEKS occurrences after this week (days 7 to 27, one read of
 *   the studio's bookings, answered by the server, made only when this part
 *   or the Wrap-up's sheet opens) must all be free: a time booked on any of
 *   them is left out. When the month wasn't read in full today, the time is
 *   listed with "Can't check the coming Tuesdays yet."
 *
 *   THIS WEEK beside it: "This Tuesday, Oct 6: room" or "This Tuesday: full".
 *
 * FREE for a chosen trainer means they usually take clients then, aren't
 * away, have nothing booked, no "Unavailable" block of theirs covers it
 * (room.ts `addBlock`), and no rotation booking sits there that could be
 * theirs unseen; for anyone, that a trainer who could offer it is free once
 * the rotation has taken its places. A booking Journey can't place at that
 * time is never free. A modest "no" is always the answer to doubt: the
 * offer is "for good", and every line ends "Check it in Mindbody before you
 * promise it. Journey doesn't book."
 *
 * PURE MODULE.
 */
import type { ScheduleEntry } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { SLOT_TOLERANCE_MINUTES } from "../standing-week/check";
import type { ServerRead } from "../standing-week/server-read";
import { minutesOf, type StandingWeekDoc } from "../standing-week/week";
import { weekdayOf } from "../studio-tasks/recurrence";
import { takesClientsAt } from "./agreed";
import { addDays } from "./coverage";
import { offerable, type OpeningsMark } from "./marks";
import { rowStart } from "./next-days";
import { addBlock, atRow, freeAt, inAhead, type PlacedBooking } from "./room";
import { bookingTime, parseTimeKey, type TimeKey } from "./rows";
import type { UsualTime } from "./usual";
import { placeBooking, type TrainerRef } from "./whose";

/** A time is offered for good only when free on this many coming weeks on file. */
export const OFFER_AHEAD_WEEKS = 3;

/** The coming weeks' read: the days after this week's seven, OFFER_AHEAD_WEEKS of them. */
export function comingRange(today: string): { from: string; to: string } {
  return { from: addDays(today, 7), to: addDays(today, 7 * (OFFER_AHEAD_WEEKS + 1) - 1) };
}

export interface BookingsRead {
  read: ServerRead;
  bookings: readonly ScheduleEntry[];
}

export interface OfferInput {
  today: string;
  now: Date;
  tz: string;
  /** The usual week's words (usual.ts `usualWeek(...).times`). */
  usual: ReadonlyMap<TimeKey, UsualTime>;
  marks?: ReadonlyMap<TimeKey, OpeningsMark> | null;
  docs: readonly StandingWeekDoc[];
  trainers: readonly TrainerRef[];
  worksHere?: (trainerId: string) => boolean;
  /** The trainer the offer is for (trainers/{id}), or null for anyone. */
  forTrainer: string | null;
  /** This week's bookings: today and the six days after (the next 7 days' read). */
  thisWeek: BookingsRead;
  /** The coming weeks' bookings (`comingRange`); null until that read is asked for. */
  coming: BookingsRead | null;
  /** The month was read in full today (back-from.ts `monthReadToday`). */
  monthRead: boolean;
}

export type ComingState = "free" | "checking" | "cant-check";

export interface Offer {
  key: TimeKey;
  weekday: number;
  row: number;
  usual: UsualTime | null;
  mark: OpeningsMark | null;
  /** Who could take it for good: usually in then, no regular there (trainers/{id}, sorted). */
  who: string[];
  coming: { state: ComingState; days: string[] };
  /** This week's occurrence, or null once it has passed. */
  thisWeek: { day: string; state: "room" | "full" | "cant-tell" } | null;
}

interface ByDay {
  bookings: Map<string, PlacedBooking[]>;
  /** Each day's staff blocks: never bookings, but their trainer is out for the time they cover. */
  blocked: Map<string, Map<string, Set<number>>>;
}

/** Every live booking of a read, placed, by studio day; and each day's staff blocks, apart. */
function byDay(read: BookingsRead | null, input: Pick<OfferInput, "tz" | "trainers">): ByDay {
  const out: ByDay = { bookings: new Map(), blocked: new Map() };
  for (const entry of read?.bookings ?? []) {
    if (entry.status === "Cancelled") continue;
    const time = bookingTime(entry, input.tz);
    if (!time) continue;
    const place = placeBooking(entry, input.trainers);
    if (isStaffBlock(entry)) {
      if (!out.blocked.has(time.dateKey)) out.blocked.set(time.dateKey, new Map());
      addBlock(out.blocked.get(time.dateKey)!, entry, place, time.rows);
      continue;
    }
    if (!out.bookings.has(time.dateKey)) out.bookings.set(time.dateKey, []);
    out.bookings.get(time.dateKey)!.push({ rows: time.rows, place, cancellation: "none" });
  }
  return out;
}

export function offers(input: OfferInput): Offer[] {
  const thisWeek = byDay(input.thisWeek, input);
  const coming = byDay(input.coming, input);
  const range = comingRange(input.today);
  const keys = new Set<TimeKey>([...input.usual.keys(), ...(input.marks?.keys() ?? [])]);
  const out: Offer[] = [];

  for (const key of keys) {
    const t = parseTimeKey(key);
    if (!t) continue;
    const usual = input.usual.get(key) ?? null;
    const mark = input.marks?.get(key) ?? null;
    if (!offerable(usual?.word, mark)) continue;

    // Who could take it for good: usually in then, still here, no agreed regular there.
    const candidates: string[] = [];
    for (const doc of input.docs) {
      if (!doc.final || !doc.trainerId) continue;
      if (input.worksHere && !input.worksHere(doc.trainerId)) continue;
      if (!takesClientsAt(doc.final.hours, t.weekday, t.row)) continue;
      const hasRegular = doc.final.regulars.some((r) => r.weekday === t.weekday && Math.abs((minutesOf(r.start) ?? -999) - t.row) <= SLOT_TOLERANCE_MINUTES);
      if (!hasRegular && !candidates.includes(doc.trainerId)) candidates.push(doc.trainerId);
    }
    candidates.sort();
    const who = input.forTrainer ? candidates.filter((id) => id === input.forTrainer) : candidates;
    if (who.length === 0) continue;

    const freeOn = (day: string, read: ByDay): boolean => {
      const at = atRow(read.bookings.get(day) ?? [], t.row);
      if (at.unplaced > 0) return false;
      const inIds = inAhead(input.docs, day, t.row, input.worksHere, read.blocked.get(day));
      const free = freeAt(inIds, at).free.filter((id) => who.includes(id));
      return free.length > at.rotation;
    };

    // The coming weeks.
    const days: string[] = [];
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) if (weekdayOf(day) === t.weekday) days.push(day);
    let state: ComingState;
    if (!input.monthRead) state = "cant-check";
    else if (!input.coming || input.coming.read === "loading") state = "checking";
    else if (input.coming.read !== "ready") state = "cant-check";
    else if (days.every((day) => freeOn(day, coming))) state = "free";
    else continue;

    // This week.
    let week: Offer["thisWeek"] = null;
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(input.today, i);
      if (weekdayOf(day) !== t.weekday) continue;
      const start = rowStart(day, t.row, input.tz);
      if (!start || start.getTime() <= input.now.getTime()) break;
      week = { day, state: input.thisWeek.read !== "ready" ? "cant-tell" : freeOn(day, thisWeek) ? "room" : "full" };
    }

    out.push({ key, weekday: t.weekday, row: t.row, usual, mark, who, coming: { state, days }, thisWeek: week });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.row - b.row);
}
