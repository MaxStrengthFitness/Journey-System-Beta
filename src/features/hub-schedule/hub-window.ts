/**
 * THE HUB'S OWN BOOKINGS (speed round, Oct 5 2026, R6).
 *
 * The app's schedule (useLiveSchedule) is a cache that only grows during a
 * studio visit: the live days, the week ahead, and every range the Calendar
 * has shown. The Hub used to work out its day over all of it every minute,
 * so one browsed Calendar month made the Hub twice as slow for the rest of
 * the visit, and the cache grew by a day for each day an iPad stayed open.
 *
 * The Hub reads only its window: yesterday to a week from today (the strip
 * is today and the six days after it; the week-ahead read fetches the same
 * span), and the day on screen when a day picked on purpose has fallen
 * behind it, so that day still shows what the app holds for it and reads as
 * the schedule says it was read ("loading", "failed" or "ready"), never as an
 * empty day. Everything the Hub draws or counts — the grid, the cards, the
 * strip's counts and dots, the day's moments — is asked of this list.
 * Pure: hub-window.test.ts.
 */
import { addDays } from "../client-history/model";
import { studioDayBoundsForKey } from "../../lib/studio-time";
import { safeToDate } from "../../lib/utils";

/** Days before today the window holds. */
export const HUB_DAYS_BEFORE = 1;
/** Days after today the window holds (the strip's six, and the week-ahead read's last). */
export const HUB_DAYS_AFTER = 7;

export interface HubWindow {
  /** First studio day held, `yyyy-mm-dd`. */
  from: string;
  /** Last studio day held, inclusive. */
  to: string;
}

/** Yesterday to a week from today, stretched to hold the day on screen. */
export function hubWindow(today: string, dayOnScreen: string): HubWindow {
  let from = addDays(today, -HUB_DAYS_BEFORE);
  let to = addDays(today, HUB_DAYS_AFTER);
  if (dayOnScreen < from) from = dayOnScreen;
  if (dayOnScreen > to) to = dayOnScreen;
  return { from, to };
}

/** A booking's start, by the fields the Hub has always read it from. */
function startOf(b: { startTime?: unknown; StartDateTime?: unknown; date?: unknown }): Date | null {
  return safeToDate((b.startTime || b.StartDateTime || b.date) as never);
}

/**
 * The bookings that start inside the window (the studio's day bounds), in
 * the order given. A booking with no readable start is left out, as the
 * grid and the engine already leave it out.
 */
export function inHubWindow<T extends { startTime?: unknown; StartDateTime?: unknown; date?: unknown }>(
  schedules: ReadonlyArray<T>,
  window: HubWindow,
): T[] {
  const from = studioDayBoundsForKey(window.from).start.getTime();
  const to = studioDayBoundsForKey(window.to).end.getTime();
  const out: T[] = [];
  for (const b of schedules) {
    if (!b) continue;
    const at = startOf(b)?.getTime();
    if (typeof at === "number" && at >= from && at <= to) out.push(b);
  }
  return out;
}
