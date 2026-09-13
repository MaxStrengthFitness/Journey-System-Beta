/**
 * THE LIVE-SESSION FAILSAFE (tracker round, Sep 2026).
 *
 * The audit's "one thing to add": if the app crashes, the browser reloads,
 * or a trainer simply logs back in, the bottom tab must take them straight
 * back into the session they were running — no client directory, no
 * profile, no "Take over" slot.
 *
 * Two nets, because either alone has a hole:
 *
 *   1. The studio's 24-hour `sessions` stream. `findMyLiveSession` picks
 *      the caller's own In-Progress session out of it. This works the
 *      moment the stream arrives, with no extra read — but it depends on
 *      the heartbeat (a session whose heartbeat is older than 60 minutes
 *      reads as abandoned, see `isSessionValid`).
 *   2. The device. `rememberLiveSession` writes the session id to
 *      localStorage when a session starts; `forgetLiveSession` clears it
 *      when the session finishes or is discarded. The tracker's takeover
 *      effect already reads this key and adopts the session by a direct
 *      `getDoc`, so it survives a stale heartbeat.
 *
 * The key name is the one `ClientProfileView`'s "Take over" has always
 * written, so nothing else needs to change to keep working.
 */

import { isSessionValid } from "./utils";

export const LIVE_SESSION_KEY = "max_strength_active_session_id";

export interface LiveSessionLike {
  id?: string;
  status?: string;
  trainerId?: string;
  clientId?: string;
  clientName?: string;
  lastHeartbeatAt?: unknown;
  createdAt?: unknown;
}

/**
 * The caller's own In-Progress session, if the stream holds one that is
 * still alive. Newest heartbeat wins when (wrongly) more than one exists.
 */
export function findMyLiveSession<T extends LiveSessionLike>(
  sessions: readonly T[],
  trainerId: string | null | undefined,
): T | undefined {
  if (!trainerId) return undefined;
  return sessions.find(
    (s) =>
      s.status === "In-Progress" &&
      s.trainerId === trainerId &&
      !!s.clientId &&
      isSessionValid(s),
  );
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberLiveSession(sessionId: string): void {
  storage()?.setItem(LIVE_SESSION_KEY, sessionId);
}

export function forgetLiveSession(sessionId?: string): void {
  const s = storage();
  if (!s) return;
  // Only clear our own id — a second tab may have started another session.
  if (!sessionId || s.getItem(LIVE_SESSION_KEY) === sessionId) {
    s.removeItem(LIVE_SESSION_KEY);
  }
}

export function peekLiveSessionId(): string | null {
  return storage()?.getItem(LIVE_SESSION_KEY) ?? null;
}

/** "Judy" from "Judy Daus" — the tab has room for one word. */
export function liveSessionTabLabel(session: LiveSessionLike | undefined): string {
  if (!session) return "Start Session";
  const first = (session.clientName || "").trim().split(/\s+/)[0];
  return first ? `Session · ${first}` : "Active Session";
}
