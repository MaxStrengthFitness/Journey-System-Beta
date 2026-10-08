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
 * Two writers:
 * - `startPlan`: a plan's first write, Keep this lineup, Save Routine A, Add
 *   a plan, or Start's batch for a client starting out at the studio. It
 *   makes Routine A when the client has none, or puts the plan on the
 *   routine they have, with the plan's first change.
 * - `savePlanChange`: every change after that.
 */
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import type { PlanChange, RoutinePlan } from "./types";

export const PLAN_CHANGES = "planChanges";

export interface StartPlanInput {
  /** The routine the plan goes on, or null to make it (the client has no routine of that name yet). */
  routineId: string | null;
  clientId: string;
  /** The client's home studio, as every routine carries it. */
  studioId: string;
  name: "Routine A" | "Routine B";
  /** What the client does now: day one, or the routine as it stands. */
  machineIds: string[];
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
 */
export function startPlan(db: Firestore, input: StartPlanInput): StartedPlan {
  const batch = writeBatch(db);
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
  return { routineId: routineRef.id, commit: batch.commit() };
}

/**
 * Writes the plan, its change, and (when given) the routine's machines in one
 * batch. Returns the commit for whoever wants to toast a refusal; never await
 * it on a tap.
 */
export function savePlanChange(
  db: Firestore,
  routineId: string,
  input: { plan: RoutinePlan; change: PlanChange; machineIds?: string[] },
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
  const changeRef = doc(collection(db, "routines", routineId, PLAN_CHANGES));
  batch.set(changeRef, withoutUndefined({ ...input.change, at: serverTimestamp() }));
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
