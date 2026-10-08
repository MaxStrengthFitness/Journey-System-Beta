/**
 * What `scripts/seed-starting-routines.ts` writes: the Academy's eleven
 * Exercise Selection Template rows as head office's starting routines (AJ,
 * Oct 8 2026, "2a": "The Academy's eleven are brought in once, by a script AJ
 * runs (dry run first), renamed without 'female' or 'male'. Admins then
 * edit, retire or add.").
 *
 * Pure, so the script imports nothing from React or the app's Firebase, and
 * so a test can hold the seed to the fallback: every document here, read
 * back through `startingRoutineFromPreset`, is exactly the routine
 * `academyStartingRoutines()` builds in code. A plan started before the seed
 * ran and one started after it name the same routine
 * (`routinePresets/academy-<template>`, `academyRoutineId`).
 *
 * "Brought in once" is held by the seed's record (`SEED_RECORD`): every id a
 * run wrote is listed there, so a later run never brings back a routine an
 * administrator removed (the template editor's only way to retire one is
 * Delete, and a deleted id is simply not there any more).
 */
import type { SelectionPurposeKind } from "../routine-builder/academy";
import {
  ACADEMY_ROUTINE_PREFIX,
  academyStartingRoutines,
  type RoutinePresetStart,
  type StartingRoutine,
} from "./starting-routines";

/** Who wrote a seeded routine, as the admin editor's list says it. */
export const SEED_CREATED_BY = "seed-starting-routines";
export const SEED_CREATED_BY_NAME = "Journey (from the Academy)";

/**
 * The seed's own record of what it has written: `system/startingRoutinesSeed`
 * = `{ ids, lastWrittenAt }`. Written by the script alone, through the Admin
 * SDK, in the same batch as the routines; the app never reads it, and no
 * rule names it, so firestore.rules' safety net refuses it to everyone
 * signed in. Its reader is the next run of the script.
 */
export const SEED_RECORD = { collection: "system", id: "startingRoutinesSeed" } as const;

/**
 * One line a starting routine says about itself in head office's list: who
 * it is for, never a gender. Keyed by the routine's id without its prefix
 * (`academyRoutineId`). The two no-reported-issues rows are told apart by
 * their names (the machines one has and the other hasn't).
 */
const FOR_WHOM: Readonly<Record<string, string>> = {
  "clear-dip-adduction": "For a client with no reported issues.",
  "clear-chest-pulldown": "For a client with no reported issues.",
  "low-back": "For a client with a low back problem.",
  knee: "For a client with a knee problem.",
  shoulder: "For a client with a shoulder problem.",
  "elbow-hand-wrist": "For a client with an injured elbow, hand or wrist.",
  core: "For a client who wants a stronger core.",
  "upper-body": "For a client who wants more upper body strength.",
  "lower-body": "For a client who wants lower body strength or better balance.",
  arms: "For a client who wants stronger arms.",
  posture: "For a client working on posture.",
};

const BY_KIND: Readonly<Record<SelectionPurposeKind, string>> = {
  clear: "For a client with no reported issues.",
  condition: "For a client with a condition to work around.",
  goal: "For a client with a goal.",
};

/** A seeded routine's id without its prefix (`academy-knee` → `knee`): the key of `FOR_WHOM`. */
function shortIdOf(routine: Pick<StartingRoutine, "id">): string {
  return routine.id.startsWith(ACADEMY_ROUTINE_PREFIX) ? routine.id.slice(ACADEMY_ROUTINE_PREFIX.length) : routine.id;
}

/** "For a client with a knee problem. From the Academy's Exercise Selection Template, a first draft to change." */
export function startingSeedDescription(routine: Pick<StartingRoutine, "id" | "kind">): string {
  const forWhom = FOR_WHOM[shortIdOf(routine)] ?? (routine.kind ? BY_KIND[routine.kind] : "A starting routine.");
  return `${forWhom} From the Academy's Exercise Selection Template, a first draft to change.`;
}

/** A seeded routine preset's fields, without `createdAt` (the script stamps the server's time). */
export interface StartingSeedDoc {
  name: string;
  description: string;
  machineIds: string[];
  scope: "global";
  tier: "company";
  start: RoutinePresetStart;
  createdBy: string;
  createdByName: string;
}

/**
 * A starting routine as the preset document the seed writes: company tier,
 * scope "global" (the routinePresets rules' and `normalizeRoutinePreset`'s
 * company), with its `start` part. Nobody's default: head office picks one in
 * the editor after the seed.
 */
export function startingSeedDoc(routine: StartingRoutine): StartingSeedDoc {
  const start: RoutinePresetStart = {
    dayOne: [...routine.dayOne],
    ...(routine.steps && routine.steps.length > 0
      ? { steps: routine.steps.map((s) => ({ label: s.label, machineIds: [...s.machineIds] })) }
      : null),
    matchWords: [...routine.matchWords],
    default: false,
    ...(routine.source ? { source: routine.source } : null),
    ...(routine.kind ? { kind: routine.kind } : null),
  };
  return {
    name: routine.name,
    description: startingSeedDescription(routine),
    machineIds: [...routine.machineIds],
    scope: "global",
    tier: "company",
    start,
    createdBy: SEED_CREATED_BY,
    createdByName: SEED_CREATED_BY_NAME,
  };
}

/**
 * The ids the seed's record lists, from its document (`SEED_RECORD`). No
 * record, or one whose `ids` isn't a list, is a seed that has never run.
 */
export function seededIdsFromRecord(data: unknown): Set<string> {
  const ids = data && typeof data === "object" ? (data as { ids?: unknown }).ids : undefined;
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((id): id is string => typeof id === "string" && id.trim() !== "").map((id) => id.trim()));
}

export interface StartingSeedOptions {
  /** The ids an earlier run wrote (the seed's record). */
  seededBefore?: ReadonlySet<string>;
  /** Ids to bring in again although an earlier run wrote them (`--again`): an administrator's removal undone on purpose. */
  again?: ReadonlySet<string>;
}

export interface StartingSeedPlan {
  /** To write: an id nobody has used yet, and no earlier run wrote (or one asked for again). */
  write: Array<{ id: string; doc: StartingSeedDoc }>;
  /** Already in the database (seeded before, or an administrator's), left exactly as it is. */
  skip: string[];
  /**
   * Written by an earlier run and not there now: an administrator removed it.
   * Left out, so a second run never brings back a routine head office retired;
   * `--again <id>` brings one back on purpose.
   */
  retired: string[];
}

/**
 * What a run would write: every Academy routine whose id isn't in the
 * database and that no earlier run wrote. One that is there is skipped, never
 * overwritten, so an administrator's edit survives a second run; one an
 * earlier run wrote that is gone now was retired, and stays retired unless
 * it is asked for again; and a run after an interrupted one (whose batch
 * wrote nothing, the record included) finishes the rest.
 */
export function startingSeedPlan(
  existingIds: ReadonlySet<string>,
  options: StartingSeedOptions = {},
): StartingSeedPlan {
  const seededBefore = options.seededBefore ?? new Set<string>();
  const again = options.again ?? new Set<string>();
  const plan: StartingSeedPlan = { write: [], skip: [], retired: [] };
  for (const routine of academyStartingRoutines()) {
    if (existingIds.has(routine.id)) plan.skip.push(routine.id);
    else if (seededBefore.has(routine.id) && !again.has(routine.id)) plan.retired.push(routine.id);
    else plan.write.push({ id: routine.id, doc: startingSeedDoc(routine) });
  }
  return plan;
}

/** The ids `--again` named that aren't one of the Academy's routines, so a typo is said rather than ignored. */
export function unknownSeedIds(ids: Iterable<string>): string[] {
  const known = new Set(academyStartingRoutines().map((r) => r.id));
  return [...ids].filter((id) => !known.has(id));
}
