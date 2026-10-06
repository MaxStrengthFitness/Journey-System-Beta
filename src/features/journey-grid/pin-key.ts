/**
 * WHEN THE GRID MUST PIN ITSELF TO THE NEWEST COLUMN AGAIN (the iPad round,
 * Oct 6 2026).
 *
 * The grid keeps the newest session on the right by re-pinning in a layout
 * effect, which reads the scroller's width and so makes the browser lay the
 * whole grid out there and then. It did that on every new `sessions` and
 * `sections` array, and during a session those are new arrays on every set
 * (the session's own document changes with each set, so the sessions
 * listener answers again), although not one past column or cell changed.
 * The perf lab saw 84 to 273 ms of that forced layout per scenario on an
 * older iPad.
 *
 * These keys say what the pin actually depends on: which columns there are
 * (and what their heads say), and what each past cell says, because a cell's
 * words set its column's width (session tracks are `minmax(col, 1fr)` in a
 * max-content grid). Same key, same layout: the pin has nothing to do, and
 * the observers on the scroller and the timeline still catch any resize.
 * The sets of a client arriving after her sessions change the key, so that
 * re-pin, the one the observers missed on the live app (Sep 26 2026), still
 * happens in the same commit.
 */

import type { GridSection } from "./JourneyGrid";
import type { JourneySession } from "./types";

/** The columns, in order, with what their heads show. */
export function columnsKey(sessions: readonly JourneySession[]): string {
  let key = "";
  for (const s of sessions) {
    key += `${s.id}~${s.date ?? ""}~${s.sessionNumber ?? ""}~${s.trainerInitials ?? ""}|`;
  }
  return key;
}

/** The rows that are drawn, and what each past cell says. */
export function cellsKey(sections: readonly GridSection[]): string {
  let key = "";
  for (const section of sections) {
    key += `#${section.id}:${section.collapsed ? 1 : 0}:${section.bare ? 1 : 0}:${section.label}`;
    if (section.collapsed) continue;
    for (const row of section.rows) {
      key += `/${row.machine.id}`;
      for (const id in row.sets) {
        const s = row.sets[id];
        key += `,${id}=${s.outcome}${s.weight}x${s.reps ?? ""}${s.seconds ?? ""}${s.side ?? ""}${s.skipReason ?? ""}${s.bloodFlow ? "b" : ""}${s.quality}`;
      }
    }
  }
  return key;
}
