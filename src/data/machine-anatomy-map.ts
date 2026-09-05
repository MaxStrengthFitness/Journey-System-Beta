/**
 * MACHINE ANATOMY MAP
 * Per-machine targeting: which view shows the activation best,
 * which muscles are primary (--cta) vs. secondary/synergist (--cyan).
 *
 * Muscle IDs are stable semantic keys. They map to `data-muscle="..."`
 * attributes on the SVG paths in AnatomyFigure.tsx.
 *
 * Movement patterns are derived for the left-menu grouping toggle.
 */

export type AnatomyView = 'front' | 'side' | 'back';

export type MuscleId =
  // Anterior
  | 'pecs' | 'delts-front' | 'biceps' | 'forearms'
  | 'abs' | 'obliques' | 'adductors' | 'abductors' | 'quads'
  // Posterior
  | 'traps' | 'delts-rear' | 'rhomboids' | 'lats'
  | 'triceps' | 'lower-back' | 'glutes' | 'hamstrings' | 'calves'
  // Cervical
  | 'neck';

export type MovementPattern =
  | 'Upper Body: Horizontal Push'
  | 'Upper Body: Horizontal Pull'
  | 'Upper Body: Vertical Push'
  | 'Upper Body: Vertical Pull'
  | 'Upper Body: Isolation'
  | 'Lower Body: Quad Dominant'
  | 'Lower Body: Posterior Chain'
  | 'Core: Spine Flexion'
  | 'Core: Spine Extension'
  | 'Core: Rotary';

export interface MachineAnatomyMap {
  machineId: string;
  preferredView: AnatomyView;
  primary: MuscleId[];
  secondary?: MuscleId[];
  movementPattern: MovementPattern;
  /** One short clinical sentence shown in the details card */
  clinicalNote: string;
}

export const MACHINE_ANATOMY: Record<string, MachineAnatomyMap> = {
  // ─── HORIZONTAL PUSH ──────────────────────────────
  'm-chest-press': {
    machineId: 'm-chest-press',
    preferredView: 'front',
    primary: ['pecs'],
    secondary: ['delts-front', 'triceps'],
    movementPattern: 'Upper Body: Horizontal Push',
    clinicalNote: 'Horizontal push — pectoral inroad with anterior deltoid and triceps support.',
  },
  'm-chest-fly': {
    machineId: 'm-chest-fly',
    preferredView: 'front',
    primary: ['pecs'],
    secondary: ['delts-front'],
    movementPattern: 'Upper Body: Horizontal Push',
    clinicalNote: 'Pectoral isolation through horizontal adduction — minimal triceps recruitment.',
  },

  // ─── HORIZONTAL PULL ──────────────────────────────
  'm-compound-row': {
    machineId: 'm-compound-row',
    preferredView: 'back',
    primary: ['lats', 'rhomboids'],
    secondary: ['biceps', 'delts-rear', 'traps'],
    movementPattern: 'Upper Body: Horizontal Pull',
    clinicalNote: 'Horizontal pull — lat and rhomboid inroad with biceps and rear-delt support.',
  },
  'm-simple-row': {
    machineId: 'm-simple-row',
    preferredView: 'back',
    primary: ['rhomboids', 'traps'],
    secondary: ['lats', 'biceps'],
    movementPattern: 'Upper Body: Horizontal Pull',
    clinicalNote: 'Mid-back isolation focused on scapular retraction.',
  },

  // ─── VERTICAL PUSH ────────────────────────────────
  'm-overhead-press': {
    machineId: 'm-overhead-press',
    preferredView: 'front',
    primary: ['delts-front'],
    secondary: ['triceps', 'traps'],
    movementPattern: 'Upper Body: Vertical Push',
    clinicalNote: 'Overhead push — anterior deltoid inroad with trap and tricep support.',
  },
  'm-dip': {
    machineId: 'm-dip',
    preferredView: 'side',
    primary: ['triceps'],
    secondary: ['pecs', 'delts-front'],
    movementPattern: 'Upper Body: Vertical Push',
    clinicalNote: 'Tricep-dominant push pattern with chest assistance.',
  },

  // ─── VERTICAL PULL ────────────────────────────────
  'm-pulldown': {
    machineId: 'm-pulldown',
    preferredView: 'back',
    primary: ['lats'],
    secondary: ['biceps', 'rhomboids', 'delts-rear'],
    movementPattern: 'Upper Body: Vertical Pull',
    clinicalNote: 'Overhead pull — lat inroad with biceps and scapular support.',
  },
  'm-pullover': {
    machineId: 'm-pullover',
    preferredView: 'side',
    primary: ['lats'],
    secondary: ['pecs', 'triceps'],
    movementPattern: 'Upper Body: Vertical Pull',
    clinicalNote: 'Sagittal-plane shoulder extension — direct lat work without arm fatigue.',
  },

  // ─── SHOULDER ISOLATION ───────────────────────────
  'm-lateral-raise': {
    machineId: 'm-lateral-raise',
    preferredView: 'front',
    primary: ['delts-front'],
    secondary: ['traps'],
    movementPattern: 'Upper Body: Isolation',
    clinicalNote: 'Frontal-plane shoulder abduction — medial deltoid isolation.',
  },

  // ─── ARM ISOLATION ────────────────────────────────
  'm-bicep': {
    machineId: 'm-bicep',
    preferredView: 'front',
    primary: ['biceps'],
    secondary: ['forearms'],
    movementPattern: 'Upper Body: Isolation',
    clinicalNote: 'Elbow flexion isolation — biceps inroad without back assistance.',
  },
  'm-tricep-ext': {
    machineId: 'm-tricep-ext',
    preferredView: 'back',
    primary: ['triceps'],
    secondary: ['forearms'],
    movementPattern: 'Upper Body: Isolation',
    clinicalNote: 'Elbow extension isolation — direct tricep work.',
  },

  // ─── LOWER BODY PUSH ──────────────────────────────
  'm-leg-press': {
    machineId: 'm-leg-press',
    preferredView: 'side',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves', 'adductors'],
    movementPattern: 'Lower Body: Quad Dominant',
    clinicalNote: 'Multi-joint lower-body push — quad and glute inroad with hamstring assistance.',
  },
  'm-ext': {
    machineId: 'm-ext',
    preferredView: 'front',
    primary: ['quads'],
    movementPattern: 'Lower Body: Quad Dominant',
    clinicalNote: 'Knee extension isolation — pure quadriceps work.',
  },

  // ─── LOWER BODY PULL ──────────────────────────────
  'm-leg-curl': {
    machineId: 'm-leg-curl',
    preferredView: 'back',
    primary: ['hamstrings'],
    secondary: ['calves', 'glutes'],
    movementPattern: 'Lower Body: Posterior Chain',
    clinicalNote: 'Knee flexion under controlled load — direct hamstring inroad in isolation.',
  },

  // ─── HIP ISOLATION ────────────────────────────────
  'm-hip-abd': {
    machineId: 'm-hip-abd',
    preferredView: 'back',
    primary: ['abductors'],
    secondary: ['glutes'],
    movementPattern: 'Lower Body: Posterior Chain',
    clinicalNote: 'Hip abduction — gluteus medius and minimus isolation.',
  },
  'm-hip-add': {
    machineId: 'm-hip-add',
    preferredView: 'front',
    primary: ['adductors'],
    movementPattern: 'Lower Body: Quad Dominant',
    clinicalNote: 'Hip adduction — inner-thigh adductor group isolation.',
  },

  // ─── CORE / SPINE ─────────────────────────────────
  'm-lumbar': {
    machineId: 'm-lumbar',
    preferredView: 'back',
    primary: ['lower-back'],
    secondary: ['glutes'],
    movementPattern: 'Core: Spine Extension',
    clinicalNote: 'Lumbar extension under controlled load — erector spinae inroad.',
  },
  'm-abs': {
    machineId: 'm-abs',
    preferredView: 'front',
    primary: ['abs'],
    secondary: ['obliques'],
    movementPattern: 'Core: Spine Flexion',
    clinicalNote: 'Trunk flexion — rectus abdominis isolation.',
  },
  'm-torso-rotation': {
    machineId: 'm-torso-rotation',
    preferredView: 'front',
    primary: ['obliques'],
    secondary: ['abs'],
    movementPattern: 'Core: Rotary',
    clinicalNote: 'Transverse-plane rotation — internal and external oblique work.',
  },

  // ─── CERVICAL ─────────────────────────────────────
  'm-neck': {
    machineId: 'm-neck',
    preferredView: 'side',
    primary: ['neck'],
    secondary: ['traps'],
    movementPattern: 'Core: Spine Extension',
    clinicalNote: 'Multi-directional cervical stimulation.',
  },
  /**
   * ALIAS of m-neck, not a second machine.
   *
   * Kept because two other data files reference this id directly —
   * clinical-matrix.ts (affectedMachineIds) and routine-templates.ts — so
   * deleting it here would break lookups that have nothing to do with the
   * diagram. features/catalog/machine-identity.ts collapses it onto m-neck,
   * so the Catalog never shows it twice; anything else iterating this map
   * should dedupe with canonicalMachineId() rather than trusting the key count.
   */
  cervical_extension: {
    machineId: 'cervical_extension',
    preferredView: 'side',
    primary: ['neck'],
    secondary: ['traps'],
    movementPattern: 'Core: Spine Extension',
    clinicalNote: 'Cervical extension — posterior neck musculature isolation.',
  },
};

/**
 * Helper: ordered list of movement patterns for the menu's
 * "Movement Pattern" grouping mode.
 */
export const MOVEMENT_PATTERN_ORDER: MovementPattern[] = [
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
];

/**
 * Helper: ordered anatomical regions matching the existing
 * Machine.anatomicalRegion field convention.
 */
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
