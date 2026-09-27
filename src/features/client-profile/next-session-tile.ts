/**
 * The "Next session" tile's words (fix round, Sep 2026).
 *
 * On an iPad in portrait the tile is ~180px wide, and "Tomorrow 4:00 PM"
 * beside a "2 booked" chip came out as "Tomorro…". Names and days are never
 * truncated in this app, so the tile now reads on two lines: the headline
 * is the day and the time, joined with a middle dot so a wrap lands between
 * them, and the date plus the booked count sit underneath.
 */

/** "Tomorrow · 4:00 PM", "Wednesday · 12:30 PM", or just the day when the time is unknown. */
export function nextSessionHeadline(day: string | null, time: string): string | null {
  if (!day) return null;
  return time ? `${day} · ${time}` : day;
}

/** "1 booked", "3 booked" — every booking on the calendar, including this one. */
export function bookedLabel(scheduledCount: number): string {
  return `${Math.max(1, scheduledCount)} booked`;
}

/**
 * The bookings the tile may speak of: the ones still booked (Sep 26 2026).
 *
 * A cancelled booking keeps its row (status "Cancelled", with the stamps the
 * Changes list reads), and the profile's read of her upcoming bookings took
 * every row. So a cancellation could be the NEXT SESSION, and was counted in
 * "2 booked". The post-session screen's `nextBookingFor` and the packages
 * screen's `bookedWeekdays` already skipped them.
 */
export function stillBooked<T extends { status?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.status !== "Cancelled");
}
