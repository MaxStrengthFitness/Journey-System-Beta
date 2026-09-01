import { describe, it, expect } from "vitest";
import {
  resolveMachine,
  resolveUnrostered,
  mergeMachineDefinition,
} from "./resolve-machine";
import {
  MachineCatalogEntry,
  RosterEntryCustom,
  RosterEntryFromCatalog,
  MachineDefinition,
  studioMachineId,
  toBodyHighlighter,
} from "../types/machines";

const STUDIO = "studio-solon";

const legPress: MachineCatalogEntry = {
  id: "m-leg-press",
  status: "active",
  defaultOrder: 6,
  inStandardSet: true,
  schemaVersion: 1,

  name: "LEG PRESS",
  anatomicalRegion: "Thigh / Quad",
  movementPattern: "Lower Body: Quad Dominant",
  kinematicClassification: "Compound Push",
  executionPosture: "Chest Up / Anterior Pelvic Tilt",

  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings", "calves"],
  preferredView: "front",
  clinicalNote: "Compound knee and hip extension.",

  setup: "Default to P2 seat. Feet hip-width apart.",
  execution: "No pause at turnarounds.",
  setupCues: ["Set shoulder pads to touch the tops of shoulders."],
  executionCues: ["Keep hips down; avoid pelvis roll."],
  clinicalWarnings: [
    "Avoid pairing LP with Lumbar if client has a sensitive lower back.",
  ],
  contraindicatedFor: ["Acute knee effusion"],
  sequencingContraindications: [],
  requiresHandoff: false,
  baselineLoad: { male: 160, female: 60 },

  settingFields: [
    { key: "gap", label: "Gap", type: "enum", options: ["1", "2", "3"] },
    { key: "back-pad", label: "Back Pad", type: "enum", options: ["P2", "P3"] },
    { key: "seat", label: "Seat", type: "number", min: 1, max: 10 },
  ],
  defaultSettings: { gap: "2", "back-pad": "P2", seat: "5" },
};

function fromCatalog(
  over?: Partial<MachineDefinition>,
  extra: Partial<RosterEntryFromCatalog> = {},
): RosterEntryFromCatalog {
  return {
    machineId: "m-leg-press",
    studioId: STUDIO,
    source: "catalog",
    basedOn: "m-leg-press",
    status: "active",
    overrides: over,
    ...extra,
  };
}

describe("resolveMachine — catalog-sourced", () => {
  it("inherits the whole catalog entry when nothing is overridden", () => {
    const r = resolveMachine(fromCatalog(), legPress)!;
    expect(r.name).toBe("LEG PRESS");
    expect(r.primaryMuscles).toEqual(["quads", "glutes"]);
    expect(r.defaultSettings).toEqual({ gap: "2", "back-pad": "P2", seat: "5" });
    expect(r.overriddenFields).toEqual([]);
    expect(r.source).toBe("catalog");
  });

  it("lets a studio rename its machine without touching the catalog", () => {
    const r = resolveMachine(
      fromCatalog({ name: "LEG PRESS (Hammer)" }),
      legPress,
    )!;
    expect(r.name).toBe("LEG PRESS (Hammer)");
    expect(legPress.name).toBe("LEG PRESS");
    expect(r.overriddenFields).toEqual(["name"]);
  });

  it("lets a studio remap muscle targeting outright", () => {
    const r = resolveMachine(
      fromCatalog({ primaryMuscles: ["glutes"], secondaryMuscles: ["quads"] }),
      legPress,
    )!;
    expect(r.primaryMuscles).toEqual(["glutes"]);
    expect(r.secondaryMuscles).toEqual(["quads"]);
  });

  it("keeps catalog fields live-inherited so admin edits still propagate", () => {
    const corrected: MachineCatalogEntry = {
      ...legPress,
      setup: "CORRECTED: default to P3 seat.",
    };
    const r = resolveMachine(fromCatalog({ name: "Ours" }), corrected)!;
    expect(r.setup).toBe("CORRECTED: default to P3 seat.");
  });
});

describe("resolveMachine — clinical safety content is additive", () => {
  it("keeps the catalog warning when a studio adds its own", () => {
    const r = resolveMachine(
      fromCatalog({ clinicalWarnings: ["Our unit's footplate sticks."] }),
      legPress,
    )!;
    expect(r.clinicalWarnings).toEqual([
      "Avoid pairing LP with Lumbar if client has a sensitive lower back.",
      "Our unit's footplate sticks.",
    ]);
  });

  it("cannot be emptied by a studio override", () => {
    const r = resolveMachine(fromCatalog({ clinicalWarnings: [] }), legPress)!;
    expect(r.clinicalWarnings).toEqual(legPress.clinicalWarnings);
  });

  it("applies the same rule to contraindications", () => {
    const r = resolveMachine(
      fromCatalog({ contraindicatedFor: [] }),
      legPress,
    )!;
    expect(r.contraindicatedFor).toEqual(["Acute knee effusion"]);
  });

  it("does not duplicate a warning the studio restates verbatim", () => {
    const r = resolveMachine(
      fromCatalog({ clinicalWarnings: [...legPress.clinicalWarnings] }),
      legPress,
    )!;
    expect(r.clinicalWarnings).toHaveLength(1);
  });

  it("still lets an admin change the catalog warning for everyone", () => {
    const corrected: MachineCatalogEntry = {
      ...legPress,
      clinicalWarnings: ["Updated by admin."],
    };
    const r = resolveMachine(
      fromCatalog({ clinicalWarnings: ["Studio note."] }),
      corrected,
    )!;
    expect(r.clinicalWarnings).toEqual(["Updated by admin.", "Studio note."]);
  });
});

describe("resolveMachine — setting fields and values", () => {
  it("merges defaultSettings per key instead of replacing the map", () => {
    const r = resolveMachine(
      fromCatalog({ defaultSettings: { gap: "3" } }),
      legPress,
    )!;
    expect(r.defaultSettings).toEqual({ gap: "3", "back-pad": "P2", seat: "5" });
  });

  it("drops stored values whose dial the studio removed", () => {
    const r = resolveMachine(
      fromCatalog({
        settingFields: [
          { key: "gap", label: "Gap", type: "enum", options: ["1", "2"] },
        ],
      }),
      legPress,
    )!;
    expect(r.settingFields).toHaveLength(1);
    expect(r.defaultSettings).toEqual({ gap: "2" });
  });

  it("survives a label rename because values key on the stable key", () => {
    const r = resolveMachine(
      fromCatalog({
        settingFields: legPress.settingFields.map((f) =>
          f.key === "back-pad" ? { ...f, label: "Backpad" } : f,
        ),
      }),
      legPress,
    )!;
    expect(r.settingFields[1].label).toBe("Backpad");
    expect(r.defaultSettings["back-pad"]).toBe("P2");
  });
});

describe("resolveMachine — studio-original machines", () => {
  const custom: RosterEntryCustom = {
    machineId: studioMachineId(STUDIO, "Hammer Plate Leg Press"),
    studioId: STUDIO,
    source: "custom",
    basedOn: "m-leg-press",
    status: "active",
    definition: {
      name: "Hammer Plate Leg Press",
      anatomicalRegion: "Thigh / Quad",
      movementPattern: "Lower Body: Quad Dominant",
      kinematicClassification: "Compound Push",
      primaryMuscles: ["quads"],
      secondaryMuscles: ["glutes"],
      preferredView: "front",
      clinicalNote: "Plate-loaded quad dominant press.",
      setup: "Load plates evenly.",
      execution: "Controlled turnarounds.",
      setupCues: [],
      executionCues: [],
      clinicalWarnings: [],
      contraindicatedFor: [],
      sequencingContraindications: [],
      requiresHandoff: true,
      settingFields: [
        { key: "seat", label: "Seat", type: "number", min: 1, max: 8 },
      ],
      defaultSettings: { seat: "4", "back-pad": "P2" },
    },
  };

  it("resolves without a catalog entry", () => {
    const r = resolveMachine(custom)!;
    expect(r).not.toBeNull();
    expect(r.name).toBe("Hammer Plate Leg Press");
    expect(r.source).toBe("custom");
  });

  it("inherits nothing from its lineage machine", () => {
    const r = resolveMachine(custom, legPress)!;
    expect(r.setup).toBe("Load plates evenly.");
    expect(r.clinicalWarnings).toEqual([]);
  });

  it("stays comparable to the catalog machine for cross-studio roll-ups", () => {
    const r = resolveMachine(custom)!;
    expect(r.comparisonKey).toBe("m-leg-press");
    expect(r.machineId).not.toBe("m-leg-press");
  });

  it("falls back to its own id when it has no lineage", () => {
    const { basedOn: _drop, ...novel } = custom;
    const r = resolveMachine(novel as RosterEntryCustom)!;
    expect(r.comparisonKey).toBe(novel.machineId);
  });

  it("prunes values for dials it does not have", () => {
    const r = resolveMachine(custom)!;
    expect(r.defaultSettings).toEqual({ seat: "4" });
  });

  it("mints globally unique ids so leaderboards cannot collide", () => {
    const a = studioMachineId("studio-a", "Hammer Leg Press");
    const b = studioMachineId("studio-b", "Hammer Leg Press");
    expect(a).toBe("sm-studio-a-hammer-leg-press");
    expect(a).not.toBe(b);
  });
});

describe("resolveMachine — ordering and edge cases", () => {
  it("prefers the studio's own order", () => {
    const r = resolveMachine(fromCatalog(undefined, { order: 2 }), legPress)!;
    expect(r.order).toBe(2);
  });

  it("falls back to the shared display order", () => {
    const r = resolveMachine(fromCatalog(), legPress)!;
    expect(r.order).toBe(6);
  });

  it("sorts unknown machines last rather than first", () => {
    const r = resolveMachine({
      machineId: "sm-x-novel",
      studioId: STUDIO,
      source: "custom",
      status: "active",
      definition: { ...legPress, name: "Novel" },
    })!;
    expect(r.order).toBe(999);
  });

  it("returns null rather than throwing when a catalog doc is missing", () => {
    expect(resolveMachine(fromCatalog(), undefined)).toBeNull();
  });

  it("treats an explicitly undefined override as inherit, not clear", () => {
    const r = resolveMachine(fromCatalog({ name: undefined }), legPress)!;
    expect(r.name).toBe("LEG PRESS");
    expect(r.overriddenFields).toEqual([]);
  });

  it("surfaces a retired catalog entry the studio still owns", () => {
    const r = resolveMachine(fromCatalog(), {
      ...legPress,
      status: "retired",
    })!;
    expect(r.catalogStatus).toBe("retired");
    expect(r.rosterStatus).toBe("active");
  });
});

describe("resolveUnrostered", () => {
  it("presents catalog equipment a studio has not added yet", () => {
    const r = resolveUnrostered(legPress, STUDIO);
    expect(r.rosterStatus).toBe("inactive");
    expect(r.machineId).toBe("m-leg-press");
    expect(r.studioId).toBe(STUDIO);
  });
});

describe("mergeMachineDefinition", () => {
  it("reports every field the studio changed", () => {
    const { overriddenFields } = mergeMachineDefinition(legPress, {
      name: "Ours",
      primaryMuscles: ["glutes"],
    });
    expect(overriddenFields.sort()).toEqual(["name", "primaryMuscles"]);
  });

  it("never mutates the catalog entry it was given", () => {
    const snapshot = JSON.stringify(legPress);
    mergeMachineDefinition(legPress, { clinicalWarnings: ["added"] });
    expect(JSON.stringify(legPress)).toBe(snapshot);
  });
});

describe("toBodyHighlighter", () => {
  it("translates our vocabulary into the library's", () => {
    expect(toBodyHighlighter(["pecs", "delts-front"])).toEqual([
      "chest",
      "front-deltoids",
    ]);
  });

  it("collapses lats and rhomboids without double-highlighting", () => {
    expect(toBodyHighlighter(["lats", "rhomboids"])).toEqual(["upper-back"]);
  });

  it("uses the library's own spelling for adductors", () => {
    expect(toBodyHighlighter(["adductors"])).toEqual(["adductor"]);
    expect(toBodyHighlighter(["abductors"])).toEqual(["abductors"]);
  });
});
