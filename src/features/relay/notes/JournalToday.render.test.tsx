// @vitest-environment jsdom
/**
 * TODAY, MOUNTED (the Relay Board rebuild, Oct 3 2026): the Journal's first
 * tab, where "Things to carry today" and "One line for yourself" moved from
 * the Board's Opening and Close out cards. Both write today's day log, merged,
 * at studios/{s}/dayLogs/{uid}_{day}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  log: null as Record<string, unknown> | null,
  sets: [] as { path: string; data: Record<string, unknown>; merge: boolean }[],
}));
vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  query: (q: unknown) => q,
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (ref: { path: string }, next: (s: unknown) => void) => {
    const t = setTimeout(
      () => next({ id: ref.path.split("/").pop(), exists: () => store.log !== null, data: () => store.log ?? undefined }),
      0,
    );
    return () => clearTimeout(t);
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
    store.sets.push({ path: ref.path, data, merge: Boolean(opts?.merge) });
  },
  serverTimestamp: () => "__now__",
}));

import { JournalToday } from "./JournalToday";

const TODAY = "2026-10-03";
let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  store.log = null;
  store.sets = [];
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <JournalToday
        studioId="s1"
        uid="t-ioreth"
        now={{ todayKey: TODAY, sessions: [{ id: "a", clientId: "c", clientName: "Odo Proudfoot", startMin: 600, endMin: 630, status: "Scheduled" }] }}
      />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const type = async (input: HTMLInputElement | null | undefined, value: string) => {
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
};

describe("Today, the Journal's first tab", () => {
  it("keeps the things to carry in today's day log, merged, and shows them back", async () => {
    const h = await render();
    expect(h.textContent).toContain("Things to carry today");
    const inputs = [...h.querySelectorAll<HTMLInputElement>(".jtd-input")];
    await type(inputs[0], "Slow down at the door");
    await click([...h.querySelectorAll("button")].find((b) => b.textContent === "Keep for today"));
    expect(store.sets).toHaveLength(1);
    expect(store.sets[0]).toMatchObject({ path: `studios/s1/dayLogs/t-ioreth_${TODAY}`, merge: true });
    expect(store.sets[0].data.carry).toEqual(["Slow down at the door"]);
    expect(h.querySelector(".jtd-carry")?.textContent).toContain("Slow down at the door");
  });

  it("says the day so far, and saves the day's one line with its facts", async () => {
    const h = await render();
    expect(h.querySelector(".jtd-facts")?.textContent).toContain("Saturday, October 3.");
    expect(h.querySelector(".jtd-facts")?.textContent).toContain("One session on your schedule today, the last ending at 10:30 AM.");
    const fields = [...h.querySelectorAll<HTMLInputElement>(".jtd-input")];
    // The carry's three lines come first, then What happened? So what? Now what?
    await type(fields[3], "Odo held the turnaround");
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("Save to my journal")));
    const saved = store.sets.at(-1)!;
    expect(saved.data.line).toEqual({ what: "Odo held the turnaround", soWhat: "", nowWhat: "" });
    expect(saved.data.facts).toEqual(["Saturday, October 3.", "One session on your schedule today, the last ending at 10:30 AM."]);
    expect(h.textContent).toContain("Saved to your Journal as today's day log.");
  });
});
