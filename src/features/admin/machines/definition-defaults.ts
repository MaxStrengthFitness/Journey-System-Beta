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

  // The Codex format's fields arrive through codexFieldsOf below, well-formed
  // or not at all, never through the plain spread.
  const rest: Record<string, unknown> = { ...raw };
  for (const key of CODEX_FIELDS) delete rest[key];

  return {
    ...base,
    ...(rest as Partial<MachineDefinition>),

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

    // The Codex format, v2: present only where the document says something.
    ...codexFieldsOf(raw),
  };
}

// ── The Codex format, v2 (Sep 28 2026) ───────────────────────────────

const CODEX_OBJECT_FIELDS = [
  "setUp",
  "getSet",
  "begin",
  "rep",
  "finish",
  "adapt",
  "program",
  "understand",
  "switches",
  "dialRules",
] as const satisfies readonly (keyof MachineDefinition)[];

const CODEX_LIST_FIELDS = [
  "stopRules",
  "watchOuts",
  "ifWrong",
  "faults",
  "sources",
] as const satisfies readonly (keyof MachineDefinition)[];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The v2 fields a stored document actually holds, each in the shape the
 * app reads — and NOTHING for a field it does not hold.
 *
 * "An old definition reads exactly as before" (AJ's approval, Sep 28 2026)
 * is this function's promise: a document written before v2 gains no key at
 * all, so a diff against it, a save of it and every screen that spreads it
 * see what they saw yesterday. A field in the wrong shape (a list where an
 * object belongs, a stop rule with no words) is dropped rather than bent
 * into something nobody wrote.
 */
export function codexFieldsOf(
  raw: Partial<MachineDefinition> | Record<string, unknown>,
): Partial<MachineDefinition> {
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of CODEX_OBJECT_FIELDS) {
    if (isPlainObject(src[key])) out[key] = src[key];
  }

  const keep = <T>(key: string, ok: (e: Record<string, unknown>) => boolean) => {
    const v = src[key];
    if (!Array.isArray(v)) return;
    const list = v.filter((e) => isPlainObject(e) && ok(e)) as T[];
    if (list.length) out[key] = list;
  };
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  keep("stopRules", (e) => text(e.text));
  keep("watchOuts", (e) => text(e.condition));
  keep("ifWrong", (e) => text(e.title));
  keep("faults", (e) => text(e.fault));
  keep("sources", (e) => text(e.path) && ["academy", "guide", "book", "unsourced"].includes(String(e.kind)));

  if (typeof src.modelId === "string" && src.modelId.trim()) out.modelId = src.modelId.trim();

  return out as Partial<MachineDefinition>;
}

/**
 * A value with every `undefined` taken out, at any depth, for a write.
 * Firestore refuses `undefined` anywhere in a document, and a form can leave
 * one inside an object (a starting weight cleared to nothing). Plain objects
 * and lists only; anything else (a sentinel, a timestamp) passes untouched.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as T;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** Every v2 key, for a caller that needs to know one when it sees one. */
export const CODEX_FIELDS: readonly (keyof MachineDefinition)[] = [
  ...CODEX_OBJECT_FIELDS,
  ...CODEX_LIST_FIELDS,
  "modelId",
];

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
