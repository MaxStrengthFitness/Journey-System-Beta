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

import { savePlanChange, startPlan } from "./store";
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

  it("leaves the routine's machines alone when the change doesn't move them", async () => {
    await savePlanChange(db, "r-a", { plan, change: { kind: "column", machineIds: [], value: "male-novice", byUid: "uid-sam" } });
    expect(fake.batches[0]!.ops[0]!.data).toEqual({ plan });
  });
});
