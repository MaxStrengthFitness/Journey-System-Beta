import { describe, expect, it } from "vitest";
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import { MACHINE_DEFINITION_LIST } from "../../../data/machine-definitions";
import { METHOD_DEFINITION_FIELDS } from "../../../lib/machine-template";
import {
  BLOCKING_GAPS,
  DEFINITION_FIELDS,
  authoredMethod,
  blockingGaps,
  correctedFields,
  likenessTo,
  reviewSubmission,
} from "./review";

/** A definition that clears the blocking bar, to vary one field at a time. */
const good = (extra: Partial<MachineDefinition> = {}): MachineDefinition =>
  ({
    name: "Hip Adduction",
    anatomicalRegion: "Legs",
    movementPattern: "Lower Body: Isolation",
    kinematicClass: "simple-rotary",
    primaryMuscles: ["adductors"],
    secondaryMuscles: [],
    synergistMuscles: [],
    musculature: { primary: ["Adductor magnus"], secondary: [], synergists: [] },
    preferredView: "front",
    clinicalNote: "",
    universalBaseline: {},
    bodyTypeAdjustments: {},
    alignmentCheckpoints: [],
    execution: {
      concentricSeconds: 6,
      eccentricSeconds: 6,
      upperTurnaround: { description: "Pause one second at the squeeze." },
      lowerTurnaround: { description: "Reverse without touching the stack." },
      keyCues: ["Knees driven together, not the feet."],
    },
    clinicalWarnings: [],
    contraindicatedFor: [],
    sequencingContraindications: [],
    settingFields: [],
    defaultSettings: {},
    ...extra,
  }) as MachineDefinition;

const sub = (extra: Partial<{ basedOn: string | null; studioName: string }> = {}) => ({
  basedOn: null,
  studioName: "Solon",
  ...extra,
});

const entry = (id: string, d: MachineDefinition): MachineCatalogEntry =>
  ({ ...d, id, status: "active", defaultOrder: 10, inStandardSet: true, schemaVersion: 1 }) as MachineCatalogEntry;

describe("the bar is the catalog's own", () => {
  /*
   * The point of the whole module. A gate that a studio's machine must clear
   * and Max Strength's own twenty would fail is not a standard, it is a
   * grudge — and the first time an admin hit it they would stop reading the
   * queue. If this fails, either the generator regressed or BLOCKING_GAPS
   * grew something the Academy's guides do not state.
   */
  it("every generated MSF definition clears every blocking gap", () => {
    const failures = MACHINE_DEFINITION_LIST.map((m) => ({
      name: m.name,
      gaps: blockingGaps(m).map((g) => g.id),
    })).filter((r) => r.gaps.length > 0);
    expect(failures).toEqual([]);
  });

  it("covers twenty machines, so the check above is not passing on an empty list", () => {
    expect(MACHINE_DEFINITION_LIST.length).toBeGreaterThanOrEqual(20);
  });
});

describe("DEFINITION_FIELDS", () => {
  /*
   * The list is written out because a TypeScript type does not survive to
   * runtime. This is what keeps it honest: a field added to
   * MachineDefinition and forgotten here would silently stop being compared,
   * so a studio could change it and no likeness or correction would say so.
   */
  it("names every key a real definition carries", () => {
    const known = new Set<string>(DEFINITION_FIELDS as readonly string[]);
    const bookkeeping = new Set(["id", "status", "defaultOrder", "inStandardSet", "schemaVersion", "createdAt", "createdBy", "updatedAt", "updatedBy"]);
    const unknown = new Set<string>();
    for (const m of MACHINE_DEFINITION_LIST) {
      for (const k of Object.keys(m)) {
        if (!known.has(k) && !bookkeeping.has(k)) unknown.add(k);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it("names nothing that is not a definition field", () => {
    const method = new Set<string>(METHOD_DEFINITION_FIELDS as readonly string[]);
    // Every method field is a definition field; the reverse is not true.
    for (const f of method) expect(DEFINITION_FIELDS).toContain(f);
  });
});

describe("blocking", () => {
  it("passes a machine that has the method", () => {
    expect(blockingGaps(good())).toEqual([]);
  });

  it("refuses one with no cadence, and names both counts", () => {
    const d = good({ execution: { ...good().execution, concentricSeconds: 0, eccentricSeconds: 0 } } as Partial<MachineDefinition>);
    expect(blockingGaps(d).map((g) => g.id).sort()).toEqual(["concentric", "eccentric"]);
  });

  it("refuses one with no turnarounds", () => {
    const d = good({ execution: { ...good().execution, upperTurnaround: { description: "" }, lowerTurnaround: { description: "" } } } as Partial<MachineDefinition>);
    expect(blockingGaps(d).map((g) => g.id).sort()).toEqual(["lower-turnaround", "upper-turnaround"]);
  });

  it("asks why only when the studio flagged never-to-failure", () => {
    const off = good();
    expect(blockingGaps(off).map((g) => g.id)).not.toContain("failure-notice");
    const on = good({ execution: { ...good().execution, neverToFailure: true } } as Partial<MachineDefinition>);
    expect(blockingGaps(on).map((g) => g.id)).toContain("failure-notice");
    const explained = good({ execution: { ...good().execution, neverToFailure: true, safetyNotice: "Cervical spine." } } as Partial<MachineDefinition>);
    expect(blockingGaps(explained).map((g) => g.id)).not.toContain("failure-notice");
  });

  it("does not block on a studio-tier blank — the next location overrides it anyway", () => {
    const ids = blockingGaps(good()).map((g) => g.id);
    for (const studioTier of ["seat", "stack-gap", "dials", "dial-defaults", "shorter", "taller"]) {
      expect(ids).not.toContain(studioTier);
    }
  });

  it("every blocking id is one completeness actually emits", () => {
    // Otherwise a typo in BLOCKING_GAPS would block nothing, quietly.
    const emitted = new Set(
      ["failure-notice", ...blockingGaps(good({ name: "", anatomicalRegion: "", movementPattern: "", kinematicClass: "", primaryMuscles: [], execution: {} } as unknown as Partial<MachineDefinition>)).map((g) => g.id)],
    );
    for (const id of BLOCKING_GAPS) expect(emitted).toContain(id);
  });
});

describe("what the studio wrote", () => {
  it("names the method fields the submission fills in", () => {
    const fields = authoredMethod(good()).map((a) => a.field);
    expect(fields).toContain("execution");
    expect(fields).toContain("movementPattern");
    expect(fields).toContain("musculature");
  });

  it("leaves out a method field the studio left empty", () => {
    const fields = authoredMethod(good({ clinicalNote: "" })).map((a) => a.field);
    expect(fields).not.toContain("clinicalNote");
  });

  it("names nothing a studio owns anyway", () => {
    const fields = authoredMethod(good({ name: "Ours", baselineLoad: { male: 60 } })).map((a) => a.field);
    expect(fields).not.toContain("name");
    expect(fields).not.toContain("baselineLoad");
  });

  it("labels in plain English, never the raw key", () => {
    const labels = authoredMethod(good()).map((a) => a.label);
    expect(labels).toContain("execution and cadence");
    expect(labels).not.toContain("execution");
  });
});

describe("likeness to the machine it is based on", () => {
  const standard = entry("m-pullover", good({ name: "PULLOVER", clinicalNote: "Lats through a long arc." }));

  it("is null when the studio named nothing", () => {
    expect(likenessTo(good(), undefined)).toBeNull();
  });

  it("splits what differs into method and hardware", () => {
    const theirs = good({
      name: "Pullover (Nautilus)",
      baselineLoad: { male: 70 },
      clinicalNote: "Lats through a long arc.",
      execution: { ...good().execution, keyCues: ["Elbows lead."] },
    } as Partial<MachineDefinition>);
    const l = likenessTo(theirs, standard)!;
    expect(l.standardName).toBe("PULLOVER");
    expect(l.hardware).toEqual(expect.arrayContaining(["name", "baselineLoad"]));
    expect(l.method).toEqual(["execution"]);
  });

  it("reports nothing when the two agree", () => {
    expect(likenessTo(good({ name: "PULLOVER", clinicalNote: "Lats through a long arc." }), standard)!.differs).toEqual([]);
  });

  it("treats absent and empty as the same, so a blank is not a difference", () => {
    const withBlank = good({ name: "PULLOVER", clinicalNote: "Lats through a long arc.", biomechanicalNotes: "" });
    expect(likenessTo(withBlank, standard)!.differs).toEqual([]);
  });
});

describe("the review", () => {
  const catalog = [entry("m-pullover", good({ name: "PULLOVER" }))];

  it("refuses an unfinished machine and says what it needs", () => {
    const r = reviewSubmission(sub(), good({ execution: { ...good().execution, keyCues: [] } } as Partial<MachineDefinition>), catalog);
    expect(r.verdict).toBe("incomplete");
    expect(r.headline).toContain("Not ready for the catalog");
    expect(r.headline).toContain("the key cues");
  });

  it("tells corporate whose words they are about to adopt", () => {
    const r = reviewSubmission(sub(), good(), catalog);
    expect(r.verdict).toBe("read-it");
    expect(r.headline).toContain("Solon wrote the method here");
    expect(r.headline).toContain("Max Strength's words");
  });

  it("separates the gaps that stop it from the ones that merely remain", () => {
    const r = reviewSubmission(sub(), good(), catalog);
    expect(r.blocking).toEqual([]);
    expect(r.remaining.map((g) => g.id)).toContain("dials");
  });

  it("says when a submission is really an existing machine on different hardware", () => {
    const theirs = good({ name: "Pullover (Hammer)", baselineLoad: { male: 70 } } as Partial<MachineDefinition>);
    const r = reviewSubmission(sub({ basedOn: "m-pullover" }), theirs, catalog);
    expect(r.headline).toContain("Reads like PULLOVER with different hardware");
    expect(r.headline).toContain("starting weight");
  });

  it("points at the method when a based-on submission rewrote it", () => {
    const theirs = good({ name: "PULLOVER", execution: { ...good().execution, keyCues: ["Ours."] } } as Partial<MachineDefinition>);
    const r = reviewSubmission(sub({ basedOn: "m-pullover" }), theirs, catalog);
    expect(r.headline).toContain("Solon wrote their own execution and cadence");
  });

  it("reviews the definition it is handed, not the one that arrived", () => {
    // The decision panel edits before publishing; the review must follow.
    const arrived = good({ execution: { ...good().execution, keyCues: [] } } as Partial<MachineDefinition>);
    const edited = good();
    expect(reviewSubmission(sub(), arrived, catalog).verdict).toBe("incomplete");
    expect(reviewSubmission(sub(), edited, catalog).verdict).toBe("read-it");
  });

  it("falls back to a studio name when the submission carries none", () => {
    const r = reviewSubmission({ basedOn: null, studioName: "" }, good(), catalog);
    expect(r.headline).toContain("The studio wrote the method here");
  });
});

describe("what corporate changed", () => {
  it("names the fields an admin edited before publishing", () => {
    const submitted = good();
    const published = good({ clinicalNote: "House wording.", execution: { ...good().execution, keyCues: ["House cue."] } } as Partial<MachineDefinition>);
    expect(correctedFields(submitted, published).sort()).toEqual(["clinicalNote", "execution"]);
  });

  it("is empty when the admin published it as it arrived", () => {
    expect(correctedFields(good(), good())).toEqual([]);
  });

  it("does not count a blank filled with a blank", () => {
    expect(correctedFields(good(), good({ biomechanicalNotes: "" }))).toEqual([]);
  });
});
