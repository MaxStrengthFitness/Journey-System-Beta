/**
 * The only writer of a routine's plan (AJ's OK for the structure, Oct 7 2026:
 * "go for what you think is best").
 *
 * - `routines/{id}.plan`: the plan, one optional field on the routine's own
 *   document. A routine without one works exactly as before, and every reader
 *   keeps reading `machineIds`.
 * - `routines/{id}/planChanges/{changeId}`: each change, appended in the same
 *   batch, signed by the signed-in person with the server's time, never
 *   edited or removed (firestore.rules).
 *
 * A tap on the floor never waits on this: the caller issues the batch and
 * moves on (CLAUDE.md, "a tap on the floor never awaits a write"). The routine's
 * own `machineIds`, when a change moves it, goes in the same batch, so the
 * plan and the routine can't disagree after a refusal.
 *
 * Four writers:
 * - `startPlan`: a plan's first write, Keep this lineup, Save Routine A or
 *   Add a plan. It makes Routine A when the client has none, or puts the
 *   plan on the routine they have, with the plan's first change.
 *   `addStartPlanToBatch` is the same writes added to Start's own batch, for
 *   a client starting out at the studio whose plan is kept by pressing
 *   Start on the briefing (the design round, §4.5).
 * - `savePlanChange`: every change after that.
 * - `saveRoutineEdit`: the Edit routine drawer's save on a routine with a
 *   plan, the routine, its adjustment and the plan's changes together.
 * - `saveNextTime`: the Wrap-up's Next time, the ticked machines into the
 *   routine once on the way out (through `savePlanChange` when the routine
 *   has a plan; Routine A made with no plan when there is no routine).
 *
 * The consult is not Routine A (AJ, Oct 8 2026: "this also counts with the
 * consult visit, sometimes the consult machines will not be the same as their
 * a routine"). For a client starting out at the studio (Keep this lineup,
 * Start's batch) the caller passes no machines: Routine A is made EMPTY and
 * the plan carries the first visit's machines as `plan.dayOne`. Nothing here
 * writes day one into Routine A by itself; the Wrap-up's ticks start it
 * (`routineAfterWrapUp`), or a trainer editing Routine A on purpose.
 */
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import type { NextTimeWrite } from "./next-time";
import type { PlanChange, RoutinePlan } from "./types";

export const PLAN_CHANGES = "planChanges";

export interface StartPlanInput {
  /** The routine the plan goes on, or null to make it (the client has no routine of that name yet). */
  routineId: string | null;
  clientId: string;
  /** The client's home studio, as every routine carries it. */
  studioId: string;
  name: "Routine A" | "Routine B";
  /**
   * What the client does now: the routine as it stands (Save Routine A, Add
   * a plan), or `[]` for a client starting out at the studio, whose first
   * visit's machines ride on the plan (`plan.dayOne`), never here.
   */
  machineIds: string[];
  /** The plan, with `dayOne` when it came from a starting routine. */
  plan: RoutinePlan;
  /** The plan's first change, usually "start". */
  change: PlanChange;
}

export interface StartedPlan {
  /** The routine's id, named on this iPad before anything is sent, so a screen can draw it at once. */
  routineId: string;
  /** The batch's commit, for whoever wants to toast a refusal; never awaited by a tap. */
  commit: Promise<void>;
}

/**
 * A plan's first write, in ONE batch: the routine (made here when
 * `routineId` is null, with the shape every routine create in the app
 * writes; otherwise its `machineIds` and `plan` set on the routine it has)
 * and the plan's first change beside it, signed and timed by the server.
 * Nothing is written before the trainer keeps the lineup, and nothing waits
 * on this: the id is made on this iPad, so the caller draws Routine A at
 * once and the commit settles behind it.
 *
 * It writes exactly the `machineIds` it is given. For a client starting out
 * that is `[]`: Routine A is made empty, with day one on the plan, because
 * the consult is not Routine A.
 */
export function startPlan(db: Firestore, input: StartPlanInput): StartedPlan {
  const batch = writeBatch(db);
  const { routineId } = addStartPlanToBatch(db, batch, input);
  return { routineId, commit: batch.commit() };
}

/**
 * A plan's first write, added to a batch someone else commits: Start's own
 * batch (the design round, §4.5: "the tracker writes the plan (with day
 * one) on an EMPTY Routine A and the `start` change in the Start batch,
 * never awaited"), so the session, the routine it names and the plan land
 * together or not at all. The same writes as `startPlan`; the caller
 * commits, and never awaits it on a tap. Returns the routine's id, made on
 * this iPad.
 */
export function addStartPlanToBatch(db: Firestore, batch: WriteBatch, input: StartPlanInput): { routineId: string } {
  const routineRef = input.routineId ? doc(db, "routines", input.routineId) : doc(collection(db, "routines"));
  if (input.routineId) {
    batch.update(routineRef, withoutUndefined({ machineIds: input.machineIds, plan: input.plan }));
  } else {
    batch.set(
      routineRef,
      withoutUndefined({
        clientId: input.clientId,
        name: input.name,
        machineIds: input.machineIds,
        plan: input.plan,
        createdAt: serverTimestamp(),
        studioId: input.studioId,
      }),
    );
  }
  const changeRef = doc(collection(db, "routines", routineRef.id, PLAN_CHANGES));
  batch.set(changeRef, withoutUndefined({ ...input.change, at: serverTimestamp() }));
  return { routineId: routineRef.id };
}

/**
 * Writes the plan, its change, and (when given) the routine's machines in one
 * batch. Returns the commit for whoever wants to toast a refusal; never await
 * it on a tap.
 *
 * `also` is the rest of one tap's changes, appended in the same batch: a
 * Re-plan that marks machines the client can't do is a "replan" and a
 * "cantdo" for each, and they land together or not at all.
 */
export function savePlanChange(
  db: Firestore,
  routineId: string,
  input: { plan: RoutinePlan; change: PlanChange; machineIds?: string[]; also?: readonly PlanChange[] },
): Promise<void> {
  const batch = writeBatch(db);
  const routineRef = doc(db, "routines", routineId);
  batch.update(
    routineRef,
    withoutUndefined({
      plan: input.plan,
      ...(input.machineIds ? { machineIds: input.machineIds } : null),
    }),
  );
  for (const change of [input.change, ...(input.also ?? [])]) {
    const changeRef = doc(collection(db, "routines", routineId, PLAN_CHANGES));
    batch.set(changeRef, withoutUndefined({ ...change, at: serverTimestamp() }));
  }
  return batch.commit();
}

/**
 * A save in the Edit routine drawer on a routine with a plan (the design
 * round, §4.3: "The drawer keeps the plan"), in ONE batch: the drawer's own
 * fields on the routine (its machines, a template's provenance, `updatedAt`)
 * with the plan beside them in one update, the drawer's `routineAdjustments`
 * record, and the plan's changes (`drawer-sync.ts`'s `planChangeFromEdit`,
 * signed). They land together or not at all, so the plan and the routine
 * never drift. The drawer awaits it (a drawer save is not a tap on the
 * floor) and says a refusal.
 */
export function saveRoutineEdit(
  db: Firestore,
  routineId: string,
  input: {
    /** The drawer's own fields on the routine. */
    routine: Record<string, unknown>;
    plan: RoutinePlan;
    changes: readonly PlanChange[];
    /** The drawer's adjustment record, as it has always written one. */
    adjustment: Record<string, unknown>;
  },
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "routines", routineId), withoutUndefined({ ...input.routine, plan: input.plan }));
  batch.set(doc(collection(db, "routineAdjustments")), withoutUndefined(input.adjustment));
  for (const change of input.changes) {
    const changeRef = doc(collection(db, "routines", routineId, PLAN_CHANGES));
    batch.set(changeRef, withoutUndefined({ ...change, at: serverTimestamp() }));
  }
  return batch.commit();
}

/**
 * The Wrap-up's Next time (the design round, §4.7): the ticked machines
 * into the routine, ONCE, on the way out, in one batch, never awaited by a
 * tap (the caller toasts a refusal). The one write a session makes to a
 * routine's machines, and only from the Wrap-up's ticks:
 * - a routine with a plan: `savePlanChange` (the plan, its change(s) and
 *   the routine's machines together);
 * - a routine with no plan: its `machineIds` and `updatedAt`, never a
 *   plan, so "no plan" stays true (the routines rule allows a trainer's
 *   update), with the `routineAdjustments` record every other change to a
 *   plan-less routine writes (the Edit routine drawer's shape, `changeType`
 *   "machines"), so Programming's "changed … by" names this change;
 * - no routine (a session built on the fly, for a client with no Routine
 *   A): Routine A made with the ticked machines and NO plan, in the shape
 *   every routine create in the app writes, its id made on this iPad, with
 *   its "created" record beside it.
 * `owner` is the client the routine belongs to and their home studio, as
 * every routine carries it, and the trainer the record names (the
 * trainer's record id, as the drawer writes it: Programming reads the
 * trainer list by it).
 */
export function saveNextTime(
  db: Firestore,
  write: NextTimeWrite,
  owner: { clientId: string; studioId: string; trainerId: string },
): Promise<void> {
  if (write.kind === "plan") {
    return savePlanChange(db, write.routineId, {
      plan: write.plan,
      change: write.change,
      machineIds: write.machineIds,
      ...(write.also ? { also: write.also } : null),
    });
  }
  const batch = writeBatch(db);
  const adjustment = (routineId: string, previousMachineIds: string[], changeType: "machines" | "created") =>
    withoutUndefined({
      clientId: owner.clientId,
      routineId,
      previousMachineIds,
      newMachineIds: write.machineIds,
      trainerId: owner.trainerId || "unknown",
      studioId: owner.studioId,
      changeType,
      createdAt: serverTimestamp(),
    });
  if (write.kind === "routine") {
    batch.update(doc(db, "routines", write.routineId), { machineIds: write.machineIds, updatedAt: serverTimestamp() });
    batch.set(doc(collection(db, "routineAdjustments")), adjustment(write.routineId, write.previousMachineIds, "machines"));
  } else {
    const routineRef = doc(collection(db, "routines"));
    batch.set(
      routineRef,
      withoutUndefined({
        clientId: owner.clientId,
        name: write.name,
        machineIds: write.machineIds,
        createdAt: serverTimestamp(),
        studioId: owner.studioId,
      }),
    );
    batch.set(doc(collection(db, "routineAdjustments")), adjustment(routineRef.id, [], "created"));
  }
  return batch.commit();
}

export interface StoredPlanChange extends PlanChange {
  id: string;
  /** Milliseconds, or null while the server's time is pending. */
  atMs: number | null;
}

/**
 * A routine's changes, newest first: one read of the routine's own small
 * list when someone opens it, no query and so no index (every change is
 * read; a plan gathers a few a month).
 */
export async function readPlanChanges(db: Firestore, routineId: string): Promise<StoredPlanChange[]> {
  const snap = await getDocs(collection(db, "routines", routineId, PLAN_CHANGES));
  const out: StoredPlanChange[] = snap.docs.map((d) => {
    const data = d.data() as PlanChange & { at?: { toMillis?: () => number } };
    const { at, ...rest } = data;
    return { ...rest, id: d.id, atMs: typeof at?.toMillis === "function" ? at.toMillis() : null };
  });
  return out.sort((a, b) => (b.atMs ?? Number.MAX_SAFE_INTEGER) - (a.atMs ?? Number.MAX_SAFE_INTEGER));
}
