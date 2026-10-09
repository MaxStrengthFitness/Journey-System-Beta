/**
 * The drawer keeps the plan (drawer-sync.ts; the design round, §4.3): a save
 * in the Edit routine drawer on a routine with a plan writes the matching
 * plan change in the same batch, so the plan and the routine never drift.
 */
import { describe, expect, it } from "vitest";
import { planChangeFromEdit } from "./drawer-sync";
import { routineWith } from "./plan";
import type { RoutinePlan } from "./types";

const ROAD = ["a", "b", "c", "d", "e"];
const PLAN: RoutinePlan = { purpose: "", intended: ROAD, dayOne: ["a", "b"], building: true, madeByUid: "u" };

describe("a drawer save on a routine with a plan", () => {
  it("changes nothing in the plan when the routine is as it was", () => {
    expect(planChangeFromEdit({ before: ["a", "b"], after: ["a", "b"], plan: PLAN })).toBeNull();
  });

  it("takes a machine out of the plan (and day one) when it leaves the routine", () => {
    const r = planChangeFromEdit({ before: ["a", "b", "c"], after: ["a", "c"], plan: PLAN })!;
    expect(r.changes).toEqual([{ kind: "remove", machineIds: ["b"] }]);
    expect(r.plan.intended).toEqual(["a", "c", "d", "e"]);
    expect(r.plan.dayOne).toEqual(["a"]);
  });

  it("puts a machine new to the plan right after the one it follows in the routine", () => {
    const r = planChangeFromEdit({ before: ["a", "b"], after: ["a", "x", "b"], plan: PLAN })!;
    expect(r.changes).toEqual([{ kind: "add", machineIds: ["x"] }]);
    expect(r.plan.intended).toEqual(["a", "x", "b", "c", "d", "e"]);
    expect(r.plan.dayOne).toEqual(["a", "b"]);
    // The next Wrap-up keeps the routine's order (routineWith reads the road).
    expect(routineWith(r.plan, ["a", "x", "b"], [])).toEqual(["a", "x", "b"]);
  });

  it("gives the road the routine's new order, the deck keeping its places", () => {
    const r = planChangeFromEdit({ before: ["a", "b", "c"], after: ["c", "a", "b"], plan: PLAN })!;
    expect(r.changes).toEqual([{ kind: "reorder", machineIds: ["c", "a", "b", "d", "e"] }]);
    expect(r.plan.dayOne).toEqual(["a", "b"]);
    expect(routineWith(r.plan, ["c", "a", "b"], [])).toEqual(["c", "a", "b"]);
    const fromDeck = planChangeFromEdit({ before: ["a", "b"], after: ["a", "d", "b"], plan: PLAN })!;
    expect(fromDeck.plan.intended).toEqual(["a", "d", "c", "b", "e"]);
    expect(routineWith(fromDeck.plan, ["a", "d", "b"], [])).toEqual(["a", "d", "b"]);
    expect(fromDeck.changes.map((c) => c.kind)).toEqual(["reorder"]);
  });

  it("writes remove, add and reorder together when one save does all three", () => {
    const r = planChangeFromEdit({ before: ["a", "b", "c"], after: ["c", "y", "a"], plan: PLAN })!;
    expect(r.changes.map((c) => c.kind)).toEqual(["remove", "add", "reorder"]);
    expect(routineWith(r.plan, ["c", "y", "a"], [])).toEqual(["c", "y", "a"]);
  });

  it("leaves an extra the routine already had as an extra", () => {
    const r = planChangeFromEdit({ before: ["a", "z"], after: ["z", "a"], plan: PLAN });
    expect(r).toBeNull();
  });
});
