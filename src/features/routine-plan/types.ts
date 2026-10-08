/**
 * A routine's plan (AJ, Oct 7 2026; docs/rounds/2026-10-07-first-session-and-routines.md).
 *
 * "This is what I think I'm going to make for their A routine. We're going to
 * start out with these three machines. If that goes well, we'll add in the
 * fourth, then the fifth, and the sixth, and maybe the seventh. ... having a
 * plan would allow teams to communicate a little bit better on allowing three
 * different trainers to train a new client. But still effectively follow one
 * plan."
 *
 * The routine's own `machineIds` stays what the client does NOW, so every
 * reader that exists keeps working; the plan is the rest of the road, kept on
 * the routine's document (`routines/{id}.plan`) with its changes beside it
 * (`routines/{id}/planChanges/{changeId}`). Machine ids here are whatever the
 * routine stores (the studio's floor ids); the Academy's rules read them
 * through `canonicalMachineId`.
 */

/** Why the routine exists, as the builder holds it (the words are the trainer's). */
export type PlanPurposeKind =
  /** The routine a client is built on: whole body, the Big 5. */
  | "core"
  /** "Variety to satisfy/motivate the client" (AB routines), or a client who wants more machines. */
  | "variety"
  /** A region hit twice a week while its heaviest work is split over two days. */
  | "recovery"
  /** A weak area the routine sets out to work (see `focus`). */
  | "focus"
  /** A condition the routine works around (a low back, a knee). */
  | "condition";

export interface PlanSwap {
  /** The A machine this B machine takes the place of. */
  replaces: string;
  with: string;
}

export interface RoutinePlan {
  /** The routine's idea in the trainer's words ("The core: whole body, Big 5"). */
  purpose: string;
  purposeKinds?: PlanPurposeKind[];
  /** Every machine the routine is meant to have, in order. */
  intended: string[];
  /**
   * "A routine is being built" (AJ's toggle, Oct 7 2026). While it is on, the
   * Wrap-up adds today's machines to the routine by default; once a trainer
   * turns it off, the routine changes only on purpose.
   */
  building: boolean;
  /** Weak areas the routine sets out to work, as muscle ids. */
  focus?: string[];
  /**
   * B only: B planned whole, as swaps against A, in the order they come in.
   * B starts as a copy of A with the first swap made.
   */
  swaps?: PlanSwap[];
  /** The Academy template the plan started from, when it did. */
  templateId?: string;
  madeByUid: string;
  madeByName?: string;
}

export type PlanChangeKind = "start" | "add" | "remove" | "swap" | "reorder" | "purpose" | "building" | "focus";

/**
 * One change to a plan, appended and never edited. "It's nice to be able to
 * communicate like, hey, I'm changing this plan because of this reason" — the
 * reason is asked, never required.
 */
export interface PlanChange {
  kind: PlanChangeKind;
  /** The machines the change is about: added, removed, `[from, to]` for a swap, the new order for a reorder. */
  machineIds: string[];
  reason?: string;
  /** For "purpose": the new words. For "building": "on" or "off". For "focus": the muscle ids, comma-separated. */
  value?: string;
  byUid: string;
  byName?: string;
}
