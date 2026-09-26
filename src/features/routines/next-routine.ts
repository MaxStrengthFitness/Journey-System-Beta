/**
 * Which routine a session runs, and when each was last used (Sep 26 2026).
 *
 * The Active Session alternates strictly: with Routine B on, a session after
 * an A session runs B, and any other runs A. Before this file, that rule lived
 * only inside WorkoutTrackerView, and the profile showed a different answer.
 * It showed "Use today", a choice the session never read, so the routine card
 * could say "Routine A today" while the session was about to run B. AJ on the
 * Screen Atlas: "we can get rid of 'use today' and that can be replaced with a
 * 'Used last on'". So the rule is here, read by both, and each routine card
 * says when it was last used.
 */
import type { Routine, WorkoutSession } from "../../types";
import { parseSessionDate } from "../../lib/utils";
import { studioDayKeyOf, studioTodayKey } from "../../lib/studio-time";

/** A session's own day, in the History grid's order; start time only when it has no date. */
function whenOf(s: WorkoutSession): number {
  const fromDate = parseSessionDate(typeof s.date === "string" ? s.date : undefined);
  if (fromDate) return fromDate;
  const start = (s as { startTime?: unknown }).startTime;
  const t = start ? new Date(start as string).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

/** Completed sessions, newest first by the session's own date. */
export function completedNewestFirst(sessions: readonly WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.status === "Completed").sort((a, b) => whenOf(b) - whenOf(a));
}

/**
 * The routine the next session runs: the Active Session's rule. Null means the
 * client has no routines yet, and the session starts a new Routine A.
 */
export function nextRoutine(
  routines: readonly Routine[],
  lastCompletedRoutineId: string | null | undefined,
  isBActive: boolean,
): Routine | null {
  if (routines.length === 0) return null;
  const a = routines.find((r) => r.name === "Routine A");
  const b = routines.find((r) => r.name === "Routine B");
  if (a && b && isBActive) {
    const last = routines.find((r) => r.id === lastCompletedRoutineId);
    return last?.name === "Routine A" ? b : a;
  }
  return a ?? routines[0];
}

/** The studio day a routine was last used on, from Journey's completed sessions; null if none. */
export function lastUsedDay(sessions: readonly WorkoutSession[], routineId: string | null | undefined): string | null {
  if (!routineId) return null;
  const last = completedNewestFirst(sessions).find((s) => s.routineId === routineId);
  if (!last) return null;
  return studioDayKeyOf(
    (typeof last.date === "string" && last.date) || ((last as { startTime?: unknown }).startTime as string) || null,
  );
}

/**
 * "Used last on Sep 22", with the year when it is not this year, or "Used
 * today". Only ever said when Journey has the session: a routine with none is
 * said nothing about, because a migrated client's use of it may be in FileMaker.
 */
export function usedLastSentence(dayKey: string | null, todayKey: string = studioTodayKey()): string | null {
  if (!dayKey) return null;
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  if (dayKey === todayKey) return "Used today";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const sameYear = todayKey.slice(0, 4) === m[1];
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, mo - 1, d)));
  return `Used last on ${label}`;
}
