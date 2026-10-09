/**
 * Can't do: what a client can't do, and what the plan does about it (AJ,
 * Oct 8 2026).
 *
 * "everyone starts at different strength levels with different body types
 * and also different contraindications so we may use different machines at
 * the start ... we could have a client who is getting surgery that would
 * allow them to have as much ROM or not be able to do every machine. some
 * clients just wont be able to do certain machines. not every studio has the
 * same machines."
 *
 * His pick, "2a": can't-do lives on the client's plan (Routine A's), read by
 * A and B. So the Academy's template is a first draft, never a script:
 * - marking a machine reshapes the road, today's routine and the plan's day
 *   one (the first visit's machines while Routine A is empty): the Academy's
 *   documented substitute when it is on this floor and allowed, else a
 *   machine of the same Academy family on this floor, else the machine simply
 *   leaves (`reshapeForCantDo`), and the screen says what it did
 *   (`standInLine`: "Chest Flye instead of Seated Dip");
 * - reopening puts it back where its stand-in stands (`reopenCantDo`);
 * - a dated mark ends by itself once its day has passed, and nothing is
 *   written when it does (`cantDoActive`);
 * - a health reason offers a Health note, asked and never automatic
 *   (`healthNoteOffer`), so the leaders see it on Operations → Today.
 *
 * Pure. Machine ids are the floor's, as the plan holds them; the Academy's
 * tables are read through the floor's catalog ids (`floorCanonical`).
 */
import type { HealthFlavour } from "../../types/journal";
import { HEALTH_FLAVOURS } from "../client-notes/note-catalog";
import { EXERCISE_SUBSTITUTES, MACHINE_CATEGORY } from "../routine-builder/academy";
import { listWords, planWithCantDo, planWithoutCantDo } from "./plan";
import { floorCanonical, floorIndex, type FloorMachine } from "./starting-plan";
import type { CantDo, PlanChange, RoutinePlan } from "./types";

/** The reasons offered, all optional (the design round, §4.4). */
export const CANT_DO_REASONS = [
  "Surgery",
  "Injury or pain",
  "Doesn't fit the machine",
  "Not cleared yet",
  "Client won't",
] as const;

export type CantDoReason = (typeof CANT_DO_REASONS)[number];

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ── Reshaping the road ───────────────────────────────────────────────── */

export interface CantDoReshape {
  intended: string[];
  routine: string[];
  /** What took the machine's place (floor ids); empty when nothing on this floor fits, or it wasn't in either list. */
  replacedBy: string[];
}

/**
 * Put `replacements` where `target` stands, keeping its place (the
 * routine-builder's `replaceInSequence`, on floor ids: that one turns every id
 * into a catalog id, which would rewrite a studio's own unit ids in the plan).
 * A replacement already in the list is not added twice.
 */
export function replaceAt(list: readonly string[], target: string, replacements: readonly string[]): string[] {
  const at = list.indexOf(target);
  if (at === -1) return [...list];
  const incoming = replacements.filter((r, i) => replacements.indexOf(r) === i && (r === target || !list.includes(r)));
  return [...list.slice(0, at), ...incoming, ...list.slice(at + 1)];
}

/**
 * The plan's road and today's routine with `machineId` out, and what stands
 * in for it (the prototype's `tailor()`, made real).
 *
 * The stand-in, in order:
 * 1. the Academy's documented substitute (`EXERCISE_SUBSTITUTES`, Exercise
 *    Substitutes.txt), set by set, the first machine of a set that is on this
 *    floor, not itself can't-do and not already in the plan or the routine.
 *    The Academy's sets are combinations that cover the machine together; the
 *    plan takes one machine so the routine keeps its length, and the trainer
 *    adds the rest if they want them;
 * 2. else a machine of the same Academy family (`MACHINE_CATEGORY`) on this
 *    floor, in the floor's own order, under the same conditions;
 * 3. else none: the machine simply leaves.
 * Both lists keep their order; the stand-in takes the machine's place. A
 * machine in neither list changes nothing (it goes on the bench only).
 */
export function reshapeForCantDo(input: {
  intended: readonly string[];
  routine: readonly string[];
  machineId: string;
  floor: readonly FloorMachine[];
  /** Machines already marked can't do and still marked (floor ids): never a stand-in. */
  cantDo?: readonly string[];
}): CantDoReshape {
  const { intended, routine, machineId } = input;
  if (!intended.includes(machineId) && !routine.includes(machineId)) {
    return { intended: [...intended], routine: [...routine], replacedBy: [] };
  }
  const canonicalOf = floorCanonical(input.floor);
  const index = floorIndex(input.floor);
  const target = canonicalOf(machineId);
  const blocked = new Set([...(input.cantDo ?? []), machineId].map(canonicalOf));
  const taken = new Set([...intended, ...routine].map(canonicalOf));
  const onFloor = new Set(input.floor.map((m) => m.id));
  const allowed = (floorId: string | undefined): floorId is string => {
    if (!floorId || !onFloor.has(floorId) || floorId === machineId) return false;
    const c = canonicalOf(floorId);
    return !blocked.has(c) && !taken.has(c);
  };

  let pick: string | undefined;
  for (const set of EXERCISE_SUBSTITUTES[target] ?? []) {
    pick = set.machineIds.map((c) => index.get(c)).find(allowed);
    if (pick) break;
  }
  if (!pick) {
    const family = MACHINE_CATEGORY[target];
    if (family) pick = input.floor.map((m) => m.id).find((id) => MACHINE_CATEGORY[canonicalOf(id)] === family && allowed(id));
  }

  const replacedBy = pick ? [pick] : [];
  return {
    intended: replaceAt(intended, machineId, replacedBy),
    routine: replaceAt(routine, machineId, replacedBy),
    replacedBy,
  };
}

/** The words a "cantdo" change stores in `value`: "Surgery · cleared", the until alone with no reason. */
export function cantDoValue(entry: Pick<CantDo, "reason" | "until">): string {
  return [entry.reason?.trim(), entry.until].filter(Boolean).join(" · ");
}

/** A "cantdo" change's value read back: the last part is the until, the rest the reason. */
export function parseCantDoValue(value: string | null | undefined): { reason?: string; until: string } {
  const parts = (value ?? "").split(" · ").map((s) => s.trim()).filter(Boolean);
  const until = parts.pop() ?? "cleared";
  const reason = parts.join(" · ");
  return reason ? { reason, until } : { until };
}

export interface CantDoMark {
  /** The plan with the entry in and its road reshaped. */
  plan: RoutinePlan;
  /** Today's routine with the machine out and its stand-in in its place. */
  routine: string[];
  entry: CantDo;
  /** The change to append beside the plan, in the same batch (`store.ts`). */
  change: PlanChange;
}

/**
 * Everything one "Not for {first name}" tap writes, worked out at once: the
 * entry, the reshaped road and routine, and the change. Nothing here is
 * required but the until; a mark made again keeps what first stood in, so
 * changing a reason or a day never loses the stand-in.
 *
 * The plan's day one (`RoutinePlan.dayOne`, the first visit's machines while
 * Routine A is empty) is reshaped the same way: the stand-in takes the
 * machine's place there too, or the machine simply leaves it.
 */
export function markCantDo(input: {
  plan: RoutinePlan;
  routine: readonly string[];
  machineId: string;
  reason?: string | null;
  until: CantDo["until"];
  /** The studio's day, `YYYY-MM-DD`. */
  day: string;
  by: { uid: string; name?: string };
  floor: readonly FloorMachine[];
}): CantDoMark {
  const others = activeCantDo(input.plan, input.day)
    .map((c) => c.machineId)
    .filter((id) => id !== input.machineId);
  const reshaped = reshapeForCantDo({
    intended: input.plan.intended,
    routine: input.routine,
    machineId: input.machineId,
    floor: input.floor,
    cantDo: others,
  });
  const earlier = input.plan.cantDo?.find((c) => c.machineId === input.machineId);
  const replacedBy = reshaped.replacedBy.length > 0 ? reshaped.replacedBy : (earlier?.replacedBy ?? []);
  // A mark made again finds the machine already off the road, so where it
  // stood is the first mark's answer.
  const onRoad = earlier?.onRoad ?? input.plan.intended.includes(input.machineId);
  // Where it stood on day one, so Reopen can put it back there when nothing
  // stands in for it; the same first-mark answer as `onRoad`.
  const onDayOne = input.plan.dayOne?.indexOf(input.machineId) ?? -1;
  const dayOneAt = earlier?.dayOneAt ?? (onDayOne >= 0 ? onDayOne : null);
  const reason = input.reason?.trim();
  const entry: CantDo = {
    machineId: input.machineId,
    ...(reason ? { reason } : null),
    until: input.until,
    day: input.day,
    byUid: input.by.uid,
    ...(input.by.name ? { byName: input.by.name } : null),
    replacedBy,
    onRoad,
    ...(dayOneAt !== null ? { dayOneAt } : null),
  };
  const dayOne = input.plan.dayOne ? { dayOne: replaceAt(input.plan.dayOne, input.machineId, reshaped.replacedBy) } : null;
  return {
    plan: planWithCantDo({ ...input.plan, intended: reshaped.intended, ...dayOne }, entry),
    routine: reshaped.routine,
    entry,
    change: {
      kind: "cantdo",
      machineIds: [input.machineId],
      value: cantDoValue(entry),
      byUid: input.by.uid,
      ...(input.by.name ? { byName: input.by.name } : null),
    },
  };
}

/* ── Reopening ────────────────────────────────────────────────────────── */

/**
 * What stands in a marked machine's place on the road now: its stand-in, or,
 * when that was marked too, whatever stands in for that.
 */
function standInOnRoad(plan: RoutinePlan, machineId: string, seen: Set<string> = new Set()): string | null {
  seen.add(machineId);
  const entry = plan.cantDo?.find((c) => c.machineId === machineId);
  for (const m of entry?.replacedBy ?? []) {
    if (plan.intended.includes(m)) return m;
    if (!seen.has(m)) {
      const deeper = standInOnRoad(plan, m, seen);
      if (deeper) return deeper;
    }
  }
  return null;
}

/**
 * The plan with `machineId` reopened ("Reopen puts the machine back where it
 * stood"). Its entry leaves the bench, and the machine goes back on the road
 * where its first stand-in stands. The stand-in leaves the road, unless the
 * client does it now (it is in the routine): then the machine goes in just
 * before it and both stay, because a routine's machines are never taken out
 * of the plan behind the trainer's back. The routine itself is not changed:
 * the machine is on deck, and comes in the way any planned machine does.
 *
 * A machine that wasn't on the road when it was marked (an extra in today's
 * routine only, `onRoad` false) goes back to that: off the bench, and the
 * road as it is, so reopening never adds a stop the plan didn't have.
 * Otherwise where it stood is known only through its stand-in; with none on
 * the road (nothing on this floor fitted), it goes back at the end of the
 * road, where the trainer moves it. A machine that isn't on the bench changes
 * nothing.
 *
 * Day one (`RoutinePlan.dayOne`) follows the road: where the stand-in leaves
 * the road, the machine takes its place on day one too. When nothing stands
 * in on day one (nothing on this floor fitted, or the stand-in has left day
 * one since), the machine goes back on day one where it stood when it was
 * marked (`CantDo.dayOneAt`). When the client does the stand-in now, day one
 * stays as it is (Routine A has machines, so day one no longer runs), and
 * the machine is on deck.
 */
export function reopenCantDo(plan: RoutinePlan, routine: readonly string[], machineId: string): RoutinePlan {
  const entry = plan.cantDo?.find((c) => c.machineId === machineId);
  if (!entry) return plan;
  const standIn = standInOnRoad(plan, machineId);
  const base = planWithoutCantDo(plan, [machineId]);
  if (plan.intended.includes(machineId) || entry.onRoad === false) return base;
  if (!standIn) return { ...base, intended: [...plan.intended, machineId], ...backOnDayOne(base, entry, null) };
  const at = plan.intended.indexOf(standIn);
  if (routine.includes(standIn)) {
    return { ...base, intended: [...plan.intended.slice(0, at), machineId, ...plan.intended.slice(at)] };
  }
  return { ...base, intended: replaceAt(plan.intended, standIn, [machineId]), ...backOnDayOne(base, entry, standIn) };
}

/**
 * Day one with a reopened machine back on it: in its stand-in's place when
 * the stand-in is on day one, else where the machine stood when it was
 * marked (`dayOneAt`, at the end when day one is shorter now). Nothing when
 * the plan has no day one, the machine wasn't on it, or it is there already;
 * never a `dayOne: undefined`, which Firestore refuses.
 */
function backOnDayOne(plan: RoutinePlan, entry: CantDo, standIn: string | null): { dayOne: string[] } | null {
  const dayOne = plan.dayOne;
  if (!dayOne || dayOne.includes(entry.machineId)) return null;
  if (standIn && dayOne.includes(standIn)) return { dayOne: replaceAt(dayOne, standIn, [entry.machineId]) };
  const at = entry.dayOneAt;
  if (typeof at !== "number" || !Number.isInteger(at) || at < 0) return null;
  const i = Math.min(at, dayOne.length);
  return { dayOne: [...dayOne.slice(0, i), entry.machineId, ...dayOne.slice(i)] };
}

/* ── Whether a mark still holds ───────────────────────────────────────── */

/**
 * Whether a mark still holds on the studio's day `todayYmd`. "cleared" and
 * "always" hold until someone reopens the machine. A dated mark holds through
 * its day ("until Oct 20" holds on Oct 20) and has ended once that day has
 * passed (the design round's §4.4: "An until-date in the past means the mark
 * has ended"), so the client is back on it the day after (`backOnLine`). An
 * until that isn't a day is read as "cleared": a mark is never lifted by a
 * value Journey can't read.
 */
export function cantDoActive(entry: Pick<CantDo, "until">, todayYmd: string): boolean {
  if (!YMD.test(entry.until)) return true;
  return todayYmd <= entry.until;
}

/**
 * A typed until-date a new mark can hold to: a whole day, today or later,
 * else null. A date picker's `min` is only a hint (a typed or pasted day
 * gets past it), and a day already gone would write a mark that had ended
 * before it was made.
 */
export function untilDayFrom(date: string, todayYmd: string): string | null {
  return YMD.test(date) && date >= todayYmd ? date : null;
}

/** The day after a `YYYY-MM-DD` key, worked on the key alone, never through a time zone. */
export function dayAfterKey(key: string): string {
  const m = YMD.exec(key);
  if (!m) return key;
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** The plan's marks that still hold today. B and every screen read Routine A's plan. */
export function activeCantDo(plan: Pick<RoutinePlan, "cantDo"> | null | undefined, todayYmd: string): CantDo[] {
  return (plan?.cantDo ?? []).filter((c) => cantDoActive(c, todayYmd));
}

/**
 * A routine's machines for today with every machine the client can't do
 * left out (Routine A's plan's marks that hold today, read by A and B: AJ's
 * "2a"). What a session on Routine B is seeded with and what the briefing
 * draws for it (the whole-branch review, Oct 9 2026: a machine marked "Surgery
 * · until cleared" stayed in a Routine B made before Round 2, or one of B's
 * own swaps, and every B session ran it). A Routine A's own machines are
 * reshaped when the mark is made, so for A this changes nothing.
 */
export function runnableToday(
  machineIds: readonly string[],
  aPlan: Pick<RoutinePlan, "cantDo"> | null | undefined,
  todayYmd: string,
): string[] {
  const held = new Set(activeCantDo(aPlan, todayYmd).map((c) => c.machineId));
  return held.size === 0 ? [...machineIds] : machineIds.filter((id) => !held.has(id));
}

/* ── The words ────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 20", with the year when it isn't today's year (or when today isn't known). Read from the key, never through a time zone. */
export function cantDoDayWords(key: string, todayYmd?: string): string {
  const m = YMD.exec(key);
  if (!m) return key;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return key;
  const sameYear = todayYmd !== undefined && todayYmd.slice(0, 4) === m[1];
  return `${month} ${Number(m[3])}${sameYear ? "" : ` ${m[1]}`}`;
}

/** "until cleared", "always", "until Oct 20". */
export function untilWords(until: string, todayYmd?: string): string {
  if (until === "always") return "always";
  if (YMD.test(until)) return `until ${cantDoDayWords(until, todayYmd)}`;
  return "until cleared";
}

/**
 * "Back on Oct 21" once a mark "until Oct 20" has ended (the first day it no
 * longer holds); null while it holds or has no day.
 */
export function backOnLine(entry: Pick<CantDo, "until">, todayYmd: string): string | null {
  if (!YMD.test(entry.until) || cantDoActive(entry, todayYmd)) return null;
  return `Back on ${cantDoDayWords(dayAfterKey(entry.until), todayYmd)}`;
}

/**
 * The bench's line: "Seated Dip · Surgery · until cleared"; with no reason,
 * "Seated Dip · until cleared"; once a mark until Oct 20 has ended, "Seated
 * Dip · Surgery · back on Oct 21".
 */
export function cantDoLine(
  entry: Pick<CantDo, "machineId" | "reason" | "until">,
  nameOf: (id: string) => string,
  todayYmd?: string,
): string {
  const ended = todayYmd !== undefined && YMD.test(entry.until) && !cantDoActive(entry, todayYmd);
  const when = ended ? `back on ${cantDoDayWords(dayAfterKey(entry.until), todayYmd)}` : untilWords(entry.until, todayYmd);
  return [nameOf(entry.machineId), entry.reason?.trim(), when].filter(Boolean).join(" · ");
}

/** Names said as a list (plan.ts's, kept here for the readers that import it from this file). */
export { listWords };

/**
 * What the reshape did, said: "Chest Flye instead of Seated Dip", or, with
 * nothing to stand in, "Seated Dip left out: nothing like it on this floor".
 */
export function standInLine(entry: Pick<CantDo, "machineId" | "replacedBy">, nameOf: (id: string) => string): string {
  const to = entry.replacedBy ?? [];
  if (to.length === 0) return `${nameOf(entry.machineId)} left out: nothing like it on this floor`;
  return `${listWords(to.map(nameOf))} instead of ${nameOf(entry.machineId)}`;
}

/* ── A Health note, offered ───────────────────────────────────────────── */

export interface HealthNoteOffer {
  /** The notes' category: Health reaches the leaders on Operations → Today. */
  category: "health";
  /** The Health flavour the note is filed under (`note-catalog.ts`). */
  flavour: HealthFlavour;
  /** The flavour's words, as the note composer says them. */
  label: string;
}

/** The two reasons that are a Health note too ("2a": surgery or an injury). */
const OFFERED_FLAVOURS: ReadonlySet<HealthFlavour> = new Set<HealthFlavour>(["Surgery", "Injury"]);

/**
 * With Surgery or Injury or pain, the mark offers one tap that writes a
 * Health note through the notes' one writer, so the leaders see it. Asked,
 * never automatic; null for every other reason and for none.
 */
export function healthNoteOffer(reason: string | null | undefined): HealthNoteOffer | null {
  const said = reason?.trim();
  if (!said) return null;
  const flavour = HEALTH_FLAVOURS.find(
    (f) => OFFERED_FLAVOURS.has(f.id as HealthFlavour) && (f.label === said || f.id === said),
  );
  return flavour ? { category: "health", flavour: flavour.id as HealthFlavour, label: flavour.label } : null;
}
