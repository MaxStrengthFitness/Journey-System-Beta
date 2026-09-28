/**
 * THE NEXT 30 MINUTES (hub cherry round, Sep 28 2026). Pure:
 * next-half-hour.test.ts.
 *
 * Hub direction B, held for this last round: "a Next 30 minutes strip shows
 * who's arriving across the floor", like a bay of flight strips
 * (research-hub §6.2, source 23). This file decides WHO is on it and in what
 * order; NextStrip.tsx draws it.
 *
 *   - On TODAY only: "the next 30 minutes" means nothing on Thursday.
 *   - From half an hour before the day's first booking until its last one
 *     ends — the strip's row is there all day, saying "Nobody due" in a
 *     quiet gap rather than coming and going under the trainer's finger, and
 *     it is gone before the day starts and after it ends.
 *   - A booking is on it while its slot overlaps the next half hour: started
 *     and not over ("Now"), under way with a session open ("In session"), or
 *     starting within the half hour ("9:45") — the Opportunities list's own
 *     "Now and the next 30 min" (moments-today's time sections), asked of
 *     each booking.
 *   - Never a booking that is over: a session done, a slot not logged, or
 *     nothing to claim (AJ, Hub question 2: "once the session is done it
 *     should make a lot less noise"). The card's own state decides it
 *     (lib/hub-card-state), so the strip and the grid can't disagree.
 *   - Soonest first; at the same time yours first, then the grid's columns
 *     left to right.
 */
import { hubCardRecedes, type HubCardState } from "../../lib/hub-card-state";
import type { Span } from "./grid-model";

/** The strip's window, in minutes. */
export const NEXT_WINDOW_MIN = 30;

export type NextWhen = "in-session" | "now" | "soon";

export interface NextCandidate<T> {
  item: T;
  /** Minutes since the studio's midnight. */
  span: Span;
  /** The card's state (`hubCardState`), asked with the Hub's clock. */
  state: HubCardState;
  /** Booked with you. */
  mine: boolean;
  /** Its column's place on the grid, left to right. */
  order: number;
}

export interface NextOnStrip<T> {
  item: T;
  span: Span;
  when: NextWhen;
}

const valid = (s: Span) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from;

/**
 * Whether the strip's row is on screen: on today (`nowMin` not null), from
 * half an hour before the day's first booking until its last one ends.
 * `spans` are the day's client bookings (never Mindbody's "Unavailable").
 */
export function stripOpen(spans: ReadonlyArray<Span>, nowMin: number | null, windowMin: number = NEXT_WINDOW_MIN): boolean {
  if (nowMin === null || !Number.isFinite(nowMin)) return false;
  const booked = spans.filter(valid);
  if (booked.length === 0) return false;
  const first = Math.min(...booked.map((s) => s.from));
  const last = Math.max(...booked.map((s) => s.to));
  return nowMin >= first - windowMin && nowMin < last;
}

/** Who is due in the next half hour, soonest first. */
export function nextHalfHour<T>(
  candidates: ReadonlyArray<NextCandidate<T>>,
  nowMin: number,
  windowMin: number = NEXT_WINDOW_MIN,
): NextOnStrip<T>[] {
  return candidates
    .filter((c) => valid(c.span) && !hubCardRecedes(c.state) && c.span.to > nowMin && c.span.from < nowMin + windowMin)
    .sort((a, b) => a.span.from - b.span.from || Number(b.mine) - Number(a.mine) || a.order - b.order)
    .map((c) => ({
      item: c.item,
      span: c.span,
      when: c.state === "in-session" ? "in-session" : c.span.from <= nowMin ? "now" : "soon",
    }));
}
