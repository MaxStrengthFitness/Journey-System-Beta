/**
 * Starting routines: admins make them, studios choose (AJ, Oct 8 2026).
 *
 * "studios will chose their own, admins will create the routines to pick
 * from in the app during beta". His answers, "1a 2a 3a GO":
 * - 1a. A starting routine is one of head office's routine presets
 *   (`routinePresets`, company tier, administrators write) with an optional
 *   `start` part (`RoutinePresetStart`); each studio's choice is one config
 *   document, `studios/{s}/config/startingRoutines` (`StartingRoutineChoice`).
 * - 2a. The Academy's eleven are brought in once by a script, renamed without
 *   "female" or "male" (`academyStartingRoutines()` is the transform; the
 *   seed and the fallback before the seed has run both use it).
 * - 3a. A client whose intake names nothing gets the studio's default
 *   starting routine. Gender is used nowhere in choosing a start.
 *
 * So the suggestion (`suggestFromStartingRoutines`) is: the studio's routines
 * whose words appear in the intake; else the studio's default; else head
 * office's; else the trainer picks. Every answer says which, and every
 * alternative is shown by its machines. Nothing here writes; the plan a
 * routine makes (`startingPlanFromRoutine`) is kept only when the trainer
 * keeps it.
 *
 * Machine ids in a starting routine are catalog ids (`m-leg-press`): each
 * studio's floor maps them (`floorIndex`), and a machine the floor lacks is
 * said, step by step, never dropped silently.
 */
import type { RoutinePreset } from "../../types";
import { SELECTION_TEMPLATES, type SelectionPurposeKind, type SelectionTemplate } from "../routine-builder/academy";
import { cleanIds, cleanWords, rawSteps, startKindOf, startingSourceWords } from "./start-part";
import type { RoutinePlan } from "./types";
import {
  TEMPLATE_SOURCE,
  academyRoad,
  academyTemplateName,
  floorCanonical,
  floorIndex,
  repairOrder,
  type AcademyStep,
  type FloorMachine,
  type StartingAlternative,
  type StartingPlan,
  type StartingSuggestion,
} from "./starting-plan";

export interface StartingRoutineStep {
  /** "First workout adds": the words a screen puts beside the step's machines. */
  label: string;
  machineIds: string[];
}

/**
 * The `start` part of a routine preset: what makes a preset a starting
 * routine (`RoutinePreset.start`, src/types.ts). A stored one is read through
 * `startingRoutineFromPreset`, never trusted as it arrives.
 */
export interface RoutinePresetStart {
  /** The machines a first session runs, a subset of the preset's `machineIds`. */
  dayOne: string[];
  /** Labelled groups in the order they join ("First workout adds"). */
  steps?: StartingRoutineStep[];
  /** The words in an intake or a Health note that suggest it. */
  matchWords?: string[];
  /** Head office's default: at most one. Read only on a company routine. */
  default?: boolean;
  /** Where it came from. */
  source?: string;
  /**
   * What it answers, as the Academy sorts its own rows: no reported issues, a
   * condition, or a goal. When an intake names two, a condition's routine
   * outranks a goal's (`matchTemplates`: "a shoulder problem constrains a
   * routine more than a wish for bigger arms"), whatever order the routines
   * were read in. The seed writes the Academy's; a routine without one ranks
   * between the two.
   */
  kind?: SelectionPurposeKind;
}

export interface StartingRoutine {
  id: string;
  name: string;
  /** Catalog ids: the plan's road, in order. */
  machineIds: string[];
  /** The machines a first session runs (catalog ids). */
  dayOne: string[];
  steps?: StartingRoutineStep[];
  /** Lowercase, matched whole-word against the intake (`matchedWord`). */
  matchWords: string[];
  /** Head office's default: only ever a company routine. */
  isDefault: boolean;
  source?: string;
  tier: "company" | "studio";
  studioId?: string;
  /** No reported issues, a condition or a goal (`RoutinePresetStart.kind`). */
  kind?: SelectionPurposeKind;
}

/**
 * A studio's choice (`studios/{s}/config/startingRoutines`). `use: null` is
 * "all of head office's"; any list, an empty one included, is exactly the
 * routines the studio ticked.
 */
export interface StartingRoutineChoice {
  use: string[] | null;
  defaultId: string | null;
}

/** The prefix a seeded Academy row's id carries: `academy-low-back`. */
export const ACADEMY_ROUTINE_PREFIX = "academy-";

/**
 * The two no-reported-issues rows' ids, which say what tells them apart
 * rather than the Academy's sex split its own template ids carry. AJ, "2a":
 * the eleven are brought in "renamed without 'female' or 'male'", and a
 * routine's id is stored where nobody renames it later (every plan's
 * `templateId`, every studio's `use` and `defaultId`, the seeded documents'
 * own ids), so the id is renamed with the name, before the seed first runs.
 * The words are the machines each name says (`academyTemplateName`).
 */
const ACADEMY_ROUTINE_IDS: Readonly<Record<string, string>> = {
  "clear-female": `${ACADEMY_ROUTINE_PREFIX}clear-dip-adduction`,
  "clear-male": `${ACADEMY_ROUTINE_PREFIX}clear-chest-pulldown`,
};

/** A seeded Academy row's id, for the seed and the fallback alike: `academy-knee`, `academy-clear-dip-adduction`. */
export function academyRoutineId(templateId: string): string {
  return ACADEMY_ROUTINE_IDS[templateId] ?? `${ACADEMY_ROUTINE_PREFIX}${templateId}`;
}

/**
 * The Academy template a plan's `templateId` names, or undefined: a starting
 * routine seeded from the Academy (`academy-knee`,
 * `academy-clear-dip-adduction`), or, on a plan made before starting
 * routines existed, the template's own id (`knee`). A routine head office
 * wrote has no Academy template. Every reader of a plan's template goes
 * through here, so the spellings never drift (B's suggested swaps read the
 * template's eventual B).
 */
export function academyTemplateOf(templateId: string | null | undefined): SelectionTemplate | undefined {
  if (!templateId) return undefined;
  const seeded = SELECTION_TEMPLATES.find((t) => academyRoutineId(t.id) === templateId);
  if (seeded) return seeded;
  const id = templateId.startsWith(ACADEMY_ROUTINE_PREFIX) ? templateId.slice(ACADEMY_ROUTINE_PREFIX.length) : templateId;
  return SELECTION_TEMPLATES.find((t) => t.id === id);
}

/**
 * Where a kept plan started, in words, for the Lineup's head and the
 * briefing's kept card (one sentence, both screens): "Started from Low back
 * issues · From the Academy's Exercise Selection Template". The name the
 * plan stored when it was made (`templateName`, any routine an
 * administrator wrote included), else the Academy's for an Academy id; its
 * source as stored, else the Academy's file for an Academy id. "Started from
 * a starting routine" only for a plan made before names were stored from a
 * routine that isn't the Academy's. Null for a plan with no starting routine
 * (every suggestion names its source, and a plan built by hand has none).
 */
export function startedFromWords(
  plan: Pick<RoutinePlan, "templateId" | "templateName" | "templateSource"> | null | undefined,
): string | null {
  if (!plan?.templateId) return null;
  const academy = academyTemplateOf(plan.templateId);
  const name = plan.templateName?.trim() || (academy ? academyTemplateName(academy) : "");
  const source = startingSourceWords(plan.templateSource) ?? (academy ? startingSourceWords(TEMPLATE_SOURCE) : null);
  if (!name) return source ? `Started from a starting routine · ${source}` : "Started from a starting routine";
  return source ? `Started from ${name} · ${source}` : `Started from ${name}`;
}


/** The order a trainer looks for one: no reported issues, conditions, routines with no kind, goals. */
function listRank(r: Pick<StartingRoutine, "kind">): number {
  return r.kind === "clear" ? 0 : r.kind === "condition" ? 1 : r.kind === "goal" ? 3 : 2;
}

/** A match's weight: a condition first, then a routine with no kind, a goal, and no reported issues last. */
function matchRank(r: Pick<StartingRoutine, "kind">): number {
  return r.kind === "condition" ? 0 : r.kind === "goal" ? 2 : r.kind === "clear" ? 3 : 1;
}

/**
 * Routines in the order a trainer looks for one (no reported issues,
 * conditions, routines with no kind, goals), each kind by name: a list read
 * from the database draws the same way whatever order it came back in
 * (`starting-read.ts`).
 */
export function inListOrder(routines: readonly StartingRoutine[]): StartingRoutine[] {
  return [...routines].sort((a, b) => listRank(a) - listRank(b) || a.name.localeCompare(b.name));
}

/** A stable sort: equal ranks keep the order they came in. */
function byRank<T>(list: readonly T[], rank: (x: T) => number): T[] {
  return list
    .map((x, i) => ({ x, i, r: rank(x) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((e) => e.x);
}

/* ── From a stored preset ─────────────────────────────────────────────── */

type StoredPreset = Partial<Pick<RoutinePreset, "id" | "name" | "machineIds" | "tier" | "studioId" | "scope">> & {
  start?: unknown;
};

/**
 * A stored preset as a starting routine, or null when it isn't one: no
 * `start` part, no day one, no id, or a trainer's own saved routine (only
 * head office and a studio make starting routines). A Firestore document is
 * untyped when it arrives, so every field is checked rather than trusted;
 * the tier and the studio are inferred from `scope` as
 * `normalizeRoutinePreset` does.
 *
 * The road always holds day one and every step's machines: a day-one machine
 * the road forgot goes first (day one comes first in time), a step's goes
 * after, so nothing an admin wrote disappears. A step with no label isn't a
 * step a screen can name, so its machines join the road without one and are
 * drawn under "Later in the plan".
 *
 * Only a company routine can be head office's default: a studio's own
 * routine marked default is not, and the studio's default is its choice's
 * `defaultId`, so "Head office's default" is never said of a studio's.
 */
export function startingRoutineFromPreset(preset: StoredPreset | null | undefined): StartingRoutine | null {
  if (!preset || typeof preset.start !== "object" || preset.start === null) return null;
  const id = typeof preset.id === "string" ? preset.id.trim() : "";
  if (!id) return null;
  const scope = typeof preset.scope === "string" && preset.scope ? preset.scope : "global";
  const tier = preset.tier ?? (scope === "global" ? "company" : "trainer");
  if (tier !== "company" && tier !== "studio") return null;

  const start = preset.start as Partial<Record<keyof RoutinePresetStart, unknown>>;
  const dayOne = cleanIds(start.dayOne);
  if (dayOne.length === 0) return null;

  // The start part's fields through its one reader (start-part.ts); a label-less step's machines still join the road.
  const allSteps = rawSteps(start.steps);
  const steps: StartingRoutineStep[] = allSteps.filter((s) => s.label !== "" && s.machineIds.length > 0);

  const road = cleanIds(preset.machineIds);
  const machineIds = [
    ...dayOne.filter((m) => !road.includes(m)),
    ...road,
  ];
  for (const s of allSteps) for (const m of s.machineIds) if (!machineIds.includes(m)) machineIds.push(m);

  const source = typeof start.source === "string" ? start.source.trim() : "";
  const studioId =
    typeof preset.studioId === "string" && preset.studioId
      ? preset.studioId
      : scope !== "global"
        ? scope
        : undefined;
  const kind = startKindOf(start.kind);
  return {
    id,
    name: (typeof preset.name === "string" ? preset.name.trim() : "") || "Starting routine",
    machineIds,
    dayOne,
    ...(steps.length > 0 ? { steps } : null),
    matchWords: cleanWords(start.matchWords),
    isDefault: tier === "company" && start.default === true,
    ...(source ? { source } : null),
    tier,
    ...(tier === "studio" && studioId ? { studioId } : null),
    ...(kind ? { kind } : null),
  };
}

/* ── The Academy's eleven ─────────────────────────────────────────────── */

const KIND_ORDER: Record<SelectionPurposeKind, number> = { clear: 0, condition: 1, goal: 2 };

/**
 * Words the routine builder's `matchTemplates` caught inside a longer word
 * that the whole-word rule (`matchedWord`) would miss, written out so the
 * seed carries them and an admin sees them in the editor: "discectomy" for
 * "disc", "kneecap" and "kneel" for "knee", "gripping" for "grip". The
 * Academy's other short words were caught inside longer words only by
 * accident ("disc" in "discomfort", "abs" in "absolutely", "hand" in
 * "beforehand"), which is why the rule is whole words.
 */
const ACADEMY_WORD_FORMS: Readonly<Record<string, readonly string[]>> = {
  disc: ["discectomy"],
  knee: ["kneecap", "kneel"],
  grip: ["gripping"],
};

/**
 * The Academy's eleven Exercise Selection Template rows as starting routines:
 * the transform the seed writes (`routinePresets/academy-<template>`, the two
 * no-reported-issues rows by `academyRoutineId`'s words) and the fallback
 * Start a plan uses before it has run.
 *
 * - The road is the consultation's machines the second workout leaves out,
 *   then the second workout, repaired against the sequencing rules (the same
 *   road `startingPlanFrom` makes). A first-workout machine the second
 *   workout leaves out (Abduction, in the no-reported-issues row with Seated
 *   Dip) isn't on the road: the second workout is the routine the Academy
 *   repeats "for several subsequent sessions" before A is built.
 * - Day one is the consultation's machines in the road's order, repaired.
 * - The steps say what each workout adds to the road, and only that.
 * - Named without the Academy's sex split (`academyTemplateName`).
 * - Each carries its row's kind, so a match on a condition outranks one on a
 *   goal however the routines come back from the database
 *   (`suggestFromStartingRoutines` ranks by it).
 * - Its words are the row's keywords and the forms the whole-word rule would
 *   otherwise miss (`ACADEMY_WORD_FORMS`).
 * - In the order a trainer looks for one: the two no-reported-issues rows,
 *   then the conditions, then the goals.
 * - Nobody's default: head office picks one in the editor after the seed.
 */
export function academyStartingRoutines(): StartingRoutine[] {
  return [...SELECTION_TEMPLATES]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .map((t) => {
      const machineIds = academyRoad(t);
      const dayOne = repairOrder(machineIds.filter((id) => t.consult.includes(id)));
      const claimed = new Set<string>();
      const adds = (label: string, from: readonly string[]): StartingRoutineStep => {
        const ids = machineIds.filter((id) => from.includes(id) && !claimed.has(id));
        ids.forEach((id) => claimed.add(id));
        return { label, machineIds: ids };
      };
      const steps = [
        adds("Consultation", t.consult),
        adds("First workout adds", t.firstWorkout),
        adds("Second workout adds", t.secondWorkout),
      ].filter((s) => s.machineIds.length > 0);
      return {
        id: academyRoutineId(t.id),
        name: academyTemplateName(t),
        machineIds,
        dayOne,
        steps,
        matchWords: cleanWords([...t.keywords, ...t.keywords.flatMap((k) => ACADEMY_WORD_FORMS[k] ?? [])]),
        isDefault: false,
        source: TEMPLATE_SOURCE,
        tier: "company" as const,
        kind: t.kind,
      };
    });
}

/* ── Matching the intake ──────────────────────────────────────────────── */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The intake's own words for the first of `words` it contains, or null.
 * Whole words, case-insensitive: a word of four letters or fewer matches only
 * as itself or its plural ("disc" and "discs", never "discomfort"; "abs",
 * never "absolutely"), while a longer one also matches as the start of a
 * word, because the Academy's own words include stems ("patell" for patella,
 * "spondyl"). A phrase ("low back") matches across any spacing. Unlike the
 * routine builder's `matchTemplates`, a word never matches inside another
 * ("hand" is not in "beforehand").
 *
 * What comes back is what the intake says, widened to the whole word and
 * lowercased ("patellar", "lower back", "knees"), never the stored stem, so
 * "Matched from the intake: patellar" reads as the intake does.
 */
export function matchedWord(words: readonly string[], text: string | null | undefined): string | null {
  if (!text) return null;
  const hay = text.toLowerCase();
  for (const raw of words) {
    const word = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!word) continue;
    const body = word.split(" ").map(escapeRegExp).join("\\s+");
    const tail = word.replace(/ /g, "").length >= 5 ? "[a-z0-9]*" : "(?:e?s)?(?![a-z0-9])";
    // No lookbehind: older iPads' Safari can't parse one, and a module that
    // fails to parse takes its whole screen with it.
    const found = new RegExp(`(?:^|[^a-z0-9])(${body}${tail})`).exec(hay);
    if (found) return found[1].replace(/\s+/g, " ");
  }
  return null;
}

/* ── The suggestion ───────────────────────────────────────────────────── */

function onFloor(ids: readonly string[], index: Map<string, string>): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const floorId = index.get(id);
    if (floorId && !out.includes(floorId)) out.push(floorId);
  }
  return out;
}

/** Day one and the road together, day one first: a routine made by hand may forget one in the other. */
function roadOf(r: Pick<StartingRoutine, "machineIds" | "dayOne">): string[] {
  return [...r.dayOne.filter((id) => !r.machineIds.includes(id)), ...r.machineIds];
}

/**
 * A routine's steps on this floor: its own steps (each only the machines it
 * adds), with day one first when no step holds it, and the rest of the road
 * last as "Later in the plan". Each step's machines in the road's order; a
 * machine the floor lacks is listed under its step.
 */
function routineSteps(r: StartingRoutine, index: Map<string, string>): AcademyStep[] {
  const road = roadOf(r);
  const named = r.steps && r.steps.length > 0 ? r.steps : [{ label: "Day one", machineIds: r.dayOne }];
  const inNamed = new Set(named.flatMap((s) => s.machineIds));
  const groups: StartingRoutineStep[] = [];
  const dayOneLeft = r.dayOne.filter((id) => !inNamed.has(id));
  if (dayOneLeft.length > 0) groups.push({ label: "Day one", machineIds: dayOneLeft });
  groups.push(...named);
  const covered = new Set(groups.flatMap((g) => g.machineIds));
  const rest = road.filter((id) => !covered.has(id));
  if (rest.length > 0) groups.push({ label: "Later in the plan", machineIds: rest });

  const seen = new Set<string>();
  const position = (id: string) => {
    const at = road.indexOf(id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const out: AcademyStep[] = [];
  for (const g of groups) {
    const ids = g.machineIds.filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    ids.sort((a, b) => position(a) - position(b));
    const machineIds = onFloor(ids, index);
    const missing = ids.filter((id) => !index.has(id));
    if (machineIds.length === 0 && missing.length === 0) continue;
    out.push({ key: `step-${out.length + 1}`, label: g.label, machineIds, missing });
  }
  return out;
}

export interface StartingRoutinesInput {
  /** Head office's starting routines (and a studio's own), or the Academy's eleven before the seed has run. */
  routines: readonly StartingRoutine[];
  /** The studio's choice, or null when it hasn't made one (all of them, no studio default). */
  choice: StartingRoutineChoice | null;
  /** The intake's words: medical history, goals, the clinical profile, open Health notes. */
  intakeText?: string | null;
  floor: readonly FloorMachine[];
  /** A starting routine the trainer picked, overriding the rest. */
  pickedId?: string | null;
  /** The studio's name, for "Westlake's default". */
  studioName?: string | null;
}

/**
 * Which starting routine fits, and why. In order:
 * 1. the one the trainer picked;
 * 2. the studio's routines whose words appear in the intake, a condition's
 *    before a goal's, then in the order a trainer looks for one ("Matched
 *    from the intake: low back");
 * 3. the studio's default ("Westlake's default");
 * 4. head office's default, a company routine only ("Head office's default");
 * 5. none: the trainer picks ("Pick which starting routine fits").
 * The studio's routines are exactly its choice's `use`, or all of head
 * office's when it hasn't chosen (`use: null`, the design round's §4.2). A
 * studio that ticked none, or whose every pick head office has since
 * retired, is offered none rather than routines it left out: `needsChoice`
 * with no alternatives, and the sentence says so. A routine with no machine
 * on this floor isn't offered. The order the routines arrive in never
 * decides anything: they are ranked by kind, then kept as they came. Gender
 * is never read.
 */
export function suggestFromStartingRoutines(input: StartingRoutinesInput): StartingSuggestion {
  const index = floorIndex(input.floor);
  const use = input.choice?.use ?? null;
  const inUse = use === null ? [...input.routines] : input.routines.filter((r) => use.includes(r.id));
  const available = byRank<StartingRoutine>(
    inUse.filter((r) => onFloor(roadOf(r), index).length > 0),
    listRank,
  );

  const matches = byRank<{ r: StartingRoutine; word: string }>(
    available
      .map((r) => ({ r, word: matchedWord(r.matchWords, input.intakeText) }))
      .filter((m): m is { r: StartingRoutine; word: string } => m.word !== null),
    (m) => matchRank(m.r),
  );

  let chosen: StartingRoutine | null = null;
  let why: string;
  const studio = input.studioName?.trim();
  const picked = input.pickedId ? available.find((r) => r.id === input.pickedId) : undefined;
  const studioDefault = input.choice?.defaultId ? available.find((r) => r.id === input.choice?.defaultId) : undefined;
  const headOfficeDefault = available.find((r) => r.isDefault && r.tier === "company");
  if (picked) {
    chosen = picked;
    why = "Your pick";
  } else if (matches.length > 0) {
    chosen = matches[0].r;
    why = `Matched from the intake: ${matches[0].word}`;
  } else if (studioDefault) {
    chosen = studioDefault;
    why = studio ? `${studio}'s default` : "This studio's default";
  } else if (headOfficeDefault) {
    chosen = headOfficeDefault;
    why = "Head office's default";
  } else if (inUse.length === 0 && use !== null) {
    why = `${studio || "This studio"} has no starting routines chosen`;
  } else if (inUse.length === 0) {
    why = "There are no starting routines yet";
  } else if (available.length === 0) {
    why = "No starting routine has a machine on this floor";
  } else {
    why = "Pick which starting routine fits";
  }

  const alternatives: StartingAlternative[] = [...matches.map((m) => m.r), ...available]
    .filter((r, i, all) => r.id !== chosen?.id && all.findIndex((x) => x.id === r.id) === i)
    .map((r) => ({ templateId: r.id, label: r.name, machineIds: onFloor(roadOf(r), index) }));

  return {
    templateId: chosen?.id ?? null,
    label: chosen?.name ?? null,
    why,
    source: chosen?.source ?? null,
    steps: chosen ? routineSteps(chosen, index) : [],
    needsChoice: chosen === null,
    alternatives,
  };
}

/**
 * A starting routine's road on this floor and its day one, as the plan
 * builder makes them (below): the one place a start's catalog ids become
 * this floor's units. The session corner's Start from a routine… lays day
 * one from here (`start-from.ts`), so the two never drift.
 */
export function startingRoad(
  routine: Pick<StartingRoutine, "machineIds" | "dayOne">,
  floor: readonly FloorMachine[],
): { intended: string[]; startWith: string[] } {
  const index = floorIndex(floor);
  const intended = onFloor(roadOf(routine), index);
  const dayOne = onFloor(routine.dayOne, index);
  const dayOneHere = intended.filter((id) => dayOne.includes(id));
  const startWith = repairOrder(
    dayOneHere.length > 0 ? dayOneHere : intended.slice(0, Math.max(1, routine.dayOne.length)),
    floorCanonical(floor),
  );
  return { intended, startWith };
}

/**
 * The plan a starting routine makes on this floor, before any trainer has
 * changed it: the road on this floor's ids, in its order, being built, with
 * day one (on this floor, in the plan's order, repaired against the
 * sequencing rules, since a subset can put two machines side by side that the
 * road kept apart) kept on the plan as `dayOne` and returned as `startWith`
 * (a list of its own: a draft edits `plan.dayOne`, the one Keep this lineup
 * writes).
 * A machine the floor lacks isn't on the plan; the suggestion's steps say
 * which.
 *
 * Day one is the first visit's machines, never Routine A's: the consult is
 * not Routine A (AJ, Oct 8 2026: "this also counts with the consult visit,
 * sometimes the consult machines will not be the same as their a routine").
 * The plan's first write leaves Routine A empty (`startPlan` with no
 * machines), a session runs day one while Routine A has nothing
 * (`todayFor`), and the Wrap-up asks which of today's machines start it.
 *
 * When none of day one is on this floor (a studio whose Leg Press is its own
 * unit the catalog doesn't know), day one is the road's first machines on
 * this floor, as many as day one names, so the first visit never opens with
 * nothing to run; the suggestion's steps still list day one's machines as
 * missing, so the screen says why.
 */
export function startingPlanFromRoutine(
  routine: StartingRoutine,
  who: { uid: string; name?: string },
  floor: readonly FloorMachine[],
  todayYmd: string,
): StartingPlan {
  const { intended, startWith } = startingRoad(routine, floor);
  return {
    plan: {
      purpose: "Learning the protocol: the starting routine",
      purposeKinds: ["core"],
      intended,
      dayOne: [...startWith],
      building: true,
      templateId: routine.id,
      // Its name and source as they are now, so a screen names the start with no second read.
      ...(routine.name.trim() ? { templateName: routine.name.trim().slice(0, 200) } : null),
      ...(routine.source?.trim() ? { templateSource: routine.source.trim().slice(0, 500) } : null),
      madeByUid: who.uid,
      ...(who.name ? { madeByName: who.name } : null),
      madeAt: todayYmd,
    },
    startWith,
  };
}
