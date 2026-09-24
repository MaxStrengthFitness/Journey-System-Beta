// @vitest-environment jsdom
/**
 * THE JOURNAL SAYS WHAT IT COULD READ (client codex, phase 1).
 *
 * Two additive fields on the hook every record screen already holds:
 *   - `loadState` - notes / focuses / sessions, each loading | ready | failed,
 *     so a screen can say "couldn't load" instead of "No notes yet";
 *   - `recentSessions` - the session documents the hook ALREADY streams for the
 *     wrap-up notes, handed out so no screen opens a second sessions query.
 *
 * A fake Firestore records every listener and lets each test answer or fail
 * one by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Constraint = { type: string; field?: string; op?: string; value?: unknown; n?: number; dir?: string };
type Listener = {
  path: string;
  constraints: Constraint[];
  next: (snap: unknown) => void;
  error?: (err: unknown) => void;
  live: boolean;
};

const fake = vi.hoisted(() => ({ listeners: [] as Listener[] }));

vi.mock("../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } } }));
vi.mock("../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({
    path: parts.filter((p) => typeof p === "string").join("/"),
  });
  return {
    ...real,
    collection: ref,
    doc: ref,
    query: (target: { path: string }, ...constraints: Constraint[]) => ({ path: target.path, constraints }),
    where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
    orderBy: (field: string, dir?: string) => ({ type: "orderBy", field, dir }),
    limit: (n: number) => ({ type: "limit", n }),
    onSnapshot: (q: { path: string; constraints?: Constraint[] }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      const l: Listener = { path: q.path, constraints: q.constraints ?? [], next, error, live: true };
      fake.listeners.push(l);
      return () => {
        l.live = false;
      };
    },
  };
});

import { useClientJournal, type UseClientJournalResult } from "./useClientJournal";
import type { Client } from "../types";

const clientA = { id: "c1", homeStudioId: "s1", firstName: "Judy" } as Client;
const clientB = { id: "c2", homeStudioId: "s1", firstName: "Ruth" } as Client;

let last: UseClientJournalResult | null = null;
function Probe({ client, enabled }: { client: Client | null; enabled?: boolean }) {
  last = useClientJournal({ clientId: client?.id ?? null, client, trainers: [], enabled });
  return null;
}

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return root;
}

/** The live listeners on a collection (StrictMode opens and closes one first). */
const live = (path: string) => fake.listeners.filter((l) => l.live && l.path === path);
const one = (path: string) => {
  const ls = live(path);
  expect(ls).toHaveLength(1);
  return ls[0];
};

const answer = (path: string, rows: Array<Record<string, unknown>> = []) =>
  act(async () => {
    one(path).next({
      docs: rows.map((r) => ({ id: String(r.id), data: () => r })),
      size: rows.length,
      empty: rows.length === 0,
    });
  });
const fail = (path: string, code = "unavailable") =>
  act(async () => {
    one(path).error?.({ code, message: code });
  });

const NOTES = ["journalEntries", "sessionNotes", "clinicalIncidents"];
const FOCUSES = ["clientFocuses", "focusRecords", "trainerFocuses"];

beforeEach(() => {
  fake.listeners.length = 0;
  last = null;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("useClientJournal.loadState", () => {
  it("is loading everywhere until the listeners answer — never ready by default", async () => {
    await mount(<Probe client={clientA} />);
    expect(last!.loadState).toEqual({ notes: "loading", focuses: "loading", sessions: "loading" });
    expect(last!.recentSessions).toEqual([]);
  });

  it("makes a group ready only when every one of its listeners has answered", async () => {
    await mount(<Probe client={clientA} />);
    await answer("journalEntries");
    await answer("sessionNotes");
    expect(last!.loadState!.notes).toBe("loading");
    await answer("clinicalIncidents");
    expect(last!.loadState!.notes).toBe("ready");
    // The other groups are their own.
    expect(last!.loadState!.focuses).toBe("loading");
    expect(last!.loadState!.sessions).toBe("loading");
    for (const p of FOCUSES) await answer(p);
    expect(last!.loadState!.focuses).toBe("ready");
  });

  it("fails a group when any one of its listeners fails, even after the rest answered", async () => {
    await mount(<Probe client={clientA} />);
    await answer("journalEntries");
    await answer("clinicalIncidents");
    await fail("sessionNotes");
    expect(last!.loadState!.notes).toBe("failed");
    await fail("clientFocuses", "permission-denied");
    expect(last!.loadState!.focuses).toBe("failed");
    await fail("sessions");
    expect(last!.loadState!.sessions).toBe("failed");
    expect(last!.recentSessions).toEqual([]);
  });

  it("does not call a missing index a failure: it falls back to the unordered query and waits", async () => {
    await mount(<Probe client={clientA} />);
    const ordered = one("journalEntries");
    expect(ordered.constraints.some((c) => c.type === "orderBy")).toBe(true);
    await fail("journalEntries", "failed-precondition");
    const unordered = one("journalEntries");
    expect(unordered.constraints.some((c) => c.type === "orderBy")).toBe(false);
    await answer("sessionNotes");
    await answer("clinicalIncidents");
    expect(last!.loadState!.notes).toBe("loading");
    await answer("journalEntries");
    expect(last!.loadState!.notes).toBe("ready");
    expect(last!.needsIndex).toBe(true);
  });

  it("starts over for the next client — the last client's answers are not this one's", async () => {
    const root = await mount(<Probe client={clientA} />);
    for (const p of [...NOTES, ...FOCUSES, "sessions"]) await answer(p, p === "sessions" ? [{ id: "s-a", clientId: "c1", date: "2026-09-01" }] : []);
    expect(last!.loadState).toEqual({ notes: "ready", focuses: "ready", sessions: "ready" });
    expect(last!.recentSessions!.map((s) => s.id)).toEqual(["s-a"]);

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe client={clientB} />
        </StrictMode>,
      );
    });
    expect(last!.loadState).toEqual({ notes: "loading", focuses: "loading", sessions: "loading" });
    expect(last!.recentSessions).toEqual([]);
  });

  it("never hands out the last client's sessions when another of this client's listeners answers first", async () => {
    const root = await mount(<Probe client={clientA} />);
    for (const p of [...NOTES, ...FOCUSES, "sessions"]) {
      await answer(p, p === "sessions" ? [{ id: "s-a", clientId: "c1", date: "2026-09-01", notes: "Judy's wrap-up" }] : []);
    }
    expect(last!.recentSessions!.map((s) => s.id)).toEqual(["s-a"]);
    expect(last!.entries.some((e) => e.body.includes("Judy's wrap-up"))).toBe(true);

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe client={clientB} />
        </StrictMode>,
      );
    });
    // Ruth's notes answer before her sessions do.
    for (const p of NOTES) await answer(p);
    expect(last!.loadState!.notes).toBe("ready");
    expect(last!.loadState!.sessions).toBe("loading");
    expect(last!.recentSessions).toEqual([]);
    // Nor does Judy's wrap-up note sit in Ruth's journal meanwhile.
    expect(last!.entries.some((e) => e.body.includes("Judy's wrap-up"))).toBe(false);

    await answer("sessions", [{ id: "s-b", clientId: "c2", date: "2026-09-02" }]);
    expect(last!.loadState!.sessions).toBe("ready");
    expect(last!.recentSessions!.map((s) => s.id)).toEqual(["s-b"]);
  });

  it("reads as loading while paused", async () => {
    await mount(<Probe client={clientA} enabled={false} />);
    expect(fake.listeners).toHaveLength(0);
    expect(last!.loadState).toEqual({ notes: "loading", focuses: "loading", sessions: "loading" });
  });
});

describe("useClientJournal.recentSessions", () => {
  it("is the ONE sessions listener the hook already runs: the client's 40 newest, by date", async () => {
    await mount(<Probe client={clientA} />);
    const sessions = one("sessions");
    expect(sessions.constraints).toEqual([
      { type: "where", field: "clientId", op: "==", value: "c1" },
      { type: "orderBy", field: "date", dir: "desc" },
      { type: "limit", n: 40 },
    ]);
    await answer("sessions", [
      { id: "s2", clientId: "c1", date: "2026-09-20", sessionNumber: 2 },
      { id: "s1", clientId: "c1", date: "2026-09-10", sessionNumber: 1 },
    ]);
    expect(last!.loadState!.sessions).toBe("ready");
    expect(last!.recentSessions!.map((s) => s.id)).toEqual(["s2", "s1"]);
    // Still exactly one sessions listener after it answered.
    expect(live("sessions")).toHaveLength(1);
  });
});
