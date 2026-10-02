// @vitest-environment jsdom
/**
 * The machine sheet's notes, mounted (Oct 2 2026): ONE list — her journal's
 * notes on this machine plus the old list's — and a new note goes to her
 * journal only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {} }));
const journal = vi.hoisted(() => ({ created: [] as any[], archived: [] as string[] }));
vi.mock("../../hooks/useClientJournal", () => ({
  createJournalEntry: async (...args: any[]) => {
    journal.created.push(args);
    return "new-j";
  },
  archiveJournalEntries: async (ids: string[]) => {
    journal.archived.push(...ids);
  },
}));
const settingsWrites = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock("firebase/firestore", async (orig) => {
  const real = await orig<typeof import("firebase/firestore")>();
  return {
    ...real,
    doc: (_db: unknown, ...p: string[]) => ({ __path: p.join("/") }),
    setDoc: async (ref: any, data: any) => {
      settingsWrites.calls.push({ path: ref.__path, data });
    },
  };
});

import { MachineNotes } from "./MachineNotes";

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  journal.created = [];
  journal.archived = [];
  settingsWrites.calls = [];
});

const machine = {
  id: "leg",
  name: "Leg Press",
  notes: [
    { id: "old-1", content: "needs the thick pad", authorName: "Ana", timestamp: "2026-08-01T10:00:00Z", isImportant: false },
    { id: "old-2", content: "holds her breath", authorName: "Sam", timestamp: "2026-09-01T10:00:00Z", isImportant: false },
  ],
} as any;
const entries = [
  {
    id: "j1",
    clientId: "c1",
    machineId: "leg",
    body: "Leg Press — holds her breath",
    importance: "standard",
    authorName: "Sam",
    occurredAt: new Date("2026-09-01T10:00:00Z"),
    isArchived: false,
  },
] as any[];

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MachineNotes
        machine={machine}
        clientId="c1"
        author={{ id: "uid-sam", fullName: "Sam Lee", initials: "SL" }}
        journal={{ studioId: "westlake", origin: "equipment" as any }}
        journalEntries={entries}
      />,
    );
  });
  return host;
}

describe("MachineNotes — one list", () => {
  it("shows her journal's note and the old list's note that has no journal copy, once each", async () => {
    const h = await mount();
    const bodies = Array.from(h.querySelectorAll(".eq-note__body")).map((n) => n.textContent);
    expect(bodies.sort()).toEqual(["holds her breath", "needs the thick pad"]);
    expect(h.querySelector(".eq-card__title")!.textContent).toBe("Notes (2)");
  });

  it("files a new note to her journal only, with the machine on it", async () => {
    const h = await mount();
    const box = h.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "knee clicks at the bottom");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const add = Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.includes("Add note"))!;
    await act(async () => add.click());
    expect(journal.created).toHaveLength(1);
    expect(journal.created[0][3]).toMatchObject({ machineId: "leg", body: "Leg Press — knee clicks at the bottom", kind: "equipment" });
    expect(settingsWrites.calls).toHaveLength(0);
  });

  it("archives a journal note in the journal when it is removed", async () => {
    const h = await mount();
    const article = Array.from(h.querySelectorAll("article")).find((a) => a.textContent?.includes("holds her breath"))!;
    await act(async () => (article.querySelector('button[aria-label="Remove note"]') as HTMLButtonElement).click());
    expect(journal.archived).toEqual(["j1"]);
  });
});
