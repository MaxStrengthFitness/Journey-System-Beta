/**
 * The Academy's starting templates and the floor helpers every starting
 * routine reads (AJ, Oct 7 2026: "they're going to go through the leg press.
 * Possibly the compound row. Also maybe the lumbar. ... the trainer should be
 * able to definitely customize this and change it. Routines need to be very
 * modular").
 *
 * The Academy's Exercise Selection Template (`SELECTION_TEMPLATES`, Academy 6
 * `Programming and Progression 7`) gives, for each kind of client, the
 * consultation's machines, the first and second workouts, and the eventual A
 * and B. The document's own framing stands: "these are just suggestions and
 * can be used more for guidelines or ideas rather than formal rules".
 *
 * What lives here:
 * - a template's road (`academyRoad`: the consultation's machines, then the
 *   second workout, the learning-curve routine that "may be repeated for
 *   several subsequent sessions" before A is built, Programming and
 *   Progression 2), the one `academyStartingRoutines()` (starting-routines.ts)
 *   and the seed build the Academy's eleven from;
 * - a template's name, never with the sex split (`academyTemplateName`);
 * - the floor helpers (`floorIndex`, `floorCanonical`) and the sequencing
 *   repair (`repairOrder`);
 * - the suggestion's shape (`StartingSuggestion`), which
 *   `suggestFromStartingRoutines` returns.
 * The plan a start makes is starting-routines.ts's `startingPlanFromRoutine`,
 * the one builder (the whole-branch review, Oct 9 2026: a second, older
 * builder from the templates themselves had stayed here, read by tests only,
 * and was deleted so the two could never drift).
 *
 * Gender is used nowhere (AJ, Oct 8 2026, "3a": "A client whose intake names
 * nothing gets the studio's default starting routine. Gender is used nowhere
 * in choosing a start"). The Academy's two "no reported issues" rows are
 * named by what tells them apart, never by sex (`academyTemplateName`).
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import type { SelectionTemplate } from "../routine-builder/academy";
import { autoSequence } from "../routine-builder/engine";
import type { RoutinePlan } from "./types";

export const TEMPLATE_SOURCE =
  "docs/msf-academy/Academy 6 - General Recommendations for Programming and Progression/Programming and Progression 7 - Exercise Selection Template.txt";

export interface FloorMachine {
  id: string;
  name?: string;
  /** The catalog machine a studio's unit is, when the floor knows it. */
  canonicalId?: string;
}

export interface AcademyStep {
  /** Which step: `step-1`, `step-2` ... in the order a starting routine's steps join. */
  key: string;
  label: string;
  /** The step's machines that are on this floor, as floor ids, in order. */
  machineIds: string[];
  /** The step's machines this floor doesn't have (catalog ids). */
  missing: string[];
}

export interface StartingAlternative {
  templateId: string;
  label: string;
  /**
   * Its road on this floor, in order (floor ids). A screen shows the first
   * few, so two starts with similar names are told apart by their machines.
   */
  machineIds: string[];
}

export interface StartingSuggestion {
  /** The template or starting routine picked, or null when the trainer has to pick (`needsChoice`). */
  templateId: string | null;
  /** Its name as a screen says it, never with the Academy's sex split; null with no pick. */
  label: string | null;
  /** Why this one, in a sentence a trainer can read aloud. */
  why: string;
  /** Where it came from (a document path, or head office's words), when known. */
  source: string | null;
  /** Empty when nothing is picked. */
  steps: AcademyStep[];
  /**
   * True when Journey had nothing to choose by: no condition in the intake
   * and no default. The trainer picks; nothing is picked for them.
   */
  needsChoice: boolean;
  /** Every other start that could apply, matched ones first, so the trainer can switch. */
  alternatives: StartingAlternative[];
}

/** The template's name as a screen may say it. */
export function sayableTemplateLabel(t: Pick<SelectionTemplate, "label">): string {
  return t.label.replace(/\s+—\s+(female|male)$/i, "");
}

/**
 * The Academy's two "no reported issues" rows, named by what tells them
 * apart rather than by sex: each name is two machines its road has and the
 * other's hasn't (the test holds that). The condition and goal rows keep
 * their label.
 */
const CLEAR_ROW_NAME: Record<string, string> = {
  "clear-female": "No reported issues · with Seated Dip and Adduction",
  "clear-male": "No reported issues · with Chest Press and Pulldown",
};

/** A template's name for a screen and for the seed: never "female" or "male". */
export function academyTemplateName(t: Pick<SelectionTemplate, "id" | "label">): string {
  return CLEAR_ROW_NAME[t.id] ?? sayableTemplateLabel(t);
}

/** Catalog id → this floor's id for it (the first unit on the floor). */
export function floorIndex(floor: readonly FloorMachine[]): Map<string, string> {
  const byCanonical = new Map<string, string>();
  for (const m of floor) {
    const canonical = m.canonicalId ?? canonicalMachineId(m.id, m.name);
    if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, m.id);
  }
  return byCanonical;
}

/**
 * Floor id → the catalog machine it is: what the floor says first (a studio's
 * unit `unit-7` knows it is `m-leg-press`), else `canonicalMachineId`. The
 * Academy's rules and tables read catalog ids; a plan holds floor ids.
 */
export function floorCanonical(floor: readonly FloorMachine[]): (id: string) => string {
  const byFloorId = new Map<string, string>();
  for (const m of floor) byFloorId.set(m.id, m.canonicalId ?? canonicalMachineId(m.id, m.name));
  return (id: string) => byFloorId.get(id) ?? canonicalMachineId(id);
}

/**
 * A template's road in catalog ids: the consultation's machines the second
 * workout leaves out, then the second workout, repaired against the
 * sequencing rules when the two had to be joined. The road
 * `academyStartingRoutines()` makes each of the eleven with, and the one the
 * seed writes.
 */
export function academyRoad(t: Pick<SelectionTemplate, "consult" | "secondWorkout">): string[] {
  const extras = t.consult.filter((id) => !t.secondWorkout.includes(id));
  return extras.length > 0 ? repairOrder([...extras, ...t.secondWorkout]) : [...t.secondWorkout];
}

export interface StartingPlan {
  /** The plan, its day one (`plan.dayOne`) included. */
  plan: RoutinePlan;
  /**
   * Day one: the first visit's machines, the consultation's, in the plan's
   * order; the same machines as `plan.dayOne`, as a list of its own, so a
   * draft that changes one never changes the other (a screen's draft edits
   * `plan.dayOne`, the list Keep this lineup writes). Never Routine A's: the
   * consult is not Routine A (AJ, Oct 8 2026: "sometimes the consult
   * machines will not be the same as their a routine"), so the plan's first
   * write leaves Routine A empty and a session runs day one while it is
   * (`todayFor`).
   */
  startWith: string[];
}

/**
 * The sequencing rules work on catalog ids; a plan holds floor ids. Repair the
 * order on the catalog ids and map back, keeping a unit the rules don't know
 * where the trainer put it. `canonicalOf` is the floor's own answer when the
 * caller has the floor (`floorCanonical`).
 */
export function repairOrder(
  ids: readonly string[],
  canonicalOf: (id: string) => string = (id) => canonicalMachineId(id),
): string[] {
  const canonical = ids.map((id) => canonicalOf(id));
  const ordered = autoSequence(canonical);
  const used = new Set<number>();
  const out: string[] = [];
  for (const c of ordered) {
    const i = canonical.findIndex((x, j) => x === c && !used.has(j));
    if (i >= 0) {
      used.add(i);
      out.push(ids[i]);
    }
  }
  ids.forEach((id, j) => {
    if (!used.has(j)) out.push(id);
  });
  return out;
}
