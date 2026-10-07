/**
 * AHEAD — the Clients view's two clocks on one line, as positions along the
 * weeks drawn (0 to 100). Pure, no DOM: clocks-geometry.test.ts. The screen
 * draws them with plain HTML; nothing here knows a pixel.
 *
 * A package runs on two clocks (renewals/README.md): the sessions, used at
 * the client's own pace, and the billing, which ends or renews on its day.
 * The row draws both, so where they disagree shows:
 *   - the BAR is the sessions left (Mindbody's count) used at the client's
 *     pace, from today to the day they run out;
 *   - the TICK is the commitment's end;
 *   - a bar that runs past a tick that charges is BANKED (sessions still on
 *     hand when the next package is charged);
 *   - a bar that stops short leaves a GAP (weeks with nothing left before
 *     the end);
 *   - the RANGE is the run-out day at the fastest and slowest 4-week pace;
 *   - the marks: the talk, the line crossed if nothing is booked, the return
 *     from away, and the moments.
 */

import { daysBetween } from "../../client-history/model";
import { lockSaysNothingBills } from "../../renewals/auto-renew";
import type { AheadClient } from "./events";
import type { AheadSpan } from "./weeks";

export interface Axis {
  first: string;
  days: number;
}

export function axisOf(span: AheadSpan): Axis {
  return { first: span.first, days: span.weeks * 7 };
}

/** Where a day falls along the axis, 0 to 100, clamped to its ends. */
export function at(day: string, axis: Axis): number {
  const p = (daysBetween(axis.first, day) / axis.days) * 100;
  return Math.round(Math.max(0, Math.min(100, p)) * 100) / 100;
}

export interface Seg {
  from: number;
  to: number;
}

export interface ClockMarks {
  today: number;
  bar: Seg | null;
  banked: Seg | null;
  gap: Seg | null;
  range: Seg | null;
  /** Away: the clocks paused until the client is back. */
  paused: Seg | null;
  /** The commitment's end, when it falls inside the weeks drawn. */
  end: number | null;
  endWord: "Renews" | "Billing ends" | "Ends" | null;
  talk: number | null;
  slip: number | null;
  back: number | null;
  moments: number[];
  /** The run-out day, when it falls past the weeks drawn. */
  beyond: string | null;
}

function seg(from: number, to: number): Seg | null {
  return to - from > 0 ? { from, to } : null;
}

export function clockMarks(c: AheadClient, axis: Axis, today: string): ClockMarks {
  const marks: ClockMarks = {
    today: at(today, axis),
    bar: null,
    banked: null,
    gap: null,
    range: null,
    paused: null,
    end: null,
    endWord: null,
    talk: null,
    slip: null,
    back: null,
    moments: c.events.filter((e) => e.kind === "birthday" || e.kind === "anniversary").map((e) => at(e.day, axis)),
    beyond: null,
  };
  const s = c.snapshot;
  if (!s || c.cantPlace) return marks;
  const inside = (day: string) => daysBetween(axis.first, day) >= 0 && daysBetween(axis.first, day) <= axis.days;

  // The commitment's end, and the word for it.
  const end = s.commitmentEnd ?? (s.paymentMode === "monthly" ? s.chargeDate : null);
  const charges = s.paymentMode === "monthly" && s.autoRenews === true && !lockSaysNothingBills(c.client.contractTierOverride);
  if (end && inside(end) && s.situation !== "away") {
    marks.end = at(end, axis);
    marks.endWord = s.paymentMode === "prepaid" ? "Ends" : charges ? "Renews" : s.paymentMode === "monthly" ? "Billing ends" : null;
  }

  // Away: the clocks are paused until the client is back.
  if (s.situation === "away" && s.awayUntil) {
    marks.paused = seg(marks.today, at(s.awayUntil, axis));
    if (inside(s.awayUntil)) marks.back = at(s.awayUntil, axis);
  }

  // The sessions, used at the client's pace.
  const run = s.pacePerWeek !== null && s.situation !== "away" ? s.runOutDate : null;
  if (run) {
    const r = at(run, axis);
    if (!inside(run)) marks.beyond = run;
    // Plum only where the record says it banks (the studio's least, 4 by
    // default): a day or two past the end is on track, not banked.
    if (end && marks.end !== null && run > end && charges && s.situation === "will-bank") {
      marks.bar = seg(marks.today, marks.end);
      marks.banked = seg(marks.end, r);
    } else {
      marks.bar = seg(marks.today, r);
    }
    if (c.events.some((e) => e.kind === "runs-out") && end) marks.gap = seg(r, at(end, axis));
    if (s.runOutRange) marks.range = seg(at(s.runOutRange.earliest, axis), at(s.runOutRange.latest, axis));
  }

  const talk = c.events.find((e) => e.kind === "talk-now" || e.kind === "talk");
  if (talk) marks.talk = at(talk.day, axis);
  const slip = c.events.find((e) => e.kind === "may-slip");
  if (slip) marks.slip = at(slip.day, axis);
  return marks;
}
