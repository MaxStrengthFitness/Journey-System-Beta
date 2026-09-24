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
    expect(f.caution).toBe(false);
    expect(f.general).toEqual([]);
    expect(f.onMachines).toEqual([]);
  });

  it("never counts a condition the sheet would not show", () => {
    // Osteoporosis names only machines. The marker used to read "1" and the
    // sheet opened to nothing; now the sheet lists it, with the machines.
    const floor = [
      { id: "m-leg-press", name: "LEG PRESS" },
      { id: "m-lumbar", name: "LUMBAR" },
      { id: "m-chest-press", name: "CHEST PRESS" },
    ];
    const f = sessionFlags({ clinicalFlags: ["bone-osteoporosis"], floor });
    expect(f.count).toBe(1);
    expect(f.general).toEqual([]);
    expect(f.onMachines).toHaveLength(1);
    expect(f.onMachines[0].machines).toEqual(["LEG PRESS", "LUMBAR"]);
    // A flag id the matrix no longer has is not a thing to know.
    expect(sessionFlags({ clinicalFlags: ["retired-flag"] }).count).toBe(0);
  });

  it("counts a condition once however many rules it carries", () => {
    const f = sessionFlags({ clinicalFlags: ["bone-osteoporosis", "cv-hypertension", "bone-osteoporosis"] });
    expect(f.count).toBe(2);
  });

  it("crimson only for an absolute contraindication or a critical note; plum for high risk", () => {
    expect(sessionFlags({ clinicalFlags: ["cv-hypertension"] })).toMatchObject({ severe: true, caution: false });
    // High risk, machine-only rules: plum — not crimson, and no longer missed.
    expect(sessionFlags({ clinicalFlags: ["bone-osteoporosis"] })).toMatchObject({ severe: false, caution: true });
    expect(sessionFlags({ clinicalFlags: ["cv-aortic-aneurysm"] })).toMatchObject({ severe: false, caution: true });
    expect(sessionFlags({ clinicalFlags: ["gen-knee"] })).toMatchObject({ severe: false, caution: false });
    expect(
      sessionFlags({ clinicalFlags: ["bone-osteoporosis"], criticalEntries: [entry({})] }),
    ).toMatchObject({ severe: true, caution: false });
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

  it("finds the matrix on the machine as the floor carries it — the catalog id and the studio's name", () => {
    // The Now Bar on the lumbar machine for a client with degenerative disc
    // disease: this line never appeared, because the matrix says
    // "lumbar_extension" and the floor says "m-lumbar" / "LUMBAR".
    const mf = machineFlags({ id: "m-lumbar", name: "LUMBAR" }, { clinicalFlags: ["spine-ddd"] });
    expect(mf.watchOuts.map((w) => w.flagId)).toEqual(["spine-ddd"]);
    expect(flagLineOf(mf, () => "")?.tone).toBe("caution");
  });

  it("the line's tone follows the matrix: crimson absolute, plum high risk, amber a modification", () => {
    const tone = (flag: string, machine: { id: string; name: string }) =>
      flagLineOf(machineFlags(machine, { clinicalFlags: [flag] }), () => "")?.tone;
    expect(tone("spine-spondylolisthesis", { id: "m-lumbar", name: "LUMBAR" })).toBe("critical");
    expect(tone("bone-osteoporosis", { id: "m-abs", name: "SEATED ABDOMINALS" })).toBe("caution");
    expect(tone("gen-neck", { id: "m-neck", name: "CX (4 WAY NECK)" })).toBe("elevated");
  });
});
