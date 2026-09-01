/**
 * MACHINE MODEL — global catalog, studio roster, resolved machine.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * Three layers, each storing only what it alone knows:
 *
 *   1. machines/{machineId}                  the default set. Admin-write only.
 *   2. studios/{studioId}/roster/{machineId} what THIS location actually has.
 *   3. clientMachineSettings                 one client's values (unchanged,
 *                                            see ClientMachineSetting in types.ts).
 *
 * The catalog is a starting library, not a constraint. A studio picks an entry
 * from it and may override any field, or define a machine the catalog has never
 * heard of. The one thing that stays central is LINEAGE (`basedOn`) — without
 * it, a hundred locations' bespoke leg presses become a hundred incomparable
 * machines in any cross-studio roll-up.
 *
 * Nothing here is read directly by a component. Components consume
 * ResolvedMachine, produced by lib/resolve-machine.ts.
 */

// ─────────────────────────────────────────────────────────────────────
// SHARED VOCABULARY
//
// Canonical home for the taxonomy. data/machine-anatomy-map.ts re-exports
// from here so there is exactly one definition of each of these in the app.
// ─────────────────────────────────────────────────────────────────────

/**
 * Muscle groups the app reasons about. These are OUR names, not
 * react-body-highlighter's — use toBodyHighlighter() at the render boundary
 * and nowhere else.
 */
export type MuscleId =
  // Anterior
  | 'pecs' | 'delts-front' | 'biceps' | 'forearms'
  | 'abs' | 'obliques' | 'adductors' | 'abductors' | 'quads'
  // Posterior
  | 'traps' | 'delts-rear' | 'rhomboids' | 'lats'
  | 'triceps' | 'lower-back' | 'glutes' | 'hamstrings' | 'calves'
  // Cervical
  | 'neck';

export type AnatomyView = 'front' | 'side' | 'back';

/** Ordered for the Catalog's "Kinematics" grouping toggle. */
export const MOVEMENT_PATTERN_ORDER = [
  'Upper Body: Horizontal Push',
  'Upper Body: Horizontal Pull',
  'Upper Body: Vertical Push',
  'Upper Body: Vertical Pull',
  'Upper Body: Isolation',
  'Lower Body: Quad Dominant',
  'Lower Body: Posterior Chain',
  'Core: Spine Flexion',
  'Core: Spine Extension',
  'Core: Rotary',
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERN_ORDER)[number];

/** Ordered for the Catalog's "Region" grouping toggle. */
export const ANATOMICAL_REGION_ORDER = [
  'Chest',
  'Back',
  'Shoulder',
  'Arm / Upper Extremity',
  'Thigh / Quad',
  'Hamstring / Glute',
  'Hip',
  'Core',
  'Neck',
] as const;

export type AnatomicalRegion = (typeof ANATOMICAL_REGION_ORDER)[number];

/**
 * react-body-highlighter speaks its own vocabulary, and it is lossy — the
 * model has no separate lats or rhomboids, only "upper-back". This is the
 * ONLY place that vocabulary is allowed to appear.
 *
 * Note the library's own naming quirk: its ABDUCTOR key carries the string
 * "adductor" and ABDUCTORS carries "abductors". The string values below are
 * the ones the SVG actually keys on.
 */
const BODY_HIGHLIGHTER_MAP: Record<MuscleId, string[]> = {
  'pecs': ['chest'],
  'delts-front': ['front-deltoids'],
  'delts-rear': ['back-deltoids'],
  'biceps': ['biceps'],
  'triceps': ['triceps'],
  'forearms': ['forearm'],
  'traps': ['trapezius'],
  'rhomboids': ['upper-back'],
  'lats': ['upper-back'],
  'lower-back': ['lower-back'],
  'abs': ['abs'],
  'obliques': ['obliques'],
  'glutes': ['gluteal'],
  'quads': ['quadriceps'],
  'hamstrings': ['hamstring'],
  'adductors': ['adductor'],
  'abductors': ['abductors'],
  'calves': ['calves'],
  'neck': ['neck'],
};

/**
 * Translate our muscle ids into react-body-highlighter's, de-duplicated —
 * lats and rhomboids both collapse to "upper-back", and highlighting the
 * same region twice makes it render at double intensity.
 */
export function toBodyHighlighter(ids: MuscleId[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    for (const name of BODY_HIGHLIGHTER_MAP[id] ?? []) out.add(name);
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────
// SETTING FIELDS
// ─────────────────────────────────────────────────────────────────────

/**
 * One adjustable dial on a machine (Gap, Back Pad, Seat).
 *
 * `key` is the identity and is written into every client's saved settings —
 * it must never change once shipped. `label` is display-only and safe for
 * anyone to rename at any time.
 *
 * Before this round both were the same string, so renaming a label in the
 * Hub editor silently orphaned every client's stored value for that dial.
 */
export interface MachineSettingField {
  /** Stable slug: 'gap', 'back-pad', 'seat'. Immutable once shipped. */
  key: string;
  /** Display text: 'Back Pad'. Freely editable. */
  label: string;
  type: 'enum' | 'number' | 'text';
  /** enum only — e.g. ['1', '2', '3', '4'] */
  options?: string[];
  /** number only */
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  /** Shown under the input in the settings modal. */
  helpText?: string;
}

// ─────────────────────────────────────────────────────────────────────
// THE DEFINITION — the shape a machine has, wherever it was defined
// ─────────────────────────────────────────────────────────────────────

/**
 * Everything that describes a machine, independent of who defined it.
 *
 * The catalog stores a complete one. A studio may override any subset of it,
 * or supply a whole one for its own equipment. Absorbs DEFAULT_MACHINES,
 * data/machine-database.ts and data/machine-anatomy-map.ts.
 */
export interface MachineDefinition {
  name: string;
  shortName?: string;

  // Taxonomy — drives every grouped view
  anatomicalRegion: AnatomicalRegion;
  movementPattern: MovementPattern;
  kinematicClassification: string;
  executionPosture?: string;

  // Anatomy — feeds the body model directly
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  preferredView: AnatomyView;
  clinicalNote: string;

  // Coaching knowledge
  setup: string;
  execution: string;
  setupCues: string[];
  executionCues: string[];
  /** Safety content. Studios may ADD to this; they can never remove a
   *  catalog warning. See ADDITIVE_DEFINITION_FIELDS in lib/resolve-machine. */
  clinicalWarnings: string[];
  /** Additive for the same reason as clinicalWarnings. */
  contraindicatedFor: string[];
  sequencingContraindications: string[];
  biomechanicalNotes?: string;
  requiresHandoff: boolean;
  baselineLoad?: { male?: number; female?: number };

  // The adjustable dials
  settingFields: MachineSettingField[];
  /** Keyed by MachineSettingField.key — never by label. */
  defaultSettings: Record<string, string>;

  imageUrl?: string;
}

/** Every key on MachineDefinition, for override bookkeeping. */
export type MachineDefinitionField = keyof MachineDefinition;

// ─────────────────────────────────────────────────────────────────────
// LAYER 1 — the default set
// ─────────────────────────────────────────────────────────────────────

export type CatalogStatus = 'active' | 'draft' | 'retired';

/**
 * Firestore: machines/{machineId} — doc id keeps the existing `m-*`
 * convention ('m-leg-press').
 *
 * The library a studio picks from. Admin-write only ("admins and above" —
 * isSuperAdmin() in firestore.rules; franchise owners deliberately excluded,
 * because un-overridden fields stay live-inherited by every studio).
 *
 * Retired entries are never deleted — a studio may still physically own the
 * machine, and every exerciseLog ever written references its id.
 */
export interface MachineCatalogEntry extends MachineDefinition {
  id: string;
  status: CatalogStatus;
  defaultOrder: number;
  /** Pre-checked in the studio onboarding picker. */
  inStandardSet: boolean;

  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
  /** Start at 1. Lets a later backfill tell migrated docs from fresh ones. */
  schemaVersion: number;
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 2 — what this location actually has
// ─────────────────────────────────────────────────────────────────────

export type RosterStatus = 'active' | 'inactive' | 'maintenance';

interface RosterEntryBase {
  /** Equals the Firestore doc id. */
  machineId: string;
  /** Denormalized so a collectionGroup query over rosters can filter. */
  studioId: string;

  status: RosterStatus;
  /** Falls back to the catalog's defaultOrder, then machine-display-order.ts. */
  order?: number;

  /** The Catalog view's "Studio Notes" box writes HERE, not to the global
   *  catalog doc — that write was leaking one studio's notes to all of them. */
  studioNotes?: string;

  /** Optional physical unit tracking; enables maintenance reporting. */
  unit?: {
    serialNumber?: string;
    installedAt?: any;
    lastServicedAt?: any;
  };

  updatedAt?: any;
  updatedBy?: string;
}

/** (a) Picked from the default set, tuned to taste. */
export interface RosterEntryFromCatalog extends RosterEntryBase {
  source: 'catalog';
  /** Catalog machine id this entry inherits from. */
  basedOn: string;
  /**
   * Any field on MachineDefinition, including name, muscles, cues and
   * setting fields. Omitted fields stay LIVE-INHERITED from the catalog, so
   * an admin correcting a clinical warning still reaches every studio that
   * did not deliberately override it.
   */
  overrides?: Partial<MachineDefinition>;
}

/** (b) The studio's own machine — the catalog never heard of it. */
export interface RosterEntryCustom extends RosterEntryBase {
  source: 'custom';
  /**
   * LINEAGE, NOT INHERITANCE. "This is our leg press" — a plate-loaded unit
   * that shares nothing with the catalog entry but IS the same movement.
   * Nothing is inherited through this; it exists so cross-studio roll-ups
   * (leaderboards, network insights) can compare like with like.
   *
   * Omit only for genuinely novel equipment with no catalog analogue.
   */
  basedOn?: string;
  /** Complete and self-contained; the studio authors all of it. */
  definition: MachineDefinition;
}

export type StudioMachineRosterEntry =
  | RosterEntryFromCatalog
  | RosterEntryCustom;

/**
 * Id convention for studio-original machines: `sm-{studioId}-{slug}`.
 *
 * MUST be globally unique. machineId is a foreign key in exerciseLogs,
 * clientMachineSettings and routines, all of which are queried ACROSS
 * studios — MachineLeaderboardDashboard runs a bare
 * where('machineId','==',...) with no studio filter. Two locations both
 * minting `sm-hammer-leg-press` would merge their leaderboards into one
 * wrong number.
 */
export function studioMachineId(studioId: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `sm-${studioId}-${slug}`;
}

// ─────────────────────────────────────────────────────────────────────
// THE RESOLVED SHAPE — the only machine any component should see
// ─────────────────────────────────────────────────────────────────────

/**
 * One machine, fully resolved for one studio.
 *
 * No component reads a catalog doc and a studio override and picks a winner
 * itself — that duplicated fallback chain is what diverged across six files
 * before this round.
 */
export interface ResolvedMachine extends MachineDefinition {
  machineId: string;
  studioId: string;
  source: 'catalog' | 'custom';
  rosterStatus: RosterStatus;
  order: number;
  studioNotes?: string;

  /** Present for catalog-sourced machines; lets the UI flag equipment whose
   *  catalog entry has since been retired. */
  catalogStatus?: CatalogStatus;

  /**
   * The key to aggregate on for anything CROSS-STUDIO — leaderboards,
   * insights, network reporting. Equals `basedOn ?? machineId`.
   *
   * Per-studio views key on machineId exactly as they do today; only
   * roll-ups use this.
   */
  comparisonKey: string;

  /** Which definition fields this studio deliberately changed. Drives the
   *  "overridden" badge in the roster manager. */
  overriddenFields: MachineDefinitionField[];
}
