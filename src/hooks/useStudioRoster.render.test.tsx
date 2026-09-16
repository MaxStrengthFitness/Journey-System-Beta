// @vitest-environment jsdom
/**
 * Mounts `useStudioRoster` against a fake Firestore.
 *
 * The bugs this hook replaced were all about timing — a re-read dropped while
 * another was in flight, a studio switch that kept the old roster, a client
 * created after the first read that never arrived — and only a mount checks
 * timing (CLAUDE.md: add a render test for any hook that works in effects).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../firebase", () => ({ db: { __fake: true }, auth: {} }));
const handleFirestoreError = vi.fn();
vi.mock("../lib/firestore-errors", () => ({
  OperationType: { GET: "get", LIST: "list" },
  handleFirestoreError: (...a: unknown[]) => handleFirestoreError(...a),
}));

type Doc = { id: string; homeStudioId?: string; firstName: string };

/** The "database". */
let clients: Doc[] = [];
/** Ids a by-id read is refused for (another studio's client). */
let forbidden = new Set<string>();
/** Open studio listeners: studio → handlers. */
let listeners: { studio: string; next: (s: any) => void; error: (e: any) => void; closed: boolean }[] = [];
const byIdQueries: string[][] = [];
const singleGets: string[] = [];

const snapOf = (docs: Doc[]) => ({
  docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
});

function push(studio: string) {
  for (const l of listeners) {
    if (!l.closed && l.studio === studio) l.next(snapOf(clients.filter((c) => c.homeStudioId === studio)));
  }
}

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, _path: string, id: string) => ({ id }),
  documentId: () => "__name__",
  limit: (n: number) => ({ type: "limit", n }),
  where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
  query: (base: any, ...constraints: any[]) => ({ ...base, constraints }),
  onSnapshot: (q: any, next: any, error: any) => {
    const studio = q.constraints.find((c: any) => c.field === "homeStudioId")?.value;
    const entry = { studio, next, error, closed: false };
    listeners.push(entry);
    setTimeout(() => {
      if (!entry.closed) next(snapOf(clients.filter((c) => c.homeStudioId === studio)));
    }, 0);
    return () => {
      entry.closed = true;
    };
  },
  getDocs: async (q: any) => {
    const ids: string[] = q.constraints.find((c: any) => c.field === "__name__")?.value ?? [];
    byIdQueries.push(ids);
    await new Promise((r) => setTimeout(r, 0));
    if (ids.some((id) => forbidden.has(id))) {
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    }
    return snapOf(clients.filter((c) => ids.includes(c.id)));
  },
  getDoc: async (ref: { id: string }) => {
    singleGets.push(ref.id);
    await new Promise((r) => setTimeout(r, 0));
    if (forbidden.has(ref.id)) {
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    }
    const hit = clients.find((c) => c.id === ref.id);
    return { id: ref.id, exists: () => !!hit, data: () => hit };
  },
}));

import { useStudioRoster } from "./useStudioRoster";

let latest: ReturnType<typeof useStudioRoster> | null = null;

function Probe({ studio, booked }: { studio: string | null; booked: string[] }) {
  const schedules = booked.map((clientId) => ({ id: `b-${clientId}`, clientId })) as any[];
  latest = useStudioRoster(studio, true, schedules);
  return null;
}

async function mount(studio: string | null, booked: string[]): Promise<Root> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <Probe studio={studio} booked={booked} />
      </StrictMode>,
    );
  });
  return root;
}

async function rerender(root: Root, studio: string | null, booked: string[]) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Probe studio={studio} booked={booked} />
      </StrictMode>,
    );
  });
}

/**
 * Let pending 0ms timers and promises settle, in a few passes: a state update made
 * inside one act() only renders — and runs the effects that start the next
 * fake read — when that act() ends, so a read that starts from an effect
 * needs a second pass to land.
 */
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
  }
};

const ids = () => (latest?.clients ?? []).map((c) => c.id).sort();
const openStudios = () => listeners.filter((l) => !l.closed).map((l) => l.studio);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  clients = [
    { id: "s1", homeStudioId: "solon", firstName: "Theresa" },
    { id: "s2", homeStudioId: "solon", firstName: "Lisa" },
    { id: "g1", homeStudioId: "strongsville", firstName: "Rochelle" },
    { id: "g2", homeStudioId: "strongsville", firstName: "Sue" },
    { id: "v1", homeStudioId: "willoughby", firstName: "Visitor" },
  ];
  forbidden = new Set();
  listeners = [];
  byIdQueries.length = 0;
  singleGets.length = 0;
  handleFirestoreError.mockClear();
  latest = null;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useStudioRoster", () => {
  it("holds every client of the studio, not just the booked ones", async () => {
    await mount("solon", ["s1"]);
    expect(latest!.status).toBe("loading");
    await settle();
    expect(latest!.status).toBe("ready");
    expect(ids()).toEqual(["s1", "s2"]);
    // Nothing booked is missing from the listener, so nothing is read by id.
    expect(byIdQueries).toHaveLength(0);
  });

  it("drops the old studio's clients the moment the studio changes", async () => {
    const root = await mount("solon", ["s1"]);
    await settle();
    expect(ids()).toEqual(["s1", "s2"]);

    await rerender(root, "strongsville", ["g1"]);
    // Before the new listener answers: loading, and no Solon client left.
    expect(latest!.status).toBe("loading");
    expect(ids()).toEqual([]);
    await settle();
    expect(ids()).toEqual(["g1", "g2"]);
    expect(openStudios()).toEqual(["strongsville"]);
  });

  it("picks up a client the sync creates after the first read, with no reload", async () => {
    await mount("solon", ["s1", "s3"]);
    await settle();
    expect(ids()).toEqual(["s1", "s2"]);

    clients.push({ id: "s3", homeStudioId: "solon", firstName: "New" });
    await act(async () => push("solon"));
    expect(ids()).toEqual(["s1", "s2", "s3"]);
  });

  it("reads a booked visitor by id once, and not again on the next schedule change", async () => {
    const root = await mount("solon", ["s1", "v1"]);
    await settle();
    expect(ids()).toEqual(["s1", "s2", "v1"]);
    expect(byIdQueries).toEqual([["v1"]]);

    await rerender(root, "solon", ["s1", "v1", "s2"]);
    await settle();
    expect(byIdQueries).toHaveLength(1);
  });

  it("asks about a missing client again after a few minutes, not on every render", async () => {
    const root = await mount("solon", ["ghost"]);
    await settle();
    expect(byIdQueries).toEqual([["ghost"]]);

    await rerender(root, "solon", ["ghost", "s1"]);
    await settle();
    expect(byIdQueries).toHaveLength(1);

    // The sync creates it under another studio; the heartbeat finds it.
    clients.push({ id: "ghost", homeStudioId: "westlake", firstName: "Found" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 10_000);
    });
    await settle();
    expect(byIdQueries.length).toBeGreaterThanOrEqual(2);
    expect(ids()).toContain("ghost");
  });

  it("falls back to one read per id when a batch is refused, so readable visitors still arrive", async () => {
    forbidden = new Set(["secret"]);
    await mount("solon", ["v1", "secret"]);
    await settle();
    expect(ids()).toContain("v1");
    expect(ids()).not.toContain("secret");
    expect(singleGets.sort()).toEqual(["secret", "v1"]);
  });

  it("keeps the roster when the listener fails, says so once, and reopens it", async () => {
    await mount("solon", []);
    await settle();
    expect(ids()).toEqual(["s1", "s2"]);

    const live = listeners.filter((l) => !l.closed);
    await act(async () => {
      for (const l of live) l.error(Object.assign(new Error("unavailable"), { code: "unavailable" }));
    });
    expect(latest!.status).toBe("error");
    expect(ids()).toEqual(["s1", "s2"]);
    expect(handleFirestoreError).toHaveBeenCalledTimes(1);

    const before = listeners.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    await settle();
    expect(listeners.length).toBeGreaterThan(before);
    expect(latest!.status).toBe("ready");
  });
});
