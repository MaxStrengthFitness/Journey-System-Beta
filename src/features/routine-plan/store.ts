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
 *
 * B, molded in (Round 2, Oct 8 2026, item 6):
 * - `startRoutineB`: Plan B kept, in ONE batch: Routine B (made, or the
 *   empty one the client has, updated) as A with one machine different, its
 *   plan and its `start` change, and the client's `isRoutineBActive` set
 *   true (a single-field update, as the B switch has always written it).
 *   Turning B on is the whole point of that tap, so it rides in the batch.
 * - B FOLLOWS A: every writer that moves Routine A's machines takes a
 *   `follow` (`b-routine.ts`'s `bFollowOf`: B's unswapped places follow A,
 *   B's own swaps stay) and writes Routine B in the SAME batch
 *   (`withBFollowing`), so A and B can't disagree after a refusal.
 * - B PLANNED AHEAD (item 8: the studio setting `newClientsStart`, "A and B
 *   together"): a starting plan kept (Keep this lineup, Start's batch)
 *   takes B's plan with it, Routine B with NO machines
 *   (`addPlannedBToBatch`; B off), and the Wrap-up that starts Routine A
 *   starts B in its own batch (`withBStarting`: A with one machine
 *   different, and its `start` change), B switched on once that batch lands.
 *
 * THE CLIENT'S DOCUMENT IS NEVER IN SOMEONE ELSE'S BATCH (the whole-branch
 * review, Oct 9 2026). The clients rules check the whole document on every
 * update (a last name, `remainingSessions >= 0`) and who may write it (a
 * trainer of the client's studio), so a client a cross-train trainer runs,
 * or one Mindbody stored with no last name, refuses ANY client update. A
 * client field in Start's batch would take the session down with it
 * (start-plan.ts: "one refused client field must never take the session
 * down"), and in the Wrap-up's batch it would throw away the ticks that
 * start Routine A. So `isRoutineBActive` is its own write
 * (`setRoutineBActive`): turned OFF beside a planned B (`addPlannedBToBatch`
 * says when, and the caller issues it), and turned ON after a Wrap-up's
 * batch that starts B has landed (never before: a B switched on whose
 * machines were refused would alternate the client into a session of
 * nothing, the critic's #22). Plan B's Start B keeps it in its batch: B on
 * is the whole point of that tap.
 *
 * A CHANGE NAMES AT MOST 30 MACHINES (`PLAN_CHANGE_MACHINES_MAX`, the
 * rules' `planChangeOk`): every change written here is held to it
 * (`changeDoc`), so a road longer than that can't refuse its batch.
 */
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { Routine } from "../../types";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import { plannedBTarget, type BFollow } from "./b-routine";
import type { NextTimeWrite } from "./next-time";
import { PLAN_CHANGE_MACHINES_MAX, type PlanChange, type RoutinePlan } from "./types";

/** A change as it is written: the server's time, nothing undefined, and no more machines than the rules take. */
function changeDoc(change: PlanChange): Record<string, unknown> {
  return withoutUndefined({ ...change, machineIds: change.machineIds.slice(0, PLAN_CHANGE_MACHINES_MAX), at: serverTimestamp() });
}

/**
 * The client's `isRoutineBActive`, the one field the B switch has always
 * written, as its OWN write, never in another batch (the header). Issued
 * and never awaited by a tap; a refusal is said in the console, and the
 * switch on Programming shows what holds.
 */
export function setRoutineBActive(db: Firestore, clientId: string, on: boolean): Promise<void> {
  const write = updateDoc(doc(db, "clients", clientId), { isRoutineBActive: on });
  write.catch((error) => console.error(`[routine-plan] Routine B was not switched ${on ? "on" : "off"}`, error));
  return write;
}

/**
 * Routine B's part of a write that moved Routine A's machines: B's machines
 * and its plan's road, as `bFollowOf` worked them out, in the caller's
 * batch, and its swaps when one followed its place in A (A replaced the
 * machine a swap was for). The plan's road and swaps are written by their
 * own field paths, so nothing else on B's plan is touched. Nothing is
 * written without a `follow`. A B planned with the starting lineup and not
 * started follows A's road with its plan alone (`plannedBFollowOf`, no
 * `machineIds`): Routine B's machines are never written then.
 */
export function withBFollowing(batch: WriteBatch, db: Firestore, follow: BFollow | null | undefined): void {
  if (!follow) return;
  batch.update(doc(db, "routines", follow.routineId), {
    ...(follow.machineIds ? { machineIds: [...follow.machineIds] } : null),
    "plan.intended": [...follow.intended],
    ...(follow.swaps ? { "plan.swaps": follow.swaps.map((s) => ({ replaces: s.replaces, with: s.with })) } : null),
  });
}

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
  /** Routine B's id, when a planned B went in the same batch (`addPlannedBToBatch`). */
  bRoutineId?: string;
}

/**
 * B planned with a starting lineup (the studio setting `newClientsStart`, "A
 * and B together"; b-routine.ts `plannedBOf`): Routine B with its plan and
 * NO machines, because the consult is not Routine A and B is a copy of A.
 * The Wrap-up that starts Routine A starts it (`withBStarting`).
 */
export interface PlannedBWrite {
  /** The client's empty, plan-less Routine B, or null to make it (`plannedBTarget`). */
  routineId: string | null;
  plan: RoutinePlan;
  /** Its first change, signed: "start" with "B planned". */
  change: PlanChange;
}

/**
 * A planned B, added to a starting plan's batch (Keep this lineup, or
 * Start's own batch): Routine B made, or the empty one updated, with its
 * plan and no machines, and its first change. The client's
 * `isRoutineBActive` is never set on: a B with nothing in it is never
 * alternated into (the critic's #22); the Wrap-up that starts B turns it
 * on. Over the client's own empty Routine B (one turned on before Round 2)
 * B must be turned OFF, or the next visit would alternate into a B of
 * nothing (the review of item 8): `turnsBOff` says so, and the caller
 * issues it apart from the batch (`setRoutineBActive`, the header). Off
 * over an empty B is harmless whichever of the two lands first.
 */
export function addPlannedBToBatch(
  db: Firestore,
  batch: WriteBatch,
  input: { clientId: string; studioId: string; b: PlannedBWrite },
): { routineId: string; turnsBOff: boolean } {
  const { routineId } = addStartPlanToBatch(db, batch, {
    routineId: input.b.routineId,
    clientId: input.clientId,
    studioId: input.studioId,
    name: "Routine B",
    machineIds: [],
    plan: input.b.plan,
    change: input.b.change,
  });
  return { routineId, turnsBOff: !!input.b.routineId };
}

/**
 * Start's own batch for a client starting out (the briefing handed up a
 * starting plan with B planned beside it, `StartPlanAtStart.b`): the planned
 * B, where `plannedBTarget` says it may go over the client's routines as
 * the tracker holds them (an empty, plan-less Routine B, or a new one),
 * never over a Routine B of the client's own. Returns Routine B's id and
 * whether B must be switched off (the caller's own write, never in Start's
 * batch: `setRoutineBActive`), or null when nothing was added.
 */
export function addPlannedBAtStart(
  db: Firestore,
  batch: WriteBatch,
  input: {
    routines: readonly Pick<Routine, "id" | "name" | "machineIds" | "plan">[];
    clientId: string;
    studioId: string;
    b: { plan: RoutinePlan; change: PlanChange } | null;
  },
): { routineId: string; turnsBOff: boolean } | null {
  if (!input.b) return null;
  const target = plannedBTarget(input.routines);
  if (!target) return null;
  return addPlannedBToBatch(db, batch, {
    clientId: input.clientId,
    studioId: input.studioId,
    b: { routineId: target.routineId, plan: input.b.plan, change: input.b.change },
  });
}

/**
 * A planned B started by the Wrap-up that starts Routine A (b-routine.ts
 * `plannedBStart`): Routine B as A with one machine different, its plan and
 * its `start` change; then the client's `isRoutineBActive`, the one field
 * the B switch has always written, once that batch has landed
 * (`switchBOnAfter`).
 */
export interface BStartWrite {
  routineId: string;
  clientId: string;
  machineIds: string[];
  plan: RoutinePlan;
  change: PlanChange;
}

/** A planned B's start, in the caller's batch: Routine B and its change. Nothing is written without one. */
export function withBStarting(batch: WriteBatch, db: Firestore, start: BStartWrite | null | undefined): void {
  if (!start) return;
  batch.update(doc(db, "routines", start.routineId), withoutUndefined({ machineIds: [...start.machineIds], plan: start.plan }));
  batch.set(doc(collection(db, "routines", start.routineId, PLAN_CHANGES)), changeDoc(start.change));
}

/**
 * B switched on once the batch that started it has landed, as its own write
 * (the header): a batch refused leaves B off, so the client is never
 * alternated into a Routine B whose machines weren't saved, and a refused
 * client field never takes Routine A's ticks down with it. Offline it
 * follows when the batch reaches the database.
 */
function switchBOnAfter(db: Firestore, commit: Promise<void>, start: BStartWrite | null | undefined): void {
  if (!start) return;
  commit.then(
    () => setRoutineBActive(db, start.clientId, true).catch(() => {}),
    () => {},
  );
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
 *
 * `b`, at a studio that starts new clients on A and B together, is B
 * planned beside it (`addPlannedBToBatch`), in the SAME batch: Routine B
 * with its plan and no machines.
 */
export function startPlan(db: Firestore, input: StartPlanInput, b?: PlannedBWrite | null): StartedPlan {
  const batch = writeBatch(db);
  const { routineId } = addStartPlanToBatch(db, batch, input);
  const planned = b ? addPlannedBToBatch(db, batch, { clientId: input.clientId, studioId: input.studioId, b }) : null;
  const commit = batch.commit();
  // B off over the client's own empty Routine B: its own write, never in this batch (the header).
  if (planned?.turnsBOff) setRoutineBActive(db, input.clientId, false).catch(() => {});
  return { routineId, commit, ...(planned ? { bRoutineId: planned.routineId } : null) };
}

/**
 * A plan's first write, added to a batch someone else commits: Start's own
 * batch (the design round, §4.5: "the tracker writes the plan (with day
 * one) on an EMPTY Routine A and the `start` change in the Start batch,
 * never awaited"), so the session, the routine it names and the plan land
 * together or not at all. The same writes as `startPlan`; the caller
 * commits, and never awaits it on a tap. Returns the routine's id, made on
 * this iPad.
 *
 * On a routine the client has, an EMPTY `machineIds` (a client starting
 * out: Keep this lineup, Start's batch, a planned B) is left out of the
 * update, so only the plan goes on: the routine was empty when it was read,
 * and a machine another iPad put in since (a Wrap-up, the drawer) is never
 * emptied by a plan's first write (the whole-branch review, Oct 9 2026).
 * Machines given on purpose (Save Routine A, Add a plan, Start B) are
 * written as given.
 */
export function addStartPlanToBatch(db: Firestore, batch: WriteBatch, input: StartPlanInput): { routineId: string } {
  const routineRef = input.routineId ? doc(db, "routines", input.routineId) : doc(collection(db, "routines"));
  if (input.routineId) {
    batch.update(
      routineRef,
      withoutUndefined({ ...(input.machineIds.length > 0 ? { machineIds: input.machineIds } : null), plan: input.plan }),
    );
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
  batch.set(changeRef, changeDoc(input.change));
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
  input: {
    plan: RoutinePlan;
    change: PlanChange;
    machineIds?: string[];
    also?: readonly PlanChange[];
    /** Routine B, when this moves Routine A's machines and B follows A (`bFollowOf`). */
    follow?: BFollow | null;
    /** A planned B started with Routine A (the Wrap-up, `plannedBStart`), in the same batch. */
    startB?: BStartWrite | null;
  },
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
    batch.set(changeRef, changeDoc(change));
  }
  withBFollowing(batch, db, input.follow);
  withBStarting(batch, db, input.startB);
  const commit = batch.commit();
  switchBOnAfter(db, commit, input.startB);
  return commit;
}

export interface StartBInput {
  /** The client's Routine B when there is one (empty, or the Routine B turned on before Round 2), or null to make it. */
  routineId: string | null;
  clientId: string;
  /** The client's home studio, as every routine carries it. */
  studioId: string;
  /** Routine B today: A with the first swap made (`startBPlan`). */
  machineIds: string[];
  /** B's plan (`startBPlan`). */
  plan: RoutinePlan;
  /** The plan's first change, signed: "start". */
  change: PlanChange;
}

/**
 * Plan B kept ("Start B"), in ONE batch, never awaited by a tap: Routine B
 * as A with one machine different, made here when the client has none
 * (the id made on this iPad, so the screen draws it at once) or set on the
 * Routine B they have, its plan and its `start` change, and the client's
 * `isRoutineBActive` set true, the one field the B switch has always
 * written. Turning B on no longer makes an EMPTY Routine B (the critic's
 * #22): an empty B with B on alternated the client into a session of
 * nothing.
 */
export function startRoutineB(db: Firestore, input: StartBInput): StartedPlan {
  const batch = writeBatch(db);
  const { routineId } = addStartPlanToBatch(db, batch, { ...input, name: "Routine B" });
  batch.update(doc(db, "clients", input.clientId), { isRoutineBActive: true });
  return { routineId, commit: batch.commit() };
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
    /**
     * The routine's plan with the drawer's changes in it, or absent for a
     * routine with no plan (a Routine A with no plan whose Routine B
     * follows it: the save still lands with B's, in one batch).
     */
    plan?: RoutinePlan;
    changes?: readonly PlanChange[];
    /** The drawer's adjustment record, as it has always written one. */
    adjustment: Record<string, unknown>;
    /** Routine B, when this is Routine A and B follows A (`bFollowOf`). */
    follow?: BFollow | null;
  },
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(
    doc(db, "routines", routineId),
    withoutUndefined({ ...input.routine, ...(input.plan ? { plan: input.plan } : null) }),
  );
  batch.set(doc(collection(db, "routineAdjustments")), withoutUndefined(input.adjustment));
  for (const change of input.plan ? (input.changes ?? []) : []) {
    const changeRef = doc(collection(db, "routines", routineId, PLAN_CHANGES));
    batch.set(changeRef, changeDoc(change));
  }
  withBFollowing(batch, db, input.follow);
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
  /** Routine B, when the ticks went into Routine A and B follows A (`bFollowOf`); in the same batch. */
  follow?: BFollow | null,
  /**
   * A planned B, when the ticks START Routine A (the studio's "A and B
   * together", b-routine.ts `plannedBStart`): Routine B as A with one
   * machine different, in the same batch, and B turned on once it lands.
   */
  startB?: BStartWrite | null,
): Promise<void> {
  if (write.kind === "plan") {
    return savePlanChange(db, write.routineId, {
      plan: write.plan,
      change: write.change,
      machineIds: write.machineIds,
      ...(write.also ? { also: write.also } : null),
      ...(follow ? { follow } : null),
      ...(startB ? { startB } : null),
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
    withBFollowing(batch, db, follow);
    withBStarting(batch, db, startB);
    const commit = batch.commit();
    switchBOnAfter(db, commit, startB);
    return commit;
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
