/**
 * The routine plan's only writer (store.ts): a plan's first write
 * (`startPlan`) and every change after it (`savePlanChange`), each ONE batch,
 * never awaited by a tap.
 *
 * Firestore is replaced by a recorder: each batch says which documents it
 * set or updated with what, and when it was committed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { op: "set" | "update"; path: string; data: Record<string, unknown> };
const fake = vi.hoisted(() => ({ batches: [] as Array<{ ops: Op[]; committed: boolean }>, autoId: 0, refuse: false }));

vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path, id: path.split("/").pop()! });
  return {
    collection: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      return { path: [head, ...segments].filter(Boolean).join("/") };
    },
    doc: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      if (segments.length === 0) return ref(`${head}/auto-${++fake.autoId}`);
      return ref([head, ...segments].filter(Boolean).join("/"));
    },
    serverTimestamp: () => "SERVER_TIME",
    getDocs: async () => ({ docs: [] }),
    writeBatch: () => {
      const batch = { ops: [] as Op[], committed: false };
      fake.batches.push(batch);
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => batch.ops.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: Record<string, unknown>) => batch.ops.push({ op: "update", path: r.path, data }),
        commit: () => {
          batch.committed = true;
          return fake.refuse ? Promise.reject(new Error("permission-denied")) : Promise.resolve();
        },
      };
    },
  };
});

import { writeBatch } from "firebase/firestore";
import { addStartPlanToBatch, savePlanChange, saveRoutineEdit, startPlan } from "./store";
import type { PlanChange, RoutinePlan } from "./types";

const db = {} as never;

const plan: RoutinePlan = {
  purpose: "Learning the protocol: the starting routine",
  purposeKinds: ["core"],
  intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"],
  dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
  building: true,
  templateId: "academy-low-back",
  madeByUid: "uid-sam",
  madeByName: "Sam Lee",
  madeAt: "2026-10-08",
};

const change: PlanChange = {
  kind: "start",
  machineIds: plan.intended,
  value: "Low back issues",
  byUid: "uid-sam",
  byName: "Sam Lee",
};

beforeEach(() => {
  fake.batches.length = 0;
  fake.autoId = 0;
  fake.refuse = false;
});

describe("startPlan: a plan's first write, in one batch", () => {
  // Changed on purpose (Oct 8 2026): this made Routine A with day one in it.
  // AJ, asked whether a walk-in's machines should be ticked into Routine A by
  // default, answered "3a" (unticked) and added: "this also counts with the
  // consult visit, sometimes the consult machines will not be the same as
  // their a routine". So Keep this lineup and Start's batch pass no machines:
  // Routine A is made EMPTY, and the plan carries day one (`plan.dayOne`).
  it("makes an EMPTY Routine A with the plan carrying day one, and its first change, when the client has none", async () => {
    const started = startPlan(db, {
      routineId: null,
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: [],
      plan,
      change,
    });
    expect(fake.batches).toHaveLength(1);
    const [routine, first] = fake.batches[0]!.ops;
    // The id is made on this iPad, so a screen draws Routine A before anything is sent.
    expect(started.routineId).toBe("auto-1");
    expect(routine).toEqual({
      op: "set",
      path: "routines/auto-1",
      data: {
        clientId: "c1",
        name: "Routine A",
        machineIds: [],
        plan,
        createdAt: "SERVER_TIME",
        studioId: "westlake",
      },
    });
    // Day one is on the plan and nowhere in Routine A: nothing writes it there by itself.
    expect((routine!.data.plan as RoutinePlan).dayOne).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"]);
    expect(routine!.data.machineIds).toEqual([]);
    expect(first).toEqual({ op: "set", path: "routines/auto-1/planChanges/auto-2", data: { ...change, at: "SERVER_TIME" } });
    await started.commit;
    expect(fake.batches[0]!.committed).toBe(true);
  });

  it("puts the plan on the routine the client has, with the change beside it", () => {
    // Add a plan: the routine as it stands is what the client does, so the
    // plan has no day one of its own.
    const { dayOne: _dayOne, ...fromRoutine } = plan;
    const started = startPlan(db, {
      routineId: "r-a",
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: ["m-leg-press", "m-compound-row"],
      plan: fromRoutine,
      change: { kind: "start", machineIds: plan.intended, byUid: "uid-sam" },
    });
    expect(started.routineId).toBe("r-a");
    const ops = fake.batches[0]!.ops;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      op: "update",
      path: "routines/r-a",
      data: { machineIds: ["m-leg-press", "m-compound-row"], plan: fromRoutine },
    });
    expect(ops[1]!.path).toMatch(/^routines\/r-a\/planChanges\//);
    // Only what the routine is updated with: never the client, the name or a creation time on an existing one.
    expect(ops[0]!.data).not.toHaveProperty("clientId");
    expect(ops[0]!.data).not.toHaveProperty("createdAt");
  });

  it("sends nothing undefined, which Firestore refuses", () => {
    startPlan(db, {
      routineId: null,
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: ["m-leg-press"],
      plan: { ...plan, madeByName: undefined, focus: undefined },
      change: { kind: "start", machineIds: ["m-leg-press"], byUid: "uid-sam", reason: undefined, byName: undefined },
    });
    const hasUndefined = (v: unknown): boolean =>
      v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));
    for (const op of fake.batches[0]!.ops) expect(hasUndefined(op.data)).toBe(false);
  });

  it("returns at once, and hands back a refusal for the caller to toast", async () => {
    fake.refuse = true;
    const started = startPlan(db, {
      routineId: null,
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: ["m-leg-press"],
      plan,
      change,
    });
    expect(started.routineId).toBe("auto-1");
    await expect(started.commit).rejects.toThrow("permission-denied");
  });
});

describe("addStartPlanToBatch: the same first write, in Start's own batch (§4.5)", () => {
  it("adds the EMPTY Routine A with its plan and the start change to the caller's batch, and commits nothing", () => {
    // The tracker's Start batch: the session goes in beside these, and the
    // tracker commits once, never awaited.
    const batch = writeBatch(db);
    const { routineId } = addStartPlanToBatch(db, batch, {
      routineId: null,
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: [],
      plan,
      change,
    });
    expect(routineId).toBe("auto-1");
    expect(fake.batches).toHaveLength(1);
    const [made, first] = fake.batches[0]!.ops;
    expect(made).toMatchObject({ op: "set", path: "routines/auto-1", data: { name: "Routine A", machineIds: [], plan } });
    expect(first).toEqual({ op: "set", path: "routines/auto-1/planChanges/auto-2", data: { ...change, at: "SERVER_TIME" } });
    expect(fake.batches[0]!.committed).toBe(false);
  });

  it("puts the plan on the empty Routine A the client has, never a second one", () => {
    const batch = writeBatch(db);
    const { routineId } = addStartPlanToBatch(db, batch, {
      routineId: "r-empty",
      clientId: "c1",
      studioId: "westlake",
      name: "Routine A",
      machineIds: [],
      plan,
      change,
    });
    expect(routineId).toBe("r-empty");
    expect(fake.batches[0]!.ops[0]).toEqual({ op: "update", path: "routines/r-empty", data: { machineIds: [], plan } });
  });
});

describe("savePlanChange: every change after the first", () => {
  it("writes the plan, the change and the routine's machines in one batch", async () => {
    await savePlanChange(db, "r-a", {
      plan,
      change: { kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared", byUid: "uid-sam" },
      machineIds: ["m-leg-press", "m-chest-fly"],
    });
    const ops = fake.batches[0]!.ops;
    expect(ops[0]).toEqual({ op: "update", path: "routines/r-a", data: { plan, machineIds: ["m-leg-press", "m-chest-fly"] } });
    expect(ops[1]!.data).toEqual({ kind: "cantdo", machineIds: ["m-dip"], value: "Surgery · cleared", byUid: "uid-sam", at: "SERVER_TIME" });
  });

  it("appends the rest of one tap's changes in the same batch (a Re-plan and what it put on the bench)", async () => {
    await savePlanChange(db, "r-a", {
      plan,
      change: { kind: "replan", machineIds: plan.intended, value: "Surgery coming up", byUid: "uid-sam" },
      also: [{ kind: "cantdo", machineIds: ["m-leg-press"], value: "cleared", byUid: "uid-sam" }],
    });
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => o.data.kind ?? "routine")).toEqual(["routine", "replan", "cantdo"]);
    expect(ops[2]!.path).toMatch(/^routines\/r-a\/planChanges\//);
    expect(ops[2]!.data.at).toBe("SERVER_TIME");
  });

  it("leaves the routine's machines alone when the change doesn't move them", async () => {
    await savePlanChange(db, "r-a", { plan, change: { kind: "column", machineIds: [], value: "male-novice", byUid: "uid-sam" } });
    expect(fake.batches[0]!.ops[0]!.data).toEqual({ plan });
  });
});

describe("saveRoutineEdit: the Edit routine drawer keeps the plan", () => {
  // The design round, section 4.3: "A drawer save on a routine with a plan
  // writes the matching plan change (add, remove, reorder) in the same
  // batch, so the plan and the routine never drift."
  it("writes the routine with its plan, the adjustment and every plan change in ONE batch", async () => {
    const kept: RoutinePlan = { ...plan, intended: ["m-compound-row", "m-leg-press", "m-lumbar", "m-chest-press"] };
    await saveRoutineEdit(db, "r-a", {
      routine: { machineIds: ["m-compound-row", "m-leg-press"], updatedAt: "SERVER_TIME", templateId: undefined },
      plan: kept,
      changes: [
        { kind: "reorder", machineIds: kept.intended, byUid: "uid-sam", reason: "Client asked" },
        { kind: "add", machineIds: ["m-ext"], byUid: "uid-sam", byName: undefined },
      ],
      adjustment: { clientId: "c1", routineId: "r-a", newMachineIds: ["m-compound-row", "m-leg-press"], changeType: "machines", notes: undefined },
    });
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/, "*")])).toEqual([
      ["update", "routines/r-a"],
      ["set", "routineAdjustments/*"],
      ["set", "routines/r-a/planChanges/*"],
      ["set", "routines/r-a/planChanges/*"],
    ]);
    // One update on the routine: its machines and the plan together, nothing undefined.
    expect(ops[0]!.data).toEqual({ machineIds: ["m-compound-row", "m-leg-press"], updatedAt: "SERVER_TIME", plan: kept });
    expect(ops[1]!.data).toEqual({ clientId: "c1", routineId: "r-a", newMachineIds: ["m-compound-row", "m-leg-press"], changeType: "machines" });
    expect(ops[2]!.data).toEqual({ kind: "reorder", machineIds: kept.intended, byUid: "uid-sam", reason: "Client asked", at: "SERVER_TIME" });
    expect(ops[3]!.data).toEqual({ kind: "add", machineIds: ["m-ext"], byUid: "uid-sam", at: "SERVER_TIME" });
    expect(fake.batches[0]!.committed).toBe(true);
  });

  it("hands back a refusal: nothing of it lands", async () => {
    fake.refuse = true;
    await expect(
      saveRoutineEdit(db, "r-a", { routine: { machineIds: [] }, plan, changes: [], adjustment: { clientId: "c1" } }),
    ).rejects.toThrow("permission-denied");
    expect(fake.batches).toHaveLength(1);
  });
});
