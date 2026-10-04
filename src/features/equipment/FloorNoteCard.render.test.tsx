// @vitest-environment jsdom
/**
 * The floor's notes on a machine, at the machine (notes round, Oct 3 2026):
 * read once when the sheet opens, the Relay flag first, then the open notes
 * of the dated list with their latest word, then the old Studio notes while
 * nobody has copied them into the list; nothing when there is nothing, and a
 * failed read said rather than looking like "no notes".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t1" } } }));
const fake = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  floor: [] as { id: string; data: Record<string, unknown> }[],
  fail: false,
  reads: [] as string[],
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (ref: { path: string }, w: { field: string; value: unknown }) => ({ path: `${ref.path}?${w.field}=${String(w.value)}` }),
  getDoc: async (ref: { path: string }) => {
    fake.reads.push(ref.path);
    if (fake.fail) throw new Error("permission-denied");
    const data = fake.docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  },
  getDocs: async (q: { path: string }) => {
    fake.reads.push(q.path);
    if (fake.fail) throw new Error("permission-denied");
    return { docs: fake.floor.map((d) => ({ id: d.id, data: () => d.data })) };
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
  fake.floor = [];
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
    // Two documents and one query on the machine, read once: no listener.
    expect(fake.reads.sort()).toEqual([
      "studios/s1/floorNotes?machineId=leg",
      "studios/s1/machineCare/leg",
      "studios/s1/machineNotes/leg",
    ]);
  });

  it("draws the floor's open notes with their latest word, never a closed one, and drops the old note once it is copied", async () => {
    const base = { machineId: "leg", threadId: null, authorId: "u1", isArchived: false, resolvedAt: null };
    fake.floor = [
      { id: "r1", data: { ...base, body: "The pin sticks at 7.", authorName: "Ana Torres", createdAt: new Date(2026, 9, 1, 9) } },
      {
        id: "u1",
        data: { ...base, threadId: "r1", body: "Maintenance booked.", authorName: "Jess Moreno", createdAt: new Date(2026, 9, 2, 9) },
      },
      { id: "r2", data: { ...base, body: "Cable frayed.", authorName: "Ana", resolvedAt: new Date(2026, 8, 1, 9) } },
      { id: "r3", data: { ...base, body: "Left pad sticks.", copiedFrom: "studio-notes", authorName: "Ana" } },
    ];
    fake.docs["studios/s1/machineNotes/leg"] = { notes: "Left pad sticks." };
    const host = await mount({ studioId: "s1", studioName: "Westlake", machineId: "leg" });
    const open = [...host.querySelectorAll('[data-testid="floor-note-open"]')].map((p) => p.textContent);
    expect(open).toHaveLength(2);
    expect(open[0]).toContain("The pin sticks at 7.");
    expect(open[0]).toContain("Latest: Maintenance booked.");
    expect(open[0]).toContain("Jess · 2026-10-02");
    expect(host.textContent).not.toContain("Cable frayed.");
    // "Left pad sticks." once: as the dated note, not again as the old one.
    expect(host.textContent!.split("Left pad sticks.").length - 1).toBe(1);
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
