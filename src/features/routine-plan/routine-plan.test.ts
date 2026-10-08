import { describe, expect, it } from "vitest";
import { SELECTION_TEMPLATES } from "../routine-builder/academy";
import { findViolations } from "../routine-builder/engine";
import { isProvisionalNewClient, startingKindOf } from "./client-kind";
import {
  academyTemplateName,
  floorIndex,
  startingPlanFrom,
  suggestStartingPlan,
  sayableTemplateLabel,
  type FloorMachine,
} from "./starting-plan";
import {
  applyPlanChange,
  isStartingColumnChoice,
  nextTimeRows,
  planAfterWrapUp,
  planProgress,
  planWithCantDo,
  progressLine,
  routineAfterWrapUp,
  routineWith,
} from "./plan";
import { bRoutineOf, bStatus, bWithNextSwaps, suggestBSwaps, swapsMade } from "./b-routine";
import { focusAdvice } from "./focus";
import { ACADEMY_STARTING_WEIGHTS, academyStartingReference } from "./starting-weights";
import type { CantDo, RoutinePlan } from "./types";

/** The twenty MSF machines, as a floor that uses the catalog ids. */
const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));

const who = { uid: "u-sam", name: "Sam" };

describe("which kind of no routine", () => {
  const base = { known: true, hasRoutine: false, journeySessions: 0, coverage: "complete" as const, provisionalNewClient: false };

  it("calls a client new to the studio only when Journey holds the whole, empty story", () => {
    expect(startingKindOf(base).kind).toBe("new-to-studio");
  });
  it("never calls a client with sessions before Journey new", () => {
    const a = startingKindOf({ ...base, coverage: "partial" });
    expect(a.kind).toBe("new-to-journey");
    expect(a.says).not.toMatch(/new client|first session/i);
  });
  it("says it can't tell rather than guessing", () => {
    expect(startingKindOf({ ...base, coverage: "unknown" }).kind).toBe("unknown");
    expect(startingKindOf({ ...base, journeySessions: null }).kind).toBe("unknown");
  });
  it("leaves a client with a routine alone", () => {
    expect(startingKindOf({ ...base, hasRoutine: true }).kind).toBe("established");
  });
  it("claims nothing while the routines or the session count haven't answered", () => {
    // A read that hasn't answered is "can't tell", never new: an empty cache
    // answer looks exactly like a client with no routine and no sessions.
    expect(startingKindOf({ ...base, known: false }).kind).toBe("unknown");
    expect(startingKindOf({ ...base, known: false, hasRoutine: true }).kind).toBe("unknown");
    expect(startingKindOf({ ...base, known: false, provisionalNewClient: true }).kind).toBe("unknown");
  });
  it("treats Add Client's walk-in as new to the studio, whatever Mindbody hasn't said yet", () => {
    expect(startingKindOf({ ...base, coverage: "unknown", journeySessions: null, provisionalNewClient: true }).kind).toBe(
      "new-to-studio",
    );
    expect(startingKindOf({ ...base, provisionalNewClient: true, hasRoutine: true }).kind).toBe("established");
  });
  it("tells Add Client's new client from a profile made while Mindbody was down", () => {
    expect(isProvisionalNewClient({ provisional: true, provisionalReason: "New client, not in Mindbody yet" })).toBe(true);
    expect(isProvisionalNewClient({ provisional: true, provisionalReason: "Mindbody is down" })).toBe(false);
    expect(isProvisionalNewClient({ provisional: false, provisionalReason: "New client, not in Mindbody yet" })).toBe(false);
    // Merged into the real record: the real record answers now.
    expect(
      isProvisionalNewClient({ provisional: true, provisionalReason: "New client, not in Mindbody yet", supersededById: "c-9" }),
    ).toBe(false);
    expect(isProvisionalNewClient(null)).toBe(false);
  });
  it("never says new client, first session or nothing before Journey, whatever the kind", () => {
    // "Complete" allows up to five Mindbody visits before Journey (a
    // consultation and an intro), so "nothing before Journey" would be wrong.
    const inputs = [
      base,
      { ...base, provisionalNewClient: true },
      { ...base, coverage: "partial" as const },
      { ...base, journeySessions: 3 },
      { ...base, coverage: "unknown" as const },
      { ...base, known: false },
      { ...base, hasRoutine: true },
    ];
    for (const input of inputs) {
      expect(startingKindOf(input).says).not.toMatch(/new client|first session|nothing before journey/i);
    }
    expect(startingKindOf(base).says).toBe("Starting out at the studio: start a plan.");
  });
});

describe("the starting plan", () => {
  it("matches a condition from the intake before the plain template", () => {
    const s = suggestStartingPlan({ intakeText: "Lower back pain after lifting boxes", floor: ALL });
    const t = SELECTION_TEMPLATES.find((x) => x.id === s.templateId)!;
    expect(t.kind).toBe("condition");
    expect(s.why).toMatch(/matched from the intake/);
  });

  it("starts a client with no reported issues on the consultation's machines (LP, CR, Lumbar)", () => {
    // Changed on purpose (Oct 8 2026): this picked the row from Mindbody's
    // gender. AJ, "3a": "Gender is used nowhere in choosing a start", so the
    // trainer picks the row and the test picks it the same way.
    const s = suggestStartingPlan({ intakeText: "", floor: ALL, templateId: "clear-female" });
    expect(s.templateId).toBe("clear-female");
    const { plan, startWith } = startingPlanFrom(s, who);
    expect([...startWith].sort()).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    expect(plan.building).toBe(true);
    expect(plan.intended.length).toBeGreaterThan(startWith.length);
    expect(plan.madeByUid).toBe("u-sam");
  });

  it("never says the client's gender: the template's sex split stays off screen", () => {
    for (const t of SELECTION_TEMPLATES) {
      expect(sayableTemplateLabel(t)).not.toMatch(/\b(female|male)\b/i);
      expect(academyTemplateName(t)).not.toMatch(/\b(female|male)\b/i);
    }
    for (const t of SELECTION_TEMPLATES) {
      const s = suggestStartingPlan({ floor: ALL, templateId: t.id });
      expect(s.label).not.toMatch(/\b(female|male)\b/i);
      expect(s.why).not.toMatch(/\b(female|male|woman|man)\b/i);
      for (const a of s.alternatives) expect(a.label).not.toMatch(/\b(female|male)\b/i);
    }
  });

  it("asks the trainer to pick when the intake names nothing, and picks nothing for them", () => {
    // Changed on purpose (Oct 8 2026): with no gender from Mindbody this used
    // to fall back to the first row anyway. AJ, "3a": "Gender is used nowhere
    // in choosing a start", so an intake that names nothing picks no row.
    const s = suggestStartingPlan({ floor: ALL });
    expect(s.needsChoice).toBe(true);
    expect(s.templateId).toBeNull();
    expect(s.label).toBeNull();
    expect(s.steps).toEqual([]);
    expect(s.alternatives).toHaveLength(SELECTION_TEMPLATES.length);
    // Each alternative carries its machines, so the two no-reported-issues
    // rows are told apart by more than their names.
    const clear = s.alternatives.filter((a) => a.templateId.startsWith("clear-"));
    expect(clear).toHaveLength(2);
    expect(clear[0].label).not.toBe(clear[1].label);
    expect(clear[0].machineIds).not.toEqual(clear[1].machineIds);
  });

  it("keeps only machines on the floor and says which it couldn't", () => {
    const floor = ALL.filter((m) => m.id !== "m-lumbar");
    const s = suggestStartingPlan({ templateId: "clear-female", floor });
    const consult = s.steps.find((x) => x.key === "consult")!;
    expect(consult.machineIds).not.toContain("m-lumbar");
    expect(consult.missing).toContain("m-lumbar");
  });

  it("maps the Academy's machines onto a studio's own floor ids", () => {
    const floor: FloorMachine[] = ALL.map((m) => ({ id: `unit-${m.id}`, canonicalId: m.id }));
    const s = suggestStartingPlan({ templateId: "clear-female", floor });
    const { startWith } = startingPlanFrom(s, who);
    expect(startWith.every((id) => id.startsWith("unit-"))).toBe(true);
    expect(floorIndex(floor).get("m-leg-press")).toBe("unit-m-leg-press");
  });

  it("makes a plan every Academy template can start, with no sequencing rule broken on day one", () => {
    for (const t of SELECTION_TEMPLATES) {
      const s = suggestStartingPlan({ floor: ALL, templateId: t.id });
      const { plan, startWith } = startingPlanFrom(s, who);
      expect(startWith.length, t.id).toBeGreaterThan(0);
      expect(startWith.every((id) => plan.intended.includes(id)), t.id).toBe(true);
      expect(findViolations(startWith).filter((v) => v.severity === "avoid"), `${t.id} day one`).toEqual([]);
    }
  });

  it("can aim at the eventual A instead of the learning-curve routine", () => {
    const s = suggestStartingPlan({ templateId: "clear-female", floor: ALL });
    const eventual = startingPlanFrom(s, who, "eventualA").plan;
    const a = s.steps.find((x) => x.key === "eventualA")!.machineIds;
    for (const id of a) expect(eventual.intended).toContain(id);
  });
});

const PLAN: RoutinePlan = {
  purpose: "Learning the protocol",
  intended: ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"],
  building: true,
  madeByUid: "u-sam",
};

describe("the plan", () => {
  it("says how far along a routine is and what comes next", () => {
    const p = planProgress(PLAN, ["m-lumbar", "m-compound-row", "m-leg-press"]);
    expect(p).toMatchObject({ have: 3, of: 6, next: "m-dip", complete: false, extras: [] });
    expect(progressLine(p, (id) => ({ "m-dip": "Seated Dip" })[id] ?? id)).toBe("3 of 6 · next: Seated Dip");
  });

  it("keeps a machine the trainer added that the plan doesn't name, where it was", () => {
    const routine = ["m-lumbar", "m-abs", "m-compound-row", "m-leg-press"];
    expect(planProgress(PLAN, routine).extras).toEqual(["m-abs"]);
    expect(routineWith(PLAN, routine, ["m-dip"])).toEqual(["m-lumbar", "m-abs", "m-compound-row", "m-dip", "m-leg-press"]);
  });

  it("applies each kind of change, and a swap keeps the machine's place", () => {
    expect(applyPlanChange(PLAN, { kind: "swap", machineIds: ["m-dip", "m-overhead-press"] }).intended[2]).toBe("m-overhead-press");
    expect(applyPlanChange(PLAN, { kind: "remove", machineIds: ["m-hip-add"] }).intended).not.toContain("m-hip-add");
    expect(applyPlanChange(PLAN, { kind: "add", machineIds: ["m-abs"] }).intended.at(-1)).toBe("m-abs");
    expect(applyPlanChange(PLAN, { kind: "purpose", machineIds: [], value: "Shoulders: delts weak" }).purpose).toBe("Shoulders: delts weak");
    expect(applyPlanChange(PLAN, { kind: "building", machineIds: [], value: "off" }).building).toBe(false);
    expect(applyPlanChange(PLAN, { kind: "focus", machineIds: [], value: "delts, grip" }).focus).toEqual(["delts", "grip"]);
    // A reorder never loses a planned machine.
    const reordered = applyPlanChange(PLAN, { kind: "reorder", machineIds: ["m-leg-press", "m-lumbar"] }).intended;
    expect(reordered.slice(0, 2)).toEqual(["m-leg-press", "m-lumbar"]);
    expect([...reordered].sort()).toEqual([...PLAN.intended].sort());
  });

  const mark: CantDo = { machineId: "m-dip", reason: "Surgery", until: "cleared", day: "2026-10-08", byUid: "u-sam", replacedBy: [] };

  it("keeps a can't-do entry carried beside its change, one per machine", () => {
    const marked = applyPlanChange(PLAN, { kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared" }, mark);
    expect(marked.cantDo).toEqual([mark]);
    // A second mark changes the reason or the until; it never stacks.
    const again = applyPlanChange(marked, { kind: "cantdo", machineIds: ["m-dip"] }, { ...mark, reason: "Injury or pain" });
    expect(again.cantDo).toEqual([{ ...mark, reason: "Injury or pain" }]);
    // The road is reshaped by reshapeForCantDo, which knows the floor; the change alone never moves it.
    expect(marked.intended).toEqual(PLAN.intended);
    // With no entry beside it there is nothing to record.
    expect(applyPlanChange(PLAN, { kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared" })).toBe(PLAN);
  });

  it("reopens, re-plans and keeps the starting column", () => {
    const marked = planWithCantDo(PLAN, mark);
    expect(applyPlanChange(marked, { kind: "cando", machineIds: ["m-dip"] }).cantDo).toEqual([]);
    const replanned = applyPlanChange(PLAN, {
      kind: "replan",
      machineIds: ["m-leg-press", "m-compound-row", "m-leg-press"],
      value: "Surgery coming up",
    });
    expect(replanned.intended).toEqual(["m-leg-press", "m-compound-row"]);
    expect(applyPlanChange(PLAN, { kind: "column", machineIds: [], value: "female-novice" }).startingColumn).toBe("female-novice");
    expect(applyPlanChange(PLAN, { kind: "column", machineIds: [], value: "none" }).startingColumn).toBe("none");
    // Not one of the sheet's columns: skipped, never bent into one.
    expect(applyPlanChange(PLAN, { kind: "column", machineIds: [], value: "heavy" })).toBe(PLAN);
    expect(isStartingColumnChoice("male-advanced")).toBe(true);
    expect(isStartingColumnChoice("toString")).toBe(false);
  });
});

describe("the Wrap-up's next time", () => {
  const routine = ["m-lumbar", "m-compound-row", "m-leg-press"];

  it("adds today's machines on by default while the routine is being built", () => {
    const rows = nextTimeRows({ plan: PLAN, routine, performedToday: ["m-lumbar", "m-compound-row", "m-dip", "m-leg-press"] });
    expect(rows).toEqual([{ machineId: "m-dip", defaultOn: true, why: "planned" }]);
  });

  it("offers a one-off machine unticked once the routine is established", () => {
    const rows = nextTimeRows({ plan: { ...PLAN, building: false }, routine, performedToday: ["m-abs"] });
    expect(rows).toEqual([{ machineId: "m-abs", defaultOn: false, why: "added-today" }]);
    expect(nextTimeRows({ plan: null, routine, performedToday: ["m-abs"] })[0].defaultOn).toBe(false);
  });

  it("never shrinks the routine on a short day", () => {
    expect(nextTimeRows({ plan: PLAN, routine, performedToday: ["m-leg-press"] })).toEqual([]);
    expect(routineAfterWrapUp({ plan: PLAN, routine, ticked: [] })).toEqual(routine);
  });

  it("carries the ticked machines in, in the plan's order, and keeps a kept extra in the plan", () => {
    expect(routineAfterWrapUp({ plan: PLAN, routine, ticked: ["m-dip"] })).toEqual(["m-lumbar", "m-compound-row", "m-dip", "m-leg-press"]);
    expect(planAfterWrapUp(PLAN, ["m-abs"]).intended).toContain("m-abs");
    expect(planAfterWrapUp(PLAN, ["m-dip"])).toBe(PLAN);
  });
});

describe("B, molded in", () => {
  const A = ["m-hip-add", "m-dip", "m-compound-row", "m-torso-rotation", "m-overhead-press", "m-pullover", "m-leg-press"];
  const swaps = [
    { replaces: "m-hip-add", with: "m-hip-abd" },
    { replaces: "m-compound-row", with: "m-simple-row" },
    { replaces: "m-pullover", with: "m-pulldown" },
  ];

  it("starts as A with one machine different, and grows a swap at a time", () => {
    const b1 = bRoutineOf(A, swaps, 1);
    expect(b1.filter((id, i) => id !== A[i])).toEqual(["m-hip-abd"]);
    const b3 = bWithNextSwaps(A, swaps, b1, 2);
    expect(swapsMade(swaps, b3)).toBe(3);
    expect(bStatus(swaps, b3).built).toBe(true);
    expect(bStatus(swaps, b1)).toMatchObject({ made: 1, of: 3, next: swaps[1] });
  });

  it("lets a change to A reach B's unswapped part by itself", () => {
    const newA = A.map((id) => (id === "m-overhead-press" ? "m-lateral-raise" : id));
    expect(bRoutineOf(newA, swaps, 1)).toContain("m-lateral-raise");
    expect(bRoutineOf(newA, swaps, 1)).toContain("m-hip-abd");
  });

  it("suggests same-category swaps on the floor, never a machine A already has", () => {
    const suggested = suggestBSwaps({ aRoutine: A, floor: ALL, templateId: "clear-female" });
    expect(suggested.length).toBeGreaterThan(0);
    for (const s of suggested) {
      expect(A).toContain(s.replaces);
      expect(A).not.toContain(s.with);
    }
    expect(new Set(suggested.map((s) => s.with)).size).toBe(suggested.length);
  });
});

describe("a weak area", () => {
  it("swaps Seated Dip for Overhead Press when the delts are weak (AJ's example)", () => {
    const a = ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"];
    const advice = focusAdvice({ area: "delts", a, b: null, floor: ALL })!;
    expect(advice.missingFrom).toEqual(["A"]);
    expect(advice.swaps).toContainEqual({ routine: "A", from: "m-dip", to: "m-overhead-press" });
    // Additions put the single-joint machine first.
    expect(advice.adds[0].machineId).toBe("m-lateral-raise");
  });

  it("asks for the area in both routines", () => {
    const advice = focusAdvice({
      area: "delts",
      a: ["m-overhead-press", "m-leg-press"],
      b: ["m-chest-press", "m-ext"],
      floor: ALL,
    })!;
    expect(advice.missingFrom).toEqual(["B"]);
  });

  it("answers grip with a setting, not a machine", () => {
    expect(focusAdvice({ area: "grip", a: ["m-compound-row"], b: null, floor: ALL })!.settingsNote).toMatch(/adapts/);
    expect(focusAdvice({ area: "nowhere", a: [], b: null, floor: ALL })).toBeNull();
  });
});

describe("the Academy's starting ranges", () => {
  it("covers all twenty machines, every range low to high", () => {
    expect(Object.keys(ACADEMY_STARTING_WEIGHTS)).toHaveLength(20);
    for (const row of Object.values(ACADEMY_STARTING_WEIGHTS)) {
      for (const range of Object.values(row)) expect(range.low).toBeLessThanOrEqual(range.high);
    }
  });

  it("is a reference beside the weight, and never once the client has one", () => {
    const ref = academyStartingReference({ canonicalMachineId: "m-leg-press", column: "female-novice", hasWeight: false })!;
    expect(ref.says).toBe("Academy's starting range: 60–100 lb (a reference, not a rule)");
    expect(academyStartingReference({ canonicalMachineId: "m-leg-press", column: "female-novice", hasWeight: true })).toBeNull();
    expect(academyStartingReference({ canonicalMachineId: "sm-solon-sled", column: "male-novice", hasWeight: false })).toBeNull();
    expect(academyStartingReference({ canonicalMachineId: "m-neck", column: "female-novice", hasWeight: false })!.says).toMatch(/: 20 lb/);
  });
});
