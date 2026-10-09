/**
 * A studio's choice of starting routines, as My Studio → Studio → Starting
 * routines edits it: the pure half of `ui/StartingRoutinesPanel.tsx` (the
 * design round, Oct 8 2026; AJ: "studios will chose their own, admins will
 * create the routines to pick from in the app during beta").
 *
 * The choice is `{ use, defaultId }` (`studios/{s}/config/startingRoutines`,
 * starting-read.ts). `use: null` is "following head office's list": every
 * starting routine head office offers (and the studio's own), including any
 * added later. A list is the studio's own choice: exactly the ones ticked,
 * so a routine added later, head office's or one the studio's own leaders
 * switch on in the template editor, waits until a leader ticks it.
 *
 * A form built on `useDirtyForm` compares arrays in order, so the list is
 * kept in one order (`canonicalUse`): the routines as the panel lists them,
 * then any id the panel doesn't list (a routine head office has since
 * retired, or one being edited right now), kept as it was rather than
 * dropped by a save nobody meant to make about it.
 */
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";
import type { StartingRoutine, StartingRoutineChoice } from "./starting-routines";

/**
 * A starting routine's machine, by name. Its ids are catalog ids, a movement
 * each, and a movement takes the Academy's name (the Catalog round, Sep 28
 * 2026: "Leg Press", "Lumbar Extension"); a machine the Academy doesn't name
 * takes the catalog's, and an id nothing names is said as it is rather than
 * dropped.
 */
export function routineMachineName(id: string, catalogName?: string | null): string {
  return ACADEMY_MOVEMENT_NAME[id] ?? (catalogName?.trim() || id);
}

/**
 * "Not on Westlake's floor: Leg Curl, Lumbar Extension": a starting
 * routine's machines this floor lacks (a suggestion's steps' `missing`),
 * said, never dropped silently (the design round, §4.2; AJ, Oct 8 2026: "not
 * every studio has the same machines"). One sentence for every door that
 * makes a plan from a starting routine: Start a plan, the briefing's walk-in
 * card and Re-plan's "Start again from". Null when the floor has them all.
 */
export function notOnFloorLine(missing: readonly string[], studioName: string | null | undefined): string | null {
  const ids = missing.filter((id, i) => !!id && missing.indexOf(id) === i);
  if (ids.length === 0) return null;
  return `Not on ${studioName?.trim() || "this studio"}'s floor: ${ids.map((id) => routineMachineName(id)).join(", ")}`;
}

/** The list in the panel's order, ids it doesn't list kept at the end as they came, each once. */
export function canonicalUse(use: readonly string[], routineIds: readonly string[]): string[] {
  const listed = routineIds.filter((id) => use.includes(id));
  const rest = use.filter((id, i) => !routineIds.includes(id) && use.indexOf(id) === i);
  return [...listed, ...rest];
}

/** The choice as the form holds it: the list in one order, so ticking one off and on again is no change. */
export function choiceForForm(choice: StartingRoutineChoice, routineIds: readonly string[]): StartingRoutineChoice {
  return {
    use: choice.use === null ? null : canonicalUse(choice.use, routineIds),
    defaultId: choice.defaultId,
  };
}

/** Whether this studio's trainers see a routine: every one while it follows head office's list. */
export function seesRoutine(choice: StartingRoutineChoice, id: string): boolean {
  return choice.use === null || choice.use.includes(id);
}

/**
 * A routine ticked or unticked. Unticking one while following head office's
 * list makes the studio's own list: every listed routine but that one.
 * Unticking the studio's default clears the default too, because a default
 * the trainers don't see would never be suggested. Ticking every listed
 * routine again, when the saved choice was following head office's list
 * (`savedUse` null), goes back to following it: a leader who undid their own
 * change has changed nothing.
 */
export function withRoutineSeen(
  choice: StartingRoutineChoice,
  id: string,
  on: boolean,
  routineIds: readonly string[],
  savedUse: readonly string[] | null,
): StartingRoutineChoice {
  const current = choice.use ?? [...routineIds];
  const next = on ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id);
  const use = canonicalUse(next, routineIds);
  const all = routineIds.every((r) => use.includes(r)) && use.length === routineIds.length;
  return {
    use: savedUse === null && all ? null : use,
    defaultId: !on && choice.defaultId === id ? null : choice.defaultId,
  };
}

/**
 * The studio's default picked (or none). The default is ticked as well:
 * Start a plan suggests it only from the routines the studio's trainers see.
 */
export function withStudioDefault(
  choice: StartingRoutineChoice,
  id: string | null,
  routineIds: readonly string[],
): StartingRoutineChoice {
  if (id === null || choice.use === null || choice.use.includes(id)) return { ...choice, defaultId: id };
  return { use: canonicalUse([...choice.use, id], routineIds), defaultId: id };
}

/** Back to following head office's list: every routine it offers, and any it adds later. The default stays. */
export function followingHeadOffice(choice: StartingRoutineChoice): StartingRoutineChoice {
  return { use: null, defaultId: choice.defaultId };
}

/**
 * "Following head office's list" or "Westlake's own choice", and what it
 * means for the trainers: said to a leader, who can tick, or to someone who
 * reads it. A studio's own list is exactly what is ticked, so a routine added
 * later waits, whether head office adds it or the studio's own leaders switch
 * one on in the template editor (`suggestFromStartingRoutines`).
 */
export function choiceSourceLine(use: readonly string[] | null, studioName: string, canEdit = true): string {
  const studio = studioName.trim() || "This studio";
  if (use === null) {
    return canEdit
      ? "Following head office's list: your trainers see every starting routine, head office's and your own, and any added later."
      : "Following head office's list: this studio's trainers see every starting routine, head office's and the studio's own, and any added later.";
  }
  return canEdit
    ? `${studio}'s own choice: your trainers see the ones ticked here. One added later, head office's or your own, waits until you tick it.`
    : `${studio}'s own choice: its trainers see the ones offered here. One added later waits until a leader offers it.`;
}

/** What "No default of our own" means here: head office's default by name, or the trainer picks. */
export function noStudioDefaultLine(routines: readonly StartingRoutine[], choice: StartingRoutineChoice): string {
  const headOffice = routines.find((r) => r.isDefault && r.tier === "company" && seesRoutine(choice, r.id));
  return headOffice
    ? `No default of our own: Start a plan suggests head office's, ${headOffice.name}`
    : "No default of our own: the trainer picks when the intake names nothing";
}

/** A count for the panel's head: "6 of 11 offered". */
export function seenCount(choice: StartingRoutineChoice, routineIds: readonly string[]): string {
  const seen = routineIds.filter((id) => seesRoutine(choice, id)).length;
  return `${seen} of ${routineIds.length} offered`;
}
