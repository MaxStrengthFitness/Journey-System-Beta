import { describe, expect, it } from "vitest";
import {
  cleanPayload,
  discardLogIds,
  plannedMachinesOf,
  prefillOf,
  resolveStartRoutine,
  seedLogs,
  startClientPatch,
  type SeedArgs,
} from "./start-plan";
import type { ClientMachineSetting, Routine } from "../../types";

const A: Routine = { id: "r-a", clientId: "c1", name: "Routine A", machineIds: ["m-leg-press", "m-pulldown"] };
const B: Routine = { id: "r-b", clientId: "c1", name: "Routine B", machineIds: ["m-chest-press"] };

describe("resolveStartRoutine: an empty list that wasn't read is never 'no routine'", () => {
  it("uses the client's routine of that letter once the routines are known", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [A, B], routinesKnown: true })).toEqual({ kind: "existing", routine: A });
    expect(resolveStartRoutine({ routineType: "B", routines: [A, B], routinesKnown: true })).toEqual({ kind: "existing", routine: B });
  });

  it("makes one only when the routines are known and there is none", () => {
    expect(resolveStartRoutine({ routineType: "A", customMachines: ["m-1"], routines: [], routinesKnown: true })).toEqual({
      kind: "create",
      name: "Routine A",
      machineIds: ["m-1"],
    });
  });

  it("the reported bug: routines not read yet make no second, empty Routine A", () => {
    expect(resolveStartRoutine({ routineType: "A", customMachines: [], routines: [], routinesKnown: false })).toEqual({
      kind: "unknown",
      name: "Routine A",
    });
  });

  it("never reads a list that isn't known, even when it holds a routine (the last client's)", () => {
    expect(resolveStartRoutine({ routineType: "A", routines: [A], routinesKnown: false }).kind).toBe("unknown");
  });

  it("a Free session has no routine, known or not", () => {
    expect(resolveStartRoutine({ routineType: "Free", routines: [], routinesKnown: false })).toEqual({ kind: "free" });
  });
});

describe("plannedMachinesOf", () => {
  it("an adjusted list wins over the routine's", () => {
    expect(plannedMachinesOf({ kind: "existing", routine: A }, ["m-x"])).toEqual(["m-x"]);
    expect(plannedMachinesOf({ kind: "existing", routine: A }, [])).toEqual(A.machineIds);
    expect(plannedMachinesOf({ kind: "existing", routine: A })).toEqual(A.machineIds);
  });

  it("an unknown routine plans nothing yet unless the trainer adjusted the list", () => {
    expect(plannedMachinesOf({ kind: "unknown", name: "Routine A" }, [])).toEqual([]);
    expect(plannedMachinesOf({ kind: "unknown", name: "Routine A" }, ["m-x"])).toEqual(["m-x"]);
  });
});

describe("startClientPatch: the client's own fields, written apart from the session", () => {
  it("marks Routine B and the first session only when they change", () => {
    expect(startClientPatch({ routineType: "B", client: {}, sessionNumber: 4 })).toEqual({ isRoutineBActive: true });
    expect(startClientPatch({ routineType: "B", client: { isRoutineBActive: true }, sessionNumber: 4 })).toEqual({});
    expect(startClientPatch({ routineType: "A", client: {}, sessionNumber: 1 })).toEqual({ firstSessionDate: true });
    expect(startClientPatch({ routineType: "A", client: { firstSessionDate: "2026-01-01" } as any, sessionNumber: 1 })).toEqual({});
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
