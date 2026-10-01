/**
 * WHAT A HUB CARD SAYS ABOUT ITS BOOKING — on the trainer's floor.
 *
 * The card used to go grey the minute its start time passed, and a grey card
 * hides its flags. A booking in Firestore is never "Completed" (the sync and
 * the webhook write Scheduled or Cancelled; End Session writes the session),
 * so in practice the red priority-note flag, the Pulse flag and the clinical
 * dot vanished at the start time — even when the trainer was a few minutes
 * late starting, which is exactly when they are walking up to read them.
 *
 * Done means logged (AJ, Sep 24 2026): `lib/booking-state` is the one answer
 * to what happened to a booking, and this is only how the floor draws it.
 *
 *   live        ahead, or in its slot with nothing finished: every flag shown.
 *   in-session  a Journey session is open and running for this client that
 *               day: live, tinted, pulsing — past its slot too while it runs.
 *   left-open   a session is open but has gone quiet (the staleness rule,
 *               below): recedes, with a quiet "Left open" (Oct 1 2026).
 *   done        a Journey session was completed that day (or Mindbody marked
 *               it). Recedes, flags hidden.
 *   not-logged  the slot (plus five minutes) is over and nothing was logged.
 *               Recedes, with a quiet "Not logged" — AJ, Sep 24: a grey card
 *               with no word would read as done when it is not.
 *   didnt-come  a leader marked it "didn't come" (studios/{s}/bookingMarks,
 *               Operations room wave 3, Sep 29 2026), or Mindbody said
 *               No-Show. Recedes, with a quiet "Didn't come" — a no-show is
 *               a fact the floor may say, and it is not "Not logged".
 *   past        over, and nothing to claim: the sessions could not be read (a
 *               failed read is unknown, never "not logged"), a cancellation.
 *               Recedes and says nothing.
 *
 * One floor-only exception to the per-client-per-day rule (AJ, Sep 24): a card
 * never recedes as done BEFORE ITS OWN START. A client booked twice in a day
 * (training at nine, an InBody scan at four) reads both bookings done once
 * the nine o'clock is logged — right for Operations, but on the floor it
 * would grey the four o'clock card and hide its flags before the client
 * arrives. Once its start has passed, the rule stands.
 *
 * PURE. The Hub hands in what it already holds: the app's live session
 * stream, indexed once, its minute clock, and the day's marks
 * (`useBookingMarks`, one listener for the day on screen) when it read them.
 */
import type { WorkoutSession } from "../types";
import { sessionDayKey } from "../features/client-history/model";
import { bookingState, type BookingLike, type BookingMarks, type LoggedSessions, type SessionLike } from "./booking-state";
import { toDate } from "./studio-time";
import { isSessionValid } from "./utils";

export type HubCardState = "live" | "in-session" | "left-open" | "done" | "not-logged" | "didnt-come" | "past";

/**
 * LEFT OPEN (hub fixes, Oct 1 2026; AJ: "this seems like it could lead to
 * issues lets fix this"). A session left open used to read "In session" all
 * day. Now the app's ONE staleness rule decides (`isSessionValid`, lib/utils:
 * no heartbeat for 60 minutes, the rule the Active Session's "unfinished
 * session" question and the profile's notice already use, through
 * lib/live-session's `splitInProgress`): still beating, it is "in-session";
 * gone quiet, "left-open" — a quiet card that says "Left open", and the peek
 * offers the existing ways to resume it or close it.
 */
export interface OpenSessionLike {
  status?: string;
  lastHeartbeatAt?: unknown;
  createdAt?: unknown;
}

export function hubCardState(
  booking: BookingLike,
  logged: LoggedSessions | null,
  now: Date,
  {
    sessionOpen = false,
    session = null,
    tz,
    marks = null,
  }: {
    /** A session is open and running (kept for callers that know no more). */
    sessionOpen?: boolean;
    /** Her newest Journey session on the booking's day, if any: judged by the staleness rule. */
    session?: OpenSessionLike | null;
    tz?: string;
    marks?: BookingMarks | null;
  } = {},
): HubCardState {
  if (session?.status === "In-Progress") return isSessionValid(session, now.getTime()) ? "in-session" : "left-open";
  if (sessionOpen) return "in-session";
  switch (bookingState(booking, logged, now, tz, marks)) {
    case "upcoming":
    case "in-progress":
      return "live";
    case "completed": {
      const start = toDate(booking.startTime as never);
      return start && start > now ? "live" : "done";
    }
    case "never-logged":
      return "not-logged";
    case "no-show":
      return "didnt-come";
    default:
      return "past";
  }
}

/** Does the card fade and hide its flags? Everything that is over. */
export function hubCardRecedes(state: HubCardState): boolean {
  return state === "done" || state === "not-logged" || state === "didnt-come" || state === "left-open" || state === "past";
}

/**
 * The newest Journey session per client per studio day. `sessions` must be
 * newest first — the app's stream is ordered `createdAt desc` — so a session
 * restarted or left open wins over the one before it. Matched by the client's
 * record id, never by name, and on the STUDIO's day (not the iPad's clock)
 * and the BOOKING's day (not today), so a session this morning never marks
 * tomorrow's card as in session.
 */
export function sessionsByClientDay<T extends SessionLike>(
  sessions: ReadonlyArray<T>,
  tz?: string,
): (clientId: string | null | undefined, day: string | null | undefined) => T | null {
  const byKey = new Map<string, T>();
  for (const s of sessions) {
    if (!s.clientId) continue;
    const day = sessionDayKey(s as WorkoutSession, tz);
    if (!day) continue;
    const key = `${s.clientId}|${day}`;
    if (!byKey.has(key)) byKey.set(key, s);
  }
  return (clientId, day) => (clientId && day ? byKey.get(`${clientId}|${day}`) ?? null : null);
}
