import { describe, it, expect } from "vitest";
import type { MachineDefinition, MachineDefinitionField } from "../types/machines";
import { ADDITIVE_DEFINITION_FIELDS } from "./resolve-machine";
import {
  CODEX_METHOD_FIELDS,
  DEFINITION_KEYS,
  METHOD_DEFINITION_FIELDS,
  STUDIO_DEFINITION_FIELDS,
  canEdit,
  definitionFieldsOnly,
  describeFields,
  scopeOverrides,
  tierOf,
} from "./machine-template";

/**
 * Every field on MachineDefinition, written out by hand.
 *
 * Deliberately NOT derived from the type: this list is the tripwire. Adding a
 * field to MachineDefinition fails the first test here until someone decides,
 * in writing, whether a franchise location may change it. That decision is a
 * product one — it is the line between "our method" and "their hardware" —
 * and it should never be made by a field quietly inheriting a default.
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
    expect(sorted.additive.sort()).toEqual([...ADDITIVE_DEFINITION_FIELDS].sort());
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

  it("keeps the method on Max Strength's side", () => {
    // The company's product. A franchisee reads these; they do not rewrite them.
    for (const f of [
      "execution",
      "movementPattern",
      "kinematicClass",
      "musculature",
      "primaryMuscles",
      "clinicalNote",
    ] as MachineDefinitionField[]) {
      expect(tierOf(f)).toBe("method");
      expect(canEdit("studio", f)).toBe(false);
    }
  });

  it("defaults an unrecognised field to the corporate side", () => {
    // The failure mode of forgetting must be "the standard held".
    expect(tierOf("somethingAddedLater" as MachineDefinitionField)).toBe("method");
    expect(canEdit("studio", "somethingAddedLater" as MachineDefinitionField)).toBe(
      false,
    );
  });

  it("lets a studio add safety content but never silently replaces it", () => {
    // Additive fields are writable — the merge in resolve-machine is what
    // makes that addition-only, so the editor does offer the input.
    expect(canEdit("studio", "clinicalWarnings")).toBe(true);
    expect(tierOf("clinicalWarnings")).toBe("additive");
  });

  it("lets an admin edit anything on a studio's machine", () => {
    for (const f of ALL_FIELDS) {
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
    // The company's method, which a studio save must never carry.
    execution: {
      concentricSeconds: 2,
      eccentricSeconds: 2,
    } as MachineDefinition["execution"],
    movementPattern: "Core: Rotary",
    musculature: { primary: ["Whatever"], secondary: [], synergists: [] },
  };

  it("strips the method from a studio write", () => {
    const out = scopeOverrides("studio", full);
    expect(Object.keys(out).sort()).toEqual([
      "clinicalWarnings",
      "name",
      "universalBaseline",
    ]);
    // The cadence is the franchise. It does not leave in a studio's payload
    // even when a stale draft hands it to us.
    expect(out.execution).toBeUndefined();
    expect(out.movementPattern).toBeUndefined();
    expect(out.musculature).toBeUndefined();
  });

  it("passes everything through for an admin", () => {
    const out = scopeOverrides("admin", full);
    expect(Object.keys(out).sort()).toEqual(Object.keys(full).sort());
    expect(out.execution).toEqual(full.execution);
  });

  it("drops explicitly-undefined keys rather than storing them", () => {
    // Firestore refuses undefined, and an undefined key means "inherit".
    const out = scopeOverrides("studio", {
      name: "Ours",
      shortName: undefined,
    });
    expect("shortName" in out).toBe(false);
  });

  it("survives an absent override map", () => {
    expect(scopeOverrides("studio", undefined)).toEqual({});
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
