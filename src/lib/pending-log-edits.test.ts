import { describe, expect, it } from "vitest";
import { keepPendingEdits, pendingLogEdits } from "./pending-log-edits";
import type { ExerciseLog } from "../types";

const SID = "sess1";
const log = (machineId: string, fields: Partial<ExerciseLog> = {}, side?: "Left" | "Right"): ExerciseLog =>
  ({
    id: `${SID}_${machineId}${side ? "_" + side : ""}`,
    sessionId: SID,
    machineId,
    ...(side ? { side } : {}),
    ...fields,
  }) as ExerciseLog;

describe("pendingLogEdits", () => {
  it("keys a queued write the way the logs map does, side included", () => {
    const [edit] = pendingLogEdits([{ payload: { sessionId: SID, machineId: "torso_rotation", side: "Right", reps: "9" } }]);
    expect(edit.key).toBe(`${SID}_torso_rotation_Right`);
    expect(edit.fields.reps).toBe("9");
  });

  it("keys a set written under an old random document id by its session and machine", () => {
    // The queue is keyed by document id; the payload still names the set.
    const queue = new Map([["randomLegacyId123", { payload: { sessionId: SID, machineId: "leg_press", weight: "150" } }]]);
    expect(pendingLogEdits(queue.values())[0].key).toBe(`${SID}_leg_press`);
  });

  it("drops the server's own stamps, which are not values a trainer typed", () => {
    const stamp = { _methodName: "serverTimestamp" };
    const [edit] = pendingLogEdits([
      { payload: { sessionId: SID, machineId: "leg_press", reps: "12", updatedAt: stamp, createdAt: stamp } },
    ]);
    expect(edit.fields).not.toHaveProperty("updatedAt");
    expect(edit.fields).not.toHaveProperty("createdAt");
    expect(edit.fields.reps).toBe("12");
  });

  it("leaves out a payload that names no session or machine", () => {
    expect(pendingLogEdits([{ payload: { machineId: "leg_press" } }, { payload: { sessionId: SID } }])).toEqual([]);
  });

  it("ignores a side that is not Left or Right", () => {
    const [edit] = pendingLogEdits([{ payload: { sessionId: SID, machineId: "leg_press", side: "" } }]);
    expect(edit.key).toBe(`${SID}_leg_press`);
  });
});

describe("keepPendingEdits", () => {
  it("with nothing queued, the snapshot is the answer, as before", () => {
    const snapshot = { [`${SID}_leg_press`]: log("leg_press", { reps: "10" }) };
    expect(keepPendingEdits(snapshot, {}, [])).toBe(snapshot);
  });

  it("keeps the reps being typed on one side when the other side's save lands", () => {
    // Left was typed and sent; Right is typed and still queued. The snapshot
    // from Left's save carries Right's OLD (empty) reps.
    const prev = {
      [`${SID}_torso_rotation_Left`]: log("torso_rotation", { reps: "11" }, "Left"),
      [`${SID}_torso_rotation_Right`]: log("torso_rotation", { reps: "9" }, "Right"),
    };
    const snapshot = {
      [`${SID}_torso_rotation_Left`]: log("torso_rotation", { reps: "11" }, "Left"),
      [`${SID}_torso_rotation_Right`]: log("torso_rotation", { reps: "" }, "Right"),
    };
    const pending = pendingLogEdits([
      { payload: { sessionId: SID, machineId: "torso_rotation", side: "Right", reps: "9" } },
    ]);
    const next = keepPendingEdits(snapshot, prev, pending);
    expect(next[`${SID}_torso_rotation_Right`].reps).toBe("9");
    expect(next[`${SID}_torso_rotation_Left`].reps).toBe("11");
  });

  it("takes everything else about a queued set from the snapshot", () => {
    const snapshot = { [`${SID}_leg_press`]: log("leg_press", { reps: "8", weight: "150", repQuality: 3 }) };
    const pending = pendingLogEdits([{ payload: { sessionId: SID, machineId: "leg_press", reps: "12" } }]);
    const next = keepPendingEdits(snapshot, {}, pending);
    expect(next[`${SID}_leg_press`]).toMatchObject({ reps: "12", weight: "150", repQuality: 3 });
  });

  it("keeps a set whose first write is still queued, which the snapshot has never seen", () => {
    const prev = { [`${SID}_chest_press`]: log("chest_press", { weight: "90" }) };
    const pending = pendingLogEdits([{ payload: { sessionId: SID, machineId: "chest_press", weight: "90" } }]);
    const next = keepPendingEdits({}, prev, pending);
    expect(next[`${SID}_chest_press`]).toMatchObject({ id: `${SID}_chest_press`, weight: "90" });
  });

  it("takes a set with nothing queued exactly as the database has it, even if the screen differs", () => {
    const prev = { [`${SID}_leg_press`]: log("leg_press", { reps: "7" }) };
    const snapshot = { [`${SID}_leg_press`]: log("leg_press", { reps: "10" }) };
    const pending = pendingLogEdits([{ payload: { sessionId: SID, machineId: "chest_press", reps: "5" } }]);
    expect(keepPendingEdits(snapshot, prev, pending)[`${SID}_leg_press`].reps).toBe("10");
  });

  it("keeps an old random document id on a queued set", () => {
    const snapshot = { [`${SID}_leg_press`]: { ...log("leg_press", { reps: "8" }), id: "randomLegacyId123" } };
    const pending = pendingLogEdits([{ payload: { sessionId: SID, machineId: "leg_press", reps: "12" } }]);
    expect(keepPendingEdits(snapshot, {}, pending)[`${SID}_leg_press`].id).toBe("randomLegacyId123");
  });

  it("does not change the maps it was given", () => {
    const prev = { [`${SID}_leg_press`]: log("leg_press", { reps: "12" }) };
    const snapshot = { [`${SID}_leg_press`]: log("leg_press", { reps: "8" }) };
    const pending = pendingLogEdits([{ payload: { sessionId: SID, machineId: "leg_press", reps: "12" } }]);
    keepPendingEdits(snapshot, prev, pending);
    expect(snapshot[`${SID}_leg_press`].reps).toBe("8");
    expect(prev[`${SID}_leg_press`].reps).toBe("12");
  });
});
