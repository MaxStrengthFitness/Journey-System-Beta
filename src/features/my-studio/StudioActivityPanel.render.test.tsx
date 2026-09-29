// @vitest-environment jsdom
/**
 * A STUDIO'S ACTIVITY ON MY STUDIO MOUNTS — one bounded listener on the
 * studio's own entries (studioId ==, newest first, fifty), quiet rows with
 * no studio name (it is this studio's), a new entry landing without a
 * reload, a read that failed saying so with Try again, and the listener
 * let go on unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  answer: "entries" as "entries" | "fails" | "empty",
  listeners: [] as Array<{ path: string; wheres: unknown[][]; limit: number | null; next: (s: unknown) => void; error: (e: Error) => void }>,
  unsubscribed: 0,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-faramir" } } }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });
  const entries = [
    { id: "a2", at: at("2026-09-27T15:05:00Z"), by: { uid: "uid-ioreth", name: "Ioreth" }, studioId: "minas-tirith", kind: "assisted-change", what: "Changed Minas Tirith's phone.", before: { Phone: null }, after: { Phone: "440-555-0101" } },
    { id: "a3", at: at("2026-09-26T09:00:00Z"), by: { uid: "uid-ioreth", name: "Ioreth" }, studioId: "minas-tirith", kind: "studio-stage", what: "Marked Minas Tirith as handed over." },
  ];
  const snap = (docs: Array<{ id: string }>) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d })) });
  return {
    collection: ref,
    where: (...args: unknown[]) => ({ where: args }),
    orderBy: () => ({}),
    limit: (n: number) => ({ limit: n }),
    query: (base: { path: string }, ...parts: Array<{ where?: unknown[]; limit?: number }>) => ({
      path: base.path,
      wheres: parts.filter((p) => p.where).map((p) => p.where!),
      limit: parts.find((p) => p.limit)?.limit ?? null,
    }),
    onSnapshot: (q: { path: string; wheres: unknown[][]; limit: number | null }, next: (s: unknown) => void, error: (e: Error) => void) => {
      state.listeners.push({ ...q, next, error });
      const t = setTimeout(() => {
        if (state.answer === "fails") error(new Error("Missing or insufficient permissions."));
        else next(snap(state.answer === "empty" ? [] : entries));
      }, 0);
      return () => {
        clearTimeout(t);
        state.unsubscribed += 1;
      };
    },
    __entries: entries,
    __snap: snap,
  };
});

import * as firestore from "firebase/firestore";
import { StudioActivityPanel } from "./StudioActivityPanel";

const mocked = firestore as unknown as { __entries: Array<{ id: string }>; __snap: (docs: Array<{ id: string }>) => unknown };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StudioActivityPanel studioId="minas-tirith" studioName="Minas Tirith" />
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

beforeEach(() => {
  state.answer = "entries";
  state.listeners = [];
  state.unsubscribed = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("a studio's Activity on My Studio", () => {
  it("listens once to this studio's entries, fifty at most, and draws them newest first without the studio's name", async () => {
    const el = await mount();
    // StrictMode mounts the effect twice; each listener asks the same bounded question.
    expect(state.listeners.length).toBeGreaterThan(0);
    for (const l of state.listeners) {
      expect(l.path).toBe("activity");
      expect(l.wheres).toEqual([["studioId", "==", "minas-tirith"]]);
      expect(l.limit).toBe(50);
    }
    expect(el.textContent).toContain("What head office changed at Minas Tirith from the Admins dashboard");
    const rows = [...el.querySelectorAll(".hq-log__what")].map((r) => r.textContent);
    expect(rows).toEqual(["Ioreth changed Minas Tirith's phone.", "Ioreth marked Minas Tirith as handed over."]);
    expect(el.querySelector(".hq-log__change")?.textContent).toBe("Phone: none → 440-555-0101");
    expect([...el.querySelectorAll(".hq-log__ctx")].map((r) => r.textContent)).toEqual(["Changed at a studio", "Opening a studio"]);
    // Nothing here edits or writes.
    expect(el.querySelector("input, textarea")).toBeNull();
  });

  it("shows a new entry when it lands, without a reload", async () => {
    const el = await mount();
    const newest = { id: "a1", at: { toMillis: () => Date.parse("2026-09-29T13:00:00Z") }, by: { uid: "uid-faramir", name: "Faramir" }, studioId: "minas-tirith", kind: "admin-grant", what: "Made Beregond a Studio Leader (was Life Transformer)." };
    await act(async () => {
      for (const l of state.listeners) l.next(mocked.__snap([newest, ...mocked.__entries]));
    });
    const rows = [...el.querySelectorAll(".hq-log__what")].map((r) => r.textContent);
    expect(rows[0]).toBe("Faramir made Beregond a Studio Leader (was Life Transformer).");
    expect(rows).toHaveLength(3);
  });

  it("says nothing recorded yet in words, and a read that failed as couldn't read, with Try again starting the listener afresh", async () => {
    state.answer = "empty";
    let el = await mount();
    expect(el.textContent).toContain("Nothing recorded yet");
    expect(el.textContent).toContain("Changes made at Minas Tirith from the Admins dashboard are recorded here from Sep 28 2026 on. None yet.");
    act(() => root?.unmount());
    host?.remove();

    state.answer = "fails";
    const before = state.listeners.length;
    el = await mount();
    expect(el.textContent).toContain("Couldn't read the Activity record just now");
    expect(el.querySelector(".hq-log")).toBeNull();
    state.answer = "entries";
    const again = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Try again"))!;
    await act(async () => {
      again.click();
    });
    await settle();
    expect(state.listeners.length).toBeGreaterThan(before + 1);
    expect(el.querySelectorAll(".hq-log__row")).toHaveLength(2);
  });

  it("lets the listener go on unmount", async () => {
    await mount();
    const opened = state.listeners.length;
    act(() => root?.unmount());
    root = null;
    expect(state.unsubscribed).toBe(opened);
  });
});
