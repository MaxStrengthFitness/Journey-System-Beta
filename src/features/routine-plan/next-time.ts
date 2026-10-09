/**
 * THE WRAP-UP'S NEXT TIME, the pure half (the design round, Oct 8 2026,
 * §4.7). What the card offers, what Routine A looks like for next time as
 * the ticks change, and the one write that carries the ticks into it.
 *
 * AJ, Oct 7 2026: "in the wrap-up that it just by default adds on, but you
 * can say, like, tick it off". And the consult rule, Oct 8 2026 ("3a"):
 * "this also counts with the consult visit, sometimes the consult machines
 * will not be the same as their a routine". So:
 * - the rows are today's PERFORMED machines the routine lacks
 *   (`nextTimeRows`, plan.ts); a machine skipped on a short day is never on
 *   the list, so a tired day never shrinks the routine;
 * - while Routine A has machines and is being built, still short of its
 *   plan (`stillBuilding`), they start ticked ("Untick one to leave it
 *   out"); otherwise unticked ("Tick a machine to keep it");
 * - with Routine A EMPTY when the session finished (the consult, or any
 *   visit while Routine A still has nothing) or no routine at all (a session
 *   built on the fly for a client with no Routine A), every row starts
 *   unticked under "Tick the ones that start Routine A", with Tick all;
 *   nothing ticked leaves Routine A empty and the next visit runs day one
 *   again (`todayFor`);
 * - a Free session has no Next time, and neither has a session that ran no
 *   routine for a client who has a Routine A: nothing here makes a second;
 * - a machine let go today is never offered back: one the client can't do
 *   (a mark that still holds), and one the routine or its plan held while
 *   the session ran and holds no longer (a Swap in the plan, a Re-plan or a
 *   Can't do made after its set was logged: "Today's set stays. The plan
 *   changes from next session.");
 * - after a session on a Routine B with its plan of swaps (Round 2, B molded
 *   in), a ticked machine that is one of B's swaps still to come makes that
 *   swap in the A machine's place (`bAfterTicks`), never added beside it.
 *
 * Everything the card reads is frozen at Finish (`nextTimeAtFinish`), so a
 * routine snapshot arriving while the trainer ticks never reshuffles the
 * rows. It writes ONCE, on the way out (`nextTimeWrite`, through
 * `store.ts`'s `saveNextTime`), never per tick; nothing ticked writes
 * nothing. The write starts from the routine as it stands when it is made
 * (`withRoutineNow`), so a change made on another iPad since Finish is kept.
 * A way out that leaves the screen standing (the iPad locked, another app
 * opened to book the next visit) keeps the ticks open: changed after it,
 * they are handed over again on the next way out, and that write carries
 * only the difference (`earlier`).
 *
 * Pure: no React, no Firestore.
 */
import type { Routine } from "../../types";
import { matchesRoutineLetter } from "../../lib/routine-utils";
import { activeCantDo } from "./cant-do";
import { orderEffects, type OrderEffect } from "./order-effects";
import { roadGroups, signedChange, type RoadGroup, type Who } from "./lineup";
import {
  ROUTINE_ONLY,
  applyPlanChange,
  listWords,
  nextTimeRows,
  planAfterWrapUp,
  planProgress,
  progressLine,
  routineAfterWrapUp,
  sameList,
  stillBuilding,
  todayFor,
  type NextTimeRow,
  type PlanProgress,
} from "./plan";
import { usablePlan } from "./session-plan";
import { floorCanonical, type FloorMachine } from "./starting-plan";
import {
  B_SWAP_MADE,
  bProgressOf,
  bRoadGroups,
  bStatus,
  bStatusLine,
  isBPlan,
  plannedBStartSwaps,
  plannedSwapsOf,
  swapsMade,
  swapsOf,
} from "./b-routine";
import type { PlanChange, PlanSwap, RoutinePlan } from "./types";

/** What the Wrap-up's Next time reads, frozen when the session finished. */
export interface NextTimeSnapshot {
  /**
   * The routine the session ran, or null: a session that ran no routine,
   * for a client with no Routine A. The ticks then make Routine A, with no
   * plan.
   */
  routineId: string | null;
  /** "Routine A", as the card says it. */
  routineName: string;
  /** The routine's machines when the session finished; empty for the consult, and with no routine. */
  machineIds: string[];
  /** The routine's plan, or null when it has none. */
  plan: RoutinePlan | null;
  /**
   * Today's performed machines, in today's order, each as the routine or
   * the plan holds it: a studio's own unit counts as the catalog machine it
   * is (`todayMatch`'s rule, session-plan.ts), so it is never offered twice.
   */
  performed: string[];
  /** A name for every machine the card may draw, whole. */
  names: Record<string, string>;
  /**
   * The swaps of a Routine B planned with the starting lineup (the studio's
   * "A and B together", item 8), when the session ran an EMPTY Routine A:
   * the ticks that start Routine A start B too (`plannedBStart`), and the
   * card says so (`nextTimeBLine`). Absent otherwise.
   */
  plannedB?: PlanSwap[];
  /**
   * The floor's machine ids when the session finished, beside `plannedB`:
   * the card's line and the write that starts B check the same floor, so
   * the card never says a start the write doesn't make (the review of item
   * 8: the card checked no floor, the write the live one).
   */
  plannedBFloor?: string[];
  /**
   * The floor's machines the card names, each with the catalog machine it
   * is, so the order effects read a studio's own unit as the machine it is
   * (`nextTimeEffects`). Absent on a snapshot made before Oct 9 2026: the
   * effects then read catalog ids as they are.
   */
  floor?: FloorMachine[];
}

const strings = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((id, i): id is string => typeof id === "string" && id !== "" && list.indexOf(id) === i) : [];

/** "Routine A" for a routine an older seeder named "A"; a routine's own name otherwise. */
export function routineWords(name: string | null | undefined): string {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return "Routine A";
  return /^[ab]$/i.test(n) ? `Routine ${n.toUpperCase()}` : n;
}

/**
 * Today's performed machines as the routine or the plan names them: a
 * machine of today's floor that is the same catalog machine as one the
 * routine holds (first) or the plan holds (then) takes that one's id.
 * Anything else keeps its own. Each once, in today's order.
 */
export function asRoutineIds(
  performed: readonly string[],
  input: { routine: readonly string[]; plan: Pick<RoutinePlan, "intended" | "dayOne"> | null; floor: readonly FloorMachine[] },
): string[] {
  const canonicalOf = floorCanonical(input.floor);
  const key = (id: string) => canonicalOf(id) || id;
  const known = [...input.routine, ...(input.plan?.dayOne ?? []), ...(input.plan?.intended ?? [])];
  const out: string[] = [];
  for (const id of performed) {
    if (typeof id !== "string" || id === "") continue;
    const same = known.includes(id) ? id : (known.find((k) => key(k) === key(id)) ?? id);
    if (!out.includes(same)) out.push(same);
  }
  return out;
}

/**
 * Every machine a routine holds: its machines, its plan's road and the
 * plan's day one. The tracker gathers these while a session runs (the
 * session's routine and Routine A, as the routines change), so Finish can
 * tell a machine let go today (`nextTimeAtFinish`'s `heldDuringSession`).
 */
export function routineHolds(routine: Pick<Routine, "machineIds" | "plan"> | null | undefined): string[] {
  if (!routine) return [];
  const plan = usablePlan(routine.plan) ? routine.plan : null;
  const out: string[] = [];
  for (const id of [...strings(routine.machineIds), ...strings(plan?.intended), ...strings(plan?.dayOne)]) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Whether the session ran Free (no Next time): how it was started, when this
 * iPad started it; for a session resumed after a reload, with no record of
 * that, a session with no routine that runs the whole floor is read as Free.
 * One started here as Routine A, for a client with no routine, is never
 * Free, however much of the floor it ran.
 */
export function ranAsFree(input: {
  /** How this iPad started the session, or null when it didn't (resumed). */
  startedAs: "A" | "B" | "Free" | null;
  routineId: string | null | undefined;
  /** This studio's floor, by id. */
  floor: readonly (string | null | undefined)[];
  /** Today's machines. */
  today: readonly string[];
}): boolean {
  if (input.startedAs !== null) return input.startedAs === "Free";
  return !input.routineId && input.floor.length > 0 && input.floor.every((id) => !id || input.today.includes(id));
}

/**
 * What the card reads, worked out at Finish; null when there is no Next
 * time:
 * - a Free session (`free`);
 * - the routines not known yet (a read not answered is unknown, never
 *   "none": no card rather than a wrong one);
 * - the session's routine not among them (not read: can't tell);
 * - no routine run, while the client has a Routine A (nothing here makes a
 *   second one).
 *
 * A performed machine let go today is left off the list, matched as the
 * catalog machine it is (`floorCanonical`), so neither an untouched leave
 * nor Tick all puts it back:
 * - a machine the client can't do, on a mark that still holds today, on the
 *   session's routine's plan or Routine A's (B and every screen read A's);
 * - a machine the routine or its plan held while the session ran
 *   (`heldDuringSession`) and that neither the session's routine nor
 *   Routine A holds now: swapped, re-planned or marked can't do after its
 *   set was logged ("Today's set stays. The plan changes from next
 *   session."), or taken out on Programming meanwhile.
 */
export function nextTimeAtFinish(input: {
  free: boolean;
  /** The routine the session ran, by id. */
  routineId: string | null | undefined;
  /** The client's routines (the tracker's live listener), or null while they aren't known. */
  routines: readonly Routine[] | null;
  /** Today's performed machines, in today's order. */
  performed: readonly string[];
  /** This studio's floor. */
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  /** The studio's day, `YYYY-MM-DD`: a can't-do mark that still holds on it. */
  todayYmd: string;
  /** What the session's routine and Routine A held while the session ran (`routineHolds`, gathered by the tracker). */
  heldDuringSession?: readonly string[];
}): NextTimeSnapshot | null {
  if (input.free || !input.routines) return null;
  let routine: Routine | null = null;
  if (input.routineId) {
    routine = input.routines.find((r) => r.id === input.routineId) ?? null;
    if (!routine) return null;
  } else if (input.routines.some((r) => matchesRoutineLetter(r, "A"))) {
    return null;
  }
  const plan = routine && usablePlan(routine.plan) ? routine.plan : null;
  const machineIds = strings(routine?.machineIds);
  const routineA = input.routines.find((r) => matchesRoutineLetter(r, "A")) ?? null;
  const planA = routineA && usablePlan(routineA.plan) ? routineA.plan : null;
  const canonicalOf = floorCanonical(input.floor);
  const key = (id: string) => canonicalOf(id) || id;
  const heldNow = new Set([...routineHolds(routine), ...routineHolds(routineA)].map(key));
  const letGo = new Set(strings(input.heldDuringSession).map(key).filter((k) => !heldNow.has(k)));
  const benched = new Set(
    [...activeCantDo(plan, input.todayYmd), ...(planA === plan ? [] : activeCantDo(planA, input.todayYmd))]
      .map((c) => c?.machineId)
      .filter((id): id is string => typeof id === "string" && id !== "")
      .map(key),
  );
  const kept = input.performed.filter(
    (id) => typeof id === "string" && id !== "" && !letGo.has(key(id)) && !benched.has(key(id)),
  );
  const performed = asRoutineIds(kept, { routine: machineIds, plan, floor: input.floor });
  const names: Record<string, string> = {};
  const ids = [
    ...machineIds,
    ...performed,
    ...input.performed,
    ...strings(plan?.intended),
    ...strings(plan?.dayOne),
    ...(plan?.cantDo ?? []).map((c) => c?.machineId),
  ];
  // A Routine B planned with the starting lineup, waiting on this empty Routine A (item 8).
  const plannedB =
    routine && matchesRoutineLetter(routine, "A") && machineIds.length === 0
      ? plannedSwapsOf(input.routines.find((r) => matchesRoutineLetter(r, "B") && !!r.id && !r.id.startsWith("temp-")))
      : null;
  for (const id of [...ids, ...(plannedB ?? []).flatMap((s) => [s.replaces, s.with])]) {
    if (typeof id === "string" && id && !(id in names)) names[id] = input.nameOf(id);
  }
  const floor = input.floor.filter((m) => m.id in names).map((m) => ({ id: m.id, ...(m.canonicalId ? { canonicalId: m.canonicalId } : null) }));
  return {
    routineId: routine?.id ?? null,
    routineName: routineWords(routine?.name),
    machineIds,
    plan,
    performed,
    names,
    ...(plannedB && plannedB.length > 0 ? { plannedB, plannedBFloor: input.floor.map((m) => m.id) } : null),
    ...(floor.length > 0 ? { floor } : null),
  };
}

/**
 * The order effects the ticks bring, said quietly under the Road (the design
 * round, §4.7: "When two of them side by side trip a sequencing rule, the
 * order effects say so, quietly"; AJ's Oct 8 note puts order effects on
 * every surface): the Academy's rules that two machines side by side in what
 * the next visit runs trip, where one of them is a machine joining now.
 * What the routine already ran together is not said again here; a sentence,
 * never a block.
 */
export function nextTimeEffects(snap: Pick<NextTimeSnapshot, "names" | "floor">, after: Pick<NextTimeAfter, "runs">, ticked: readonly string[]): OrderEffect[] {
  if (ticked.length === 0) return [];
  const nameOf = (id: string) => snap.names[id] || id;
  return orderEffects(after.runs, nameOf, snap.floor).filter(
    (e) => e.scope === "adjacent" && e.machineIds.some((id) => ticked.includes(id)),
  );
}

/** The floor frozen beside a planned B at Finish (`plannedBFloor`), as the write's floor: ids only. */
export function plannedBFloorOf(snap: Pick<NextTimeSnapshot, "plannedBFloor">): { id: string }[] | null {
  return Array.isArray(snap.plannedBFloor) ? snap.plannedBFloor.map((id) => ({ id })) : null;
}

/**
 * What the card says of a Routine B planned with the starting lineup, live
 * as the ticks change (item 8): "Routine B starts too: Leg Extension for Leg
 * Press. A and B alternate from the next visit." while the ticks start
 * Routine A and one of B's swaps is for a ticked machine, with the swaps
 * kept for machines A takes later named ("B's swap for Chest Press waits
 * until Routine A takes it."); that B stays planned when none is; nothing
 * with no planned B, or nothing ticked. It asks what the write asks
 * (`plannedBStartSwaps`, over the floor frozen at Finish), so a swap the
 * client can't do, one A will take in, or one off the floor is never said.
 */
export function nextTimeBLine(snap: NextTimeSnapshot, after: NextTimeAfter, todayYmd: string): string | null {
  if (!snap.plannedB || snap.plannedB.length === 0 || nextTimeAsk(snap) !== "start" || after.routine.length === 0) return null;
  const nameOf = (id: string) => snap.names[id] || id;
  const { ready, waiting } = plannedBStartSwaps({
    swaps: snap.plannedB,
    aRoutine: after.routine,
    aPlan: after.plan,
    floor: plannedBFloorOf(snap) ?? [],
    todayYmd,
  });
  const first = ready[0];
  if (!first) return "Routine B stays planned: none of its swaps is for these machines yet.";
  const later =
    waiting.length === 0
      ? ""
      : ` B's ${waiting.length === 1 ? "swap" : "swaps"} for ${listWords(waiting.map((s) => nameOf(s.replaces)))} ${
          waiting.length === 1 ? "waits until Routine A takes it" : "wait until Routine A takes them"
        }.`;
  return `Routine B starts too: ${nameOf(first.with)} for ${nameOf(first.replaces)}. A and B alternate from the next visit.${later}`;
}

/** The rows the card offers (`nextTimeRows`, plan.ts), from the frozen snapshot. */
export function nextTimeOffer(snap: NextTimeSnapshot): NextTimeRow[] {
  return nextTimeRows({ plan: snap.plan, routine: snap.machineIds, performedToday: snap.performed });
}

/**
 * The line over the rows:
 * - "start": the routine was empty when the session finished, or there is
 *   none (the consult, a session built on the fly): the ticks start it;
 * - "building": Routine A has machines, is being built and is still short
 *   of its plan (`stillBuilding`): today's join;
 * - "keep": an established routine changes on purpose (a plan whose
 *   machines are all in, its switch left on, included).
 */
export type NextTimeAsk = "start" | "building" | "keep";

export function nextTimeAsk(snap: Pick<NextTimeSnapshot, "machineIds" | "plan">): NextTimeAsk {
  if (snap.machineIds.length === 0) return "start";
  return stillBuilding(snap.plan, snap.machineIds) ? "building" : "keep";
}

export function nextTimeAskWords(ask: NextTimeAsk, routineName: string): string {
  switch (ask) {
    case "start":
      return `Tick the ones that start ${routineName}.`;
    case "building":
      return `${routineName} is being built, so today's machines join it. Untick one to leave it out.`;
    case "keep":
      return `Tick a machine to keep it in ${routineName}.`;
  }
}

/** A row's small line. With no plan there is no plan to be "not in". */
export function nextTimeWhyWords(why: NextTimeRow["why"], hasPlan: boolean): string {
  if (why === "day-one") return "Day one";
  if (why === "planned") return "Next in the plan";
  return hasPlan ? "Added today · not in the plan" : "Added today";
}

/** The ticked machines, in the rows' order (today's), each once, and only machines the card offered. */
export function tickedInOrder(rows: readonly NextTimeRow[], ticked: readonly string[]): string[] {
  return rows.filter((r) => ticked.includes(r.machineId)).map((r) => r.machineId);
}

/** Two hand-overs alike: the same machines (each in the rows' order, `tickedInOrder`). plan.ts's `sameList`, by the name the Wrap-up reads it. */
export const sameTicks: (a: readonly string[], b: readonly string[]) => boolean = sameList;

export interface NextTimeAfter {
  /** The routine's machines for next time. */
  routine: string[];
  /** The plan for next time, or null with none. */
  plan: RoutinePlan | null;
  /** What the next visit runs: the routine's machines, else the plan's day one (`todayFor`). */
  runs: string[];
  /** How far along, with a plan. */
  progress: PlanProgress | null;
}

/**
 * Routine B after a B session's ticks (Round 2, B molded in; the review of
 * Round 2: read as Routine A's, a ticked swap machine was ADDED to B, B grew
 * and kept the A machine, and its swap counted as made). B grows by its
 * swaps, one at a time and sometimes two or three, the trainer's call (AJ,
 * Oct 7 2026: "there are times where a trainer might do two machines
 * different or three machines different in a single session"), so:
 * - a ticked machine that is one of B's swaps still to come MAKES that swap:
 *   it takes the place of the A machine it replaces, and the swap moves up
 *   to the swaps made (next in line, so B's count stays true);
 * - any other ticked machine joins B as one joins a Routine A
 *   (`routineAfterWrapUp`: at its place on B's road, else at the end; one
 *   off the road joins the road).
 * `made` and `joined` are what the change records say.
 */
export function bAfterTicks(
  plan: RoutinePlan,
  routine: readonly string[],
  ticked: readonly string[],
): { routine: string[]; plan: RoutinePlan; made: PlanSwap[]; joined: string[] } {
  const swaps = swapsOf(plan);
  const madeSoFar = swapsMade(swaps, routine);
  const waiting = swaps.slice(madeSoFar);
  const now = waiting.filter((s) => ticked.includes(s.with));
  const out = [...routine];
  for (const s of now) {
    const at = out.indexOf(s.replaces);
    if (at >= 0) out[at] = s.with;
    else if (!out.includes(s.with)) out.push(s.with);
  }
  const reordered: RoutinePlan =
    now.length > 0 ? { ...plan, swaps: [...swaps.slice(0, madeSoFar), ...now, ...waiting.filter((s) => !now.includes(s))] } : plan;
  const joined = ticked.filter((id, i) => ticked.indexOf(id) === i && !now.some((s) => s.with === id) && !out.includes(id));
  return {
    routine: routineAfterWrapUp({ plan: reordered, routine: out, ticked: joined }),
    plan: planAfterWrapUp(reordered, joined),
    made: now,
    joined,
  };
}

/** Routine A (or a Routine B with its plan of swaps, `bAfterTicks`) for next time, live as the ticks change. */
export function nextTimeAfter(snap: NextTimeSnapshot, ticked: readonly string[]): NextTimeAfter {
  if (isBPlan(snap.plan)) {
    const b = bAfterTicks(snap.plan, snap.machineIds, ticked);
    return {
      routine: b.routine,
      plan: b.plan,
      runs: todayFor({ routine: b.routine, plan: b.plan }),
      progress: bProgressOf(bStatus(swapsOf(b.plan), b.routine)),
    };
  }
  const routine = routineAfterWrapUp({ plan: snap.plan, routine: snap.machineIds, ticked });
  const plan = snap.plan ? planAfterWrapUp(snap.plan, ticked) : null;
  return {
    routine,
    plan,
    runs: todayFor({ routine, plan }),
    progress: plan ? planProgress(plan, routine) : null,
  };
}

/**
 * The Road for next time: what the next visit runs under the "Next time"
 * bracket (a machine joining marked "Joins"), the rest of the plan hollow
 * with the next stop, the bench crossed. Empty when the next visit runs
 * nothing (no routine, nothing ticked).
 */
export function nextTimeRoad(
  after: NextTimeAfter,
  ticked: readonly string[],
  input: {
    todayYmd: string;
    firstName?: string | null;
    /** Names, for a Routine B's swaps still to come ("for Leg Press"): with them, B's Road is the briefing's (`bRoadGroups`). */
    nameOf?: (id: string) => string;
  },
): RoadGroup[] {
  if (after.runs.length === 0 && (after.plan?.intended.length ?? 0) === 0) return [];
  const groups =
    after.plan && isBPlan(after.plan) && input.nameOf
      ? bRoadGroups({
          bPlan: after.plan,
          today: after.runs,
          bRoutine: after.routine,
          todayYmd: input.todayYmd,
          nameOf: input.nameOf,
          firstName: input.firstName,
        }).map((g) => (g.key === "today" ? { ...g, label: `Next time · ${after.runs.length}` } : g))
      : roadGroups({
          plan: after.plan ?? { intended: after.runs },
          today: after.runs,
          todayYmd: input.todayYmd,
          todayLabel: "Next time",
          firstName: input.firstName,
        });
  return groups.map((g) =>
    g.key === "today"
      ? { ...g, stations: g.stations.map((s) => (ticked.includes(s.id) ? { ...s, mark: "Joins" } : s)) }
      : g,
  );
}

/**
 * "3 of 6 · next: Hip Abduction", or "0 of 6 · day one: …" while nothing is
 * ticked on an empty Routine A; for Routine B, "B · 2 of 5 swaps · next: …";
 * null with no plan.
 */
export function nextTimeProgressLine(after: NextTimeAfter, nameOf: (id: string) => string): string | null {
  if (!after.plan || !after.progress) return null;
  if (isBPlan(after.plan)) return bStatusLine(bStatus(swapsOf(after.plan), after.routine), nameOf);
  return progressLine(after.progress, nameOf, after.plan.dayOne);
}

/** The one write the ticks make, on the way out (`store.ts`'s `saveNextTime`). */
export type NextTimeWrite =
  /** A routine with a plan: the plan, its change(s) and the routine's machines, in one batch (`savePlanChange`). */
  | { kind: "plan"; routineId: string; plan: RoutinePlan; change: PlanChange; also?: PlanChange[]; machineIds: string[] }
  /**
   * A routine with no plan: its machines, and the record of the change every
   * plan-less routine keeps (`routineAdjustments`, with what it held before,
   * so Programming's "changed … by" is true).
   */
  | { kind: "routine"; routineId: string; machineIds: string[]; previousMachineIds: string[] }
  /** No routine: Routine A made with the ticked machines, and no plan. */
  | { kind: "create"; name: string; machineIds: string[] };

/**
 * What the ticks write, or null when there is nothing to write: nothing
 * ticked (nothing ticked writes nothing), the ticks as they were last handed
 * over (`earlier`), or a plan's change that can't be signed (the rules pin
 * the Auth uid).
 *
 * `snap` is the routine as it stands when the write is made
 * (`withRoutineNow`), so a change made since Finish on another iPad or on
 * Programming is kept; `rows` are the card's, frozen at Finish (by default,
 * the rows `snap` offers).
 *
 * A plan's change says what the ticks did: the plan's own machines going
 * into Routine A are an "add" into Routine A only (`ROUTINE_ONLY`: "Added
 * Leg Press and Lumbar to Routine A"), and a machine the plan didn't name
 * joins the road with them, a plain "add" beside it in the same batch.
 *
 * Handed over again after a way out that left the screen standing (the
 * iPad locked), it writes only the difference from `earlier`: a machine
 * ticked since joins as above; one unticked since leaves Routine A (a
 * "remove" from Routine A only), and, when it was new to the plan (the
 * earlier write put it on the road), leaves the road too (a plain
 * "remove"). With no routine, Routine A is made by the first write only:
 * never a second.
 */
export function nextTimeWrite(
  snap: NextTimeSnapshot,
  ticked: readonly string[],
  who: Who | null,
  opts: { rows?: readonly NextTimeRow[]; earlier?: readonly string[] | null } = {},
): NextTimeWrite | null {
  const rows = opts.rows ?? nextTimeOffer(snap);
  const picked = tickedInOrder(rows, ticked);
  const before = tickedInOrder(rows, opts.earlier ?? []);
  const added = picked.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !picked.includes(id));
  if (added.length === 0 && removed.length === 0) return null;
  if (!snap.routineId) {
    return before.length === 0
      ? { kind: "create", name: snap.routineName, machineIds: routineAfterWrapUp({ plan: null, routine: [], ticked: picked }) }
      : null;
  }
  const base = snap.machineIds.filter((id) => !removed.includes(id));
  if (!snap.plan) {
    return {
      kind: "routine",
      routineId: snap.routineId,
      machineIds: routineAfterWrapUp({ plan: null, routine: base, ticked: added }),
      previousMachineIds: [...snap.machineIds],
    };
  }
  if (!who?.uid) return null;
  if (isBPlan(snap.plan)) return bNextTimeWrite(snap.routineId, snap.machineIds, snap.plan, rows, { added, removed }, who);
  // A machine the earlier write put on the road (it wasn't in the plan at
  // Finish) comes off the road with its tick; the plan's own stay on deck.
  const offRoad = removed.filter((id) => rows.find((r) => r.machineId === id)?.why === "added-today");
  const outOfA = removed.filter((id) => !offRoad.includes(id));
  const road = offRoad.length > 0 ? applyPlanChange(snap.plan, { kind: "remove", machineIds: offRoad }) : snap.plan;
  const machineIds = routineAfterWrapUp({ plan: road, routine: base, ticked: added });
  const plan = planAfterWrapUp(road, added);
  const planned = added.filter((id) => road.intended.includes(id));
  const unplanned = added.filter((id) => !road.intended.includes(id));
  const changes: PlanChange[] = [];
  if (planned.length > 0) changes.push(signedChange({ kind: "add", machineIds: planned, value: ROUTINE_ONLY }, who));
  if (unplanned.length > 0) changes.push(signedChange({ kind: "add", machineIds: unplanned }, who));
  if (outOfA.length > 0) changes.push(signedChange({ kind: "remove", machineIds: outOfA, value: ROUTINE_ONLY }, who));
  if (offRoad.length > 0) changes.push(signedChange({ kind: "remove", machineIds: offRoad }, who));
  const [change, ...also] = changes;
  return {
    kind: "plan",
    routineId: snap.routineId,
    plan,
    change,
    ...(also.length > 0 ? { also } : null),
    machineIds,
  };
}

/**
 * The ticks' write on a Routine B with its plan of swaps (`bAfterTicks`):
 * one "swap" change a swap made ("Swapped Leg Extension in for Leg Press"),
 * an "add" for any other machine kept, in one batch with B's machines and
 * its plan (the swaps made moved up). Handed over again after a way out
 * that left the screen standing, a swap the earlier write made and since
 * unticked gives its place back to the A machine and waits again, next in
 * line; anything else unticked leaves B as it leaves a Routine A.
 */
function bNextTimeWrite(
  routineId: string,
  machineIds: readonly string[],
  plan: RoutinePlan,
  rows: readonly NextTimeRow[],
  ticks: { added: readonly string[]; removed: readonly string[] },
  who: Who,
): NextTimeWrite | null {
  const swaps = swapsOf(plan);
  const made = swapsMade(swaps, machineIds);
  const undone = swaps.slice(0, made).filter((s) => ticks.removed.includes(s.with));
  let routine = [...machineIds];
  for (const s of undone) {
    const at = routine.indexOf(s.with);
    if (at < 0) continue;
    if (routine.includes(s.replaces)) routine.splice(at, 1);
    else routine[at] = s.replaces;
  }
  const back: RoutinePlan =
    undone.length > 0
      ? { ...plan, swaps: [...swaps.slice(0, made).filter((s) => !undone.includes(s)), ...undone, ...swaps.slice(made)] }
      : plan;
  const rest = ticks.removed.filter((id) => !undone.some((s) => s.with === id));
  const offRoad = rest.filter((id) => rows.find((r) => r.machineId === id)?.why === "added-today");
  const outOfB = rest.filter((id) => !offRoad.includes(id));
  routine = routine.filter((id) => !rest.includes(id));
  const road = offRoad.length > 0 ? applyPlanChange(back, { kind: "remove", machineIds: offRoad }) : back;
  const after = bAfterTicks(road, routine, ticks.added);
  const planned = after.joined.filter((id) => road.intended.includes(id));
  const unplanned = after.joined.filter((id) => !road.intended.includes(id));
  const changes: PlanChange[] = after.made.map((s) =>
    signedChange({ kind: "swap", machineIds: [s.replaces, s.with], value: B_SWAP_MADE }, who),
  );
  if (planned.length > 0) changes.push(signedChange({ kind: "add", machineIds: planned, value: ROUTINE_ONLY }, who));
  if (unplanned.length > 0) changes.push(signedChange({ kind: "add", machineIds: unplanned }, who));
  const out = [...undone.map((s) => s.with), ...outOfB];
  if (out.length > 0) changes.push(signedChange({ kind: "remove", machineIds: out, value: ROUTINE_ONLY }, who));
  if (offRoad.length > 0) changes.push(signedChange({ kind: "remove", machineIds: offRoad }, who));
  const [change, ...also] = changes;
  if (!change) return null;
  return { kind: "plan", routineId, plan: after.plan, change, ...(also.length > 0 ? { also } : null), machineIds: after.routine };
}

/**
 * The snapshot against the routine as it stands now, for the write:
 * - the routine the session ran, as the live listener holds it now, so a
 *   change made since Finish (on another iPad, on Programming) is kept and
 *   never written over with what Finish froze;
 * - when the session ran none, a Routine A made since Finish (another iPad,
 *   Programming, or this Wrap-up's own first write): the ticks go into that
 *   one, never a second Routine A.
 * Anything else (not read, another routine) leaves the snapshot as it was.
 * The card's rows stay the frozen ones.
 */
export function withRoutineNow(snap: NextTimeSnapshot, now: Routine | null | undefined): NextTimeSnapshot {
  if (!now?.id) return snap;
  if (snap.routineId && now.id !== snap.routineId) return snap;
  const plan = usablePlan(now.plan) ? now.plan : null;
  const machineIds = strings(now.machineIds);
  return { ...snap, routineId: now.id, routineName: routineWords(now.name), machineIds, plan };
}
