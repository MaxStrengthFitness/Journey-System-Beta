/**
 * EVERY NAME A MACHINE GOES BY — the Catalog's name table.
 *
 * Round: the Machine Catalog, Sep 28 2026 (redesign, Catalog R1 "Find and the
 * names"). AJ picked "Floor first, codex behind", and question 1 of the room
 * took its default: MOVEMENTS take the Academy's names (Lumbar Extension,
 * Cervical Extension, Biceps Curl), each studio's UNIT keeps its floor name
 * (LUMBAR, CX (4 WAY NECK)), and Find knows both.
 *
 * WHY THIS EXISTS
 * ---------------
 * One machine had four names on four screens and each screen knew one. The
 * Academy tab said Low Back, Rowing Back, Torso Arm and Pec Fly; the Catalog
 * and the session said LUMBAR, SIMPLE ROW, PULLDOWN and CHEST/PEC FLY; the
 * Academy's own documents say Lumbar Extension, Simple Row, Pulldown and Chest
 * Flye; FileMaker's grid said "comp row" and "lat raise". Search matched the
 * floor's name, the code and the muscles, so "low back" found nothing.
 *
 * NOTHING HERE IS NEW DATA
 * ------------------------
 * Every alias is read from a name table that was already in the code:
 *
 *   ACADEMY_MOVEMENT_NAME     the Academy's own headings, written out below and
 *                             pinned to docs/msf-academy by names.test.ts
 *   DEFAULT_MACHINES          the standard set's floor names ("LUMBAR")
 *   MACHINE_DATABASE          the Academy tab's and the makers' names
 *                             ("Low Back", "Torso Arm", "Rotary Torso")
 *   DB_KEY_TO_CANONICAL       the database keys ("leg_press")
 *   FILEMAKER_MACHINE_NAMES   how FileMaker's grid wrote them ("comp row")
 *   MACHINE_ABBR + ACADEMY_CODES  the Academy's codes ("Lumb", "Cx", "Bi")
 *
 * Nothing in the database changes. Head office editing aliases is a later
 * round and needs AJ's OK (the room's Needs OK list).
 *
 * WHICH ALIASES MAY OPEN A MACHINE ON THEIR OWN
 * ---------------------------------------------
 * An exact alias puts its machine at the very top of Find (Raycast's rule).
 * That is only safe for a name that means one movement: FileMaker's
 * "extension" is the Leg Extension on its grid, but the word is also in
 * Lumbar, Triceps and Cervical Extension, so it stays an ordinary alias and
 * ranks those four together. `exact` is the safe subset (Algolia's warning:
 * "overusing synonyms can lead to unexpected results").
 *
 * PURE MODULE — no React, no Firestore.
 */

import { DEFAULT_MACHINES } from "../../data/default-machines";
import { MACHINE_DATABASE } from "../../data/machine-database";
import { FILEMAKER_MACHINE_NAMES } from "../machine-fit/shorthand";
import { MACHINE_ABBR } from "../routine-builder/academy";
import { DB_KEY_TO_CANONICAL, canonicalMachineId } from "./machine-identity";

/**
 * The Academy's name for each of the twenty movements: the headings of the
 * standardized setup guides (docs/msf-academy/Set Up Machines/
 * standardized-setup-guide-batch{1..4}.md), with a bracketed body part dropped
 * ("Abduction (Hips/Glutes)" is "Abduction"). The same twenty headings the
 * generator of data/machine-definitions.ts reads. Listed in the Academy's
 * order of the five families, which is also the order All MSF uses.
 */
export const ACADEMY_MOVEMENT_NAME: Record<string, string> = {
  // Upper Body — Pull
  "m-compound-row": "Compound Row",
  "m-pulldown": "Pulldown",
  "m-pullover": "Pullover",
  "m-simple-row": "Simple Row",
  "m-bicep": "Biceps Curl",
  // Upper Body — Push
  "m-chest-press": "Chest Press",
  "m-overhead-press": "Overhead Press",
  "m-lateral-raise": "Lateral Raise",
  "m-chest-fly": "Chest Flye",
  "m-dip": "Seated Dip",
  "m-tricep-ext": "Triceps Extension",
  // Lower Body
  "m-leg-press": "Leg Press",
  "m-ext": "Leg Extension",
  "m-leg-curl": "Leg Curl",
  // Trunk / Spine / Core
  "m-lumbar": "Lumbar Extension",
  "m-neck": "Cervical Extension",
  "m-abs": "Abdominals",
  "m-torso-rotation": "Torso Rotation",
  // Hips
  "m-hip-abd": "Abduction",
  "m-hip-add": "Adduction",
};

/** The twenty, in the order above. */
export const MOVEMENT_IDS: readonly string[] = Object.keys(ACADEMY_MOVEMENT_NAME);

/**
 * The Academy's other names for a movement: a machine name in a heading's
 * brackets ("Pulldown (Torso Arm)", "Lumbar Extension (Lower Back)",
 * "Cervical Extension (Neck)") and the deep dive's ("Lumbar Extension
 * (Lumbar, Lower Back)"). A bracketed BODY PART is not a name — "Hips/Glutes"
 * would make "glutes" open the Abduction and nothing else.
 */
const ACADEMY_OTHER_NAMES: Record<string, readonly string[]> = {
  "m-pulldown": ["Torso Arm"],
  "m-lumbar": ["Lower Back", "Lumbar"],
  "m-neck": ["Neck"],
};

/**
 * The Academy's codes beyond MACHINE_ABBR: the quick cards' and the spoken
 * scripts' own ("Bi", "CF", "Tri"). names.test.ts reads the corpus's cards and
 * scripts and fails if one of their codes is missing here.
 */
const ACADEMY_CODES: Record<string, readonly string[]> = {
  "m-bicep": ["Bi"],
  "m-chest-fly": ["CF"],
  "m-tricep-ext": ["Tri"],
  "m-hip-abd": ["Abd"],
  "m-hip-add": ["Add"],
};

export interface MovementNames {
  /** The canonical catalog id ("m-lumbar"). */
  id: string;
  /** The Academy's name: what the movement is called in the Catalog. */
  name: string;
  /** The Academy's code, as a routine is written ("Lumb"). Null when it has none. */
  code: string | null;
  /** Every code the Academy writes for it, the main one first. */
  codes: string[];
  /** The standard set's floor name ("LUMBAR"). */
  floorName: string | null;
  /** Every other name, each once, in the order the tables above give them. */
  aliases: string[];
  /** Normalised names that open this movement on their own in Find. */
  exact: string[];
}

/** Lower-case, accents stripped, anything but letters and digits to one space. */
export function normaliseName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A name as a person would read it: FileMaker's lower-case "comp row" becomes "Comp row". */
function asWritten(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function dbKeysOf(id: string): string[] {
  return Object.entries(DB_KEY_TO_CANONICAL)
    .filter(([, canonical]) => canonical === id)
    .map(([key]) => key);
}

function build(): Record<string, MovementNames> {
  const floorById = new Map(DEFAULT_MACHINES.map((m) => [m.id ?? "", m.name]));

  // First pass: every name each movement goes by, in reading form.
  const raw = new Map<string, string[]>();
  for (const id of MOVEMENT_IDS) {
    const dbNames = dbKeysOf(id).flatMap((key) => [MACHINE_DATABASE[key]?.name ?? "", key.replace(/_/g, " ")]);
    // The floor name first, so its spelling ("LUMBAR") is the one kept when
    // another table has the same name ("Lumbar").
    raw.set(id, [
      floorById.get(id) ?? "",
      ...(ACADEMY_OTHER_NAMES[id] ?? []),
      ...dbNames,
      ...(FILEMAKER_MACHINE_NAMES[id] ?? []),
    ]);
  }

  // Which normalised names more than one movement claims, and every WORD of
  // every movement's own names — an alias that is one of another movement's
  // words cannot open this one by itself.
  const claimedBy = new Map<string, Set<string>>();
  const wordsOf = new Map<string, Set<string>>();
  for (const id of MOVEMENT_IDS) {
    const own = [ACADEMY_MOVEMENT_NAME[id], ...(ACADEMY_OTHER_NAMES[id] ?? []), floorById.get(id) ?? ""];
    wordsOf.set(id, new Set(own.flatMap((n) => normaliseName(n).split(" ")).filter(Boolean)));
    for (const name of [ACADEMY_MOVEMENT_NAME[id], ...(raw.get(id) ?? [])]) {
      const key = normaliseName(name);
      if (!key) continue;
      (claimedBy.get(key) ?? claimedBy.set(key, new Set()).get(key)!).add(id);
    }
  }
  const isAnotherMovementsWord = (key: string, id: string) =>
    !key.includes(" ") && MOVEMENT_IDS.some((other) => other !== id && wordsOf.get(other)!.has(key));

  const out: Record<string, MovementNames> = {};
  for (const id of MOVEMENT_IDS) {
    const name = ACADEMY_MOVEMENT_NAME[id];
    const main = MACHINE_ABBR[id] ?? null;
    const codes = [...new Set([...(main ? [main] : []), ...(ACADEMY_CODES[id] ?? [])])];
    const seen = new Set([normaliseName(name)]);
    const aliases: string[] = [];
    for (const n of [...codes, ...(raw.get(id) ?? [])]) {
      const key = normaliseName(n);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      aliases.push(asWritten(n));
    }
    const exact = [normaliseName(name), ...codes.map(normaliseName), ...aliases.map(normaliseName)].filter(
      (key, i, all) =>
        key &&
        all.indexOf(key) === i &&
        (claimedBy.get(key)?.size ?? 1) === 1 &&
        !isAnotherMovementsWord(key, id),
    );
    out[id] = { id, name, code: main, codes, floorName: floorById.get(id) ?? null, aliases, exact };
  }
  return out;
}

/** The twenty movements, by canonical id. */
export const MOVEMENTS: Record<string, MovementNames> = build();

/**
 * The movement a machine is, through its lineage: an MSF machine is itself, a
 * studio's copy or its own machine based on one is that one (`comparisonKey`
 * is `basedOn ?? machineId`), and a machine with no lineage is no movement.
 */
export function movementOf(machine: { id: string; comparisonKey?: string; name?: string }): MovementNames | null {
  const lineage = machine.comparisonKey || machine.id;
  if (!lineage) return null;
  return MOVEMENTS[canonicalMachineId(lineage, lineage === machine.id ? machine.name : undefined)] ?? null;
}

/** Words for comparing two names: normalised, a plural "s" dropped, brackets kept. */
function comparable(text: string): string[] {
  return normaliseName(text)
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * Does a unit's floor name leave its Academy name unsaid? "LUMBAR" does
 * (Lumbar Extension), "LEG PRESS" and "TRICEP EXTENSION" do not. Screens show
 * the Academy name under the floor name only when this is true, so a row never
 * says the same thing twice.
 */
export function floorNameHidesMovement(floorName: string, movementName: string): boolean {
  const floor = comparable(floorName);
  const movement = comparable(movementName);
  if (movement.length === 0) return false;
  for (let i = 0; i + movement.length <= floor.length; i++) {
    if (movement.every((w, j) => floor[i + j] === w)) return false;
  }
  return true;
}

/** Every name a machine is known by, for search: its movement's name, codes and aliases. */
export function namesForMachine(machine: { id: string; comparisonKey?: string; name?: string }): string[] {
  const m = movementOf(machine);
  if (!m) return [];
  return [m.name, ...m.aliases];
}
