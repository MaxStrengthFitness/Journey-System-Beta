/**
 * PROGRESSION CUE — the one-glance "up / hold / down" a trainer reads before
 * a set, so they do not have to reconstruct last week's set in their head.
 *
 * It is a cue, not a prescription: nothing here writes a weight. The trainer
 * still sets the load, and the Academy's order of progression still holds.
 * That order (Academy 6 · Programming and Progression 1, "Workout
 * Progressions") is FORM, then SEQUENCE, then REP COUNT, then RESISTANCE —
 * load is the last thing to move, and only once the reps are there in good
 * form. "Set Duration" (same folder) gives the window: a set should run out
 * between roughly 6 and 10 reps to failure; fewer than 5 means the load is
 * too heavy to reach failure in good form, more than 10 (with the level's
 * range in REP_RANGE_BY_LEVEL — novices are held longer, 8–12) means it is
 * light. A timed static contraction is progressed by effort, never by load.
 *
 * Reads the last PERFORMED set only (src/lib/set-outcome.ts): a practice set
 * at half the load says nothing about what the client can lift.
 */

import { REP_RANGE_BY_LEVEL, type TraineeLevel } from "../features/routine-builder/academy";

export type CueDirection = "up" | "hold" | "down" | "none";

export interface ProgressionCue {
  direction: CueDirection;
  /** The load the cue points at, in lb. Null for hold and none. */
  nextWeight: number | null;
  /** Short enough for a chip: "Up 2 lb → 104", "Hold", "Down 2 lb → 96". */
  label: string;
  /** The reason, for the aria label and the tooltip — in the Academy's terms. */
  reason: string;
}

/** The last performed set, as the grid's JourneySet or anything shaped like it. */
export interface LastSetLike {
  weight: number | null | undefined;
  reps?: number | null;
  seconds?: number | null;
  isTSC?: boolean;
  quality?: 1 | 2 | 3 | null;
}

const NONE: ProgressionCue = { direction: "none", nextWeight: null, label: "", reason: "No performed set on record yet." };

/** The level the rep range is read for. Anything unknown is a novice — the safer window. */
export function traineeLevelOf(client: { trainingPedigree?: string | null; experienceLevel?: string | null } | null | undefined): TraineeLevel {
  const p = (client?.trainingPedigree || "").toLowerCase();
  if (p.includes("advanced") || p.includes("veteran")) return "advanced";
  if (p.includes("intermediate")) return "intermediate";
  if (p.includes("novice")) return "novice";
  const e = (client?.experienceLevel || "").toLowerCase();
  if (e.includes("advanced")) return "advanced";
  if (e.includes("intermediate")) return "intermediate";
  return "novice";
}

/**
 * @param last  the last performed set on this machine (null when none)
 * @param level the client's training level (REP_RANGE_BY_LEVEL)
 * @param step  the machine's weight increment in lb (MedX moves in 2s)
 */
export function progressionCue(last: LastSetLike | null | undefined, level: TraineeLevel = "novice", step = 2): ProgressionCue {
  if (!last || last.weight === null || last.weight === undefined || !(last.weight > 0)) return NONE;
  const range = REP_RANGE_BY_LEVEL[level];
  const weight = last.weight;

  // 1 · Form comes before everything. A set that broke down is not ready for load.
  if (last.quality === 1) {
    return {
      direction: "hold",
      nextWeight: null,
      label: "Hold · form first",
      reason: `Last set was marked "needs improvement". Form is the first progression; hold ${weight} lb until the reps come in good form.`,
    };
  }

  // 2 · A timed static contraction is progressed by effort and time, not by load.
  if (last.isTSC) {
    return {
      direction: "hold",
      nextWeight: null,
      label: "Hold · TSC",
      reason: `Timed static contraction at ${weight} lb — progress the effort, not the load.`,
    };
  }

  const reps = last.reps ?? null;
  if (reps === null) return NONE;

  // 3 · Too heavy to reach failure in good form: fewer than 5 reps ("Set Duration"),
  //     or below the level's floor when that floor is lower still.
  const tooHeavyBelow = Math.min(5, range.min);
  if (reps < tooHeavyBelow) {
    const next = Math.max(0, weight - step);
    return {
      direction: "down",
      nextWeight: next,
      label: `Down ${step} lb → ${next}`,
      reason: `${reps} reps at ${weight} lb is under ${tooHeavyBelow} — too heavy to reach failure in good form. Take ${step} lb off.`,
    };
  }

  // 4 · The reps are there, in form: resistance is finally the thing to move.
  if (reps > range.max) {
    const next = weight + step;
    return {
      direction: "up",
      nextWeight: next,
      label: `Up ${step} lb → ${next}`,
      reason: `${reps} reps at ${weight} lb is above the ${range.min}–${range.max} window for this level, in good form. Add ${step} lb.`,
    };
  }

  // 5 · Inside the window: add reps before load.
  return {
    direction: "hold",
    nextWeight: null,
    label: "Hold · add reps",
    reason:
      reps < range.min
        ? `${reps} reps at ${weight} lb — under the ${range.min}–${range.max} window. Hold the load and add reps before resistance.`
        : `${reps} reps at ${weight} lb — inside the ${range.min}–${range.max} window. Hold the load until the reps pass ${range.max} in good form.`,
  };
}
