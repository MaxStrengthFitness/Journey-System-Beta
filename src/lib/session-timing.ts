/**
 * SESSION TIMING — the clues a leader reads around a "not reached" machine.
 *
 * AJ's rule (Sep 12 2026): a machine the session never got to is derived
 * silently, and the trainer is never asked why. Instead the record carries
 * enough to read the story afterwards — how long each machine took (the
 * per-machine clock on the logs), whether any set was practice, and whether
 * the client arrived late. This module does the last one.
 *
 * "Late" is measured against the Mindbody booking, which is the only clock
 * both sides agreed on beforehand. When no booking matches — a walk-in, an
 * unassigned session, a studio not yet synced — nothing is written, because
 * a guessed lateness is worse than none (the "In Journey since" rule).
 */

export interface BookingLike {
  clientId?: string | null;
  startTime?: unknown;
  status?: string | null;
}

/** Firestore Timestamp, Date, epoch ms or ISO string → epoch ms, else null. */
export function toEpochMs(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const o = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof o.toMillis === "function") return o.toMillis();
  if (typeof o.toDate === "function") return o.toDate().getTime();
  if (typeof o.seconds === "number") return o.seconds * 1000;
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Bookings further than this from the session start are somebody else's session. */
export const BOOKING_MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * The booking this session was for: same client, not cancelled, the closest
 * start time within the window. Ties (two bookings the same distance away)
 * go to the earlier one, because a client who is late is measured against
 * the slot they were meant to fill, not the one that came after.
 */
export function matchBookingForSession(
  bookings: readonly BookingLike[] | null | undefined,
  clientId: string | null | undefined,
  sessionStartMs: number | null | undefined,
  windowMs: number = BOOKING_MATCH_WINDOW_MS,
): { startMs: number; booking: BookingLike } | null {
  if (!bookings || !clientId || sessionStartMs === null || sessionStartMs === undefined) return null;
  let best: { startMs: number; booking: BookingLike } | null = null;
  for (const b of bookings) {
    if (!b || b.clientId !== clientId) continue;
    if ((b.status || "").toLowerCase() === "cancelled") continue;
    const startMs = toEpochMs(b.startTime);
    if (startMs === null) continue;
    const distance = Math.abs(startMs - sessionStartMs);
    if (distance > windowMs) continue;
    if (
      !best ||
      distance < Math.abs(best.startMs - sessionStartMs) ||
      (distance === Math.abs(best.startMs - sessionStartMs) && startMs < best.startMs)
    ) {
      best = { startMs, booking: b };
    }
  }
  return best;
}

/**
 * Whole minutes the session started after its booking. Negative means early.
 * Rounded to the minute: a leader reading "started 9 minutes late" does not
 * need the seconds, and the two clocks were never that precise anyway.
 */
export function lateByMinutes(bookingStartMs: number, sessionStartMs: number): number {
  return Math.round((sessionStartMs - bookingStartMs) / 60_000);
}

/**
 * The fields Finish Session writes on the session when a booking matched:
 * the booking's start, and how late the session started against it.
 */
export function sessionTimingFields(
  bookings: readonly BookingLike[] | null | undefined,
  clientId: string | null | undefined,
  sessionStartMs: number | null | undefined,
): { bookingStartMs: number; startedLateByMinutes: number } | null {
  const match = matchBookingForSession(bookings, clientId, sessionStartMs);
  if (!match || sessionStartMs === null || sessionStartMs === undefined) return null;
  return { bookingStartMs: match.startMs, startedLateByMinutes: lateByMinutes(match.startMs, sessionStartMs) };
}
