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
 */
import { canonicalMachineId } from "../catalog/machine-identity";
import {
  SELECTION_TEMPLATES,
  matchTemplates,
  preferenceFromGender,
  type SelectionTemplate,
} from "../routine-builder/academy";
import { autoSequence } from "../routine-builder/engine";
import type { RoutinePlan } from "./types";

const TEMPLATE_SOURCE =
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
  key: AcademyStepKey;
  label: string;
  /** The step's machines that are on this floor, as floor ids, in the Academy's order. */
  machineIds: string[];
  /** The step's machines this floor doesn't have (catalog ids). */
  missing: string[];
}

export interface StartingSuggestion {
  templateId: string;
  /** The template's name without the Academy's sex split ("No reported issues"): the app never says a client's gender. */
  label: string;
  /** Why this template, in a sentence a trainer can read aloud. */
  why: string;
  source: string;
  steps: AcademyStep[];
  /**
   * True when Journey had nothing to choose the row by (no condition in the
   * intake and no gender from Mindbody): the trainer picks the row.
   */
  needsChoice: boolean;
  /** Every other template that could apply, so the trainer can switch. */
  alternatives: Array<{ templateId: string; label: string }>;
}

/** The template's name as a screen may say it. */
export function sayableTemplateLabel(t: Pick<SelectionTemplate, "label">): string {
  return t.label.replace(/\s+—\s+(female|male)$/i, "");
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

export interface StartingInput {
  /** The intake's words: medical history, goals, the clinical profile, open Health notes. */
  intakeText?: string | null;
  /** Mindbody's gender, used only to pick between the Academy's two "no reported issues" rows; never shown. */
  gender?: string | null;
  floor: readonly FloorMachine[];
  /** A template the trainer picked, overriding the match. */
  templateId?: string | null;
}

export function suggestStartingPlan(input: StartingInput): StartingSuggestion {
  const index = floorIndex(input.floor);
  const matched = matchTemplates(input.intakeText);
  const preference = preferenceFromGender(input.gender);
  const clear = SELECTION_TEMPLATES.filter((t) => t.kind === "clear");
  const clearForClient =
    clear.find((t) => t.id === `clear-${preference}`) ?? clear[0];

  let chosen: SelectionTemplate;
  let why: string;
  let needsChoice = false;
  const picked = input.templateId ? SELECTION_TEMPLATES.find((t) => t.id === input.templateId) : undefined;
  if (picked) {
    chosen = picked;
    why = `The Academy's template the trainer picked: ${sayableTemplateLabel(picked)}.`;
  } else if (matched.length > 0) {
    chosen = matched[0];
    why = `From the Academy's template for ${sayableTemplateLabel(chosen).toLowerCase()}, matched from the intake.`;
  } else {
    chosen = clearForClient;
    needsChoice = preference === "neutral";
    why = needsChoice
      ? "Nothing in the intake names a condition. Pick which of the Academy's starting templates fits."
      : "Nothing in the intake names a condition: the Academy's starting template.";
  }

  const alternatives = [...matched, ...clear]
    .filter((t, i, all) => t.id !== chosen.id && all.findIndex((x) => x.id === t.id) === i)
    .map((t) => ({ templateId: t.id, label: sayableTemplateLabel(t) }));

  return {
    templateId: chosen.id,
    label: sayableTemplateLabel(chosen),
    why,
    source: TEMPLATE_SOURCE,
    steps: stepsFor(chosen, index),
    needsChoice,
    alternatives,
  };
}

export interface StartingPlan {
  plan: RoutinePlan;
  /** The routine's machines on day one: the consultation's, in the plan's order. */
  startWith: string[];
}

/**
 * The plan a suggestion makes, before any trainer has changed it.
 * `through` is the step the plan aims at: the second workout by default.
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
  const intended = extras.length > 0 ? orderOnFloor([...extras, ...target]) : [...target];
  // Day one is the plan's order with only the consultation's machines in,
  // which can leave two machines side by side that the plan kept apart
  // (Lumbar straight into Leg Press once Compound Row isn't between them),
  // so it is repaired against the sequencing rules too.
  const startWith = orderOnFloor(intended.filter((id) => consult.includes(id)));
  return {
    plan: {
      purpose: through === "second" ? "Learning the protocol: the starting routine" : "The core: the routine the client is built on",
      purposeKinds: ["core"],
      intended,
      building: true,
      templateId: s.templateId,
      madeByUid: who.uid,
      ...(who.name ? { madeByName: who.name } : null),
    },
    startWith,
  };
}

/**
 * The sequencing rules work on catalog ids; a plan holds floor ids. Repair the
 * order on the catalog ids and map back, keeping a unit the rules don't know
 * where the trainer put it.
 */
function orderOnFloor(ids: readonly string[]): string[] {
  const canonical = ids.map((id) => canonicalMachineId(id));
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
