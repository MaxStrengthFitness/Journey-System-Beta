/**
 * The plan model: how far along a routine is, what comes next, what a change
 * does, and what the Wrap-up offers for next time (AJ, Oct 7 2026).
 *
 * Pure. The routine's `machineIds` is what the client does now; the plan's
 * `intended` is the road. A machine the trainer added that the plan doesn't
 * name is an extra, kept where the trainer put it, never dropped.
 */
import { STARTING_COLUMN_LABEL, type StartingColumn } from "./starting-weights";
import type { CantDo, PlanChange, RoutinePlan } from "./types";

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

/** "3 of 6 · next: Chest Press". Names come from the caller (a floor's names, never truncated). */
export function progressLine(progress: PlanProgress, nameOf: (id: string) => string): string {
  if (progress.of === 0) return "No machines planned yet";
  if (progress.complete) return `All ${progress.of} planned machines in`;
  return `${progress.have} of ${progress.of} · next: ${nameOf(progress.next!)}`;
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
 */
export function applyPlanChange(
  plan: RoutinePlan,
  change: Pick<PlanChange, "kind" | "machineIds" | "value">,
  cantDo?: CantDo,
): RoutinePlan {
  const ids = change.machineIds;
  switch (change.kind) {
    case "start":
      return { ...plan, intended: [...ids] };
    case "add": {
      const intended = [...plan.intended];
      for (const id of ids) if (!intended.includes(id)) intended.push(id);
      return { ...plan, intended };
    }
    case "remove":
      return { ...plan, intended: plan.intended.filter((id) => !ids.includes(id)) };
    case "swap": {
      const [from, to] = ids;
      if (!from || !to) return plan;
      const intended = plan.intended.includes(to)
        ? plan.intended.filter((id) => id !== from)
        : plan.intended.map((id) => (id === from ? to : id));
      const swaps = plan.swaps?.map((s) => (s.with === from ? { ...s, with: to } : s));
      return { ...plan, intended, ...(swaps ? { swaps } : null) };
    }
    case "reorder": {
      // Every planned machine stays: an id the new order forgot keeps its place at the end.
      const kept = ids.filter((id) => plan.intended.includes(id));
      const rest = plan.intended.filter((id) => !kept.includes(id));
      return { ...plan, intended: [...kept, ...rest] };
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
      return { ...plan, intended };
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
  /** Why it is on the list, for the row's small line. */
  why: "planned" | "added-today";
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
 */
export function nextTimeRows(input: {
  plan: Pick<RoutinePlan, "intended" | "building"> | null;
  routine: readonly string[];
  performedToday: readonly string[];
}): NextTimeRow[] {
  const building = input.plan?.building === true;
  const rows: NextTimeRow[] = [];
  for (const id of input.performedToday) {
    if (input.routine.includes(id) || rows.some((r) => r.machineId === id)) continue;
    const planned = input.plan?.intended.includes(id) ?? false;
    rows.push({ machineId: id, defaultOn: building, why: planned ? "planned" : "added-today" });
  }
  return rows;
}

/**
 * The routine for next time from the Wrap-up's ticks, in the plan's order.
 * With no plan, the ticked machines join at the end in the order performed.
 */
export function routineAfterWrapUp(input: {
  plan: Pick<RoutinePlan, "intended"> | null;
  routine: readonly string[];
  ticked: readonly string[];
}): string[] {
  if (!input.plan) return [...input.routine, ...input.ticked.filter((id) => !input.routine.includes(id))];
  return routineWith(input.plan, input.routine, input.ticked);
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
