/**
 * The equipment writes on the floor (machine menu, Oct 4 2026): nothing a
 * trainer saves at a machine waits on the server, and nothing is lost when
 * the iPad is offline or reloads.
 *
 *   - saveSettings: the settings and their history row are ONE batch; the
 *     journal copy is issued in the same tick, not after the batch answers,
 *     with the history row's own moment; a refused journal copy never fails
 *     the save; Undo files no second copy (`fileNote: false`).
 *   - addMachineNote: filed by what it is for, issued at once, and the
 *     database's answer handed back to wait on through `settleOrQueue`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Ref = { __path: string };
type BatchSet = { path: string; data: Record<string, unknown>; opts: unknown };

const w = vi.hoisted(() => ({
  batches: [] as Array<{ sets: BatchSet[]; committed: boolean }>,
  /** What the next batch's commit answers with; null = a promise that never settles (offline). */
  commit: { mode: "ok" as "ok" | "refuse" | "never" | "deferred", resolve: null as null | (() => void) },
  setDocs: [] as Array<{ path: string; data: Record<string, unknown> }>,
  addDocs: [] as Array<{ path: string; data: Record<string, unknown> }>,
  journal: [] as Array<{ clientId: string; studioId: string; author: unknown; draft: Record<string, any> }>,
  journalMode: "ok" as "ok" | "refuse" | "never",
  fit: [] as Array<Record<string, unknown>>,
  order: [] as string[],
  autoId: 0,
}));

vi.mock("../../firebase", () => ({ db: { __fake: true } }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...p: string[]): Ref => ({ __path: p.join("/") }),
  doc: (base: unknown, ...p: string[]): Ref => {
    // doc(collectionRef) makes an id up front, as Firestore does.
    if (base && typeof base === "object" && "__path" in (base as Ref) && p.length === 0) {
      w.autoId += 1;
      return { __path: `${(base as Ref).__path}/auto-${w.autoId}` };
    }
    return { __path: p.join("/") };
  },
  setDoc: async (ref: Ref, data: Record<string, unknown>) => {
    w.setDocs.push({ path: ref.__path, data });
  },
  addDoc: async (ref: Ref, data: Record<string, unknown>) => {
    w.addDocs.push({ path: ref.__path, data });
    return { id: "added" };
  },
  writeBatch: () => {
    const batch = { sets: [] as BatchSet[], committed: false };
    w.batches.push(batch);
    return {
      set: (ref: Ref, data: Record<string, unknown>, opts?: unknown) => batch.sets.push({ path: ref.__path, data, opts }),
      commit: () => {
        batch.committed = true;
        w.order.push("commit");
        if (w.commit.mode === "refuse") return Promise.reject(new Error("permission-denied"));
        if (w.commit.mode === "never") return new Promise<void>(() => {});
        if (w.commit.mode === "deferred") return new Promise<void>((resolve) => (w.commit.resolve = resolve));
        return Promise.resolve();
      },
    };
  },
}));
vi.mock("../../hooks/useClientJournal", () => ({
  createJournalEntry: (clientId: string, studioId: string, author: unknown, draft: Record<string, any>) => {
    w.journal.push({ clientId, studioId, author, draft });
    w.order.push("journal");
    if (w.journalMode === "refuse") return Promise.reject(new Error("permission-denied"));
    if (w.journalMode === "never") return new Promise<string>(() => {});
    return Promise.resolve("j1");
  },
}));
vi.mock("../machine-fit/fit-store", () => ({
  upsertFitRow: async (row: Record<string, unknown>) => {
    w.fit.push(row);
    w.order.push("fit");
    return true;
  },
}));

import { addMachineNote, saveSettings, type SaveSettingsArgs } from "./mutations";
import type { SettingFieldSpec } from "./types";
import { settleOrQueue } from "../session-record/finish-wait";
import { undoPayload } from "../machine-menu/setting-draft";
import { parseSettingHistory } from "../machine-menu/setting-history";
import { isSettingsCopy } from "../machine-menu/settings-copy";
import { storedNoteOf } from "../client-notes/note-catalog";

const author = { id: "uid-ana", fullName: "Ana Cole", initials: "AC" };
const fields: SettingFieldSpec[] = [
  { key: "Seat", label: "Seat", type: "number", ghost: "6", absolute: false },
  { key: "Back pad", label: "Back pad", type: "number", ghost: null, absolute: false },
];
const sessionJournal = {
  studioId: "westlake",
  origin: "in_session" as const,
  sessionId: "s-2026-10-04",
  sessionNumber: 312,
  sessionDay: "2026-10-04",
};

const args = (over: Partial<SaveSettingsArgs> = {}): SaveSettingsArgs => ({
  clientId: "c1",
  machineId: "leg",
  fields,
  saved: { Seat: "4", "Back pad": "3" },
  draft: { Seat: "5", "Back pad": "3" },
  reason: "Range of motion",
  author,
  isInitialSetup: false,
  machineName: "Leg Press",
  journal: sessionJournal,
  homeStudioId: "westlake",
  ...over,
});

/** Lets every already-settled promise run its callbacks. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  w.batches.length = 0;
  w.commit.mode = "ok";
  w.commit.resolve = null;
  w.setDocs.length = 0;
  w.addDocs.length = 0;
  w.journal.length = 0;
  w.journalMode = "ok";
  w.fit.length = 0;
  w.order.length = 0;
  w.autoId = 0;
});

describe("saveSettings: one batch, and the journal copy beside it", () => {
  it("writes the settings and their history row in ONE batch, and nothing one after another", async () => {
    const result = await saveSettings(args());
    expect(w.batches).toHaveLength(1);
    const [batch] = w.batches;
    expect(batch.committed).toBe(true);
    expect(batch.sets.map((s) => s.path)).toEqual(["clientMachineSettings/c1_leg", "machines/leg/settingHistory/auto-1"]);
    const [settings, history] = batch.sets;
    expect(settings.data).toMatchObject({ clientId: "c1", machineId: "leg", settings: { Seat: "5", "Back pad": "3" }, updatedBy: "uid-ana" });
    expect(settings.opts).toEqual({ mergeFields: ["clientId", "machineId", "settings", "sources", "updatedAt", "updatedBy"] });
    expect(history.data).toMatchObject({
      clientId: "c1",
      trainerId: "uid-ana",
      trainerName: "Ana Cole",
      changeType: "SETTINGS",
      oldValue: "Seat: 4",
      newValue: "Seat: 5",
      reason: "Range of motion",
    });
    // The old writes went one after another through setDoc and addDoc; none now.
    expect(w.setDocs).toHaveLength(0);
    expect(w.addDocs).toHaveLength(0);
    expect(result).toMatchObject({ summary: "Seat 4 → 5", reason: "Range of motion", settings: { Seat: "5", "Back pad": "3" } });
  });

  it("issues the journal copy before the batch has answered, at the history row's own moment", async () => {
    w.commit.mode = "deferred";
    const saving = saveSettings(args());
    // Nothing awaited yet, and the copy is already made.
    expect(w.journal).toHaveLength(1);
    expect(w.order).toEqual(["commit", "journal", "fit"]);
    const { draft, studioId } = w.journal[0];
    expect(studioId).toBe("westlake");
    expect(draft).toMatchObject({
      kind: "equipment",
      category: null,
      body: "Leg Press — Seat 4 → 5. Range of motion",
      importance: "standard",
      machineId: "leg",
      sessionId: "s-2026-10-04",
      sessionNumber: 312,
      sessionDay: "2026-10-04",
      origin: "in_session",
    });
    const history = w.batches[0].sets[1].data;
    expect(draft.occurredAt).toBeInstanceOf(Date);
    expect((draft.occurredAt as Date).toISOString()).toBe(history.timestamp);
    expect(w.batches[0].sets[0].data.updatedAt).toEqual(draft.occurredAt);

    w.commit.resolve!();
    await expect(saving).resolves.toMatchObject({ summary: "Seat 4 → 5" });
  });

  it("writes a copy the machine menu recognises as a copy, never as a note", async () => {
    await saveSettings(args());
    const history = w.batches[0].sets[1].data;
    const rows = parseSettingHistory([{ id: "h1", ...history }], "c1");
    expect(isSettingsCopy(w.journal[0].draft, rows, "Leg Press")).toBe(true);
  });

  it("never fails the save over a refused journal copy", async () => {
    w.journalMode = "refuse";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveSettings(args())).resolves.toMatchObject({ summary: "Seat 4 → 5" });
    await flush();
    expect(w.batches[0].committed).toBe(true);
    spy.mockRestore();
  });

  it("fails the save when the batch is refused, so the caller can keep the draft", async () => {
    w.commit.mode = "refuse";
    await expect(saveSettings(args())).rejects.toThrow("permission-denied");
  });

  it("has every write made while offline: settleOrQueue says queued at once", async () => {
    w.commit.mode = "never";
    const outcome = await settleOrQueue(saveSettings(args()), false);
    expect(outcome.kind).toBe("queued");
    expect(w.batches[0].committed).toBe(true);
    expect(w.batches[0].sets).toHaveLength(2);
    expect(w.journal).toHaveLength(1);
    expect(w.fit).toHaveLength(1);
  });

  it("still saves with no reason, writing its own default — the reason is asked, never required", async () => {
    await saveSettings(args({ reason: undefined }));
    expect(w.batches[0].sets[1].data.reason).toBe("Settings update");
    expect(w.journal[0].draft.body).toBe("Leg Press — Seat 4 → 5. Settings update");

    w.batches.length = 0;
    w.journal.length = 0;
    await saveSettings(args({ reason: "   ", saved: {}, draft: { Seat: "4" }, isInitialSetup: true }));
    expect(w.batches[0].sets[1].data).toMatchObject({ changeType: "INITIAL_SETUP", reason: "Initial setup", oldValue: "Seat: —", newValue: "Seat: 4" });
  });

  it("keeps the machine-fit row it writes today, for the client's home studio", async () => {
    await saveSettings(args({ changedSources: { Seat: "suggested" } }));
    expect(w.fit).toHaveLength(1);
    expect(w.fit[0]).toMatchObject({
      homeStudioId: "westlake",
      machineId: "leg",
      clientId: "c1",
      settings: { Seat: "5", "Back pad": "3" },
      sources: { Seat: "suggested" },
    });
  });

  it("writes nothing for a save with no change", async () => {
    await expect(saveSettings(args({ draft: { Seat: "4 ", "Back pad": "3" } }))).resolves.toBeNull();
    expect(w.batches).toHaveLength(0);
    expect(w.journal).toHaveLength(0);
    expect(w.fit).toHaveLength(0);
  });

  it("Undo writes the old value back through the same path, reason Undone, with no second journal copy", async () => {
    const saved = await saveSettings(args());
    expect(w.journal).toHaveLength(1);

    const undo = undoPayload(fields, { Seat: "4", "Back pad": "3" }, saved!.settings);
    expect(undo.fileNote).toBe(false);
    await saveSettings(args({ ...undo }));
    expect(w.batches).toHaveLength(2);
    const [settings, history] = w.batches[1].sets;
    expect(settings.data.settings).toEqual({ Seat: "4", "Back pad": "3" });
    expect(history.data).toMatchObject({ changeType: "SETTINGS", oldValue: "Seat: 5", newValue: "Seat: 4", reason: "Undone" });
    // Still only the save's own copy.
    expect(w.journal).toHaveLength(1);
  });

  it("files no copy without a journal context, and the batch still goes", async () => {
    await saveSettings(args({ journal: undefined }));
    expect(w.batches).toHaveLength(1);
    expect(w.journal).toHaveLength(0);
  });
});

describe("addMachineNote: filed by what it is for, never waited on", () => {
  const note = (over: Partial<Parameters<typeof addMachineNote>[0]> = {}) =>
    addMachineNote({
      clientId: "c1",
      machineId: "leg",
      machineName: "Leg Press",
      existingNotes: [],
      content: "  Knee tender at the bottom  ",
      author,
      journal: sessionJournal,
      ...over,
    });

  it("writes the filing, the loudness and the parts of the body onto the journal entry", async () => {
    const filing = storedNoteOf("health", "Injury", [{ part: "knee", side: "left" }]);
    const result = await note({ filing, importance: "elevated" });
    expect(w.journal).toHaveLength(1);
    expect(w.journal[0].draft).toMatchObject({
      kind: "injury",
      category: "Injury",
      bodyParts: [{ part: "knee", side: "left" }],
      importance: "elevated",
      body: "Leg Press — Knee tender at the bottom",
      machineId: "leg",
      sessionId: "s-2026-10-04",
      sessionNumber: 312,
      sessionDay: "2026-10-04",
      origin: "in_session",
    });
    expect(result).toMatchObject({ id: "journal:j1", content: "Knee tender at the bottom", isImportant: true });
    expect(w.setDocs).toHaveLength(0);
  });

  it("files a Set-up note at Note by default, as it always has", async () => {
    await note();
    expect(w.journal[0].draft).toMatchObject({ kind: "equipment", category: null, bodyParts: null, importance: "standard" });
  });

  it("issues the write at once and hands back the database's answer, so the floor can wait through settleOrQueue", async () => {
    w.journalMode = "never";
    const sent = note({ filing: storedNoteOf("coaching", "Setup", null), importance: "critical" });
    // The write is already made, before anything is awaited.
    expect(w.journal).toHaveLength(1);
    expect(w.journal[0].draft.importance).toBe("critical");
    expect(sent).toBeInstanceOf(Promise);
    await expect(settleOrQueue(sent, false)).resolves.toEqual({ kind: "queued" });
  });

  it("reports a refusal, so the note box keeps the words", async () => {
    w.journalMode = "refuse";
    const outcome = await settleOrQueue(note(), true);
    expect(outcome.kind).toBe("failed");
  });

  it("keeps the old checkbox's answer when no loudness is given", async () => {
    await note({ isMaintenance: true });
    expect(w.journal[0].draft).toMatchObject({ importance: "critical", body: "Leg Press — maintenance: Knee tender at the bottom" });
    w.journal.length = 0;
    // A loudness from the Loudness control wins over the checkbox, and writes no "maintenance:".
    await note({ isMaintenance: true, importance: "standard" });
    expect(w.journal[0].draft).toMatchObject({ importance: "standard", body: "Leg Press — Knee tender at the bottom" });
  });

  it("writes nothing for an empty note", async () => {
    await expect(note({ content: "   " })).resolves.toBeNull();
    expect(w.journal).toHaveLength(0);
    expect(w.setDocs).toHaveLength(0);
  });

  it("still writes the old list for a host with no journal context", async () => {
    const result = await note({ journal: undefined, importance: "elevated" });
    expect(w.journal).toHaveLength(0);
    expect(w.setDocs).toHaveLength(1);
    expect(w.setDocs[0].path).toBe("clientMachineSettings/c1_leg");
    expect(w.setDocs[0].data.machineNotes).toEqual([expect.objectContaining({ content: "Knee tender at the bottom", isImportant: true })]);
    expect(result).toMatchObject({ content: "Knee tender at the bottom" });
  });
});
