// @vitest-environment jsdom
/**
 * THE PROGRESS GRID MOUNTS — AND STOPS RE-READING ITSELF.
 *
 * Sep 23 2026, the efficiency round.
 *
 * This screen fetches every exercise log for the sessions it is showing. That
 * fetch used to live INSIDE the `sessions` onSnapshot callback, so every
 * snapshot tick re-read all of them from scratch — and `sessions` ticks on
 * every set a trainer records during a live workout. A few hundred documents,
 * re-read per set, to redraw a grid whose contents had not changed.
 *
 * The fix keys the fetch on the session ID LIST rather than on the snapshot.
 * That is a wiring change, and CLAUDE.md is explicit that a green typecheck
 * and suite prove nothing about wiring: "Only *.render.test.tsx files mount
 * anything; add one for any component that does work during render or in a
 * layout effect."
 *
 * What this pins, deliberately narrow:
 *
 *   1. It mounts and draws a machine row from the logs it fetched.
 *   2. A snapshot tick that does NOT change which sessions are on screen
 *      costs no further reads. This is the regression itself.
 *   3. A tick that DOES change the session list re-reads.
 *   4. The chunked `in` queries are batched, not one per session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-coach" } },
  functions: {},
}));

const CLIENT_ID = "c-judy";

/** Twelve completed sessions — enough to need two chunks of ten. */
const SESSION_DOCS = Array.from({ length: 12 }, (_, i) => ({
  id: `sess-${i}`,
  data: () => ({
    clientId: CLIENT_ID,
    status: "Completed",
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  }),
}));

const LOG_DOCS = [
  {
    id: "log-1",
    data: () => ({
      sessionId: "sess-0",
      machineId: "m-leg-press",
      machineName: "Leg Press",
      clientId: CLIENT_ID,
      weight: 120,
      reps: 8,
      outcome: "performed",
    }),
  },
];

/** Every onSnapshot callback, by collection path, so a test can re-fire one. */
let snapshotCallbacks: Record<string, ((s: any) => void)[]> = {};
/** getDocs calls, by collection path. */
let reads: string[] = [];
/** What the `sessions` listener should deliver next. */
let sessionDocs = SESSION_DOCS;

const snap = (docs: any[]) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  forEach: (f: any) => docs.forEach(f),
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) =>
    parts.filter((p) => typeof p === "string").join("/");

  const docsFor = (p: string) => {
    if (p === "sessions") return sessionDocs;
    if (p === "exerciseLogs") return LOG_DOCS;
    return [];
  };

  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => ({}),
    onSnapshot: (q: any, next: any) => {
      const p = q?.__path ?? "";
      const cb = typeof next === "function" ? next : next?.next;
      (snapshotCallbacks[p] ??= []).push(cb);
      cb?.(snap(docsFor(p)));
      return () => {};
    },
    getDocs: async (q: any) => {
      const p = q?.__path ?? "";
      reads.push(p);
      return snap(docsFor(p));
    },
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    setDoc: async () => {},
    updateDoc: async () => {},
    serverTimestamp: () => ({ __server: true }),
    Timestamp: real.Timestamp,
  };
});

import { WorkoutChartGrid } from "./WorkoutChartGrid";

const CLIENTS = [
  { id: CLIENT_ID, firstName: "Judy", lastName: "H", homeStudioId: "solon" },
] as any;

/* The grid's ROWS come from the machines prop; the CELLS come from the logs
 * it fetched. Asserting on a cell is therefore the honest check that the
 * fetch actually happened and was joined in. */
const MACHINES = [
  { id: "m-leg-press", name: "Leg Press", order: 10, muscleGroup: "Legs" },
] as any;

let container: HTMLDivElement;
let root: Root;

const logReads = () => reads.filter((p) => p === "exerciseLogs").length;

/** Deliver another `sessions` snapshot, as a mid-workout write would. */
const tickSessions = async () => {
  await act(async () => {
    snapshotCallbacks["sessions"]?.forEach((cb) => cb(snap(sessionDocs)));
    await Promise.resolve();
  });
};

beforeEach(async () => {
  snapshotCallbacks = {};
  reads = [];
  sessionDocs = SESSION_DOCS;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <WorkoutChartGrid
        clientId={CLIENT_ID}
        clients={CLIENTS}
        machines={MACHINES}
        routines={[]}
        onBack={() => {}}
        user={{ uid: "uid-coach" }}
        activeStudioId="solon"
      />,
    );
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("WorkoutChartGrid — it mounts", () => {
  it("draws a machine row, with the weight from the logs it fetched", () => {
    expect(container.textContent).toContain("Leg Press");
    // 120 lb is only in LOG_DOCS, so seeing it proves the exerciseLogs read
    // landed and was joined onto the row rather than the row merely
    // rendering from the machines prop.
    expect(container.textContent).toContain("120");
  });

  it("batches the log fetch into chunks of ten rather than one call per session", () => {
    // 12 sessions, Firestore's `in` takes 10 ids: two calls, not twelve.
    expect(logReads()).toBe(2);
  });
});

describe("WorkoutChartGrid — a snapshot tick is not a re-read", () => {
  it("does NOT re-fetch logs when the same sessions are delivered again", async () => {
    const before = logReads();
    await tickSessions();
    await tickSessions();
    // This is the whole point: mid-workout writes tick this listener
    // constantly, and none of those ticks change which sessions are shown.
    expect(logReads()).toBe(before);
  });

  it("DOES re-fetch when the set of sessions actually changes", async () => {
    const before = logReads();
    sessionDocs = [
      ...SESSION_DOCS,
      {
        id: "sess-new",
        data: () => ({
          clientId: CLIENT_ID,
          status: "Completed",
          date: "2026-09-22",
        }),
      },
    ];
    await tickSessions();
    expect(logReads()).toBeGreaterThan(before);
  });
});
