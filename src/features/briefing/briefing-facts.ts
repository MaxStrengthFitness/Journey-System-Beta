/**
 * BRIEFING FACTS — the pure half of the pre-session briefing.
 *
 * Reporting round, Sep 2026. Three questions the screen asks that need no
 * React and no Firestore, so they live here with a test beside them:
 *
 *   1. Which body regions from the last session still matter today?
 *      A region flagged with a "matters until" day keeps showing on the
 *      briefing until that day has passed — "keep the leg press out until
 *      Thursday" is said once and remembered by the app, not the trainer.
 *   2. When did THIS routine last run? The hero says when the last session
 *      was; a trainer choosing between A and B wants to know when each one
 *      was last performed (audit action item D), which is a different date.
 *   3. How to say a day: "until Thu" for this week, "until Sep 25" beyond it.
 *
 * Days are studio days (yyyy-mm-dd, string compare). Nothing here hands a
 * date-only string to `new Date()` — see CLAUDE.md's date trap.
 */

import type { BodyStateTag, DialValue, Routine, WorkoutSession } from "../../types";
import { REGION_SCALE, dialFromRegionState, dialTone, dialWord, type DialTone } from "../rating";
import { matchesRoutineLetter, type RoutineLetter } from "../../lib/routine-utils";
import { parseSessionDate, safeToDate } from "../../lib/utils";
import { relativeDay, toDate } from "../../types/journal";

/* ------------------------------------------------------------------ *
 * Body regions carried over
 * ------------------------------------------------------------------ */

export interface CarriedRegion {
  region: string;
  /** The Dial position — a legacy two-state tag reads through `dialFromRegionState`. */
  dial: DialValue | null;
  /** The Dial's word: Pain · Stiff · As usual · Better · Recovered. */
  word: string;
  /** The studio day it matters until (yyyy-mm-dd). */
  until: string;
  /** "until Thu" / "until today" / "until Sep 25". */
  untilLabel: string;
  /** Colour by urgency: alert (Pain), warn (Stiff), live (the rest). */
  tone: DialTone;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days from `fromKey` to `toKey`, both studio days; null when either is malformed. */
export function dayKeyDiff(fromKey: string, toKey: string): number | null {
  if (!DAY_KEY.test(fromKey) || !DAY_KEY.test(toKey)) return null;
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  // UTC arithmetic on the calendar parts: no DST, no zone, no drift.
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "until today" · "until tomorrow" · "until Thu" (inside a week) · "until Sep 25". */
export function untilLabel(untilKey: string, todayKey: string): string {
  const diff = dayKeyDiff(todayKey, untilKey);
  if (diff === null) return `until ${untilKey}`;
  if (diff <= 0) return "until today";
  if (diff === 1) return "until tomorrow";
  const d = toDate(untilKey);
  if (!d) return `until ${untilKey}`;
  if (diff < 7) return `until ${d.toLocaleDateString("en-US", { weekday: "short" })}`;
  return `until ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/**
 * The regions from the last session whose "matters until" day is today or
 * later. A tag with no `until` was for that day only and is not carried.
 */
export function carriedRegions(
  lastSession: Pick<WorkoutSession, "preSessionCheckIn"> | null | undefined,
  todayKey: string,
): CarriedRegion[] {
  const tags: BodyStateTag[] = lastSession?.preSessionCheckIn?.bodyStates ?? [];
  const out: CarriedRegion[] = [];
  for (const tag of tags) {
    if (!tag || typeof tag.region !== "string" || !tag.region.trim()) continue;
    const until = typeof tag.until === "string" ? tag.until.trim() : "";
    if (!DAY_KEY.test(until)) continue;
    // String compare is safe: both are yyyy-mm-dd.
    if (until < todayKey) continue;
    const dial = tag.dial ?? dialFromRegionState(tag.state);
    out.push({
      region: tag.region,
      dial,
      word: dialWord(REGION_SCALE, dial),
      until,
      untilLabel: untilLabel(until, todayKey),
      tone: dial === null ? "live" : dialTone(dial),
    });
  }
  // Worst first, so Pain is read before Better.
  return out.sort((a, b) => (a.dial ?? 0) - (b.dial ?? 0));
}

/* ------------------------------------------------------------------ *
 * When this routine last ran
 * ------------------------------------------------------------------ */

export interface RoutineLastRun {
  session: WorkoutSession;
  /** When it ran; null only when the session carries no readable date. */
  date: Date | null;
}

/** The instant a session happened, the way the tracker sorts its list. */
export function sessionInstant(s: WorkoutSession): number {
  const fromDay = parseSessionDate(s.date);
  if (fromDay > 0) return fromDay;
  return safeToDate(s.endTime)?.getTime() ?? safeToDate(s.startTime)?.getTime() ?? 0;
}

/**
 * Does this session belong to Routine A / B? By `routineId` first (the link
 * the session start writes), then by the routine name the session recorded,
 * then by the legacy habit of storing the letter in `sessionType`.
 */
export function sessionMatchesLetter(s: WorkoutSession, routines: Routine[], letter: RoutineLetter): boolean {
  if (s.routineId) {
    const byId = routines.find((r) => r.id === s.routineId);
    if (byId) return matchesRoutineLetter(byId, letter);
  }
  if (matchesRoutineLetter({ name: s.routineName }, letter)) return true;
  return matchesRoutineLetter({ name: s.sessionType as unknown as string }, letter);
}

/**
 * The newest completed session that ran Routine A or B. `sessions` may be in
 * any order; the newest by its own date wins.
 */
export function lastRunOfRoutine(
  sessions: WorkoutSession[] | null | undefined,
  routines: Routine[],
  letter: RoutineLetter,
): RoutineLastRun | null {
  if (!sessions?.length) return null;
  let best: WorkoutSession | null = null;
  let bestAt = -1;
  for (const s of sessions) {
    if (s.status !== "Completed") continue;
    if (!sessionMatchesLetter(s, routines, letter)) continue;
    const at = sessionInstant(s);
    if (at > bestAt) {
      best = s;
      bestAt = at;
    }
  }
  if (!best) return null;
  return { session: best, date: bestAt > 0 ? new Date(bestAt) : null };
}

/** "Last run today" · "Last run yesterday" · "Last run Sep 12" · "Never run". */
export function lastRunLabel(run: RoutineLastRun | null): string {
  // "Never run" is a claim about the CLIENT. A routine built in Journey for
  // a client who has trained here for years has no Journey run and plenty of
  // real ones, so the honest form is about our records. Safe whatever the
  // coverage, so unlike the rest of this round it needs no gate.
  if (!run) return "No run recorded";
  if (!run.date) return "Last run · date unknown";
  const rel = relativeDay(run.date);
  if (rel === "Today" || rel === "Yesterday") return `Last run ${rel.toLowerCase()}`;
  return `Last run ${run.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
