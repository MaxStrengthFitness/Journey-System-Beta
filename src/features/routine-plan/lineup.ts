/**
 * The Lineup on Programming → Routine A (the design round, Oct 8 2026, AJ's
 * "1d"): what it draws, and what each tap on it writes, worked out here so
 * the screens in `ui/` only draw.
 *
 * AJ, Oct 8 2026: "we might have a plan for a routine but find something out
 * in those first few sessions that drastically changes it ... some clients
 * just wont be able to do certain machines. not every studio has the same
 * machines." So every row of the Lineup moves, swaps, goes on the bench or
 * comes out, and every one of those is a plan change any trainer may make
 * ("Any trainer who trains the client can definitely change the plan"), the
 * reason asked and never required ("it's nice to be able to communicate like,
 * hey, I'm changing this plan because of this reason").
 *
 * The Lineup draws, top to bottom:
 * - Routine A's machines ("In Routine A"), or the plan's day one while
 *   Routine A is still empty (`runsDayOne`: the consult is not Routine A);
 * - On deck: the rest of the road, in its order, the first one Next;
 * - the bench, "Not for {first name}": what the client can't do, what stands
 *   in, and until when (`cant-do.ts`).
 *
 * Each edit returns the plan, Routine A's machines and the change before it
 * is signed (`PlanEdit`); `writeOf` signs it with the Auth uid and the
 * reason, and keeps Routine A's machines only when they moved, which is what
 * `store.ts`'s `savePlanChange` writes in one batch. Pure: no React, no
 * Firestore. Machine ids are the floor's, as the plan holds them.
 */
import {
  ACADEMY_CATEGORIES,
  CATEGORY_LABEL,
  EXERCISE_SUBSTITUTES,
  MACHINE_CATEGORY,
} from "../routine-builder/academy";
import {
  activeCantDo,
  backOnLine,
  cantDoActive,
  cantDoDayWords,
  dayAfterKey,
  markCantDo,
  reopenCantDo,
  replaceAt,
  standInLine,
  untilWords,
  type CantDoReason,
} from "./cant-do";
import { orderEffects, type OrderEffect } from "./order-effects";
import {
  ROUTINE_ONLY,
  applyPlanChange,
  listWords,
  planProgress,
  progressLine,
  routineWith,
  runsDayOne,
  todayFor,
  type PlanProgress,
} from "./plan";
import { floorCanonical, floorIndex, type FloorMachine } from "./starting-plan";
import type { CantDo, PlanChange, RoutinePlan } from "./types";

/** The signed-in person a change is signed with: the Auth uid (the rules pin it), and their name. */
export interface Who {
  uid: string;
  name?: string;
}

/**
 * The reasons a plan change offers, all optional (the prototype's kit, the
 * design round): a tap, or the trainer's own words, or nothing at all.
 */
export const PLAN_CHANGE_REASONS = ["Moving well", "Client asked", "Short on time", "Pain or injury", "Better fit for them"] as const;

/** Where the swap's suggestions come from, said beside them (every Academy suggestion names its source). */
export const FAMILY_SOURCE = "From the Academy's five families (Workout Programming Considerations)";
export const SUBSTITUTES_SOURCE = "From the Academy's Exercise Substitutes";

/* ── What the Lineup draws ─────────────────────────────────────────────── */

export interface LineupGroups {
  /** Routine A is empty and the plan has a day one: day one is drawn where Routine A's rows would be. */
  dayOneRuns: boolean;
  /** Routine A's machines, or day one's while it runs, in their order. */
  first: string[];
  /** The rest of the road, in its order: On deck. A machine on the bench is never on deck. */
  deck: string[];
}

/** The two lists the Lineup draws, and whether the first is day one. */
export function lineupGroups(plan: RoutinePlan, routine: readonly string[], todayYmd: string): LineupGroups {
  const dayOneRuns = runsDayOne({ routine, plan });
  const first = todayFor({ routine, plan });
  const held = new Set(activeCantDo(plan, todayYmd).map((c) => c.machineId));
  const deck = plan.intended.filter((id, i) => plan.intended.indexOf(id) === i && !first.includes(id) && !held.has(id));
  return { dayOneRuns, first, deck };
}

export interface BenchRow {
  entry: CantDo;
  /** The mark still holds today. */
  active: boolean;
  /** "Surgery · until cleared", the until alone with no reason, "Surgery · back on Oct 21" once it has ended. */
  line: string;
  /** "Chest Flye instead of Seated Dip", or "Seated Dip left out: nothing like it on this floor". */
  standIn: string;
  /** "Back on Oct 21" once a dated mark has ended; null while it holds. */
  backOn: string | null;
}

/** A bench entry's line, without the machine's name (the row says it). */
export function benchLine(entry: Pick<CantDo, "reason" | "until">, todayYmd: string): string {
  const ended = /^\d{4}-\d{2}-\d{2}$/.test(entry.until) && !cantDoActive(entry, todayYmd);
  const when = ended ? `back on ${cantDoDayWords(dayAfterKey(entry.until), todayYmd)}` : untilWords(entry.until, todayYmd);
  return [entry.reason?.trim(), when].filter(Boolean).join(" · ");
}

export interface LineupModel extends LineupGroups {
  /** The first machine on deck, or null when every planned machine is in. */
  next: string | null;
  bench: BenchRow[];
  progress: PlanProgress;
  /** "3 of 6 · next: Hip Abduction", or "0 of 6 · day one: …" while Routine A is empty. */
  line: string;
}

export function lineupOf(
  plan: RoutinePlan,
  routine: readonly string[],
  todayYmd: string,
  nameOf: (id: string) => string,
): LineupModel {
  const groups = lineupGroups(plan, routine, todayYmd);
  const progress = planProgress(plan, routine);
  const bench = (plan.cantDo ?? []).map((entry) => ({
    entry,
    active: cantDoActive(entry, todayYmd),
    line: benchLine(entry, todayYmd),
    standIn: standInLine(entry, nameOf),
    backOn: backOnLine(entry, todayYmd),
  }));
  return { ...groups, next: groups.deck[0] ?? null, bench, progress, line: progressLine(progress, nameOf, plan.dayOne) };
}

/**
 * The order effects of what a session runs, keyed by the row each one is
 * drawn above: the later of the two machines, so a side-by-side pair's row
 * sits between them (order-effects.ts: quiet sentences, never a block).
 */
export function effectsAbove(
  ids: readonly string[],
  nameOf: (id: string) => string,
  floor?: readonly FloorMachine[],
): Map<number, OrderEffect[]> {
  const at = new Map<number, OrderEffect[]>();
  for (const e of orderEffects(ids, nameOf, floor)) {
    const k = e.indices[e.indices.length - 1];
    at.set(k, [...(at.get(k) ?? []), e]);
  }
  return at;
}

/** The progress meter's segments: in Routine A, next, still to come. */
export function meterSegments(progress: PlanProgress): Array<"in" | "next" | "later"> {
  return Array.from({ length: progress.of }, (_, i) => (i < progress.have ? "in" : i === progress.have && !progress.complete ? "next" : "later"));
}

/* ── The Road: the plan as one line ────────────────────────────────────── */

/** A station on the Road: in today (solid), planned (hollow), the next stop, or can't do (crossed). */
export type RoadStationKind = "in" | "planned" | "next" | "cantdo";

export interface RoadStation {
  id: string;
  kind: RoadStationKind;
  /** A word under the name: "Next stop". */
  mark?: string;
}

export interface RoadGroup {
  key: string;
  label: string;
  /** The bracket over today's stations. */
  bracket?: boolean;
  stations: RoadStation[];
}

/**
 * The Road's one-line route (AJ's "1d": "the Road's one-line route wherever
 * a glance is enough"): today's machines under a "Today" bracket, then the
 * rest of the plan's road hollow with the first marked "Next stop", then, when
 * there are any, the machines the client can't do, crossed. The briefing,
 * the session's Plan chip and the Wrap-up draw it with `ui/RoadStrip`.
 */
export function roadGroups(input: {
  plan: Pick<RoutinePlan, "intended" | "cantDo">;
  /** Today's machines, in today's order (`todayFor`, or the session's). */
  today: readonly string[];
  todayYmd: string;
  /** "Today", or the Wrap-up's "Next time". */
  todayLabel?: string;
  /** "Then". */
  thenLabel?: string;
  /** The client's first name, for "Not for Dana"; "Can't do" without one. */
  firstName?: string | null;
}): RoadGroup[] {
  const today = once(input.today);
  const held = activeCantDo(input.plan, input.todayYmd).map((c) => c.machineId);
  const later = input.plan.intended.filter((id, i) => input.plan.intended.indexOf(id) === i && !today.includes(id) && !held.includes(id));
  const first = input.firstName?.trim();
  const groups: RoadGroup[] = [
    {
      key: "today",
      label: `${input.todayLabel ?? "Today"} · ${today.length}`,
      bracket: true,
      stations: today.map((id) => ({ id, kind: "in" as const })),
    },
    {
      key: "then",
      label: input.thenLabel ?? "Then",
      stations: later.map((id, i) => (i === 0 ? { id, kind: "next" as const, mark: "Next stop" } : { id, kind: "planned" as const })),
    },
    {
      key: "cantdo",
      label: first ? `Not for ${first}` : "Can't do",
      stations: held.filter((id) => !today.includes(id)).map((id) => ({ id, kind: "cantdo" as const })),
    },
  ];
  return groups.filter((g) => g.stations.length > 0);
}

/* ── One tap's edit ────────────────────────────────────────────────────── */

/** A change before it is signed: its kind, its machines and its words. */
export type UnsignedChange = Pick<PlanChange, "kind" | "machineIds"> & { value?: string };

export interface PlanEdit {
  plan: RoutinePlan;
  /** Routine A's machines after the edit; the same list when they didn't move. */
  routine: string[];
  change: UnsignedChange;
}

/** What one tap writes through `savePlanChange`: the plan, its change(s), and Routine A's machines when they moved. */
export interface PlanWrite {
  plan: RoutinePlan;
  change: PlanChange;
  also?: PlanChange[];
  machineIds?: string[];
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const once = (ids: readonly string[]) => ids.filter((id, i) => !!id && ids.indexOf(id) === i);

/**
 * A change signed by the signed-in person, with the reason when one was
 * given (asked, never required) and nothing `undefined`, which Firestore
 * refuses. The words are held to the rules' 500 and 120 characters.
 */
export function signedChange(change: UnsignedChange, who: Who, reason?: string | null): PlanChange {
  const why = reason?.trim();
  const value = change.value?.trim();
  return {
    kind: change.kind,
    machineIds: [...change.machineIds],
    ...(value ? { value: value.slice(0, 500) } : null),
    ...(why ? { reason: why.slice(0, 500) } : null),
    byUid: who.uid,
    ...(who.name?.trim() ? { byName: who.name.trim().slice(0, 120) } : null),
  };
}

/** The write for an edit: Routine A's machines go in only when they moved. */
export function writeOf(edit: PlanEdit, before: readonly string[], who: Who, reason?: string | null): PlanWrite {
  return {
    plan: edit.plan,
    change: signedChange(edit.change, who, reason),
    ...(sameList(edit.routine, before) ? null : { machineIds: edit.routine }),
  };
}

/**
 * Move a row one place within its group ("Move up", "Move down"). A move is
 * a "reorder" written in the order the Lineup draws (the first group, then On
 * deck), so day one takes the order it gives day one's machines, and a move
 * in Routine A moves Routine A too. Null when the row can't go that way.
 */
export function movedIn(
  plan: RoutinePlan,
  routine: readonly string[],
  machineId: string,
  dir: -1 | 1,
  todayYmd: string,
): PlanEdit | null {
  const g = lineupGroups(plan, routine, todayYmd);
  const inFirst = g.first.includes(machineId);
  const group = inFirst ? g.first : g.deck;
  const at = group.indexOf(machineId);
  const to = at + dir;
  if (at === -1 || to < 0 || to >= group.length) return null;
  const moved = [...group];
  [moved[at], moved[to]] = [moved[to], moved[at]];
  const first = inFirst ? moved : g.first;
  const deck = inFirst ? g.deck : moved;
  const order = [...first, ...deck].filter((id) => plan.intended.includes(id));
  return {
    plan: applyPlanChange(plan, { kind: "reorder", machineIds: order }),
    routine: inFirst && !g.dayOneRuns ? first : [...routine],
    change: { kind: "reorder", machineIds: order },
  };
}

/**
 * Swap a machine for another, or for the Academy's documented set, which
 * takes its place together: on the road, on day one, and in Routine A.
 */
export function swappedIn(plan: RoutinePlan, routine: readonly string[], from: string, to: readonly string[]): PlanEdit {
  const incoming = once(to).filter((id) => id !== from);
  const ids = [from, ...incoming];
  return {
    plan: applyPlanChange(plan, { kind: "swap", machineIds: ids }),
    routine: routine.includes(from) ? replaceAt(routine, from, incoming) : [...routine],
    change: { kind: "swap", machineIds: ids },
  };
}

/**
 * Take a machine out: of Routine A only, where the plan keeps it on deck
 * ("Take out of Routine A", a "remove" with `ROUTINE_ONLY`), or out of the
 * plan too, which takes it off day one as well.
 */
export function takenOut(plan: RoutinePlan, routine: readonly string[], machineId: string, from: "routine" | "plan"): PlanEdit {
  const nextRoutine = routine.filter((id) => id !== machineId);
  if (from === "routine") {
    return { plan, routine: nextRoutine, change: { kind: "remove", machineIds: [machineId], value: ROUTINE_ONLY } };
  }
  return {
    plan: applyPlanChange(plan, { kind: "remove", machineIds: [machineId] }),
    routine: nextRoutine,
    change: { kind: "remove", machineIds: [machineId] },
  };
}

/** "Add to A now": the Next machine into Routine A, in the road's order; the road is as it was. */
export function addedNow(plan: RoutinePlan, routine: readonly string[], machineId: string): PlanEdit {
  return {
    plan,
    routine: routineWith(plan, routine, [machineId]),
    change: { kind: "add", machineIds: [machineId], value: ROUTINE_ONLY },
  };
}

/** A machine off the bench, back where it stood (`reopenCantDo`). Routine A is as it was. */
export function reopened(plan: RoutinePlan, routine: readonly string[], machineId: string): PlanEdit {
  return { plan: reopenCantDo(plan, routine, machineId), routine: [...routine], change: { kind: "cando", machineIds: [machineId] } };
}

/** A machine on the bench, the road reshaped (`markCantDo`). */
export function markedCantDo(input: {
  plan: RoutinePlan;
  routine: readonly string[];
  machineId: string;
  reason?: string | null;
  until: CantDo["until"];
  todayYmd: string;
  who: Who;
  floor: readonly FloorMachine[];
}): PlanEdit & { entry: CantDo } {
  const m = markCantDo({
    plan: input.plan,
    routine: input.routine,
    machineId: input.machineId,
    reason: input.reason,
    until: input.until,
    day: input.todayYmd,
    by: input.who,
    floor: input.floor,
  });
  return {
    plan: m.plan,
    routine: m.routine,
    change: { kind: "cantdo", machineIds: [input.machineId], ...(m.change.value ? { value: m.change.value } : null) },
    entry: m.entry,
  };
}

/** The purpose in the trainer's words. */
export function purposeChanged(plan: RoutinePlan, routine: readonly string[], text: string): PlanEdit {
  const value = text.trim();
  return { plan: { ...plan, purpose: value }, routine: [...routine], change: { kind: "purpose", machineIds: [], value } };
}

/** "Routine A is being built", on or off. */
export function buildingChanged(plan: RoutinePlan, routine: readonly string[], on: boolean): PlanEdit {
  const value = on ? "on" : "off";
  return { plan: applyPlanChange(plan, { kind: "building", machineIds: [], value }), routine: [...routine], change: { kind: "building", machineIds: [], value } };
}

/* ── Re-plan ───────────────────────────────────────────────────────────── */

export interface ReplanInput {
  plan: RoutinePlan;
  routine: readonly string[];
  /** What changed: one of `REPLAN_REASONS`, the trainer's own words, both, or nothing. */
  why: string | null;
  /** The machines out for now, marked can't do with `until`. */
  out: readonly string[];
  until: CantDo["until"];
  /**
   * The can't-do reason those machines are marked with, when what changed
   * names one (`replanCantDoReason`: "Surgery coming up" is a surgery).
   */
  outReason?: string | null;
  /**
   * "Start again from the starting routine with what we know": the starting
   * routine's road and day one on this floor (`startingPlanFromRoutine`).
   * Null: "Edit the lineup by hand", the road as it is.
   */
  fresh: { intended: readonly string[]; dayOne: readonly string[] } | null;
  todayYmd: string;
  who: Who;
  floor: readonly FloorMachine[];
}

export interface ReplanEdit {
  plan: RoutinePlan;
  routine: string[];
  /** The "replan": the new road, and what changed. */
  change: UnsignedChange;
  /** A "cantdo" for each machine newly out, written in the same batch. */
  also: UnsignedChange[];
}

/**
 * A Re-plan (AJ, Oct 8 2026: "we might have a plan for a routine but find
 * something out in those first few sessions that drastically changes it").
 * Nothing before it is erased: the history gets a divider, and every mark
 * already on the bench still holds.
 *
 * Starting again takes the starting routine's road on this floor. While
 * Routine A is still empty, day one is the starting routine's again; once
 * Routine A has machines, day one keeps only what is still on the road. Every
 * mark that still holds is made again on the new road, so a machine the
 * client can't do never comes back by a re-plan. Then the machines newly out
 * go on the bench, each with its stand-in, and each is a "cantdo" change in
 * the same batch. Routine A keeps its machines but those marked can't do.
 */
export function replanned(input: ReplanInput): ReplanEdit {
  const runs = runsDayOne({ routine: input.routine, plan: input.plan });
  let plan: RoutinePlan = input.plan;
  let routine = [...input.routine];
  const active = activeCantDo(input.plan, input.todayYmd);

  if (input.fresh) {
    const intended = once(input.fresh.intended);
    const dayOne = plan.dayOne
      ? (runs ? once(input.fresh.dayOne) : plan.dayOne).filter((id) => intended.includes(id))
      : null;
    plan = { ...plan, intended, ...(dayOne ? { dayOne } : null) };
    for (const c of active) {
      if (!plan.intended.includes(c.machineId) && !routine.includes(c.machineId)) continue;
      const again = markCantDo({
        plan,
        routine,
        machineId: c.machineId,
        reason: c.reason,
        until: c.until,
        day: c.day,
        by: { uid: c.byUid, ...(c.byName ? { name: c.byName } : null) },
        floor: input.floor,
      });
      plan = again.plan;
      routine = again.routine;
    }
  }

  const held = new Set(active.map((c) => c.machineId));
  const also: UnsignedChange[] = [];
  for (const id of once(input.out)) {
    if (held.has(id)) continue;
    const m = markCantDo({
      plan,
      routine,
      machineId: id,
      reason: input.outReason ?? null,
      until: input.until,
      day: input.todayYmd,
      by: input.who,
      floor: input.floor,
    });
    plan = m.plan;
    routine = m.routine;
    also.push({ kind: "cantdo", machineIds: [id], ...(m.change.value ? { value: m.change.value } : null) });
  }

  const why = input.why?.trim();
  const change: UnsignedChange = { kind: "replan", machineIds: [...plan.intended], ...(why ? { value: why } : null) };
  return { plan: applyPlanChange(plan, change), routine, change, also };
}

/** What changed on the Re-plan sheet, and the can't-do reason it gives the machines it puts on the bench. */
const REPLAN_CANT_DO: Readonly<Record<string, CantDoReason>> = {
  "Surgery coming up": "Surgery",
};

/**
 * The can't-do reason a Re-plan's "What changed?" gives the machines it
 * marks out for now: "Surgery coming up" is a surgery, so the bench and the
 * Changes say so, and the sheet offers the Health note a surgery offers
 * (AJ's "2a"). The other picks are about the plan, not the client's body,
 * and name no reason.
 */
export function replanCantDoReason(why: string | null | undefined): CantDoReason | null {
  return (why && REPLAN_CANT_DO[why]) || null;
}

/* ── Swap for ──────────────────────────────────────────────────────────── */

export interface SwapChoices {
  /** The machine's Academy family, by name ("Lower Body"), or null when the Academy doesn't sort it. */
  family: string | null;
  /** The same family on this floor, in the floor's order: not the machine, not in the plan, Routine A or on the bench. */
  same: string[];
  /** The Academy's documented substitutes (floor ids) whose every machine is on this floor and free; each set takes its place together. */
  substitutes: string[][];
}

/**
 * What a row can be swapped for (the design round, §4.3): the same Academy
 * family on THIS floor, then the Academy's documented substitutes, each with
 * its source on screen. Never a machine already in the plan, in Routine A or
 * on the bench.
 */
export function swapChoices(input: {
  machineId: string;
  plan: RoutinePlan;
  routine: readonly string[];
  floor: readonly FloorMachine[];
  todayYmd: string;
}): SwapChoices {
  const canonicalOf = floorCanonical(input.floor);
  const index = floorIndex(input.floor);
  const taken = new Set(
    [input.machineId, ...input.plan.intended, ...input.routine, ...activeCantDo(input.plan, input.todayYmd).map((c) => c.machineId)].map(canonicalOf),
  );
  const free = (floorId: string | undefined): floorId is string => !!floorId && !taken.has(canonicalOf(floorId));
  const target = canonicalOf(input.machineId);
  const category = MACHINE_CATEGORY[target];
  const same = category ? input.floor.map((m) => m.id).filter((id) => MACHINE_CATEGORY[canonicalOf(id)] === category && free(id)) : [];
  const substitutes: string[][] = [];
  for (const set of EXERCISE_SUBSTITUTES[target] ?? []) {
    const ids = set.machineIds.map((c) => index.get(c));
    if (ids.length === 0 || !ids.every(free)) continue;
    const floorIds = ids as string[];
    if (!substitutes.some((s) => sameList(s, floorIds))) substitutes.push(floorIds);
  }
  return { family: category ? CATEGORY_LABEL[category] : null, same, substitutes };
}

/* ── The floor, by the Academy's families ──────────────────────────────── */

export interface FloorFamily {
  key: string;
  label: string;
  machineIds: string[];
}

/** This studio's floor grouped by the Academy's five families, each in the floor's order; the rest last. */
export function floorByFamily(floor: readonly FloorMachine[]): FloorFamily[] {
  const canonicalOf = floorCanonical(floor);
  const ids = once(floor.map((m) => m.id));
  const out: FloorFamily[] = ACADEMY_CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_LABEL[c],
    machineIds: ids.filter((id) => MACHINE_CATEGORY[canonicalOf(id)] === c),
  }));
  const rest = ids.filter((id) => !MACHINE_CATEGORY[canonicalOf(id)]);
  out.push({ key: "other", label: "Other machines on this floor", machineIds: rest });
  return out.filter((f) => f.machineIds.length > 0);
}

/* ── Before the plan is kept: the draft ────────────────────────────────── */

/** A machine on or off day one in a draft, day one kept in the road's order. */
export function withDayOneToggled(plan: RoutinePlan, machineId: string, on: boolean): RoutinePlan {
  const dayOne = plan.dayOne ?? [];
  if (on) return dayOne.includes(machineId) ? plan : { ...plan, dayOne: routineWith(plan, dayOne, [machineId]) };
  return { ...plan, dayOne: dayOne.filter((id) => id !== machineId) };
}

/** A floor machine tapped in a draft built by hand: in (on day one or on deck) or out. */
export function withFloorTapped(plan: RoutinePlan, machineId: string, addTo: "day" | "deck"): RoutinePlan {
  if (plan.intended.includes(machineId)) {
    return applyPlanChange(plan, { kind: "remove", machineIds: [machineId] });
  }
  const intended = [...plan.intended, machineId];
  const dayOne = plan.dayOne ?? [];
  return { ...plan, intended, dayOne: addTo === "day" ? [...dayOne, machineId] : dayOne };
}

/**
 * The bench carried onto another start: each mark that still holds made
 * again on the new road, keeping who marked it and when.
 */
export function withBenchCarried(plan: RoutinePlan, bench: readonly CantDo[], todayYmd: string, floor: readonly FloorMachine[]): RoutinePlan {
  let out: RoutinePlan = plan;
  for (const c of bench) {
    if (!cantDoActive(c, todayYmd)) continue;
    out = markCantDo({
      plan: out,
      routine: [],
      machineId: c.machineId,
      reason: c.reason,
      until: c.until,
      day: c.day,
      by: { uid: c.byUid, ...(c.byName ? { name: c.byName } : null) },
      floor,
    }).plan;
  }
  return out;
}

/** A plan from a routine as it stands ("Add a plan", Save Routine A): its road is the routine, not being built. */
export function planFromRoutine(machineIds: readonly string[], who: Who, todayYmd: string, purpose = ""): RoutinePlan {
  return {
    purpose: purpose.trim(),
    intended: once(machineIds),
    building: false,
    madeByUid: who.uid,
    ...(who.name?.trim() ? { madeByName: who.name.trim() } : null),
    madeAt: todayYmd,
  };
}

/**
 * The Health note a surgery or an injury offers (AJ's "2a"), in words that
 * say what happened without a pronoun: "Surgery: Seated Dip is off Routine
 * A's plan until cleared."
 */
export function healthNoteBody(entry: Pick<CantDo, "machineId" | "reason" | "until">, nameOf: (id: string) => string, todayYmd: string): string {
  return healthNoteBodyFor({ machineIds: [entry.machineId], reason: entry.reason, until: entry.until }, nameOf, todayYmd);
}

/**
 * The same note for every machine one Re-plan put on the bench at once, so a
 * surgery is ONE Health note, never one a machine: "Surgery: Leg Press and
 * Compound Row are off Routine A's plan until cleared."
 */
export function healthNoteBodyFor(
  input: { machineIds: readonly string[]; reason?: string | null; until: CantDo["until"] },
  nameOf: (id: string) => string,
  todayYmd: string,
): string {
  const ids = once(input.machineIds);
  const line = `${namesOf(ids, nameOf)} ${ids.length === 1 ? "is" : "are"} off Routine A's plan ${untilWords(input.until, todayYmd)}.`;
  const reason = input.reason?.trim();
  return reason ? `${reason}: ${line}` : line;
}

/** "Leg Press, Compound Row and Lumbar": machines said as a list, every name whole. */
export function namesOf(ids: readonly string[], nameOf: (id: string) => string): string {
  return listWords(ids.map(nameOf));
}
