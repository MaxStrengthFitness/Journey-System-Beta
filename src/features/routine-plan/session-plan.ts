/**
 * The floor on day one (the design round, Oct 8 2026, §4.6): what the Active
 * Session reads off Routine A's plan, worked out here so the Now Bar, the
 * session corner, the plan sheet and the phone only draw.
 *
 * - The next machine: the plan's first machine TODAY's session doesn't have
 *   (`planProgress` over today's machines, not Routine A's, which is empty on
 *   day one), matched through the catalog machine each floor id is, so a
 *   studio's own unit counts as the machine it is. A machine this floor
 *   lacks is not offered (it can't be added here); the plan sheet's road
 *   still draws it.
 * - What a plan change made in the session does to TODAY's order: the
 *   machine is swapped or benched in today's order only when it has no set
 *   logged today. A set logged stays; the plan changes from next session.
 *   Adding is today only (`applySessionMachineIds`); the Wrap-up decides what
 *   the routine keeps.
 * - The Academy's starting range (AJ's "3a"): a reference beside the weight,
 *   only for a machine the client has no weight on file for, only in the
 *   column the trainer picked, never a number in the weight cell (AJ: "a
 *   crutch until we have reliable data within our app ... not as an end-all
 *   be-all").
 *
 * AJ, Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
 * change the plan ... you shouldn't really be blocked. Like if I start a
 * session with a client and I already think that, oh, hey, I think they
 * would be a lot better on this machine instead. You should be able to change
 * that and make the call as a trainer because you're training them that
 * day." Nothing here blocks a session.
 *
 * Pure: no React, no Firestore. Ids are the floor's.
 */
import type { LiveSet } from "../journey-grid/types";
import { activeCantDo, replaceAt } from "./cant-do";
import type { PlanProgress } from "./plan";
import { floorCanonical, floorIndex, type FloorMachine } from "./starting-plan";
import { ACADEMY_STARTING_WEIGHTS, academyStartingReference, type StartingColumn } from "./starting-weights";
import type { RoutinePlan } from "./types";

/** A plan read from the database is untyped: one with no road is no plan. */
export function usablePlan(plan: unknown): plan is RoutinePlan {
  return !!plan && typeof plan === "object" && Array.isArray((plan as RoutinePlan).intended);
}

export interface SessionPlanInput {
  plan: Pick<RoutinePlan, "intended" | "cantDo">;
  /** Today's machines, in today's order (the session's `activeMachineIds`). */
  today: readonly string[];
  floor: readonly FloorMachine[];
  /** The studio's day, `YYYY-MM-DD`: a can't-do mark that still holds is never offered. */
  todayYmd: string;
}

/**
 * "The plan · 3 of 6" and the next machine, against TODAY's session: how
 * many of the plan's machines today runs, and the plan's first machine it
 * doesn't, as a floor id on this floor (or null when every one is in, or
 * the rest are on the bench or not on this floor).
 */
export function sessionPlanProgress(input: SessionPlanInput): PlanProgress {
  const canonicalOf = floorCanonical(input.floor);
  const index = floorIndex(input.floor);
  const onFloor = new Set(input.floor.map((m) => m.id));
  const key = (id: string) => canonicalOf(id) || id;
  const todayKeys = new Set(input.today.map(key));
  const held = new Set(activeCantDo(input.plan, input.todayYmd).map((c) => key(c.machineId)));
  const intended = input.plan.intended.filter((id, i) => typeof id === "string" && id !== "" && input.plan.intended.indexOf(id) === i);

  let have = 0;
  let next: string | null = null;
  for (const id of intended) {
    const k = key(id);
    if (todayKeys.has(k)) {
      have += 1;
      continue;
    }
    if (next !== null || held.has(k)) continue;
    const floorId = onFloor.has(id) ? id : index.get(k);
    if (floorId && !input.today.includes(floorId)) next = floorId;
  }
  const planned = new Set(intended.map(key));
  return {
    have,
    of: intended.length,
    next,
    extras: input.today.filter((id) => !planned.has(key(id))),
    // Every planned machine is in today's session. No next is not the same:
    // the rest may be on the bench or not on this floor (`progressLine`
    // says "no more to add today" then, never "All 6 planned machines in").
    complete: have === intended.length,
  };
}

/**
 * The plan's machines against TODAY's session, through the catalog machine
 * each floor id is (a plan holds the floor ids of the floor it was made on;
 * a studio's own unit is the catalog machine it is): `key` says which
 * machine an id is, and `todayIdOf` which of today's machines a plan's
 * machine is, or null when today's session doesn't run it. The plan's sheet
 * in the session asks this, as `sessionPlanProgress` does, so a row, the
 * Road and today's order never disagree with the count.
 */
export function todayMatch(input: { today: readonly string[]; floor: readonly FloorMachine[] }): {
  key: (id: string) => string;
  todayIdOf: (planId: string) => string | null;
} {
  const canonicalOf = floorCanonical(input.floor);
  const key = (id: string) => canonicalOf(id) || id;
  const byKey = new Map<string, string>();
  for (const id of input.today) {
    const k = key(id);
    if (!byKey.has(k)) byKey.set(k, id);
  }
  return {
    key,
    todayIdOf: (planId: string) => (input.today.includes(planId) ? planId : (byKey.get(key(planId)) ?? null)),
  };
}

/* ── Today's order after a plan change ─────────────────────────────────── */

/**
 * A set is logged on a machine today once it has a count, a time or an
 * outcome. Start seeds a weight alone for every planned machine, so a
 * weight alone is not a set (KNOWN-TRAPS, "isBegunLog").
 */
export function setLoggedToday(v: LiveSet | null | undefined): boolean {
  if (!v) return false;
  if (v.outcome === "practice" || v.outcome === "skipped") return true;
  const has = (n: number | null | undefined) => typeof n === "number";
  return has(v.reps) || has(v.seconds) || has(v.repsR) || has(v.secondsR);
}

export interface TodayChange {
  /** Today's order after the change. */
  next: string[];
  /**
   * Each machine that left today's order and what took its place (the first
   * of them), or null when it simply left: the Now Bar follows a machine in
   * hand to what stands in for it.
   */
  moved: Array<{ from: string; to: string | null }>;
}

/**
 * Today's order with `from` replaced by `incoming` (a swap, or a can't-do's
 * stand-in, which may be none), or null when today's order doesn't change:
 * the machine isn't in today's session, or a set is logged on it today
 * ("Today's set stays. The plan changes from next session."). A machine
 * already in today's order is never added twice.
 */
export function todayAfterReplace(input: {
  today: readonly string[];
  from: string;
  incoming: readonly string[];
  logged: boolean;
}): TodayChange | null {
  if (input.logged || !input.today.includes(input.from)) return null;
  const add = input.incoming.filter((id) => id !== input.from && !input.today.includes(id));
  const next = replaceAt(input.today, input.from, add);
  return { next, moved: [{ from: input.from, to: add[0] ?? null }] };
}

/**
 * Today's order after several machines went on the bench at once (a
 * Re-plan's "Not for {First} for now"), each replaced by its stand-in in
 * turn, the ones with a set logged today left where they are. Null when
 * today's order doesn't change.
 */
export function todayAfterBench(input: {
  today: readonly string[];
  benched: ReadonlyArray<{ machineId: string; replacedBy?: readonly string[] }>;
  logged: (machineId: string) => boolean;
}): TodayChange | null {
  let next = [...input.today];
  const moved: TodayChange["moved"] = [];
  for (const b of input.benched) {
    const change = todayAfterReplace({ today: next, from: b.machineId, incoming: b.replacedBy ?? [], logged: input.logged(b.machineId) });
    if (!change) continue;
    next = change.next;
    moved.push(...change.moved);
  }
  return moved.length > 0 ? { next, moved } : null;
}

/** What the sheet says when a plan change leaves today's set where it is. */
export const TODAY_SET_STAYS = "Today's set stays. The plan changes from next session.";

/* ── The Academy's starting range ──────────────────────────────────────── */

/**
 * What the Now Bar's readout slot shows for a machine:
 * - `line`: "Academy's starting range: 60–100 lb (a reference, not a rule)",
 *   with "for today" when the column is kept for this session only (no plan
 *   to keep it on);
 * - `ask`: the quiet "Academy's starting range" button, when nobody has
 *   picked a column for this client yet;
 * - null: nothing (the client has a weight on file here, the sheet doesn't
 *   cover the machine, or the trainer chose Don't show ranges).
 */
export type StartingRangeSlot =
  | { kind: "line"; says: string; source: string; forToday: boolean }
  | { kind: "ask" }
  | null;

/**
 * Whether the client has a weight on file for this machine, so the range
 * is never shown: a prescribed weight (the last Wrap-up's, the last
 * performed load or a starting weight on file), a set on record, or a
 * running total that knows the machine was done before. While the totals
 * haven't answered, Journey can't tell, and the cautious answer is "has
 * one" (a failed read is unknown, never empty).
 */
export function hasWeightOnFile(input: {
  prescribedWeight: number | null | undefined;
  setsOnRecord: number;
  knownElsewhere: boolean;
  totalsKnown: boolean;
}): boolean {
  if (!input.totalsKnown) return true;
  return (typeof input.prescribedWeight === "number" && Number.isFinite(input.prescribedWeight)) || input.setsOnRecord > 0 || input.knownElsewhere;
}

export function startingRangeSlot(input: {
  /** The catalog machine (`canonicalMachineId`, or a studio unit's lineage). */
  canonicalMachineId: string;
  /** The column on Routine A's plan, the one picked in this session, or none picked. */
  column: StartingColumn | "none" | undefined;
  /** The column is kept for this session only (no plan to keep it on). */
  forToday: boolean;
  hasWeight: boolean;
}): StartingRangeSlot {
  if (input.hasWeight || !input.canonicalMachineId) return null;
  if (input.column === "none") return null;
  // A machine the sheet doesn't cover (a studio's own) says nothing, picked or not.
  if (!Object.prototype.hasOwnProperty.call(ACADEMY_STARTING_WEIGHTS, input.canonicalMachineId)) return null;
  if (!input.column) return { kind: "ask" };
  const ref = academyStartingReference({ canonicalMachineId: input.canonicalMachineId, column: input.column, hasWeight: false });
  return ref ? { kind: "line", says: ref.says, source: ref.source, forToday: input.forToday } : null;
}
