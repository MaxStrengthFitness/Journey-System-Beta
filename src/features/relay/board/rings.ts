/**
 * THE SHIFT RINGS — Opening, Mid and Closing, each filling as that phase's
 * recurring work is ticked.
 *
 * Round: Relay, Sep 2026. A closed ring stayed on the Now Bar as a dot for the
 * rest of the day, from a store the Floor published into. The Now Bar went in
 * the Relay room (Sep 28 2026), and with it the store: the Board says the
 * same thing in words ("Team today · by chore": "Opening chores · all 12
 * done"), and the Floor work door names the current phase's chores ("Mid
 * chores 9 of 14"). Always the whole studio's work, never a person's count:
 * a trainer's own to-dos (the personal tier, which reached the Board with the
 * studio's rows) are not the studio's chores and are not counted (Sep 28
 * 2026; until then one private to-do made "Mid chores 1 of 4" out of 3).
 */
import { taskScopeOf, type TaskRow, type TaskShift } from "../../studio-tasks/types";
import type { ShiftPhase } from "./now-context";

export type RingPhase = Exclude<ShiftPhase, "closed">;
export const RING_PHASES: RingPhase[] = ["opening", "mid", "closing"];
export const RING_LABEL: Record<RingPhase, string> = { opening: "Opening", mid: "Mid", closing: "Closing" };

/** A template's shift ("am" / "any" / "pm") on the ring it belongs to. */
export function ringOfShift(shift: TaskShift): RingPhase {
  return shift === "am" ? "opening" : shift === "pm" ? "closing" : "mid";
}

export interface Ring {
  phase: RingPhase;
  done: number;
  total: number;
  /** 0..1; a ring with nothing in it is drawn empty and never "closed". */
  fraction: number;
  closed: boolean;
}

export function shiftRings(rows: TaskRow[]): Ring[] {
  const tally: Record<RingPhase, { done: number; total: number }> = {
    opening: { done: 0, total: 0 },
    mid: { done: 0, total: 0 },
    closing: { done: 0, total: 0 },
  };
  for (const r of rows) {
    if (r.kind === "client" || taskScopeOf(r.template) === "personal") continue;
    const ring = tally[ringOfShift(r.shift)];
    ring.total += 1;
    if (r.status !== "open") ring.done += 1;
  }
  return RING_PHASES.map((phase) => {
    const { done, total } = tally[phase];
    return {
      phase,
      done,
      total,
      fraction: total ? done / total : 0,
      closed: total > 0 && done === total,
    };
  });
}

