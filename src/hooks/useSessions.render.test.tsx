// @vitest-environment jsdom
/**
 * THE STUDIO'S SESSIONS STREAM (speed round, Oct 5 2026, R16): known only
 * once the server has answered, the window moving at the studio's midnight,
 * and a session that did not change keeping its object.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Doc = { id: string; data: () => Record<string, unknown> };
const fs = vi.hoisted(() => ({
  listeners: [] as Array<{
    since: number;
    options: unknown;
    next: (snap: unknown) => void;
    error: (e: unknown) => void;
    closed: boolean;
  }>,
}));

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("../lib/firestore-errors", () => ({ OperationType: { GET: "get" }, handleFirestoreError: () => {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  orderBy: () => ({}),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  Timestamp: { fromDate: (d: Date) => ({ ms: d.getTime() }) },
  query: (_c: unknown, ...constraints: Array<{ field?: string; value?: { ms?: number } }>) => ({
    since: constraints.find((c) => c.field === "createdAt")?.value?.ms ?? 0,
  }),
  onSnapshot: (q: { since: number }, options: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
    const l = { since: q.since, options, next, error, closed: false };
    fs.listeners.push(l);
    return () => {
      l.closed = true;
    };
  },
}));

import { sharedSessions, useSessions } from "./useSessions";

const doc = (id: string, data: Record<string, unknown>): Doc => ({ id, data: () => data });
const snap = (docs: Doc[], changed: string[], fromCache: boolean) => ({
  docs,
  docChanges: () => changed.map((id) => ({ doc: { id } })),
  metadata: { fromCache },
});

const seen: Array<{ sessions: unknown[]; known: boolean }> = [];
function Probe() {
  const { sessions, sessionsKnown } = useSessions("westlake", true);
  seen.push({ sessions, known: sessionsKnown });
  return null;
}
const last = () => seen[seen.length - 1];

let root: Root;
beforeEach(() => {
  fs.listeners = [];
  seen.length = 0;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-10-05T14:00:00Z")); // 10:00 AM at the studio
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useSessions", () => {
  it("listens with metadata, and says the sessions are known only once the server has answered", () => {
    expect(fs.listeners).toHaveLength(1);
    expect(fs.listeners[0].options).toEqual({ includeMetadataChanges: true });
    const docs = [doc("s1", { status: "Completed", clientId: "c1" })];
    act(() => fs.listeners[0].next(snap(docs, ["s1"], true)));
    expect(last().sessions).toHaveLength(1);
    expect(last().known).toBe(false);
    act(() => fs.listeners[0].next(snap(docs, [], false)));
    expect(last().known).toBe(true);
    // A later cache-only answer (a passing Wi-Fi drop) does not take it back.
    act(() => fs.listeners[0].next(snap(docs, [], true)));
    expect(last().known).toBe(true);
  });

  it("a heartbeat makes only the session it changed a new object", () => {
    const a = doc("a", { status: "Completed", clientId: "c1" });
    const b = doc("b", { status: "In-Progress", clientId: "c2", lastHeartbeatAt: 1 });
    act(() => fs.listeners[0].next(snap([b, a], ["a", "b"], false)));
    const first = last().sessions as Array<{ id: string }>;
    const b2 = doc("b", { status: "In-Progress", clientId: "c2", lastHeartbeatAt: 2 });
    act(() => fs.listeners[0].next(snap([b2, a], ["b"], false)));
    const second = last().sessions as Array<{ id: string; lastHeartbeatAt?: number }>;
    expect(second).not.toBe(first);
    expect(second[1]).toBe(first[1]);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].lastHeartbeatAt).toBe(2);
  });

  it("moves its 24-hour window at the studio's midnight", () => {
    const firstSince = fs.listeners[0].since;
    expect(firstSince).toBe(new Date("2026-10-04T14:00:00Z").getTime());
    // Just past midnight at the studio (Eastern, -04:00).
    act(() => {
      vi.advanceTimersByTime(new Date("2026-10-06T04:00:01Z").getTime() - Date.now());
    });
    expect(fs.listeners).toHaveLength(2);
    expect(fs.listeners[0].closed).toBe(true);
    expect(fs.listeners[1].since).toBeGreaterThan(firstSince);
    // 24 hours before the moment the studio’s new day began (a second’s slack).
    expect(fs.listeners[1].since).toBeGreaterThanOrEqual(new Date("2026-10-05T04:00:00Z").getTime());
    expect(fs.listeners[1].since).toBeLessThanOrEqual(new Date("2026-10-05T04:00:01Z").getTime());
    // The new listener has not answered from the server: unknown, never empty.
    expect(last().known).toBe(false);
  });
});

describe("sharedSessions", () => {
  it("keeps the same list when nothing changed", () => {
    const prev = [{ id: "a" }, { id: "b" }] as never[];
    const out = sharedSessions(prev, [doc("a", {}), doc("b", {})], new Set());
    expect(out).toBe(prev);
  });

  it("drops a removed session and adds a new one", () => {
    const prev = [{ id: "a", n: 1 }, { id: "b", n: 1 }] as never[];
    const out = sharedSessions(prev, [doc("c", { n: 2 }), doc("a", { n: 9 })], new Set(["c", "b"]));
    expect(out.map((s) => s.id)).toEqual(["c", "a"]);
    expect(out[1]).toBe(prev[0]);
  });

  it("a changed document is read again, never kept", () => {
    const prev = [{ id: "a", status: "In-Progress" }] as never[];
    const out = sharedSessions(prev, [doc("a", { status: "Completed" })], new Set(["a"]));
    expect(out).not.toBe(prev);
    expect((out[0] as { status: string }).status).toBe("Completed");
  });
});
