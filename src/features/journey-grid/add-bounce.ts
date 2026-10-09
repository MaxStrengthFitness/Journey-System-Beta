/**
 * ONE TAP, ONE MACHINE (the open session round, Oct 9 2026; the review of
 * the FileMaker floor).
 *
 * The Today column's + (and the phone floor's Add) adds a machine to today's
 * list, and the row rises into today's numbered group. From the second add
 * on, the row above slides into the very slot just tapped, with its + where
 * the last one was, and the grid's `touch-action: pan-x pan-y` turns off the
 * double-tap zoom, so a bounce or a habitual double tap sends a second click
 * there: it added the machine above, which the trainer never picked, onto the
 * session's record.
 *
 * So an add of a DIFFERENT machine inside `FLOOR_ADD_BOUNCE_MS` of the last
 * add is the same tap landing twice, and is let go. Nothing waits: the first
 * add is issued at once, and the second tap is simply not an add. The same
 * machine twice is already a no-op (it is in today's list).
 */

/** A second add of another machine inside this window is the first tap landing again. */
export const FLOOR_ADD_BOUNCE_MS = 400;

export interface LastAdd {
  id: string;
  /** `Date.now()` when it was added. */
  at: number;
}

/** Whether this add is the last one's tap landing a second time (let it go). */
export function isBounceAdd(last: LastAdd | null, id: string, now: number): boolean {
  if (!last || last.id === id) return false;
  const since = now - last.at;
  return since >= 0 && since < FLOOR_ADD_BOUNCE_MS;
}
