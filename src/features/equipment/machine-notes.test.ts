import { describe, expect, it } from "vitest";
import { hasImportantMachineNote, journalNotesOnMachine, machineNoteLoudness, machineNoteWords, machineNotesFor } from "./machine-notes";
import type { JournalEntry } from "../../types/journal";

const entry = (over: Partial<JournalEntry>): JournalEntry =>
  ({
    id: "j1",
    clientId: "c1",
    machineId: "leg",
    body: "Leg Press — holds her breath at the turnaround",
    importance: "standard",
    authorName: "Sam Lee",
    occurredAt: new Date("2026-10-01T15:00:00Z"),
    isArchived: false,
    ...over,
  }) as JournalEntry;

describe("notes about her on one machine: one list (Oct 2 2026)", () => {
  it("reads a note's own words without the machine name the journal copy carries", () => {
    expect(machineNoteWords("Leg Press — holds her breath", "Leg Press")).toBe("holds her breath");
    expect(machineNoteWords("Leg Press — maintenance: seat sticks", "Leg Press")).toBe("seat sticks");
    expect(machineNoteWords("knee clicks", "Leg Press")).toBe("knee clicks");
  });

  it("takes her journal's notes on that machine, never another machine's, never an archived one", () => {
    const notes = journalNotesOnMachine(
      [entry({}), entry({ id: "j2", machineId: "chest" }), entry({ id: "j3", isArchived: true }), entry({ id: "j4", importance: "critical", body: "Leg Press — maintenance: seat sticks" })],
      "leg",
      "Leg Press",
    );
    expect(notes.map((n) => n.journalEntryId).sort()).toEqual(["j1", "j4"]);
    expect(notes.find((n) => n.journalEntryId === "j4")).toMatchObject({ content: "seat sticks", isImportant: true });
  });

  it("adds the old list's notes that have no journal copy, and draws a double-written one once", () => {
    const legacy = [
      { id: "1", content: "holds her breath at the turnaround", authorName: "Sam", timestamp: "2026-09-01T10:00:00Z", isImportant: false },
      { id: "2", content: "needs the thick pad", authorName: "Ana", timestamp: "2026-08-01T10:00:00Z", isImportant: true },
    ];
    const list = machineNotesFor({ machineId: "leg", machineName: "Leg Press", legacy, journal: [entry({})] });
    expect(list.map((n) => n.content)).toEqual(["holds her breath at the turnaround", "needs the thick pad"]);
    expect(list[0].journalEntryId).toBe("j1");
    expect(hasImportantMachineNote({ machineId: "leg", machineName: "Leg Press", legacy, journal: [entry({})] })).toBe(true);
  });

  it("an archived journal copy takes its old-list twin off the sheet too", () => {
    const legacy = [{ id: "1", content: "holds her breath at the turnaround", authorName: "Sam", timestamp: "2026-09-01T10:00:00Z", isImportant: false }];
    expect(machineNotesFor({ machineId: "leg", machineName: "Leg Press", legacy, journal: [entry({ isArchived: true })] })).toEqual([]);
  });

  it("falls back to the old list alone while her journal is unread", () => {
    const legacy = [{ id: "1", content: "x", authorName: "Sam", timestamp: "2026-09-01T10:00:00Z", isImportant: false }];
    expect(machineNotesFor({ machineId: "leg", machineName: "Leg Press", legacy, journal: null })).toHaveLength(1);
  });
});

describe("how loud the one mark beside a machine's name is (machine menu, Oct 2026)", () => {
  const TODAY = "2026-10-04";
  const loud = (journal: JournalEntry[] | null, legacy: Parameters<typeof machineNoteLoudness>[0]["legacy"] = []) =>
    machineNoteLoudness({ machineId: "leg", machineName: "Leg Press", legacy, journal, today: TODAY });

  it("is the loudest open note on the machine: Critical over a Heads up, nothing for plain notes", () => {
    expect(loud([entry({})])).toBeNull();
    expect(loud([entry({}), entry({ id: "j2", importance: "elevated" })])).toBe("elevated");
    expect(loud([entry({ id: "j2", importance: "elevated" }), entry({ id: "j3", importance: "critical" })])).toBe("critical");
    expect(loud([])).toBeNull();
  });

  it("says nothing for a note on another machine, a resolved one, an archived one, or one whose window has ended", () => {
    expect(loud([entry({ importance: "critical", machineId: "chest" })])).toBeNull();
    expect(loud([entry({ importance: "critical", resolvedAt: new Date("2026-10-02T12:00:00Z") })])).toBeNull();
    expect(loud([entry({ importance: "critical", isArchived: true })])).toBeNull();
    expect(
      loud([entry({ importance: "elevated", effectiveFrom: "2026-09-01", effectiveUntil: "2026-09-20" } as Partial<JournalEntry>)]),
    ).toBeNull();
  });

  it("takes an update's loudness from its root", () => {
    const root = entry({ id: "root", importance: "standard" });
    const update = entry({ id: "u1", importance: "critical", threadId: "root" } as Partial<JournalEntry>);
    expect(loud([root, update])).toBeNull();
  });

  it("reads an old-list note flagged important as Critical, unless its journal copy is there", () => {
    const legacy = [{ id: "1", content: "needs the thick pad", authorName: "Ana", timestamp: "2026-08-01T10:00:00Z", isImportant: true }];
    expect(loud([entry({})], legacy)).toBe("critical");
    expect(loud([entry({ body: "Leg Press — needs the thick pad", importance: "elevated" })], legacy)).toBe("elevated");
  });

  it("falls back to the old list alone while her journal is unread, never to nothing", () => {
    const legacy = [{ id: "1", content: "seat sticks", authorName: "Ana", timestamp: "2026-08-01T10:00:00Z", isImportant: true }];
    expect(loud(null, legacy)).toBe("critical");
    expect(loud(null, [])).toBeNull();
  });
});
