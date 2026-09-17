/**
 * THE SHIFT RINGS' STORE — how many of today's three rings have closed.
 *
 * Round: Relay, Sep 2026. Opening, Mid and Closing each fill as that phase's
 * recurring work is ticked; a closed ring stays on the Now Bar as a dot for
 * the rest of the day, so the 4 p.m. trainer sees the morning was handled.
 * The Floor computes the rings (relay/ShiftRings) and publishes the count
 * here; the Now Bar, which lives in the shell, reads it. Same shape as the
 * Pulse store, for the same reason.
 */
import { useSyncExternalStore } from "react";
import type { TaskRow, TaskShift } from "../../studio-tasks/types";
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
    if (r.kind === "client") continue;
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

const counts = new Map<string, number>();
const listeners = new Set<() => void>();

export function publishClosedRings(studioId: string, closed: number): void {
  if (counts.get(studioId) === closed) return;
  counts.set(studioId, closed);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useClosedRings(studioId: string | null): number {
  return useSyncExternalStore(
    subscribe,
    () => (studioId ? (counts.get(studioId) ?? 0) : 0),
    () => 0,
  );
}
