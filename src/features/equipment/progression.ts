/**
 * LOAD PROGRESSION — one machine, one client, one point per session.
 *
 * The profile's old machine pop-up (MachineSettingsDashboardModal) opened on a
 * load trend. The one machine window replaced that pop-up with the Equipment
 * tab's detail pane, and this series is what keeps the trend in it.
 *
 * Rules, each of which the old pop-up got partly wrong:
 *   - PERFORMED sets only (src/lib/set-outcome.ts). A practice set at 60 lb is
 *     history, not progression.
 *   - ONE point per session, the heaviest performed load in it. The pop-up
 *     drew one point per SET, so a unilateral machine (two logs a visit)
 *     plotted every session twice.
 *   - Days come from the SESSION's date through `toIsoDay`, never from a raw
 *     `new Date("yyyy-mm-dd")` (a date-only string is UTC midnight, which is
 *     the previous evening in the studio).
 *   - A set with no load (0, blank, a skipped machine) is not a point.
 *
 * Only the sessions the profile has loaded are here — the card says so.
 */
import type { ExerciseLog, WorkoutSession } from "../../types";
import { isPerformedLog } from "../../lib/set-outcome";
import { toIsoDay } from "../../lib/client-rollups";

export interface LoadPoint {
  sessionId: string;
  /** ISO day (YYYY-MM-DD) of the session. */
  day: string;
  /** Heaviest performed load in that session, lb. */
  weight: number;
  /** Reps of that set, when it recorded reps. */
  reps: number | null;
  /** Seconds of that set, for a timed static contraction. */
  seconds: number | null;
}

/** Below this, the card says "not enough sessions yet" instead of drawing a line. */
export const MIN_PROGRESSION_POINTS = 2;

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function loadProgression(
  machineId: string | null | undefined,
  logs: readonly ExerciseLog[] | null | undefined,
  sessions: readonly WorkoutSession[] | null | undefined,
): LoadPoint[] {
  if (!machineId || !logs?.length || !sessions?.length) return [];

  const dayOf = new Map<string, string>();
  for (const s of sessions) {
    if (!s?.id || !s.date) continue;
    const day = toIsoDay(s.date);
    if (day) dayOf.set(s.id, day);
  }

  const best = new Map<string, LoadPoint>();
  for (const log of logs) {
    if (!log || log.machineId !== machineId || !log.sessionId) continue;
    if (!isPerformedLog(log)) continue;
    const day = dayOf.get(log.sessionId);
    if (!day) continue;
    const weight = num(log.weight ?? log.loadLb);
    if (weight === null || weight <= 0) continue;
    const prev = best.get(log.sessionId);
    if (prev && prev.weight >= weight) continue;
    best.set(log.sessionId, {
      sessionId: log.sessionId,
      day,
      weight,
      reps: num(log.reps),
      seconds: num(log.seconds),
    });
  }

  return [...best.values()].sort((a, b) =>
    a.day === b.day ? a.sessionId.localeCompare(b.sessionId) : a.day < b.day ? -1 : 1,
  );
}

/** "Mar 4" — a local-noon read of an ISO day, so it never slips a day. */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The card's one sentence. A sentence, not a score: it names the sample it
 * stands on, and below the minimum it says so instead of drawing.
 */
export function progressionSentence(points: readonly LoadPoint[]): string {
  if (points.length < MIN_PROGRESSION_POINTS) {
    return points.length === 1
      ? "Not enough sessions yet — one performed session is loaded here, and a trend needs two."
      : "Not enough sessions yet — no performed set with a load is loaded here.";
  }
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.weight - first.weight;
  const move =
    delta === 0
      ? `Held at ${last.weight} lb`
      : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} lb, ${first.weight} → ${last.weight} lb`;
  return `${move} across the ${points.length} sessions loaded here (${shortDay(first.day)} to ${shortDay(last.day)}). Heaviest performed set in each.`;
}
