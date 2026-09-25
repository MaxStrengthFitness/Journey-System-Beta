/**
 * PACKAGES — the days of the week a client is already booked, for "Your
 * week" on the packages screen.
 *
 * Facts, never a habit: the post-session screen holds only the next week or
 * so of THIS studio's bookings (useLiveSchedule), so a day lit here means
 * "there is a booking on a Tuesday coming up", nothing more. The weekday is
 * read in the studio's time zone, never the iPad's (CLAUDE.md: dates are the
 * studio's Eastern day).
 */

import { toDate, zonedYMD } from "../../lib/studio-time";

interface BookingLike {
  clientId?: string | null;
  startTime: unknown;
  status?: string | null;
}

/** How far ahead a booking may be and still light its day. */
export const BOOKED_DAYS_AHEAD = 14;

/** 0 = Sunday … 6 = Saturday, each once, in week order. */
export function bookedWeekdays(
  bookings: readonly BookingLike[],
  clientId: string | null | undefined,
  now: Date = new Date(),
): number[] {
  if (!clientId) return [];
  const until = now.getTime() + BOOKED_DAYS_AHEAD * 86_400_000;
  const days = new Set<number>();
  for (const b of bookings) {
    if (b.clientId !== clientId) continue;
    if (b.status === "Cancelled" || b.status === "Completed" || b.status === "No-Show") continue;
    const at = toDate(b.startTime as Parameters<typeof toDate>[0]);
    if (!at) continue;
    const ms = at.getTime();
    if (ms <= now.getTime() || ms > until) continue;
    const ymd = zonedYMD(at);
    if (!ymd) continue;
    days.add(new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay());
  }
  return [...days].sort((a, b) => a - b);
}
