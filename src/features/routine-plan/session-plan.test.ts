/**
 * The floor on day one, the pure half (the first-session design round, Oct 8
 * 2026, §4.6): the plan's next machine against TODAY's session, what a plan
 * change made mid-session does to today's order, and when the Academy's
 * starting range is shown.
 */
import { describe, expect, it } from "vitest";
import {
  hasWeightOnFile,
  sessionPlanProgress,
  setLoggedToday,
  startingRangeSlot,
  todayAfterBench,
  todayAfterReplace,
  todayMatch,
  usablePlan,
} from "./session-plan";
import { progressLine } from "./plan";
import { meterSegments, roadGroups } from "./lineup";
import type { FloorMachine } from "./starting-plan";
import type { CantDo } from "./types";

const TODAY = "2026-10-08";
const ids = ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-ext", "m-chest-press", "m-leg-curl"];
const FLOOR: FloorMachine[] = ids.map((id) => ({ id }));
const ROAD = ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-ext", "m-chest-press"];
const DAY_ONE = ["m-leg-press", "m-compound-row", "m-lumbar"];
const mark = (machineId: string, until = "cleared"): CantDo => ({ machineId, until, day: "2026-10-01", byUid: "uid-sam" });

describe("sessionPlanProgress: the plan against today's session", () => {
  it("day one: three of six, the next is the first planned machine today doesn't have (not Routine A's, which is empty)", () => {
    const p = sessionPlanProgress({ plan: { intended: ROAD }, today: DAY_ONE, floor: FLOOR, todayYmd: TODAY });
    expect(p).toMatchObject({ have: 3, of: 6, next: "m-hip-abd", complete: false, extras: [] });
  });

  it("a machine added today counts, and the next moves on", () => {
    const p = sessionPlanProgress({ plan: { intended: ROAD }, today: [...DAY_ONE, "m-hip-abd"], floor: FLOOR, todayYmd: TODAY });
    expect(p.have).toBe(4);
    expect(p.next).toBe("m-ext");
  });

  it("every planned machine in today: nothing next", () => {
    const p = sessionPlanProgress({ plan: { intended: ROAD }, today: [...ROAD, "m-leg-curl"], floor: FLOOR, todayYmd: TODAY });
    expect(p).toMatchObject({ have: 6, of: 6, next: null, complete: true, extras: ["m-leg-curl"] });
  });

  it("matches through the catalog machine a studio's own unit is, and offers the unit this floor has", () => {
    const floor: FloorMachine[] = [
      { id: "unit-7", name: "Hoist press", canonicalId: "m-leg-press" },
      { id: "unit-9", name: "Abductor", canonicalId: "m-hip-abd" },
      { id: "m-compound-row" },
    ];
    const p = sessionPlanProgress({ plan: { intended: ["m-leg-press", "m-compound-row", "m-hip-abd"] }, today: ["unit-7", "m-compound-row"], floor, todayYmd: TODAY });
    expect(p.have).toBe(2);
    expect(p.next).toBe("unit-9");
  });

  it("never offers a machine this floor lacks, or one the client can't do", () => {
    const floor: FloorMachine[] = [{ id: "m-leg-press" }, { id: "m-ext" }, { id: "m-chest-press" }];
    const p = sessionPlanProgress({
      plan: { intended: ["m-leg-press", "m-hip-abd", "m-ext", "m-chest-press"], cantDo: [mark("m-ext")] },
      today: ["m-leg-press"],
      floor,
      todayYmd: TODAY,
    });
    expect(p.next).toBe("m-chest-press");
  });

  it("with the rest benched or off this floor, nothing is next and the plan is NOT complete (never 'All 4 planned machines in')", () => {
    const floor: FloorMachine[] = [{ id: "m-leg-press" }, { id: "m-ext" }];
    const p = sessionPlanProgress({
      plan: { intended: ["m-leg-press", "m-hip-abd", "m-ext", "m-chest-press"], cantDo: [mark("m-ext")] },
      today: ["m-leg-press"],
      floor,
      todayYmd: TODAY,
    });
    expect(p).toMatchObject({ have: 1, of: 4, next: null, complete: false });
    expect(progressLine(p, (id) => id)).toBe("1 of 4 · no more to add today");
    expect(meterSegments(p)).toEqual(["in", "later", "later", "later"]);
  });

  it("a dated mark that has ended no longer holds", () => {
    const p = sessionPlanProgress({
      plan: { intended: ["m-leg-press", "m-ext"], cantDo: [mark("m-ext", "2026-10-05")] },
      today: ["m-leg-press"],
      floor: FLOOR,
      todayYmd: TODAY,
    });
    expect(p.next).toBe("m-ext");
  });
});

describe("today's order after a plan change made mid-session", () => {
  it("a set is logged once there is a count, a time or an outcome; Start's seeded weight alone is not one", () => {
    expect(setLoggedToday(undefined)).toBe(false);
    expect(setLoggedToday({ weight: 80, reps: null, seconds: null, isTSC: false, quality: null })).toBe(false);
    expect(setLoggedToday({ weight: 80, reps: 9, seconds: null, isTSC: false, quality: 2 })).toBe(true);
    expect(setLoggedToday({ weight: null, reps: null, seconds: 75, isTSC: true, quality: null })).toBe(true);
    expect(setLoggedToday({ weight: null, reps: null, seconds: null, isTSC: false, quality: null, outcome: "skipped" })).toBe(true);
    expect(setLoggedToday({ weight: 40, reps: null, seconds: null, isTSC: false, quality: null, outcome: "practice" })).toBe(true);
  });

  it("the stand-in takes the machine's place in today's order", () => {
    expect(todayAfterReplace({ today: DAY_ONE, from: "m-compound-row", incoming: ["m-leg-curl"], logged: false })).toEqual({
      next: ["m-leg-press", "m-leg-curl", "m-lumbar"],
      moved: [{ from: "m-compound-row", to: "m-leg-curl" }],
    });
  });

  it("with nothing to stand in, the machine leaves today's order", () => {
    expect(todayAfterReplace({ today: DAY_ONE, from: "m-lumbar", incoming: [], logged: false })).toEqual({
      next: ["m-leg-press", "m-compound-row"],
      moved: [{ from: "m-lumbar", to: null }],
    });
  });

  it("never adds a machine twice", () => {
    expect(todayAfterReplace({ today: DAY_ONE, from: "m-lumbar", incoming: ["m-leg-press"], logged: false })?.next).toEqual(["m-leg-press", "m-compound-row"]);
  });

  it("today's set stays: a machine with a set logged today, or not in today's session, leaves today's order alone", () => {
    expect(todayAfterReplace({ today: DAY_ONE, from: "m-compound-row", incoming: ["m-leg-curl"], logged: true })).toBeNull();
    expect(todayAfterReplace({ today: DAY_ONE, from: "m-chest-press", incoming: ["m-leg-curl"], logged: false })).toBeNull();
  });

  it("a Re-plan's machines go on the bench in turn, the ones logged today left where they are", () => {
    const change = todayAfterBench({
      today: DAY_ONE,
      benched: [
        { machineId: "m-leg-press", replacedBy: ["m-leg-curl"] },
        { machineId: "m-lumbar", replacedBy: [] },
        { machineId: "m-compound-row", replacedBy: ["m-ext"] },
      ],
      logged: (id) => id === "m-compound-row",
    });
    expect(change).toEqual({
      next: ["m-leg-curl", "m-compound-row"],
      moved: [
        { from: "m-leg-press", to: "m-leg-curl" },
        { from: "m-lumbar", to: null },
      ],
    });
    expect(todayAfterBench({ today: DAY_ONE, benched: [{ machineId: "m-ext" }], logged: () => false })).toBeNull();
  });
});

describe("the Academy's starting range (AJ's \"3a\")", () => {
  const nothingOnFile = { prescribedWeight: null, setsOnRecord: 0, knownElsewhere: false, totalsKnown: true };

  it("a weight on file is a prescribed weight, a set on record or a running total; an unread total is never 'none'", () => {
    expect(hasWeightOnFile(nothingOnFile)).toBe(false);
    expect(hasWeightOnFile({ ...nothingOnFile, prescribedWeight: 120 })).toBe(true);
    expect(hasWeightOnFile({ ...nothingOnFile, prescribedWeight: 0 })).toBe(true);
    expect(hasWeightOnFile({ ...nothingOnFile, setsOnRecord: 1 })).toBe(true);
    expect(hasWeightOnFile({ ...nothingOnFile, knownElsewhere: true })).toBe(true);
    expect(hasWeightOnFile({ ...nothingOnFile, totalsKnown: false })).toBe(true);
  });

  it("in the picked column, says the sheet's range with its words, never a weight", () => {
    expect(startingRangeSlot({ canonicalMachineId: "m-leg-press", column: "female-novice", forToday: false, hasWeight: false })).toEqual({
      kind: "line",
      says: "Academy's starting range: 60–100 lb (a reference, not a rule)",
      source: expect.stringContaining("MSF - Suggested Starting Weights"),
      forToday: false,
    });
  });

  it("with no plan to keep the column on, says it is for today", () => {
    const slot = startingRangeSlot({ canonicalMachineId: "m-leg-press", column: "male-advanced", forToday: true, hasWeight: false });
    expect(slot).toMatchObject({ kind: "line", says: "Academy's starting range: 240–320 lb (a reference, not a rule)", forToday: true });
  });

  it("asks for a column when nobody has picked one (never picked for them)", () => {
    expect(startingRangeSlot({ canonicalMachineId: "m-leg-press", column: undefined, forToday: false, hasWeight: false })).toEqual({ kind: "ask" });
  });

  it("says nothing with a weight on file, after Don't show ranges, or for a machine the sheet doesn't cover", () => {
    expect(startingRangeSlot({ canonicalMachineId: "m-leg-press", column: "female-novice", forToday: false, hasWeight: true })).toBeNull();
    expect(startingRangeSlot({ canonicalMachineId: "m-leg-press", column: undefined, forToday: false, hasWeight: true })).toBeNull();
    expect(startingRangeSlot({ canonicalMachineId: "m-leg-press", column: "none", forToday: false, hasWeight: false })).toBeNull();
    expect(startingRangeSlot({ canonicalMachineId: "sm-solon-rear-delt", column: undefined, forToday: false, hasWeight: false })).toBeNull();
    expect(startingRangeSlot({ canonicalMachineId: "", column: "female-novice", forToday: false, hasWeight: false })).toBeNull();
  });
});

describe("usablePlan", () => {
  it("is a plan with a road; anything else read from the database is no plan", () => {
    expect(usablePlan({ intended: [], purpose: "", building: true, madeByUid: "u" })).toBe(true);
    expect(usablePlan(undefined)).toBe(false);
    expect(usablePlan({ purpose: "x" })).toBe(false);
    expect(usablePlan("plan")).toBe(false);
  });
});

describe("todayMatch: the plan's machines against today's, through the catalog machine", () => {
  const floor: FloorMachine[] = [
    { id: "unit-7", name: "Hoist press", canonicalId: "m-leg-press" },
    { id: "m-compound-row" },
    { id: "unit-9", name: "Abductor", canonicalId: "m-hip-abd" },
  ];

  it("finds a studio's unit in today's session for the plan's catalog machine, and nothing for one today doesn't run", () => {
    const m = todayMatch({ today: ["unit-7", "m-compound-row"], floor });
    expect(m.todayIdOf("m-leg-press")).toBe("unit-7");
    expect(m.todayIdOf("m-compound-row")).toBe("m-compound-row");
    expect(m.todayIdOf("unit-7")).toBe("unit-7");
    expect(m.todayIdOf("m-hip-abd")).toBeNull();
    expect(m.key("unit-9")).toBe(m.key("m-hip-abd"));
  });
});

describe("the Road against a session: the count's own next, the catalog machine's match", () => {
  const floor: FloorMachine[] = [{ id: "unit-7", name: "Hoist press", canonicalId: "m-leg-press" }, { id: "m-compound-row" }, { id: "m-ext" }];
  const plan = { intended: ["m-leg-press", "m-compound-row", "m-hip-abd", "m-ext"] };

  it("brackets a unit as the plan's machine and marks the count's next, never a machine this floor lacks", () => {
    const today = ["unit-7", "m-compound-row"];
    const p = sessionPlanProgress({ plan, today, floor, todayYmd: TODAY });
    expect(p.next).toBe("m-ext");
    const m = todayMatch({ today, floor });
    const groups = roadGroups({ plan, today, todayYmd: TODAY, keyOf: m.key, next: p.next });
    expect(groups.find((g) => g.key === "today")!.stations.map((st) => st.id)).toEqual(["unit-7", "m-compound-row"]);
    // m-leg-press is today's unit-7: not drawn again as still to come.
    expect(groups.find((g) => g.key === "then")!.stations).toEqual([
      { id: "m-hip-abd", kind: "planned" },
      { id: "m-ext", kind: "next", mark: "Next stop" },
    ]);
  });

  it("marks no next stop when none can be added today, and is unchanged without the options", () => {
    const groups = roadGroups({ plan, today: ["m-leg-press"], todayYmd: TODAY, next: null });
    expect(groups.find((g) => g.key === "then")!.stations.every((st) => st.kind === "planned")).toBe(true);
    const plain = roadGroups({ plan, today: ["m-leg-press"], todayYmd: TODAY });
    expect(plain.find((g) => g.key === "then")!.stations[0]).toEqual({ id: "m-compound-row", kind: "next", mark: "Next stop" });
  });
});
