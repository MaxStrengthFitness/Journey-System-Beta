/**
 * AHEAD — the day a client crosses the Journey's next line if nothing gets
 * booked: "May slip" (AJ, Oct 7 2026: "3a"). Pure: line-crossing.test.ts.
 *
 * The lines are the Journey's own (journey/states.ts), read in journeyOf's
 * order: Inactive, Lapsed, At risk (the studio's break line), then Drifting
 * (the studio's multiple of the usual gap). A client's state on a day with
 * nothing booked is the first line they are past, so the crossing is the
 * first day that state differs from today's. A drift line past the break
 * line never shows: the client goes straight to At risk, as journeyOf says.
 *
 * Said only as far as Journey can see bookings (the nightly record reads 30
 * days ahead, renewals/projection.ts `BOOKING_LOOKAHEAD_DAYS`): past that it
 * can't tell whether anything is booked, so it says nothing. A booking takes
 * the mark away, because the Journey then reads Back or the stage, never a line.
 */

import { addDays, daysBetween } from "../../client-history/model";
import type { JourneyLines, JourneyState } from "../journey/states";

export type LineState = Extract<JourneyState, "drifting" | "at-risk" | "lapsed" | "inactive">;

export interface LineInputs {
  /** The client's drift line in days (journey.driftDays): null when no usual gap is measured, so no Drifting. */
  driftDays: number | null;
  /** The studio's "warn me when a client has not visited for (days)": At risk. */
  breakDays: number;
  lines: Pick<JourneyLines, "lapsedDays" | "inactiveDays">;
}

/** The line a client is past after `daysSince` days with nothing booked, in journeyOf's order; null before any. */
export function lineStateAt(daysSince: number, p: LineInputs): LineState | null {
  if (daysSince >= p.lines.inactiveDays) return "inactive";
  if (daysSince >= p.lines.lapsedDays) return "lapsed";
  if (daysSince >= p.breakDays) return "at-risk";
  if (p.driftDays !== null && daysSince >= p.driftDays) return "drifting";
  return null;
}

/**
 * The next line a client crosses if nothing is booked, and the day, when it
 * falls after today and no later than `until`. Null when nothing changes in
 * that time, or when there is no last visit to count from.
 */
export function nextLineCrossing(
  p: LineInputs & { lastVisit: string | null; today: string; until: string },
): { line: LineState; day: string } | null {
  if (!p.lastVisit || p.lastVisit > p.today) return null;
  const now = lineStateAt(daysBetween(p.lastVisit, p.today), p);
  const candidates = [p.driftDays, p.breakDays, p.lines.lapsedDays, p.lines.inactiveDays]
    .filter((n): n is number => n !== null && Number.isFinite(n) && n > 0)
    .map((n) => addDays(p.lastVisit as string, n))
    .filter((day) => day > p.today && day <= p.until)
    .sort();
  for (const day of candidates) {
    const state = lineStateAt(daysBetween(p.lastVisit, day), p);
    if (state && state !== now) return { line: state, day };
  }
  return null;
}
