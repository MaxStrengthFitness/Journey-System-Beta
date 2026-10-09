/**
 * Finish never loses a session over the client's totals (Sep 24 2026).
 *
 * A cross-train visitor's Finish used to be refused in full: the client's
 * totals were inside the same all-or-nothing batch as the session and its
 * sets, and the rules refused the totals. Now the batch holds the session,
 * the sets and the settings, and the totals are their own write, queued
 * straight after it (before either is awaited, so an offline reload replays
 * both). These check the shape of what completeWorkoutSession writes, against
 * a fake Firestore that records every call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  /** The session's batch: the first batch Finish commits. */
  batchWrites: [] as Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }>,
  commits: 0,
  /**
   * The totals: every later batch, as committed (the client's counters and,
   * since the iPad round, the machine totals document beside the client).
   */
  updateDocs: [] as Array<{ path: string; data: Record<string, unknown>; writes: Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }> }>,
  refuseTotals: false,
  /** Refuse only a batch that writes the machine totals document (its rules not deployed yet). */
  refuseMachineTotals: false,
  refuseBatch: false,
  // While set, the batch's commit waits on it, as an offline commit waits
  // for the server.
  commitGate: null as Promise<void> | null,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  serverTimestamp: () => ({ __server: true }),
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __delete: true }),
  writeBatch: () => {
    const writes: Array<{ op: string; path: string; data: Record<string, unknown>; options?: unknown }> = [];
    return {
      update: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ op: "update", path: ref.path, data }),
      set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => writes.push({ op: "set", path: ref.path, data, options }),
      commit: async () => {
        // The totals' batch touches clients/; the session's never does.
        if (writes.some((w) => w.path.startsWith("clients/"))) {
          const client = writes.find((w) => w.op === "update" && w.path.startsWith("clients/"));
          calls.updateDocs.push({ path: client?.path ?? "", data: client?.data ?? {}, writes });
          if (calls.refuseTotals || (calls.refuseMachineTotals && writes.some((w) => w.path.endsWith("/machineTotals/current")))) {
            throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
          }
          return;
        }
        calls.batchWrites.push(...writes);
        calls.commits += 1;
        if (calls.commitGate) await calls.commitGate;
        if (calls.refuseBatch) {
          throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
        }
      },
    };
  },
}));

/** The machine totals write that rode with the client's counters (features/machine-totals). */
const machineTotalsWrite = (i = 0) => calls.updateDocs[i].writes.find((w) => w.path === "clients/c1/machineTotals/current");
// Finish writes no journal note (the tracker files the Note for the next
// trainer's journal copy itself). If it ever did again, this would say so.
const journal = vi.hoisted(() => ({ created: 0 }));
vi.mock("../hooks/useClientJournal", () => ({
  createJournalEntry: async () => {
    journal.created += 1;
    return "note-1";
  },
}));
vi.mock("./session-count-cache", () => ({ invalidateSessionCount: () => {} }));

import { completeWorkoutSession } from "./sync-utils";
import { withMachineTotals } from "../features/machine-totals/totals";

const session = { id: "sess1", sessionNumber: 41, hostedAtStudioId: "studioA", date: "2026-09-24" };
const client = { id: "c1", homeStudioId: "studioB", firstName: "Casey", completedSessions: 40 };
const logs = [
  { id: "sess1_m1", sessionId: "sess1", machineId: "m1", weight: "180", reps: "9" },
  { id: "sess1_m2", sessionId: "sess1", machineId: "m2", weight: "120", reps: "10" },
];
const trainer = { id: "t1", fullName: "Trainer A", initials: "TA" };

function finish(nextTrainerNote = "") {
  return completeWorkoutSession(
    {} as never,
    session,
    client,
    logs,
    nextTrainerNote,
    trainer,
    {},
    "uid-t1",
  );
}

beforeEach(() => {
  journal.created = 0;
  calls.batchWrites = [];
  calls.commits = 0;
  calls.updateDocs = [];
  calls.refuseTotals = false;
  calls.refuseMachineTotals = false;
  calls.refuseBatch = false;
  calls.commitGate = null;
});

describe("completeWorkoutSession", () => {
  it("commits the session, the sets and the settings in one batch, without the client", async () => {
    await finish();
    expect(calls.commits).toBe(1);
    const paths = calls.batchWrites.map((w) => w.path);
    expect(paths).toContain("sessions/sess1");
    expect(paths).toContain("exerciseLogs/sess1_m1");
    expect(paths).toContain("clientMachineSettings/c1_m1");
    // A weight set for this session at the last Wrap-up is used up once the
    // machine is logged (features/next-weight, Oct 2 2026).
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.nextWeight).toEqual({ __delete: true });
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
    // The machine maps are no longer on the client: they go to the totals
    // document, in the same batch, as a set that touches only these paths.
    expect(Object.keys(calls.updateDocs[0].data).some((k) => k.startsWith("currentMachineMetrics") || k.startsWith("machineStats"))).toBe(false);
    const machines = machineTotalsWrite()!;
    expect(machines.op).toBe("set");
    expect((machines.data.currentMachineMetrics as any).m1.weight).toBe("180");
    expect((machines.data.machineStats as any).m1.timesPerformed).toEqual({ __increment: 1 });
    expect((machines.options as any).mergeFields).toEqual(
      expect.arrayContaining(["currentMachineMetrics.m1", "machineStats.m1.timesPerformed", "updatedAt"]),
    );
    expect(r.totalsSaved).toBe(true);
  });

  it("finishes an unfinished session under its own day, never over what she did since (Oct 2 2026)", async () => {
    const later = {
      ...client,
      lastSessionDate: "2026-09-28",
      currentMachineMetrics: { m1: { weight: "190", lastPerformedDate: new Date("2026-09-28T15:00:00Z") } },
    };
    await completeWorkoutSession({} as never, session, later, logs, "", trainer, {}, "uid-t1", undefined, { asOfDay: "2026-09-24" });
    const totals = calls.updateDocs[0].data;
    // One more session, never renumbering her count back to 41.
    expect(totals.sessionCount).toEqual({ __increment: 1 });
    // Her last-session day only moves forward.
    expect(totals).not.toHaveProperty("lastSessionDate");
    // m1 was done since: left alone. m2 was not: written, on the session's own day.
    const metrics = machineTotalsWrite()!.data.currentMachineMetrics as any;
    expect(metrics).not.toHaveProperty("m1");
    expect(metrics.m2.lastPerformedDate).toBeInstanceOf(Date);
    const paths = calls.batchWrites.map((w) => w.path);
    expect(paths).not.toContain("clientMachineSettings/c1_m1");
    expect(paths).toContain("clientMachineSettings/c1_m2");
  });

  it("never writes a first weight off totals that haven't answered: a migrated client keeps the real one (the review, Oct 6 2026)", async () => {
    // After the migration the roster's client carries no machine maps; the
    // totals document is still loading (offline, or the first second).
    const loading = withMachineTotals({ ...client }, { state: "loading", data: null });
    await completeWorkoutSession({} as never, session, loading, logs, "", trainer, {}, "uid-t1");
    const stats = machineTotalsWrite()!.data.machineStats as any;
    const fields = (machineTotalsWrite()!.options as any).mergeFields as string[];
    expect(stats.m1.timesPerformed).toEqual({ __increment: 1 });
    expect(fields.some((f) => /firstPerformedDate|firstWeight/.test(f))).toBe(false);
    // Today's session is the newest by definition: last time and the prefill still move.
    expect(stats.m1.lastWeight).toBe(180);
    expect(stats.m1.lastPerformedDate).toBe("2026-09-24");
    expect((machineTotalsWrite()!.data.currentMachineMetrics as any).m1.weight).toBe("180");
  });

  it("finishing an old session with totals unknown leaves every last time and next weight alone", async () => {
    const loading = withMachineTotals({ ...client, lastSessionDate: "2026-09-20" }, { state: "loading", data: null });
    await completeWorkoutSession({} as never, session, loading, logs, "", trainer, {}, "uid-t1", undefined, { asOfDay: "2026-09-24" });
    const w = machineTotalsWrite()!;
    const fields = (w.options as any).mergeFields as string[];
    expect(w.data).not.toHaveProperty("currentMachineMetrics");
    expect(fields.filter((f) => f.startsWith("machineStats")).sort()).toEqual(["machineStats.m1.timesPerformed", "machineStats.m2.timesPerformed"]);
    const paths = calls.batchWrites.map((x) => x.path);
    expect(paths).not.toContain("clientMachineSettings/c1_m1");
    expect(paths).not.toContain("clientMachineSettings/c1_m2");
    // The counters still count it.
    expect(calls.updateDocs[0].data.completedSessions).toEqual({ __increment: 1 });
  });

  it("moves her last-session day to the old session's day when nothing came after", async () => {
    await completeWorkoutSession({} as never, session, { ...client, lastSessionDate: "2026-09-20" }, logs, "", trainer, {}, "uid-t1", undefined, {
      asOfDay: "2026-09-24",
    });
    expect(calls.updateDocs[0].data.lastSessionDate).toBe("2026-09-24");
  });

  it("keeps the session when the totals are refused, and says so instead of throwing", async () => {
    calls.refuseTotals = true;
    const r = await finish();
    expect(calls.commits).toBe(1);
    expect(r.totalsSaved).toBe(false);
  });

  it("saves the counters on their own when only the machine totals document is refused (its rules not live yet)", async () => {
    calls.refuseMachineTotals = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await finish();
    expect(calls.updateDocs).toHaveLength(2);
    // The second ask is the client's counters alone.
    expect(calls.updateDocs[1].writes.map((w) => w.path)).toEqual(["clients/c1"]);
    expect(calls.updateDocs[1].data.completedSessions).toEqual({ __increment: 1 });
    expect(r.totalsSaved).toBe(true);
  });

  it("queues the totals before the session's commit is acknowledged, so an offline reload replays both", async () => {
    let release!: () => void;
    calls.commitGate = new Promise<void>((r) => (release = r));
    const pending = finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.commits).toBe(1);
    expect(calls.updateDocs.map((u) => u.path)).toEqual(["clients/c1"]);
    release();
    const r = await pending;
    expect(r.totalsSaved).toBe(true);
  });

  it("throws when the session is refused, and a retry does not count the session twice", async () => {
    calls.refuseBatch = true;
    const session2 = { ...session, id: "sess-retry" };
    const run = () =>
      completeWorkoutSession({} as never, session2, client, logs, "", trainer, {}, "uid-t1");
    await expect(run()).rejects.toThrow(/permissions/);
    expect(calls.updateDocs).toHaveLength(1);
    calls.refuseBatch = false;
    const r = await run();
    expect(calls.commits).toBe(2);
    expect(calls.updateDocs).toHaveLength(1);
    expect(r.totalsSaved).toBe(true);
  });

  it("has no totals to write without a client", async () => {
    const r = await completeWorkoutSession({} as never, session, null, logs, "", trainer, {}, "uid-t1");
    expect(calls.updateDocs).toHaveLength(0);
    expect(r.totalsSaved).toBeNull();
  });

  it("puts the Note for the next trainer on the session, whole, and writes no journal note itself", async () => {
    const r = await finish("  Knee sore after the move.  ");
    const sessionWrite = calls.batchWrites.find((w) => w.path === "sessions/sess1")!;
    expect(sessionWrite.data.notes).toBe("Knee sore after the move.");
    // The Wrap-up writes the dose itself, the moment it is tapped.
    expect(sessionWrite.data).not.toHaveProperty("dose");
    expect(journal.created).toBe(0);
    expect(r).toEqual({ totalsSaved: true });
  });

  it("leaves the session's note alone when the End Session box was empty", async () => {
    await finish("   ");
    const sessionWrite = calls.batchWrites.find((w) => w.path === "sessions/sess1")!;
    expect(sessionWrite.data).not.toHaveProperty("notes");
  });

  /* The open session round's review (Oct 9 2026): Who's this? at Finish
     opens the client's settings a moment before Finish runs. A machine
     missing from settings nobody has read from the server is not "nothing on
     file": a merged `settings: {}` would still replace the saved seat and
     positions, and a starting weight would be written over the real one. */
  it("with the client's settings not known yet, writes today's weight and leaves the saved settings and starting weight alone", async () => {
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, {}, "uid-t1", undefined, { settingsOnFileKnown: false });
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.currentWeight).toBe(180);
    expect(setting.options).toEqual({ merge: true });
    for (const kept of ["settings", "startingWeight", "startingWeightDate"]) {
      expect(setting.data, kept).not.toHaveProperty(kept);
    }
  });

  it("not known yet, a machine whose settings ARE on screen writes them back as before", async () => {
    const onScreen = { m1: { machineId: "m1", settings: { seat: "4" }, startingWeight: 150 } };
    await completeWorkoutSession({} as never, session, client, logs, "", trainer, onScreen, "uid-t1", undefined, { settingsOnFileKnown: false });
    const m1 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(m1.data.settings).toEqual({ seat: "4" });
    expect(m1.data).not.toHaveProperty("startingWeight");
    // m2 has no entry: left alone.
    const m2 = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m2")!;
    expect(m2.data).not.toHaveProperty("settings");
    expect(m2.data).not.toHaveProperty("startingWeight");
  });

  it("known (the default): a first time on a machine records its starting weight, as before", async () => {
    await finish();
    const setting = calls.batchWrites.find((w) => w.path === "clientMachineSettings/c1_m1")!;
    expect(setting.data.settings).toEqual({});
    expect(setting.data.startingWeight).toBe(180);
  });
});
