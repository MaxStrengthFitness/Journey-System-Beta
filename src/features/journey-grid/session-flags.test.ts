import { describe, expect, it } from "vitest";
import { flagLineOf, machineFlags, sessionFlags } from "./session-flags";
import type { JournalEntry } from "../../types/journal";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";

const entry = (over: Partial<JournalEntry>): JournalEntry =>
  ({
    id: "e1",
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: null,
    body: "Holds her breath on the way up — cue open mouth at rep 6",
    importance: "critical",
    machineId: "leg-press",
    focusId: null,
    origin: "in_session",
    authorId: "t1",
    authorInitials: "CJ",
    authorName: "Christian",
    occurredAt: null,
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as unknown as JournalEntry;

// A real flag from the matrix that names at least one machine, so the
// machine-specific path is exercised against the studio's own data.
const flagWithMachine = CLINICAL_FLAGS_MATRIX.find((f) =>
  (f.protocolHandling || []).some((r) => (r.affectedMachineIds || []).length > 0),
);
const namedMachine = flagWithMachine
  ? (flagWithMachine.protocolHandling || []).flatMap((r) => r.affectedMachineIds || [])[0]
  : null;

describe("sessionFlags", () => {
  it("counts conditions, critical notes and heads-ups, and goes severe on a critical note", () => {
    const f = sessionFlags({
      clinicalFlags: flagWithMachine ? [flagWithMachine.id] : [],
      criticalEntries: [entry({})],
      headsUpEntries: [entry({ id: "e2", importance: "elevated" })],
    });
    expect(f.count).toBe((flagWithMachine ? 1 : 0) + 2);
    expect(f.severe).toBe(true);
    expect(f.critical).toHaveLength(1);
    expect(f.headsUp).toHaveLength(1);
  });

  it("is empty and calm for a client with nothing flagged", () => {
    const f = sessionFlags({});
    expect(f.count).toBe(0);
    expect(f.severe).toBe(false);
    expect(f.general).toEqual([]);
  });
});

describe("machineFlags / flagLineOf", () => {
  it("ties notes to the machine by id and says nothing for another machine", () => {
    const src = { criticalEntries: [entry({})], headsUpEntries: [entry({ id: "e2", importance: "elevated", machineId: "row" })] };
    expect(machineFlags({ id: "leg-press", name: "Leg Press" }, src).notes.map((e) => e.id)).toEqual(["e1"]);
    expect(machineFlags({ id: "row", name: "Row" }, src).notes.map((e) => e.id)).toEqual(["e2"]);
    expect(machineFlags({ id: "chest", name: "Chest" }, src).notes).toEqual([]);
    expect(flagLineOf(machineFlags({ id: "chest", name: "Chest" }, src), () => "")).toBeNull();
  });

  it("the line is the trainer's own words, who said them and when — a note beats the matrix", () => {
    const mf = machineFlags({ id: "leg-press", name: "Leg Press" }, { criticalEntries: [entry({})] });
    const line = flagLineOf(mf, () => "3 Sep");
    expect(line?.tone).toBe("critical");
    expect(line?.text).toBe("Holds her breath on the way up — cue open mouth at rep 6 — CJ, 3 Sep");
    expect(line?.more).toBe(0);
  });

  it("clips a long note and counts what else is tied to the machine", () => {
    const long = "x".repeat(200);
    const mf = machineFlags(
      { id: "leg-press", name: "Leg Press" },
      { criticalEntries: [entry({ body: long, authorInitials: "" })], headsUpEntries: [entry({ id: "e2", importance: "elevated" })] },
    );
    const line = flagLineOf(mf, () => "");
    expect(line?.text.length).toBeLessThan(90);
    expect(line?.more).toBe(1);
  });

  it("falls back to the clinical matrix when nobody has written a note", () => {
    if (!flagWithMachine || !namedMachine) return; // the matrix has no machine-specific rule to test against
    const mf = machineFlags({ id: namedMachine, name: namedMachine }, { clinicalFlags: [flagWithMachine.id] });
    expect(mf.watchOuts.length).toBeGreaterThan(0);
    const line = flagLineOf(mf, () => "");
    expect(line?.text.startsWith(mf.watchOuts[0].condition + ":")).toBe(true);
  });
});
