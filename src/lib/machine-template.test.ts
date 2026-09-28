import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { MachineDefinition, MachineDefinitionField, RemovedSafetyLine } from "../types/machines";
import { ADDITIVE_DEFINITION_FIELDS, MIN_REMOVAL_REASON } from "./resolve-machine";
import {
  CODEX_METHOD_FIELDS,
  DEFINITION_KEYS,
  MAX_REMOVAL_REASON,
  MAX_REMOVED_SAFETY,
  METHOD_DEFINITION_FIELDS,
  RemovedSafetyError,
  SAFETY_RECORD_FIELDS,
  STUDIO_DEFINITION_FIELDS,
  canEdit,
  definitionFieldsOnly,
  describeFields,
  reasonIsEnough,
  removalRecord,
  safetyLinesMissing,
  scopeOverrides,
  tierOf,
  unexplainedRemovals,
} from "./machine-template";

/**
 * Every field on MachineDefinition, written out by hand.
 *
 * Deliberately NOT derived from the type: this list is the tripwire. Adding a
 * field to MachineDefinition fails the first test here until someone decides,
 * in writing, which tier it belongs to. That decision is a product one — it
 * says whose words a field is, how Compare groups a difference in it, and
 * what the catalog gate reviews — and it should never be made by a field
 * quietly inheriting a default.
 */
const ALL_FIELDS: MachineDefinitionField[] = [
  "name",
  "shortName",
  "anatomicalRegion",
  "movementPattern",
  "kinematicClass",
  "kinematicClassification",
  "executionPosture",
  "primaryMuscles",
  "secondaryMuscles",
  "synergistMuscles",
  "musculature",
  "preferredView",
  "clinicalNote",
  "universalBaseline",
  "bodyTypeAdjustments",
  "alignmentCheckpoints",
  "execution",
  "clinicalWarnings",
  "contraindicatedFor",
  "sequencingContraindications",
  "biomechanicalNotes",
  "settingFields",
  "defaultSettings",
  "baselineLoad",
  "imageUrl",
  "formVideoUrl",
  // The Codex format, v2 (Sep 28 2026).
  "stopRules",
  "watchOuts",
  "setUp",
  "dialRules",
  "getSet",
  "begin",
  "rep",
  "finish",
  "ifWrong",
  "adapt",
  "program",
  "faults",
  "understand",
  "switches",
  "sources",
  "modelId",
  // The Sep 21 rule (built Sep 28 2026).
  "removedSafety",
];

describe("the template boundary", () => {
  it("sorts every definition field into exactly one tier", () => {
    // A compile-time check that ALL_FIELDS has not gone stale: every entry is
    // a real key, and a key we forgot shows up as a missing tier below.
    const sorted = {
      studio: [] as string[],
      method: [] as string[],
      additive: [] as string[],
    };
    for (const f of ALL_FIELDS) sorted[tierOf(f)].push(f);

    expect(sorted.studio.sort()).toEqual([...STUDIO_DEFINITION_FIELDS].sort());
    expect(sorted.additive.sort()).toEqual([...ADDITIVE_DEFINITION_FIELDS, ...SAFETY_RECORD_FIELDS].sort());
    expect(sorted.method.sort()).toEqual(
      [...METHOD_DEFINITION_FIELDS, ...CODEX_METHOD_FIELDS].sort(),
    );

    const total =
      sorted.studio.length + sorted.method.length + sorted.additive.length;
    expect(total).toBe(ALL_FIELDS.length);
  });

  it("knows every field as a definition key, and nothing else", () => {
    // DEFINITION_KEYS is what a write keeps; a field missing from it would
    // be silently dropped from every override.
    expect([...DEFINITION_KEYS].sort()).toEqual([...ALL_FIELDS].sort());
  });

  it("files the Codex format's safety lists as additive and its model as hardware", () => {
    expect(tierOf("stopRules")).toBe("additive");
    expect(tierOf("watchOuts")).toBe("additive");
    expect(tierOf("removedSafety")).toBe("additive");
    expect(tierOf("modelId")).toBe("studio");
    for (const f of ["setUp", "dialRules", "rep", "ifWrong", "switches", "sources"] as MachineDefinitionField[]) {
      expect(tierOf(f)).toBe("method");
    }
  });

  it("keeps a resolved machine's bookkeeping out of a definition write", () => {
    const out = definitionFieldsOnly({
      name: "Ours",
      machineId: "m-leg-press",
      comparisonKey: "m-leg-press",
      rosterStatus: "active",
      overriddenFields: [],
      modelId: "mm-hoist-roc-it-leg-press",
    });
    expect(out).toEqual({ name: "Ours", modelId: "mm-hoist-roc-it-leg-press" });
  });

  it("puts the hardware on the studio's side", () => {
    // What differs between one building's leg press and another's.
    for (const f of [
      "name",
      "universalBaseline",
      "bodyTypeAdjustments",
      "settingFields",
      "defaultSettings",
      "baselineLoad",
    ] as MachineDefinitionField[]) {
      expect(tierOf(f)).toBe("studio");
    }
  });

  it("still names the method as Max Strength's words", () => {
    for (const f of [
      "execution",
      "movementPattern",
      "kinematicClass",
      "musculature",
      "primaryMuscles",
      "clinicalNote",
    ] as MachineDefinitionField[]) {
      expect(tierOf(f)).toBe("method");
    }
    // The failure mode of forgetting is "counted as the method".
    expect(tierOf("somethingAddedLater" as MachineDefinitionField)).toBe("method");
  });

  it("lets a studio change anything on its own copy — the Sep 21 rule", () => {
    // AJ: "Yes studios need to be able to customize their stuff safety is
    // definitely a worry but are trusted". What keeps it safe is Compare.
    for (const f of ALL_FIELDS) {
      expect(canEdit("studio", f)).toBe(true);
      expect(canEdit("admin", f)).toBe(true);
      expect(canEdit("catalog", f)).toBe(true);
    }
  });
});

describe("scopeOverrides", () => {
  const full: Partial<MachineDefinition> = {
    name: "Our Leg Press",
    universalBaseline: {
      seatHeightPosition: "P3",
    } as MachineDefinition["universalBaseline"],
    clinicalWarnings: ["Our floor is slick by the platform."],
    execution: {
      concentricSeconds: 8,
      eccentricSeconds: 8,
    } as MachineDefinition["execution"],
    movementPattern: "Core: Rotary",
    musculature: { primary: ["Whatever"], secondary: [], synergists: [] },
  };

  it("lets a studio write the method on its own copy", () => {
    const out = scopeOverrides("studio", full);
    expect(Object.keys(out).sort()).toEqual(Object.keys(full).sort());
    expect(out.execution).toEqual(full.execution);
  });

  it("keeps only the definition's own fields", () => {
    const out = scopeOverrides("admin", {
      ...full,
      machineId: "m-leg-press",
      comparisonKey: "m-leg-press",
      overriddenFields: ["name"],
    } as Partial<MachineDefinition>);
    expect(Object.keys(out).sort()).toEqual(Object.keys(full).sort());
  });

  it("drops explicitly-undefined keys on a copy rather than storing them", () => {
    // Firestore refuses undefined, and an undefined key means "inherit".
    const out = scopeOverrides("studio", {
      name: "Ours",
      shortName: undefined,
    });
    expect("shortName" in out).toBe(false);
  });

  it("keeps a cleared field on the standard, so the catalog save can delete it", () => {
    const out = scopeOverrides("catalog", { setUp: undefined, name: "LEG PRESS" });
    expect("setUp" in out).toBe(true);
    expect(out.setUp).toBeUndefined();
  });

  it("never lets the standard carry a removal record", () => {
    const out = scopeOverrides("catalog", {
      removedSafety: [{ field: "clinicalWarnings", line: "x", reason: "because", by: { uid: "a", name: "A" }, at: "" }],
    });
    expect("removedSafety" in out).toBe(false);
  });

  it("survives an absent override map", () => {
    expect(scopeOverrides("studio", undefined)).toEqual({});
  });
});

describe("removing a safety line from a copy (the Sep 21 rule)", () => {
  const standard: Partial<MachineDefinition> = {
    clinicalWarnings: ["Knees never lock out at the end stop.", "Breathe freely at the lower turn."],
    contraindicatedFor: ["Acute knee effusion"],
    alignmentCheckpoints: [
      { title: "Knee Tracking", verify: "Knees over the feet." },
      { title: "Pelvic Stability", verify: "Hips stay down." },
    ],
    stopRules: [{ text: "Head pain is an exertion headache: unload and stop." }],
  };
  const eowyn = { uid: "uid-eowyn", name: "Éowyn" };
  const noBelt = (line: string, field: RemovedSafetyLine["field"] = "clinicalWarnings") =>
    removalRecord({ field, line }, "This unit has no footplate end stop.", eowyn, new Date("2026-09-28T15:00:00Z"));

  it("refuses a line taken off without a reason, naming it", () => {
    const draft = { ...standard, clinicalWarnings: ["Breathe freely at the lower turn."] };
    expect(() => scopeOverrides("studio", draft, standard)).toThrow(RemovedSafetyError);
    try {
      scopeOverrides("studio", draft, standard);
    } catch (e) {
      expect((e as RemovedSafetyError).lines).toEqual([
        { field: "clinicalWarnings", line: "Knees never lock out at the end stop." },
      ]);
      expect((e as Error).message).toContain("A safety line leaves only with a reason");
    }
    expect(unexplainedRemovals(standard, draft)).toHaveLength(1);
  });

  it("refuses a reason too short to be one", () => {
    const draft = {
      ...standard,
      clinicalWarnings: ["Breathe freely at the lower turn."],
      removedSafety: [{ ...noBelt("Knees never lock out at the end stop."), reason: " x " }],
    };
    expect(() => scopeOverrides("studio", draft, standard)).toThrow(RemovedSafetyError);
    expect(reasonIsEnough("no")).toBe(false);
    expect(reasonIsEnough("No belt")).toBe(true);
    expect(reasonIsEnough("y".repeat(MAX_REMOVAL_REASON + 1))).toBe(false);
  });

  it("lets it go with a reason, and keeps the record with who and when", () => {
    const record = noBelt("Knees never lock out at the end stop.");
    const draft = {
      ...standard,
      clinicalWarnings: ["Breathe freely at the lower turn.", "Our footplate latch sticks."],
      removedSafety: [record],
    };
    const out = scopeOverrides("studio", draft, standard);
    expect(out.removedSafety).toEqual([record]);
    expect(record).toEqual({
      field: "clinicalWarnings",
      line: "Knees never lock out at the end stop.",
      reason: "This unit has no footplate end stop.",
      by: eowyn,
      at: "2026-09-28T15:00:00.000Z",
    });
    // The list keeps only what the studio ADDED.
    expect(out.clinicalWarnings).toEqual(["Our footplate latch sticks."]);
  });

  it("drops a list the studio only kept, so it goes on following the catalog", () => {
    const out = scopeOverrides("studio", { ...standard, name: "Ours" }, standard);
    expect("clinicalWarnings" in out).toBe(false);
    expect("alignmentCheckpoints" in out).toBe(false);
    expect("removedSafety" in out).toBe(false);
    expect(out.name).toBe("Ours");
  });

  it("drops a record for a line that is still there, or no longer the catalog's", () => {
    const out = scopeOverrides(
      "studio",
      {
        ...standard,
        removedSafety: [noBelt("Breathe freely at the lower turn."), noBelt("A line head office took out already")],
      },
      standard,
    );
    expect("removedSafety" in out).toBe(false);
  });

  it("works on checkpoints and stop rules by their title and words, and keeps a studio's rewording", () => {
    const draft: Partial<MachineDefinition> = {
      ...standard,
      alignmentCheckpoints: [
        { title: "Knee Tracking", verify: "Knees over the feet." },
        { title: "Pelvic Stability", verify: "Ours: hips stay down, belt snug." },
      ],
      stopRules: [],
      removedSafety: [
        noBelt("Pelvic Stability", "alignmentCheckpoints"),
        noBelt("Head pain is an exertion headache: unload and stop.", "stopRules"),
      ],
    };
    const out = scopeOverrides("admin", draft, standard);
    expect(out.alignmentCheckpoints).toEqual([{ title: "Pelvic Stability", verify: "Ours: hips stay down, belt snug." }]);
    expect("stopRules" in out).toBe(false);
    expect(out.removedSafety?.map((r) => r.field)).toEqual(["alignmentCheckpoints", "stopRules"]);
  });

  it(`takes at most ${MAX_REMOVED_SAFETY} of the catalog's lines off one machine`, () => {
    const many = Array.from({ length: MAX_REMOVED_SAFETY + 1 }, (_, i) => `Warning ${i}`);
    const std = { clinicalWarnings: many };
    const draft = { clinicalWarnings: [], removedSafety: many.map((l) => noBelt(l)) };
    expect(() => scopeOverrides("studio", draft, std)).toThrow(`At most ${MAX_REMOVED_SAFETY}`);
    const fine = { clinicalWarnings: [many[0]], removedSafety: many.slice(1).map((l) => noBelt(l)) };
    expect(scopeOverrides("studio", fine, std).removedSafety).toHaveLength(MAX_REMOVED_SAFETY);
  });

  it("names what is missing from a whole draft", () => {
    expect(safetyLinesMissing(standard, { ...standard, contraindicatedFor: [] })).toEqual([
      { field: "contraindicatedFor", line: "Acute knee effusion" },
    ]);
    // A list the draft does not hold is not "missing".
    expect(safetyLinesMissing(standard, { name: "Ours" })).toEqual([]);
  });

  it("has nothing to remove from a studio's own machine", () => {
    const out = scopeOverrides("studio", { clinicalWarnings: [], removedSafety: [noBelt("x")] });
    expect("removedSafety" in out).toBe(false);
  });

  // The rules hold the same numbers (firestore.rules, "WAVE 2 CODEX:
  // removedSafetyValid"). Change them together.
  it("agrees with firestore.rules on the cap and the reason's length", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const rules = readFileSync(join(here, "..", "..", "firestore.rules"), "utf8");
    const start = rules.indexOf("function removedSafetyValid");
    expect(start).toBeGreaterThan(0);
    const body = rules.slice(start, rules.indexOf("\n    }", start));
    expect(body).toContain(`l.size() <= ${MAX_REMOVED_SAFETY}`);
    // One place per possible record, no more.
    expect((body.match(/removedLineValid\(l\[\d+\]\)/g) ?? []).length).toBe(MAX_REMOVED_SAFETY);
    const line = rules.slice(rules.indexOf("function removedLineValid"), rules.indexOf("function removedSafetyValid"));
    expect(line).toContain(`trim().size() >= ${MIN_REMOVAL_REASON}`);
    expect(line).toContain(`size() <= ${MAX_REMOVAL_REASON}`);
  });
});

describe("describeFields", () => {
  it("names what changed instead of counting it", () => {
    expect(describeFields(["universalBaseline", "settingFields", "baselineLoad"])).toBe(
      "baseline setup, the dials and starting weight",
    );
  });

  it("reads naturally for one and two fields", () => {
    expect(describeFields(["name"])).toBe("name");
    expect(describeFields(["name", "baselineLoad"])).toBe("name and starting weight");
    expect(describeFields([])).toBe("");
  });
});
