/**
 * LATE CANCELS — the words and the rules, in one place (Atlas answers, Oct 2
 * 2026).
 *
 * AJ, Oct 2 2026: "our app doesnt send information to mindbody it only
 * receives, so we really only need to take a session from a client if a
 * session is logged or a unlogged session gets marked as a no show. it needs
 * to be easy to mark a late cancel in the app."
 *
 *   An EARLY cancel is a cancellation where no session is taken (an
 *   emergency, an illness, usually a reschedule) — Mindbody's "Cancelled".
 *   A LATE cancel is when the session is taken: last minute without a good
 *   reason, forgot, a no-call no-show.
 *
 * The mark is the one the leaders' "didn't come" was (Operations wave 2):
 * `studios/{s}/bookingMarks/{bookingId}` with `noShow: true`, read by
 * lib/booking-state as a no-show. Its data is unchanged, so every mark made
 * before reads the same; what changed is who may make it — anyone who works
 * at the studio ("At the end of the day it is up to the studio and its
 * leaders to make the final call": a leader changes or undoes one, and the
 * person who made it may take back their own slip).
 *
 * TALLIED BESIDE VISITS, NEVER INSIDE THEM. "A client could have 42 sessions
 * in their package but only have 40 sessions by the end of their package due
 * to late cancels." Sessions recorded are visits; sessions left are the
 * contract's, from Mindbody; a late cancel is neither a visit nor a number
 * Journey takes off the contract. The renewal pace counts it as a session
 * USED (renewals/engine.ts), because the package was spent on it.
 *
 * PURE — no React, no Firestore.
 */

/** What a marked booking says, everywhere it is said. */
export const LATE_CANCEL_WORDS = "Late cancel · session taken";

/** The same, in the middle of a sentence. */
export const LATE_CANCEL_PHRASE = "late cancel";

export function lateCancelCount(n: number): string {
  return `${n} late ${n === 1 ? "cancel" : "cancels"}`;
}

/**
 * "40 sessions · 2 late cancels" — the visits, and the late cancels beside
 * them. The visits alone when there are none, or when the late cancels
 * couldn't be read (unknown is never "none", so nothing is claimed either
 * way); null with no count of sessions.
 */
export function sessionsAndLateCancels(sessions: number | null | undefined, lateCancels: number | null | undefined): string | null {
  if (typeof sessions !== "number" || !Number.isFinite(sessions)) return null;
  const visits = `${sessions} ${sessions === 1 ? "session" : "sessions"}`;
  if (typeof lateCancels !== "number" || !Number.isFinite(lateCancels) || lateCancels <= 0) return visits;
  return `${visits} · ${lateCancelCount(lateCancels)}`;
}

/**
 * May this person take a late cancel back? A leader always (the studio's
 * final call); anyone else only their own mark. `uid` is the Auth uid — the
 * rules pin `markedBy.id` to it. Mirrors firestore.rules' bookingMarks delete.
 */
export function mayTakeBackLateCancel(
  mark: { markedBy: { id: string } | null } | null | undefined,
  uid: string | null | undefined,
  leads: boolean,
): boolean {
  if (!mark) return false;
  if (leads) return true;
  return !!uid && !!mark.markedBy && mark.markedBy.id === uid;
}
