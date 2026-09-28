// @vitest-environment jsdom
/**
 * WAITING FOR REVIEW — an administrator reads what studios offered and
 * decides it (AJ, Sep 28 2026: sharing "should submit to admins first for
 * review, we can review in admin dashboard").
 *
 * Mounted for real over a fake Firestore that answers the three
 * collection-group reads and records the decision's write, because the write
 * shape is the whole point and it fails silently when wrong: `shared` must
 * become true only on a yes, the decision must carry who made it, and a no
 * must carry the note the studio will read. A failed read must never look
 * like "Nothing waiting".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } } }));

const fake = vi.hoisted(() => ({
  byGroup: {} as Record<string, Array<{ path: string; id: string; data: Record<string, unknown> }>>,
  fail: false,
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock("firebase/firestore", () => ({
  collectionGroup: (_db: unknown, group: string) => ({ group }),
  query: (q: unknown) => q,
  where: () => null,
  getDocs: async (q: { group: string }) => {
    if (fake.fail) throw new Error("offline");
    const rows = fake.byGroup[q.group] ?? [];
    return { docs: rows.map((r) => ({ id: r.id, ref: { path: r.path }, data: () => r.data })) };
  },
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.writes.push({ path: ref.path, data });
  },
  setDoc: async () => {},
  serverTimestamp: () => "NOW",
  deleteField: () => "DELETE",
}));

const toasts: string[] = [];
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const { ShareReviewPanel } = await import("./ShareReviewPanel");

const eowyn = { id: "t-eowyn", authUid: "uid-eowyn", fullName: "Eowyn Rohan" } as never;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ShareReviewPanel studios={[{ id: "westlake", name: "Westlake" }]} trainers={[eowyn]} />);
  });
  await settle();
  return host;
}

const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));

async function click(b: HTMLButtonElement | undefined) {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await settle();
}

async function type(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  fake.fail = false;
  fake.writes.length = 0;
  toasts.length = 0;
  fake.byGroup = {
    playbook: [
      {
        path: "studios/westlake/playbook/tip1",
        id: "tip1",
        data: {
          title: "Knees on the leg press",
          situation: "Knee pain at the bottom",
          worked: "Seat one notch back",
          shareStatus: "pending",
          shareRequestedBy: "uid-eowyn",
          shareRequestedAt: new Date(2026, 8, 27, 12),
        },
      },
    ],
    wiki: [],
    roster: [],
  };
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("Waiting for review", () => {
  it("shows each offer whole: what it is, whose, who offered it, what it says", async () => {
    const el = await mount();
    expect(el.textContent).toContain("A tip");
    expect(el.textContent).toContain("Knees on the leg press");
    expect(el.textContent).toContain("Westlake · offered by Eowyn Rohan · Sep 27");
    expect(el.textContent).toContain("When: Knee pain at the bottom");
    expect(el.textContent).toContain("What worked: Seat one notch back");
  });

  it("shares on a yes: `shared` true, decided by this administrator, and the row leaves", async () => {
    const el = await mount();
    await click(button(el, /Share with every studio/));
    expect(fake.writes).toEqual([
      {
        path: "studios/westlake/playbook/tip1",
        data: {
          shared: true,
          shareStatus: "approved",
          shareReviewedBy: "uid-admin",
          shareReviewedAt: "NOW",
          shareReviewNote: "DELETE",
        },
      },
    ]);
    expect(el.textContent).toContain("Nothing waiting");
    expect(toasts[0]).toContain("Every MSF studio can read Knees on the leg press now.");
  });

  it("sends a no back with the note the studio will read", async () => {
    const el = await mount();
    await click(button(el, /^Don't share$/));
    await type(el.querySelector("textarea")!, "  Say which seat notch, and we'll share it.  ");
    await click(button(el, /Don't share it/));
    expect(fake.writes).toEqual([
      {
        path: "studios/westlake/playbook/tip1",
        data: {
          shared: false,
          shareStatus: "declined",
          shareReviewedBy: "uid-admin",
          shareReviewedAt: "NOW",
          shareReviewNote: "Say which seat notch, and we'll share it.",
        },
      },
    ]);
    expect(toasts[0]).toContain("Westlake sees your note beside it.");
  });

  it("never calls a failed read 'Nothing waiting'", async () => {
    fake.fail = true;
    const el = await mount();
    expect(el.textContent).toContain("Couldn't load what's waiting, so this can't say whether anything is.");
    expect(el.textContent).not.toContain("Nothing waiting");
  });

  it("says when nothing waits", async () => {
    fake.byGroup = { playbook: [], wiki: [], roster: [] };
    const el = await mount();
    expect(el.textContent).toContain("Nothing waiting");
  });
});
