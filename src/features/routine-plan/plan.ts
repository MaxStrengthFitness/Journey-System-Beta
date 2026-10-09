/**
 * The plan model: how far along a routine is, what comes next, what a change
 * does, and what the Wrap-up offers for next time (AJ, Oct 7 2026).
 *
 * Pure. The routine's `machineIds` is what the client does now; the plan's
 * `intended` is the road. A machine the trainer added that the plan doesn't
 * name is an extra, kept where the trainer put it, never dropped.
 *
 * The consult is not Routine A (AJ, Oct 8 2026: "this also counts with the
 * consult visit, sometimes the consult machines will not be the same as their
 * a routine"). A plan for a client starting out carries the first visit's
 * machines as `dayOne` and leaves Routine A empty: a session runs day one
 * while Routine A has nothing (`todayFor`), and the Wrap-up offers today's
 * machines unticked, so the trainer ticks the ones that start Routine A
 * (`nextTimeRows`, his "3a").
 */
import { STARTING_COLUMN_LABEL, type StartingColumn } from "./starting-weights";
import type { CantDo, PlanChange, RoutinePlan } from "./types";

/**
 * An "add" or "remove" change's `value` when it moves Routine A's own
 * machines and leaves the road as it was: "Add to A now" puts a planned
 * machine into Routine A, and the Lineup's "Take out of Routine A" takes one
 * out while the plan keeps it on deck. Without it an "add" puts a machine on
 * the road and a "remove" takes it off the plan too. The caller moves the
 * routine's own machines in the same batch.
 */
export const ROUTINE_ONLY = "routine";

/**
 * What changed, offered on the Re-plan sheet (AJ, Oct 8 2026: "we might have
 * a plan for a routine but find something out in those first few sessions
 * that drastically changes it or we could have a client who is getting
 * surgery"). A choice, never required; the trainer may write their own.
 */
export const REPLAN_REASONS = [
  "Surgery coming up",
  "Found something in the first sessions",
  "Client asked",
  "Training at another studio",
] as const;

export interface PlanProgress {
  /** Machines of the plan the routine has, out of the plan's total. */
  have: number;
  of: number;
  /** The plan's next machine the routine doesn't have yet, or null when it has them all. */
  next: string | null;
  /** In the routine, not in the plan. */
  extras: string[];
  /** The routine has every machine the plan names. */
  complete: boolean;
}

export function planProgress(plan: Pick<RoutinePlan, "intended">, routine: readonly string[]): PlanProgress {
  const have = plan.intended.filter((id) => routine.includes(id)).length;
  const next = plan.intended.find((id) => !routine.includes(id)) ?? null;
  return {
    have,
    of: plan.intended.length,
    next,
    extras: routine.filter((id) => !plan.intended.includes(id)),
    complete: next === null,
  };
}

/** "Leg Press", "Leg Press and Lumbar", "Leg Press, Lumbar and Abs": names said as a list, every one whole. */
export function listWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "3 of 6 · next: Chest Press". Names come from the caller (a floor's names,
 * never truncated).
 *
 * With Routine A still empty and a day one on the plan (`dayOne`, the plan's
 * own), the line says what the first visit runs instead of a next machine:
 * "0 of 6 · day one: Leg Press, Compound Row and Lumbar". The consult is not
 * Routine A, so nothing of it counts until the Wrap-up ticks it in.
 */
export function progressLine(
  progress: PlanProgress,
  nameOf: (id: string) => string,
  dayOne?: readonly string[] | null,
): string {
  if (progress.of === 0) return "No machines planned yet";
  // have 0 and no extras is exactly an empty routine: every machine it holds is one or the other.
  if (progress.have === 0 && progress.extras.length === 0 && dayOne && dayOne.length > 0) {
    return `0 of ${progress.of} · day one: ${listWords(dayOne.map(nameOf))}`;
  }
  if (progress.complete) return `All ${progress.of} planned machines in`;
  // Against a session (routine-plan/session-plan.ts): the rest are on the
  // bench or not on this floor, so nothing is next, and they aren't "in".
  if (progress.next === null) return `${progress.have} of ${progress.of} · no more to add today`;
  return `${progress.have} of ${progress.of} · next: ${nameOf(progress.next)}`;
}

interface TodayInput {
  /** The routine's `machineIds`. */
  routine: readonly string[] | null | undefined;
  plan: Pick<RoutinePlan, "dayOne"> | null | undefined;
}

/**
 * Whether a visit runs the plan's day one by default: Routine A has nothing
 * and the plan has a day one (the consult, or any visit before the Wrap-up's
 * ticks start Routine A). While it does, the screens draw day one where
 * Routine A's rows would be, and nothing offers to put a single machine into
 * Routine A (Programming's "Add to A now"): one machine in an empty Routine A
 * would become everything a visit runs, and day one would silently drop.
 * The Wrap-up starts Routine A.
 */
export function runsDayOne(input: TodayInput): boolean {
  return !(input.routine && input.routine.length > 0) && (input.plan?.dayOne?.length ?? 0) > 0;
}

/**
 * The machines a session runs by default (AJ, Oct 8 2026: "sometimes the
 * consult machines will not be the same as their a routine"):
 * - the routine's machines, when it has any;
 * - else the plan's day one, in the order the plan keeps it (the consult, or
 *   any visit while Routine A still has nothing, `runsDayOne`);
 * - else none: the trainer adds machines as they go.
 * Never the whole floor, and never written anywhere: what Start passes to the
 * session as today's. Every reader that seeds a session from Routine A's
 * `machineIds` reads this instead (the round document, §4.5).
 */
export function todayFor(input: TodayInput): string[] {
  if (input.routine && input.routine.length > 0) return [...input.routine];
  const dayOne = input.plan?.dayOne ?? [];
  return dayOne.filter((id, i) => dayOne.indexOf(id) === i);
}

/**
 * The routine with `added` machines in, in the plan's order. A machine the
 * plan doesn't name goes after the plan's machines that precede it in the
 * routine today, i.e. it keeps its place; added extras go at the end.
 */
export function routineWith(
  plan: Pick<RoutinePlan, "intended">,
  routine: readonly string[],
  added: readonly string[],
): string[] {
  const members = new Set([...routine, ...added]);
  const planned = plan.intended.filter((id) => members.has(id));
  // Walk today's routine and weave its extras in after the planned machine they followed.
  const out = [...planned];
  let anchor = -1;
  for (const id of routine) {
    const at = out.indexOf(id);
    if (at >= 0) {
      anchor = at;
      continue;
    }
    out.splice(anchor + 1, 0, id);
    anchor += 1;
  }
  for (const id of added) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The plan with a can't-do entry in it, replacing any earlier entry for the
 * same machine (a second mark changes the reason or the until; it never
 * stacks). The road itself is reshaped by `reshapeForCantDo` (cant-do.ts),
 * which knows the floor; this only keeps the entry.
 */
export function planWithCantDo(plan: RoutinePlan, entry: CantDo): RoutinePlan {
  const rest = (plan.cantDo ?? []).filter((c) => c.machineId !== entry.machineId);
  return { ...plan, cantDo: [...rest, entry] };
}

/** The plan with no can't-do entry for these machines. The road is put back by `reopenCantDo` (cant-do.ts). */
export function planWithoutCantDo(plan: RoutinePlan, machineIds: readonly string[]): RoutinePlan {
  if (!plan.cantDo) return plan;
  return { ...plan, cantDo: plan.cantDo.filter((c) => !machineIds.includes(c.machineId)) };
}

/**
 * The plan with day one changed by `change`, when it has a day one; a plan
 * without one stays without one (never a `dayOne: undefined`, which
 * Firestore refuses).
 */
function withDayOne(plan: RoutinePlan, change: (dayOne: string[]) => string[]): RoutinePlan {
  return plan.dayOne ? { ...plan, dayOne: change(plan.dayOne) } : plan;
}

/** A column the sheet has, or "none" (Don't show ranges); anything else is not a column. */
export function isStartingColumnChoice(value: unknown): value is StartingColumn | "none" {
  return value === "none" || (typeof value === "string" && Object.prototype.hasOwnProperty.call(STARTING_COLUMN_LABEL, value));
}

/**
 * A change applied to a plan. Returns the new plan; the routine itself is
 * moved by the caller (a session's Finish, the Wrap-up, Programming).
 *
 * A "cantdo" change's value holds only its words ("Surgery · cleared"), so
 * the entry it records (who, the day, what stood in) is passed beside it as
 * `cantDo`; without one, the change has nothing to record and the plan is
 * returned as it was. Reshaping the road for it is `reshapeForCantDo`'s, and
 * putting a reopened machine back is `reopenCantDo`'s (cant-do.ts): both need
 * the floor or the routine, which a change alone doesn't carry.
 *
 * Day one follows the road (`RoutinePlan.dayOne`): a machine removed leaves
 * it, a swap is made on it too, and a new start or a re-plan keeps only the
 * day-one machines still on the new road, so a visit while Routine A is empty
 * never runs a machine the plan has let go. Adding to the road never puts a
 * machine on day one.
 *
 * A reorder gives day one the order it gives day one's machines: the trainer
 * moved them, so a visit runs them that way. A screen writes the order it
 * draws (the Lineup draws day one first, then On deck), so a move on the
 * deck leaves day one as it was, and a move on day one moves it there. Day
 * one's order is not repaired against the Academy's sequencing rules after a
 * trainer's move: those are quiet sentences, never a block (order-effects.ts).
 */
export function applyPlanChange(
  plan: RoutinePlan,
  change: Pick<PlanChange, "kind" | "machineIds" | "value">,
  cantDo?: CantDo,
): RoutinePlan {
  const ids = change.machineIds;
  switch (change.kind) {
    case "start":
      return withDayOne({ ...plan, intended: [...ids] }, (dayOne) => dayOne.filter((id) => ids.includes(id)));
    case "add": {
      // Into Routine A only ("Add to A now"): the machine is on the road already.
      if (change.value === ROUTINE_ONLY) return plan;
      const intended = [...plan.intended];
      for (const id of ids) if (!intended.includes(id)) intended.push(id);
      return { ...plan, intended };
    }
    case "remove":
      // Out of Routine A only ("Take out of Routine A", the Lineup's row
      // sheet): the plan keeps the machine on deck, so the road is as it was.
      // The caller moves the routine's own machines in the same batch.
      if (change.value === ROUTINE_ONLY) return plan;
      return withDayOne(
        { ...plan, intended: plan.intended.filter((id) => !ids.includes(id)) },
        (dayOne) => dayOne.filter((id) => !ids.includes(id)),
      );
    case "swap": {
      // `[from, ...to]`: one machine for another, or for the Academy's
      // documented set ("Leg Extension + Hip Abduction"), which together take
      // its place in the order given.
      const [from, ...to] = ids;
      if (!from || to.length === 0) return plan;
      // The machines coming in take the one going out's place, unless they
      // are there already: then the one going out simply leaves.
      const swapIn = (list: readonly string[]) => {
        const at = list.indexOf(from);
        if (at === -1) return [...list];
        const incoming = to.filter((id, i) => to.indexOf(id) === i && !list.includes(id));
        return [...list.slice(0, at), ...incoming, ...list.slice(at + 1)];
      };
      const swaps = plan.swaps?.map((s) => (s.with === from ? { ...s, with: to[0] } : s));
      return withDayOne({ ...plan, intended: swapIn(plan.intended), ...(swaps ? { swaps } : null) }, swapIn);
    }
    case "reorder": {
      // Every planned machine stays: an id the new order forgot keeps its place at the end.
      const kept = ids.filter((id) => plan.intended.includes(id));
      const rest = plan.intended.filter((id) => !kept.includes(id));
      const intended = [...kept, ...rest];
      // Day one takes the road's new order among its own machines; one the
      // road doesn't hold (never written so, but read safely) stays after them.
      return withDayOne({ ...plan, intended }, (dayOne) => [
        ...intended.filter((id) => dayOne.includes(id)),
        ...dayOne.filter((id) => !intended.includes(id)),
      ]);
    }
    case "purpose":
      return { ...plan, purpose: change.value ?? plan.purpose };
    case "building":
      return { ...plan, building: change.value === "on" };
    case "focus": {
      const focus = (change.value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { ...plan, focus };
    }
    case "cantdo":
      return cantDo ? planWithCantDo(plan, cantDo) : plan;
    case "cando":
      return planWithoutCantDo(plan, ids);
    case "replan": {
      // The road starts again from what the trainer kept; a machine named
      // twice is kept once, where it first stands.
      const intended = ids.filter((id, i) => ids.indexOf(id) === i);
      return withDayOne({ ...plan, intended }, (dayOne) => dayOne.filter((id) => intended.includes(id)));
    }
    case "column":
      // A value that isn't one of the sheet's columns is skipped, never bent
      // into one (the studio settings' rule).
      return isStartingColumnChoice(change.value) ? { ...plan, startingColumn: change.value } : plan;
  }
}

/* ── The Wrap-up's "Next time" ─────────────────────────────────────────── */

export interface NextTimeRow {
  machineId: string;
  /** Ticked when the Wrap-up opens. */
  defaultOn: boolean;
  /**
   * Why it is on the list, for the row's small line:
   * - "day-one": one of the plan's day one, run while Routine A had nothing
   *   (the consult);
   * - "planned": next in the plan;
   * - "added-today": added today, not in the plan.
   */
  why: "day-one" | "planned" | "added-today";
}

/**
 * What the Wrap-up offers to carry into the routine for next time (AJ, Oct 7
 * 2026: "in the wrap-up that it just by default adds on, but you can say,
 * like, tick it off").
 *
 * Only machines PERFORMED today that the routine doesn't have yet are offered:
 * a machine skipped on a short day stays in the routine and is not on the
 * list, so a tired day never shrinks it. While the plan is being built
 * (AJ's toggle) every row starts ticked; once it isn't, a one-off machine
 * starts unticked, because "an established routine changes on purpose".
 * No plan at all: offered unticked, the same as an established routine.
 *
 * The consult is not Routine A (AJ, Oct 8 2026, "3a", and: "this also counts
 * with the consult visit, sometimes the consult machines will not be the same
 * as their a routine"). So when the routine is EMPTY at the session's start
 * (the consult, or any visit while Routine A has nothing), every row starts
 * unticked, the plan being built or not, and the trainer ticks which of
 * today's machines start Routine A. Those rows say why by the plan's day one
 * first ("day-one"), then the road ("planned"), then neither ("added-today").
 */
export function nextTimeRows(input: {
  plan: Pick<RoutinePlan, "intended" | "building" | "dayOne"> | null;
  /** The routine's machines at the session's start. */
  routine: readonly string[];
  performedToday: readonly string[];
}): NextTimeRow[] {
  const empty = input.routine.length === 0;
  const defaultOn = !empty && input.plan?.building === true;
  const dayOne = empty ? (input.plan?.dayOne ?? []) : [];
  const rows: NextTimeRow[] = [];
  for (const id of input.performedToday) {
    if (input.routine.includes(id) || rows.some((r) => r.machineId === id)) continue;
    const why: NextTimeRow["why"] = dayOne.includes(id)
      ? "day-one"
      : (input.plan?.intended.includes(id) ?? false)
        ? "planned"
        : "added-today";
    rows.push({ machineId: id, defaultOn, why });
  }
  return rows;
}

/**
 * The routine for next time from the Wrap-up's ticks, in the plan's order.
 * With no plan, the ticked machines join at the end in the order performed.
 *
 * An EMPTY Routine A started from the ticks (the consult, "Tick the ones that
 * start Routine A") takes the road's order too, not day one's: every later
 * Wrap-up puts Routine A in the road's order (`routineWith`), so starting it
 * any other way would only flip its order at the next visit. The order
 * effects say, quietly, when a few machines of the road side by side trip a
 * sequencing rule; the session's own order is the trainer's that day.
 */
export function routineAfterWrapUp(input: {
  plan: Pick<RoutinePlan, "intended"> | null;
  routine: readonly string[];
  ticked: readonly string[];
}): string[] {
  const ticked = input.ticked.filter((id, i) => input.ticked.indexOf(id) === i);
  if (!input.plan) return [...input.routine, ...ticked.filter((id) => !input.routine.includes(id))];
  return routineWith(input.plan, input.routine, ticked);
}

/**
 * The plan after the Wrap-up: a ticked machine the plan didn't name joins it
 * (the trainer kept it, so it is part of the road now). Unticked ones leave
 * the plan untouched.
 */
export function planAfterWrapUp(plan: RoutinePlan, ticked: readonly string[]): RoutinePlan {
  const unplanned = ticked.filter((id) => !plan.intended.includes(id));
  return unplanned.length > 0 ? applyPlanChange(plan, { kind: "add", machineIds: unplanned }) : plan;
}
