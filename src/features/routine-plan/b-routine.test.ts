/**
 * B, molded in (Round 2 of the design round, item 6), the pure half.
 *
 * AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
 * machine different. But there are times where a trainer might do two
 * machines different or three machines different in a single session", and
 * "So the B routine is now three of the A routine session machines and three
 * of the B routine machines". The research, §5.3: "When A changes during B's
 * build-out, the machines B hasn't swapped yet follow A (they are A's), and
 * B's own swaps stay" — which nothing wrote until this round (the critic's
 * #25).
 */
import { describe, expect, it } from "vitest";
import type { Routine, WorkoutSession } from "../../types";
import {
  B_PURPOSE_WORDS,
  B_START,
  B_SWAP_KEPT,
  B_SWAP_MADE,
  B_SWAP_PLANNED,
  aRunsLine,
  aRunsSince,
  alternateLine,
  bColumnOf,
  bFollowOf,
  bFollowsA,
  bIntendedOf,
  bPurposeChanged,
  bPurposeOf,
  bRoadGroups,
  bRoutineOf,
  bSlotKept,
  bSlotPlanned,
  bStatus,
  bStatusLine,
  bSwapChoices,
  bSwapWait,
  bSwappedIn,
  bSwapsAfterA,
  bSwitchStep,
  bToggleOpensPlanB,
  isBPlan,
  startBPlan,
  suggestBSwaps,
  swapsReady,
  usableSwaps,
} from "./b-routine";
import { planChangeWhat } from "./changes-list";
import type { FloorMachine } from "./starting-plan";
import type { CantDo, PlanSwap, RoutinePlan } from "./types";

const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));
const nameOf = (id: string) => id.replace(/^m-/, "").replace(/-/g, " ");
const TODAY = "2026-10-09";
const who = { uid: "uid-sam", name: "Sam Lee" };

const A = ["m-leg-press", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add"];
const SWAPS: PlanSwap[] = [
  { replaces: "m-leg-press", with: "m-ext" },
  { replaces: "m-compound-row", with: "m-simple-row" },
  { replaces: "m-hip-add", with: "m-hip-abd" },
];
const bPlanOf = (swaps: PlanSwap[] = SWAPS, a: readonly string[] = A): RoutinePlan => ({
  purpose: B_PURPOSE_WORDS.variety,
  purposeKinds: ["variety"],
  intended: bIntendedOf(a, swaps),
  swaps,
  building: false,
  madeByUid: "uid-sam",
});

describe("B follows A (the critic's #25)", () => {
  it("A's change reaches B's unswapped places, and never B's swaps", () => {
    const b1 = bRoutineOf(A, SWAPS, 1); // Leg Extension in for Leg Press
    const aNew = A.map((id) => (id === "m-chest-press" ? "m-overhead-press" : id));
    const after = bFollowsA(aNew, bPlanOf(), b1, A);
    expect(after).toEqual(["m-ext", "m-compound-row", "m-overhead-press", "m-lumbar", "m-hip-add"]);
    // B's own swap stays where it was; the swap after it still waits.
    expect(after).toContain("m-ext");
    expect(after).not.toContain("m-leg-press");
    expect(after).not.toContain("m-simple-row");
  });

  it("a machine A gains joins B where A has it; one A drops leaves B", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const aNew = ["m-leg-press", "m-pulldown", "m-compound-row", "m-chest-press", "m-hip-add"]; // Lumbar out, Pulldown in
    expect(bFollowsA(aNew, bPlanOf(), b1, A)).toEqual(["m-ext", "m-pulldown", "m-compound-row", "m-chest-press", "m-hip-add"]);
  });

  it("keeps a machine B holds of its own, and never names one machine twice", () => {
    const b1 = [...bRoutineOf(A, SWAPS, 1), "m-abs"]; // Abs put into B by hand
    const aNew = [...A, "m-ext"]; // A gains B's own swap machine
    const after = bFollowsA(aNew, bPlanOf(), b1, A);
    expect(after.filter((id) => id === "m-ext")).toHaveLength(1);
    expect(after).toContain("m-abs");
    expect(after).not.toContain("m-leg-press");
  });

  it("bFollowOf: only a change to Routine A, only a Routine B with a plan of swaps, only when something moves", () => {
    const a: Routine = { id: "rA", name: "Routine A", clientId: "c1", machineIds: A };
    const b: Routine = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(A, SWAPS, 1), plan: bPlanOf() };
    const aNew = A.filter((id) => id !== "m-lumbar");
    const follow = bFollowOf([a, b], "rA", aNew);
    expect(follow).toEqual({
      routineId: "rB",
      machineIds: ["m-ext", "m-compound-row", "m-chest-press", "m-hip-add"],
      intended: ["m-ext", "m-simple-row", "m-chest-press", "m-hip-abd"],
    });
    // A change to Routine B itself, or one that moves nothing, writes nothing to B.
    expect(bFollowOf([a, b], "rB", aNew)).toBeNull();
    expect(bFollowOf([a, b], "rA", A)).toBeNull();
    // A Routine B of its own from before Round 2 (no plan of swaps) is the trainer's list: left alone.
    const ownB: Routine = { id: "rB", name: "Routine B", clientId: "c1", machineIds: ["m-ext"] };
    expect(bFollowOf([a, ownB], "rA", aNew)).toBeNull();
    // No saved Routine B: nothing.
    expect(bFollowOf([a], "rA", aNew)).toBeNull();
  });
});

describe("B follows A, the review of Round 2: B never grows past A, and never loses a machine nobody chose", () => {
  it("A gaining a machine B planned to swap in never makes that swap: B keeps the A machine, the count stays", () => {
    // Simple Row is B's next swap (for Compound Row); A takes it from its own road.
    const b1 = bRoutineOf(A, SWAPS, 1);
    const aNew = [...A, "m-simple-row"];
    const after = bFollowsA(aNew, bPlanOf(), b1, A);
    expect(after).toEqual(["m-ext", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add", "m-simple-row"]);
    expect(bStatus(SWAPS, after)).toMatchObject({ made: 1, of: 3 });
    // The column draws each machine once: Compound Row still B's next place, Simple Row following A.
    const col = bColumnOf(aNew, bPlanOf(), after);
    expect(col.rows.map((r) => [r.aId, r.kind])).toEqual([
      ["m-leg-press", "own"],
      ["m-compound-row", "next"],
      ["m-chest-press", "follows"],
      ["m-lumbar", "follows"],
      ["m-hip-add", "follows"],
      ["m-simple-row", "follows"],
    ]);
    expect(col.extras).toEqual([]);
    // The swap waits (Swap in would only take a machine out of B), and the next change to A keeps Compound Row.
    expect(bSwapWait(SWAPS[1]!, aNew)).toBe("in-a");
    expect(swapsReady(aNew, SWAPS, after)).toBe(0);
    expect(bSwappedIn(aNew, bPlanOf(), after, 1)).toBeNull();
    const again = bFollowsA([...aNew].reverse(), bPlanOf(), after, aNew);
    expect(again).toContain("m-compound-row");
  });

  it("A replacing the machine a swap is for, at its place: the swap follows the place, and B stays A's length", () => {
    // B swapped Leg Extension in for Leg Press; A swaps Leg Press for Leg Curl.
    const b1 = bRoutineOf(A, SWAPS, 1);
    const aNew = A.map((id) => (id === "m-leg-press" ? "m-leg-curl" : id));
    const after = bFollowsA(aNew, bPlanOf(), b1, A);
    expect(after).toEqual(["m-ext", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add"]);
    expect(after).toHaveLength(aNew.length);
    expect(bSwapsAfterA(A, aNew, SWAPS)[0]).toEqual({ replaces: "m-leg-curl", with: "m-ext" });
    // A waiting swap follows its place too: "next: Simple Row for Pulldown".
    const aPull = A.map((id) => (id === "m-compound-row" ? "m-pulldown" : id));
    const swaps = bSwapsAfterA(A, aPull, SWAPS);
    expect(swaps[1]).toEqual({ replaces: "m-pulldown", with: "m-simple-row" });
    const b = bFollowsA(aPull, bPlanOf(), b1, A);
    expect(b).toEqual(["m-ext", "m-pulldown", "m-chest-press", "m-lumbar", "m-hip-add"]);
    expect(bSwappedIn(aPull, { ...bPlanOf(), swaps }, b, 1)!.machineIds).toEqual(["m-ext", "m-simple-row", "m-chest-press", "m-lumbar", "m-hip-add"]);
  });

  it("bFollowOf writes B's swaps when one followed its place", () => {
    const a: Routine = { id: "rA", name: "Routine A", clientId: "c1", machineIds: A };
    const b: Routine = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(A, SWAPS, 1), plan: bPlanOf() };
    const aNew = A.map((id) => (id === "m-leg-press" ? "m-leg-curl" : id));
    const follow = bFollowOf([a, b], "rA", aNew)!;
    expect(follow.machineIds).toEqual(["m-ext", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add"]);
    expect(follow.swaps).toEqual([{ replaces: "m-leg-curl", with: "m-ext" }, SWAPS[1], SWAPS[2]]);
    expect(follow.intended).toEqual(["m-ext", "m-simple-row", "m-chest-press", "m-lumbar", "m-hip-abd"]);
    // A move that replaces nothing writes no swaps.
    expect(bFollowOf([a, b], "rA", [...A].reverse())!.swaps).toBeUndefined();
  });

  it("A taking a machine B already swapped in: drawn once, at A's own place", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const aNew = [...A, "m-ext"];
    const after = bFollowsA(aNew, bPlanOf(), b1, A);
    expect(after.filter((id) => id === "m-ext")).toHaveLength(1);
    const col = bColumnOf(aNew, bPlanOf(), after);
    expect(col.rows.filter((r) => r.bId === "m-ext")).toHaveLength(1);
    expect(col.rows.find((r) => r.aId === "m-leg-press")!.kind).toBe("missing");
    expect(bStatus(SWAPS, after).made).toBe(1);
  });

  it("a next swap whose A machine left A waits: Swap in never adds a machine to B", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const aNow = A.filter((id) => id !== "m-compound-row");
    const b = bFollowsA(aNow, bPlanOf(), b1, A);
    expect(b).toEqual(["m-ext", "m-chest-press", "m-lumbar", "m-hip-add"]);
    expect(bSwapWait(SWAPS[1]!, aNow)).toBe("gone");
    expect(swapsReady(aNow, SWAPS, b)).toBe(0);
    expect(bSwappedIn(aNow, bPlanOf(), b, 1)).toBeNull();
    expect(bColumnOf(aNow, bPlanOf(), b).gone).toEqual([SWAPS[1]]);
  });

  it("a place a trainer took out of B stays out when A moves, and when a swap goes in", () => {
    const b1 = bRoutineOf(A, SWAPS, 1).filter((id) => id !== "m-lumbar");
    const reordered = ["m-compound-row", "m-leg-press", "m-chest-press", "m-lumbar", "m-hip-add"];
    expect(bFollowsA(reordered, bPlanOf(), b1, A)).toEqual(["m-compound-row", "m-ext", "m-chest-press", "m-hip-add"]);
    expect(bSwappedIn(A, bPlanOf(), b1, 1)!.machineIds).toEqual(["m-ext", "m-simple-row", "m-chest-press", "m-hip-add"]);
  });

  it("A's machines still to come (its road) are never offered for B", () => {
    const aIntended = [...A, "m-pulldown", "m-simple-row"];
    const suggested = suggestBSwaps({ aRoutine: A, aIntended, floor: ALL });
    expect(suggested.map((s) => s.with)).not.toContain("m-pulldown");
    expect(suggested.map((s) => s.with)).not.toContain("m-simple-row");
    expect(usableSwaps({ swaps: SWAPS, aRoutine: A, aIntended, floor: ALL, todayYmd: TODAY }).map((s) => s.with)).toEqual(["m-ext", "m-hip-abd"]);
    const choices = bSwapChoices({ aId: "m-compound-row", aRoutine: A, aIntended, bPlan: bPlanOf(), floor: ALL, todayYmd: TODAY });
    expect(choices.same).not.toContain("m-pulldown");
    const started = startBPlan({ aRoutine: A, aPlan: { intended: aIntended }, floor: ALL, purpose: "variety", swaps: SWAPS, who, todayYmd: TODAY })!;
    expect(started.plan.swaps!.map((s) => s.with)).toEqual(["m-ext", "m-hip-abd"]);
  });

  it("the B switch: Plan B only off routines that have answered", () => {
    expect(bSwitchStep(true, null, true)).toBe("plan-b");
    expect(bSwitchStep(true, { machineIds: [] }, true)).toBe("plan-b");
    expect(bSwitchStep(true, { machineIds: ["m-ext"] }, true)).toBe("switch");
    expect(bSwitchStep(false, null, true)).toBe("switch");
    // Not read yet, or the read failed: never "no Routine B".
    expect(bSwitchStep(true, null, false)).toBe("cant-tell");
    expect(bSwitchStep(false, null, false)).toBe("switch");
  });
});

describe("starting B: a copy of A with one machine different", () => {
  it("Routine B starts as A with the first swap, its plan holding B whole", () => {
    const started = startBPlan({ aRoutine: A, aPlan: null, floor: ALL, purpose: "variety", swaps: SWAPS, who, todayYmd: TODAY })!;
    expect(started.machineIds.filter((id, i) => id !== A[i])).toEqual(["m-ext"]);
    expect(started.machineIds).toHaveLength(A.length);
    expect(started.plan).toMatchObject({
      purpose: "Variety: the same regions, different machines",
      purposeKinds: ["variety"],
      intended: ["m-ext", "m-simple-row", "m-chest-press", "m-lumbar", "m-hip-abd"],
      swaps: SWAPS,
      building: false,
      madeByUid: "uid-sam",
      madeByName: "Sam Lee",
      madeAt: TODAY,
    });
    expect(started.change).toEqual({ kind: "start", machineIds: ["m-leg-press", "m-ext"], value: B_START });
    // Firestore refuses undefined: nothing on the plan is undefined.
    expect(Object.values(started.plan).some((v) => v === undefined)).toBe(false);
  });

  it("recovery, both: the purpose's words and kinds", () => {
    const r = startBPlan({ aRoutine: A, floor: ALL, purpose: "recovery", swaps: SWAPS, who, todayYmd: TODAY })!;
    expect(r.plan.purpose).toBe("Recovery: a region twice a week, its heaviest work split");
    const both = startBPlan({ aRoutine: A, floor: ALL, purpose: "both", swaps: SWAPS, who, todayYmd: TODAY })!;
    expect(both.plan.purposeKinds).toEqual(["variety", "recovery"]);
    expect(bPurposeOf(both.plan)).toBe("both");
  });

  it("nothing to keep: no A machines, or no swap A can take", () => {
    expect(startBPlan({ aRoutine: [], floor: ALL, purpose: "variety", swaps: SWAPS, who, todayYmd: TODAY })).toBeNull();
    expect(startBPlan({ aRoutine: A, floor: ALL, purpose: "variety", swaps: [{ replaces: "m-abs", with: "m-ext" }], who, todayYmd: TODAY })).toBeNull();
  });

  it("the plan's can't-do is B's too: a held machine is never kept or suggested (AJ's '2a')", () => {
    const held: CantDo[] = [{ machineId: "m-ext", until: "cleared", day: TODAY, byUid: "uid-sam" }];
    const kept = usableSwaps({ swaps: SWAPS, aRoutine: A, floor: ALL, cantDo: held, todayYmd: TODAY });
    expect(kept.map((s) => s.with)).toEqual(["m-simple-row", "m-hip-abd"]);
    const started = startBPlan({ aRoutine: A, aPlan: { cantDo: held }, floor: ALL, purpose: "variety", swaps: SWAPS, who, todayYmd: TODAY })!;
    expect(started.machineIds).not.toContain("m-ext");
    expect(suggestBSwaps({ aRoutine: A, floor: ALL, cantDo: held, todayYmd: TODAY }).map((s) => s.with)).not.toContain("m-ext");
    // A mark that has ended is no longer held.
    const ended: CantDo[] = [{ machineId: "m-ext", until: "2026-10-01", day: "2026-09-20", byUid: "uid-sam" }];
    expect(usableSwaps({ swaps: SWAPS, aRoutine: A, floor: ALL, cantDo: ended, todayYmd: TODAY })).toHaveLength(3);
  });

  it("turning B on with nothing in B opens Plan B, never an empty Routine B (the critic's #22)", () => {
    expect(bToggleOpensPlanB(true, null)).toBe(true);
    expect(bToggleOpensPlanB(true, { machineIds: [] })).toBe(true);
    expect(bToggleOpensPlanB(true, { machineIds: ["m-ext"] })).toBe(false);
    expect(bToggleOpensPlanB(false, null)).toBe(false);
  });

  it("only a plan of swaps is B's", () => {
    expect(isBPlan(bPlanOf())).toBe(true);
    expect(isBPlan({ ...bPlanOf(), swaps: undefined })).toBe(false);
    expect(isBPlan(null)).toBe(false);
  });
});

describe("how often A has run, said, never enforced", () => {
  const s = (routineId: string, date: string, status: "Completed" | "In-Progress" = "Completed") =>
    ({ routineId, date, status }) as Pick<WorkoutSession, "routineId" | "status" | "date">;
  const sessions = [s("rA", "2026-09-01"), s("rA", "2026-09-08"), s("rB", "2026-09-10"), s("rA", "2026-10-01"), s("rA", "2026-10-09", "In-Progress")];

  it("counts Routine A's completed sessions, from a day when given", () => {
    expect(aRunsSince(sessions, "rA")).toBe(3);
    expect(aRunsSince(sessions, "rA", "2026-09-05")).toBe(2);
    expect(aRunsSince(sessions, null)).toBe(0);
  });

  it("always says 'in Journey'; 'at least' with only part read; nothing for a zero not known", () => {
    expect(aRunsLine(7, false, "complete")).toBe("Routine A has run 7 times in Journey.");
    expect(aRunsLine(1, false, "complete")).toBe("Routine A has run 1 time in Journey.");
    expect(aRunsLine(12, true, "complete")).toBe("Routine A has run at least 12 times in Journey.");
    expect(aRunsLine(0, false, "complete")).toBe("Routine A hasn't run in Journey yet.");
    expect(aRunsLine(0, true, "complete")).toBeNull();
  });

  it("for a client who trained before Journey: a zero says nothing, a count says sessions before aren't counted", () => {
    // The review of Round 2: "hasn't run in Journey yet" beside "5 to 7 runs
    // of A" reads as too early for B to a client who may have run A for
    // years before Journey (docs/business/migration-and-prior-history.md).
    expect(aRunsLine(0, false, "partial")).toBeNull();
    expect(aRunsLine(0, false)).toBeNull(); // no coverage given: the cautious answer
    expect(aRunsLine(3, false, "partial")).toBe("Routine A has run 3 times in Journey. Sessions before Journey aren't counted.");
    expect(aRunsLine(3, true, "unknown")).toBe("Routine A has run at least 3 times in Journey. Sessions before Journey aren't counted.");
  });
});

describe("the A | B lineup's column", () => {
  it("follows A, B's own, the next swap, and what B lost", () => {
    const b = bRoutineOf(A, SWAPS, 1).filter((id) => id !== "m-lumbar");
    const col = bColumnOf(A, bPlanOf(), b);
    expect(col.rows.map((r) => [r.aId, r.kind, r.bId])).toEqual([
      ["m-leg-press", "own", "m-ext"],
      ["m-compound-row", "next", "m-compound-row"],
      ["m-chest-press", "follows", "m-chest-press"],
      ["m-lumbar", "missing", null],
      ["m-hip-add", "follows", "m-hip-add"],
    ]);
    expect(col.rows[4]!.swap).toEqual(SWAPS[2]);
    expect(col.status).toMatchObject({ made: 1, of: 3 });
  });

  it("a swap whose A machine left A, and a machine of B's own, are B's extras", () => {
    const b = [...bRoutineOf(A, SWAPS, 1), "m-abs"];
    const aNow = A.filter((id) => id !== "m-leg-press");
    const col = bColumnOf(aNow, bPlanOf(), b);
    expect(col.extras).toEqual([
      { id: "m-ext", for: "m-leg-press" },
      { id: "m-abs", for: null },
    ]);
  });

  it("the head's words", () => {
    expect(bStatusLine(bStatus(SWAPS, bRoutineOf(A, SWAPS, 2)), nameOf)).toBe("B · 2 of 3 swaps · next: hip abd for hip add");
    expect(bStatusLine(bStatus(SWAPS, bRoutineOf(A, SWAPS, 3)), nameOf)).toBe("B · all 3 swaps in");
    expect(bStatusLine(bStatus([], A), nameOf)).toBe("B · no swaps planned");
    expect(alternateLine(true)).toBe("A and B alternate · next session is B");
    expect(alternateLine(false)).toBe("A and B alternate · next session is A");
    expect(alternateLine(null)).toBeNull();
  });
});

describe("B's changes", () => {
  it("Swap in the next one: B with one more swap, one 'swap' change, the plan as it was", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const edit = bSwappedIn(A, bPlanOf(), b1, 1)!;
    expect(edit.machineIds).toEqual(bRoutineOf(A, SWAPS, 2));
    expect(edit.changes).toEqual([{ kind: "swap", machineIds: ["m-compound-row", "m-simple-row"], value: B_SWAP_MADE }]);
    expect(edit.plan).toEqual(bPlanOf());
  });

  it("two at once (AJ: 'sometimes two or three'): a change for each; none when B is built", () => {
    const b1 = [...bRoutineOf(A, SWAPS, 1), "m-abs"];
    const edit = bSwappedIn(A, bPlanOf(), b1, 2)!;
    expect(edit.machineIds).toEqual([...bRoutineOf(A, SWAPS, 3), "m-abs"]);
    expect(edit.changes.map((c) => c.machineIds[1])).toEqual(["m-simple-row", "m-hip-abd"]);
    expect(bSwappedIn(A, bPlanOf(), bRoutineOf(A, SWAPS, 3), 1)).toBeNull();
  });

  it("never swaps in a machine the client can't do: the swaps stop before it (AJ's '2a')", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    expect(swapsReady(A, SWAPS, b1, ["m-hip-abd"])).toBe(1);
    const two = bSwappedIn(A, bPlanOf(), b1, 2, ["m-hip-abd"])!;
    expect(two.changes.map((c) => c.machineIds[1])).toEqual(["m-simple-row"]);
    expect(two.machineIds).not.toContain("m-hip-abd");
    // The next one held: nothing goes in until its place's swap is changed.
    expect(swapsReady(A, SWAPS, b1, ["m-simple-row"])).toBe(0);
    expect(bSwappedIn(A, bPlanOf(), b1, 1, ["m-simple-row"])).toBeNull();
  });

  it("a place's planned swap changed: the plan only while it waits, B too once it is in", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const later = bSlotPlanned({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b1, aId: "m-hip-add", to: "m-leg-curl" })!;
    expect(later.machineIds).toEqual(b1);
    expect(later.plan.swaps![2]).toEqual({ replaces: "m-hip-add", with: "m-leg-curl" });
    // B's road takes the new machine at the place, and lets the old one go
    // (the review of Round 2: Hip Abduction stayed on the road as an "extra").
    expect(later.plan.intended).toEqual(["m-ext", "m-simple-row", "m-chest-press", "m-lumbar", "m-leg-curl"]);
    expect(later.changes).toEqual([{ kind: "swap", machineIds: ["m-hip-add", "m-leg-curl"], value: B_SWAP_PLANNED }]);

    const inB = bSlotPlanned({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b1, aId: "m-leg-press", to: "m-leg-curl" })!;
    expect(inB.machineIds[0]).toBe("m-leg-curl");

    // A place with no swap yet gets one, last in the order.
    const added = bSlotPlanned({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b1, aId: "m-chest-press", to: "m-dip" })!;
    expect(added.plan.swaps!.at(-1)).toEqual({ replaces: "m-chest-press", with: "m-dip" });
    expect(bSlotPlanned({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b1, aId: "m-leg-press", to: "m-ext" })).toBeNull();
  });

  it("B keeps A's machine: its swap leaves the plan, and a swap already in B gives the place back", () => {
    const b2 = bRoutineOf(A, SWAPS, 2);
    const kept = bSlotKept({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b2, aId: "m-leg-press" })!;
    expect(kept.machineIds[0]).toBe("m-leg-press");
    expect(kept.plan.swaps).toEqual([SWAPS[1], SWAPS[2]]);
    expect(kept.changes).toEqual([{ kind: "swap", machineIds: ["m-leg-press"], value: B_SWAP_KEPT }]);
    expect(bStatus(kept.plan.swaps!, kept.machineIds).made).toBe(1);
    // B's road keeps Leg Press at its place and lets Leg Extension go.
    expect(kept.plan.intended).toEqual(["m-leg-press", "m-simple-row", "m-chest-press", "m-lumbar", "m-hip-abd"]);
    expect(bSlotKept({ aRoutine: A, bPlan: bPlanOf(), bRoutine: b2, aId: "m-lumbar" })).toBeNull();
  });

  it("a machine B's road holds of its own stays on the road when a swap changes", () => {
    const plan = { ...bPlanOf(), intended: [...bIntendedOf(A, SWAPS), "m-abs"] };
    const later = bSlotPlanned({ aRoutine: A, bPlan: plan, bRoutine: bRoutineOf(A, SWAPS, 1), aId: "m-hip-add", to: "m-leg-curl" })!;
    expect(later.plan.intended).toEqual(["m-ext", "m-simple-row", "m-chest-press", "m-lumbar", "m-leg-curl", "m-abs"]);
  });

  it("B is for: a 'purpose' change with the words, the kinds on the plan", () => {
    const edit = bPurposeChanged(bPlanOf(), A, "recovery");
    expect(edit.plan.purposeKinds).toEqual(["recovery"]);
    expect(edit.changes).toEqual([{ kind: "purpose", machineIds: [], value: B_PURPOSE_WORDS.recovery }]);
  });

  it("the Changes list says each of B's moves in words", () => {
    const words = { nameOf, routineName: "Routine B" };
    expect(planChangeWhat({ kind: "start", machineIds: ["m-leg-press", "m-ext"], value: B_START }, words)).toBe("Started B: ext for leg press");
    expect(planChangeWhat({ kind: "swap", machineIds: ["m-leg-press", "m-ext"], value: B_SWAP_MADE }, words)).toBe("Swapped ext in for leg press");
    expect(planChangeWhat({ kind: "swap", machineIds: ["m-hip-add", "m-leg-curl"], value: B_SWAP_PLANNED }, words)).toBe("B's swap for hip add: leg curl");
    expect(planChangeWhat({ kind: "swap", machineIds: ["m-leg-press"], value: B_SWAP_KEPT }, words)).toBe("B keeps leg press");
    // Routine A's own swap still reads as it did.
    expect(planChangeWhat({ kind: "swap", machineIds: ["m-dip", "m-chest-fly"] }, words)).toBe("chest fly instead of dip");
  });
});

describe("a place's choices in B", () => {
  it("the same family on this floor, never A's, another swap's, or one the client can't do; one-machine substitutes", () => {
    const held: CantDo[] = [{ machineId: "m-pullover", until: "cleared", day: TODAY, byUid: "uid-sam" }];
    const choices = bSwapChoices({ aId: "m-compound-row", aRoutine: A, bPlan: bPlanOf(), floor: ALL, cantDo: held, todayYmd: TODAY });
    expect(choices.current).toBe("m-simple-row");
    expect(choices.same).toContain("m-simple-row");
    expect(choices.same).toContain("m-pulldown");
    expect(choices.same).not.toContain("m-compound-row");
    expect(choices.same).not.toContain("m-pullover");
    const press = bSwapChoices({ aId: "m-chest-press", aRoutine: A, bPlan: bPlanOf(), floor: ALL, todayYmd: TODAY });
    expect(press.same).toContain("m-overhead-press");
    // Another place's planned machine is never offered here.
    expect(bSwapChoices({ aId: "m-leg-press", aRoutine: A, bPlan: bPlanOf(), floor: ALL, todayYmd: TODAY }).same).not.toContain("m-hip-abd");
  });
});

describe("the briefing's glance for a session on B", () => {
  it("today under the bracket, the swaps still to come, the next one first", () => {
    const b1 = bRoutineOf(A, SWAPS, 1);
    const groups = bRoadGroups({ bPlan: bPlanOf(), today: b1, bRoutine: b1, todayYmd: TODAY, nameOf, firstName: "Tom" });
    expect(groups.map((g) => g.key)).toEqual(["today", "then"]);
    expect(groups[0]!.stations.map((s) => s.id)).toEqual(b1);
    expect(groups[1]!.stations).toEqual([
      { id: "m-simple-row", kind: "next", mark: "Next stop · for compound row" },
      { id: "m-hip-abd", kind: "planned", mark: "for hip add" },
    ]);
  });
});
