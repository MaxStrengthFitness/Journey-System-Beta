// @vitest-environment jsdom
/**
 * WHETHER A TRAINER'S DISMISSALS HAVE BEEN READ (client codex, Sep 2026).
 *
 * `useNoteDismissals` hands back a map, `{}` until the document answers — so
 * a screen cannot tell "nothing hushed" from "not read yet". The Notes page
 * offers "No need to remind me" / "Show it again" only once it knows, so the
 * hook gains a status: `useNoteDismissalsState`. These mount it against a
 * fake doc listener and pin:
 *   - one listener, on noteDismissals/{uid}, and none without a uid;
 *   - `loading` → `ready` (a missing document is a real "nothing hushed");
 *   - a failure is `failed`, never `ready` with nothing hushed;
 *   - another trainer never inherits the last one's map;
 *   - `useNoteDismissals` still returns the plain map, as the briefing reads it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = {
  path: string;
  next: (snap: unknown) => void;
  error: (err: unknown) => void;
  live: boolean;
};

const fake = vi.hoisted(() => ({ listeners: [] as Listener[], errors: [] as string[] }));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: null } }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", UPDATE: "update" },
  handleFirestoreError: (_err: unknown, _op: string, path: string) => {
    fake.errors.push(path);
  },
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    onSnapshot: (ref: { path: string }, next: (s: unknown) => void, error: (e: unknown) => void) => {
      const l: Listener = { path: ref.path, next, error, live: true };
      fake.listeners.push(l);
      return () => {
        l.live = false;
      };
    },
    setDoc: async () => {},
  };
});

import { useNoteDismissals, useNoteDismissalsState, type NoteDismissalsState } from "./dismissal-store";
import type { NoteDismissals } from "./dismissals";

let state: NoteDismissalsState | null = null;
let plain: NoteDismissals | null = null;
function Probe({ uid }: { uid: string | null }) {
  state = useNoteDismissalsState(uid);
  return null;
}
/** The briefing's reader: the plain map. */
function PlainProbe({ uid }: { uid: string | null }) {
  plain = useNoteDismissals(uid);
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(uid: string | null, which: "state" | "plain" = "state") {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <StrictMode>{which === "state" ? <Probe uid={uid} /> : <PlainProbe uid={uid} />}</StrictMode>,
    );
  });
}

/** The one live listener on a trainer's dismissals. StrictMode opens and closes one first. */
const live = (uid: string) => {
  const open = fake.listeners.filter((l) => l.live && l.path === `noteDismissals/${uid}`);
  expect(open).toHaveLength(1);
  return open[0];
};

const answer = (l: Listener, data: Record<string, unknown> | undefined) =>
  act(async () => {
    l.next({ data: () => data });
  });

const HUSHED_AT = new Date(2026, 8, 20, 9, 30);

beforeEach(() => {
  fake.listeners.length = 0;
  fake.errors.length = 0;
  state = null;
  plain = null;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("useNoteDismissalsState", () => {
  it("opens nothing and waits while nobody is signed in", async () => {
    await render(null);
    expect(fake.listeners).toHaveLength(0);
    expect(state).toEqual({ dismissals: {}, status: "loading" });
  });

  it("is loading until the document answers, then ready with the hushed threads", async () => {
    await render("uid-jane");
    const l = live("uid-jane");
    expect(state!.status).toBe("loading");
    expect(state!.dismissals).toEqual({});

    await answer(l, { threads: { t1: HUSHED_AT, t2: "not a date" }, updatedAt: HUSHED_AT });
    expect(state!.status).toBe("ready");
    // Only readable dates count; the rest of the document is not a thread.
    expect(Object.keys(state!.dismissals)).toEqual(["t1"]);
    expect(state!.dismissals.t1!.getTime()).toBe(HUSHED_AT.getTime());
  });

  it("reads a trainer with no document yet as ready with nothing hushed", async () => {
    await render("uid-jane");
    await answer(live("uid-jane"), undefined);
    expect(state).toEqual({ dismissals: {}, status: "ready" });
  });

  it("reads a failed listener as failed — never as ready with nothing hushed", async () => {
    await render("uid-jane");
    const l = live("uid-jane");
    await answer(l, { threads: { t1: HUSHED_AT } });
    await act(async () => {
      l.error({ code: "permission-denied" });
    });
    expect(state!.status).toBe("failed");
    expect(state!.status).not.toBe("ready");
    // What was last read stays (the briefing has always kept it).
    expect(Object.keys(state!.dismissals)).toEqual(["t1"]);
    expect(fake.errors).toEqual(["noteDismissals/uid-jane"]);
  });

  it("a failure before any answer leaves nothing hushed, and says failed", async () => {
    await render("uid-jane");
    await act(async () => {
      live("uid-jane").error({ code: "unavailable" });
    });
    expect(state).toEqual({ dismissals: {}, status: "failed" });
  });

  it("never hands one trainer's dismissals to the next", async () => {
    await render("uid-jane");
    await answer(live("uid-jane"), { threads: { t1: HUSHED_AT } });
    expect(state!.status).toBe("ready");

    await render("uid-bob");
    expect(state).toEqual({ dismissals: {}, status: "loading" });
    // Jane's listener is closed; Bob's is the one open.
    expect(fake.listeners.filter((l) => l.live && l.path === "noteDismissals/uid-jane")).toHaveLength(0);
    await answer(live("uid-bob"), { threads: {} });
    expect(state).toEqual({ dismissals: {}, status: "ready" });
  });
});

describe("useNoteDismissals (the briefing's reader)", () => {
  it("still hands back the plain map: {} until read, then the hushed threads", async () => {
    await render("uid-jane", "plain");
    expect(plain).toEqual({});
    await answer(live("uid-jane"), { threads: { t1: HUSHED_AT } });
    expect(Object.keys(plain!)).toEqual(["t1"]);
    expect(plain!.t1!.getTime()).toBe(HUSHED_AT.getTime());
  });

  it("is {} with nobody signed in, and opens nothing", async () => {
    await render(null, "plain");
    expect(plain).toEqual({});
    expect(fake.listeners).toHaveLength(0);
  });
});
