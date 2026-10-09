import { describe, expect, it } from "vitest";
import {
  cleanPayload,
  discardLogIds,
  refusedStartSweep,
  plannedMachinesOf,
  prefillOf,
  resolveStartRoutine,
  seedLogs,
  startClientPatch,
  type SeedArgs,
} from "./start-plan";
import type { ClientMachineSetting, Routine } from "../../types";
import type { StartPlanAtStart } from "../routine-plan/briefing-plan";

const A: Routine = { id: "r-a", clientId: "c1", name: "Routine A", machineIds: ["m-leg-press", "m-pulldown"] };
const B: Routine = { id: "r-b", clientId: "c1", name: "Routine B", machineIds: ["m-chest-press"] };

/** What the briefing hands up for a client starting out: the plan with day one, and today's machines. */
const startPlan: StartPlanAtStart = {
  plan: {
    purpose: "Learning the protocol: the starting routine",
    intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"],
    dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
    building: true,
    templateId: "academy-low-back",
    madeByUid: "uid-sam",
  },
  name: "Routine A",
  machineIds: ["m-leg-press", "m-compound-row"],
  startingRoutineId: "academy-low-back",
  startingRoutineName: "Low back issues",
};

describe("resolveStartRoutine: an empty list that wasn't read is never 'no routine'", () => {
  it("uses the client's routine of that letter once the routines are known", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [A, B], routinesKnown: true })).toEqual({ kind: "existing", routine: A });
    expect(resolveStartRoutine({ routineType: "B", routines: [A, B], routinesKnown: true })).toEqual({ kind: "existing", routine: B });
  });

  // Changed on purpose (the first-session design round, Oct 8 2026, §4.8):
  // this held that Start made a routine of the list the briefing built under
  // a "Today only" label ({ kind: "create" }). The consult is not Routine A
  // (AJ, Oct 8 2026: "this also counts with the consult visit, sometimes the
  // consult machines will not be the same as their a routine"), so today's
  // list is the session's alone, and Start makes no routine of it.
  it("makes no routine of today's list: with no routine and no starting plan, none", () => {
    expect(resolveStartRoutine({ routineType: "A", customMachines: ["m-1"], routines: [], routinesKnown: true })).toEqual({
      kind: "none",
      name: "Routine A",
    });
    expect(resolveStartRoutine({ routineType: "B", customMachines: ["m-1"], routines: [A], routinesKnown: true })).toEqual({
      kind: "none",
      name: "Routine B",
    });
  });

  it("a starting plan handed up makes Routine A, once the routines are known to hold none", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [], routinesKnown: true, startPlan })).toEqual({
      kind: "plan",
      name: "Routine A",
      routineId: null,
      startPlan,
    });
  });

  it("a starting plan goes on the empty, plan-less Routine A the client has, never a second one", () => {
    const empty: Routine = { id: "r-empty", clientId: "c1", name: "Routine A", machineIds: [] };
    expect(resolveStartRoutine({ routineType: "A", routines: [empty], routinesKnown: true, startPlan })).toMatchObject({
      kind: "plan",
      routineId: "r-empty",
    });
  });

  it("a Routine A with machines or a plan is the client's: the starting plan is not written over it", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [A], routinesKnown: true, startPlan })).toEqual({ kind: "existing", routine: A });
    const kept: Routine = { id: "r-kept", clientId: "c1", name: "Routine A", machineIds: [], plan: startPlan.plan };
    expect(resolveStartRoutine({ routineType: "A", routines: [kept], routinesKnown: true, startPlan }).kind).toBe("existing");
  });

  it("a starting plan is Routine A's only: a B session never makes one", () => {
    expect(resolveStartRoutine({ routineType: "B", routines: [], routinesKnown: true, startPlan }).kind).toBe("none");
  });

  it("the reported bug: routines not read yet make no second, empty Routine A", () => {
    expect(resolveStartRoutine({ routineType: "A", customMachines: [], routines: [], routinesKnown: false })).toEqual({
      kind: "unknown",
      name: "Routine A",
    });
    // A starting plan waits with it, decided the moment the routines are known.
    expect(resolveStartRoutine({ routineType: "A", routines: [], routinesKnown: false, startPlan })).toEqual({
      kind: "unknown",
      name: "Routine A",
      startPlan,
    });
  });

  it("never reads a list that isn't known, even when it holds a routine (the last client's)", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [A], routinesKnown: false }).kind).toBe("unknown");
  });

  it("a Free session has no routine, known or not", () => {
    expect(resolveStartRoutine({ routineType: "Free", routines: [], routinesKnown: false })).toEqual({ kind: "free" });
    expect(resolveStartRoutine({ routineType: "Free", routines: [], routinesKnown: true, startPlan })).toEqual({ kind: "free" });
  });
});

describe("plannedMachinesOf", () => {
  // Changed on purpose (Oct 8 2026): an adjusted EMPTY list used to fall
  // back to the routine's machines, so a briefing that said "Routine A · 0
  // machines · changed for today" started the whole routine. A list handed
  // up is run exactly as it was, an empty one included.
  it("an adjusted list wins over the routine's, exactly as handed up", () => {
    expect(plannedMachinesOf({ kind: "existing", routine: A }, ["m-x"])).toEqual(["m-x"]);
    expect(plannedMachinesOf({ kind: "existing", routine: A }, [])).toEqual([]);
    expect(plannedMachinesOf({ kind: "existing", routine: A })).toEqual(A.machineIds);
  });

  it("an empty Routine A with a plan runs the plan's day one (todayFor), never nothing", () => {
    const kept: Routine = { id: "r-kept", clientId: "c1", name: "Routine A", machineIds: [], plan: startPlan.plan };
    expect(plannedMachinesOf({ kind: "existing", routine: kept })).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
  });

  it("a starting plan runs today's machines as the briefing had them", () => {
    expect(plannedMachinesOf({ kind: "plan", name: "Routine A", routineId: null, startPlan })).toEqual(["m-leg-press", "m-compound-row"]);
  });

  it("no routine runs the list as chosen, and nothing when nothing was chosen: never the whole floor", () => {
    expect(plannedMachinesOf({ kind: "none", name: "Routine A" })).toEqual([]);
    expect(plannedMachinesOf({ kind: "none", name: "Routine A" }, ["m-x"])).toEqual(["m-x"]);
  });

  it("an unknown routine plans nothing yet unless the trainer adjusted the list, or a starting plan says today", () => {
    expect(plannedMachinesOf({ kind: "unknown", name: "Routine A" }, [])).toEqual([]);
    expect(plannedMachinesOf({ kind: "unknown", name: "Routine A" }, ["m-x"])).toEqual(["m-x"]);
    expect(plannedMachinesOf({ kind: "unknown", name: "Routine A", startPlan })).toEqual(["m-leg-press", "m-compound-row"]);
  });
});

describe("startClientPatch: the client's own fields, written apart from the session", () => {
  it("marks Routine B and the first session only when they change", () => {
    expect(startClientPatch({ routineType: "B", client: {}, sessionNumber: 4, runsSavedRoutine: true })).toEqual({ isRoutineBActive: true });
    expect(startClientPatch({ routineType: "B", client: { isRoutineBActive: true }, sessionNumber: 4, runsSavedRoutine: true })).toEqual({});
    expect(startClientPatch({ routineType: "A", client: {}, sessionNumber: 1, runsSavedRoutine: false })).toEqual({ firstSessionDate: true });
    expect(
      startClientPatch({ routineType: "A", client: { firstSessionDate: "2026-01-01" } as any, sessionNumber: 1, runsSavedRoutine: true }),
    ).toEqual({});
  });

  it("never switches on B for a B session with no Routine B (today's list makes no routine)", () => {
    expect(startClientPatch({ routineType: "B", client: {}, sessionNumber: 4, runsSavedRoutine: false })).toEqual({});
  });
});

const settings = (rows: Record<string, Partial<ClientMachineSetting>>) => rows as Record<string, ClientMachineSetting>;

describe("prefillOf: the weight a machine starts at, as before", () => {
  it("last performed, then the settings, and a prescription wins over the last metric", () => {
    const p = prefillOf(
      { currentMachineMetrics: { "m-a": { weight: "100", reps: "8" }, "m-b": { weight: "50" } } as any },
      settings({ "m-a": { currentWeight: 110 } as any, "m-c": { startingWeight: 30 } as any }),
    );
    expect(p["m-a"].weight).toBe("110");
    expect(p["m-b"].weight).toBe("50");
    expect(p["m-c"].weight).toBe("30");
  });
});

describe("seedLogs", () => {
  const base = (over: Partial<SeedArgs> = {}): SeedArgs => ({
    sessionId: "s1",
    machineIds: ["m-a", "m-torso-rotation", "m-new"],
    prefill: { "m-a": { weight: "100", reps: "8", isTSC: false } },
    settings: {},
    nameOf: (id) => ({ "m-a": "Leg Press", "m-torso-rotation": "Torso Rotation", "m-new": "Pulldown" })[id],
    client: { gender: "Female", age: 62 },
    clientId: "c1",
    clientHomeStudioId: "solon",
    studioId: "solon",
    createdAt: "NOW",
    hasLocal: () => false,
    startingWeight: () => 40,
    ...over,
  });

  it("one set per machine, two for a per-side machine, with a weight and never a count", () => {
    const seeds = seedLogs(base());
    expect(seeds.map((s) => s.id)).toEqual(["s1_m-a", "s1_m-torso-rotation_Left", "s1_m-torso-rotation_Right", "s1_m-new"]);
    const a = seeds[0].payload;
    expect(a).toMatchObject({ sessionId: "s1", machineId: "m-a", clientId: "c1", weight: "100", createdAt: "NOW", isTSC: false });
    expect(a).not.toHaveProperty("reps");
    expect(seeds[3].payload.weight).toBe("40");
    expect(seeds[1].payload.side).toBe("Left");
  });

  it("never seeds over a set this iPad already holds: a typed weight survives a late seed", () => {
    const seeds = seedLogs(base({ hasLocal: (key) => key === "s1_m-a" }));
    expect(seeds.map((s) => s.id)).not.toContain("s1_m-a");
    expect(seeds).toHaveLength(3);
  });

  it("leaves out a machine with nothing on record and no estimate", () => {
    const seeds = seedLogs(base({ machineIds: ["m-new"], startingWeight: () => 0 }));
    expect(seeds).toEqual([]);
  });

  it("writes nothing undefined (Firestore refuses it)", () => {
    const seeds = seedLogs(base({ prefill: { "m-a": { weight: "100", isTSC: undefined } } }));
    const json = JSON.stringify(seeds, (_k, v) => (v === undefined ? "__undefined__" : v));
    expect(json).not.toContain("__undefined__");
  });
});

describe("cleanPayload", () => {
  it("drops undefined, keeps null, and passes class instances (a server timestamp) through untouched", () => {
    class Sentinel {
      readonly _methodName = "serverTimestamp";
    }
    const s = new Sentinel();
    const d = new Date(0);
    const out = cleanPayload({ a: undefined, b: null, c: { d: undefined, e: 1 }, s, d, list: [undefined, 2] });
    expect(out).toEqual({ b: null, c: { e: 1 }, s, d, list: [null, 2] });
    expect(out.s).toBe(s);
  });
});

describe("discardLogIds: Discard's one batch", () => {
  it("every set this iPad holds for the session, and every id its machines' sets are written under", () => {
    const ids = discardLogIds(
      "s1",
      {
        "s1_m-a": { id: "s1_m-a", sessionId: "s1" },
        "s1_m-old": { id: "random-legacy-id", sessionId: "s1" },
        "s0_m-a": { id: "s0_m-a", sessionId: "s0" },
      },
      ["m-a", "m-torso-rotation"],
    );
    expect(ids.sort()).toEqual(["random-legacy-id", "s1_m-a", "s1_m-torso-rotation_Left", "s1_m-torso-rotation_Right"].sort());
  });
});

describe("refusedStartSweep: a late-refused Start never deletes a set the trainer touched", () => {
  it("takes back the untouched prefills and keeps typed or written sets", () => {
    const logs = {
      a: { id: "s1_m-a", sessionId: "s1", weight: "100", reps: "11" },
      b: { id: "s1_m-b", sessionId: "s1", weight: "80" },
      c: { id: "s1_m-c", sessionId: "s1", weight: "60" },
      d: { id: "s1_m-d", sessionId: "s1", skipReason: "pain" },
      other: { id: "s2_m-a", sessionId: "s2", reps: "9" },
    } as never;
    const { remove, kept } = refusedStartSweep("s1", logs, ["m-a", "m-b", "m-c", "m-d", "m-e"], (id) => id === "s1_m-c");
    expect(kept.sort()).toEqual(["s1_m-a", "s1_m-c", "s1_m-d"]);
    expect(remove.sort()).toEqual(["s1_m-b", "s1_m-e"]);
  });
});
