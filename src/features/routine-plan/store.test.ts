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
import { addPlannedBAtStart, addStartPlanToBatch, saveNextTime, savePlanChange, saveRoutineEdit, startPlan, startRoutineB } from "./store";
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

describe("saveNextTime: the Wrap-up's Next time, once, in one batch", () => {
  // The design round, section 4.7: "It writes routineAfterWrapUp and
  // planAfterWrapUp with an add change, never awaited, with a toast on
  // refusal." With no routine, "Ticking writes Routine A with no plan."
  const owner = { clientId: "c1", studioId: "westlake", trainerId: "t-sam" };

  it("a routine with a plan: the plan, its changes and the routine's machines, one batch", async () => {
    const kept: RoutinePlan = { ...plan, intended: [...plan.intended, "m-ext"] };
    await saveNextTime(
      db,
      {
        kind: "plan",
        routineId: "r-a",
        plan: kept,
        change: { kind: "add", machineIds: ["m-leg-press"], value: "routine", byUid: "uid-sam" },
        also: [{ kind: "add", machineIds: ["m-ext"], byUid: "uid-sam" }],
        machineIds: ["m-leg-press", "m-ext"],
      },
      owner,
    );
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/, "*")])).toEqual([
      ["update", "routines/r-a"],
      ["set", "routines/r-a/planChanges/*"],
      ["set", "routines/r-a/planChanges/*"],
    ]);
    expect(ops[0]!.data).toEqual({ plan: kept, machineIds: ["m-leg-press", "m-ext"] });
    expect(ops[1]!.data).toEqual({ kind: "add", machineIds: ["m-leg-press"], value: "routine", byUid: "uid-sam", at: "SERVER_TIME" });
    expect(fake.batches[0]!.committed).toBe(true);
  });

  it("a routine with no plan: its machines and when, never a plan, and the change's record beside it", async () => {
    // A plan-less routine's history is its routineAdjustments (the Edit
    // routine drawer's shape): without one, Programming's "changed … by"
    // would name an older change for a routine changed today (the review).
    await saveNextTime(
      db,
      { kind: "routine", routineId: "r-a", machineIds: ["m-leg-press", "m-lumbar"], previousMachineIds: ["m-leg-press"] },
      owner,
    );
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/, "*")])).toEqual([
      ["update", "routines/r-a"],
      ["set", "routineAdjustments/*"],
    ]);
    expect(ops[0]!.data).toEqual({ machineIds: ["m-leg-press", "m-lumbar"], updatedAt: "SERVER_TIME" });
    expect(ops[1]!.data).toEqual({
      clientId: "c1",
      routineId: "r-a",
      previousMachineIds: ["m-leg-press"],
      newMachineIds: ["m-leg-press", "m-lumbar"],
      trainerId: "t-sam",
      studioId: "westlake",
      changeType: "machines",
      createdAt: "SERVER_TIME",
    });
  });

  it("no routine: Routine A made with the ticked machines and no plan, its id made on this iPad, with its 'created' record", async () => {
    await saveNextTime(db, { kind: "create", name: "Routine A", machineIds: ["m-leg-press"] }, owner);
    expect(fake.batches).toHaveLength(1);
    const [op, record] = fake.batches[0]!.ops;
    expect(op!.op).toBe("set");
    expect(op!.path).toMatch(/^routines\/auto-\d+$/);
    expect(op!.data).toEqual({ clientId: "c1", name: "Routine A", machineIds: ["m-leg-press"], createdAt: "SERVER_TIME", studioId: "westlake" });
    expect(op!.data).not.toHaveProperty("plan");
    expect(record!.path).toMatch(/^routineAdjustments\/auto-\d+$/);
    expect(record!.data).toMatchObject({
      routineId: op!.path.split("/")[1],
      previousMachineIds: [],
      newMachineIds: ["m-leg-press"],
      changeType: "created",
      trainerId: "t-sam",
    });
  });

  it("hands back a refusal for the caller to say", async () => {
    fake.refuse = true;
    await expect(
      saveNextTime(db, { kind: "routine", routineId: "r-a", machineIds: [], previousMachineIds: ["m-lumbar"] }, owner),
    ).rejects.toThrow("permission-denied");
  });
});

/* ── B, molded in (Round 2 of the design round, item 6) ─────────────────── */

describe("startRoutineB: Plan B kept, in ONE batch", () => {
  // AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
  // machine different". Turning B on used to make an EMPTY Routine B (the
  // critic's #22); now Start B writes B, its plan, its first change and the
  // client's switch together, or nothing at all.
  const bPlan: RoutinePlan = {
    purpose: "Variety: the same regions, different machines",
    purposeKinds: ["variety"],
    intended: ["m-ext", "m-simple-row", "m-lumbar"],
    swaps: [
      { replaces: "m-leg-press", with: "m-ext" },
      { replaces: "m-compound-row", with: "m-simple-row" },
    ],
    building: false,
    madeByUid: "uid-sam",
    madeAt: "2026-10-09",
  };
  const start: PlanChange = { kind: "start", machineIds: ["m-leg-press", "m-ext"], value: "B", byUid: "uid-sam" };

  it("makes Routine B as A with one machine different, its plan, its start, and turns B on, in one batch", async () => {
    const started = startRoutineB(db, {
      routineId: null,
      clientId: "c1",
      studioId: "westlake",
      machineIds: ["m-ext", "m-compound-row", "m-lumbar"],
      plan: bPlan,
      change: start,
    });
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path])).toEqual([
      ["set", "routines/auto-1"],
      ["set", "routines/auto-1/planChanges/auto-2"],
      ["update", "clients/c1"],
    ]);
    expect(started.routineId).toBe("auto-1");
    expect(ops[0]!.data).toEqual({
      clientId: "c1",
      name: "Routine B",
      machineIds: ["m-ext", "m-compound-row", "m-lumbar"],
      plan: bPlan,
      createdAt: "SERVER_TIME",
      studioId: "westlake",
    });
    expect(ops[1]!.data).toEqual({ ...start, at: "SERVER_TIME" });
    // The one field the B switch has always written, alone: never a whole client write.
    expect(ops[2]!.data).toEqual({ isRoutineBActive: true });
    await started.commit;
    expect(fake.batches[0]!.committed).toBe(true);
  });

  it("puts B's plan on the empty Routine B the client has, never a second one", () => {
    startRoutineB(db, { routineId: "r-b", clientId: "c1", studioId: "westlake", machineIds: ["m-ext"], plan: bPlan, change: start });
    const ops = fake.batches[0]!.ops;
    expect(ops[0]).toEqual({ op: "update", path: "routines/r-b", data: { machineIds: ["m-ext"], plan: bPlan } });
    expect(ops.filter((o) => o.op === "set" && /^routines\/[^/]+$/.test(o.path))).toEqual([]);
  });
});

describe("B follows A: Routine B in the same batch as a change to Routine A", () => {
  const follow = { routineId: "r-b", machineIds: ["m-ext", "m-lumbar"], intended: ["m-ext", "m-simple-row", "m-lumbar"] };

  it("savePlanChange: A's plan, its change, A's machines and B, one batch", async () => {
    await savePlanChange(db, "r-a", {
      plan,
      change: { kind: "remove", machineIds: ["m-compound-row"], byUid: "uid-sam" },
      machineIds: ["m-leg-press", "m-lumbar"],
      follow,
    });
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/, "*")])).toEqual([
      ["update", "routines/r-a"],
      ["set", "routines/r-a/planChanges/*"],
      ["update", "routines/r-b"],
    ]);
    // B's machines and its plan's road by its own field path: nothing else on B's plan is touched.
    expect(ops[2]!.data).toEqual({ machineIds: ["m-ext", "m-lumbar"], "plan.intended": ["m-ext", "m-simple-row", "m-lumbar"] });
  });

  it("a swap that followed its place in A is written with B, by its own field path", async () => {
    const swaps = [{ replaces: "m-leg-curl", with: "m-ext" }];
    await savePlanChange(db, "r-a", {
      plan,
      change: { kind: "swap", machineIds: ["m-leg-press", "m-leg-curl"], byUid: "uid-sam" },
      machineIds: ["m-leg-curl", "m-lumbar"],
      follow: { ...follow, swaps },
    });
    expect(fake.batches[0]!.ops[2]!.data).toEqual({
      machineIds: ["m-ext", "m-lumbar"],
      "plan.intended": ["m-ext", "m-simple-row", "m-lumbar"],
      "plan.swaps": swaps,
    });
  });

  it("without a follow nothing of B is written", async () => {
    await savePlanChange(db, "r-a", { plan, change: { kind: "purpose", machineIds: [], value: "x", byUid: "uid-sam" } });
    expect(fake.batches[0]!.ops.some((o) => o.path === "routines/r-b")).toBe(false);
  });

  it("the Wrap-up's Next time into a Routine A with no plan, and the drawer's save of one, carry B too", async () => {
    await saveNextTime(
      db,
      { kind: "routine", routineId: "r-a", machineIds: ["m-leg-press", "m-lumbar"], previousMachineIds: ["m-leg-press"] },
      { clientId: "c1", studioId: "westlake", trainerId: "t-sam" },
      follow,
    );
    expect(fake.batches).toHaveLength(1);
    expect(fake.batches[0]!.ops.map((o) => o.path.replace(/auto-\d+/, "*"))).toEqual(["routines/r-a", "routineAdjustments/*", "routines/r-b"]);

    await saveRoutineEdit(db, "r-a", { routine: { machineIds: ["m-lumbar"] }, adjustment: { clientId: "c1" }, follow });
    expect(fake.batches).toHaveLength(2);
    const drawer = fake.batches[1]!.ops;
    expect(drawer.map((o) => o.path.replace(/auto-\d+/, "*"))).toEqual(["routines/r-a", "routineAdjustments/*", "routines/r-b"]);
    // A routine with no plan: no plan written, no plan change.
    expect(drawer[0]!.data).toEqual({ machineIds: ["m-lumbar"] });
  });
});

/*
 * B planned ahead (the first-session round, item 8: the studio setting
 * `newClientsStart`, "A and B together"). AJ, Oct 7 2026: "Some studios may
 * start building an A and B routine immediately for a client. So we need to
 * be able to have that customization." The consult is not Routine A (AJ,
 * Oct 8 2026), and B is a copy of A: Keep and Start write B's plan with NO
 * machines and B off; the Wrap-up that starts Routine A starts B.
 */
describe("B planned with the starting lineup", () => {
  const bPlan: RoutinePlan = {
    purpose: "Variety: the same regions, different machines",
    purposeKinds: ["variety"],
    intended: ["m-ext", "m-simple-row", "m-lumbar", "m-chest-press"],
    swaps: [
      { replaces: "m-leg-press", with: "m-ext" },
      { replaces: "m-compound-row", with: "m-simple-row" },
    ],
    building: false,
    madeByUid: "uid-sam",
    madeAt: "2026-10-08",
    templateId: "academy-low-back",
  };
  const planned: PlanChange = {
    kind: "start",
    machineIds: ["m-leg-press", "m-ext", "m-compound-row", "m-simple-row"],
    value: "B planned",
    byUid: "uid-sam",
  };

  it("Keep this lineup: Routine A (empty) and Routine B (empty, its plan) with both first changes, in ONE batch, B never turned on", async () => {
    const started = startPlan(
      db,
      { routineId: null, clientId: "c1", studioId: "westlake", name: "Routine A", machineIds: [], plan, change },
      { routineId: null, plan: bPlan, change: planned },
    );
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path])).toEqual([
      ["set", "routines/auto-1"],
      ["set", "routines/auto-1/planChanges/auto-2"],
      ["set", "routines/auto-3"],
      ["set", "routines/auto-3/planChanges/auto-4"],
    ]);
    expect(started.routineId).toBe("auto-1");
    expect(started.bRoutineId).toBe("auto-3");
    expect(ops[0]!.data).toMatchObject({ name: "Routine A", machineIds: [] });
    // Routine B's machines stay EMPTY until A has machines: the consult is not Routine A.
    expect(ops[2]!.data).toEqual({ clientId: "c1", name: "Routine B", machineIds: [], plan: bPlan, createdAt: "SERVER_TIME", studioId: "westlake" });
    expect(ops[3]!.data).toEqual({ ...planned, at: "SERVER_TIME" });
    // B with nothing in it is never alternated into (the critic's #22): the client is not touched.
    expect(ops.some((o) => o.path.startsWith("clients/"))).toBe(false);
    await started.commit;
    expect(fake.batches[0]!.committed).toBe(true);
  });

  it("puts the planned B on the empty, plan-less Routine B the client has, never a second one, and turns B OFF in the same batch", () => {
    startPlan(
      db,
      { routineId: "r-a", clientId: "c1", studioId: "westlake", name: "Routine A", machineIds: [], plan, change },
      { routineId: "r-b", plan: bPlan, change: planned },
    );
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.find((o) => o.path === "routines/r-b")).toEqual({ op: "update", path: "routines/r-b", data: { machineIds: [], plan: bPlan } });
    // An empty Routine B turned on before Round 2 would be alternated into with nothing in it (the
    // critic's #22; the review of item 8): the one field the B switch writes, off, alone.
    expect(ops.filter((o) => o.path.startsWith("clients/"))).toEqual([{ op: "update", path: "clients/c1", data: { isRoutineBActive: false } }]);
  });

  it("a change to A's road takes a planned B's plan with it, in the same batch, and never Routine B's machines", async () => {
    await savePlanChange(db, "r-a", {
      plan,
      change,
      follow: {
        routineId: "r-b",
        intended: ["m-ext", "m-simple-row", "m-lumbar", "m-overhead-press"],
        swaps: [{ replaces: "m-leg-press", with: "m-ext" }],
      },
    });
    expect(fake.batches).toHaveLength(1);
    const b = fake.batches[0]!.ops.find((o) => o.path === "routines/r-b")!;
    expect(b.data).toEqual({
      "plan.intended": ["m-ext", "m-simple-row", "m-lumbar", "m-overhead-press"],
      "plan.swaps": [{ replaces: "m-leg-press", with: "m-ext" }],
    });
    expect("machineIds" in b.data).toBe(false);
  });

  it("Start's own batch: the planned B goes in where plannedBTarget allows, and never over a Routine B of the client's own", () => {
    const batch = writeBatch(db);
    expect(addPlannedBAtStart(db, batch, { routines: [], clientId: "c1", studioId: "westlake", b: { plan: bPlan, change: planned } })).toBe("auto-1");
    expect(fake.batches[0]!.ops.map((o) => [o.op, o.path])).toEqual([
      ["set", "routines/auto-1"],
      ["set", "routines/auto-1/planChanges/auto-2"],
    ]);
    expect(fake.batches[0]!.committed).toBe(false);
    const own = { id: "r-b", name: "Routine B", machineIds: ["m-ext"] };
    const batch2 = writeBatch(db);
    expect(addPlannedBAtStart(db, batch2, { routines: [own], clientId: "c1", studioId: "westlake", b: { plan: bPlan, change: planned } })).toBeNull();
    expect(fake.batches[1]!.ops).toEqual([]);
    expect(addPlannedBAtStart(db, batch2, { routines: [], clientId: "c1", studioId: "westlake", b: null })).toBeNull();
  });

  it("the Wrap-up that starts Routine A starts B too: A's ticks, B as A with one swap, its start, and B turned on, ONE batch", async () => {
    const startB = {
      routineId: "r-b",
      clientId: "c1",
      machineIds: ["m-ext", "m-compound-row", "m-lumbar"],
      plan: { ...bPlan, intended: ["m-ext", "m-simple-row", "m-lumbar"] },
      change: { kind: "start" as const, machineIds: ["m-leg-press", "m-ext"], value: "B", byUid: "uid-sam" },
    };
    await saveNextTime(
      db,
      {
        kind: "plan",
        routineId: "r-a",
        plan,
        change: { kind: "add", machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"], value: "routine", byUid: "uid-sam" },
        machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"],
      },
      { clientId: "c1", studioId: "westlake", trainerId: "t-sam" },
      null,
      startB,
    );
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/, "*")])).toEqual([
      ["update", "routines/r-a"],
      ["set", "routines/r-a/planChanges/*"],
      ["update", "routines/r-b"],
      ["set", "routines/r-b/planChanges/*"],
      ["update", "clients/c1"],
    ]);
    expect(ops[2]!.data).toEqual({ machineIds: startB.machineIds, plan: startB.plan });
    expect(ops[3]!.data).toEqual({ ...startB.change, at: "SERVER_TIME" });
    // The one field the B switch has always written, alone: never a whole client write.
    expect(ops[4]!.data).toEqual({ isRoutineBActive: true });
  });
});
