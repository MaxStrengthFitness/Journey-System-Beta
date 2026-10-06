/**
 * THE FINISHED SESSIONS, AS ONE STEADY LIST (speed round, Oct 5 2026, R6).
 *
 * The Hub's engine and the search's Directory rows read only COMPLETED
 * sessions (`loggedSessions`, `prepareDirectory`'s finished-today). The
 * studio's session stream changes far more often than that: a running
 * session's heartbeat (at most every 30 s, WorkoutTrackerView), its machine
 * order, a pause. Each change used to work the whole Hub out again.
 *
 * `completedSessionsOf` keeps the previous list while the finished sessions
 * in it are the same objects in the same order — useSessions keeps the
 * object of a session whose document did not change (R16), so the list
 * moves only when a session finishes, is edited, or leaves the window. A
 * reader keyed on it is keyed on the finished sessions and nothing else.
 */
import { useRef } from "react";
import type { WorkoutSession } from "../types";

const NONE: readonly WorkoutSession[] = Object.freeze([]) as readonly WorkoutSession[];

/** The completed sessions of `sessions`; `prev` itself when they are the same objects in the same order. */
export function completedSessionsOf(
  sessions: ReadonlyArray<WorkoutSession> | null | undefined,
  prev: readonly WorkoutSession[] | null,
): readonly WorkoutSession[] {
  const next: WorkoutSession[] = [];
  for (const s of sessions ?? []) if (s && s.status === "Completed") next.push(s);
  if (prev && prev.length === next.length && next.every((s, i) => s === prev[i])) return prev;
  return next.length === 0 ? NONE : next;
}

/** `completedSessionsOf`, held across renders: the same list until a finished session changes. */
export function useCompletedSessions(sessions: ReadonlyArray<WorkoutSession> | null | undefined): readonly WorkoutSession[] {
  const ref = useRef<readonly WorkoutSession[] | null>(null);
  const next = completedSessionsOf(sessions, ref.current);
  ref.current = next;
  return next;
}
