// @vitest-environment jsdom
/**
 * Conversations about staying, mounted on a client's case (notes round,
 * Oct 3 2026): one read of her notes, the open Retention thread oldest first,
 * and a conversation saved onto it — or a new thread when none is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../../lib/firestore-errors", () => ({ handleFirestoreError: () => {}, OperationType: { GET: "get" } }));

const fake = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  query: (ref: { path: string }) => ref,
  getDocs: async () => {
    if (fake.fail) throw new Error("permission-denied");
    return { docs: fake.docs.map((d) => ({ id: d.id as string, data: () => d })) };
  },
}));

const writes = vi.hoisted(() => ({ list: [] as Array<{ how: string; text: string; rootId?: string }> }));
vi.mock("../../client-notes/retention", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../client-notes/retention")>();
  return {
    ...real,
    writeRetentionConversation: vi.fn(async (input: { text: string; open: { id: string } | null }) => {
      writes.list.push({ how: input.open ? "update" : "new", text: input.text, rootId: input.open?.id });
      return "id";
    }),
  };
});

import { RetentionConversations } from "./RetentionConversations";

let mounted: { root: Root; host: HTMLElement }[] = [];
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
async function mount(author: { id: string; initials: string; fullName: string } | null = { id: "lead", initials: "LL", fullName: "Lee Leader" }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<RetentionConversations clientId="c1" homeStudioId="s1" firstName="Ruth" author={author} />);
  });
  await settle();
  mounted.push({ root, host });
  return host;
}
const typeInto = (el: Element | null, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));

const note = (over: Record<string, unknown>) => ({
  clientId: "c1",
  studioId: "s1",
  kind: "retention",
  category: null,
  importance: "elevated",
  authorName: "Jess Moreno",
  occurredAt: new Date(2026, 8, 20, 12),
  resolvedAt: null,
  isArchived: false,
  threadId: null,
  ...over,
});

beforeEach(() => {
  fake.docs = [];
  fake.fail = false;
  writes.list.length = 0;
});
afterEach(() => {
  for (const m of mounted) act(() => m.root.unmount());
  mounted = [];
  document.body.innerHTML = "";
});

describe("conversations about staying, on the case", () => {
  it("reads her open Retention thread, oldest first, and adds the next conversation to it", async () => {
    fake.docs = [
      note({ id: "r1", body: "Not sure about May — work is busy." }),
      note({ id: "r1-u", threadId: "r1", importance: "standard", authorName: "Lee Leader", body: "Offered the 7am slot.", occurredAt: new Date(2026, 8, 24, 12) }),
      note({ id: "knee", kind: "injury", body: "Knee." }),
    ];
    const host = await mount();
    const box = host.querySelector('[data-testid="retention-conversations"]')!;
    const lines = Array.from(box.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual(["Jess, 2026-09-20: Not sure about May — work is busy.", "Lee, 2026-09-24: Offered the 7am slot."]);
    expect(box.textContent).not.toContain("Knee.");
    expect(box.textContent).toContain("Add to the conversation");

    await typeInto(box.querySelector("textarea"), "She renewed for six months.");
    await act(async () => buttonIn(box, "Save to her notes")!.click());
    await settle();
    expect(writes.list).toEqual([{ how: "update", text: "She renewed for six months.", rootId: "r1" }]);
    expect((box.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect(box.textContent).toContain("Saved to her notes.");
  });

  it("starts a new thread when nothing is open, and says when the read failed without refusing the save", async () => {
    fake.fail = true;
    const host = await mount();
    const box = host.querySelector('[data-testid="retention-conversations"]')!;
    expect(box.textContent).toContain("couldn't be read just now, so a conversation saved here starts a new thread");
    await typeInto(box.querySelector("textarea"), "Thinking of cancelling.");
    await act(async () => buttonIn(box, "Save to her notes")!.click());
    await settle();
    expect(writes.list).toEqual([{ how: "new", text: "Thinking of cancelling.", rootId: undefined }]);
  });

  it("reads only, with no box, for someone who isn't signed in", async () => {
    const host = await mount(null);
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Nothing written about staying yet.");
  });
});
