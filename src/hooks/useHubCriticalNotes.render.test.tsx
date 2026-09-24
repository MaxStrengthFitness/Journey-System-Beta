// @vitest-environment jsdom
/**
 * THE HUB'S ONE READ OF CRITICAL NOTES (question 12, AJ Sep 24 2026).
 *
 * Mounts `useHubCriticalNotes` against a fake query listener and pins:
 *   - one listener per thirty clients, never one per client, and none for an
 *     empty day;
 *   - each asks `clientId in [...]` and `importance == "critical"`, with the
 *     guard rail;
 *   - unknown is not empty: a group that has not answered, failed, or hit
 *     the guard rail leaves its silent clients `null`, never `[]`;
 *   - a failed group keeps the notes it had, so a lit triangle stays lit;
 *   - the same clients in another order are the same read, and another day's
 *     clients never inherit the last day's answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Constraint = { kind: "where"; field: string; op: string; value: unknown } | { kind: "limit"; n: number };
type Listener = {
  path: string;
  constraints: Constraint[];
  next: (snap: unknown) => void;
  error: (err: unknown) => void;
  live: boolean;
};

const fake = vi.hoisted(() => ({ listeners: [] as Listener[], errors: [] as string[] }));

vi.mock("../firebase", () => ({ db: { __fake: true }, auth: { currentUser: null } }));
vi.mock("../lib/firestore-errors", () => ({
  OperationType: { GET: "get", LIST: "list" },
  handleFirestoreError: (_err: unknown, _op: string, path: string) => {
    fake.errors.push(path);
  },
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, path: string) => ({ path }),
    where: (field: string, op: string, value: unknown) => ({ kind: "where", field, op, value }),
    limit: (n: number) => ({ kind: "limit", n }),
    query: (ref: { path: string }, ...constraints: Constraint[]) => ({ path: ref.path, constraints }),
    onSnapshot: (q: { path: string; constraints: Constraint[] }, next: (s: unknown) => void, error: (e: unknown) => void) => {
      const l: Listener = { path: q.path, constraints: q.constraints, next, error, live: true };
      fake.listeners.push(l);
      return () => {
        l.live = false;
      };
    },
  };
});

import { HUB_CRITICAL_GUARD, clientSetKey, useHubCriticalNotes, type HubCriticalNotes } from "./useHubCriticalNotes";

let result: HubCriticalNotes | null = null;
function Probe({ ids }: { ids: string[] }) {
  result = useHubCriticalNotes(ids);
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(ids: string[]) {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <StrictMode>
        <Probe ids={ids} />
      </StrictMode>,
    );
  });
}

const live = () => fake.listeners.filter((l) => l.live);
const inValues = (l: Listener) =>
  (l.constraints.find((c) => c.kind === "where" && c.field === "clientId") as { value: string[] }).value;

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data: () => ({
    clientId: "c01",
    importance: "critical",
    body: "Left shoulder: no overhead pressing",
    threadId: null,
    isArchived: false,
    resolvedAt: null,
    ...over,
  }),
});

async function answer(l: Listener, docs: ReturnType<typeof doc>[]) {
  await act(async () => l.next({ docs }));
}
async function fail(l: Listener) {
  await act(async () => l.error(new Error("permission-denied")));
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${String(i + 1).padStart(2, "0")}`);

beforeEach(() => {
  fake.listeners.length = 0;
  fake.errors.length = 0;
  result = null;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("useHubCriticalNotes — one read for the day's clients", () => {
  it("opens nothing for a day with nobody booked, and claims nothing", async () => {
    await render([]);
    expect(live()).toHaveLength(0);
    expect(result!.status).toBe("ready");
    expect(result!.notesFor("c01")).toBeNull();
  });

  it("asks thirty clients to a listener, for Critical notes only, with the guard rail", async () => {
    await render(ids(45));
    const open = live();
    expect(open).toHaveLength(2);
    expect(open.map((l) => inValues(l).length)).toEqual([30, 15]);
    for (const l of open) {
      expect(l.path).toBe("journalEntries");
      expect(l.constraints).toContainEqual({ kind: "where", field: "importance", op: "==", value: "critical" });
      expect(l.constraints).toContainEqual({ kind: "limit", n: HUB_CRITICAL_GUARD });
      expect(l.constraints.find((c) => c.kind === "where" && c.field === "clientId")).toMatchObject({ op: "in" });
    }
  });

  it("is loading, and every client unknown, until the groups answer", async () => {
    await render(ids(45));
    const [first, second] = live();
    expect(result!.status).toBe("loading");
    expect(result!.notesFor("c01")).toBeNull();

    await answer(first, [doc("n1", { clientId: "c02" })]);
    expect(result!.status).toBe("loading");
    expect(result!.notesFor("c02")).toHaveLength(1);
    expect(result!.notesFor("c01")).toEqual([]); // read, and none
    expect(result!.notesFor("c40")).toBeNull(); // its group has not answered

    await answer(second, []);
    expect(result!.status).toBe("ready");
    expect(result!.notesFor("c40")).toEqual([]);
  });

  it("hands out Critical roots only — an update on a thread never counts", async () => {
    await render(ids(3));
    await answer(live()[0], [doc("root", { clientId: "c01" }), doc("u1", { clientId: "c01", threadId: "root" })]);
    expect(result!.notesFor("c01")!.map((n) => n.id)).toEqual(["root"]);
  });

  it("a failed group leaves its silent clients unknown, never clear — and says the day is incomplete", async () => {
    await render(ids(45));
    const [first, second] = live();
    await answer(first, []);
    await fail(second);
    expect(result!.status).toBe("incomplete");
    expect(result!.notesFor("c01")).toEqual([]);
    expect(result!.notesFor("c40")).toBeNull();
    expect(fake.errors).toEqual(["journalEntries"]);
  });

  it("a group that fails after answering keeps the notes it had, so a lit triangle stays lit", async () => {
    await render(ids(3));
    const [only] = live();
    await answer(only, [doc("n1", { clientId: "c02" })]);
    await fail(only);
    expect(result!.status).toBe("incomplete");
    expect(result!.notesFor("c02")).toHaveLength(1);
    expect(result!.notesFor("c01")).toBeNull();
  });

  it("a group at its guard rail keeps what it read and leaves its silent clients unknown", async () => {
    await render(ids(3));
    const many = Array.from({ length: HUB_CRITICAL_GUARD }, (_, i) => doc(`n${i}`, { clientId: "c01" }));
    await answer(live()[0], many);
    expect(result!.status).toBe("incomplete");
    expect(result!.notesFor("c01")).toHaveLength(HUB_CRITICAL_GUARD);
    expect(result!.notesFor("c02")).toBeNull();
  });

  it("the same clients in another order are the same read", async () => {
    await render(["c02", "c01", "c02"]);
    const before = live();
    expect(before).toHaveLength(1);
    expect(inValues(before[0])).toEqual(["c01", "c02"]);
    await render(["c01", "c02"]);
    expect(live()).toEqual(before);
  });

  it("another day's clients never inherit the last day's answer", async () => {
    await render(["c01", "c02"]);
    await answer(live()[0], [doc("n1", { clientId: "c01" })]);
    expect(result!.notesFor("c01")).toHaveLength(1);

    await render(["c01", "c03"]);
    const open = live();
    expect(open).toHaveLength(1);
    expect(inValues(open[0])).toEqual(["c01", "c03"]);
    expect(result!.status).toBe("loading");
    expect(result!.notesFor("c01")).toBeNull();
  });

  it("closes its listeners when the Hub goes away", async () => {
    await render(ids(45));
    expect(live()).toHaveLength(2);
    act(() => root?.unmount());
    root = null;
    expect(live()).toHaveLength(0);
  });
});

describe("clientSetKey", () => {
  it("ignores blanks, duplicates and order", () => {
    expect(clientSetKey(["b", " a ", null, "", undefined, "b"])).toBe("a\nb");
  });
});
