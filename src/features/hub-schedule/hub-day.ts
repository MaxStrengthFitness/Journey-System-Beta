/**
 * THE HUB'S DAY (hub fixes, Oct 1 2026). Pure: hub-day.test.ts.
 *
 * AJ, on the Screen Atlas's list of what looks off on the Hub: "these very
 * much need to be addressed." The first: the Hub fixed its day when it
 * opened. `selectedDate` was `new Date()` at mount and the seven days of the
 * week strip were built once, from the iPad's own midnight, so a Hub left
 * open overnight (the iPads at the front desk are) showed yesterday as
 * "today" the next morning, and the strip started a day late.
 *
 * Now the Hub's day is a studio day key ("2026-10-01", the studio's Eastern
 * day: lib/studio-time) worked out from the Hub's minute clock, which also
 * ticks when Journey comes back on screen. What the trainer is looking at is
 * either "today, whatever today is" (null) or a day they picked on purpose:
 *
 *   - left on today, the Hub moves to the new today at the studio's midnight
 *     (or the moment the iPad wakes after it);
 *   - a day they picked stays picked, even after midnight. Tapping today's
 *     own button goes back to following today.
 */
import { addDays } from "../studio-tasks/recurrence";

/** How many days the week strip shows: today and the next six. */
export const STRIP_DAYS = 7;

/** The strip's days, as studio day keys, from today. */
export function stripFrom(todayKey: string, days: number = STRIP_DAYS): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(addDays(todayKey, i));
  return out;
}

/** The day on screen: the day picked on purpose, else today. */
export function shownDay(picked: string | null, todayKey: string): string {
  return picked ?? todayKey;
}

/**
 * What a tap on a day remembers. Today itself is not a pick: it means
 * "follow today", so the Hub rolls over with the studio's midnight.
 */
export function pickDay(key: string, todayKey: string): string | null {
  return key === todayKey ? null : key;
}

/** "Thursday, Oct 1" for a studio day key, never shifted by the iPad's zone. */
export function dayTitle(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  // Noon UTC, read in UTC: the key's own calendar day whatever the iPad's zone.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
