/**
 * Date helpers for Mindbody membership/contract records.
 *
 * Mindbody sends contract dates as UTC midnight (`2019-03-20T00:00:00Z`) even
 * though they mean a calendar day. Rendering those on the browser's local clock
 * shifts them a day backwards for every studio west of Greenwich -- a contract
 * that ends on the 20th would read "Mar 19" in Ohio. Everything here therefore
 * formats in UTC on purpose.
 */

/** Anything Firestore might hand back for a date field. */
export type FirestoreDateLike =
  | { toDate: () => Date }
  | { seconds: number }
  | Date
  | string
  | number
  | null
  | undefined;

/** Normalizes a Firestore Timestamp, ISO string, or epoch value into a Date. */
export function toDateSafe(value: FirestoreDateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") {
      try {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if ("seconds" in value && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000);
    }
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "Mar 20, 2019" -- read in UTC so the calendar day never slips. */
export function formatMindbodyDate(value: FirestoreDateLike): string | null {
  const date = toDateSafe(value);
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Whole days from today until `value`. Negative once the date has passed.
 * Both ends are snapped to UTC midnight so the answer is a day count, not a
 * fractional-hours artifact.
 */
export function daysUntil(value: FirestoreDateLike): number | null {
  const date = toDateSafe(value);
  if (!date) return null;
  const DAY = 86_400_000;
  const target = Math.floor(date.getTime() / DAY);
  const today = Math.floor(Date.now() / DAY);
  return target - today;
}
