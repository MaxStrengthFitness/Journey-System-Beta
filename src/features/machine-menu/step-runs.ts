/**
 * THE MACHINE MENU — Weight by weight: one line for each run at one weight.
 *
 * The answer to "instead of scrolling two hundred sessions" (AJ): every run
 * of counted sessions at one load becomes one line — the weight, how many
 * times, the dates and the reps in order — so a 200-session history reads as
 * about 65 short lines, newest first. It is the exact-number view and the
 * screen reader's view of the chart, in both doors.
 *
 * A run breaks where the chart breaks: at a weight change, at a folded gap
 * and at a set-up change, and the fold and the change sit between the runs
 * as divider lines. Practice, blood flow and skips are noted with the run
 * they fell in and never counted. Today's column is the Now Bar's, not a
 * run's. Counts only: no rate, no score, no advice word.
 *
 * PURE — the structure. timeline-words.ts says it.
 */
import type { FoldInfo, SetupBoundary, TimelineColumn, TimelineModel } from "./timeline-model";

export type RunDivider = { kind: "fold"; fold: FoldInfo } | { kind: "setup"; boundary: SetupBoundary };

export interface WeightRun {
  /** The load of the run; null for a run of only uncounted columns (before any counted set). */
  weight: number | null;
  /** The counted columns at this load, oldest first. */
  items: TimelineColumn[];
  /** Practice, blood flow, skipped and not-reached columns that fell inside the run. */
  extras: TimelineColumn[];
  /** What broke the run from the one before it. */
  before: RunDivider[];
}

/** The runs, OLDEST first (a list reverses them to read newest first). */
export function stepRuns(model: Pick<TimelineModel, "columns" | "foldAt" | "boundaryAt">): WeightRun[] {
  const runs: WeightRun[] = [];
  let current: WeightRun | null = null;
  let pending: RunDivider[] = [];
  model.columns.forEach((col, i) => {
    if (col.isToday) return;
    const fold = model.foldAt[i];
    const boundary = model.boundaryAt[i];
    if (fold) pending.push({ kind: "fold", fold });
    if (boundary) pending.push({ kind: "setup", boundary });
    if (col.counted && col.weight !== null) {
      if (!current || current.weight !== col.weight || pending.length > 0) {
        current = { weight: col.weight, items: [], extras: [], before: pending };
        runs.push(current);
        pending = [];
      }
      current.items.push(col);
      return;
    }
    if (pending.length > 0 && current) {
      // A break with nothing counted after it yet: the uncounted column opens
      // a run of its own, so the divider still sits where it happened.
      current = { weight: null, items: [], extras: [], before: pending };
      runs.push(current);
      pending = [];
    }
    if (!current) {
      current = { weight: null, items: [], extras: [], before: pending };
      runs.push(current);
      pending = [];
    }
    current.extras.push(col);
  });
  return runs;
}

/** How many counted runs: the number on the "Weight by weight (14)" button. */
export function countedRuns(runs: readonly WeightRun[]): number {
  return runs.filter((r) => r.items.length > 0).length;
}
