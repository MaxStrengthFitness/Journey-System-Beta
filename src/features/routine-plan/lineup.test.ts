/**
 * The Lineup's pure half (lineup.ts): what Programming → Routine A draws and
 * what each tap writes. AJ, Oct 7 2026: "Any trainer who trains the client
 * can definitely change the plan ... You should be able to change that and
 * make the call as a trainer because you're training them that day." And:
 * "it's nice to be able to communicate like, hey, I'm changing this plan
 * because of this reason", so the reason is asked, never required.
 */
import { describe, expect, it } from "vitest";
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";
import { planChangeWhat } from "./changes-list";
import {
  addedNow,
  benchLine,
  buildingChanged,
  effectsAbove,
  floorByFamily,
  healthNoteBody,
  healthNoteBodyFor,
  lineupGroups,
  lineupOf,
  markedCantDo,
  meterSegments,
  movedIn,
  planFromRoutine,
  purposeChanged,
  reopened,
  replanCantDoReason,
  replanned,
  signedChange,
  swapChoices,
  swappedIn,
  takenOut,
  withBenchCarried,
  withDayOneToggled,
  withFloorTapped,
  writeOf,
} from "./lineup";
import { ROUTINE_ONLY, applyPlanChange } from "./plan";
import type { FloorMachine } from "./starting-plan";
import type { RoutinePlan } from "./types";

const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));

const nameOf = (id: string) => ACADEMY_MOVEMENT_NAME[id] ?? id;
const who = { uid: "u-sam", name: "Sam Lee" };
const TODAY = "2026-10-08";
/** The Changes list's sentence for a change, on Routine A. */
const changeLineFor = (change: Parameters<typeof planChangeWhat>[0], names: (id: string) => string) =>
  planChangeWhat(change, { nameOf: names, routineName: "Routine A" });

const ROAD = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-hip-abd", "m-pulldown"];
const DAY_ONE = ["m-leg-press", "m-compound-row", "m-lumbar"];
const PLAN: RoutinePlan = {
  purpose: "Learning the protocol",
  intended: ROAD,
  dayOne: DAY_ONE,
  building: true,
  madeByUid: "u-sam",
};

describe("what the Lineup draws", () => {
  it("draws day one where Routine A's rows would be while Routine A is empty (the consult is not Routine A)", () => {
    const g = lineupGroups(PLAN, [], TODAY);
    expect(g.dayOneRuns).toBe(true);
    expect(g.first).toEqual(DAY_ONE);
    expect(g.deck).toEqual(["m-chest-press", "m-hip-abd", "m-pulldown"]);
    const m = lineupOf(PLAN, [], TODAY, nameOf);
    expect(m.next).toBe("m-chest-press");
    expect(m.line).toBe(`0 of 6 · day one: ${nameOf("m-leg-press")}, ${nameOf("m-compound-row")} and ${nameOf("m-lumbar")}`);
  });

  it("draws Routine A, then the rest of the road on deck, the first one next", () => {
    const m = lineupOf(PLAN, ["m-leg-press", "m-compound-row", "m-lumbar"], TODAY, nameOf);
    expect(m.dayOneRuns).toBe(false);
    expect(m.first).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(m.deck).toEqual(["m-chest-press", "m-hip-abd", "m-pulldown"]);
    expect(m.line).toBe(`3 of 6 · next: ${nameOf("m-chest-press")}`);
    expect(meterSegments(m.progress)).toEqual(["in", "in", "in", "next", "later", "later"]);
  });

  it("never puts a machine on the bench on deck, and says a dated mark has ended", () => {
    const plan: RoutinePlan = {
      ...PLAN,
      intended: [...ROAD, "m-dip"],
      cantDo: [
        { machineId: "m-dip", reason: "Surgery", until: "cleared", day: "2026-10-01", byUid: "u-sam" },
        { machineId: "m-neck", until: "2026-10-05", day: "2026-09-20", byUid: "u-sam", replacedBy: [] },
      ],
    };
    const m = lineupOf(plan, ["m-leg-press"], TODAY, nameOf);
    expect(m.deck).not.toContain("m-dip");
    expect(m.bench.map((b) => [b.entry.machineId, b.active, b.line, b.backOn])).toEqual([
      ["m-dip", true, "Surgery · until cleared", null],
      ["m-neck", false, "back on Oct 6", "Back on Oct 6"],
    ]);
    expect(benchLine({ until: "always" }, TODAY)).toBe("always");
  });

  it("puts an order effect above the later of the two machines that trip it", () => {
    const at = effectsAbove(["m-lumbar", "m-leg-press"], nameOf, ALL);
    expect([...at.keys()]).toEqual([1]);
    expect(at.get(1)![0].sentence).toMatch(/the Academy/);
  });
});

describe("what each tap writes", () => {
  it("moves a day-one row within day one, written as a reorder in the order the Lineup draws", () => {
    const edit = movedIn(PLAN, [], "m-compound-row", -1, TODAY)!;
    expect(edit.change).toEqual({ kind: "reorder", machineIds: ["m-compound-row", "m-leg-press", "m-lumbar", "m-chest-press", "m-hip-abd", "m-pulldown"] });
    expect(edit.plan.dayOne).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    // Routine A is empty and stays so: the consult is not Routine A.
    expect(edit.routine).toEqual([]);
    expect(movedIn(PLAN, [], "m-leg-press", -1, TODAY)).toBeNull();
  });

  it("moves a Routine A row in Routine A and on the road, and a deck row on the road only", () => {
    const routine = ["m-leg-press", "m-compound-row", "m-lumbar"];
    const a = movedIn(PLAN, routine, "m-lumbar", -1, TODAY)!;
    expect(a.routine).toEqual(["m-leg-press", "m-lumbar", "m-compound-row"]);
    expect(a.plan.intended.slice(0, 3)).toEqual(["m-leg-press", "m-lumbar", "m-compound-row"]);
    const deck = movedIn(PLAN, routine, "m-pulldown", -1, TODAY)!;
    expect(deck.routine).toEqual(routine);
    expect(deck.plan.intended.slice(3)).toEqual(["m-chest-press", "m-pulldown", "m-hip-abd"]);
  });

  it("swaps a machine for another, or for the Academy's set, in its place on the road, on day one and in Routine A", () => {
    const one = swappedIn(PLAN, ["m-compound-row"], "m-compound-row", ["m-simple-row"]);
    expect(one.plan.intended[1]).toBe("m-simple-row");
    expect(one.plan.dayOne).toEqual(["m-leg-press", "m-simple-row", "m-lumbar"]);
    expect(one.routine).toEqual(["m-simple-row"]);
    expect(one.change).toEqual({ kind: "swap", machineIds: ["m-compound-row", "m-simple-row"] });
    const set = swappedIn(PLAN, [], "m-chest-press", ["m-chest-fly", "m-tricep-ext"]);
    expect(set.plan.intended).toEqual(["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-fly", "m-tricep-ext", "m-hip-abd", "m-pulldown"]);
    expect(set.change.machineIds).toEqual(["m-chest-press", "m-chest-fly", "m-tricep-ext"]);
    // The Changes list says the whole set.
    expect(changeLineFor(set.change, nameOf)).toBe(`${nameOf("m-chest-fly")} and ${nameOf("m-tricep-ext")} instead of ${nameOf("m-chest-press")}`);
  });

  it("takes a machine out of Routine A only (it stays on deck) or out of the plan too", () => {
    const routine = ["m-leg-press", "m-compound-row"];
    const fromA = takenOut(PLAN, routine, "m-compound-row", "routine");
    expect(fromA.plan).toBe(PLAN);
    expect(fromA.routine).toEqual(["m-leg-press"]);
    expect(fromA.change).toEqual({ kind: "remove", machineIds: ["m-compound-row"], value: ROUTINE_ONLY });
    expect(applyPlanChange(PLAN, fromA.change)).toBe(PLAN);
    expect(lineupGroups(fromA.plan, fromA.routine, TODAY).deck[0]).toBe("m-compound-row");
    const fromPlan = takenOut(PLAN, routine, "m-compound-row", "plan");
    expect(fromPlan.plan.intended).not.toContain("m-compound-row");
    expect(fromPlan.plan.dayOne).toEqual(["m-leg-press", "m-lumbar"]);
    expect(changeLineFor(fromA.change, nameOf)).toBe(`Took ${nameOf("m-compound-row")} out of Routine A`);
    expect(changeLineFor(fromPlan.change, nameOf)).toBe(`Took ${nameOf("m-compound-row")} out of the plan`);
  });

  it("adds the Next machine to Routine A now, in the road's order, the road as it was", () => {
    const edit = addedNow(PLAN, ["m-leg-press", "m-compound-row", "m-lumbar"], "m-chest-press");
    expect(edit.routine).toEqual(["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"]);
    expect(edit.plan).toBe(PLAN);
    expect(applyPlanChange(PLAN, edit.change)).toBe(PLAN);
    expect(changeLineFor(edit.change, nameOf)).toBe(`Added ${nameOf("m-chest-press")} to Routine A`);
  });

  it("marks a machine can't do and reopens it where it stood", () => {
    const routine = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"];
    const marked = markedCantDo({ plan: PLAN, routine, machineId: "m-chest-press", reason: "Surgery", until: "cleared", todayYmd: TODAY, who, floor: ALL });
    expect(marked.routine).not.toContain("m-chest-press");
    expect(marked.change).toEqual({ kind: "cantdo", machineIds: ["m-chest-press"], value: "Surgery · cleared" });
    expect(marked.entry.byUid).toBe("u-sam");
    const back = reopened(marked.plan, marked.routine, "m-chest-press");
    expect(back.change).toEqual({ kind: "cando", machineIds: ["m-chest-press"] });
    expect(back.plan.cantDo ?? []).toEqual([]);
    expect(back.plan.intended).toContain("m-chest-press");
  });

  it("changes the purpose and the being-built switch", () => {
    expect(purposeChanged(PLAN, [], "  The core: whole body  ").plan.purpose).toBe("The core: whole body");
    const off = buildingChanged(PLAN, [], false);
    expect(off.plan.building).toBe(false);
    expect(off.change).toEqual({ kind: "building", machineIds: [], value: "off" });
  });

  it("signs a change with the Auth uid and the reason only when one was given (asked, never required)", () => {
    const edit = movedIn(PLAN, [], "m-compound-row", -1, TODAY)!;
    const silent = writeOf(edit, [], who, "   ");
    expect(silent.change).toEqual({ ...edit.change, byUid: "u-sam", byName: "Sam Lee" });
    expect("reason" in silent.change).toBe(false);
    expect(silent.machineIds).toBeUndefined();
    const said = writeOf(edit, [], who, "Client asked");
    expect(said.change.reason).toBe("Client asked");
    const routineMoved = writeOf(takenOut(PLAN, ["m-leg-press"], "m-leg-press", "routine"), ["m-leg-press"], { uid: "u-x" });
    expect(routineMoved.machineIds).toEqual([]);
    expect("byName" in routineMoved.change).toBe(false);
    expect(Object.values(signedChange({ kind: "purpose", machineIds: [], value: "" }, who)).includes(undefined)).toBe(false);
  });
});

describe("a re-plan, kept in the history", () => {
  it("starts again from the starting routine with what we know: marks still hold, new ones go on the bench", () => {
    const plan: RoutinePlan = {
      ...PLAN,
      cantDo: [{ machineId: "m-pulldown", reason: "Injury or pain", until: "cleared", day: "2026-10-02", byUid: "u-kim", replacedBy: ["m-pullover"] }],
      intended: ROAD.map((id) => (id === "m-pulldown" ? "m-pullover" : id)),
    };
    const r = replanned({
      plan,
      routine: [],
      why: "Surgery coming up · knee on Nov 3",
      out: ["m-leg-press"],
      until: "2026-11-30",
      fresh: { intended: ROAD, dayOne: DAY_ONE },
      todayYmd: TODAY,
      who,
      floor: ALL,
    });
    expect(r.change.kind).toBe("replan");
    expect(r.change.value).toBe("Surgery coming up · knee on Nov 3");
    expect(r.change.machineIds).toEqual(r.plan.intended);
    // The road came back with Pulldown, which the bench still holds.
    expect(r.plan.intended).not.toContain("m-pulldown");
    expect(r.plan.intended).not.toContain("m-leg-press");
    expect(r.plan.dayOne).not.toContain("m-leg-press");
    expect(r.also).toEqual([{ kind: "cantdo", machineIds: ["m-leg-press"], value: "2026-11-30" }]);
    expect(r.plan.cantDo?.map((c) => c.machineId).sort()).toEqual(["m-leg-press", "m-pulldown"]);
  });

  it("edits by hand: the road as it is, with what is out on the bench", () => {
    const r = replanned({ plan: PLAN, routine: ["m-leg-press"], why: null, out: ["m-lumbar"], until: "cleared", fresh: null, todayYmd: TODAY, who, floor: ALL });
    expect(r.change.value).toBeUndefined();
    expect(r.plan.intended).not.toContain("m-lumbar");
    expect(r.also).toHaveLength(1);
  });

  it("a surgery coming up benches what is out for now as a surgery, so the bench and the Changes say so", () => {
    expect(replanCantDoReason("Surgery coming up")).toBe("Surgery");
    for (const why of ["Found something in the first sessions", "Client asked", "Training at another studio", null, ""]) {
      expect(replanCantDoReason(why)).toBeNull();
    }
    const r = replanned({
      plan: PLAN,
      routine: ["m-leg-press"],
      why: "Surgery coming up",
      out: ["m-lumbar", "m-compound-row"],
      until: "cleared",
      outReason: replanCantDoReason("Surgery coming up"),
      fresh: null,
      todayYmd: TODAY,
      who,
      floor: ALL,
    });
    expect(r.plan.cantDo?.map((c) => [c.machineId, c.reason])).toEqual([
      ["m-lumbar", "Surgery"],
      ["m-compound-row", "Surgery"],
    ]);
    expect(r.also.map((c) => c.value)).toEqual(["Surgery · cleared", "Surgery · cleared"]);
  });

  it("one Health note for every machine a re-plan benched, never one a machine, and no pronoun", () => {
    const body = healthNoteBodyFor({ machineIds: ["m-lumbar", "m-compound-row"], reason: "Surgery", until: "cleared" }, nameOf, TODAY);
    expect(body).toBe(`Surgery: ${nameOf("m-lumbar")} and ${nameOf("m-compound-row")} are off Routine A's plan until cleared.`);
    expect(healthNoteBody({ machineId: "m-lumbar", until: "cleared" }, nameOf, TODAY)).toBe(`${nameOf("m-lumbar")} is off Routine A's plan until cleared.`);
    expect(body).not.toMatch(/\b(she|he|her|his)\b/i);
  });
});

describe("swap for", () => {
  it("offers the same family on this floor and the Academy's sets, never a machine the plan, Routine A or the bench holds", () => {
    const c = swapChoices({ machineId: "m-chest-press", plan: PLAN, routine: [], floor: ALL, todayYmd: TODAY });
    expect(c.family).toBe("Upper Body — Push");
    expect(c.same).toEqual(["m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-tricep-ext"]);
    expect(c.substitutes).toEqual([
      ["m-chest-fly", "m-tricep-ext"],
      ["m-chest-fly", "m-dip"],
      ["m-dip", "m-overhead-press"],
    ]);
    const small = swapChoices({ machineId: "m-chest-press", plan: PLAN, routine: [], floor: [{ id: "m-chest-press" }, { id: "m-dip" }], todayYmd: TODAY });
    expect(small.same).toEqual(["m-dip"]);
    expect(small.substitutes).toEqual([]);
  });
});

describe("the floor and the draft", () => {
  it("groups this floor by the Academy's families, the rest last", () => {
    const groups = floorByFamily([...ALL.slice(0, 3), { id: "sm-sled", name: "Sled" }]);
    expect(groups.map((g) => g.label)).toEqual(["Lower Body", "Other machines on this floor"]);
    expect(groups[1].machineIds).toEqual(["sm-sled"]);
  });

  it("puts a machine on and off day one in the road's order, and taps the floor in and out", () => {
    const off = withDayOneToggled(PLAN, "m-compound-row", false);
    expect(off.dayOne).toEqual(["m-leg-press", "m-lumbar"]);
    expect(withDayOneToggled(off, "m-compound-row", true).dayOne).toEqual(DAY_ONE);
    const own: RoutinePlan = { purpose: "", intended: [], dayOne: [], building: true, madeByUid: "u-sam" };
    const one = withFloorTapped(own, "m-leg-press", "day");
    const two = withFloorTapped(one, "m-pulldown", "deck");
    expect(two.intended).toEqual(["m-leg-press", "m-pulldown"]);
    expect(two.dayOne).toEqual(["m-leg-press"]);
    expect(withFloorTapped(two, "m-leg-press", "day").dayOne).toEqual([]);
  });

  it("carries the bench onto another start", () => {
    const bench = [{ machineId: "m-chest-press", until: "cleared", day: "2026-10-08", byUid: "u-sam" }];
    const carried = withBenchCarried(PLAN, bench, TODAY, ALL);
    expect(carried.intended).not.toContain("m-chest-press");
    expect(carried.cantDo?.[0].machineId).toBe("m-chest-press");
  });

  it("makes a plan from a routine as it stands, not being built", () => {
    expect(planFromRoutine(["m-leg-press", "m-leg-press", "m-lumbar"], who, TODAY)).toEqual({
      purpose: "",
      intended: ["m-leg-press", "m-lumbar"],
      building: false,
      madeByUid: "u-sam",
      madeByName: "Sam Lee",
      madeAt: TODAY,
    });
  });
});
