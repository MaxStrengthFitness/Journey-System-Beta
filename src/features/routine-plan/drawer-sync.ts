/**
 * The drawer keeps the plan (the design round, §4.3).
 *
 * The Edit routine drawer (`components/EditRoutineDrawer.tsx`) rewrites a
 * routine's machines whole. On a routine with a plan, a save that left the
 * plan alone would let the two drift: a machine added there would be an
 * extra the plan never names, a reorder would flip back at the next Wrap-up
 * (Routine A takes the road's order, `routineWith`), and a machine taken out
 * would come back as "Next" on deck. So the drawer's save writes the matching
 * plan change in the same batch, worked out here:
 *
 * - a machine taken out of the routine leaves the plan too ("remove", and
 *   day one with it): the drawer is where a trainer takes a machine out on
 *   purpose, and the Lineup's row sheet is where one stays on deck;
 * - a machine the plan didn't name joins it ("add"), right after the machine
 *   it follows in the routine;
 * - the road takes the routine's new order among the routine's machines
 *   ("reorder"), the machines on deck keeping their places.
 *
 * Pure. The reason the drawer asks (never requires) rides on every change.
 */
import { applyPlanChange } from "./plan";
import type { PlanChange, RoutinePlan } from "./types";

export interface DrawerPlanEdit {
  plan: RoutinePlan;
  /** In the order they happened: remove, add, reorder. Each one only when it did. */
  changes: Array<Pick<PlanChange, "kind" | "machineIds">>;
}

const once = (ids: readonly string[]) => ids.filter((id, i) => !!id && ids.indexOf(id) === i);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The plan after a drawer save that took the routine from `before` to
 * `after`, and the changes that say so; null when the save changed nothing
 * the plan holds.
 */
export function planChangeFromEdit(input: {
  before: readonly string[];
  after: readonly string[];
  plan: RoutinePlan;
}): DrawerPlanEdit | null {
  const before = once(input.before);
  const after = once(input.after);
  const changes: DrawerPlanEdit["changes"] = [];

  // Out of the routine, and so out of the plan.
  const leaving = before.filter((id) => !after.includes(id) && input.plan.intended.includes(id));
  let plan = leaving.length > 0 ? applyPlanChange(input.plan, { kind: "remove", machineIds: leaving }) : input.plan;
  if (leaving.length > 0) changes.push({ kind: "remove", machineIds: leaving });

  // The road with the routine's machines in the routine's new order, each in
  // a place a routine machine already held, so On deck keeps its places.
  const kept = plan.intended;
  const road = [...kept];
  const slots = kept.map((id, i) => (after.includes(id) ? i : -1)).filter((i) => i >= 0);
  const inRoad = after.filter((id) => kept.includes(id));
  slots.forEach((slot, k) => {
    road[slot] = inRoad[k];
  });

  // A machine new to the routine and to the plan joins the road after the
  // machine it follows in the routine (before the routine's first, when it
  // leads). An extra the routine already had stays an extra.
  const joining = after.filter((id) => !before.includes(id) && !kept.includes(id));
  for (const id of joining) {
    const k = after.indexOf(id);
    const prev = after
      .slice(0, k)
      .reverse()
      .find((x) => road.includes(x));
    if (prev) road.splice(road.indexOf(prev) + 1, 0, id);
    else {
      const first = road.findIndex((x) => after.includes(x));
      road.splice(first === -1 ? 0 : first, 0, id);
    }
  }
  if (joining.length > 0) changes.push({ kind: "add", machineIds: joining });

  const reordered = !sameList(
    road.filter((id) => kept.includes(id)),
    kept,
  );
  plan = { ...plan, intended: road };
  if (reordered) {
    // Day one takes the order the road gives its machines.
    plan = applyPlanChange(plan, { kind: "reorder", machineIds: road });
    changes.push({ kind: "reorder", machineIds: road });
  }
  return changes.length > 0 ? { plan, changes } : null;
}
