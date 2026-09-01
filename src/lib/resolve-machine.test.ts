import { describe, it, expect } from "vitest";
import {
  resolveMachine,
  resolveUnrostered,
  mergeMachineDefinition,
} from "./resolve-machine";
import {
  MachineCatalogEntry,
  MachineDefinition,
  RosterEntryCustom,
  RosterEntryFromCatalog,
  settingFieldKey,
  studioMachineId,
  toBodySlugs,
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
  kinematicClass: "compound-linear",
  kinematicClassification: "Compound Push",
  executionPosture: "Chest Up / Anterior Pelvic Tilt",

  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings"],
  synergistMuscles: ["calves", "adductors"],
  musculature: {
    primary: ["Quadriceps (knee extension)", "Gluteus Maximus (hip extension)"],
    secondary: ["Hamstrings"],
    synergists: ["Gastrocnemius", "Soleus", "Adductor Magnus"],
  },
  preferredView: "front",
  clinicalNote: "Compound knee and hip extension.",

  universalBaseline: {
    seatHeightPosition: "Seat back to Position 2 (P2).",
    padAxisAlignment: "Feet parallel, hip-width; ankles, knees and hips stacked.",
    restraintsAnchoring: "Shoulder pads snug on the tops of the shoulders.",
    startingWeightStackGap: "Custom — pin the main stack and record the gap.",
  },
  bodyTypeAdjustments: {
    shorterStature: {
      seatAdjustment: "Push the seat settings closer to the footplate.",
      padHandlePlacement: "Lower foot position on the platform.",
    },
    tallerStature: {
      seatAdjustment: "Recline the seat back to Position 3 (P3).",
      specialNotes: "Wider stance, toes slightly out, knees tracking over feet.",
    },
    limitedMobility: {
      romRestrictions: "Increase the gap for a shallower lower turnaround.",
      alternativeProtocols: "TSC at the midpoint if dynamic loading is not tolerated.",
    },
  },
  alignmentCheckpoints: [
    {
      title: "Knee Tracking",
      verify: "Knees track in line with the feet; ankles, knees, hips stacked.",
    },
    {
      title: "Pelvic Stability",
      verify: "Hips stay down; the pelvis does not roll up at the lower turnaround.",
    },
  ],
  execution: {
    requiresHandoff: false,
    loadUpProtocol: "Build pressure through the footplate over 3–5 seconds.",
    concentricSeconds: 6,
    eccentricSeconds: 6,
    upperTurnaround: {
      style: "touch-and-go",
      description: "Click at the end stop, just before lock-out.",
      cue: "Ease out... do not speed up.",
    },
    lowerTurnaround: {
      style: "touch-and-go",
      description: "Seamless reversal, no momentum, no pause.",
      cue: "Barely touch, barely start.",
    },
    keyCues: ["Chin down", "Hips stay down"],
  },

  clinicalWarnings: [
    "Avoid pairing LP with Lumbar if the client has a sensitive lower back.",
  ],
  contraindicatedFor: ["Acute knee effusion"],
  sequencingContraindications: ["Do not follow directly with Lumbar Extension."],

  settingFields: [
    { key: "gap", label: "Gap", type: "enum", options: ["1", "2", "3"] },
    { key: "back-pad", label: "Back Pad", type: "enum", options: ["P2", "P3"] },
    { key: "seat", label: "Seat", type: "number", min: 1, max: 10 },
  ],
  defaultSettings: { gap: "2", "back-pad": "P2", seat: "5" },
  baselineLoad: { male: 160, female: 60 },
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

  it("lets a studio replace the whole baseline for a different model", () => {
    const r = resolveMachine(
      fromCatalog({
        universalBaseline: {
          seatHeightPosition: "Plate-loaded: no seat positions.",
          padAxisAlignment: "Align the hip crease with the pivot.",
          restraintsAnchoring: "No belt on this unit.",
          startingWeightStackGap: "N/A — plate loaded.",
        },
      }),
      legPress,
    )!;
    expect(r.universalBaseline.seatHeightPosition).toContain("Plate-loaded");
    expect(r.overriddenFields).toContain("universalBaseline");
  });

  it("keeps catalog fields live-inherited so admin edits still propagate", () => {
    const corrected: MachineCatalogEntry = {
      ...legPress,
      clinicalNote: "CORRECTED clinical note.",
    };
    const r = resolveMachine(fromCatalog({ name: "Ours" }), corrected)!;
    expect(r.clinicalNote).toBe("CORRECTED clinical note.");
  });
});

describe("resolveMachine — safety content is additive", () => {
  it("keeps the catalog warning when a studio adds its own", () => {
    const r = resolveMachine(
      fromCatalog({ clinicalWarnings: ["Our unit's footplate sticks."] }),
      legPress,
    )!;
    expect(r.clinicalWarnings).toEqual([
      "Avoid pairing LP with Lumbar if the client has a sensitive lower back.",
      "Our unit's footplate sticks.",
    ]);
  });

  it("cannot be emptied by a studio override", () => {
    const r = resolveMachine(fromCatalog({ clinicalWarnings: [] }), legPress)!;
    expect(r.clinicalWarnings).toEqual(legPress.clinicalWarnings);
  });

  it("applies the same rule to contraindications and sequencing", () => {
    const r = resolveMachine(
      fromCatalog({ contraindicatedFor: [], sequencingContraindications: [] }),
      legPress,
    )!;
    expect(r.contraindicatedFor).toEqual(["Acute knee effusion"]);
    expect(r.sequencingContraindications).toHaveLength(1);
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

describe("resolveMachine — alignment checkpoints are additive", () => {
  it("appends a studio checkpoint and keeps both catalog ones", () => {
    const r = resolveMachine(
      fromCatalog({
        alignmentCheckpoints: [
          { title: "Footplate Wear", verify: "Check the left footplate bolt." },
        ],
      }),
      legPress,
    )!;
    expect(r.alignmentCheckpoints.map((c) => c.title)).toEqual([
      "Knee Tracking",
      "Pelvic Stability",
      "Footplate Wear",
    ]);
  });

  it("cannot drop a non-negotiable checkpoint", () => {
    const r = resolveMachine(
      fromCatalog({ alignmentCheckpoints: [] }),
      legPress,
    )!;
    expect(r.alignmentCheckpoints).toHaveLength(2);
  });

  it("lets a studio reword a checkpoint by reusing its title", () => {
    const r = resolveMachine(
      fromCatalog({
        alignmentCheckpoints: [
          { title: "Knee Tracking", verify: "REWORDED for our unit." },
        ],
      }),
      legPress,
    )!;
    // Catalog wins on a title collision — the studio cannot weaken it.
    expect(r.alignmentCheckpoints).toHaveLength(2);
    expect(r.alignmentCheckpoints[0].verify).toContain("Knees track in line");
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

  it("derives stable keys from labels", () => {
    expect(settingFieldKey("Back Pad")).toBe("back-pad");
    expect(settingFieldKey("  Seat / Position  ")).toBe("seat-position");
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
      ...legPress,
      name: "Hammer Plate Leg Press",
      clinicalWarnings: [],
      contraindicatedFor: [],
      alignmentCheckpoints: [],
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
    expect(r.clinicalWarnings).toEqual([]);
    expect(r.alignmentCheckpoints).toEqual([]);
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

  it("carries the never-to-failure flag through untouched", () => {
    const lumbar: MachineCatalogEntry = {
      ...legPress,
      id: "m-lumbar",
      execution: {
        ...legPress.execution,
        neverToFailure: true,
        safetyNotice: "Never take Lumbar Extension to failure.",
      },
    };
    const r = resolveMachine(
      { ...fromCatalog(), machineId: "m-lumbar", basedOn: "m-lumbar" },
      lumbar,
    )!;
    expect(r.execution.neverToFailure).toBe(true);
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

describe("toBodySlugs", () => {
  it("translates our vocabulary into the body model's", () => {
    expect(toBodySlugs(["pecs", "quads"])).toEqual(["chest", "quadriceps"]);
  });

  it("collapses lats and rhomboids without double-highlighting", () => {
    expect(toBodySlugs(["lats", "rhomboids"])).toEqual(["upper-back"]);
  });

  it("collapses front and rear delts — the figure has one shoulder region", () => {
    expect(toBodySlugs(["delts-front", "delts-rear"])).toEqual(["deltoids"]);
  });

  it("maps abductors onto gluteal, since Gluteus Medius is gluteal", () => {
    expect(toBodySlugs(["abductors"])).toEqual(["gluteal"]);
  });

  it("does not double-paint gluteal when both glutes and abductors are set", () => {
    expect(toBodySlugs(["glutes", "abductors"])).toEqual(["gluteal"]);
  });

  it("uses the model's plural spelling for adductors", () => {
    expect(toBodySlugs(["adductors"])).toEqual(["adductors"]);
  });
});
