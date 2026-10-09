import { describe, expect, it } from "vitest";
import { SELECTION_TEMPLATES } from "../routine-builder/academy";
import { findViolations } from "../routine-builder/engine";
import { isProvisionalNewClient, LEARNING_CURVE_SESSIONS, learningCurveInputOf, pastLearningCurve, startingKindOf } from "./client-kind";
import { academyTemplateName, floorIndex, sayableTemplateLabel, type FloorMachine } from "./starting-plan";
import { academyStartingRoutines, academyTemplateOf, startingPlanFromRoutine, suggestFromStartingRoutines } from "./starting-routines";
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
  runsDayOne,
  stillBuilding,
  todayFor,
} from "./plan";
import { bIntendedOf, bRoutineOf, bStatus, bSwappedIn, suggestBSwaps, swapsMade } from "./b-routine";
import { focusAdvice } from "./focus";
import { ACADEMY_STARTING_WEIGHTS, academyStartingReference } from "./starting-weights";
import type { CantDo, RoutinePlan } from "./types";
import { savedRoutineA, savedRoutineB } from "./ui/host";
import { resolveRoutine } from "../routines/routine-rows";

/** The twenty MSF machines, as a floor that uses the catalog ids. */
const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));

const who = { uid: "u-sam", name: "Sam" };

describe("which kind of no routine", () => {
  const base = { known: true, hasRoutine: false, hasPlan: false, journeySessions: 0, coverage: "complete" as const, provisionalNewClient: false };

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
  it("leaves a client with a plan alone while Routine A is still empty, before the consult and after it", () => {
    // AJ, Oct 8 2026: "this also counts with the consult visit, sometimes the
    // consult machines will not be the same as their a routine". Keep this
    // lineup makes Routine A empty with day one on the plan, so a kept plan
    // is set up: never Start a plan again, and never "no routine yet" once
    // the consult is in Journey.
    expect(startingKindOf({ ...base, hasPlan: true })).toEqual({ kind: "established", says: "Has a plan." });
    expect(startingKindOf({ ...base, hasPlan: true, journeySessions: 1 }).kind).toBe("established");
    // A read that hasn't answered still claims nothing.
    expect(startingKindOf({ ...base, hasPlan: true, known: false }).kind).toBe("unknown");
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
      { ...base, hasPlan: true },
    ];
    for (const input of inputs) {
      expect(startingKindOf(input).says).not.toMatch(/new client|first session|nothing before journey/i);
    }
    expect(startingKindOf(base).says).toBe("Starting out at the studio: start a plan.");
  });

  /* The Academy: "after the initial 'learning curve' period of around 4 to
     6 workouts". The briefing and the routine drawer both ask this one rule. */
  describe("a short routine is called thin only past the learning curve", () => {
    const past = {
      known: true,
      coverage: "complete" as const,
      journeySessions: LEARNING_CURVE_SESSIONS,
      routineABeingBuilt: false,
    };
    it("six sessions, or trained here before Journey", () => {
      expect(LEARNING_CURVE_SESSIONS).toBe(6);
      expect(pastLearningCurve(past)).toBe(true);
      expect(pastLearningCurve({ ...past, coverage: "unknown", journeySessions: 40 })).toBe(true);
      expect(pastLearningCurve({ ...past, coverage: "partial", journeySessions: 0 })).toBe(true);
      expect(pastLearningCurve({ ...past, coverage: "partial", journeySessions: null })).toBe(true);
    });
    it("not a client whose whole story is in Journey and still inside the curve, with a routine or without", () => {
      // Two sessions, coverage complete: a hand-built Routine A or none at
      // all, the client is still learning the machines.
      expect(pastLearningCurve({ ...past, journeySessions: 2 })).toBe(false);
      expect(pastLearningCurve({ ...past, journeySessions: 0 })).toBe(false);
      expect(pastLearningCurve({ ...past, journeySessions: 5 })).toBe(false);
    });
    it("never while Routine A is being built, nor when Journey can't tell", () => {
      expect(pastLearningCurve({ ...past, routineABeingBuilt: true })).toBe(false);
      expect(pastLearningCurve({ ...past, coverage: "partial", routineABeingBuilt: true })).toBe(false);
      expect(pastLearningCurve({ ...past, known: false })).toBe(false);
      expect(pastLearningCurve({ ...past, coverage: "unknown", journeySessions: 3 })).toBe(false);
      expect(pastLearningCurve({ ...past, coverage: "unknown", journeySessions: null })).toBe(false);
      expect(pastLearningCurve({ ...past, journeySessions: null })).toBe(false);
    });
    // The whole-branch review (Oct 9 2026): the drawer and the briefing fed
    // the rule different inputs; now both ask learningCurveInputOf.
    it("one set of inputs for both screens: the routines' answer, the client's count, and a plan still short of its road", () => {
      const routineA = { machineIds: ["m-a", "m-b"], plan: { purpose: "", intended: ["m-a", "m-b", "m-c"], building: true, madeByUid: "u" } };
      const client = { sessionCount: 9 };
      expect(learningCurveInputOf({ routinesKnown: true, coverage: "complete", client, routineA })).toEqual({
        known: true,
        coverage: "complete",
        journeySessions: 9,
        routineABeingBuilt: true,
      });
      // The plan's every machine in, the switch left on: no longer being built.
      const done = { ...routineA, machineIds: ["m-a", "m-b", "m-c"] };
      expect(pastLearningCurve(learningCurveInputOf({ routinesKnown: true, coverage: "complete", client, routineA: done }))).toBe(true);
      // No count on the client, or the routines unread: nothing claimed.
      expect(learningCurveInputOf({ routinesKnown: true, coverage: "complete", client: {}, routineA: done }).journeySessions).toBeNull();
      expect(pastLearningCurve(learningCurveInputOf({ routinesKnown: false, coverage: "complete", client, routineA: done }))).toBe(false);
    });
  });
});

/*
 * The starting plan, through the one builder every screen uses (the
 * whole-branch review, Oct 9 2026: these held an older builder from the
 * Academy's templates themselves, read by tests only, deleted so the two
 * could never drift): the Academy's eleven as starting routines
 * (`academyStartingRoutines`), the suggestion (`suggestFromStartingRoutines`)
 * and the plan a start makes (`startingPlanFromRoutine`).
 */
describe("the starting plan", () => {
  const ACADEMY = academyStartingRoutines();
  const suggest = (input: { intakeText?: string; pickedId?: string; floor?: FloorMachine[] } = {}) =>
    suggestFromStartingRoutines({
      routines: ACADEMY,
      choice: null,
      intakeText: input.intakeText ?? null,
      floor: input.floor ?? ALL,
      pickedId: input.pickedId ?? null,
    });
  const routineOf = (id: string) => ACADEMY.find((r) => r.id === id)!;

  it("matches a condition from the intake before the plain template", () => {
    const s = suggest({ intakeText: "Lower back pain after lifting boxes" });
    expect(academyTemplateOf(s.templateId)!.kind).toBe("condition");
    expect(s.why).toMatch(/Matched from the intake/);
  });

  it("starts a client with no reported issues on the consultation's machines (LP, CR, Lumbar)", () => {
    // Changed on purpose (Oct 8 2026): this picked the row from Mindbody's
    // gender. AJ, "3a": "Gender is used nowhere in choosing a start", so the
    // trainer picks the row and the test picks it the same way.
    const s = suggest({ pickedId: "academy-clear-dip-adduction" });
    expect(s.templateId).toBe("academy-clear-dip-adduction");
    const { plan, startWith } = startingPlanFromRoutine(routineOf(s.templateId!), who, ALL, "2026-10-09");
    expect([...startWith].sort()).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    expect(plan.building).toBe(true);
    expect(plan.intended.length).toBeGreaterThan(startWith.length);
    expect(plan.madeByUid).toBe("u-sam");
    // Day one rides on the plan, not in Routine A (AJ, Oct 8 2026: "sometimes
    // the consult machines will not be the same as their a routine").
    expect(plan.dayOne).toEqual(startWith);
    // Two lists, so a draft that edits one never changes the other.
    expect(plan.dayOne).not.toBe(startWith);
  });

  it("never says the client's gender: the template's sex split stays off screen", () => {
    for (const t of SELECTION_TEMPLATES) {
      expect(sayableTemplateLabel(t)).not.toMatch(/\b(female|male)\b/i);
      expect(academyTemplateName(t)).not.toMatch(/\b(female|male)\b/i);
    }
    for (const r of ACADEMY) {
      const s = suggest({ pickedId: r.id });
      expect(s.label).not.toMatch(/\b(female|male)\b/i);
      expect(s.why).not.toMatch(/\b(female|male|woman|man)\b/i);
      for (const a of s.alternatives) expect(a.label).not.toMatch(/\b(female|male)\b/i);
    }
  });

  it("asks the trainer to pick when the intake names nothing, and picks nothing for them", () => {
    // Changed on purpose (Oct 8 2026): with no gender from Mindbody this used
    // to fall back to the first row anyway. AJ, "3a": "Gender is used nowhere
    // in choosing a start", so an intake that names nothing picks no row.
    const s = suggest();
    expect(s.needsChoice).toBe(true);
    expect(s.templateId).toBeNull();
    expect(s.label).toBeNull();
    expect(s.steps).toEqual([]);
    expect(s.alternatives).toHaveLength(SELECTION_TEMPLATES.length);
    // Each alternative carries its machines, so the two no-reported-issues
    // rows are told apart by more than their names.
    const clear = s.alternatives.filter((a) => a.templateId.startsWith("academy-clear-"));
    expect(clear).toHaveLength(2);
    expect(clear[0].label).not.toBe(clear[1].label);
    expect(clear[0].machineIds).not.toEqual(clear[1].machineIds);
  });

  it("keeps only machines on the floor and says which it couldn't", () => {
    const floor = ALL.filter((m) => m.id !== "m-lumbar");
    const s = suggest({ pickedId: "academy-clear-dip-adduction", floor });
    expect(s.steps.flatMap((x) => x.machineIds)).not.toContain("m-lumbar");
    expect(s.steps.flatMap((x) => x.missing)).toContain("m-lumbar");
  });

  it("maps the Academy's machines onto a studio's own floor ids", () => {
    const floor: FloorMachine[] = ALL.map((m) => ({ id: `unit-${m.id}`, canonicalId: m.id }));
    const { startWith } = startingPlanFromRoutine(routineOf("academy-clear-dip-adduction"), who, floor, "2026-10-09");
    expect(startWith.every((id) => id.startsWith("unit-"))).toBe(true);
    expect(floorIndex(floor).get("m-leg-press")).toBe("unit-m-leg-press");
  });

  it("makes a plan every Academy template can start, with no sequencing rule broken on day one", () => {
    for (const r of ACADEMY) {
      const { plan, startWith } = startingPlanFromRoutine(r, who, ALL, "2026-10-09");
      expect(startWith.length, r.id).toBeGreaterThan(0);
      expect(startWith.every((id) => plan.intended.includes(id)), r.id).toBe(true);
      expect(findViolations(startWith).filter((v) => v.severity === "avoid"), `${r.id} day one`).toEqual([]);
    }
  });
});

const PLAN: RoutinePlan = {
  purpose: "Learning the protocol",
  intended: ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"],
  building: true,
  madeByUid: "u-sam",
};

const NAMES: Record<string, string> = {
  "m-dip": "Seated Dip",
  "m-leg-press": "Leg Press",
  "m-compound-row": "Compound Row",
  "m-lumbar": "Lumbar",
  "m-abs": "Abdominals",
};
const nameOf = (id: string) => NAMES[id] ?? id;

describe("the plan", () => {
  it("says how far along a routine is and what comes next", () => {
    const p = planProgress(PLAN, ["m-lumbar", "m-compound-row", "m-leg-press"]);
    expect(p).toMatchObject({ have: 3, of: 6, next: "m-dip", complete: false, extras: [] });
    expect(progressLine(p, (id) => ({ "m-dip": "Seated Dip" })[id] ?? id)).toBe("3 of 6 · next: Seated Dip");
  });

  it("says day one while Routine A is empty, since the consult is not Routine A", () => {
    // AJ, Oct 8 2026: "this also counts with the consult visit, sometimes the
    // consult machines will not be the same as their a routine".
    const dayOne = ["m-leg-press", "m-compound-row", "m-lumbar"];
    expect(progressLine(planProgress(PLAN, []), nameOf, dayOne)).toBe("0 of 6 · day one: Leg Press, Compound Row and Lumbar");
    // Once Routine A has a machine, the line counts it and names the next.
    expect(progressLine(planProgress(PLAN, ["m-leg-press"]), nameOf, dayOne)).toBe("1 of 6 · next: Lumbar");
    // An extra alone is a routine with a machine in it, so it is counted, not called day one.
    expect(progressLine(planProgress(PLAN, ["m-abs"]), nameOf, dayOne)).toBe("0 of 6 · next: Lumbar");
    // No day one: the line as before.
    expect(progressLine(planProgress(PLAN, []), nameOf)).toBe("0 of 6 · next: Lumbar");
    expect(progressLine(planProgress(PLAN, []), nameOf, [])).toBe("0 of 6 · next: Lumbar");
    expect(progressLine(planProgress({ intended: [] }, []), nameOf, dayOne)).toBe("No machines planned yet");
  });

  it("runs the routine when it has machines, else the plan's day one, else nothing", () => {
    // AJ, Oct 8 2026: "sometimes the consult machines will not be the same as
    // their a routine". The consult, and any visit while Routine A is empty,
    // runs day one in the order the plan keeps it.
    const planned: RoutinePlan = { ...PLAN, dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"] };
    expect(todayFor({ routine: [], plan: planned })).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(todayFor({ routine: ["m-lumbar", "m-dip"], plan: planned })).toEqual(["m-lumbar", "m-dip"]);
    expect(todayFor({ routine: [], plan: PLAN })).toEqual([]);
    expect(todayFor({ routine: null, plan: null })).toEqual([]);
    expect(todayFor({ routine: undefined, plan: planned })).toEqual(planned.dayOne);
    // Never the whole floor, and a list it hands out is the caller's to change.
    const today = todayFor({ routine: [], plan: planned });
    today.push("m-abs");
    expect(planned.dayOne).toHaveLength(3);
  });

  it("says when a visit runs day one, so nothing offers to put a single machine into an empty Routine A", () => {
    // AJ, Oct 8 2026: "sometimes the consult machines will not be the same as
    // their a routine". One machine in an empty Routine A ("Add to A now")
    // would become everything the consult runs: day one would drop without a
    // word. The Wrap-up starts Routine A.
    const planned: RoutinePlan = { ...PLAN, dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"] };
    expect(runsDayOne({ routine: [], plan: planned })).toBe(true);
    expect(runsDayOne({ routine: null, plan: planned })).toBe(true);
    expect(todayFor({ routine: routineWith(planned, [], ["m-lumbar"]), plan: planned })).toEqual(["m-lumbar"]);
    expect(runsDayOne({ routine: ["m-lumbar"], plan: planned })).toBe(false);
    expect(runsDayOne({ routine: [], plan: PLAN })).toBe(false);
    expect(runsDayOne({ routine: [], plan: { ...PLAN, dayOne: [] } })).toBe(false);
    expect(runsDayOne({ routine: [], plan: null })).toBe(false);
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

  it("keeps day one following the road: out, swapped, started again or re-planned away, and moved as the trainer moves it", () => {
    // AJ, Oct 8 2026: "sometimes the consult machines will not be the same as
    // their a routine": day one is the plan's own list while Routine A is
    // empty, so it must never run a machine the plan has let go.
    const planned: RoutinePlan = { ...PLAN, dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"] };
    expect(applyPlanChange(planned, { kind: "remove", machineIds: ["m-lumbar"] }).dayOne).toEqual(["m-leg-press", "m-compound-row"]);
    expect(applyPlanChange(planned, { kind: "swap", machineIds: ["m-compound-row", "m-simple-row"] }).dayOne).toEqual([
      "m-leg-press",
      "m-simple-row",
      "m-lumbar",
    ]);
    // A swap to a machine already on day one leaves the one going out, never a machine twice.
    expect(applyPlanChange(planned, { kind: "swap", machineIds: ["m-compound-row", "m-leg-press"] }).dayOne).toEqual([
      "m-leg-press",
      "m-lumbar",
    ]);
    expect(
      applyPlanChange(planned, { kind: "replan", machineIds: ["m-compound-row", "m-chest-press", "m-leg-press"], value: "Surgery coming up" })
        .dayOne,
    ).toEqual(["m-leg-press", "m-compound-row"]);
    // A new start (another starting routine on a draft) keeps only day one's machines still on its road.
    expect(applyPlanChange(planned, { kind: "start", machineIds: ["m-compound-row", "m-chest-press", "m-leg-press"] }).dayOne).toEqual([
      "m-leg-press",
      "m-compound-row",
    ]);
    // A Move up on a day-one row of the Lineup is a reorder, and it has to
    // reach the consult: day one takes the order the reorder gives its
    // machines. A screen writes the order it draws, day one first, then On deck.
    const drawn = (dayOne: string[]) => [...dayOne, ...planned.intended.filter((id) => !dayOne.includes(id))];
    // Compound Row moved up on day one: the consult runs it first.
    const movedUp = applyPlanChange(planned, { kind: "reorder", machineIds: drawn(["m-compound-row", "m-leg-press", "m-lumbar"]) });
    expect(movedUp.dayOne).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    expect(movedUp.intended.slice(0, 3)).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    // A move on the deck leaves day one as it was.
    const deckMoved = [...planned.dayOne!, "m-pullover", "m-dip", "m-hip-add"];
    expect(applyPlanChange(planned, { kind: "reorder", machineIds: deckMoved }).dayOne).toEqual(planned.dayOne);
    // Never a machine lost or added: day one keeps exactly its machines.
    expect([...movedUp.dayOne!].sort()).toEqual([...planned.dayOne!].sort());
    // Adding to the road never puts a machine on day one.
    expect(applyPlanChange(planned, { kind: "add", machineIds: ["m-abs"] }).dayOne).toEqual(planned.dayOne);
    // A plan without a day one gets none (never `dayOne: undefined`, which Firestore refuses).
    for (const kind of ["start", "remove", "swap", "reorder", "replan"] as const) {
      expect("dayOne" in applyPlanChange(PLAN, { kind, machineIds: ["m-dip", "m-overhead-press"] }), kind).toBe(false);
    }
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

  /*
   * AJ's answer to "adds on by default" (the research, §2b Q4): "only while
   * the routine is short of its plan ... protects the stability of the
   * client's long-term routine" (the whole-branch review, Oct 9 2026: the
   * switch alone decided, so a finished plan still ticked every one-off in).
   */
  it("stops adding on by default once every planned machine is in, the switch left on", () => {
    const done = { ...PLAN, intended: ["m-lumbar", "m-compound-row", "m-leg-press"] };
    expect(stillBuilding(done, routine)).toBe(false);
    expect(stillBuilding(PLAN, routine)).toBe(true);
    const rows = nextTimeRows({ plan: done, routine, performedToday: ["m-abs"] });
    expect(rows).toEqual([{ machineId: "m-abs", defaultOn: false, why: "added-today" }]);
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

  describe("the consult is not Routine A", () => {
    // AJ, Oct 8 2026, asked whether a walk-in's machines should be ticked into
    // Routine A by default, answered "3a" (unticked) and added: "this also
    // counts with the consult visit, sometimes the consult machines will not
    // be the same as their a routine".
    const DAY_ONE = ["m-leg-press", "m-compound-row", "m-lumbar"];
    const planned: RoutinePlan = { ...PLAN, dayOne: DAY_ONE };

    it("offers every machine of a visit with an empty Routine A unticked, even while the plan is being built", () => {
      const rows = nextTimeRows({ plan: planned, routine: [], performedToday: [...DAY_ONE, "m-dip", "m-abs"] });
      expect(rows).toEqual([
        { machineId: "m-leg-press", defaultOn: false, why: "day-one" },
        { machineId: "m-compound-row", defaultOn: false, why: "day-one" },
        { machineId: "m-lumbar", defaultOn: false, why: "day-one" },
        { machineId: "m-dip", defaultOn: false, why: "planned" },
        { machineId: "m-abs", defaultOn: false, why: "added-today" },
      ]);
      // A plan made before day one existed, or none at all: unticked the same.
      expect(nextTimeRows({ plan: PLAN, routine: [], performedToday: ["m-dip"] })).toEqual([
        { machineId: "m-dip", defaultOn: false, why: "planned" },
      ]);
      expect(nextTimeRows({ plan: null, routine: [], performedToday: ["m-abs"] })).toEqual([
        { machineId: "m-abs", defaultOn: false, why: "added-today" },
      ]);
    });

    it("ticks as before once Routine A has machines and the plan is being built, and calls nothing day one then", () => {
      const rows = nextTimeRows({ plan: planned, routine: ["m-leg-press"], performedToday: ["m-leg-press", "m-lumbar", "m-abs"] });
      expect(rows).toEqual([
        { machineId: "m-lumbar", defaultOn: true, why: "planned" },
        { machineId: "m-abs", defaultOn: true, why: "added-today" },
      ]);
    });

    it("starts Routine A with only the ticked machines, in the road's order", () => {
      // Nothing ticked: Routine A stays empty, and the next visit runs day one again.
      expect(routineAfterWrapUp({ plan: planned, routine: [], ticked: [] })).toEqual([]);
      expect(todayFor({ routine: routineAfterWrapUp({ plan: planned, routine: [], ticked: [] }), plan: planned })).toEqual(DAY_ONE);
      // Not day one's order: every later Wrap-up puts Routine A in the road's
      // order (routineWith), so starting it in day one's would only flip it at
      // the next visit. Routine A follows the road from its first machine; the
      // order effects say, quietly, when two side by side trip a rule.
      const started = routineAfterWrapUp({ plan: planned, routine: [], ticked: ["m-lumbar", "m-leg-press"] });
      expect(started).toEqual(["m-lumbar", "m-leg-press"]);
      expect(routineAfterWrapUp({ plan: planned, routine: started, ticked: ["m-abs"] }).slice(0, 2)).toEqual(started);
      // The plan's order, then what the plan doesn't name, a machine ticked twice kept once.
      expect(
        routineAfterWrapUp({ plan: planned, routine: [], ticked: ["m-abs", "m-pullover", "m-compound-row", "m-dip", "m-dip"] }),
      ).toEqual(["m-compound-row", "m-dip", "m-pullover", "m-abs"]);
      // A plan with no day one: the same.
      expect(routineAfterWrapUp({ plan: PLAN, routine: [], ticked: ["m-leg-press", "m-lumbar"] })).toEqual(["m-lumbar", "m-leg-press"]);
    });

    it("says how far along from the ticks, Routine A counted from nothing", () => {
      const next = routineAfterWrapUp({ plan: planned, routine: [], ticked: ["m-leg-press", "m-compound-row"] });
      expect(progressLine(planProgress(planned, next), nameOf, planned.dayOne)).toBe("2 of 6 · next: Lumbar");
      expect(progressLine(planProgress(planned, []), nameOf, planned.dayOne)).toBe(
        "0 of 6 · day one: Leg Press, Compound Row and Lumbar",
      );
    });
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
    // Two more at once ("sometimes two or three"), as Programming's Swap in makes them.
    const bPlan = { purpose: "", intended: bIntendedOf(A, swaps), swaps, building: false, madeByUid: "uid-sam" };
    const b3 = bSwappedIn(A, bPlan, b1, 2)!.machineIds;
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

/*
 * One rule for which routine is Routine A or B (the whole-branch review, Oct
 * 9 2026): the briefing, Start and B-follows-A took an older seeder's "A";
 * Programming, the drawer and the plan's writers matched "Routine A" only, so
 * a client whose routine was named "A" was offered Start a plan, and Keep
 * made a second Routine A beside it.
 */
describe("which routine is Routine A or B, either spelling", () => {
  it("is found by the profile's helpers and Programming's stand-in as the briefing finds it", () => {
    const legacyA = { id: "r-a", clientId: "c1", name: "A", machineIds: ["m-leg-press"] };
    const legacyB = { id: "r-b", clientId: "c1", name: "b", machineIds: ["m-ext"] };
    expect(savedRoutineA([legacyA, legacyB])?.id).toBe("r-a");
    expect(savedRoutineB([legacyA, legacyB])?.id).toBe("r-b");
    // Programming's stand-in is never drawn beside a routine named "A".
    expect(resolveRoutine([legacyA], "Routine A", "c1", "westlake").id).toBe("r-a");
    expect(resolveRoutine([legacyA], "Routine B", "c1", "westlake").id).toBe("temp-b");
    // A stand-in is never "saved".
    expect(savedRoutineA([{ id: "temp-a", clientId: "c1", name: "Routine A", machineIds: [] }])).toBeNull();
  });
});
