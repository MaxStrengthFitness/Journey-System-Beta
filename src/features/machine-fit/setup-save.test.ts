/**
 * Programming -> Setup's one Save (Oct 2 2026): a note typed on a machine
 * goes to her journal with its machineId (the one list the machine sheet and
 * the Notes page read), never onto the old `machineNotes` on the document.
 *
 * And "Correct the starting weight" (AJ, Oct 4 2026, Q3 (a)): the corrected
 * start rides in the same batch, and it is the number the green % on the
 * machine menu and the Now Bar counts from (machine-menu/progress-figure.ts).
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
import { planSetupSave, type SetupPlan } from "./setup-plan";
import { parseSettingHistory } from "../machine-menu/setting-history";
import { progressFigure, progressFromSets, progressWords } from "../machine-menu/progress-figure";
import { toJourneyRows } from "../journey-grid/adapters";
import { toEquipmentMachines } from "../equipment/adapters";
import type { ClientMachineSetting, Machine } from "../../types";

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

describe("commitSetupSave: Correct the starting weight", () => {
  const plan = (over: { draftStart?: string; draftWeight?: string } = {}) =>
    planSetupSave([
      {
        machineId: "m-leg",
        machineName: "Leg Press",
        fields: [{ key: "Seat", label: "Seat" }],
        saved: { Seat: "4" },
        draft: {},
        savedStartingWeight: 84,
        savedCurrentWeight: 100,
        ...over,
      },
    ]);
  const docWrite = () => writes.sets.find((s) => s.opts !== undefined)!;
  const historyRows = () => writes.sets.filter((s) => s.opts === undefined).map((s) => s.data);

  it("writes startingWeight and one WEIGHT row in the batch; the day it was first recorded stays", async () => {
    await commitSetupSave({ clientId: "c1", homeStudioId: "s1", activeStudioId: "s1", author, plan: plan({ draftStart: "80" }), reason: "", legacy: false });
    const { data, opts } = docWrite();
    expect(data).toMatchObject({ clientId: "c1", machineId: "m-leg", startingWeight: 80, updatedBy: "uid-ann" });
    expect(opts).toEqual({ mergeFields: ["clientId", "machineId", "updatedAt", "updatedBy", "startingWeight"] });
    expect("startingWeightDate" in data).toBe(false);
    expect("currentWeight" in data).toBe(false);
    expect("settings" in data).toBe(false);
    expect(historyRows()).toEqual([
      expect.objectContaining({
        clientId: "c1",
        changeType: "WEIGHT",
        trainerId: "uid-ann",
        trainerName: "Ann Jones",
        oldValue: "Start: 84, Current: 100",
        newValue: "Start: 80, Current: 100",
        reason: "Weight update",
      }),
    ]);
    expect(writes.journal).toEqual([]); // a weight is never journalled
  });

  it("puts a load moved in the same Save on the same row", async () => {
    await commitSetupSave({
      clientId: "c1",
      homeStudioId: "s1",
      activeStudioId: "s1",
      author,
      plan: plan({ draftStart: "80", draftWeight: "112" }),
      reason: "",
      legacy: false,
    });
    expect(docWrite().data).toMatchObject({ startingWeight: 80, currentWeight: 112 });
    const rows = historyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ oldValue: "Start: 84, Current: 100", newValue: "Start: 80, Current: 112" });
  });

  it("is the start the machine menu lists and the green % counts from, in both doors", async () => {
    await commitSetupSave({ clientId: "c1", homeStudioId: "s1", activeStudioId: "s1", author, plan: plan({ draftStart: "80" }), reason: "", legacy: false });
    // Setting changes: the row reads back as the starting weight.
    const [row] = parseSettingHistory(historyRows() as never[], "c1");
    expect(row.kind).toBe("start-weight");
    expect(row.pairs).toEqual([{ label: "Starting weight", from: "84", to: "80" }]);

    // The settings listener's next snapshot: the written fields merged over the old document.
    const before: ClientMachineSetting = { clientId: "c1", machineId: "m-leg", settings: { Seat: "4" }, startingWeight: 84, currentWeight: 100, updatedBy: "t0", updatedAt: null };
    const after = { ...before, ...docWrite().data } as ClientMachineSetting;
    const machines: Machine[] = [{ id: "m-leg", name: "Leg Press", order: 1, settingOptions: ["Seat"] }];

    // The menu (toEquipmentMachines → progressFromModel's start) …
    const [equipment] = toEquipmentMachines({ machines, clientSettings: { "m-leg": after }, allLogs: [], catalogById: {} });
    const card = progressFigure({ startingWeight: equipment.startingWeight, lastCounted: 100, everythingRead: false });
    expect(progressWords(card)).toBe("Starting weight 80 lb, +25%");

    // … and the Now Bar (toJourneyRows → progressFromSets) say the same.
    const [gridRow] = toJourneyRows(machines, [], { "m-leg": after });
    const nowBar = progressFromSets([{ weight: 96 }, { weight: 100 }], { startingWeight: gridRow.startingWeight, everythingRead: false });
    expect(nowBar).toMatchObject({ start: 80, source: "on-file", startLabel: "Starting weight", gain: 25, up: true });
  });
});
