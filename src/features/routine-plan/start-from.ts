/**
 * START FROM A ROUTINE… (the open session round, Oct 9 2026; AJ's "1b": "i
 * think the open session should honestly feel most like a filemaker session,
 * its the barebones but also i want to be able to take advantage of our
 * routine builder so we can use it if we wanted too").
 *
 * The pure half of the session corner's sheet (`ui/StartFromRoutineSheet`).
 * An open session, and a client session with no routine, run the FileMaker
 * floor: every machine showing, + on the ones done. This is the other way
 * in: one tap lays a routine's machines on today's list, in its order, and
 * the rest of the floor stays below in the fold.
 *
 * What it offers (`startFromGroups`), each by its name and its machines:
 * - the client's Routine A and Routine B, once the client is known (Routine
 *   A still empty runs its plan's day one, as `todayFor` says a visit does),
 *   "Reading {First}'s routines…" in their place until their read answers,
 *   so nothing lands above a row under the trainer's finger;
 * - the studio's starting routines, as Start a plan offers them (the
 *   studio's choice, its default first; the Academy's eleven before the
 *   seed), each laying its DAY ONE on this floor (`startingRoad`, the plan
 *   builder's own mapping). When their read failed, as Start a plan says it:
 *   no default, every one offered, and "Couldn't read…" above them, never a
 *   "none" sentence off a read that didn't answer (the review, Oct 9 2026);
 * - the studio's routine templates (its leaders' and its trainers' saved
 *   ones) and head office's, as the Edit routine drawer lists them
 *   (`drawerTemplates`), from the starting routines' own read.
 * Nothing is offered off a floor not read yet, or one whose read failed
 * (`floorStatus`): "not on this floor" is said only of a floor that answered.
 * A routine's catalog ids become this floor's units the way the plan
 * builder maps them (`floorIndex`); a machine this floor lacks is NAMED,
 * never dropped silently, and so is one the client can't do today (Routine
 * A's plan, read by every routine: AJ's "2a") and one out of service on the
 * studio's roster. A starting routine or a template with nothing on this
 * floor isn't offered (Start a plan's rule); the client's own routines
 * always are, said as having nothing to lay here.
 *
 * What a tap does (`laidToday`): today's list becomes what is already done
 * today, in the order done, then the routine's machines, in its order. A
 * machine on today's list with no set yet makes way. The tracker records it
 * through `applySessionMachineIds` alone: the SESSION's list, never a
 * routine (`routine-builder/session-scope.test.ts`). Routine A still comes
 * only through the Wrap-up's Next time.
 *
 * Nothing here reads or writes the database, and nothing suggests a weight.
 */
import type { Routine, RoutinePreset } from "../../types";
import { canonicalMachineId } from "../catalog/machine-identity";
import { runnableToday } from "./cant-do";
import { todayFor } from "./plan";
import { usablePlan } from "./session-plan";
import { floorIndex, type FloorMachine } from "./starting-plan";
import {
  startingRoad,
  suggestFromStartingRoutines,
  type StartingRoutine,
  type StartingRoutineChoice,
} from "./starting-routines";
import type { RoutinePlan } from "./types";
import { savedRoutineA, savedRoutineB } from "./ui/host";

export type StartFromGroupKey = "client" | "starting" | "studio" | "company";

export interface StartFromChoice {
  /** Unique in the sheet: the group and the routine's id. */
  key: string;
  group: StartFromGroupKey;
  /** Its name as the screen says it: "Routine A", a starting routine's or a template's name. */
  label: string;
  /** What a tap lays, this floor's ids, in the routine's order. */
  machineIds: string[];
  /** Its machines this floor lacks, by the routine's own ids (named, never dropped). */
  missing: string[];
  /** Its machines left out because the client can't do them today (this floor's ids). */
  cantDo: string[];
  /** Its machines left out as out of service on the studio's roster (this floor's ids). */
  outOfService: string[];
  /** Short words beside the name: "day one", "default". */
  notes: string[];
}

export interface StartFromGroup {
  key: StartFromGroupKey;
  label: string;
  choices: StartFromChoice[];
  /** Said in place of the choices: "Reading…", "Couldn't be read.", or why there are none. */
  status?: string;
  /** Said above the choices: a read that failed, and what is offered instead. */
  notes?: string[];
}

export interface StartFromInput {
  /** This studio's floor (the tracker's floor machines). */
  floor: readonly FloorMachine[];
  /** The studio's day, `YYYY-MM-DD`: a can't-do mark holds through its day. */
  todayYmd: string;
  /**
   * The client's routines once they are known; "reading" for a client whose
   * routines haven't answered yet; null with no client (an open session).
   */
  clientRoutines: readonly Routine[] | "reading" | null;
  /**
   * The studio's starting routines and its choice (null: unknown, all of
   * head office's); null while they read. `failed`: a read didn't answer
   * (the routines are the Academy's code copy when `fromCode`).
   */
  starting: {
    routines: readonly StartingRoutine[];
    choice: StartingRoutineChoice | null;
    failed?: boolean;
    fromCode?: boolean;
  } | null;
  /**
   * The routine templates, as the Edit routine drawer lists them
   * (`drawerTemplates`); null while they read, "failed" when the read
   * didn't answer.
   */
  templates: { company: readonly RoutinePreset[]; studio: readonly RoutinePreset[] } | null | "failed";
  /** Machines out of service on the studio's roster (this floor's ids). */
  outOfService?: Iterable<string>;
  /** A machine's name, used to find the catalog machine a routine's id is when the id isn't this floor's. */
  nameOf?: (id: string) => string;
  firstName?: string | null;
  studioName?: string | null;
}

/* ── This floor ──────────────────────────────────────────────────────── */

/**
 * A routine's ids on this floor: an id this floor has stays as it is (a
 * studio's own unit); any other is the catalog machine it is
 * (`canonicalMachineId`, by its name too when one is known) and then this
 * floor's first unit of it (`floorIndex`, the plan builder's map). Each once,
 * in the routine's order; what this floor lacks is listed apart.
 */
export function onThisFloor(
  ids: readonly unknown[],
  floor: readonly FloorMachine[],
  nameOf?: (id: string) => string,
): { machineIds: string[]; missing: string[] } {
  const here = new Set(floor.map((m) => m.id));
  const index = floorIndex(floor);
  const machineIds: string[] = [];
  const missing: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    const name = nameOf?.(id);
    const at = here.has(id)
      ? id
      : (index.get(canonicalMachineId(id)) ?? (name && name !== id ? index.get(canonicalMachineId(id, name)) : undefined));
    if (at) {
      if (!machineIds.includes(at)) machineIds.push(at);
    } else if (!missing.includes(id)) {
      missing.push(id);
    }
  }
  return { machineIds, missing };
}

interface Context {
  todayYmd: string;
  aPlan: RoutinePlan | null;
  out: Set<string>;
}

function choiceOf(
  key: string,
  group: StartFromGroupKey,
  label: string,
  onFloor: { machineIds: string[]; missing: string[] },
  ctx: Context,
  notes: string[] = [],
): StartFromChoice {
  const runnable = runnableToday(onFloor.machineIds, ctx.aPlan, ctx.todayYmd);
  return {
    key,
    group,
    label,
    machineIds: runnable.filter((id) => !ctx.out.has(id)),
    missing: onFloor.missing,
    cantDo: onFloor.machineIds.filter((id) => !runnable.includes(id)),
    outOfService: runnable.filter((id) => ctx.out.has(id)),
    notes,
  };
}

/* ── What the sheet offers ───────────────────────────────────────────── */

/**
 * The sheet's groups, in the order a trainer reaches for one: the client's
 * own routines, the starting routines, the studio's templates, head
 * office's. A group not known yet says so ("Reading…"); a read that failed
 * says it couldn't be read, never "none".
 */
export function startFromGroups(input: StartFromInput): StartFromGroup[] {
  const known = Array.isArray(input.clientRoutines) ? (input.clientRoutines as readonly Routine[]) : null;
  const aRoutine = known ? savedRoutineA(known) : null;
  const aPlan = aRoutine && usablePlan(aRoutine.plan) ? aRoutine.plan : null;
  const ctx: Context = { todayYmd: input.todayYmd, aPlan, out: new Set(input.outOfService ?? []) };
  const first = input.firstName?.trim();
  const studio = input.studioName?.trim();
  const groups: StartFromGroup[] = [];

  // The client's own: "Reading…" in their place until they answer, so nothing lands above a row under a finger.
  const clientLabel = first ? `${first}'s routines` : "This client's routines";
  if (input.clientRoutines === "reading") {
    groups.push({ key: "client", label: clientLabel, choices: [], status: first ? `Reading ${first}'s routines…` : "Reading this client's routines…" });
  } else if (known) {
    const choices: StartFromChoice[] = [];
    if (aRoutine) {
      const ids = todayFor({ routine: aRoutine.machineIds, plan: aPlan });
      const dayOne = (aRoutine.machineIds?.length ?? 0) === 0 && ids.length > 0;
      if (ids.length > 0) {
        choices.push(choiceOf("client:A", "client", "Routine A", onThisFloor(ids, input.floor, input.nameOf), ctx, dayOne ? ["day one"] : []));
      }
    }
    const bRoutine = savedRoutineB(known);
    if (bRoutine && (bRoutine.machineIds?.length ?? 0) > 0) {
      choices.push(choiceOf("client:B", "client", "Routine B", onThisFloor(bRoutine.machineIds, input.floor, input.nameOf), ctx));
    }
    // Known and none: said, in the place "Reading…" held (their read answered).
    groups.push({ key: "client", label: clientLabel, choices, ...(choices.length === 0 ? { status: "None yet." } : null) });
  }

  // The studio's starting routines, as Start a plan offers them: day one on this floor.
  if (input.starting === null) {
    groups.push({ key: "starting", label: "Starting routines", choices: [], status: "Reading the starting routines…" });
  } else {
    /* A read that failed claims nothing, as Start a plan says it: no
       default (head office's, or the studio's off a choice never read),
       every one offered, and the sentence above them, never a "none"
       sentence off a read that didn't answer (the review, Oct 9 2026). */
    const failed = input.starting.failed === true;
    const routines = failed
      ? input.starting.routines.map((r) => (r.isDefault ? { ...r, isDefault: false } : r))
      : input.starting.routines;
    const s = suggestFromStartingRoutines({
      routines,
      choice: failed ? null : input.starting.choice,
      floor: input.floor,
      studioName: input.studioName,
    });
    const ids = [...(s.templateId ? [s.templateId] : []), ...s.alternatives.map((a) => a.templateId)];
    const index = floorIndex(input.floor);
    const choices: StartFromChoice[] = [];
    for (const id of ids) {
      const r = routines.find((x) => x.id === id);
      if (!r) continue;
      const { startWith } = startingRoad(r, input.floor);
      const missing = r.dayOne.filter((m, i) => r.dayOne.indexOf(m) === i && !index.has(m));
      const notes = id === s.templateId && !failed ? ["default", "day one"] : ["day one"];
      const choice = choiceOf(`starting:${id}`, "starting", r.name, { machineIds: startWith, missing }, ctx, notes);
      if (choice.machineIds.length > 0 || choice.cantDo.length > 0 || choice.outOfService.length > 0) choices.push(choice);
    }
    const unread = `Couldn't read ${studio || "this studio"}'s starting routines just now.`;
    const failedNotes = [unread, ...(input.starting.fromCode ? ["These are the Academy's, from Journey's own copy."] : [])];
    groups.push({
      key: "starting",
      label: "Starting routines",
      choices,
      ...(choices.length === 0
        ? { status: failed ? unread : s.why === "Pick which starting routine fits" ? "None on this floor." : `${s.why}.` }
        : failed
          ? { notes: failedNotes }
          : null),
    });
  }

  // The routine templates: the studio's own, then head office's.
  const studioLabel = studio ? `${studio}'s templates` : "This studio's templates";
  if (input.templates === null || input.templates === "failed") {
    const status = input.templates === null ? "Reading the templates…" : "The templates couldn't be read.";
    groups.push({ key: "studio", label: "Templates", choices: [], status });
  } else {
    const templates = input.templates;
    for (const [key, label, list] of [
      ["studio", studioLabel, templates.studio],
      ["company", "Head office's templates", templates.company],
    ] as const) {
      const choices: StartFromChoice[] = [];
      for (const p of list) {
        const name = (p.name ?? "").trim() || "A routine template";
        const choice = choiceOf(`${key}:${p.id ?? name}`, key, name, onThisFloor(p.machineIds ?? [], input.floor, input.nameOf), ctx);
        if (choices.some((c) => c.key === choice.key)) continue;
        if (choice.machineIds.length > 0 || choice.cantDo.length > 0 || choice.outOfService.length > 0) choices.push(choice);
      }
      if (choices.length > 0) groups.push({ key, label, choices });
    }
  }
  return groups;
}

/**
 * What the sheet says in place of every group while this studio's floor
 * isn't known: still reading, or its read failed. Null once it answered.
 * "Not on this floor" is said only of a floor that answered (the review,
 * Oct 9 2026: a cold iPad's open session is seeded before its floor is).
 */
export function floorStatus(state: "known" | "reading" | "failed", studioName?: string | null): string | null {
  const studio = studioName?.trim();
  const whose = studio ? `${studio}'s` : "this studio's";
  if (state === "reading") return `Reading ${whose} floor…`;
  if (state === "failed") return `Couldn't read ${whose} floor just now. Try again in a moment.`;
  return null;
}

/* ── The words ───────────────────────────────────────────────────────── */

/** How many machines a row names before "+N more". */
export const START_FROM_SHOWN = 4;

/**
 * A choice's lines: its first machines by name ("Leg Press · Compound Row ·
 * Lumbar Extension · Chest Press +2 more"), and one line for each kind of
 * machine left out, by name: never dropped silently. Nothing to lay here is
 * said too.
 */
export function startFromLines(
  choice: StartFromChoice,
  nameOf: (id: string) => string,
  opts: { firstName?: string | null; studioName?: string | null } = {},
): { machines: string; leftOut: string[] } {
  const shown = choice.machineIds.slice(0, START_FROM_SHOWN).map(nameOf).join(" · ");
  const more = choice.machineIds.length > START_FROM_SHOWN ? ` +${choice.machineIds.length - START_FROM_SHOWN} more` : "";
  const studio = opts.studioName?.trim();
  const first = opts.firstName?.trim();
  /* Each by its name; one Journey has no name for (a unit of another
     studio's floor, say) is counted, never printed as its id (the review,
     Oct 9 2026). */
  const names = (ids: readonly string[]) => {
    const named: string[] = [];
    let unnamed = 0;
    for (const id of ids) {
      const name = nameOf(id).trim();
      if (name && name !== id) named.push(name);
      else unnamed += 1;
    }
    if (unnamed === 0) return named.join(", ");
    const count = `${unnamed} ${named.length > 0 ? "other " : ""}machine${unnamed === 1 ? "" : "s"}`;
    return named.length > 0 ? `${named.join(", ")} and ${count}` : count;
  };
  const leftOut: string[] = [];
  if (choice.missing.length > 0) leftOut.push(`Not on ${studio ? `${studio}'s` : "this"} floor: ${names(choice.missing)}`);
  if (choice.cantDo.length > 0) leftOut.push(`${first ? `${first} can't do` : "Can't do"} for now: ${names(choice.cantDo)}`);
  if (choice.outOfService.length > 0) leftOut.push(`Out of service: ${names(choice.outOfService)}`);
  return { machines: shown ? `${shown}${more}` : "Nothing of it to lay on this floor", leftOut };
}

/* ── The tap ─────────────────────────────────────────────────────────── */

/**
 * Today's list once a routine is laid: what is already done today stays, in
 * the order done (FileMaker's circle), then the routine's machines in its
 * order, each once. A machine on today's list with no set yet makes way for
 * the routine. "Done" is a set logged today (`setLoggedToday`: a count, a
 * time or an outcome; a weight alone is not a set).
 */
export function laidToday(input: {
  today: readonly string[];
  laid: readonly string[];
  done: (machineId: string) => boolean;
}): string[] {
  const out: string[] = [];
  for (const id of input.today) if (input.done(id) && !out.includes(id)) out.push(id);
  for (const id of input.laid) if (id && !out.includes(id)) out.push(id);
  return out;
}

/**
 * The machine in hand once a routine is laid: the one already in hand while
 * it is still on the list with no set yet, else the list's first machine
 * with no set, else none (the caller leaves the hand as it is).
 */
export function inHandAfterLay(input: {
  next: readonly string[];
  inHand: string | null | undefined;
  done: (machineId: string) => boolean;
}): string | null {
  if (input.inHand && input.next.includes(input.inHand) && !input.done(input.inHand)) return input.inHand;
  return input.next.find((id) => !input.done(id)) ?? null;
}
