/**
 * The briefing's plan card, the pure half (the design round, Oct 8 2026,
 * §4.5): which card the briefing draws, today as Change today moves it, the
 * order effect today trips, and the plan's first change Start writes.
 */
import { describe, expect, it } from "vitest";
import type { Routine } from "../../types";
import {
  briefingPlanView,
  changeTodayRows,
  planWithTodayAsDayOne,
  startChangeOf,
  todayChanged,
  todayEffect,
  todayWith,
  type StartPlanAtStart,
} from "./briefing-plan";
import type { RoutinePlan } from "./types";

const plan: RoutinePlan = {
  purpose: "Learning the protocol: the starting routine",
  intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-pulldown"],
  dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
  building: true,
  templateId: "academy-low-back",
  madeByUid: "uid-sam",
};

const routine = (name: string, machineIds: string[], extra: Partial<Routine> = {}): Routine =>
  ({ id: `r-${name}`, clientId: "c1", name, machineIds, ...extra }) as Routine;

describe("briefingPlanView: which card the briefing draws", () => {
  it("a routine with machines is drawn as it always was; with a plan, the Road under it", () => {
    expect(briefingPlanView({ routines: [routine("Routine A", ["m-a"])], kind: "established", door: null })).toBe("routine");
    expect(briefingPlanView({ routines: [routine("Routine A", ["m-a"], { plan })], kind: "established", door: null })).toBe("in-progress");
  });

  it("a plan kept with Routine A still empty draws the plan card, day one being today", () => {
    expect(briefingPlanView({ routines: [routine("Routine A", [], { plan })], kind: "established", door: null })).toBe("kept");
  });

  it("no routine and no plan follows the kind: starting out, before Journey, or both doors", () => {
    expect(briefingPlanView({ routines: [], kind: "new-to-studio", door: null })).toBe("starting");
    expect(briefingPlanView({ routines: [], kind: "new-to-journey", door: null })).toBe("journey");
    expect(briefingPlanView({ routines: [], kind: "unknown", door: null })).toBe("doors");
  });

  it("an empty Routine A with no plan (made before plans) is no routine", () => {
    expect(briefingPlanView({ routines: [routine("Routine A", [])], kind: "new-to-studio", door: null })).toBe("starting");
  });

  it("reads either spelling of a routine's name, as the briefing finds the routine it draws", () => {
    // An older seeder wrote "A" and "B" (lib/routine-utils.ts).
    expect(briefingPlanView({ routines: [routine("A", ["m-a"])], kind: "new-to-journey", door: null })).toBe("routine");
    expect(briefingPlanView({ routines: [routine(" routine a ", [], { plan })], kind: "unknown", door: null })).toBe("kept");
    expect(briefingPlanView({ routines: [routine("B", ["m-b"])], kind: "unknown", door: null })).toBe("routine");
  });

  it("a door picked stays picked, even once the kind is known", () => {
    expect(briefingPlanView({ routines: [], kind: "unknown", door: "studio" })).toBe("starting");
    expect(briefingPlanView({ routines: [], kind: "new-to-studio", door: "journey" })).toBe("journey");
    // ...but never over a routine the client turns out to have.
    expect(briefingPlanView({ routines: [routine("Routine A", ["m-a"])], kind: "unknown", door: "studio" })).toBe("routine");
  });
});

describe("Change today moves today only", () => {
  it("puts a machine in at the end, and takes one out leaving the rest as they stood", () => {
    expect(todayWith(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(todayWith(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(todayWith(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
  });

  it("lists the plan's road, the next stop said, then today's machines the plan doesn't name", () => {
    const rows = changeTodayRows({ plan, today: ["m-leg-press", "m-compound-row", "m-ext"], todayYmd: "2026-10-08" });
    expect(rows.map((r) => [r.machineId, r.on, r.note])).toEqual([
      ["m-leg-press", true, null],
      ["m-compound-row", true, null],
      ["m-lumbar", false, "Next stop"],
      ["m-chest-press", false, null],
      ["m-pulldown", false, null],
      ["m-ext", true, "Not in the plan"],
    ]);
  });

  it("keeps a row the sheet has shown, so an untick can be taken back", () => {
    const rows = changeTodayRows({ plan, today: ["m-leg-press"], todayYmd: "2026-10-08", shown: ["m-ext"] });
    expect(rows.find((r) => r.machineId === "m-ext")).toEqual({ machineId: "m-ext", on: false, note: "Not in the plan" });
  });

  it("never offers what the client can't do", () => {
    const benched: RoutinePlan = {
      ...plan,
      cantDo: [{ machineId: "m-lumbar", until: "cleared", day: "2026-10-01", byUid: "uid-sam" }],
    };
    const rows = changeTodayRows({ plan: benched, today: ["m-leg-press"], todayYmd: "2026-10-08" });
    expect(rows.map((r) => r.machineId)).not.toContain("m-lumbar");
    expect(rows.find((r) => r.machineId === "m-compound-row")?.note).toBe("Next stop");
  });

  it("knows when today was changed", () => {
    expect(todayChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(todayChanged(["b", "a"], ["a", "b"])).toBe(true);
    expect(todayChanged([], ["a"])).toBe(true);
  });
});

describe("planWithTodayAsDayOne: the plan Start keeps takes the consult's machines as day one", () => {
  it("keeps the road's order and only the road's machines: one taken out leaves, the plan's next joins", () => {
    // Took out the Compound Row, added the Chest Press (the plan's next) and a floor machine.
    const kept = planWithTodayAsDayOne(plan, ["m-leg-press", "m-lumbar", "m-hip-abd", "m-chest-press"], "2026-10-08");
    expect(kept.dayOne).toEqual(["m-leg-press", "m-lumbar", "m-chest-press"]);
    // The road itself stays as it is.
    expect(kept.intended).toEqual(plan.intended);
    expect(kept.templateId).toBe(plan.templateId);
  });

  it("never puts back what the client can't do", () => {
    const benched: RoutinePlan = {
      ...plan,
      cantDo: [{ machineId: "m-lumbar", until: "cleared", day: "2026-10-01", byUid: "uid-sam" }],
    };
    expect(planWithTodayAsDayOne(benched, ["m-leg-press", "m-lumbar"], "2026-10-08").dayOne).toEqual(["m-leg-press"]);
  });

  it("an emptied today keeps an empty day one, never undefined", () => {
    expect(planWithTodayAsDayOne(plan, [], "2026-10-08").dayOne).toEqual([]);
  });
});

describe("the one order effect today trips", () => {
  it("says the Academy's sequencing rule as a sentence, never a block", () => {
    const effect = todayEffect(["m-lumbar", "m-leg-press"], (id) => (id === "m-lumbar" ? "Lumbar" : "Leg Press"));
    expect(effect?.sentence).toMatch(/Lumbar.*Leg Press · the Academy/);
  });

  it("is null when today trips nothing", () => {
    expect(todayEffect([], (id) => id)).toBeNull();
  });
});

describe("startChangeOf: the plan's first change, signed by the person pressing Start", () => {
  const sp: StartPlanAtStart = {
    plan,
    name: "Routine A",
    machineIds: ["m-leg-press"],
    startingRoutineId: "academy-low-back",
    startingRoutineName: "Low back issues",
  };

  it("names the road, the starting routine, and the Auth uid, never undefined", () => {
    expect(startChangeOf(sp, { uid: "uid-sam", name: "Sam Lee" })).toEqual({
      kind: "start",
      machineIds: plan.intended,
      value: "Low back issues",
      byUid: "uid-sam",
      byName: "Sam Lee",
    });
    const plain = startChangeOf({ ...sp, startingRoutineName: null }, { uid: "uid-sam" });
    expect(plain).toEqual({ kind: "start", machineIds: plan.intended, byUid: "uid-sam" });
    expect(JSON.stringify(plain)).not.toContain("undefined");
  });
});
