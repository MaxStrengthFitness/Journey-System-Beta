// @vitest-environment jsdom
/**
 * The floor's note on a machine, at the machine (notes round, Oct 3 2026):
 * read once when the sheet opens, the Relay flag first, nothing when there
 * is nothing, and a failed read said rather than looking like "no notes".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t1" } } }));
const fake = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown> | undefined>, fail: false, reads: [] as string[] }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  getDoc: async (ref: { path: string }) => {
    fake.reads.push(ref.path);
    if (fake.fail) throw new Error("permission-denied");
    const data = fake.docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  },
}));

import { FloorNoteCard } from "./FloorNoteCard";

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(props: { studioId: string | null; studioName?: string | null; machineId: string | null }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<FloorNoteCard {...props} />);
  });
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  fake.docs = {};
  fake.fail = false;
  fake.reads = [];
});
afterEach(() => {
  for (const m of mounted) act(() => m.root.unmount());
  mounted = [];
  document.body.innerHTML = "";
});

describe("the floor's note on this machine, in the session", () => {
  it("draws the Relay flag first, then the floor's note, whole and signed", async () => {
    fake.docs["studios/s1/machineNotes/leg"] = {
      notes: "The left pad sticks — use the footstool.\nSeat 2 notches lower than the card.",
      updatedBy: { id: "u1", name: "Ana Torres" },
      updatedAt: new Date(2026, 8, 30, 12),
    };
    fake.docs["studios/s1/machineCare/leg"] = {
      flag: { note: "Seat pin jams at 7.", by: { uid: "u2", name: "Jess Moreno" }, at: new Date(2026, 9, 2, 9).getTime() },
    };
    const host = await mount({ studioId: "s1", studioName: "Westlake", machineId: "leg" });
    const card = host.querySelector('[data-testid="floor-note"]')!;
    expect(card.textContent).toContain("Westlake's notes on this machine");
    expect(card.querySelector('[data-testid="floor-note-flag"]')!.textContent).toContain("Flagged: Seat pin jams at 7.");
    expect(card.textContent).toContain("Jess · 2026-10-02");
    expect(card.textContent).toContain("The left pad sticks — use the footstool.");
    expect(card.textContent).toContain("Seat 2 notches lower than the card.");
    expect(card.textContent).toContain("Ana · 2026-09-30");
    // Two documents, read once: no listener, no index.
    expect(fake.reads.sort()).toEqual(["studios/s1/machineCare/leg", "studios/s1/machineNotes/leg"]);
  });

  it("draws nothing when the floor has nothing on this machine", async () => {
    const host = await mount({ studioId: "s1", studioName: "Westlake", machineId: "row" });
    expect(host.querySelector('[data-testid="floor-note"]')).toBeNull();
    expect(host.textContent).toBe("");
  });

  it("says so when the read failed, never 'no notes'", async () => {
    fake.fail = true;
    const host = await mount({ studioId: "s1", studioName: null, machineId: "leg" });
    expect(host.querySelector('[data-testid="floor-note-failed"]')!.textContent).toContain(
      "The floor's notes on this machine couldn’t be read just now.",
    );
  });

  it("reads nothing without a studio or a machine", async () => {
    await mount({ studioId: null, machineId: "leg" });
    expect(fake.reads).toEqual([]);
  });
});
