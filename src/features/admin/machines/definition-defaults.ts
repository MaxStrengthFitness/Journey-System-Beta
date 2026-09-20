import type {
  AnatomicalRegion,
  MachineDefinition,
  MovementPattern,
} from "../../../types/machines";

/**
 * A BLANK MACHINE, AND HOW TO READ A STORED ONE.
 *
 * These two moved out of MachineDefinitionForm when the editor became a
 * screen (Machine authoring, Sep 2026). They are the only part of that file
 * worth keeping.
 */

/**
 * A blank definition, prefilled with the house cadence and nothing else.
 *
 * The taxonomy fields start EMPTY, which is a change. They used to default to
 * "Chest" and "Upper Body: Horizontal Push", and because every catalog
 * document in production was written in the legacy shape and had no
 * movementPattern of its own, normalizeMachineDefinition handed that default
 * to the form for all twenty machines — leg press included — and saving wrote
 * it in. Twenty machines then rendered the same meta line in every grouped
 * view. A confident wrong value is worse than a missing one, so the editor
 * asks for these instead: the selects offer "Choose a region", and the
 * section rail counts the machine incomplete until someone does.
 *
 * The cast is deliberate. There is no honest member of AnatomicalRegion for
 * "not chosen yet", and inventing one would put it in every grouping toggle
 * in the app.
 */
export function emptyMachineDefinition(): MachineDefinition {
  return {
    name: "",
    anatomicalRegion: "" as AnatomicalRegion,
    movementPattern: "" as MovementPattern,
    kinematicClass: "compound-linear",
    primaryMuscles: [],
    secondaryMuscles: [],
    synergistMuscles: [],
    musculature: { primary: [], secondary: [], synergists: [] },
    preferredView: "front",
    clinicalNote: "",
    universalBaseline: {
      seatHeightPosition: "",
      padAxisAlignment: "",
      restraintsAnchoring: "",
      startingWeightStackGap: "",
    },
    bodyTypeAdjustments: {
      shorterStature: {},
      tallerStature: {},
      limitedMobility: {},
    },
    alignmentCheckpoints: [],
    execution: {
      requiresHandoff: false,
      loadUpProtocol: "",
      concentricSeconds: 6,
      eccentricSeconds: 6,
      upperTurnaround: { style: "touch-and-go", description: "" },
      lowerTurnaround: { style: "touch-and-go", description: "" },
      keyCues: [],
    },
    clinicalWarnings: [],
    contraindicatedFor: [],
    sequencingContraindications: [],
    settingFields: [],
    defaultSettings: {},
  };
}

/**
 * Fill in whatever a stored machine document is missing.
 *
 * Firestore documents are untyped at runtime. `doc.data() as MachineDefinition`
 * is an assertion, not a check — it silences the compiler without validating
 * anything. Machines saved before a field was introduced simply do not have
 * that field, so the form read `value.musculature.primary` off undefined and
 * took the whole view down with it (Sep 2, 2026).
 *
 * Every nested object is merged over its default rather than replaced, so a
 * partially-populated legacy document keeps everything it does have and only
 * gains what it lacks.
 */
export function normalizeMachineDefinition(
  raw: Partial<MachineDefinition> | null | undefined,
): MachineDefinition {
  const base = emptyMachineDefinition();
  if (!raw) return base;

  return {
    ...base,
    ...raw,

    primaryMuscles: raw.primaryMuscles ?? base.primaryMuscles,
    secondaryMuscles: raw.secondaryMuscles ?? base.secondaryMuscles,
    synergistMuscles: raw.synergistMuscles ?? base.synergistMuscles,

    musculature: {
      primary: raw.musculature?.primary ?? base.musculature.primary,
      secondary: raw.musculature?.secondary ?? base.musculature.secondary,
      synergists: raw.musculature?.synergists ?? base.musculature.synergists,
    },

    universalBaseline: {
      ...base.universalBaseline,
      ...(raw.universalBaseline ?? {}),
    },

    bodyTypeAdjustments: {
      shorterStature: {
        ...base.bodyTypeAdjustments.shorterStature,
        ...(raw.bodyTypeAdjustments?.shorterStature ?? {}),
      },
      tallerStature: {
        ...base.bodyTypeAdjustments.tallerStature,
        ...(raw.bodyTypeAdjustments?.tallerStature ?? {}),
      },
      limitedMobility: {
        ...base.bodyTypeAdjustments.limitedMobility,
        ...(raw.bodyTypeAdjustments?.limitedMobility ?? {}),
      },
    },

    alignmentCheckpoints: raw.alignmentCheckpoints ?? base.alignmentCheckpoints,

    execution: {
      ...base.execution,
      ...(raw.execution ?? {}),
      upperTurnaround: {
        ...base.execution.upperTurnaround,
        ...(raw.execution?.upperTurnaround ?? {}),
      },
      lowerTurnaround: {
        ...base.execution.lowerTurnaround,
        ...(raw.execution?.lowerTurnaround ?? {}),
      },
      keyCues: raw.execution?.keyCues ?? base.execution.keyCues,
    },

    clinicalWarnings: raw.clinicalWarnings ?? base.clinicalWarnings,
    contraindicatedFor: raw.contraindicatedFor ?? base.contraindicatedFor,
    sequencingContraindications:
      raw.sequencingContraindications ?? base.sequencingContraindications,
    settingFields: raw.settingFields ?? base.settingFields,
    defaultSettings: raw.defaultSettings ?? base.defaultSettings,
  };
}

/**
 * Strip the catalog's bookkeeping, leaving a plain definition for the editor.
 *
 * Takes an unknown-shaped record on purpose: the caller is handing over a
 * Firestore document, and the point of this function is that it does not
 * trust the shape.
 */
export function definitionOf(entry: object): MachineDefinition {
  const {
    id: _id,
    status: _status,
    defaultOrder: _defaultOrder,
    inStandardSet: _inStandardSet,
    schemaVersion: _schemaVersion,
    createdAt: _createdAt,
    createdBy: _createdBy,
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    ...definition
  } = entry as Record<string, unknown>;
  return normalizeMachineDefinition(definition as Partial<MachineDefinition>);
}
