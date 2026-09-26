/**
 * Which Now Bar changes are sent at once (session record, Sep 26 2026).
 *
 * The rep, seconds and weight fields change with every keystroke, so their
 * writes wait a moment for the trainer to stop typing (WorkoutTrackerView's
 * queue) and go when the field is left (`onCommit`). A tap that FINISHES
 * something is different: a quality mark, practice or skip, the unit switch,
 * the stopwatch stopping. Nothing more is coming, so it is sent the moment it
 * is made, and a battery that dies a second later loses none of it.
 */
import type { LiveSet } from "./types";

const ONE_TAP: (keyof LiveSet)[] = ["quality", "qualityR", "outcome", "skipReason", "isTSC"];

export function sendsAtOnce(patch: Partial<LiveSet>): boolean {
  return ONE_TAP.some((k) => patch[k] !== undefined);
}
