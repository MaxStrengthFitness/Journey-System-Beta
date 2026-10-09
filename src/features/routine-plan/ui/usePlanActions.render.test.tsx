// @vitest-environment jsdom
/**
 * THE PLAN'S WRITES FROM THE PROFILE, MOUNTED (usePlanActions; the design
 * round, Oct 8 2026, §4.3). The screens' render tests stub these actions;
 * this is the real hook over a recorded `store.ts` and journal writer:
 *   - a tap never waits on the network: Keep issues ONE `startPlan` with an
 *     EMPTY Routine A (the consult is not Routine A), and the profile's
 *     routines are patched before the batch has even answered;
 *   - a refusal is said, and the profile reads its routines again;
 *   - the Health note a surgery or an injury asks for is filed as Health,
 *     with the flavour as its category and the composer's loudness, signed
 *     with the Auth uid;
 *   - B, molded in (Round 2): a change that moves Routine A's machines
 *     takes Routine B with it in the same batch when B has a plan of swaps,
 *     both drawn at once; Start B is ONE batch (`startRoutineB`), Routine B
 *     drawn before it answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  startPlan: vi.fn(),
  startRoutineB: vi.fn(),
  savePlanChange: vi.fn(),
  readPlanChanges: vi.fn(),
}));
const journal = vi.hoisted(() => ({ createJournalEntry: vi.fn() }));

vi.mock("../../../firebase", () => ({ db: { __fake: true } }));
vi.mock("../store", () => store);
vi.mock("../../../hooks/useClientJournal", () => journal);

import type { Routine } from "../../../types";
import { DEFAULT_IMPORTANCE } from "../../client-notes/note-catalog";
import type { RoutinePlan } from "../types";
import type { PlanActions } from "./host";
import { usePlanActions, type PlanActionsInput } from "./usePlanActions";

const PLAN: RoutinePlan = {
  purpose: "Learning the protocol: the starting routine",
  intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"],
  dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
  building: true,
  templateId: "academy-low-back",
  madeByUid: "uid-sam",
};

/** A promise this test settles by hand, so "before the commit answers" is a moment it can look at. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let root: Root | null = null;
let el: HTMLElement | null = null;
let actions: PlanActions;
let routines: Routine[];
const said: string[] = [];
let refused = 0;

function Host({ initial, author = { id: "uid-sam", initials: "SL", fullName: "Sam Lee" } }: { initial: Routine[]; author?: PlanActionsInput["author"] }) {
  const [list, setList] = useState<Routine[]>(initial);
  routines = list;
  actions = usePlanActions({
    clientId: "c1",
    studioId: "westlake",
    routines: list,
    setRoutines: setList,
    onError: (m) => said.push(m),
    onRefused: () => {
      refused += 1;
    },
    author,
  });
  return null;
}

async function mount(initial: Routine[], author?: PlanActionsInput["author"]) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<Host initial={initial} author={author} />);
  });
}

beforeEach(() => {
  store.startPlan.mockReset();
  store.startRoutineB.mockReset();
  store.savePlanChange.mockReset();
  store.readPlanChanges.mockReset();
  journal.createJournalEntry.mockReset();
  said.length = 0;
  refused = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe("Keep this lineup: one start, never awaited", () => {
  it("issues ONE startPlan with an empty Routine A, and the profile draws it before the commit answers", async () => {
    const commit = deferred();
    store.startPlan.mockReturnValue({ routineId: "r-new", commit: commit.promise });
    await mount([{ id: "temp-a", name: "Routine A", clientId: "c1", machineIds: [] } as Routine]);

    await act(async () => {
      actions.start({ routineId: null, machineIds: [], plan: PLAN, change: { kind: "start", machineIds: PLAN.intended, byUid: "uid-sam" } });
    });

    expect(store.startPlan).toHaveBeenCalledTimes(1);
    const [, input] = store.startPlan.mock.calls[0];
    expect(input).toMatchObject({ routineId: null, clientId: "c1", studioId: "westlake", name: "Routine A", machineIds: [], plan: PLAN });
    // The commit hasn't answered, and Routine A is already drawn: the
    // stand-in gone, the plan on it, Routine A empty and stamped.
    expect(routines.map((r) => r.id)).toEqual(["r-new"]);
    expect(routines[0]).toMatchObject({ name: "Routine A", machineIds: [], plan: PLAN });
    expect(routines[0].createdAt).toBeTruthy();
    expect(said).toEqual([]);

    await act(async () => commit.resolve());
    expect(said).toEqual([]);
    expect(refused).toBe(0);
  });

  it("puts the plan on the Routine A the client has", async () => {
    store.startPlan.mockReturnValue({ routineId: "r-a", commit: Promise.resolve() });
    await mount([{ id: "r-a", name: "Routine A", clientId: "c1", machineIds: ["m-leg-press"], createdAt: 1 } as Routine]);
    await act(async () => {
      actions.start({ routineId: "r-a", machineIds: ["m-leg-press"], plan: PLAN, change: { kind: "start", machineIds: ["m-leg-press"], byUid: "uid-sam" } });
    });
    expect(routines).toHaveLength(1);
    expect(routines[0]).toMatchObject({ id: "r-a", machineIds: ["m-leg-press"], plan: PLAN, createdAt: 1 });
  });

  it("a refused commit is said, and the routines are read again", async () => {
    const commit = deferred();
    store.startPlan.mockReturnValue({ routineId: "r-new", commit: commit.promise });
    await mount([]);
    await act(async () => {
      actions.start({ routineId: null, machineIds: [], plan: PLAN, change: { kind: "start", machineIds: PLAN.intended, byUid: "uid-sam" } });
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      commit.reject(new Error("permission-denied"));
    });
    quiet.mockRestore();
    expect(said).toEqual(["Couldn't save that change to the plan. Check the connection and try again."]);
    expect(refused).toBe(1);
  });

  /*
   * A and B together (the studio's `newClientsStart`, item 8; AJ, Oct 7 2026:
   * "Some studios may start building an A and B routine immediately for a
   * client"): Keep hands the planned B to the same startPlan, ONE batch, and
   * the profile draws both routines at once, Routine B with no machines (the
   * consult is not Routine A, and B is a copy of A).
   */
  it("keeps B planned beside the lineup in the same startPlan, Routine B drawn empty with its plan", async () => {
    const B_PLAN: RoutinePlan = {
      purpose: "Variety: the same regions, different machines",
      purposeKinds: ["variety"],
      intended: ["m-ext", "m-compound-row", "m-lumbar", "m-chest-press"],
      swaps: [{ replaces: "m-leg-press", with: "m-ext" }],
      building: false,
      madeByUid: "uid-sam",
    };
    store.startPlan.mockReturnValue({ routineId: "r-a", bRoutineId: "r-b", commit: Promise.resolve() });
    await mount([
      { id: "temp-a", name: "Routine A", clientId: "c1", machineIds: [] } as Routine,
      { id: "temp-b", name: "Routine B", clientId: "c1", machineIds: [] } as Routine,
    ]);
    const bChange = { kind: "start" as const, machineIds: ["m-leg-press", "m-ext"], value: "B planned", byUid: "uid-sam" };
    await act(async () => {
      actions.start({
        routineId: null,
        machineIds: [],
        plan: PLAN,
        change: { kind: "start", machineIds: PLAN.intended, byUid: "uid-sam" },
        b: { routineId: null, plan: B_PLAN, change: bChange },
      });
    });
    expect(store.startPlan).toHaveBeenCalledTimes(1);
    const [, , b] = store.startPlan.mock.calls[0];
    expect(b).toEqual({ routineId: null, plan: B_PLAN, change: bChange });
    expect(routines.map((r) => [r.id, r.name, r.machineIds])).toEqual([
      ["r-a", "Routine A", []],
      ["r-b", "Routine B", []],
    ]);
    expect(routines[1].plan).toEqual(B_PLAN);
  });
});

describe("a change on the Lineup", () => {
  it("issues savePlanChange and patches the routine's plan and machines at once", async () => {
    const commit = deferred();
    store.savePlanChange.mockReturnValue(commit.promise);
    await mount([{ id: "r-a", name: "Routine A", clientId: "c1", machineIds: ["m-leg-press"], plan: PLAN } as Routine]);
    const next: RoutinePlan = { ...PLAN, purpose: "The core" };
    await act(async () => {
      actions.save("r-a", { plan: next, change: { kind: "purpose", machineIds: [], value: "The core", byUid: "uid-sam" }, machineIds: ["m-leg-press", "m-lumbar"] });
    });
    expect(store.savePlanChange).toHaveBeenCalledTimes(1);
    expect(store.savePlanChange.mock.calls[0][1]).toBe("r-a");
    expect(routines[0]).toMatchObject({ plan: next, machineIds: ["m-leg-press", "m-lumbar"] });

    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => commit.reject(new Error("offline")));
    quiet.mockRestore();
    expect(said).toHaveLength(1);
    expect(refused).toBe(1);
  });
});

describe("the Health note a surgery or an injury asks for", () => {
  it("is filed as Health, the flavour its category, at the composer's loudness, signed with the Auth uid", async () => {
    journal.createJournalEntry.mockResolvedValue("j1");
    await mount([]);
    await act(async () => {
      actions.healthNote({ machineId: "m-dip", flavour: "Surgery", body: "Surgery: Seated Dip is off Routine A's plan until cleared." });
    });
    expect(journal.createJournalEntry).toHaveBeenCalledTimes(1);
    const [clientId, studioId, author, draft] = journal.createJournalEntry.mock.calls[0];
    expect([clientId, studioId]).toEqual(["c1", "westlake"]);
    expect(author).toEqual({ id: "uid-sam", initials: "SL", fullName: "Sam Lee" });
    expect(draft).toMatchObject({
      kind: "injury",
      category: "Surgery",
      importance: DEFAULT_IMPORTANCE.health,
      machineId: "m-dip",
      origin: "profile",
      body: "Surgery: Seated Dip is off Routine A's plan until cleared.",
    });
  });

  it("one note naming several machines names no single machine", async () => {
    journal.createJournalEntry.mockResolvedValue("j1");
    await mount([]);
    await act(async () => {
      actions.healthNote({ machineId: null, flavour: "Surgery", body: "Surgery: Leg Press and Lumbar are off Routine A's plan until cleared." });
    });
    expect(journal.createJournalEntry.mock.calls[0][3].machineId).toBeNull();
  });

  it("without a signed-in person nothing is written", async () => {
    await mount([], null);
    await act(async () => {
      actions.healthNote({ machineId: "m-dip", flavour: "Injury", body: "x" });
    });
    expect(journal.createJournalEntry).not.toHaveBeenCalled();
  });
});

describe("B, molded in: B follows A, and Start B", () => {
  const SWAPS = [
    { replaces: "m-leg-press", with: "m-ext" },
    { replaces: "m-compound-row", with: "m-simple-row" },
  ];
  const B_PLAN: RoutinePlan = {
    purpose: "Variety: the same regions, different machines",
    purposeKinds: ["variety"],
    intended: ["m-ext", "m-simple-row", "m-lumbar"],
    swaps: SWAPS,
    building: false,
    madeByUid: "uid-sam",
  };
  const A_ROUTINE = { id: "r-a", name: "Routine A", clientId: "c1", machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"], plan: PLAN } as Routine;
  const B_ROUTINE = { id: "r-b", name: "Routine B", clientId: "c1", machineIds: ["m-ext", "m-compound-row", "m-lumbar"], plan: B_PLAN } as Routine;

  it("a change that moves Routine A's machines writes Routine B in the same batch: A's change reaches B's unswapped places, never B's swaps", async () => {
    store.savePlanChange.mockReturnValue(Promise.resolve());
    await mount([A_ROUTINE, B_ROUTINE]);
    await act(async () => {
      actions.save("r-a", {
        plan: { ...PLAN, intended: ["m-leg-press", "m-pulldown", "m-lumbar", "m-chest-press"] },
        change: { kind: "swap", machineIds: ["m-compound-row", "m-pulldown"], byUid: "uid-sam" },
        machineIds: ["m-leg-press", "m-pulldown", "m-lumbar"],
      });
    });
    expect(store.savePlanChange).toHaveBeenCalledTimes(1);
    const [, routineId, write] = store.savePlanChange.mock.calls[0];
    expect(routineId).toBe("r-a");
    // B's swap (Leg Extension for Leg Press) stays; its unswapped place follows A's Pulldown.
    // Changed on purpose by the review of Round 2: this test pinned B's
    // planned swap for Compound Row staying tied to Compound Row after A
    // swapped it for Pulldown, so B's road grew to four machines for A's
    // three. A swap is tied to its PLACE in A (AJ, Oct 7 2026: "the B routine
    // starts out as the A routine with just one machine different"), so it
    // is for Pulldown now, B's road keeps A's length, and B's swaps are
    // written with the follow.
    expect(write.follow).toEqual({
      routineId: "r-b",
      machineIds: ["m-ext", "m-pulldown", "m-lumbar"],
      intended: ["m-ext", "m-simple-row", "m-lumbar"],
      swaps: [SWAPS[0], { replaces: "m-pulldown", with: "m-simple-row" }],
    });
    expect(routines.find((r) => r.id === "r-b")).toMatchObject({ machineIds: ["m-ext", "m-pulldown", "m-lumbar"] });
    expect(routines.find((r) => r.id === "r-b")?.plan?.swaps).toEqual([SWAPS[0], { replaces: "m-pulldown", with: "m-simple-row" }]);
  });

  it("a change to Routine B, or one that moves no machine, carries no follow", async () => {
    store.savePlanChange.mockReturnValue(Promise.resolve());
    await mount([A_ROUTINE, B_ROUTINE]);
    await act(async () => {
      actions.save("r-a", { plan: { ...PLAN, purpose: "x" }, change: { kind: "purpose", machineIds: [], value: "x", byUid: "uid-sam" } });
      actions.save("r-b", { plan: B_PLAN, change: { kind: "swap", machineIds: ["m-compound-row", "m-simple-row"], value: "made", byUid: "uid-sam" }, machineIds: ["m-ext", "m-simple-row", "m-lumbar"] });
    });
    expect(store.savePlanChange.mock.calls.map((c) => "follow" in c[2])).toEqual([false, false]);
  });

  /*
   * The review of item 8: while Routine A is empty, a B planned with the
   * starting lineup never followed a change to A's road, so its swaps named
   * machines that had left it. A change to A's plan takes B's plan with it,
   * in the same batch, and never Routine B's machines.
   */
  it("a change to the road while Routine A is empty takes a planned B's plan with it, never Routine B's machines", async () => {
    store.savePlanChange.mockReturnValue(Promise.resolve());
    const emptyA = { ...A_ROUTINE, machineIds: [] } as Routine;
    const plannedB = {
      ...B_ROUTINE,
      machineIds: [],
      plan: { ...B_PLAN, intended: ["m-ext", "m-simple-row", "m-lumbar", "m-chest-press"] },
    } as Routine;
    await mount([emptyA, plannedB]);
    // A Lineup swap on the road: the compound row becomes the pulldown, at its place.
    await act(async () => {
      actions.save("r-a", {
        plan: { ...PLAN, intended: ["m-leg-press", "m-pulldown", "m-lumbar", "m-chest-press"] },
        change: { kind: "swap", machineIds: ["m-compound-row", "m-pulldown"], byUid: "uid-sam" },
      });
    });
    expect(store.savePlanChange).toHaveBeenCalledTimes(1);
    const [, routineId, write] = store.savePlanChange.mock.calls[0];
    expect(routineId).toBe("r-a");
    expect(write.follow).toEqual({
      routineId: "r-b",
      intended: ["m-ext", "m-simple-row", "m-lumbar", "m-chest-press"],
      swaps: [SWAPS[0], { replaces: "m-pulldown", with: "m-simple-row" }],
    });
    // Drawn at once: B's plan follows the road, Routine B stays empty.
    const b = routines.find((r) => r.id === "r-b")!;
    expect(b.machineIds).toEqual([]);
    expect(b.plan?.swaps).toEqual([SWAPS[0], { replaces: "m-pulldown", with: "m-simple-row" }]);
  });

  it("Start B issues ONE startRoutineB and draws Routine B before the batch answers", async () => {
    const commit = deferred();
    store.startRoutineB.mockReturnValue({ routineId: "r-new-b", commit: commit.promise });
    await mount([A_ROUTINE, { id: "temp-b", name: "Routine B", clientId: "c1", machineIds: [] } as Routine]);
    await act(async () => {
      actions.startB!({ routineId: null, machineIds: ["m-ext", "m-compound-row", "m-lumbar"], plan: B_PLAN, change: { kind: "start", machineIds: ["m-leg-press", "m-ext"], value: "B", byUid: "uid-sam" } });
    });
    expect(store.startRoutineB).toHaveBeenCalledTimes(1);
    expect(store.startRoutineB.mock.calls[0][1]).toMatchObject({ routineId: null, clientId: "c1", studioId: "westlake", plan: B_PLAN });
    expect(routines.map((r) => r.id)).toEqual(["r-a", "r-new-b"]);
    expect(routines[1]).toMatchObject({ name: "Routine B", machineIds: ["m-ext", "m-compound-row", "m-lumbar"], plan: B_PLAN });
    await act(async () => commit.resolve());
    expect(said).toEqual([]);
  });
});
