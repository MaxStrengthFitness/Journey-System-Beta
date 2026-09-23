// @vitest-environment jsdom
/**
 * A BACKFILL THAT CANNOT SUCCEED MUST NOT KEEP TRYING.
 *
 * Sep 23 2026, the efficiency round.
 *
 * `useMachineStats` reads every session AND every set a client has, once, to
 * rebuild their lifetime rollup. "Once" is enforced by a module-level `started`
 * set — and the catch used to clear that set on ANY error, so the next app
 * load tried again.
 *
 * That is correct for a dropped connection. For the two failures that will not
 * resolve on their own it is a permanent cost: a trainer whose rules refuse
 * the write re-reads a client's entire history on every app load, on every
 * device, forever, for a write that can never land. And retrying after
 * `resource-exhausted` is precisely what turned Aug 30 into a storm.
 *
 * These pin which errors re-arm and which do not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-coach" } },
  functions: {},
}));

let sessionReads = 0;
let failWith: any = null;

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...p: any[]) => p.filter((x) => typeof x === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    getDocs: async (q: any) => {
      if (q?.__path === "sessions") {
        sessionReads++;
        if (failWith) throw failWith;
      }
      return { docs: [], size: 0, empty: true, forEach: () => {} };
    },
    updateDoc: async () => {
      if (failWith) throw failWith;
    },
    serverTimestamp: () => ({ __server: true }),
    Timestamp: real.Timestamp,
  };
});

import { useMachineStats } from "./useMachineStats";

function Probe({ id }: { id: string }) {
  useMachineStats({ id, firstName: "A", lastName: "B" } as any);
  return null;
}

let container: HTMLDivElement;
let root: Root;

/** Mount, let the effect's promise settle, unmount. One "app load". */
const appLoad = async (id: string) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Probe id={id} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => root.unmount());
  container.remove();
};

beforeEach(() => {
  sessionReads = 0;
  failWith = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMachineStats — what re-arms the backfill", () => {
  it("runs once per client, not once per mount", async () => {
    await appLoad("c-happy");
    await appLoad("c-happy");
    expect(sessionReads).toBe(1);
  });

  it("does NOT retry after permission-denied — the write can never land", async () => {
    failWith = Object.assign(new Error("Missing or insufficient permissions."), {
      code: "permission-denied",
    });
    await appLoad("c-refused");
    const afterFirst = sessionReads;
    failWith = null;
    await appLoad("c-refused");
    expect(sessionReads).toBe(afterFirst);
  });

  it("does NOT retry after the quota is exhausted — that is how Aug 30 got worse", async () => {
    failWith = Object.assign(new Error("Quota exceeded."), {
      code: "resource-exhausted",
    });
    await appLoad("c-quota");
    const afterFirst = sessionReads;
    failWith = null;
    await appLoad("c-quota");
    expect(sessionReads).toBe(afterFirst);
  });

  it("DOES retry after a transient failure, which is what the re-arm is for", async () => {
    failWith = new Error("network request failed");
    await appLoad("c-flaky");
    const afterFirst = sessionReads;
    failWith = null;
    await appLoad("c-flaky");
    expect(sessionReads).toBeGreaterThan(afterFirst);
  });
});
