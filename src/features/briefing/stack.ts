/**
 * THE STACK — the pure half of the briefing's layout (Oct 3 2026).
 *
 * AJ's walk, Oct 3 2026: the briefing is opened just before she arrives and
 * held while the trainer walks her to the first machine, filling things in
 * on the way. He picked the "Stack" mockup, with the Catalog's muscle figure:
 *
 *   1. Safety first, readable in two seconds: the figure with her limits lit,
 *      each limit with the line that says what to DO.
 *   2. Since last time: how the last session went, notes since, time away.
 *   3. The one thing to ask about.
 *   4. On the way in: Dials · Sore spot · Note · Hand her the iPad, all
 *      optional, all one tap away and folded until tapped (the Dials too,
 *      since the floor round, Oct 9 2026).
 *   5. The routine as ONE line, tap to edit.
 *   6. Admin (InBody, renewal) as a quiet footer.
 *
 * This file answers the questions that need no React: which regions to light,
 * which views to draw, what "last time" says, and how the routine reads as a
 * line. stack.test.ts beside it.
 *
 * Every sentence here is a fact Journey holds. "Usual" needs three earlier
 * performed sets on that machine (a named minimum sample) and is the median
 * of her last five; nothing here suggests a weight or a progression.
 */

import type { ExerciseLog, Machine, WorkoutSession } from "../../types";
import { flagRegions, regionSpot, regionLabel, type FigureRegion, type FigureView } from "../client-codex/body/figure-map";
import { SESSION_REGION_TO_FIGURE } from "../client-codex/body/arrivals";
import { isBloodFlow, outcomeOf, skipReasonOf, SKIP_REASON_LABEL } from "../../lib/set-outcome";
import { machineWatchOuts } from "../../lib/clinical-watchouts";
import { safeToDate } from "../../lib/utils";

/* ------------------------------------------------------------------ *
 * The figure
 * ------------------------------------------------------------------ */

/**
 * Every region the safety band lights: her clinical flags' places (the
 * codex's table, so the briefing and Where it matters agree) and the body
 * regions carried over from the last session. Head to foot is the caller's
 * business; this keeps first-seen order and drops repeats.
 */
export function safetyRegions(
  flagIds: readonly string[],
  carriedRegions: readonly string[],
): FigureRegion[] {
  const out: FigureRegion[] = [];
  const add = (r: FigureRegion | undefined) => {
    if (r && !out.includes(r)) out.push(r);
  };
  for (const id of flagIds) for (const r of flagRegions(id)) add(r);
  for (const name of carriedRegions) add(SESSION_REGION_TO_FIGURE[name]);
  return out;
}

/** The figure region a session region tag names ("Shoulders" → shoulder), or null. */
export function figureRegionOfTag(tag: string): FigureRegion | null {
  return SESSION_REGION_TO_FIGURE[tag] ?? null;
}

/** The words for a figure region: "Shoulder", "Lower back". */
export function regionWords(region: FigureRegion): string {
  return regionLabel(region);
}

/**
 * Which sides of the figure to draw. Only a side with something lit, front
 * first; the front alone when nothing is placed (a whole-body flag such as
 * blood pressure lights no spot, and a blank back would say nothing).
 */
export function viewsToDraw(regions: readonly FigureRegion[]): FigureView[] {
  const views = new Set<FigureView>();
  for (const r of regions) {
    const v = regionSpot(r)?.view;
    if (v) views.add(v);
  }
  const out = (["front", "back"] as const).filter((v) => views.has(v));
  return out.length > 0 ? out : ["front"];
}

/**
 * The model's region slug → the briefing's body region tag, for a tap on the
 * Sore spot figure. Only the regions BodyStateTracker offers; a slug with no
 * tag (the head, the hands' fingers) is null and the tap does nothing.
 */
const SLUG_TO_TAG: Readonly<Record<string, string>> = {
  neck: "Neck",
  trapezius: "Upper Back",
  deltoids: "Shoulders",
  chest: "Chest",
  "upper-back": "Upper Back",
  "lower-back": "Lower Back",
  abs: "Core",
  obliques: "Core",
  gluteal: "Glutes",
  quadriceps: "Quads",
  adductors: "Hips",
  hamstring: "Hamstrings",
  knees: "Knees",
  calves: "Calves",
  tibialis: "Calves",
  ankles: "Ankles",
  forearm: "Wrists / Forearms",
  hands: "Wrists / Forearms",
};

export function tagOfSlug(slug: string): string | null {
  return SLUG_TO_TAG[slug] ?? null;
}

/* ------------------------------------------------------------------ *
 * Since last time — how the last session went
 * ------------------------------------------------------------------ */

/** The fewest earlier performed sets on a machine before "her usual" may be said. */
export const USUAL_MIN_SETS = 3;
/** How many earlier performed sets "her usual" is the median of. */
const USUAL_WINDOW = 5;
/** How many reps short of her usual before the line is worth a trainer's glance. */
const SHORT_BY = 2;

const millis = (ts: unknown): number => safeToDate(ts)?.getTime() ?? 0;

const repsOf = (log: ExerciseLog): number | null => {
  const raw = log.reps ?? log.outcomeReps;
  const n = raw === undefined || raw === null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export interface LastTimeLine {
  key: string;
  text: string;
  /** "skip" and "short" are worth a look; "light" is a recorded light set. */
  kind: "skip" | "short" | "light";
}

/**
 * What the last session's sets say, in a trainer's words, at most `limit`:
 *
 *   Skipped Leg Press last time: pain or injury.
 *   Leg Press: 5 reps last time, usually 8.
 *   Leg Press was a light set last time (blood flow), not counted.
 *
 * Only facts on the last session's own logs; a machine without enough
 * earlier sets says nothing about "usual". Time-based (TSC) sets are left
 * out of "usual": seconds and reps are not the same scale.
 */
export function lastTimeLines({
  lastSession,
  logs,
  machines,
  limit = 3,
}: {
  lastSession: Pick<WorkoutSession, "id"> | null;
  logs: readonly ExerciseLog[];
  machines: readonly Pick<Machine, "id" | "name">[];
  limit?: number;
}): LastTimeLine[] {
  if (!lastSession?.id) return [];
  const nameOf = (id: string) => machines.find((m) => m.id === id)?.name || null;
  const mine = logs.filter((l) => l.sessionId === lastSession.id);
  const out: LastTimeLine[] = [];
  const seen = new Set<string>();

  for (const log of mine) {
    const name = nameOf(log.machineId);
    if (!name || seen.has(log.machineId)) continue;
    const outcome = outcomeOf(log);

    if (outcome === "skipped") {
      const reason = skipReasonOf(log);
      const words = reason && reason !== "unknown" && reason !== "other" ? SKIP_REASON_LABEL[reason].toLowerCase() : null;
      out.push({ key: `skip-${log.machineId}`, kind: "skip", text: `Skipped ${name} last time${words ? `: ${words}` : ""}.` });
      seen.add(log.machineId);
      continue;
    }
    if (outcome === "practice" && isBloodFlow(log)) {
      out.push({ key: `light-${log.machineId}`, kind: "light", text: `${name} was a light set last time (blood flow), not counted.` });
      seen.add(log.machineId);
      continue;
    }
    if (outcome !== "performed" || log.isTSC || log.isStaticHold) continue;
    const reps = repsOf(log);
    if (reps === null) continue;
    const at = millis(log.createdAt);
    const earlier = logs
      .filter(
        (l) =>
          l.machineId === log.machineId &&
          l.sessionId !== lastSession.id &&
          outcomeOf(l) === "performed" &&
          !l.isTSC &&
          !l.isStaticHold &&
          repsOf(l) !== null &&
          (at === 0 || millis(l.createdAt) < at),
      )
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
      .slice(0, USUAL_WINDOW)
      .map((l) => repsOf(l) as number);
    if (earlier.length < USUAL_MIN_SETS) continue;
    const usual = median(earlier);
    if (usual - reps >= SHORT_BY) {
      out.push({
        key: `short-${log.machineId}`,
        kind: "short",
        text: `${name}: ${reps} reps last time, usually ${usual}.`,
      });
      seen.add(log.machineId);
    }
  }
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * The routine as one line
 * ------------------------------------------------------------------ */

type LineMachine = Pick<Machine, "id" | "name"> & { shortName?: string; comparisonKey?: string; fullName?: string };

/** "ADD · ABD · LP": each machine's short name, else its name, in order. */
export function routineCodes(machineIds: readonly string[], machines: readonly LineMachine[]): string[] {
  return machineIds
    .map((id) => machines.find((m) => m.id === id))
    .filter((m): m is LineMachine => !!m)
    .map((m) => (m.shortName?.trim() || m.name || "").trim())
    .filter(Boolean);
}

/**
 * The machines in this routine that one of her clinical flags names, as the
 * floor names them: the routine line says so without opening the list.
 */
export function machinesTouchingLimits(
  machineIds: readonly string[],
  machines: readonly LineMachine[],
  flagIds: readonly string[],
): string[] {
  if (flagIds.length === 0) return [];
  const out: string[] = [];
  for (const id of machineIds) {
    const m = machines.find((x) => x.id === id);
    if (!m) continue;
    if (machineWatchOuts(flagIds, m).length > 0) out.push(m.name || id);
  }
  return out;
}
