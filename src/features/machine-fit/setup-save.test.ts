/**
 * Programming -> Setup's one Save (Oct 2 2026): a note typed on a machine
 * goes to her journal with its machineId (the one list the machine sheet and
 * the Notes page read), never onto the old `machineNotes` on the document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => ({ sets: [] as Array<{ data: Record<string, unknown>; opts: unknown }>, journal: [] as any[] }));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  setDoc: async () => {},
  writeBatch: () => ({
    set: (_ref: unknown, data: Record<string, unknown>, opts: unknown) => writes.sets.push({ data, opts }),
    commit: async () => {},
  }),
}));
vi.mock("../../hooks/useClientJournal", () => ({
  createJournalEntry: async (clientId: string, studioId: string, author: unknown, draft: unknown) => {
    writes.journal.push({ clientId, studioId, author, draft });
    return "j1";
  },
}));
vi.mock("./fit-store", () => ({ queueFitRow: () => null, ackFitRow: async () => {} }));

import { commitSetupSave } from "./setup-save";
import type { SetupPlan } from "./setup-plan";

const author = { id: "uid-ann", fullName: "Ann Jones", initials: "AJ" };

beforeEach(() => {
  writes.sets.length = 0;
  writes.journal.length = 0;
});

describe("commitSetupSave: a machine note goes to her journal", () => {
  it("writes the note as a journal entry with its machine, not onto machineNotes", async () => {
    const plan: SetupPlan = {
      entries: [
        { machineId: "m-leg", machineName: "Leg Press", isInitialSetup: false, changes: [], note: "  Likes the seat one back. " },
      ],
      needsReason: false,
      settingsChanged: 0,
      weightsChanged: 0,
    };
    await commitSetupSave({ clientId: "c1", homeStudioId: "s1", activeStudioId: "s1", author, plan, reason: "", legacy: false });
    expect(writes.sets.every((s) => !("machineNotes" in s.data))).toBe(true);
    const notes = writes.journal.filter((j) => j.draft.machineId === "m-leg");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ clientId: "c1", studioId: "s1" });
    expect(notes[0].draft).toMatchObject({ kind: "equipment", body: "Likes the seat one back.", importance: "standard" });
  });

  it("says where a note copied from the chart came from", async () => {
    const plan: SetupPlan = {
      entries: [{ machineId: "m-row", machineName: "Row", isInitialSetup: true, changes: [], note: "Grip wide" }],
      needsReason: false,
      settingsChanged: 0,
      weightsChanged: 0,
    };
    await commitSetupSave({ clientId: "c1", homeStudioId: "s1", activeStudioId: null, author, plan, reason: "", legacy: true });
    expect(writes.journal.find((j) => j.draft.machineId === "m-row")?.draft.body).toBe("From the FileMaker chart: Grip wide");
  });
});
