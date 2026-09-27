/**
 * THE USUAL WORD FOR A TIME (Openings, docs/rounds/2026-09-27-openings.md,
 * "The usual word for a time" and "The time's sheet").
 *
 * A time's COUNTED WEEKS are the weeks, at most the last 8 (WINDOW_WEEKS), in
 * which its weekday counted (days.ts). Its JUDGED WEEKS are the counted weeks
 * whose day could also be judged (room.ts).
 *
 *   Always full       full in every judged week, with at least
 *                     ALWAYS_MIN_WEEKS judged. "Always" is kept for every
 *                     single week, so an "always" never has an exception
 *   Usually full      full in at least USUAL_SHARE of the judged weeks, with
 *                     at least MIN_WEEKS judged (a hot spot)
 *   Usually has room  room in at least USUAL_SHARE of them (a cold spot)
 *   Mixed             at least MIN_WEEKS judged, and neither
 *   N booked          fewer than MIN_WEEKS judged, at least MIN_WEEKS
 *                     counted: "Usually N booked", where N is the largest
 *                     number reached in at least USUAL_SHARE of the counted
 *                     weeks. The grid's hot and cold by demand, and it works
 *                     before any week is agreed
 *   Rotation          bookings on the rotation and nobody in, in at least
 *                     USUAL_SHARE of the counted weeks
 *   not enough        fewer than MIN_WEEKS counted ("–")
 *   blank             every counted week was JUDGED, with nothing booked and
 *                     nobody in. On a day that couldn't be judged the summary
 *                     stores nobody in (who was in isn't known: Kim, whose
 *                     week isn't agreed, was probably in and free between her
 *                     bookings), so an empty time on such a day is "none
 *                     booked", never "nobody in": it takes the "N booked"
 *                     form (N may be 0) or "not enough"
 *
 * ONE CASE THE PROPOSAL'S TABLE LEAVES OPEN: enough judged weeks, but in most
 * of them nobody's agreed week had anyone in at that time (a trainer booked
 * outside their usual week, say). Room and full are words about the trainers
 * in, so such a time takes the "N booked" form, with its own reason
 * (`why: "nobody-in"`), rather than a "Mixed" that would read as a claim.
 *
 * PURE MODULE.
 */
import { addDays, isDayKey } from "./coverage";
import { OPENINGS_WEEKDAYS, parseTimeKey, timeKey, type TimeKey } from "./rows";
import { cellFor, type Cell, type OpeningsSummary } from "./summary-doc";
import { weekdayOf } from "../studio-tasks/recurrence";
import { studioDateKey, toDate } from "../../lib/studio-time";

/** At least this many weeks before any word. */
export const MIN_WEEKS = 4;
/** "Always" needs at least this many judged weeks, every one of them full. */
export const ALWAYS_MIN_WEEKS = 6;
/** "Usually" is at least 3 in every 4. */
export const USUAL_SHARE = 0.75;

export type UsualWord = "always-full" | "usually-full" | "usually-room" | "mixed" | "booked" | "rotation" | "not-enough" | "blank";

/** At least USUAL_SHARE of `of` (and `of` isn't zero). */
export function atLeastShare(k: number, of: number): boolean {
  return of > 0 && k >= USUAL_SHARE * of - 1e-9;
}

/** The largest number reached in at least USUAL_SHARE of the values: "3 or more in 6 of the 7". */
export function largestReached(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const need = Math.ceil(USUAL_SHARE * values.length - 1e-9);
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.max(0, need - 1)] ?? 0;
}

/** One week at one time, as the sheet reads it. */
export interface WeekAtTime {
  index: number;
  monday: string;
  /** The studio day of that time that week. */
  day: string;
  /** Whether its day counted, and if not why. */
  verdict: "counted" | "unread" | "closed";
  judged: boolean;
  /** Why a counted day couldn't be judged: a trainer's week wasn't agreed, or a booking couldn't be placed. */
  notJudged: "unagreed" | "unplaced" | null;
  /** The day's live bookings (the closure test's count). */
  dayBooked: number;
  /** The cell, on a counted day. */
  cell: Cell | null;
}

/** Every week of the summary at one time, newest first. */
export function weeksAt(summary: OpeningsSummary, key: TimeKey): WeekAtTime[] {
  const t = parseTimeKey(key);
  if (!t) return [];
  return summary.weeks.map((w, index) => {
    const d = w.d[String(t.weekday)];
    const verdict = !d ? "unread" : d.x === "c" ? "closed" : d.x === "r" ? "unread" : "counted";
    const counted = verdict === "counted";
    return {
      index,
      monday: w.m,
      day: addDays(w.m, t.weekday - 1),
      verdict,
      judged: counted && d?.j === 1,
      notJudged: counted && d?.j !== 1 ? (d?.q === "p" ? "unplaced" : "unagreed") : null,
      dayBooked: d?.n ?? 0,
      cell: counted ? cellFor(summary, key, index) : null,
    };
  });
}

export interface UsualTime {
  key: TimeKey;
  weekday: number;
  row: number;
  word: UsualWord;
  /** Why an "N booked" time says nothing about room. */
  why: "unjudged" | "nobody-in" | null;
  counted: number;
  judged: number;
  /** Of the judged weeks: full, room (nobody booked included), nobody booked. */
  full: number;
  room: number;
  nobodyBooked: number;
  /** "Usually N booked", and in how many counted weeks N or more were (any at all, when N is 0). */
  usuallyBooked: number;
  reachedIn: number;
  /** Counted weeks on the rotation with nobody in, and how many that is usually. */
  rotationWeeks: number;
  usuallyRotation: number;
  /** Counted weeks with a stamped cancellation, and with a late one. */
  cancelledWeeks: number;
  lateWeeks: number;
  /**
   * Judged weeks with more booked than the agreed weeks had in. A week whose
   * every booking there was on the rotation, with nobody in, isn't counted:
   * a rotation Saturday is the rotation, not someone's usual week missing.
   */
  outnumbered: number;
  /** Who was in in at least USUAL_SHARE of the judged weeks (trainers/{id}), and how many are usually in. */
  usuallyIn: string[];
  usuallyInCount: number;
  weeks: WeekAtTime[];
}

/** The usual word for one time, and everything its sheet says. */
export function usualTime(summary: OpeningsSummary, key: TimeKey): UsualTime {
  const t = parseTimeKey(key) ?? { weekday: 0, row: 0 };
  const weeks = weeksAt(summary, key);
  const counted = weeks.filter((w) => w.cell !== null).map((w) => ({ ...w, cell: w.cell as Cell }));
  const judged = counted.filter((w) => w.judged);
  const full = judged.filter((w) => w.cell.word === "full").length;
  const room = judged.filter((w) => w.cell.word === "room" || w.cell.word === "none").length;
  const nobodyBooked = judged.filter((w) => w.cell.word === "none").length;
  const staffed = judged.filter((w) => w.cell.inKeys.length > 0).length;
  const rotationWeeks = counted.filter((w) => w.cell.rotation > 0 && w.cell.word === "out").length;

  const bookedCounts = counted.map((w) => w.cell.booked);
  const usuallyBooked = largestReached(bookedCounts);
  const reachedIn = usuallyBooked > 0 ? bookedCounts.filter((b) => b >= usuallyBooked).length : bookedCounts.filter((b) => b > 0).length;

  const inCounts = judged.map((w) => w.cell.inKeys.length);
  const tally = new Map<string, number>();
  for (const w of judged) for (const k of w.cell.inKeys) tally.set(k, (tally.get(k) ?? 0) + 1);
  const usuallyIn = [...tally.entries()]
    .filter(([, n]) => atLeastShare(n, judged.length))
    .map(([k]) => summary.who[k]?.id)
    .filter((id): id is string => !!id)
    .sort();

  // Blank only where "nobody in" is known: every counted week judged.
  const empty = counted.every((w) => w.judged && w.cell.booked === 0 && w.cell.inKeys.length === 0);
  let word: UsualWord;
  let why: UsualTime["why"] = null;
  if (counted.length === 0) word = "not-enough";
  else if (empty) word = "blank";
  else if (counted.length < MIN_WEEKS) word = "not-enough";
  else if (atLeastShare(rotationWeeks, counted.length)) word = "rotation";
  else if (judged.length >= MIN_WEEKS && atLeastShare(staffed, judged.length)) {
    if (full === judged.length && judged.length >= ALWAYS_MIN_WEEKS) word = "always-full";
    else if (atLeastShare(full, judged.length)) word = "usually-full";
    else if (atLeastShare(room, judged.length)) word = "usually-room";
    else word = "mixed";
  } else {
    word = "booked";
    why = judged.length >= MIN_WEEKS ? "nobody-in" : "unjudged";
  }

  return {
    key,
    weekday: t.weekday,
    row: t.row,
    word,
    why,
    counted: counted.length,
    judged: judged.length,
    full,
    room,
    nobodyBooked,
    usuallyBooked,
    reachedIn,
    rotationWeeks,
    usuallyRotation: largestReached(counted.filter((w) => w.cell.rotation > 0 && w.cell.word === "out").map((w) => w.cell.booked)),
    cancelledWeeks: counted.filter((w) => w.cell.cancelled > 0).length,
    lateWeeks: counted.filter((w) => w.cell.late > 0).length,
    outnumbered: judged.filter((w) => w.cell.booked > w.cell.inKeys.length && !(w.cell.inKeys.length === 0 && w.cell.booked === w.cell.rotation)).length,
    usuallyIn,
    usuallyInCount: largestReached(inCounts),
    weeks,
  };
}

/** Is a time a hot spot by the numbers (for the next 7 days' third kind of line)? */
export function readsFull(word: UsualWord | null | undefined): boolean {
  return word === "always-full" || word === "usually-full";
}

export interface UsualWeek {
  /** Every time of the grid, Monday to Saturday, earliest to latest. */
  times: Map<TimeKey, UsualTime>;
  /** The grid's rows: from the earliest to the latest anyone was booked or in during the weeks counted. */
  rows: number[];
  /** Weeks with at least one counted day. */
  weeksCounted: number;
  /** At least MIN_WEEKS counted: below it there is no grid, only a sentence. */
  enough: boolean;
  since: string | null;
}

export function usualWeek(summary: OpeningsSummary): UsualWeek {
  const weeksCounted = summary.weeks.filter((w) => Object.values(w.d).some((d) => !d.x)).length;
  let first = Infinity;
  let last = -Infinity;
  for (const [key, byWeek] of Object.entries(summary.cells)) {
    const t = parseTimeKey(key);
    if (!t) continue;
    for (const [index, stored] of Object.entries(byWeek)) {
      const day = summary.weeks[Number(index)]?.d[String(t.weekday)];
      if (!day || day.x) continue;
      if ((stored.b ?? 0) > 0 || (stored.i?.length ?? 0) > 0) {
        first = Math.min(first, t.row);
        last = Math.max(last, t.row);
      }
    }
  }
  const rows: number[] = [];
  if (first <= last) for (let row = first; row <= last; row += summary.row || 30) rows.push(row);
  const times = new Map<TimeKey, UsualTime>();
  for (const row of rows) for (const weekday of OPENINGS_WEEKDAYS) times.set(timeKey(weekday, row), usualTime(summary, timeKey(weekday, row)));
  return { times, rows, weeksCounted, enough: weeksCounted >= MIN_WEEKS, since: summary.since };
}

/**
 * The Sunday the first words can come: each Sunday's summary adds the week
 * just ended, so with `weeksCounted` so far the grid can have MIN_WEEKS on
 * the first Sunday after the build plus one week for each still missing.
 * Null once there are enough.
 */
export function firstWordsOn(builtAt: string, weeksCounted: number, tz: string): string | null {
  const needed = MIN_WEEKS - weeksCounted;
  if (needed <= 0) return null;
  const built = studioDateKey(toDate(builtAt), tz);
  if (!built || !isDayKey(built)) return null;
  const toSunday = (7 - weekdayOf(built)) % 7 || 7;
  return addDays(built, toSunday + 7 * (needed - 1));
}
