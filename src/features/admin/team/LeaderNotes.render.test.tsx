// @vitest-environment jsdom
/**
 * "Your notes" and "Note for our 1:1" on a person's card (Oct 3 2026): the
 * leader's own record, read once, and a 1:1 note saved into their Journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } } }));
const fake = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>>, fail: false, saved: [] as unknown[] }));
vi.mock("firebase/firestore", () => ({
  query: (r: unknown) => r,
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: async () => {
    if (fake.fail) throw new Error("permission-denied");
    return { docs: fake.docs.map((d) => ({ id: d.id as string, data: () => d })) };
  },
}));
vi.mock("../../relay/notes/mutations", () => ({
  notesRef: (uid: string) => ({ path: `trainers/${uid}/notes` }),
  newNoteId: () => "new-note",
  saveNote: vi.fn(async (args: unknown) => {
    fake.saved.push(args);
    return {};
  }),
}));

import { LeaderNotes, useLeaderNotes } from "./LeaderNotes";

function Card({ name }: { name: string }) {
  const { read, refresh } = useLeaderNotes("lead");
  return <LeaderNotes name={name} uid="lead" authorName="Lee Leader" read={read} onSaved={refresh} />;
}

let mounted: { root: Root; host: HTMLElement }[] = [];
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
async function mount(name = "Ana Torres") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Card name={name} />);
  });
  await settle();
  mounted.push({ root, host });
  return host;
}
const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));
const typeInto = (el: Element | null, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  fake.docs = [];
  fake.fail = false;
  fake.saved.length = 0;
});
afterEach(() => {
  for (const m of mounted) act(() => m.root.unmount());
  mounted = [];
  document.body.innerHTML = "";
});

describe("a leader's notes on a person's card", () => {
  it("says how many Team member notes the leader has about her, and that only they read them", async () => {
    fake.docs = [
      { id: "a", noteType: "team", fields: { who: "Ana Torres" }, title: "t", body: "", updatedAt: new Date(2026, 8, 30, 12) },
      { id: "b", noteType: "team", fields: { who: "Ana Torres" }, title: "t", body: "", updatedAt: new Date(2026, 8, 12, 12) },
      { id: "c", noteType: "client", fields: { who: "Ana Torres" }, title: "t", body: "" },
    ];
    const host = await mount();
    expect(host.textContent).toContain("2 in your Journal · last Sep 30. Only you can read them.");
  });

  it("writes a 1:1 note into the leader's own Journal, and nowhere else", async () => {
    const host = await mount();
    expect(host.textContent).toContain("None in your Journal yet.");
    await act(async () => buttonIn(host, "Note for our 1:1")!.click());
    const boxes = host.querySelectorAll("textarea");
    await typeInto(boxes[0], "Late twice this week.");
    await typeInto(boxes[1], "Ask about the school run on Friday.");
    await act(async () => buttonIn(host, "Save to my Journal")!.click());
    await settle();
    const args = fake.saved[0] as { uid: string; noteId: string; draft: Record<string, unknown>; before: unknown };
    expect(args.uid).toBe("lead");
    expect(args.before).toBeNull();
    expect(args.draft).toMatchObject({
      noteType: "team",
      share: false,
      teamShare: null,
      fields: { who: "Ana Torres", what: "Late twice this week.", next: "Ask about the school run on Friday." },
    });
    expect(host.textContent).toContain("Saved to your Journal.");
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("says so when the Journal couldn't be read, and still offers the note", async () => {
    fake.fail = true;
    const host = await mount();
    expect(host.textContent).toContain("Your Journal couldn't be read just now.");
    expect(buttonIn(host, "Note for our 1:1")).toBeTruthy();
  });
});
