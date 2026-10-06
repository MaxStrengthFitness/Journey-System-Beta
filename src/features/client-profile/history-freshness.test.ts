import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import {
  historySignature,
  inProgressLeft,
  mergeHistoryLogs,
  mergeHistoryPage,
  shouldReadHistory,
} from "./history-freshness";

const s = (id: string, date: string, extra: Partial<WorkoutSession> = {}) =>
  ({ id, date, status: "Completed", ...extra }) as WorkoutSession;
const log = (id: string, sessionId: string) => ({ id, sessionId }) as ExerciseLog;

describe("shouldReadHistory", () => {
  it("reads when someone asks, whatever the tab", () => {
    expect(shouldReadHistory({ tabDrawsIt: false, asked: true, read: "ready", changedSinceRead: false })).toBe(true);
  });
  it("reads nothing while neither tab that draws the page is open", () => {
    expect(shouldReadHistory({ tabDrawsIt: false, asked: false, read: null, changedSinceRead: true })).toBe(false);
  });
  it("reads a client with no whole answer yet", () => {
    for (const read of [null, "cache-only", "failed"] as const) {
      expect(shouldReadHistory({ tabDrawsIt: true, asked: false, read, changedSinceRead: false })).toBe(true);
    }
  });
  it("does not read again on a return to Journey when nothing changed", () => {
    expect(shouldReadHistory({ tabDrawsIt: true, asked: false, read: "ready", changedSinceRead: false })).toBe(false);
  });
  it("reads again when the record changed since the last read", () => {
    expect(shouldReadHistory({ tabDrawsIt: true, asked: false, read: "ready", changedSinceRead: true })).toBe(true);
  });
  it("reads on every return while the In-Progress listener has failed: a change is unknown, not absent", () => {
    expect(shouldReadHistory({ tabDrawsIt: true, asked: false, read: "ready", changedSinceRead: false, watchFailed: true })).toBe(true);
    expect(shouldReadHistory({ tabDrawsIt: false, asked: false, read: "ready", changedSinceRead: false, watchFailed: true })).toBe(false);
  });
});

describe("inProgressLeft", () => {
  it("is false when nothing was in progress", () => {
    expect(inProgressLeft([], ["a"])).toBe(false);
  });
  it("is false when a session starts", () => {
    expect(inProgressLeft(["a"], ["a", "b"])).toBe(false);
  });
  it("is true when a session in progress finished or was discarded (any iPad)", () => {
    expect(inProgressLeft(["a", "b"], ["b"])).toBe(true);
    expect(inProgressLeft(["a"], [])).toBe(true);
  });
});

describe("historySignature", () => {
  it("is the same for the same record in any order", () => {
    const a = [s("1", "2026-10-01"), s("2", "2026-10-03")];
    expect(historySignature(a)).toBe(historySignature([...a].reverse()));
  });
  it("changes when a session is edited, finished, added or removed", () => {
    const base = [s("1", "2026-10-01", { editCount: 1 } as never)];
    const sig = historySignature(base);
    expect(historySignature([s("1", "2026-10-01", { editCount: 2 } as never)])).not.toBe(sig);
    expect(historySignature([s("1", "2026-10-01", { status: "In-Progress", editCount: 1 } as never)])).not.toBe(sig);
    expect(historySignature([...base, s("2", "2026-10-02")])).not.toBe(sig);
    expect(historySignature([])).not.toBe(sig);
  });
  it("reads a Firestore timestamp's seconds for the edit stamp", () => {
    const a = historySignature([s("1", "d", { editedAt: { seconds: 10, nanoseconds: 0 } } as never)]);
    const b = historySignature([s("1", "d", { editedAt: { seconds: 11, nanoseconds: 0 } } as never)]);
    expect(a).not.toBe(b);
  });
});

describe("mergeHistoryPage", () => {
  it("adds the page to an empty profile, newest first", () => {
    const out = mergeHistoryPage([], [s("a", "2026-10-01"), s("b", "2026-10-03")], { whole: true, pageSize: 50 });
    expect(out.sessions.map((x) => x.id)).toEqual(["b", "a"]);
    expect(out.removed).toEqual([]);
  });
  it("takes away a session the server no longer has inside the page's span", () => {
    const prev = [s("new", "2026-10-04"), s("gone", "2026-10-03"), s("old", "2026-10-01")];
    const page = [s("new", "2026-10-04"), s("old", "2026-10-01")];
    const out = mergeHistoryPage(prev, page, { whole: true, pageSize: 2 });
    expect(out.sessions.map((x) => x.id)).toEqual(["new", "old"]);
    expect(out.removed).toEqual(["gone"]);
  });
  it("keeps older pages the trainer scrolled back through", () => {
    const prev = [s("p1", "2026-10-04"), s("p2", "2026-10-03"), s("older", "2026-01-01")];
    const page = [s("p1", "2026-10-04"), s("p2", "2026-10-03")];
    const out = mergeHistoryPage(prev, page, { whole: true, pageSize: 2 });
    expect(out.sessions.map((x) => x.id)).toEqual(["p1", "p2", "older"]);
  });
  it("a short page is her whole record: anything not on it is gone", () => {
    const prev = [s("a", "2026-10-04"), s("b", "2025-01-01")];
    const out = mergeHistoryPage(prev, [s("a", "2026-10-04")], { whole: true, pageSize: 50 });
    expect(out.removed).toEqual(["b"]);
  });
  it("a cache answer never takes anything away", () => {
    const prev = [s("a", "2026-10-04"), s("b", "2026-10-03")];
    const out = mergeHistoryPage(prev, [s("a", "2026-10-04")], { whole: false, pageSize: 50 });
    expect(out.sessions.map((x) => x.id)).toEqual(["a", "b"]);
    expect(out.removed).toEqual([]);
  });
  it("the page's copy of a session replaces the profile's", () => {
    const prev = [s("a", "2026-10-04", { status: "In-Progress" })];
    const out = mergeHistoryPage(prev, [s("a", "2026-10-04")], { whole: true, pageSize: 50 });
    expect(out.sessions[0].status).toBe("Completed");
  });
});

describe("mergeHistoryLogs", () => {
  it("replaces the page's sets when the server answered (a deleted set leaves)", () => {
    const prev = [log("x", "s1"), log("y", "s1"), log("z", "older")];
    const out = mergeHistoryLogs(prev, ["s1"], [log("x", "s1")], { whole: true });
    expect(out.map((l) => l.id).sort()).toEqual(["x", "z"]);
  });
  it("a removed session's sets leave with it", () => {
    const prev = [log("x", "gone"), log("z", "older")];
    const out = mergeHistoryLogs(prev, [], [], { whole: true, removed: ["gone"] });
    expect(out.map((l) => l.id)).toEqual(["z"]);
  });
  it("from the cache, sets are only added, never taken away, and never doubled", () => {
    const prev = [log("x", "s1"), log("y", "s1")];
    const out = mergeHistoryLogs(prev, ["s1"], [log("x", "s1"), log("w", "s1")], { whole: false });
    expect(out.map((l) => l.id).sort()).toEqual(["w", "x", "y"]);
  });
});
