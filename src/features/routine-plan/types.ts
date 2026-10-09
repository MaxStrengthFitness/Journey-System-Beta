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
import type { StartingColumn } from "./starting-weights";

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
   * The first visit's machines: the starting routine's day one on this floor
   * (floor ids), in the order the plan keeps them, which was checked against
   * the Academy's sequencing rules when the plan was made. Routine A's plan
   * only; absent on a plan put on a routine the client already has.
   *
   * Kept on the plan, never in Routine A, because the consult is not Routine
   * A (AJ, Oct 8 2026: "this also counts with the consult visit, sometimes
   * the consult machines will not be the same as their a routine"). A plan's
   * first write leaves Routine A empty; while Routine A has nothing, a
   * session runs day one by default (`runsDayOne`, `todayFor`, plan.ts), and
   * the Wrap-up asks which of today's machines start Routine A, every one
   * unticked (`nextTimeRows`). Nothing puts day one into Routine A by itself.
   *
   * Day one follows the road: a machine taken out of the plan, swapped,
   * dropped by a new start or a re-plan, or marked can't do leaves day one
   * the same way, so a visit while Routine A is empty never runs a machine
   * the plan has let go; a reorder gives day one the order it gives day
   * one's machines, and a reopened machine goes back where it stood
   * (`CantDo.dayOneAt`). What a visit actually ran is its session's record,
   * not this list.
   */
  dayOne?: string[];
  /**
   * "A routine is being built" (AJ's toggle, Oct 7 2026). While it is on and
   * Routine A has machines, the Wrap-up adds today's machines to the routine
   * by default; once a trainer turns it off, the routine changes only on
   * purpose. While Routine A is empty (the consult), every machine is
   * offered unticked either way, because the consult is not Routine A
   * (`nextTimeRows`).
   */
  building: boolean;
  /** Weak areas the routine sets out to work, as muscle ids. */
  focus?: string[];
  /**
   * B only: B planned whole, as swaps against A, in the order they come in.
   * B starts as a copy of A with the first swap made.
   */
  swaps?: PlanSwap[];
  /**
   * The starting routine the plan started from, when it did: a routine
   * preset's id (`academy-low-back`, or one head office wrote), or, on a plan
   * made before starting routines existed, the Academy template's id. Read
   * the Academy template through `academyTemplateOf` (starting-routines.ts),
   * which knows both.
   */
  templateId?: string;
  madeByUid: string;
  madeByName?: string;
  /** The studio's day the plan was made, `YYYY-MM-DD`, so "Started Oct 7 by Sam" needs no second read. */
  madeAt?: string;
  /**
   * What the client can't do, kept on Routine A's plan only; B and every
   * screen read A's (AJ, Oct 8 2026, "2a": "Can't-do lives on the client's
   * plan, read by A and B"). An entry stays after its day has passed, so the
   * screens can say "Back on {day}"; `cantDoActive` is the one answer to
   * whether it still holds.
   */
  cantDo?: CantDo[];
  /**
   * Which of the Academy's weight sheet columns the trainer picked for this
   * client, once ("3a"), kept on Routine A's plan. "none" is the trainer's
   * Don't show ranges. Absent until someone picks: the app never picks one,
   * and never from the client's gender.
   */
  startingColumn?: StartingColumn | "none";
}

/**
 * A machine the client can't do (AJ, Oct 8 2026: "some clients just wont be
 * able to do certain machines ... we could have a client who is getting
 * surgery"). The reason is asked, never required.
 */
export interface CantDo {
  /** The floor id, as the routine stores it. */
  machineId: string;
  /** One of `CANT_DO_REASONS` (cant-do.ts), or absent. */
  reason?: string;
  /**
   * "cleared" (until someone reopens it), "always", or the last studio's day
   * it holds, `YYYY-MM-DD`: once that day has passed the mark has ended by
   * itself ("Back on" the day after), and nothing is written when it does.
   */
  until: "cleared" | "always" | string;
  /** The studio's day it was marked, `YYYY-MM-DD`. */
  day: string;
  /** The signed-in person's Auth uid. */
  byUid: string;
  byName?: string;
  /** What took its place in the plan when it was marked; empty when nothing on this floor fits. */
  replacedBy?: string[];
  /**
   * Whether the machine was on the plan's road (`intended`) when it was
   * marked, so reopening an extra from today's routine never adds it to the
   * road (`reopenCantDo`). Absent is read as on the road.
   */
  onRoad?: boolean;
  /**
   * Where the machine stood on the plan's day one when it was marked (its
   * index), so reopening puts it back there when nothing stands in for it
   * on day one (`reopenCantDo`). Absent when it wasn't on day one, or the
   * plan has none.
   */
  dayOneAt?: number;
}

/**
 * What each kind of change carries in `machineIds` and `value`:
 * - "start": `machineIds` the plan's machines (its road, never Routine A's,
 *   which a plan for a client starting out leaves empty; day one keeps only
 *   what is on it); `value` the starting routine's name when the plan came
 *   from one ("Low back issues"), so the Changes list can say where it
 *   started without reading the preset.
 * - "add": the machines added (never to day one). "remove": the machines
 *   taken out (of day one too).
 * - "swap": `[from, to]` (on day one too). "reorder": the new order of the
 *   road, as the screen draws it; day one takes the order it gives day one's
 *   machines.
 * - "purpose": `value` the new words. "building": `value` "on" or "off".
 * - "focus": `value` the muscle ids, comma-separated.
 * - "cantdo": `[machineId]`; `value` "reason · until" (`cantDoValue`), the
 *   until alone when no reason was given. The entry itself (who, the day,
 *   what stood in) rides beside the change (`applyPlanChange`'s third
 *   argument, `planWithCantDo`).
 * - "cando": `[machineId]`, the machine reopened.
 * - "replan": `machineIds` the new intended road (day one keeps only what
 *   is still on it); `value` what changed (one of `REPLAN_REASONS`, or the
 *   trainer's words).
 * - "column": `value` the Academy sheet column picked, or "none".
 */
export type PlanChangeKind =
  | "start"
  | "add"
  | "remove"
  | "swap"
  | "reorder"
  | "purpose"
  | "building"
  | "focus"
  | "cantdo"
  | "cando"
  | "replan"
  | "column";

/**
 * One change to a plan, appended and never edited. "It's nice to be able to
 * communicate like, hey, I'm changing this plan because of this reason" — the
 * reason is asked, never required.
 */
export interface PlanChange {
  kind: PlanChangeKind;
  /** The machines the change is about, by kind (see `PlanChangeKind`). */
  machineIds: string[];
  reason?: string;
  /** The change's words, by kind (see `PlanChangeKind`). */
  value?: string;
  byUid: string;
  byName?: string;
}
