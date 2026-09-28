import { describe, expect, it } from "vitest";
import type { MachineDefinition } from "../../../types/machines";
import { ADDITIVE_DEFINITION_FIELDS } from "../../../lib/resolve-machine";
import {
  LOCAL_SETUP_FIELDS,
  REPLACING_SAFETY_FIELDS,
  describeOverrides,
  isPlainAdoption,
  localSetupUpdate,
  overriddenSafetyFields,
  pruneOverrides,
  type LocalMetadata,
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
  });

  it("reduces a bag of values to the keys that actually differ", () => {
    // Same argument as "DROPS an edit equal to the catalog value", one level
    // down. A form hands back every dial; storing the ones that match freezes
    // them, so a studio that once changed the seat would stop receiving
    // corrections to the gap. resolve-machine merges these per key, so
    // sending only the difference resolves identically on the floor.
    expect(
      pruneOverrides(catalog, { defaultSettings: { seat: "7", gap: "9" } } as any),
    ).toEqual({ defaultSettings: { seat: "7" } });
  });

  it("drops a bag whose every key matches, rather than storing an empty one", () => {
    expect(
      pruneOverrides(catalog, { defaultSettings: { gap: "9" } } as any),
    ).toEqual({});
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

describe("localSetupUpdate", () => {
  const base = { entry: { source: "catalog" as const }, catalog };
  const update = (local: LocalMetadata) => {
    const u = localSetupUpdate({ ...base, local });
    if (u.ok === false) throw new Error(u.reason);
    return u;
  };

  it("sets or clears the four fields it shows, and touches nothing else", () => {
    // Not `source`, `basedOn`, `machineId`, `studioId` or `status`: writing
    // those took a studio's own machine off the floor and put a machine that
    // was out of service back in service (Sep 28 2026).
    const u = update({ localName: "Hoist Leg Press", notes: "Pin sticks." });
    expect([...Object.keys(u.set), ...u.clear].sort()).toEqual([...LOCAL_SETUP_FIELDS].sort());
  });

  it("clears every field for a plain adoption", () => {
    expect(update({})).toEqual({ ok: true, set: {}, clear: [...LOCAL_SETUP_FIELDS] });
  });

  it("uses a local name as a name override", () => {
    expect(update({ localName: "Imagine Strength Leg Press" }).set).toEqual({
      "overrides.name": "Imagine Strength Leg Press",
    });
  });

  it("clears a local name identical to the catalog's, so a future rename still reaches it", () => {
    const u = update({ localName: " LEG PRESS " });
    expect(u.set).toEqual({});
    expect(u.clear).toContain("overrides.name");
  });

  it("records the unit and the note without touching the definition", () => {
    const u = update({
      notes: "Seat replaced March 2026; pin sticks on the 90lb stack.",
      serialNumber: "IS-4471",
      manufacturer: "Imagine Strength",
    });
    expect(u.set).toEqual({
      studioNotes: "Seat replaced March 2026; pin sticks on the 90lb stack.",
      "unit.serialNumber": "IS-4471",
      "unit.manufacturer": "Imagine Strength",
    });
    expect(u.clear).toEqual(["overrides.name"]);
  });

  it("clears whitespace-only boxes rather than storing them", () => {
    const u = update({ notes: "   ", serialNumber: "  ", manufacturer: "Hoist" });
    expect(u.set).toEqual({ "unit.manufacturer": "Hoist" });
    expect(u.clear).toEqual(["overrides.name", "studioNotes", "unit.serialNumber"]);
  });

  it("refuses a studio's own machine: its name is its own definition's", () => {
    const u = localSetupUpdate({ entry: { source: "custom" }, catalog: {}, local: { localName: "The Sled" } });
    expect(u.ok).toBe(false);
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
