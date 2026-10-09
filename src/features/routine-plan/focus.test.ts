/**
 * A weak area, the pure half (Round 2 of the first-session design round,
 * item 7; AJ's yes to docs/rounds/2026-10-07-first-session-and-routines.md
 * §5.4b: "yes lets apply this all"). The screens are held mounted in
 * ui/FocusArea.render.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";
import { bFollowOf, bIntendedOf, bOnDeck, bOnDeckRemoved, bRoadGroups, bRoutineOf } from "./b-routine";
import {
  FOCUS_AREAS,
  SINGLE_JOINT,
  focusAddNotes,
  focusAddQuestion,
  focusAddToA,
  focusAddToB,
  focusAdvice,
  focusAreasOf,
  focusCellWords,
  focusChanged,
  focusCountWords,
  focusLine,
  focusLineWords,
  focusMissingWords,
  focusNoAddWords,
  focusNoSwapWords,
  focusPanelOf,
  focusSwapInB,
  focusWhichWords,
  type FocusBSide,
} from "./focus";
import { swappedIn } from "./lineup";
import type { FloorMachine } from "./starting-plan";
import type { PlanSwap, RoutinePlan } from "./types";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const ALL: FloorMachine[] = IDS.map((id) => ({ id }));
const nameOf = (id: string) => ACADEMY_MOVEMENT_NAME[id] ?? id;
const TODAY = "2026-10-09";

/* AJ's example: weak delts, Seated Dip in A, nothing working them as a main mover. */
const A = ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"];
const PLAN: RoutinePlan = { purpose: "", intended: [...A], building: false, madeByUid: "uid-sam" };
const SWAPS: PlanSwap[] = [
  { replaces: "m-leg-press", with: "m-ext" },
  { replaces: "m-hip-add", with: "m-hip-abd" },
];
const B_PLAN: RoutinePlan = { purpose: "", intended: bIntendedOf(A, SWAPS), swaps: SWAPS, building: false, madeByUid: "uid-sam" };
const B_PLANNED: FocusBSide = { kind: "plan", plan: B_PLAN, routine: bRoutineOf(A, SWAPS, 1) };

const panel = (over: Partial<Parameters<typeof focusPanelOf>[0]> = {}) =>
  focusPanelOf({ area: "delts", aRoutine: A, aFirst: A, aDeck: [], b: { kind: "none" }, floor: ALL, held: [], ...over })!;
/** A Routine B molded in over Routine A `a`: its swaps, the first `made` of them made. */
const bPlanned = (a: readonly string[], swaps: PlanSwap[], made: number): FocusBSide & { kind: "plan" } => ({
  kind: "plan",
  plan: { ...B_PLAN, intended: bIntendedOf(a, swaps), swaps },
  routine: bRoutineOf(a, swaps, made),
});

describe("the focus on the plan", () => {
  it("is stored as area keys, read safely, said as 'Focus: Delts'", () => {
    expect(focusAreasOf({ focus: ["delts", "nowhere", "delts", 7 as unknown as string] })).toEqual(["delts"]);
    expect(focusAreasOf({ focus: "delts" as unknown as string[] })).toEqual([]);
    expect(focusAreasOf(null)).toEqual([]);
    expect(focusLine({ focus: ["delts"] })).toBe("Focus: Delts");
    expect(focusLine({ focus: ["delts", "grip"] })).toBe("Focus: Delts and Grip");
    expect(focusLine({ focus: [] })).toBeNull();
    expect(focusLine(undefined)).toBeNull();
  });

  it("picking an area is one 'focus' change; null takes it off; Routine A's machines stay as they were", () => {
    const on = focusChanged(PLAN, A, "delts");
    expect(on.plan.focus).toEqual(["delts"]);
    expect(on.change).toEqual({ kind: "focus", machineIds: [], value: "delts" });
    expect(on.routine).toEqual(A);
    expect(on.routine).not.toBe(A);
    const off = focusChanged(on.plan, A, null);
    expect(off.plan.focus).toEqual([]);
    expect(off.change.value).toBe("");
    // An area the list doesn't know is never stored.
    expect(focusChanged(PLAN, A, "nowhere").plan.focus).toEqual([]);
  });
});

describe("focusAdvice, what it never offers", () => {
  it("never offers what the client can't do, nor what a routine is told to leave out", () => {
    const advice = focusAdvice({ area: "delts", a: A, b: null, floor: ALL, never: ["m-overhead-press"], notFor: { A: ["m-lateral-raise"] } })!;
    const offered = [...advice.swaps.map((s) => s.to), ...advice.adds.map((x) => x.machineId)];
    expect(offered).not.toContain("m-overhead-press");
    expect(offered).not.toContain("m-lateral-raise");
    expect(offered).toContain("m-simple-row");
  });

  it("reads a studio's own unit as the catalog machine it is", () => {
    const floor: FloorMachine[] = [...ALL.filter((m) => m.id !== "m-overhead-press"), { id: "unit-7", name: "Shoulder Press 2", canonicalId: "m-overhead-press" }];
    const advice = focusAdvice({ area: "delts", a: [...A, "unit-7"], b: null, floor })!;
    expect(advice.missingFrom).toEqual([]);
    expect(advice.inA).toContain("unit-7");
  });

  it("compares the catalog machine, so a second unit of a machine the client can't do (or a routine holds) is never offered", () => {
    // Two units of the Overhead Press: the studio's own first, so it is the one the floor offers.
    const floor: FloorMachine[] = [{ id: "unit-ohp", name: "Shoulder Press 2", canonicalId: "m-overhead-press" }, ...ALL];
    const held = focusAdvice({ area: "delts", a: A, b: null, floor, never: ["m-overhead-press"] })!;
    expect([...held.swaps.map((s) => s.to), ...held.adds.map((x) => x.machineId)]).not.toContain("unit-ohp");
    const told = focusAdvice({ area: "delts", a: A, b: null, floor, notFor: { A: ["m-overhead-press"] } })!;
    expect([...told.swaps.map((s) => s.to), ...told.adds.map((x) => x.machineId)]).not.toContain("unit-ohp");
  });

  it("adds the Academy's named extras first, then single-joint machines, never a compound one ahead of a single-joint one", () => {
    // Weak glutes: Hip Abduction (single-joint) before Leg Press (compound).
    const glutes = focusAdvice({ area: "glutes", a: ["m-compound-row", "m-chest-press", "m-pulldown", "m-overhead-press"], b: null, floor: ALL })!;
    expect(glutes.adds.map((x) => x.machineId)).toEqual(["m-hip-abd", "m-leg-press"]);
    // Weak delts: Lateral Raise, which the Academy names, before Simple Row, then the Overhead Press.
    expect(focusAdvice({ area: "delts", a: A, b: null, floor: ALL })!.adds.map((x) => x.machineId)).toEqual([
      "m-lateral-raise",
      "m-simple-row",
      "m-overhead-press",
    ]);
  });

  it("knows the single-joint machines as the catalog classes them (rotary-single-joint)", () => {
    const fromCatalog = Object.values(MACHINE_DEFINITIONS)
      .filter((d) => d.kinematicClass === "rotary-single-joint")
      .map((d) => d.id)
      .sort();
    expect([...SINGLE_JOINT].sort()).toEqual(fromCatalog);
  });
});

describe("focusPanelOf: the three answers on the A | B lineup", () => {
  it("with no B yet: A's line, B starting as a copy of A, AJ's swap and the single-joint addition for A", () => {
    const p = panel();
    expect(p.lines).toEqual([
      {
        routine: "A",
        state: "helpers",
        machines: [
          { id: "m-compound-row", role: "helper", where: "now" },
          { id: "m-dip", role: "helper", where: "now" },
        ],
      },
      { routine: "B", state: "not-started", machines: [] },
    ]);
    expect(p.missingFrom).toEqual(["A"]);
    expect(p.onPlan).toEqual([]);
    // In the floor's order: a pull that doesn't work the delts for one that does, and AJ's own example.
    const dip = p.swaps.find((s) => s.from === "m-dip")!;
    expect(dip).toMatchObject({ to: "m-overhead-press", routines: ["A"], target: { routine: "A" }, planned: false });
    expect(dip.family).toBe("Upper Body — Push");
    expect(p.swaps.find((s) => s.from === "m-pullover")?.to).toBe("m-simple-row");
    expect(p.adds).toEqual([
      { key: "add:A:m-lateral-raise", machineId: "m-lateral-raise", routines: ["A"], counts: { A: 7 }, singleJoint: true, writeOn: "A" },
    ]);
    expect(p.roles.get("m-dip")).toBe("helper");
    expect(p.roles.get("m-lumbar")).toBeUndefined();
    expect(p.bOwn).toBe(false);
  });

  it("with B molded in: one row for A and B where B follows A, one addition reaching both, counted on each plan", () => {
    const p = panel({ b: B_PLANNED });
    expect(p.missingFrom).toEqual(["A", "B"]);
    expect(p.swaps.map((s) => [s.from, s.to, s.routines])).toEqual(
      expect.arrayContaining([
        ["m-dip", "m-overhead-press", ["A", "B"]],
        ["m-pullover", "m-simple-row", ["A", "B"]],
      ]),
    );
    expect(p.swaps).toHaveLength(2);
    expect(p.swaps.every((s) => s.target.routine === "A")).toBe(true);
    expect(p.adds).toHaveLength(1);
    expect(p.adds[0]).toMatchObject({ machineId: "m-lateral-raise", routines: ["A", "B"], counts: { A: 7, B: 7 }, writeOn: "A" });
    // B's planned swap's machine is on B's line as planned; it doesn't work the delts.
    expect(p.lines[1]!.state).toBe("helpers");
  });

  it("an A row reaching B is 'A and B' however B's own answer comes out, and B is never offered the same machine or place again", () => {
    // The review of item 7: B has swapped Compound Row for Biceps Curl, and
    // B's own answer picks Biceps Curl to swap out, while A's swap at
    // Pullover reaches B through B following A.
    const a = ["m-compound-row", "m-lumbar", "m-dip", "m-pullover", "m-leg-press"];
    const b = bPlanned(a, [{ replaces: "m-compound-row", with: "m-bicep" }], 1);
    expect(b.routine).toEqual(["m-bicep", "m-lumbar", "m-dip", "m-pullover", "m-leg-press"]);
    const p = panel({ aRoutine: a, aFirst: a, b });
    const pull = p.swaps.find((s) => s.from === "m-pullover")!;
    expect(pull).toMatchObject({ to: "m-simple-row", routines: ["A", "B"], target: { routine: "A" } });
    expect(p.swaps.filter((s) => s.to === "m-simple-row")).toHaveLength(1);
    expect(p.swaps.filter((s) => s.target.routine === "B")).toEqual([]);
    // And the one write does reach B: B, following A, takes Simple Row at Pullover's place.
    const edit = swappedIn({ ...PLAN, intended: [...a] }, a, "m-pullover", ["m-simple-row"]);
    const follow = bFollowOf(
      [
        { id: "rA", name: "Routine A", machineIds: a, plan: { ...PLAN, intended: [...a] } },
        { id: "rB", name: "Routine B", machineIds: [...b.routine], plan: b.plan },
      ],
      "rA",
      edit.routine,
    )!;
    expect(follow.machineIds).toEqual(["m-bicep", "m-lumbar", "m-dip", "m-simple-row", "m-leg-press"]);
  });

  it("judges each routine as it runs: On deck and B's plan are named, said as not in the routine yet, and nothing more is added", () => {
    const p = panel({ aDeck: ["m-lateral-raise"], b: B_PLANNED });
    expect(p.missingFrom).toEqual(["A", "B"]);
    expect(p.onPlan).toEqual(["A", "B"]);
    expect(p.lines[0]).toMatchObject({ state: "planned" });
    expect(p.lines[0]!.machines.find((m) => m.id === "m-lateral-raise")).toEqual({ id: "m-lateral-raise", role: "primary", where: "deck" });
    // B takes A's On deck once it is in Routine A (B follows A).
    expect(p.lines[1]!.machines.find((m) => m.id === "m-lateral-raise")?.where).toBe("planned");
    expect(focusMissingWords(p)).toBe("On both plans, not in Routine A or B yet.");
    // A swap still brings it in today; an addition would only go on deck beside it.
    expect(p.swaps.map((s) => [s.from, s.to, s.routines])).toEqual(
      expect.arrayContaining([
        ["m-dip", "m-overhead-press", ["A", "B"]],
        ["m-pullover", "m-simple-row", ["A", "B"]],
      ]),
    );
    expect(p.adds).toEqual([]);
    expect(focusAddNotes(p, nameOf)).toEqual(["Already on A's plan: Lateral Raise (on deck).", "Already on B's plan: Lateral Raise (planned)."]);
  });

  it("B alone: Keep A's main mover in B first, then a change to the swap in B; a new machine for B is never one of A's", () => {
    const a2 = ["m-leg-press", "m-compound-row", "m-overhead-press", "m-lumbar", "m-hip-add"];
    const b = bPlanned(a2, [{ replaces: "m-overhead-press", with: "m-chest-fly" }], 1);
    const p = panel({ aRoutine: a2, aFirst: a2, b });
    expect(p.missingFrom).toEqual(["B"]);
    expect(p.swaps.map((s) => [s.key, s.from, s.to, s.target, s.planned])).toEqual([
      ["keep:m-overhead-press", "m-chest-fly", "m-overhead-press", { routine: "B", aId: "m-overhead-press", keep: true }, false],
      ["B:m-chest-fly>m-lateral-raise", "m-chest-fly", "m-lateral-raise", { routine: "B", aId: "m-overhead-press" }, false],
    ]);
    for (const s of p.swaps) if (s.target.routine === "B" && !s.target.keep) expect(a2).not.toContain(s.to);
    expect(p.adds[0]).toMatchObject({ machineId: "m-lateral-raise", routines: ["B"], counts: { B: 6 }, writeOn: "B" });

    // Keep: B's swap there leaves the plan, and A's machine is back in B today.
    const kept = focusSwapInB({ aRoutine: a2, bPlan: b.plan, bRoutine: b.routine, target: { routine: "B", aId: "m-overhead-press", keep: true }, to: "m-overhead-press" })!;
    expect(kept.plan.swaps).toEqual([]);
    expect(kept.machineIds).toEqual(a2);
    expect(kept.changes).toEqual([{ kind: "swap", machineIds: ["m-overhead-press"], value: "kept" }]);
    // B's swap there changes, B's machine with it (the swap is in B).
    const edit = focusSwapInB({ aRoutine: a2, bPlan: b.plan, bRoutine: b.routine, target: { routine: "B", aId: "m-overhead-press" }, to: "m-lateral-raise" })!;
    expect(edit.plan.swaps).toEqual([{ replaces: "m-overhead-press", with: "m-lateral-raise" }]);
    expect(edit.machineIds).toEqual(b.routine.map((id) => (id === "m-chest-fly" ? "m-lateral-raise" : id)));
    expect(edit.changes).toEqual([{ kind: "swap", machineIds: ["m-overhead-press", "m-lateral-raise"], value: "planned" }]);
    // Where B follows A, a swap is added, planned, last in B's order: nothing in B moves today.
    const added = focusSwapInB({ aRoutine: a2, bPlan: b.plan, bRoutine: b.routine, target: { routine: "B", aId: "m-compound-row" }, to: "m-simple-row" })!;
    expect(added.plan.swaps?.at(-1)).toEqual({ replaces: "m-compound-row", with: "m-simple-row" });
    expect(added.machineIds).toEqual(b.routine);
  });

  it("a place a trainer took out of B stays out, and a swap added to B's plan is said as planned, offered only until B's plan answers it", () => {
    // Overhead Press is A's, and a trainer took it out of B by hand.
    const a3 = ["m-leg-press", "m-compound-row", "m-overhead-press", "m-lumbar"];
    const swaps: PlanSwap[] = [{ replaces: "m-leg-press", with: "m-ext" }];
    const b: FocusBSide = { kind: "plan", plan: { ...B_PLAN, intended: bIntendedOf(a3, swaps), swaps }, routine: ["m-ext", "m-compound-row", "m-lumbar"] };
    const p = panel({ aRoutine: a3, aFirst: a3, b });
    // Never "Overhead Press (planned)" on B's line: that place stays out of B.
    expect(p.lines[1]).toMatchObject({ routine: "B", state: "helpers" });
    expect(p.lines[1]!.machines.map((m) => m.id)).toEqual(["m-compound-row"]);
    expect(p.missingFrom).toEqual(["B"]);
    expect(p.swaps).toEqual([
      {
        key: "B:m-compound-row>m-simple-row",
        from: "m-compound-row",
        to: "m-simple-row",
        routines: ["B"],
        family: "Upper Body — Pull",
        target: { routine: "B", aId: "m-compound-row" },
        planned: true,
      },
    ]);
    // Counted on B's plan as it stands: three, and one more is four.
    expect(p.adds[0]).toMatchObject({ machineId: "m-lateral-raise", routines: ["B"], counts: { B: 4 } });
    expect(focusCountWords(p.adds[0]!)).toBe("B's plan goes to 4 · under the Academy's 6");

    // Once that swap is on B's plan, B's plan answers it: said, and nothing more is added or planned.
    const after: FocusBSide = { ...b, plan: { ...b.plan, swaps: [...swaps, { replaces: "m-compound-row", with: "m-simple-row" }] } };
    const q = panel({ aRoutine: a3, aFirst: a3, b: after });
    expect(q.onPlan).toEqual(["B"]);
    expect(focusLineWords(q.lines[1]!, "delts", nameOf)).toBe("Simple Row (planned)");
    expect(focusMissingWords(q)).toBe("On B's plan, not in Routine B yet.");
    expect(q.swaps).toEqual([]);
    expect(focusNoSwapWords(q)).toBe("On B's plan already.");
    expect(q.adds).toEqual([]);
    expect(focusAddNotes(q, nameOf)).toEqual(["Already on B's plan: Simple Row (planned)."]);
  });

  it("A never takes a machine B swaps in", () => {
    const b = bPlanned(A, [{ replaces: "m-dip", with: "m-overhead-press" }], 1);
    const p = panel({ b });
    // B works the delts with its own swap; A is offered something else.
    expect(p.missingFrom).toEqual(["A"]);
    expect(p.swaps.map((s) => s.to)).not.toContain("m-overhead-press");
    expect(p.adds.map((x) => x.machineId)).not.toContain("m-overhead-press");
  });

  it("a Routine B of its own is read, never changed from here, and the answers say where B changes", () => {
    const p = panel({ b: { kind: "own", routine: ["m-leg-press", "m-chest-press", "m-pulldown"] } });
    expect(p.bOwn).toBe(true);
    expect(p.missingFrom).toEqual(["A", "B"]);
    expect(p.swaps.every((s) => s.routines.length === 1 && s.routines[0] === "A")).toBe(true);
    expect(p.adds.every((x) => x.writeOn === "A" && !x.routines.includes("B"))).toBe(true);
    expect(p.lines[1]!.machines.map((m) => m.where)).toEqual(["now", "now"]);
    // Only B missing, and B its own list: never "nothing on this floor".
    const a = ["m-overhead-press", "m-leg-press", "m-compound-row"];
    const q = panel({ aRoutine: a, aFirst: a, b: { kind: "own", routine: ["m-leg-press", "m-chest-press", "m-pulldown"] } });
    expect(q.missingFrom).toEqual(["B"]);
    expect(q.swaps).toEqual([]);
    expect(q.adds).toEqual([]);
    expect(focusNoSwapWords(q)).toBe("B changes on Routine B.");
    expect(focusNoAddWords(q)).toBe("B changes on Routine B.");
  });

  it("never offers what the client can't do", () => {
    const p = panel({ b: B_PLANNED, held: ["m-overhead-press", "m-lateral-raise"] });
    const offered = [...p.swaps.map((s) => s.to), ...p.adds.map((x) => x.machineId)];
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).not.toContain("m-overhead-press");
    expect(offered).not.toContain("m-lateral-raise");
  });

  it("never counts a machine the client can't do as working the area, a swap B plans for it included", () => {
    // B plans Overhead Press for Seated Dip, and the client can't do the Overhead Press now: that swap waits.
    const swaps: PlanSwap[] = [...SWAPS, { replaces: "m-dip", with: "m-overhead-press" }];
    const b = bPlanned(A, swaps, 1);
    const p = panel({ b, held: ["m-overhead-press"] });
    expect(p.lines[1]!.machines.map((m) => m.id)).not.toContain("m-overhead-press");
    expect(p.lines[1]!.state).toBe("helpers");
    expect(p.missingFrom).toEqual(["A", "B"]);
    expect(p.onPlan).toEqual([]);
    expect(focusMissingWords(p)).toBe("Nothing in A or B works the delts as a main mover.");
    expect(p.roles.has("m-overhead-press")).toBe(false);
    expect([...p.swaps.map((s) => s.to), ...p.adds.map((x) => x.machineId)]).not.toContain("m-overhead-press");
  });

  it("answers grip and triceps with a setting first", () => {
    expect(panel({ area: "grip" }).settingsNote).toMatch(/adapts/);
    expect(panel({ area: "triceps" }).settingsNote).toMatch(/gap setting/);
    expect(panel({ area: "delts" }).settingsNote).toBeNull();
    expect(focusPanelOf({ area: "nowhere", aRoutine: A, aFirst: A, aDeck: [], b: { kind: "none" }, floor: ALL, held: [] })).toBeNull();
  });
});

describe("the edits a tap makes", () => {
  it("an addition goes on deck, at the end of the road, never into today's routine nor day one", () => {
    const plan: RoutinePlan = { ...PLAN, dayOne: ["m-lumbar", "m-leg-press"] };
    const edit = focusAddToA(plan, A, "m-lateral-raise");
    expect(edit.plan.intended).toEqual([...A, "m-lateral-raise"]);
    expect(edit.plan.dayOne).toEqual(["m-lumbar", "m-leg-press"]);
    expect(edit.routine).toEqual(A);
    expect(edit.change).toEqual({ kind: "add", machineIds: ["m-lateral-raise"] });
  });

  it("an addition for B goes on B's deck, B's column and the briefing's Road draw it there, and it can be taken off again", () => {
    const bNow = bRoutineOf(A, SWAPS, 1);
    const edit = focusAddToB(B_PLAN, bNow, "m-lateral-raise");
    expect(edit.plan.intended.at(-1)).toBe("m-lateral-raise");
    expect(edit.machineIds).toEqual(bNow);
    expect(bOnDeck(A, edit.plan, edit.machineIds)).toEqual(["m-lateral-raise"]);
    // B's swaps and A's machines are never "on deck in B".
    expect(bOnDeck(A, B_PLAN, bNow)).toEqual([]);

    // The briefing's Road for a session on B shows it, given Routine A.
    const road = (aRoutine?: string[]) =>
      bRoadGroups({ bPlan: edit.plan, aRoutine, today: bNow, bRoutine: bNow, todayYmd: TODAY, nameOf });
    expect(road(A).find((g) => g.key === "deck")).toEqual({ key: "deck", label: "On deck in B", stations: [{ id: "m-lateral-raise", kind: "planned" }] });
    expect(road().find((g) => g.key === "deck")).toBeUndefined();

    // Taken off B's plan: one "remove", Routine B as it was.
    const off = bOnDeckRemoved(A, edit.plan, bNow, "m-lateral-raise")!;
    expect(off.plan.intended).toEqual(B_PLAN.intended);
    expect(off.machineIds).toEqual(bNow);
    expect(off.changes).toEqual([{ kind: "remove", machineIds: ["m-lateral-raise"] }]);
    // Never a swap's machine or one of A's from here.
    expect(bOnDeckRemoved(A, edit.plan, bNow, "m-hip-abd")).toBeNull();
    expect(bOnDeckRemoved(A, edit.plan, bNow, "m-dip")).toBeNull();
  });
});

describe("the words", () => {
  it("says each routine's line with every name whole", () => {
    const p = panel({ aDeck: ["m-lateral-raise"] });
    expect(focusLineWords(p.lines[0]!, "delts", nameOf)).toBe("Lateral Raise (on deck)");
    expect(focusLineWords(panel().lines[0]!, "delts", nameOf)).toBe("Helpers only: Compound Row and Seated Dip");
    expect(focusLineWords({ routine: "A", state: "nothing", machines: [] }, "low-back", nameOf)).toBe("Nothing works the low back");
    expect(focusLineWords({ routine: "B", state: "not-started", machines: [] }, "delts", nameOf)).toBe("Not started · B starts as a copy of A");
    const both = panel({ aRoutine: [...A, "m-overhead-press"], aFirst: [...A, "m-overhead-press"], aDeck: ["m-lateral-raise"] });
    expect(focusLineWords(both.lines[0]!, "delts", nameOf)).toBe("Overhead Press and Lateral Raise (on deck)");
  });

  it("says what is missing where, what is only on the plan, or that nothing needs to change", () => {
    expect(focusMissingWords(panel())).toBe("Nothing in A works the delts as a main mover.");
    expect(focusMissingWords(panel({ b: B_PLANNED }))).toBe("Nothing in A or B works the delts as a main mover.");
    expect(focusMissingWords(panel({ aDeck: ["m-lateral-raise"] }))).toBe("On A's plan, not in Routine A yet.");
    const a = [...A, "m-overhead-press"];
    expect(focusMissingWords(panel({ aRoutine: a, aFirst: a }))).toBe("Worked in A. B starts as a copy of A.");
    expect(focusMissingWords(panel({ aRoutine: a, aFirst: a, b: bPlanned(a, SWAPS, 1) }))).toBe("Worked in A and B. Nothing to change.");
  });

  it("says what an addition does to each plan's count against the Academy's 6 to 8", () => {
    expect(focusCountWords({ routines: ["A", "B"], counts: { A: 7, B: 7 } })).toBe("A's and B's plans go to 7 · inside the Academy's 6 to 8");
    expect(focusCountWords({ routines: ["A", "B"], counts: { A: 7, B: 6 } })).toBe("A's plan goes to 7 · B's plan goes to 6 · inside the Academy's 6 to 8");
    expect(focusCountWords({ routines: ["A"], counts: { A: 9 } })).toBe("A's plan goes to 9 · past the Academy's 8: better in place of a lower-priority machine");
    expect(focusCountWords({ routines: ["B"], counts: { B: 4 } })).toBe("B's plan goes to 4 · under the Academy's 6");
  });

  // §5.4b, answer 3: "what it pushes out to stay in 5-8 machines" (the whole-branch review, Oct 9 2026: past the 8 it named nothing).
  it("past the Academy's 8, names the plan's lowest-priority machine the addition is better in place of, never moving it", () => {
    const a8 = ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press", "m-leg-curl", "m-abs"];
    const p = panel({ aRoutine: a8, aFirst: a8 });
    const add = p.adds[0]!;
    expect(add.counts.A).toBe(9);
    // From the plan's end: one that doesn't work the area and isn't one of the Big 5's families.
    expect(add.inPlaceOf).toBe("m-abs");
    expect(focusCountWords(add, (id) => `<${id}>`)).toBe("A's plan goes to 9 · past the Academy's 8: in place of <m-abs>?");
    // Inside the count, nothing is named.
    expect(panel().adds[0]!.inPlaceOf).toBeUndefined();
  });

  it("words the third question by what it offers", () => {
    expect(focusAddQuestion({ adds: [] })).toBe("Or add a single-joint machine?");
    const one = { key: "k", machineId: "m-hip-abd", routines: ["A" as const], counts: { A: 7 }, singleJoint: true, writeOn: "A" as const };
    expect(focusAddQuestion({ adds: [one] })).toBe("Or add a single-joint machine?");
    expect(focusAddQuestion({ adds: [{ ...one, machineId: "m-leg-press", singleJoint: false }] })).toBe("Or add a machine?");
  });

  it("says a tint in words, and which routine an answer is for", () => {
    expect(focusCellWords("primary", "delts")).toBe("works the delts");
    expect(focusCellWords("helper", "delts")).toBe("helps");
    expect(focusWhichWords(["A"])).toBe("A");
    expect(focusWhichWords(["A", "B"])).toBe("A and B");
  });

  it("names no gender and moves no weight: the areas are body parts only", () => {
    for (const def of Object.values(FOCUS_AREAS)) expect(def.label).not.toMatch(/\b(he|she|her|his|male|female|lb)\b/i);
  });
});
