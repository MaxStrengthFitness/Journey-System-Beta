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
 *     with the Auth uid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  startPlan: vi.fn(),
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
