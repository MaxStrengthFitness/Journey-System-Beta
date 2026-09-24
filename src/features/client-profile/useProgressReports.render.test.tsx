// @vitest-environment jsdom
/**
 * The profile's progress-reports listener, mounted (client codex, phase 8).
 *
 * The codex reads a client's Pulse history from this listener rather than
 * reading the reports again, so its state is load-bearing: a list that was
 * never read must not pass for "no Pulse on file", and a failure must say
 * so rather than leave the page "loading" forever. Until this hook was
 * lifted out of ClientProfileView (which nothing mounts in a test), a
 * dropped `failed` stamp would have gone unnoticed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = {
  clientId: unknown;
  next: (snap: unknown) => void;
  error?: (err: unknown) => void;
  live: boolean;
};

const fake = vi.hoisted(() => ({ listeners: [] as Listener[] }));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-1" } } }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, path: string) => ({ path }),
    where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
    orderBy: (field: string) => ({ type: "orderBy", field }),
    limit: (n: number) => ({ type: "limit", n }),
    query: (target: { path: string }, ...constraints: Array<{ type: string; field?: string; value?: unknown }>) => ({
      path: target.path,
      clientId: constraints.find((c) => c.type === "where" && c.field === "clientId")?.value,
    }),
    onSnapshot: (q: { clientId: unknown }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      const l: Listener = { clientId: q.clientId, next, error, live: true };
      fake.listeners.push(l);
      return () => {
        l.live = false;
      };
    },
  };
});

import { useProgressReports, type ProfileProgressReports } from "./useProgressReports";

let mounted: { root: Root; host: HTMLElement }[] = [];
let seen: ProfileProgressReports | null = null;

function Probe(props: { clientId: string | null; enabled: boolean; quotaBlocked?: boolean; uid?: string | null }) {
  seen = useProgressReports({ uid: "uid-1", ...props });
  return null;
}

async function render(props: Parameters<typeof Probe>[0]) {
  if (!mounted.length) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mounted.push({ root: createRoot(host), host });
  }
  await act(async () => {
    mounted[0].root.render(
      <StrictMode>
        <Probe {...props} />
      </StrictMode>,
    );
  });
}

const live = () => fake.listeners.filter((l) => l.live);
const answer = (l: Listener, rows: Array<Record<string, unknown>>) =>
  act(async () => l.next({ docs: rows.map((r) => ({ id: String(r.id), data: () => r })) }));

beforeEach(() => {
  fake.listeners.length = 0;
  seen = null;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("useProgressReports", () => {
  it("is loading until the listener answers, then ready with the reports", async () => {
    await render({ clientId: "c1", enabled: true });
    expect(live()).toHaveLength(1);
    expect(live()[0].clientId).toBe("c1");
    expect(seen?.status).toBe("loading");
    await answer(live()[0], [{ id: "r1", clientId: "c1" }]);
    expect(seen?.status).toBe("ready");
    expect(seen?.reports.map((r) => r.id)).toEqual(["r1"]);
  });

  it("says failed when the listener errors — never an empty 'ready'", async () => {
    await render({ clientId: "c1", enabled: true });
    await act(async () => live()[0].error?.({ code: "permission-denied" }));
    expect(seen?.status).toBe("failed");
    expect(seen?.reports).toEqual([]);
  });

  it("never lets the last client's answer stand for the next one", async () => {
    await render({ clientId: "c1", enabled: true });
    await answer(live()[0], [{ id: "r1", clientId: "c1" }]);
    expect(seen?.status).toBe("ready");

    await render({ clientId: "c2", enabled: true });
    // The list is not cleared (readers filter it), but the state is not c2's yet.
    expect(seen?.status).toBe("loading");
    expect(live()).toHaveLength(1);
    expect(live()[0].clientId).toBe("c2");
    await answer(live()[0], []);
    expect(seen?.status).toBe("ready");
    expect(seen?.reports).toEqual([]);
  });

  it("opens nothing out of quota, and says failed rather than waiting forever", async () => {
    await render({ clientId: "c1", enabled: true, quotaBlocked: true });
    expect(live()).toHaveLength(0);
    expect(seen?.status).toBe("failed");
  });

  it("opens nothing until a screen that shows the reports is open, or before sign-in", async () => {
    await render({ clientId: "c1", enabled: false });
    expect(live()).toHaveLength(0);
    expect(seen?.status).toBe("loading");
    await render({ clientId: "c1", enabled: true, uid: null });
    expect(live()).toHaveLength(0);
  });

  it("keeps one listener open while it stays enabled", async () => {
    await render({ clientId: "c1", enabled: true });
    await render({ clientId: "c1", enabled: true });
    expect(live()).toHaveLength(1);
  });
});
