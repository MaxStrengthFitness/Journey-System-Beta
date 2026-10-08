/**
 * Starting routines as they come back from the database, and a studio's
 * choice: the pure half of `starting-store.ts` (AJ, Oct 8 2026, "1a": a
 * starting routine is one of head office's routine presets with a `start`
 * part; each studio's choice is one config document,
 * `studios/{s}/config/startingRoutines`).
 *
 * Every document is untyped when it arrives, so each is read through
 * `startingRoutineFromPreset` and the choice through `startingChoiceFromDoc`:
 * a value that isn't usable is skipped, never bent (the studio settings'
 * rule). A read that hasn't answered is unknown, never "none" (CLAUDE.md, "a
 * failed read means unknown, never empty"); what a screen offers then is
 * `routinesToOffer`'s.
 */
import {
  academyStartingRoutines,
  inListOrder,
  startingRoutineFromPreset,
  type StartingRoutine,
  type StartingRoutineChoice,
} from "./starting-routines";

/** The studio's choice: `studios/{studioId}/config/startingRoutines`. */
export const STARTING_CHOICE_DOC = "startingRoutines";

/** The most routines a studio's choice may list. firestore.rules (`startingChoiceValid`) holds the same number. */
export const STARTING_CHOICE_MAX = 80;

/** The longest id the studio's default may be. firestore.rules holds the same number. */
export const STARTING_ID_MAX = 200;

/** A studio that hasn't chosen: all of head office's, and no studio default. */
export const NO_CHOICE: StartingRoutineChoice = Object.freeze({ use: null, defaultId: null }) as StartingRoutineChoice;

/** A stored preset document with its id, as `startingRoutineFromPreset` reads it. */
export type StoredPresetDoc = NonNullable<Parameters<typeof startingRoutineFromPreset>[0]>;

/**
 * Head office's starting routines and a studio's own, from the two reads'
 * documents: each document that is a starting routine (a `start` part with a
 * day one), head office's first, each in the order a trainer looks for one.
 * A document that came back under the wrong read (a company query answering
 * with a studio's, or another studio's own) is left out, so a studio never
 * sees another studio's routines, and an id is offered once.
 */
export function startingRoutinesFromPresets(
  company: readonly StoredPresetDoc[],
  studio: readonly StoredPresetDoc[],
  studioId?: string | null,
): StartingRoutine[] {
  const read = (docs: readonly StoredPresetDoc[]) =>
    docs.map((d) => startingRoutineFromPreset(d)).filter((r): r is StartingRoutine => r !== null);
  const heads = read(company).filter((r) => r.tier === "company");
  const own = studioId ? read(studio).filter((r) => r.tier === "studio" && r.studioId === studioId) : [];
  const out: StartingRoutine[] = [];
  for (const r of [...inListOrder(heads), ...inListOrder(own)]) if (!out.some((x) => x.id === r.id)) out.push(r);
  return out;
}

function cleanIds(value: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of value) {
    const id = typeof v === "string" ? v.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A studio's choice from its document. A missing document, or a `use` that
 * isn't a list, is "hasn't chosen" (`use: null`, all of head office's); any
 * list, an empty one included, is exactly the routines the studio ticked. A
 * default that isn't an id is no default.
 */
export function startingChoiceFromDoc(data: unknown): StartingRoutineChoice {
  if (!data || typeof data !== "object") return { use: null, defaultId: null };
  const raw = data as { use?: unknown; defaultId?: unknown };
  const use = Array.isArray(raw.use) ? cleanIds(raw.use) : null;
  const defaultId = typeof raw.defaultId === "string" && raw.defaultId.trim() ? raw.defaultId.trim() : null;
  return { use, defaultId };
}

/**
 * The choice as it is written: ids trimmed and listed once, a blank default
 * no default. One the rules would refuse is refused here first, in words a
 * leader can act on, rather than sent to come back as a refusal.
 */
export function startingChoiceToWrite(choice: StartingRoutineChoice): StartingRoutineChoice {
  const use = choice.use === null ? null : cleanIds(choice.use);
  if (use !== null && use.length > STARTING_CHOICE_MAX) {
    throw new Error(`A studio can choose up to ${STARTING_CHOICE_MAX} starting routines. Untick ${use.length - STARTING_CHOICE_MAX} to save.`);
  }
  const defaultId = choice.defaultId?.trim() || null;
  if (defaultId !== null && defaultId.length > STARTING_ID_MAX) {
    throw new Error("That default isn't a starting routine Journey can save. Pick it again from the list.");
  }
  return { use, defaultId };
}

/** What a read of the starting routines gave: the routines, and whether it was an answer at all. */
export interface StartingRoutinesAnswer {
  routines: StartingRoutine[];
  /**
   * False when the only answer was an empty one from this iPad's cache (an
   * iPad offline that never read them): not known, never "there are none".
   */
  known: boolean;
}

export interface OfferedRoutines {
  routines: StartingRoutine[];
  /**
   * True when these are the Academy's eleven built in code
   * (`academyStartingRoutines`) rather than the app's: before the seed has
   * run, or when the read didn't answer. The ids are the seed's own
   * (`academy-<template>`), so a plan started from either names the same
   * routine.
   */
  fromCode: boolean;
}

/**
 * What Start a plan offers. The app's starting routines when the read found
 * any; the Academy's eleven when it answered with none (before the seed has
 * run: the design round's §4.2) or didn't answer at all (`null`, a failed
 * read, or an empty answer from the cache), so a walk-in's setup is never
 * blocked by a read. The screen says which (`fromCode`), and a failed read
 * says so too.
 */
export function routinesToOffer(answer: StartingRoutinesAnswer | null): OfferedRoutines {
  if (answer && answer.known && answer.routines.length > 0) return { routines: answer.routines, fromCode: false };
  return { routines: academyStartingRoutines(), fromCode: true };
}
