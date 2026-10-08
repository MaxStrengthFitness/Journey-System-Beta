/**
 * The plan model: how far along a routine is, what comes next, what a change
 * does, and what the Wrap-up offers for next time (AJ, Oct 7 2026).
 *
 * Pure. The routine's `machineIds` is what the client does now; the plan's
 * `intended` is the road. A machine the trainer added that the plan doesn't
 * name is an extra, kept where the trainer put it, never dropped.
 */
import type { PlanChange, RoutinePlan } from "./types";

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
 * A change applied to a plan. Returns the new plan; the routine itself is
 * moved by the caller (a session's Finish, the Wrap-up, Programming).
 */
export function applyPlanChange(plan: RoutinePlan, change: Pick<PlanChange, "kind" | "machineIds" | "value">): RoutinePlan {
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
