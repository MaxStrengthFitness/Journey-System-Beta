/**
 * Finish never loses a session over the client's totals (Sep 24 2026).
 *
 * A cross-train visitor's Finish used to be refused in full: the client's
 * totals were inside the same all-or-nothing batch as the session and its
 * sets, and the rules refused the totals. Now the batch holds the session,
 * the sets and the settings, and the totals are written after it, on their
 * own. These check the shape of what completeWorkoutSession writes, against
 * a fake Firestore that records every call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  batchWrites: [] as Array<{ op: string; path: string }>,
  commits: 0,
  updateDocs: [] as Array<{ path: string; data: Record<string, unknown> }>,
  refuseTotals: false,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  serverTimestamp: () => ({ __server: true }),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({
    update: (ref: { path: string }) => calls.batchWrites.push({ op: "update", path: ref.path }),
    set: (ref: { path: string }) => calls.batchWrites.push({ op: "set", path: ref.path }),
    commit: async () => {
      calls.commits += 1;
    },
  }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    calls.updateDocs.push({ path: ref.path, data });
    if (calls.refuseTotals && ref.path.startsWith("clients/")) {
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    }
  },
}));
vi.mock("../hooks/useClientJournal", () => ({ createJournalEntry: async () => "note-1" }));
vi.mock("./session-count-cache", () => ({ invalidateSessionCount: () => {} }));

import { completeWorkoutSession } from "./sync-utils";

const session = { id: "sess1", sessionNumber: 41, hostedAtStudioId: "studioA", date: "2026-09-24" };
const client = { id: "c1", homeStudioId: "studioB", firstName: "Casey", completedSessions: 40 };
const logs = [
  { id: "sess1_m1", sessionId: "sess1", machineId: "m1", weight: "180", reps: "9" },
  { id: "sess1_m2", sessionId: "sess1", machineId: "m2", weight: "120", reps: "10" },
];
const trainer = { id: "t1", fullName: "Trainer A", initials: "TA" };

function finish() {
  return completeWorkoutSession(
    {} as never,
    session,
    client,
    logs,
    undefined,
    "",
    trainer,
    {},
    "uid-t1",
  );
}

beforeEach(() => {
  calls.batchWrites = [];
  calls.commits = 0;
  calls.updateDocs = [];
  calls.refuseTotals = false;
});

describe("completeWorkoutSession", () => {
  it("commits the session, the sets and the settings in one batch, without the client", async () => {
    await finish();
    expect(calls.commits).toBe(1);
    const paths = calls.batchWrites.map((w) => w.path);
    expect(paths).toContain("sessions/sess1");
    expect(paths).toContain("exerciseLogs/sess1_m1");
    expect(paths).toContain("clientMachineSettings/c1_m1");
    expect(paths.some((p) => p.startsWith("clients/"))).toBe(false);
  });

  it("then writes the client's totals on their own, and says they landed", async () => {
    const r = await finish();
    expect(calls.updateDocs).toHaveLength(1);
    expect(calls.updateDocs[0].path).toBe("clients/c1");
    expect(calls.updateDocs[0].data).toMatchObject({
      completedSessions: { __increment: 1 },
      sessionCount: 41,
      lastSessionDate: expect.any(String),
    });
    expect(Object.keys(calls.updateDocs[0].data)).toContain("currentMachineMetrics.m1");
    expect(r.totalsSaved).toBe(true);
  });

  it("keeps the session when the totals are refused, and says so instead of throwing", async () => {
    calls.refuseTotals = true;
    const r = await finish();
    expect(calls.commits).toBe(1);
    expect(r.totalsSaved).toBe(false);
  });

  it("has no totals to write without a client", async () => {
    const r = await completeWorkoutSession({} as never, session, null, logs, undefined, "", trainer, {}, "uid-t1");
    expect(calls.updateDocs).toHaveLength(0);
    expect(r.totalsSaved).toBeNull();
  });
});
