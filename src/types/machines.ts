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

/**
 * BODY AREAS — the places a client names, as the body model's regions.
 *
 * Where it matters (the client codex's Body & Pulse page, Sep 26 2026) draws
 * the Catalog's figure, and a tapped row lights its area on it. The keys are
 * the Pulse pain map's regions (subjective-report `BodyRegion`) plus the
 * abdomen, which a hernia flag names. Kept here because this is the only
 * place the library's names may be written.
 *
 * Three joints have no region of their own on the model — the elbow, the
 * hip and the middle of the back — so they light nothing; their marks still
 * sit on the right spot. The groin is the adductors, the nearest the model
 * has.
 */
const BODY_AREA_SLUGS: Record<string, readonly string[]> = {
  neck: ['neck'],
  shoulder: ['deltoids'],
  upper_back: ['upper-back', 'trapezius'],
  mid_back: [],
  lower_back: ['lower-back'],
  chest: ['chest'],
  abdomen: ['abs', 'obliques'],
  elbow: [],
  wrist_hand: ['hands'],
  hip: [],
  glute: ['gluteal'],
  groin: ['adductors'],
  thigh: ['quadriceps'],
  hamstring: ['hamstring'],
  knee: ['knees'],
  calf_shin: ['calves', 'tibialis'],
  ankle: ['ankles'],
  foot: ['feet'],
};

/** True when the figure knows this body area (even one that lights nothing). */
export function isBodyArea(area: string): boolean {
  return Object.prototype.hasOwnProperty.call(BODY_AREA_SLUGS, area);
}

/** The body model's slugs for a set of body areas, de-duplicated. */
export function areaSlugs(areas: readonly string[]): string[] {
  const out = new Set<string>();
  for (const area of areas) for (const slug of BODY_AREA_SLUGS[area] ?? []) out.add(slug);
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
  /**
   * The dial's letter on the preset strip — "G", "P", "SP", "S" — the way a
   * trainer says it ("G 4 · S 8"). Codex format v2 (Sep 28 2026). A LABEL,
   * never a key: renaming it orphans nothing. It belongs to the unit, like
   * the label, because two models letter the same dial differently.
   */
  letter?: string;
  /**
   * The dial's number on the drawing of the unit (the Codex page's numbered
   * callouts in Set up). Codex format v2. Absent: the dial's place in the list.
   */
  callout?: number;
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
// THE CODEX FORMAT, v2 (Sep 28 2026)
//
// AJ approved the Machine Codex's new data "all yes" on Sep 28 2026. Every
// field below is OPTIONAL and nothing above is renamed: a machine id and a
// dial key never change, so every client's saved settings keep working and
// a definition written before v2 reads exactly as it did.
//
// The Codex page reads a machine as the timeline of a set — twelve LEAVES
// (docs/rounds/2026-09-28-codex-2.md; the blueprint's research brief §4.3):
//
//    1 Stop               stopRules · watchOuts (+ clinicalWarnings,
//                         contraindicatedFor, execution.neverToFailure)
//    2 Set up             setUp · dialRules (+ universalBaseline, the dials,
//                         defaultSettings)
//    3 Get set            getSet (+ executionPosture, alignmentCheckpoints)
//    4 Begin              begin (+ execution's load-up and handoff)
//    5 The rep            rep (+ execution's cadence, turnarounds, keyCues)
//    6 Finish             finish
//    7 If something goes wrong   ifWrong
//    8 Adapt              adapt (+ bodyTypeAdjustments)
//    9 Program it         program (+ sequencingContraindications)
//   10 Faults and fixes   faults
//   11 Understand         understand (+ musculature, biomechanicalNotes)
//   12 On our floor       COMPUTED from Journey's own data; nothing stored
//
// A leaf that is an OBJECT merges per key on a studio's copy
// (lib/resolve-machine.ts), so a studio correcting one line keeps
// inheriting head office's corrections to the others. The two safety
// lists (stopRules, watchOuts) are additive, like clinicalWarnings.
// `features/machine-codex/format.ts` is the one reader: the switches, the
// preset, the stop rules and every method line's source.
// ─────────────────────────────────────────────────────────────────────

/** Leaf 1. A stop rule a trainer must not miss, with the reason it exists. */
export interface CodexStopRule {
  /** "The knees never lock out at the end stop." Also the dedupe key. */
  text: string;
  /** Why — an unexplained prohibition gets ignored. */
  why?: string;
}

/**
 * Leaf 1. A condition and what to DO about it on this machine, in place of a
 * blanket "contraindicated" ("Sensitive lower back → a bigger gap, P3, and
 * keep it well away from the Lumbar").
 */
export interface CodexWatchOut {
  /** "Sensitive lower back". Also the dedupe key. */
  condition: string;
  action: string;
}

/**
 * Leaf 2. The rule half of a dial — the body landmark it is set against
 * ("the footplate meets the end stop just before the knees straighten").
 * The NUMBER half is the unit's `defaultSettings[key]`; the letter is
 * `MachineSettingField.letter`. Keyed by the dial's key in `dialRules`.
 */
export interface DialRule {
  rule: string;
  /** "First set-up only: a couple of settings closer, for pad squash under load." */
  firstSetup?: string;
}

/** Leaf 2. What the baseline does not already say. */
export interface CodexSetUp {
  /** Entry, and the stool: "Have a seat, feet on the frame below…". */
  entry?: string;
  /** "20 lb main + 18 lb accessory = 38 lb" — a MODEL fact on most units. */
  preload?: string;
  /** How to choose a first load. Never a house number (AJ, Sep 27 2026). */
  startingLoadRule?: string;
}

/** Leaf 3. Posture and checkpoints already have fields; these do not. */
export interface CodexGetSet {
  /** The joint that lines up with the pivot ("C3–C5 at the axis"). */
  axisLandmark?: string;
  breathing?: string;
}

/** Leaf 4. The load-up and the handoff already live in `execution`. */
export interface CodexBegin {
  /** The words, as the spoken script has them. */
  script?: string;
  /** When to hold the handoff back ("if she can't stabilise, delay it"). */
  delayHandoffWhen?: string;
}

/** The moments of a rep, in order. */
export type CodexMomentId = "loadUp" | "up" | "upperTurn" | "down" | "lowerTurn";

export const CODEX_MOMENT_ORDER: readonly CodexMomentId[] = [
  "loadUp",
  "up",
  "upperTurn",
  "down",
  "lowerTurn",
];

/** One phrasebook line, tagged to the moment of the rep it belongs to. */
export interface CodexMomentLine {
  moment: CodexMomentId;
  say: string;
}

/** Leaf 5. Cadence and both turnarounds already live in `execution`. */
export interface CodexRep {
  /** The path to keep the same both ways ("the knees follow one path"). */
  path?: string;
  /** When the trainer clicks ("at the exact moment the end stop is reached"). */
  click?: string;
  /** The first eccentric always gets a cue. */
  firstEccentricCue?: string;
  /** Cues by moment — the phrasebook's lines for this machine. */
  moments?: CodexMomentLine[];
}

/** Leaf 6. */
export interface CodexFinish {
  /** What failure means on this machine, and any rep cap in words. */
  failure?: string;
  finalDescent?: string;
  /** The unloading transfer ("that is… mine"), where the machine has one. */
  unloadTransfer?: string;
  exit?: string;
  /** What to record ("clean full reps only; a changed setting says why"). */
  record?: string;
}

/**
 * Leaf 7. An abnormal procedure, kept apart from the normal set the way a
 * pilot's quick-reference handbook keeps them apart.
 */
export interface CodexAbnormal {
  /** "Exertion headache (EIH)". Also the dedupe key. */
  title: string;
  trigger?: string;
  steps: string[];
  /** What happens next time. */
  next?: string;
  record?: string;
  /** True when it ends the set (an exertion headache does). */
  stop?: boolean;
}

/** Leaf 8. The three body-type columns already live in `bodyTypeAdjustments`. */
export interface CodexAdapt {
  /** Timed static contraction: where the arm sits, and the protocol. */
  tsc?: string;
  staticHold?: string;
  /** What biases it ("P2 and higher feet: more glute"). */
  bias?: string;
}

/** Leaf 9. What to avoid pairing already lives in `sequencingContraindications`. */
export interface CodexProgram {
  pairings?: string;
  substitutes?: string;
  /** Its family and what it counts for ("Big Five · legs"). */
  category?: string;
}

/** Leaf 10. One fault and its fix. */
export interface CodexFault {
  /** "Firing out of the bottom". Also the dedupe key. */
  fault: string;
  see?: string;
  say?: string;
  change?: string;
}

/** Leaf 11. Musculature and the biomechanics notes already have fields. */
export interface CodexUnderstand {
  jointActions?: string;
  /** Why the rules are what they are. */
  why?: string;
  /** The machine's character (cam feel, direct resistance) — usually a model fact. */
  character?: string;
  /** Academy pages worth reading, as paths under docs/msf-academy. */
  academy?: string[];
}

/**
 * The switches the blueprint names that no field already holds. The rest
 * are read from what exists — `beginsWith` from `execution.requiresHandoff`,
 * `upperTurn` from `execution.upperTurnaround.style`, `neverToFailure` from
 * `execution.neverToFailure` — by `switchesOf` in features/machine-codex, so
 * there is one source for each and two can never disagree.
 */
export interface CodexSwitches {
  /**
   * What limits the lower turn (Academy 4.6): the stack touches · the joint
   * reaches its limit first · flexibility does.
   */
  lowerTurn?: "stackTouch" | "jointLimited" | "flexLimited";
  /** A rep cap in the early sessions (the Cervical: 8 or fewer). */
  repCap?: number;
  /** The arm can be pinned for a timed static contraction. */
  tscCapable?: boolean;
  /** The trainer takes the weight back at the end ("that is… mine"). */
  unloadTransfer?: boolean;
}

/**
 * Where one method line comes from. A line is a field path
 * ("execution.loadUpProtocol"), and for a list, one entry's words (`line`).
 *
 *   academy     a file under docs/msf-academy — the Quick Reference Guide,
 *               the overview, the spoken script, an Academy module
 *   guide       only the standardized setup guides, which summarise the
 *               Academy rather than belong to it
 *   book        a book, PARAPHRASED with a reference and never quoted
 *               (AJ, Sep 27 2026, on The Renaissance of Exercise)
 *   unsourced   nowhere; the page says so rather than hiding it
 */
export interface LineSource {
  path: string;
  /** For a list field: the entry's words, or a checkpoint's title. */
  line?: string;
  kind: "academy" | "guide" | "book" | "unsourced";
  /** academy / guide: the file under docs/msf-academy. book: its title and author. */
  ref?: string;
  /** Where in it: "Considerations for Setup", "Vol. 1, ch. 4". */
  at?: string;
  /**
   * The sources disagree (the codex source check's "contradicted"): what the
   * other one says. The page shows both and "Corporate to rule" until an
   * administrator rules and clears it.
   */
  conflict?: string;
}

/**
 * A catalog safety line a studio took off ITS copy, and why — the Sep 21
 * rule, built Sep 28 2026 (AJ: "Yes studios need to be able to customize
 * their stuff safety is definitely a worry but are trusted").
 *
 * Lives only in a roster entry's `overrides` (never on the catalog, never
 * on a studio's own machine, which inherits nothing to remove). The line
 * leaves that unit's page and nowhere else; head office reads every one in
 * Compare with the reason, who and when. A removal without a reason is
 * refused at the write (lib/machine-template.ts, scopeOverrides) and in
 * firestore.rules.
 */
export interface RemovedSafetyLine {
  /** Which safety list it was on. */
  field: SafetyListField;
  /** The line's words, or a checkpoint's title / a stop rule's words / a watch-out's condition. */
  line: string;
  /** "This unit has no seat belt." At least three characters. */
  reason: string;
  /** The Auth uid, and the name as it read then. */
  by: { uid: string; name: string };
  /** ISO time. Firestore refuses serverTimestamp() inside a list. */
  at: string;
}

/**
 * The safety lists. On a studio's copy they are ADDITIVE: the studio's own
 * lines are added to the catalog's (lib/resolve-machine.ts), and one of the
 * catalog's lines leaves the copy only with a reason (`RemovedSafetyLine`).
 */
export type SafetyListField =
  | "clinicalWarnings"
  | "contraindicatedFor"
  | "sequencingContraindications"
  | "alignmentCheckpoints"
  | "stopRules"
  | "watchOuts";

export const SAFETY_LIST_FIELDS: readonly SafetyListField[] = [
  "clinicalWarnings",
  "contraindicatedFor",
  "sequencingContraindications",
  "alignmentCheckpoints",
  "stopRules",
  "watchOuts",
];

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

  // ── The Codex format, v2 (Sep 28 2026) — every field optional ─────
  // See "THE CODEX FORMAT, v2" above for which leaf each one fills.

  /** Leaf 1. The true stop rules — additive on a studio's copy. */
  stopRules?: CodexStopRule[];
  /** Leaf 1. Condition → what to do — additive on a studio's copy. */
  watchOuts?: CodexWatchOut[];
  /** Leaf 2. */
  setUp?: CodexSetUp;
  /** Leaf 2. Each dial's rule, keyed by its `MachineSettingField.key`. */
  dialRules?: Record<string, DialRule>;
  /** Leaf 3. */
  getSet?: CodexGetSet;
  /** Leaf 4. */
  begin?: CodexBegin;
  /** Leaf 5. */
  rep?: CodexRep;
  /** Leaf 6. */
  finish?: CodexFinish;
  /** Leaf 7. */
  ifWrong?: CodexAbnormal[];
  /** Leaf 8. */
  adapt?: CodexAdapt;
  /** Leaf 9. */
  program?: CodexProgram;
  /** Leaf 10. */
  faults?: CodexFault[];
  /** Leaf 11. */
  understand?: CodexUnderstand;
  /** The switches no other field holds; see CodexSwitches. */
  switches?: CodexSwitches;
  /** Where each method line comes from. */
  sources?: LineSource[];
  /**
   * The model (machineModels/{modelId}) this definition describes. On the
   * catalog, the reference unit the standard's numbers were written on; on a
   * studio's own machine, its model. A studio's COPY names its unit's model
   * on the roster entry (`RosterEntryBase.modelId`) — a copy never inherits
   * the catalog's, because a studio's leg press is not the Academy's just
   * for being a copy of its page.
   */
  modelId?: string;

  /**
   * On a studio's copy only (a roster entry's `overrides`): the catalog's
   * safety lines this unit does without, each with its reason, who and when
   * (the Sep 21 rule). On a resolved machine: the removals that applied.
   */
  removedSafety?: RemovedSafetyLine[];
}

/** Every key on MachineDefinition, for override bookkeeping. */
export type MachineDefinitionField = keyof MachineDefinition;

// ─────────────────────────────────────────────────────────────────────
// THE MODEL RECORD (Codex R2, Sep 28 2026)
//
// A seat 4 on a Nautilus is not a seat 4 on a Hoist. A MODEL is the tier
// between the movement (the catalog machine) and the unit (a studio's
// roster entry): the facts every unit of one maker's model shares — its
// dials, their ranges, its stacks — written once and pointed at by each
// unit (`RosterEntryBase.modelId`). Settings pool per model in the weekly
// machine-trends job; weights keep pooling per movement.
//
// Firestore: machineModels/{modelId}. Administrators write it; everyone
// signed in reads it. The shape is EXACTLY the one below — the Catalog's
// model tier reads it — and `features/machine-codex/models.ts` is the one
// place a model is built, checked and named.
// ─────────────────────────────────────────────────────────────────────

/** One dial as a model has it. The key matches the movement's dial key. */
export interface ModelDial {
  /** Same immutable key as the movement's `MachineSettingField.key`. */
  key: string;
  label: string;
  /** The letter on this model's plate ("G", "P", "SP"). */
  letter?: string;
  type?: MachineSettingField["type"];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** Where it sits by default on this model, as the maker ships it. */
  default?: string;
}

export interface MachineModel {
  /** "Hoist". */
  brand: string;
  /** "ROC-IT Leg Press". */
  model: string;
  /** The MSF movement it is: a catalog machine id ("m-leg-press"). */
  movementId: string;
  dials?: ModelDial[];
  /** Anything else every unit of it shares ("an 18 lb accessory stack"). */
  notes?: string;
  updatedAt: any;
  /** The Auth uid of the administrator who saved it. */
  updatedBy: string;
}

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
  /**
   * Head office's other names for the machine (wave 2 of the Machine Catalog
   * room, Sep 28 2026): written by an administrator on the machine's page in
   * the catalog editor, merged by features/catalog/names.ts with the names the
   * code holds, so Find knows them. Catalog bookkeeping, not part of the
   * definition: definitionOf strips it, and the template boundary never sees it.
   */
  aliases?: string[];

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

  /**
   * Which model this unit is: machineModels/{modelId} (Codex R2, Sep 28
   * 2026). The unit's, set by the studio's leaders; absent means nobody has
   * recorded it. A copy of a catalog machine never takes the catalog's own
   * reference model — only this field names the unit's.
   */
  modelId?: string;

  updatedAt?: any;
  updatedBy?: string;

  /**
   * Listed in the MSF machine database for every studio to read and adopt
   * (Learning + Planner round, Sep 2026). Custom machines only — the rules
   * refuse it on a catalog entry, which is already in the database. Set by
   * the studio's leaders, like everything else on this document.
   */
  shared?: boolean;
  /** The sharing studio's name, as the database shows it to other studios. */
  sharedStudioName?: string;
  sharedAt?: any;
  sharedBy?: string;
  /**
   * Sharing waits for an administrator (AJ, Sep 28 2026): the studio offers
   * ("pending"), and an administrator shares it ("approved", with `shared`
   * true) or doesn't ("declined", with a short note). See features/machine-db.
   */
  shareStatus?: "pending" | "approved" | "declined";
  shareReviewNote?: string;
}

/** Where an adopted machine came from: another studio's shared machine. */
export interface AdoptedFrom {
  studioId: string;
  machineId: string;
  studioName: string;
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
  /**
   * Adopted from another studio's shared machine: a COPY, taken once. The
   * original studio's later edits do not follow it. `basedOn` carries the
   * original's lineage, so notes shared about it reach this copy too.
   */
  adoptedFrom?: AdoptedFrom;
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
  // A name with no plain letters or digits ("Жим ногами") slugged to nothing
  // and minted `sm-{studio}-`; it gets a word instead (review, Learning +
  // Planner round), and a collision check upstream adds -2, -3.
  return `sm-${studioId}-${slug || 'machine'}`;
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

  /*
   * `modelId` (from MachineDefinition) is THIS UNIT's model here: the roster
   * entry's for a copy (never the catalog's reference model), the roster
   * entry's or its own definition's for a studio's own machine, and absent
   * on equipment the studio has not added (lib/resolve-machine.ts).
   */

  /** Listed in the MSF machine database (custom machines only). */
  shared?: boolean;
  /** Where the studio's offer to list it stands (Sep 28 2026). */
  shareStatus?: "pending" | "approved" | "declined";
  shareReviewNote?: string;
  /** Copied from another studio's shared machine. */
  adoptedFrom?: AdoptedFrom;
}
