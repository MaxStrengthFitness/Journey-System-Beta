/**
 * The briefing's plan card, the pure half (the design round, Oct 8 2026,
 * §4.5; AJ's "1d": "the Lineup on Programming, with the Road's one-line
 * route wherever a glance is all there is: the briefing, the session's Plan
 * chip and the Wrap-up").
 *
 * What the briefing's "Today's routine" section draws (`briefingPlanView`),
 * today's machines as Change today moves them (`todayWith`,
 * `changeTodayRows`), the one order effect today trips (`todayEffect`), and
 * what Start hands up for a client starting out (`StartPlanAtStart`, and the
 * plan's first change, `startChangeOf`).
 *
 * The briefing never writes (session-scope.test.ts). For a client starting
 * out at the studio, Start passes the plan UP, and the tracker writes it in
 * the Start batch: the plan (with day one), an EMPTY Routine A and the
 * `start` change, never awaited. Today's machines are the session's, never
 * Routine A's: the consult is not Routine A (AJ, Oct 8 2026: "this also
 * counts with the consult visit, sometimes the consult machines will not be
 * the same as their a routine").
 *
 * Pure: no React, no Firestore.
 */
import type { Routine } from "../../types";
import { matchesRoutineLetter } from "../../lib/routine-utils";
import { activeCantDo } from "./cant-do";
import type { StartingKind } from "./client-kind";
import { signedChange, type Who } from "./lineup";
import { orderEffects, type OrderEffect } from "./order-effects";
import { runsDayOne, sameList } from "./plan";
import type { FloorMachine } from "./starting-plan";
import type { PlanChange, RoutinePlan } from "./types";

/**
 * What Start hands the tracker for a client starting out at the studio, so
 * the plan is kept by pressing Start (the design round, §4.5: "Start passes
 * today's machines and, for a new-to-the-studio client, the plan up to the
 * tracker"). Never written by the briefing.
 */
export interface StartPlanAtStart {
  /** The plan, with day one (`dayOne`), from the starting routine on this floor. */
  plan: RoutinePlan;
  name: "Routine A";
  /** Today's machines, in today's order: the session's, never Routine A's (which starts empty). */
  machineIds: string[];
  /** The starting routine the plan came from, when it did. */
  startingRoutineId: string | null;
  /** Its name, for the `start` change's value ("Low back issues"), so the Changes list needs no second read. */
  startingRoutineName?: string | null;
  /**
   * B planned beside it, at a studio that starts new clients on A and B
   * together (`newClientsStart`, item 8; b-routine.ts `plannedBOf`): B's
   * plan and its first change ("start" with "B planned"). The tracker
   * writes it in the Start batch as Routine B with NO machines (store.ts
   * `addPlannedBToBatch`), never over a Routine B of the client's own
   * (`plannedBTarget`), re-signed by whoever presses Start.
   */
  b?: { plan: RoutinePlan; change: PlanChange } | null;
}

/**
 * The plan's first change, signed by the person pressing Start (the Auth
 * uid, which the rules pin), with the starting routine's name as its value
 * when there is one: the same change Keep this lineup writes.
 */
export function startChangeOf(sp: Pick<StartPlanAtStart, "plan" | "startingRoutineName">, who: Who): PlanChange {
  const name = sp.startingRoutineName?.trim();
  return signedChange({ kind: "start", machineIds: sp.plan.intended, ...(name ? { value: name } : null) }, who);
}

/** B planned with the starting plan, its change signed by whoever presses Start; null with no B to plan. */
export function plannedBAtStart(sp: Pick<StartPlanAtStart, "b"> | null | undefined, who: Who): { plan: RoutinePlan; change: PlanChange } | null {
  if (!sp?.b) return null;
  return { plan: sp.b.plan, change: signedChange(sp.b.change, who) };
}

/* ── Which card ─────────────────────────────────────────────────────────── */

/**
 * What the briefing's "Today's routine" section draws:
 * - "routine": the client's routine as it always was (A or B, one line, Edit);
 * - "in-progress": Routine A has machines and a plan: the same line, with
 *   the Road under it ("3 of 6 · next: …");
 * - "kept": a plan kept (Keep this lineup on Programming, or Start on the
 *   briefing) with Routine A still empty: the plan card, today being day
 *   one (`todayFor`);
 * - "starting": starting out at the studio with no plan yet: the plan card,
 *   today being the starting routine's day one, the plan kept by Start;
 * - "journey": trained here before Journey: one line and a door to
 *   Programming, Start opening an empty session;
 * - "doors": Journey can't tell: both doors, claiming neither.
 */
export type BriefingPlanView = "routine" | "in-progress" | "kept" | "starting" | "journey" | "doors";

/** The door a trainer picked when Journey couldn't tell: starting out here, or trained here before. */
export type BriefingDoor = "studio" | "journey";

export function briefingPlanView(input: {
  routines: readonly Pick<Routine, "name" | "machineIds" | "plan">[];
  /** `startingKindOf`'s answer: read only when the client has no routine and no plan. */
  kind: StartingKind;
  /** A door picked stays picked, even once the kind is known. */
  door: BriefingDoor | null;
}): BriefingPlanView {
  // Either spelling ("Routine A" or an older seeder's "A"), as the briefing
  // finds the routine it draws (`findRoutineByLetter`).
  const a = input.routines.find((r) => matchesRoutineLetter(r, "A"));
  const hasRoutine = input.routines.some(
    (r) => (matchesRoutineLetter(r, "A") || matchesRoutineLetter(r, "B")) && (r.machineIds?.length ?? 0) > 0,
  );
  if (a?.plan) {
    if ((a.machineIds?.length ?? 0) > 0) return "in-progress";
    // Routine A is empty: day one runs (the consult, or any visit before the
    // Wrap-up's ticks start Routine A). A plan whose day one has all gone to
    // the bench draws the same card, with nothing picked for today.
    if (runsDayOne({ routine: a.machineIds, plan: a.plan }) || !hasRoutine) return "kept";
  }
  if (hasRoutine) return "routine";
  if (input.door === "studio") return "starting";
  if (input.door === "journey") return "journey";
  switch (input.kind) {
    case "new-to-studio":
      return "starting";
    case "new-to-journey":
      return "journey";
    case "established":
      return "routine";
    case "unknown":
      return "doors";
  }
}

/* ── Change today ───────────────────────────────────────────────────────── */

/**
 * Today with a machine in or out. One put in goes at the end of today, in
 * the order the trainer adds it; one taken out leaves the rest as they
 * stood. Today only: nothing here touches the plan or a routine.
 */
export function todayWith(today: readonly string[], machineId: string, on: boolean): string[] {
  if (on) return today.includes(machineId) ? [...today] : [...today, machineId];
  return today.filter((id) => id !== machineId);
}

export interface TodayRow {
  machineId: string;
  /** In today. */
  on: boolean;
  /** "Next stop" for the plan's next machine; "Not in the plan" for one from the floor. */
  note: string | null;
}

/**
 * Change today's rows: the plan's road in its order (what the client can't
 * do left out), then today's machines the plan doesn't name, then any the
 * sheet has shown already (`shown`), so a row a trainer unticks stays where
 * it was until the sheet closes. The road's first machine not in today is
 * the next stop, as the Road strip says it.
 */
export function changeTodayRows(input: {
  plan: Pick<RoutinePlan, "intended" | "cantDo">;
  today: readonly string[];
  todayYmd: string;
  shown?: readonly string[];
}): TodayRow[] {
  const held = new Set(activeCantDo(input.plan, input.todayYmd).map((c) => c.machineId));
  const road = input.plan.intended.filter((id, i) => input.plan.intended.indexOf(id) === i && !held.has(id));
  const next = road.find((id) => !input.today.includes(id)) ?? null;
  const ids: string[] = [];
  for (const id of [...road, ...input.today, ...(input.shown ?? [])]) if (id && !ids.includes(id)) ids.push(id);
  return ids.map((machineId) => ({
    machineId,
    on: input.today.includes(machineId),
    note: machineId === next ? "Next stop" : road.includes(machineId) ? null : "Not in the plan",
  }));
}

/**
 * The one order effect today trips, the Academy's "avoid" first (a quiet
 * sentence, never a block: order-effects.ts), or null.
 */
export function todayEffect(
  today: readonly string[],
  nameOf: (id: string) => string,
  floor?: readonly FloorMachine[],
): OrderEffect | null {
  return orderEffects(today, nameOf, floor)[0] ?? null;
}


/** Whether the trainer changed today: the list on the card differs from the one it opened with. */
export function todayChanged(today: readonly string[], opened: readonly string[]): boolean {
  return !sameList(today, opened);
}

/**
 * The plan Start keeps for a client starting out, with day one as the
 * consult ran it (AJ's "3a", Oct 8 2026: the plan keeps "the first visit's
 * machines as its own `dayOne`"). Before Start the plan is still a draft,
 * as Start a plan's lineup is before Keep, so Change today on the briefing
 * reaches its day one: a machine taken out today leaves day one, and the
 * plan's next one put in joins it. Day one keeps the road's order and only
 * the road's machines: one from the floor runs today and is offered on the
 * Wrap-up as "Added today · not in the plan", and the road itself stays as
 * it is. What the client can't do never comes back on day one.
 */
export function planWithTodayAsDayOne(plan: RoutinePlan, today: readonly string[], todayYmd: string): RoutinePlan {
  const held = new Set(activeCantDo(plan, todayYmd).map((c) => c.machineId));
  const dayOne = plan.intended.filter((id, i) => plan.intended.indexOf(id) === i && today.includes(id) && !held.has(id));
  return { ...plan, dayOne };
}
