import { describe, expect, it } from "vitest";
import type { MachineDefinition } from "../../../types/machines";
import { ADDITIVE_DEFINITION_FIELDS } from "../../../lib/resolve-machine";
import {
  REPLACING_SAFETY_FIELDS,
  buildClone,
  describeOverrides,
  isPlainAdoption,
  overriddenSafetyFields,
  pruneOverrides,
} from "./clone";

const catalog = {
  name: "LEG PRESS",
  clinicalNote: "Quad dominant, seated.",
  clinicalWarnings: ["Stop on knee pain"],
  defaultSettings: { seat: "8", gap: "9" },
} as unknown as Partial<MachineDefinition>;

describe("pruneOverrides", () => {
  it("stores an edit that differs", () => {
    expect(pruneOverrides(catalog, { name: "Imagine Strength Leg Press" })).toEqual({
      name: "Imagine Strength Leg Press",
    });
  });

  it("DROPS an edit equal to the catalog value", () => {
    // The whole point. Omitted fields stay live-inherited, so an override
    // holding the same text quietly freezes that field: an admin later
    // correcting it reaches every studio EXCEPT the ones that "overrode" it
    // with what they were already inheriting.
    expect(pruneOverrides(catalog, { name: "LEG PRESS" })).toEqual({});
  });

  it("drops an empty value rather than blanking the inherited one", () => {
    expect(pruneOverrides(catalog, { clinicalNote: "" })).toEqual({});
    expect(pruneOverrides(catalog, { clinicalNote: undefined })).toEqual({});
  });

  it("compares objects and arrays by value, not identity", () => {
    expect(
      pruneOverrides(catalog, { defaultSettings: { seat: "8", gap: "9" } } as any),
    ).toEqual({});
    expect(
      pruneOverrides(catalog, { defaultSettings: { seat: "7", gap: "9" } } as any),
    ).toEqual({ defaultSettings: { seat: "7", gap: "9" } });
  });

  it("keeps a studio's addition to an additive safety list", () => {
    // resolve-machine unions and dedupes these, so sending the catalog's
    // entries alongside the studio's own is correct and harmless.
    const edits = {
      clinicalWarnings: ["Stop on knee pain", "Left footplate sticks"],
    } as any;
    expect(pruneOverrides(catalog, edits)).toEqual(edits);
  });

  it("returns nothing for no edits at all", () => {
    expect(pruneOverrides(catalog, undefined)).toEqual({});
  });
});

describe("buildClone", () => {
  const base = { studioId: "solon", catalogId: "m-leg-press", catalog };

  it("stays a catalog entry so it keeps inheriting and keeps rolling up", () => {
    // source "custom" would split this machine off the network leaderboard
    // and stop Academy corrections reaching it. A cloned template is still
    // that template.
    const entry = buildClone(base);
    expect(entry.source).toBe("catalog");
    expect(entry.basedOn).toBe("m-leg-press");
    expect(entry.machineId).toBe("m-leg-press");
  });

  it("writes no overrides key at all for a plain adoption", () => {
    const entry = buildClone(base);
    expect("overrides" in entry).toBe(false);
  });

  it("uses a local name as a name override", () => {
    const entry = buildClone({
      ...base,
      local: { localName: "Imagine Strength Leg Press" },
    });
    expect(entry.overrides).toEqual({ name: "Imagine Strength Leg Press" });
  });

  it("ignores a local name identical to the catalog's", () => {
    const entry = buildClone({ ...base, local: { localName: " LEG PRESS " } });
    expect("overrides" in entry).toBe(false);
  });

  it("records local metadata without touching the definition", () => {
    const entry = buildClone({
      ...base,
      local: {
        notes: "Seat replaced March 2026; pin sticks on the 90lb stack.",
        serialNumber: "IS-4471",
        manufacturer: "Imagine Strength",
      },
    });
    expect(entry.studioNotes).toContain("Seat replaced");
    expect(entry.unit).toEqual({
      serialNumber: "IS-4471",
      manufacturer: "Imagine Strength",
    });
    expect("overrides" in entry).toBe(false);
  });

  it("omits the unit entirely when nothing was given", () => {
    expect("unit" in buildClone(base)).toBe(false);
  });

  it("trims whitespace-only metadata away", () => {
    const entry = buildClone({
      ...base,
      local: { notes: "   ", serialNumber: "  " },
    });
    expect("studioNotes" in entry).toBe(false);
    expect("unit" in entry).toBe(false);
  });
});

describe("isPlainAdoption", () => {
  it("is true when nothing local was set", () => {
    expect(isPlainAdoption({}, undefined)).toBe(true);
  });

  it("is false once anything local exists", () => {
    expect(isPlainAdoption({}, { notes: "sticks" })).toBe(false);
    expect(isPlainAdoption({ name: "x" } as any, undefined)).toBe(false);
  });
});

describe("describeOverrides", () => {
  it("says the catalog is being followed when nothing is overridden", () => {
    expect(describeOverrides(undefined)).toBe("Follows the catalog");
    expect(describeOverrides({})).toBe("Follows the catalog");
  });

  it("names the fields rather than counting them", () => {
    // "3 overrides" tells a manager nothing about whether one of them is a
    // clinical note.
    expect(describeOverrides({ name: "x", clinicalNote: "y" } as any)).toBe(
      "Local: Name, Clinical Note",
    );
  });

  it("truncates a long list but keeps names first", () => {
    const many = { name: 1, clinicalNote: 2, execution: 3, settingFields: 4 } as any;
    expect(describeOverrides(many)).toMatch(/^Local: Name, Clinical Note, Execution \+1 more$/);
  });
});

describe("overriddenSafetyFields", () => {
  it("flags a field whose override REPLACES safety content", () => {
    expect(overriddenSafetyFields({ execution: {} } as any)).toEqual(["execution"]);
  });

  it("does NOT flag the additive lists", () => {
    // resolve-machine unions these, so a studio can add but never remove an
    // Academy warning. Flagging them would be crying wolf.
    for (const field of ADDITIVE_DEFINITION_FIELDS) {
      expect(REPLACING_SAFETY_FIELDS).not.toContain(field);
      expect(overriddenSafetyFields({ [field]: ["x"] } as any)).toEqual([]);
    }
  });

  it("is empty for a plain adoption", () => {
    expect(overriddenSafetyFields(undefined)).toEqual([]);
    expect(overriddenSafetyFields({})).toEqual([]);
  });
});
