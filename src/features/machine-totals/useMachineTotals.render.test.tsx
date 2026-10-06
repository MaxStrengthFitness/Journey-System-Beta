// @vitest-environment jsdom
/**
 * The one listener on a client's machine totals, mounted (the iPad round's
 * review, Oct 6 2026): a document only this iPad has written (an offline
 * Finish, set/mergeFields) is not the whole document, so it is never
 * "ready" off the cache until the server answers or a whole copy was seen;
 * and a failure keeps what it had, and whether it was whole.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Snap = { exists: () => boolean; data: () => unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
const fake = vi.hoisted(() => ({
  next: null as null | ((s: unknown) => void),
  error: null as null | ((e: unknown) => void),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  deleteField: () => ({}),
  serverTimestamp: () => ({}),
  onSnapshot: (_ref: unknown, _opts: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
    fake.next = next;
    fake.error = error;
    return () => {};
  },
}));
vi.mock("../../firebase", () => ({ db: {} }));

import { useMachineTotals } from "./useMachineTotals";
import type { MachineTotalsRead } from "./totals";

const snap = (data: unknown, fromCache: boolean, hasPendingWrites: boolean): Snap => ({
  exists: () => data !== null,
  data: () => data,
  metadata: { fromCache, hasPendingWrites },
});

let root: Root | null = null;
let host: HTMLElement | null = null;
let seen: MachineTotalsRead | null = null;

function Probe({ id }: { id: string }) {
  seen = useMachineTotals(id);
  return null;
}

async function mount(id: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe id={id} />));
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  seen = null;
  vi.restoreAllMocks();
});

const PARTIAL = { machineStats: { m1: { timesPerformed: 1 } } };
const WHOLE = { machineStats: { m1: { timesPerformed: 41, firstWeight: 60 } } };

describe("useMachineTotals", () => {
  it("a document only this iPad has written is loading, its data passed on as not whole, until the server answers", async () => {
    await mount("c-partial");
    await act(async () => fake.next!(snap(PARTIAL, true, true)));
    expect(seen).toEqual({ state: "loading", data: PARTIAL, complete: false });
    await act(async () => fake.next!(snap(WHOLE, false, false)));
    expect(seen).toEqual({ state: "ready", data: WHOLE });
  });

  it("a cached copy with nothing of ours pending is whole; once seen whole, a pending write on top stays whole", async () => {
    await mount("c-cached");
    await act(async () => fake.next!(snap(WHOLE, true, false)));
    expect(seen!.state).toBe("ready");
    await act(async () => fake.next!(snap({ machineStats: { m1: { timesPerformed: 42 } } }, true, true)));
    expect(seen!.state).toBe("ready");
  });

  it("a failure keeps what it had and whether it was whole", async () => {
    await mount("c-fail-whole");
    await act(async () => fake.next!(snap(WHOLE, false, false)));
    await act(async () => fake.error!(new Error("unavailable")));
    expect(seen).toEqual({ state: "failed", data: WHOLE, complete: true });
  });

  it("a failure over a partial document is not whole", async () => {
    await mount("c-fail-partial");
    await act(async () => fake.next!(snap(PARTIAL, true, true)));
    await act(async () => fake.error!(new Error("unavailable")));
    expect(seen).toEqual({ state: "failed", data: PARTIAL, complete: false });
  });

  it("an empty answer from the cache is still loading; the server's empty answer is missing", async () => {
    await mount("c-none");
    await act(async () => fake.next!(snap(null, true, false)));
    expect(seen!.state).toBe("loading");
    await act(async () => fake.next!(snap(null, false, false)));
    expect(seen!.state).toBe("missing");
  });
});
