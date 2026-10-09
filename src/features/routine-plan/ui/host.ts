/**
 * What Programming → Routine A's plan screens are handed by the profile
 * (ClientProfileView owns the routines' one listener and every write; the
 * design round, §4.3). The screens draw and ask; the profile's
 * `usePlanActions` issues the writes through `routine-plan/store.ts`, never
 * awaited, patches its own routines at once (so a tap draws before the
 * listener answers) and toasts a refusal, which the listener undoes.
 */
import type { Machine, Routine } from "../../../types";
import type { HealthFlavour } from "../../../types/journal";
import type { HistoryCoverage } from "../../../lib/prior-history";
import { matchesRoutineLetter } from "../../../lib/routine-utils";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import type { StartingKindAnswer } from "../client-kind";
import type { PlanWrite, Who } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { PlannedBWrite, StoredPlanChange } from "../store";
import type { CantDo, PlanChange, RoutinePlan } from "../types";

/**
 * How the studio starts a new client, as a screen knows it: true for A and
 * B together, false for A alone, "loading" until the setting answers,
 * "failed" when it couldn't be read (`useNewClientsStart`).
 */
export type NewClientsStartRead = boolean | "loading" | "failed";

export interface StartPlanCall {
  /** The routine the plan goes on (an existing Routine A), or null to make one. */
  routineId: string | null;
  /** What Routine A holds: `[]` for a client starting out (the consult is not Routine A). */
  machineIds: string[];
  plan: RoutinePlan;
  change: PlanChange;
  /**
   * B planned beside it, at a studio that starts new clients on A and B
   * together (`newClientsStart`): Routine B with its plan and no machines,
   * in the same batch (`store.ts` `addPlannedBToBatch`). Absent: no B.
   */
  b?: PlannedBWrite | null;
}

/** Plan B kept: Routine B as A with one machine different, its plan, and its first change (`startBPlan`, signed). */
export interface StartBCall {
  /** The client's Routine B when there is one (empty), or null to make it. */
  routineId: string | null;
  machineIds: string[];
  plan: RoutinePlan;
  change: PlanChange;
}

export interface HealthNoteCall {
  /** The machine the note names; null when one note names several (a Re-plan's surgery). */
  machineId: string | null;
  /** The bench's mark it was asked from, when there is one. */
  entry?: CantDo;
  /** Surgery or Injury (`healthNoteOffer`). */
  flavour: HealthFlavour;
  /** The note's words. */
  body: string;
}

export interface PlanActions {
  /** A plan's first write (Keep this lineup, Save Routine A, Add a plan). Issued, never awaited. */
  start(call: StartPlanCall): void;
  /**
   * Every change after it. Issued, never awaited. A change that moves
   * Routine A's machines writes Routine B beside it when B follows A
   * (`bFollowOf`), in the same batch.
   */
  save(routineId: string, write: PlanWrite): void;
  /**
   * Plan B kept ("Start B"): ONE batch, Routine B and its plan and the
   * client's `isRoutineBActive` (store.ts `startRoutineB`). Issued, never
   * awaited. Absent where nothing may start B.
   */
  startB?(call: StartBCall): void;
  /** The one-tap Health note a surgery or an injury offers, through the notes' one writer. */
  healthNote(call: HealthNoteCall): void;
  /** A routine's plan changes, read once when the Changes are opened. */
  readChanges(routineId: string): Promise<StoredPlanChange[]>;
}

export type RoutinesStatus = "loading" | "ready" | "failed";

export interface PlanHost {
  /**
   * The profile's live read of the routines: the plan's doors wait for
   * "ready" (an empty answer from the iPad's cache stays "loading"), and
   * "failed" is can't tell.
   */
  status: RoutinesStatus;
  /** Which kind of "no routine" the client is (`startingKindOf`). */
  kind: StartingKindAnswer;
  /** THIS studio's floor, its own machines included, in the studio's order (`codexFloor`). */
  floor: readonly Machine[];
  studioId: string | null;
  studioName: string | null;
  /** The signed-in person, by Auth uid; null when the uid isn't known (nothing is offered to write then). */
  who: Who | null;
  /** The studio's day, `YYYY-MM-DD`. */
  todayYmd: string;
  /** The intake's words a starting routine is matched on: medical history, goals, the clinical profile, open Health notes (`planIntakeText`). */
  intakeText: string | null;
  /**
   * The studio starts new clients on A and B together (its setting
   * `newClientsStart`, studio-settings/registry.ts, read by the profile
   * through `useNewClientsStart`): Start a plan plans Routine B beside the
   * starting lineup. Absent or false, A alone (Max Strength's default):
   * nothing about B appears until a trainer plans it. "loading" while the
   * setting hasn't answered (Keep waits for it), "failed" when it couldn't
   * be read (B is offered, left for later): never A alone off a read that
   * didn't answer.
   */
  aAndBTogether?: NewClientsStartRead;
  actions: PlanActions;
  /**
   * Opens Plan B (the profile holds the one sheet, so the B switch and the
   * Edit routine drawer open the same one): the A | B lineup's and Routine
   * B's "Plan B", and turning B on while B has no machines. Absent: nothing
   * offers Plan B.
   */
  openPlanB?: () => void;
  /**
   * The profile's sessions are every session the client has in Journey (no
   * more pages to read), so "Routine A has run 7 times in Journey" is the
   * whole count; otherwise it says "at least", or nothing before a page has
   * answered.
   */
  sessionsComplete?: boolean;
  /**
   * How much of the client's story Journey holds (`coverageOfClient`): the
   * runs of A beside the Academy's line are judged by it (history-claims.ts
   * `routineRunsLine`). Absent, "unknown": a zero says nothing.
   */
  coverage?: HistoryCoverage;
}

/** The floor as the plan's pure half reads it: a studio's own unit knows the catalog machine it is. */
export function floorMachinesOf(floor: readonly Machine[]): FloorMachine[] {
  const out: FloorMachine[] = [];
  for (const m of floor) {
    if (!m.id || out.some((f) => f.id === m.id)) continue;
    out.push({ id: m.id, ...(m.name ? { name: m.name } : null), ...(m.comparisonKey ? { canonicalId: m.comparisonKey } : null) });
  }
  return out;
}

/**
 * A machine's name: this floor's first (a unit keeps its floor name), then
 * the app's list, then the Academy's name for the movement, else its id.
 * Never shortened.
 */
export function machineNamer(floor: readonly Machine[], machines: readonly Machine[]): (id: string) => string {
  const names = new Map<string, string>();
  for (const m of machines) if (m.id) names.set(m.id, (m.fullName || m.name || "").trim());
  for (const m of floor) if (m.id && (m.name || m.fullName)) names.set(m.id, (m.name || m.fullName || "").trim());
  return (id: string) => names.get(id) || ACADEMY_MOVEMENT_NAME[id] || id;
}

/**
 * Routine A, when the client has one in Firestore (never the profile's
 * `temp-a` stand-in). Either spelling of its name ("Routine A", or an older
 * seeder's "A"), as the briefing, Start, B-follows-A and the Wrap-up find it
 * (`matchesRoutineLetter`): one rule for which routine is A, so no screen
 * here sees "no Routine A" and makes a second one beside it.
 */
export function savedRoutineA(routines: readonly Routine[]): Routine | null {
  return routines.find((r) => matchesRoutineLetter(r, "A") && !!r.id && !r.id.startsWith("temp-")) ?? null;
}

/** Routine B, when the client has one in Firestore (never the profile's `temp-b` stand-in); either spelling, as `savedRoutineA`. */
export function savedRoutineB(routines: readonly Routine[]): Routine | null {
  return routines.find((r) => matchesRoutineLetter(r, "B") && !!r.id && !r.id.startsWith("temp-")) ?? null;
}
