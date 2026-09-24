/**
 * WHAT HAPPENED TO A BOOKING — the one answer, for every screen that reads a
 * booking's outcome for operations.
 *
 * AJ, Sep 24 2026: "We don't currently have the resources to build a two-way
 * webhook with Mindbody to pull in 'Completed' statuses. Manual marking in
 * Mindbody is fine. For the Operations Overview, let's change the logic: if a
 * session is successfully logged in Journey for a client on a given day,
 * consider it 'Completed' for operational tracking."
 *
 * WHY THIS EXISTS. The schedule pull-sync (`lib/mindbody-api-sync.ts`) and the
 * webhook write a booking as "Scheduled" or "Cancelled" and nothing else, and
 * End Session writes the SESSION, never the booking. So no booking in
 * Firestore is ever "Completed" or "No-Show": asked on its own, a booking read
 * every finished slot as never logged on the Overview (Done and No-shows were
 * always 0, and Needs you could never reach zero), and as a visit on the
 * attendance watch. Journey's own session is the evidence the booking cannot
 * carry.
 *
 * THE RULE, in order:
 *
 *   1. Cancelled in Mindbody → cancelled. A cancellation is a fact about the
 *      booking; the Changes list holds it against its day whatever else the
 *      client did that day.
 *   2. A COMPLETED Journey session for the same client — matched by
 *      `clientId`, never by name — on the same studio day → completed. Per
 *      client per day, as AJ set it: a client booked twice with one session
 *      logged reads both done. It beats a Mindbody "No-Show", because a
 *      logged session is proof they trained.
 *   3. Mindbody said Completed or No-Show (manual marking there; the sync does
 *      not carry it today, the type allows it) → that.
 *   4. Otherwise the clock, the Overview's rule since the floor snapshot: not
 *      started → upcoming; started, slot not over (five minutes' slack) → in
 *      progress; slot over → never logged.
 *   5. …except that when Journey's sessions could not be read (or have not
 *      arrived yet), a finished slot is UNKNOWN. A failed read is unknown,
 *      never "never logged".
 *
 * An "In-Progress" session does not complete a booking: End Session has not
 * been pressed, and a session left open past its slot is exactly what a
 * leader should chase. Deleting a session removes its document (the History
 * pop-up, the tracker), so a deleted session is simply absent from the read.
 *
 * PURE. The caller reads the sessions — one bounded query scoped to the studio
 * (or to the one client), never one query per client — and hands them over
 * through `loggedSessions`, which indexes them once.
 */
import type { ScheduleEntry, WorkoutSession } from "../types";
import { sessionDayKey } from "../features/client-history/model";
import { studioDateKey, toDate } from "./studio-time";

export type BookingState =
  | "cancelled"
  | "completed"
  | "no-show"
  /** The start time has not arrived. */
  | "upcoming"
  /** Started, and the slot (plus five minutes) is not over. */
  | "in-progress"
  /** The slot is over and nothing says it happened — the one to chase. */
  | "never-logged"
  /** The slot is over and Journey's sessions could not be read. */
  | "unknown";

/** What a booking needs to carry. Any schedule-shaped row fits. */
export interface BookingLike {
  clientId?: string | null;
  startTime: unknown;
  endTime?: unknown;
  status: ScheduleEntry["status"] | string;
}

/** What a session needs to carry to say "this client trained that day". */
export type SessionLike = Pick<WorkoutSession, "status"> & Partial<WorkoutSession>;

/**
 * The client-days Journey holds a completed session for. Built once from a
 * list of sessions; `null` in its place means the list is not known.
 */
export interface LoggedSessions {
  has(clientId: string, day: string): boolean;
}

/** Five minutes of slack: a session that ran two minutes over is not an operational problem. */
export const SLOT_SLACK_MS = 5 * 60_000;

const keyOf = (clientId: string, day: string) => `${clientId}|${day}`;

/**
 * Index a read of sessions by client and studio day. Only COMPLETED sessions
 * with a client count. Pass `null` or `undefined` for a read that failed or
 * has not arrived — the answer is then `null`, which `bookingState` reads as
 * unknown rather than as "nothing logged".
 */
export function loggedSessions(
  sessions: ReadonlyArray<SessionLike> | null | undefined,
  tz?: string,
): LoggedSessions | null {
  if (!sessions) return null;
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.status !== "Completed" || !s.clientId) continue;
    const day = sessionDayKey(s as WorkoutSession, tz);
    if (day) days.add(keyOf(s.clientId, day));
  }
  return { has: (clientId, day) => days.has(keyOf(clientId, day)) };
}

/** The booking's studio day, `yyyy-mm-dd`, or null when it has no readable start. */
export function bookingDay(booking: BookingLike, tz?: string): string | null {
  return studioDateKey(toDate(booking.startTime as never), tz);
}

/** Has the slot finished, with the five minutes' slack? False when there is no end time. */
export function slotOver(booking: BookingLike, now: Date): boolean {
  const end = toDate(booking.endTime as never);
  return !!end && end.getTime() + SLOT_SLACK_MS < now.getTime();
}

/**
 * The booking's operational state on the studio's Eastern day. `logged` is
 * `loggedSessions(...)` over the sessions read for that day (or that client);
 * `null` when they could not be read.
 */
export function bookingState(
  booking: BookingLike,
  logged: LoggedSessions | null,
  now: Date,
  tz?: string,
): BookingState {
  if (booking.status === "Cancelled") return "cancelled";

  if (logged && booking.clientId) {
    const day = bookingDay(booking, tz);
    if (day && logged.has(booking.clientId, day)) return "completed";
  }
  if (booking.status === "Completed") return "completed";
  if (booking.status === "No-Show") return "no-show";

  const start = toDate(booking.startTime as never);
  if (!start || start > now) return "upcoming";
  if (!slotOver(booking, now)) return "in-progress";
  return logged ? "never-logged" : "unknown";
}
