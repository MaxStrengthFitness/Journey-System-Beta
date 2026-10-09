/**
 * A starting plan for a client new to the studio, from the Academy's own
 * templates (AJ, Oct 7 2026: "they're going to go through the leg press.
 * Possibly the compound row. Also maybe the lumbar. ... the trainer should be
 * able to definitely customize this and change it. Routines need to be very
 * modular").
 *
 * The Academy's Exercise Selection Template (`SELECTION_TEMPLATES`, Academy 6
 * `Programming and Progression 7`) gives, for each kind of client, the
 * consultation's machines, the first and second workouts, and the eventual A
 * and B. They were in the code and nothing read the first three until now.
 * The document's own framing stands: "these are just suggestions and can be
 * used more for guidelines or ideas rather than formal rules", so this offers,
 * names its source, and writes nothing.
 *
 * The plan it makes:
 * - starts with the consultation's machines ("Leg Press plus one more,
 *   preferably compound row", Programming and Progression 1);
 * - intends, by default, the second workout: the learning-curve routine that
 *   "may be repeated for several subsequent sessions" before A is built
 *   (Programming and Progression 2), so the plan reads "3 of 6" rather than
 *   promising the model A the Academy puts two months out. A trainer may aim
 *   it at the eventual A instead;
 * - keeps only machines on the studio's floor, and says which it couldn't.
 *
 * Since the design round (Oct 8 2026) the screens start from starting
 * routines, which admins make and studios choose (`starting-routines.ts`);
 * the Academy's eleven are its fallback, built from these templates by
 * `academyStartingRoutines()`. This file keeps the templates' own path and
 * the floor helpers both use.
 *
 * Gender is used nowhere (AJ, Oct 8 2026, "3a": "A client whose intake names
 * nothing gets the studio's default starting routine. Gender is used nowhere
 * in choosing a start"). The Academy's two "no reported issues" rows were
 * picked by Mindbody's gender until then; now an intake that names nothing
 * leaves the pick to the trainer, and the two rows are named by what tells
 * them apart, never by sex (`academyTemplateName`).
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import { SELECTION_TEMPLATES, matchTemplates, type SelectionTemplate } from "../routine-builder/academy";
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

export type AcademyStepKey = "consult" | "first" | "second" | "eventualA" | "eventualB";

export const STEP_LABEL: Record<AcademyStepKey, string> = {
  consult: "Consultation",
  first: "First workout",
  second: "Second workout",
  eventualA: "Eventual A",
  eventualB: "Eventual B",
};

export interface AcademyStep {
  /**
   * Which step: an Academy template's `AcademyStepKey`, or, for a starting
   * routine, `step-1`, `step-2` ... in the order the steps join.
   */
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

function stepOf(key: AcademyStepKey, ids: readonly string[], index: Map<string, string>): AcademyStep {
  const machineIds: string[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const onFloor = index.get(id);
    if (onFloor) {
      if (!machineIds.includes(onFloor)) machineIds.push(onFloor);
    } else if (!missing.includes(id)) missing.push(id);
  }
  return { key, label: STEP_LABEL[key], machineIds, missing };
}

function stepsFor(t: SelectionTemplate, index: Map<string, string>): AcademyStep[] {
  return [
    stepOf("consult", t.consult, index),
    stepOf("first", t.firstWorkout, index),
    stepOf("second", t.secondWorkout, index),
    stepOf("eventualA", t.eventualA, index),
    stepOf("eventualB", t.eventualB, index),
  ];
}

/**
 * A template's road in catalog ids: the consultation's machines the second
 * workout leaves out, then the second workout, repaired against the
 * sequencing rules when the two had to be joined. The same road
 * `startingPlanFrom` makes on a floor, and the one the seed writes.
 */
export function academyRoad(t: Pick<SelectionTemplate, "consult" | "secondWorkout">): string[] {
  const extras = t.consult.filter((id) => !t.secondWorkout.includes(id));
  return extras.length > 0 ? repairOrder([...extras, ...t.secondWorkout]) : [...t.secondWorkout];
}

function onFloor(ids: readonly string[], index: Map<string, string>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const floorId = index.get(id);
    if (floorId && !out.includes(floorId)) out.push(floorId);
  }
  return out;
}

export interface StartingInput {
  /** The intake's words: medical history, goals, the clinical profile, open Health notes. */
  intakeText?: string | null;
  floor: readonly FloorMachine[];
  /** A template the trainer picked, overriding the match. */
  templateId?: string | null;
}

export function suggestStartingPlan(input: StartingInput): StartingSuggestion {
  const index = floorIndex(input.floor);
  const matched = matchTemplates(input.intakeText);

  let chosen: SelectionTemplate | null = null;
  let why: string;
  const picked = input.templateId ? SELECTION_TEMPLATES.find((t) => t.id === input.templateId) : undefined;
  if (picked) {
    chosen = picked;
    why = `The Academy's template the trainer picked: ${academyTemplateName(picked)}.`;
  } else if (matched.length > 0) {
    chosen = matched[0];
    why = `From the Academy's template for ${sayableTemplateLabel(chosen).toLowerCase()}, matched from the intake.`;
  } else {
    why = "Nothing in the intake names a condition. Pick which of the Academy's starting templates fits.";
  }

  // Matched templates first, then the rest in the Academy's order.
  const alternatives = [...matched, ...SELECTION_TEMPLATES]
    .filter((t, i, all) => t.id !== chosen?.id && all.findIndex((x) => x.id === t.id) === i)
    .map((t) => ({ templateId: t.id, label: academyTemplateName(t), machineIds: onFloor(academyRoad(t), index) }));

  return {
    templateId: chosen?.id ?? null,
    label: chosen ? academyTemplateName(chosen) : null,
    why,
    source: TEMPLATE_SOURCE,
    steps: chosen ? stepsFor(chosen, index) : [],
    needsChoice: chosen === null,
    alternatives,
  };
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
 * The plan a suggestion makes, before any trainer has changed it.
 * `through` is the step the plan aims at: the second workout by default.
 * Day one rides on the plan (`dayOne`), never in Routine A.
 */
export function startingPlanFrom(
  s: StartingSuggestion,
  who: { uid: string; name?: string },
  through: "second" | "eventualA" = "second",
): StartingPlan {
  const consult = s.steps.find((x) => x.key === "consult")?.machineIds ?? [];
  const target = s.steps.find((x) => x.key === through)?.machineIds ?? [];
  // The consultation's machines come first in time; a template whose
  // consultation machine isn't in the target keeps it (the trainer swaps it
  // out later, the way the Academy's own path does), and the order is then
  // repaired against the sequencing rules.
  const extras = consult.filter((id) => !target.includes(id));
  const intended = extras.length > 0 ? repairOrder([...extras, ...target]) : [...target];
  // Day one is the plan's order with only the consultation's machines in,
  // which can leave two machines side by side that the plan kept apart
  // (Lumbar straight into Leg Press once Compound Row isn't between them),
  // so it is repaired against the sequencing rules too.
  const startWith = repairOrder(intended.filter((id) => consult.includes(id)));
  return {
    plan: {
      purpose: through === "second" ? "Learning the protocol: the starting routine" : "The core: the routine the client is built on",
      purposeKinds: ["core"],
      intended,
      dayOne: [...startWith],
      building: true,
      ...(s.templateId ? { templateId: s.templateId } : null),
      madeByUid: who.uid,
      ...(who.name ? { madeByName: who.name } : null),
    },
    startWith,
  };
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
