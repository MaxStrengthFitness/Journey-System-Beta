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
 * The definition shape below mirrors the studio's own "Master Machine Setup &
 * Biomechanics Template" section for section, so a coach filling out the paper
 * template and an admin filling out the Machine Creator are doing the same job.
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
 * Muscle regions the BODY DIAGRAM can light up. Deliberately coarse — this is
 * a rendering vocabulary, not an anatomy reference.
 *
 * Precise anatomy (Sartorius, Multifidus, Quadratus Lumborum, Pectineus...)
 * lives in MachineDefinition.musculature as text, because the diagram has no
 * region for it and a coach still needs to read it.
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
 * Compound (linear, multi-joint) movements take a seamless touch-and-go at both
 * turnarounds. Rotary (single-joint) movements take a pause/squeeze at the
 * contracted position. Driving this off a field rather than the coach's memory
 * is what keeps cadence consistent across 100+ locations.
 */
export type KinematicClass = 'compound-linear' | 'rotary-single-joint';

/**
 * react-muscle-highlighter's own vocabulary. This is the ONLY place it is
 * allowed to appear.
 *
 * Two deliberate collapses, because the model has no region for them:
 *
 *   delts-front / delts-rear -> 'deltoids'
 *       The figure has one shoulder region. The anterior/posterior
 *       distinction survives in musculature.primary as text, which is where
 *       a coach reads it anyway.
 *
 *   abductors -> 'gluteal'
 *       There is no abductor region, and the Abduction machine's target is
 *       Gluteus Medius — which IS gluteal. Arguably more anatomically
 *       honest than a separate "abductors" blob.
 *
 * lats and rhomboids both collapse to 'upper-back', unchanged from before.
 */
const BODY_SLUG_MAP: Record<MuscleId, string> = {
  'pecs': 'chest',
  'delts-front': 'deltoids',
  'delts-rear': 'deltoids',
  'biceps': 'biceps',
  'triceps': 'triceps',
  'forearms': 'forearm',
  'traps': 'trapezius',
  'rhomboids': 'upper-back',
  'lats': 'upper-back',
  'lower-back': 'lower-back',
  'abs': 'abs',
  'obliques': 'obliques',
  'glutes': 'gluteal',
  'quads': 'quadriceps',
  'hamstrings': 'hamstring',
  'adductors': 'adductors',
  'abductors': 'gluteal',
  'calves': 'calves',
  'neck': 'neck',
};

/**
 * Which side of the figure each muscle is actually drawn on.
 *
 * The model has one 'deltoids' region and one 'trapezius' region that appear on
 * both sides, and 'forearm'/'neck' likewise. Everything else belongs to exactly
 * one view — which is the whole reason preferredView exists, and the thing that
 * has to be checked when a mapping is authored: a machine whose PRIMARY muscle
 * is invisible on its preferred view renders a figure lit only by its
 * synergists, which is what the Hip Abduction report turned out to be.
 */
export const MUSCLE_VISIBLE_ON: Record<MuscleId, ('front' | 'back')[]> = {
  pecs: ['front'],
  'delts-front': ['front', 'back'],
  'delts-rear': ['front', 'back'],
  biceps: ['front'],
  forearms: ['front', 'back'],
  abs: ['front'],
  obliques: ['front'],
  adductors: ['front'],
  abductors: ['back'],
  quads: ['front'],
  traps: ['front', 'back'],
  rhomboids: ['back'],
  lats: ['back'],
  triceps: ['back'],
  'lower-back': ['back'],
  glutes: ['back'],
  hamstrings: ['back'],
  calves: ['back'],
  neck: ['front', 'back'],
};

/** True when this muscle is drawn on this side of the figure. */
export function isMuscleVisibleOn(id: MuscleId, view: 'front' | 'back'): boolean {
  return MUSCLE_VISIBLE_ON[id]?.includes(view) ?? false;
}

/** Every muscle id the diagram knows, for runtime validation of loose data. */
export const ALL_MUSCLE_IDS = Object.keys(BODY_SLUG_MAP) as MuscleId[];

/** True when an arbitrary string is a MuscleId the diagram can paint. */
export function isMuscleId(value: string): value is MuscleId {
  return Object.prototype.hasOwnProperty.call(BODY_SLUG_MAP, value);
}

/** The body model's region slug for one muscle id. */
export function toBodySlug(id: MuscleId): string | undefined {
  return BODY_SLUG_MAP[id];
}

/**
 * Every muscle id that paints onto one of the body model's regions.
 *
 * The reverse of toBodySlug, and deliberately many-to-one: tapping the figure's
 * single 'deltoids' region has to match both delts-front and delts-rear, and
 * 'gluteal' has to match both glutes and abductors. Anything that needs to go
 * from a region the user touched back to our vocabulary goes through here, so
 * BODY_SLUG_MAP stays the only place the library's names are written down.
 */
export function musclesForBodySlug(slug: string): MuscleId[] {
  return ALL_MUSCLE_IDS.filter((id) => BODY_SLUG_MAP[id] === slug);
}

/**
 * Translate our muscle ids into the body model's slugs, de-duplicated —
 * several of ours collapse onto one region, and highlighting the same
 * region twice makes it render at double intensity.
 */
export function toBodySlugs(ids: MuscleId[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const slug = BODY_SLUG_MAP[id];
    if (slug) out.add(slug);
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
// THE BIOMECHANICS TEMPLATE
//
// Sections below map 1:1 onto "Master Machine Setup & Biomechanics
// Template" Part 2. Field names follow the template's own headings so an
// evaluator moving between the doc and the Machine Creator sees the same
// words in the same order.
// ─────────────────────────────────────────────────────────────────────

/**
 * Precise anatomy as the coach reads it, with joint actions.
 *
 * Separate from the MuscleId arrays because the diagram is coarse: it can
 * show "glutes", it cannot show "Gluteus Medius (hip horizontal abduction)".
 * Both matter — the diagram for orientation, this for the actual coaching.
 */
export interface MusculatureDetail {
  /** e.g. ['Gluteus Medius (hip horizontal abduction)'] */
  primary: string[];
  secondary: string[];
  /** Stabilizers and assisting groups. */
  synergists: string[];
}

/**
 * Template §2 — the absolute starting point for an average-proportioned new
 * client (roughly 5'9" male / 5'4" female).
 */
export interface UniversalBaseline {
  /** "Set seat so the handles align with mid-chest", "Position 2 (P2)". */
  seatHeightPosition: string;
  /** How to align the client's joint axis with the machine's pivot. */
  padAxisAlignment: string;
  /** Belt tension, lap pads, foot stools, shoulder pads. */
  restraintsAnchoring: string;
  /** Grip, hand placement, handle width. Optional — not every machine has one. */
  gripHandPosition?: string;
  /**
   * As written by the evaluator: "2", "1 or 2", "None (Gap 0)", "Custom —
   * assisted back to a conservative stretch". Free text on purpose; a third
   * of the lineup does not have a single numeric answer.
   *
   * The operational number a studio actually dials in lives in the roster's
   * defaultSettings, keyed by the 'gap' setting field.
   */
  startingWeightStackGap: string;
}

/** Template §3 — one body-type column. */
export interface BodyTypeAdjustment {
  /** "Raise seat", "Recline seat back to P3". */
  seatAdjustment?: string;
  /** "Use narrow handle setting (N)", "lower shin pads". */
  padHandlePlacement?: string;
  /** "Use footstool for safe entry/exit", head-clearance warnings. */
  specialNotes?: string;
}

/** Template §3 — the limited-mobility column, which asks different questions. */
export interface MobilityAdjustment {
  /** How to shorten the stretch: "Increase gap to 4 to protect the shoulder". */
  romRestrictions?: string;
  /**
   * Static Hold (SH) / Timed Static Contraction (TSC) guidance where dynamic
   * loading is contraindicated. Several machines in the lineup depend on this.
   */
  alternativeProtocols?: string;
  specialNotes?: string;
}

export interface BodyTypeAdjustments {
  shorterStature: BodyTypeAdjustment;
  tallerStature: BodyTypeAdjustment;
  limitedMobility: MobilityAdjustment;
}

/**
 * Template §4 — a non-negotiable visual the coach verifies BEFORE the client
 * moves. One or two per machine; more than that and none of them get checked.
 *
 * Treated as safety content: a studio may add checkpoints but can never
 * remove one the catalog defines. See ADDITIVE_DEFINITION_FIELDS.
 */
export interface AlignmentCheckpoint {
  /** "Knee-to-Axis Alignment" — also the dedupe key when merging. */
  title: string;
  /** What the coach must actually see. */
  verify: string;
}

/** How a turnaround is executed. */
export interface TurnaroundRule {
  /**
   * touch-and-go   — compound movements; seamless reversal, never dwell.
   * pause-squeeze  — rotary movements; hold the contraction.
   * hard-stop      — a selector pin or frame stop defines the limit.
   */
  style: 'touch-and-go' | 'pause-squeeze' | 'hard-stop';
  /** pause-squeeze: seconds held on reps 1–2. Typically 1–2. */
  pauseSecondsFirstReps?: number;
  /** pause-squeeze: seconds squeezed from rep 3 on. Typically 2–3. */
  squeezeSecondsFromRepThree?: number;
  /** What happens here, in the evaluator's words. */
  description: string;
  /** Verbal cue: "Barely touch, barely start". */
  cue?: string;
}

/** Template §5 — execution, cadence and the handoff. */
export interface ExecutionProtocol {
  /**
   * True when leverage is poorest at the start, so the coach must place the
   * client into the contracted position and transfer the load.
   */
  requiresHandoff: boolean;
  /** Grip, stance and body positioning for the transfer. */
  handoffProtocol?: string;
  /** The transfer cue, usually "That is yours". */
  handoffCue?: string;
  /** Cracking the stack: the patient 3–5 second pressure build. */
  loadUpProtocol: string;
  /** Seconds. House standard is 6. */
  concentricSeconds: number;
  /** Seconds. House standard is 6. */
  eccentricSeconds: number;
  /** Anything cadence-related that isn't the two numbers, e.g. ankle toggling. */
  cadenceNotes?: string;
  upperTurnaround: TurnaroundRule;
  lowerTurnaround: TurnaroundRule;
  /** 2–3 high-impact coaching cues. */
  keyCues: string[];
  /**
   * Hard stop on training to failure. True for Lumbar Extension and Cervical
   * Extension, where the guides say NEVER. Structured rather than buried in
   * prose so the session UI can enforce it, not just display it.
   */
  neverToFailure?: boolean;
  /** Shown prominently when neverToFailure is set. */
  safetyNotice?: string;
}

// ─────────────────────────────────────────────────────────────────────
// THE DEFINITION — the shape a machine has, wherever it was defined
// ─────────────────────────────────────────────────────────────────────

/**
 * Everything that describes a machine, independent of who defined it.
 *
 * The catalog stores a complete one. A studio may override any subset of it,
 * or supply a whole one for its own equipment.
 */
export interface MachineDefinition {
  name: string;
  shortName?: string;

  // ── Taxonomy — drives every grouped view ──────────────────────────
  anatomicalRegion: AnatomicalRegion;
  movementPattern: MovementPattern;
  /** Decides turnaround style; see KinematicClass. */
  kinematicClass: KinematicClass;
  /** Free-text refinement, e.g. "Compound Push". */
  kinematicClassification?: string;
  executionPosture?: string;

  // ── Anatomy ───────────────────────────────────────────────────────
  /** Coarse regions the body diagram lights up. */
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  /** Stabilizers, shown at lower intensity on the diagram. */
  synergistMuscles: MuscleId[];
  /** Precise anatomy with joint actions, for the coach to read. */
  musculature: MusculatureDetail;
  preferredView: AnatomyView;
  /** One clinical sentence for the catalog card. */
  clinicalNote: string;

  // ── The biomechanics template ─────────────────────────────────────
  universalBaseline: UniversalBaseline;
  bodyTypeAdjustments: BodyTypeAdjustments;
  /** 1–2 items. Additive on override — a studio can add, never remove. */
  alignmentCheckpoints: AlignmentCheckpoint[];
  execution: ExecutionProtocol;

  // ── Safety ────────────────────────────────────────────────────────
  /** Additive on override. */
  clinicalWarnings: string[];
  /** Additive on override. Who must not use this machine. */
  contraindicatedFor: string[];
  /** e.g. "Avoid pairing with Lumbar Extension in the same workout." */
  sequencingContraindications: string[];
  biomechanicalNotes?: string;

  // ── The adjustable dials ──────────────────────────────────────────
  settingFields: MachineSettingField[];
  /** Keyed by MachineSettingField.key — never by label. */
  defaultSettings: Record<string, string>;
  baselineLoad?: { male?: number; female?: number };

  imageUrl?: string;
  formVideoUrl?: string;
}

/** Every key on MachineDefinition, for override bookkeeping. */
export type MachineDefinitionField = keyof MachineDefinition;

/** House cadence standard — prefilled for every new machine. */
export const DEFAULT_CADENCE = { concentricSeconds: 6, eccentricSeconds: 6 };

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

  /**
   * MANAGER-authored note on this studio's copy of the machine.
   *
   * NOT where the Catalog's "Studio Notes" box writes. That box is used by
   * floor trainers, and this document is manager-write only in firestore.rules
   * (isStudioOwnerOrHeadTrainer) precisely because `overrides` below can
   * rewrite safety content. Trainer notes live in the sibling collection
   * studios/{studioId}/machineNotes/{machineId} — see
   * features/catalog/mutations.ts for the full reasoning.
   */
  studioNotes?: string;

  /** Optional physical unit tracking; enables maintenance reporting. */
  unit?: {
    serialNumber?: string;
    manufacturer?: string;
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

/** Slugify a setting field label into its immutable key. */
export function settingFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
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
