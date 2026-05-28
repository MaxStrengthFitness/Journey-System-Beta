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
  | 'Horizontal Push'
  | 'Horizontal Pull'
  | 'Vertical Push'
  | 'Vertical Pull'
  | 'Shoulder Isolation'
  | 'Arm Isolation'
  | 'Lower Body Push'
  | 'Lower Body Pull'
  | 'Hip Isolation'
  | 'Core / Spine'
  | 'Cervical';

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
  chest_press: {
    machineId: 'chest_press',
    preferredView: 'front',
    primary: ['pecs'],
    secondary: ['delts-front', 'triceps'],
    movementPattern: 'Horizontal Push',
    clinicalNote: 'Horizontal push — pectoral inroad with anterior deltoid and triceps support.',
  },
  chest_flye: {
    machineId: 'chest_flye',
    preferredView: 'front',
    primary: ['pecs'],
    secondary: ['delts-front'],
    movementPattern: 'Horizontal Push',
    clinicalNote: 'Pectoral isolation through horizontal adduction — minimal triceps recruitment.',
  },

  // ─── HORIZONTAL PULL ──────────────────────────────
  compound_row: {
    machineId: 'compound_row',
    preferredView: 'back',
    primary: ['lats', 'rhomboids'],
    secondary: ['biceps', 'delts-rear', 'traps'],
    movementPattern: 'Horizontal Pull',
    clinicalNote: 'Horizontal pull — lat and rhomboid inroad with biceps and rear-delt support.',
  },
  simple_row: {
    machineId: 'simple_row',
    preferredView: 'back',
    primary: ['rhomboids', 'traps'],
    secondary: ['lats', 'biceps'],
    movementPattern: 'Horizontal Pull',
    clinicalNote: 'Mid-back isolation focused on scapular retraction.',
  },

  // ─── VERTICAL PUSH ────────────────────────────────
  overhead_press: {
    machineId: 'overhead_press',
    preferredView: 'front',
    primary: ['delts-front'],
    secondary: ['triceps', 'traps'],
    movementPattern: 'Vertical Push',
    clinicalNote: 'Overhead push — anterior deltoid inroad with trap and tricep support.',
  },
  seated_dip: {
    machineId: 'seated_dip',
    preferredView: 'side',
    primary: ['triceps'],
    secondary: ['pecs', 'delts-front'],
    movementPattern: 'Vertical Push',
    clinicalNote: 'Tricep-dominant push pattern with chest assistance.',
  },

  // ─── VERTICAL PULL ────────────────────────────────
  pulldown: {
    machineId: 'pulldown',
    preferredView: 'back',
    primary: ['lats'],
    secondary: ['biceps', 'rhomboids', 'delts-rear'],
    movementPattern: 'Vertical Pull',
    clinicalNote: 'Overhead pull — lat inroad with biceps and scapular support.',
  },
  pullover: {
    machineId: 'pullover',
    preferredView: 'side',
    primary: ['lats'],
    secondary: ['pecs', 'triceps'],
    movementPattern: 'Vertical Pull',
    clinicalNote: 'Sagittal-plane shoulder extension — direct lat work without arm fatigue.',
  },

  // ─── SHOULDER ISOLATION ───────────────────────────
  lateral_raise: {
    machineId: 'lateral_raise',
    preferredView: 'front',
    primary: ['delts-front'],
    secondary: ['traps'],
    movementPattern: 'Shoulder Isolation',
    clinicalNote: 'Frontal-plane shoulder abduction — medial deltoid isolation.',
  },

  // ─── ARM ISOLATION ────────────────────────────────
  biceps_curl: {
    machineId: 'biceps_curl',
    preferredView: 'front',
    primary: ['biceps'],
    secondary: ['forearms'],
    movementPattern: 'Arm Isolation',
    clinicalNote: 'Elbow flexion isolation — biceps inroad without back assistance.',
  },
  triceps_extension: {
    machineId: 'triceps_extension',
    preferredView: 'back',
    primary: ['triceps'],
    secondary: ['forearms'],
    movementPattern: 'Arm Isolation',
    clinicalNote: 'Elbow extension isolation — direct tricep work.',
  },

  // ─── LOWER BODY PUSH ──────────────────────────────
  leg_press: {
    machineId: 'leg_press',
    preferredView: 'side',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves', 'adductors'],
    movementPattern: 'Lower Body Push',
    clinicalNote: 'Multi-joint lower-body push — quad and glute inroad with hamstring assistance.',
  },
  leg_extension: {
    machineId: 'leg_extension',
    preferredView: 'front',
    primary: ['quads'],
    movementPattern: 'Lower Body Push',
    clinicalNote: 'Knee extension isolation — pure quadriceps work.',
  },

  // ─── LOWER BODY PULL ──────────────────────────────
  leg_curl: {
    machineId: 'leg_curl',
    preferredView: 'back',
    primary: ['hamstrings'],
    secondary: ['calves', 'glutes'],
    movementPattern: 'Lower Body Pull',
    clinicalNote: 'Knee flexion under controlled load — direct hamstring inroad in isolation.',
  },

  // ─── HIP ISOLATION ────────────────────────────────
  abduction: {
    machineId: 'abduction',
    preferredView: 'back',
    primary: ['abductors'],
    secondary: ['glutes'],
    movementPattern: 'Hip Isolation',
    clinicalNote: 'Hip abduction — gluteus medius and minimus isolation.',
  },
  adduction: {
    machineId: 'adduction',
    preferredView: 'front',
    primary: ['adductors'],
    movementPattern: 'Hip Isolation',
    clinicalNote: 'Hip adduction — inner-thigh adductor group isolation.',
  },

  // ─── CORE / SPINE ─────────────────────────────────
  lumbar_extension: {
    machineId: 'lumbar_extension',
    preferredView: 'back',
    primary: ['lower-back'],
    secondary: ['glutes'],
    movementPattern: 'Core / Spine',
    clinicalNote: 'Lumbar extension under controlled load — erector spinae inroad.',
  },
  abdominals: {
    machineId: 'abdominals',
    preferredView: 'front',
    primary: ['abs'],
    secondary: ['obliques'],
    movementPattern: 'Core / Spine',
    clinicalNote: 'Trunk flexion — rectus abdominis isolation.',
  },
  torso_rotation: {
    machineId: 'torso_rotation',
    preferredView: 'front',
    primary: ['obliques'],
    secondary: ['abs'],
    movementPattern: 'Core / Spine',
    clinicalNote: 'Transverse-plane rotation — internal and external oblique work.',
  },

  // ─── CERVICAL ─────────────────────────────────────
  '4_way_neck': {
    machineId: '4_way_neck',
    preferredView: 'side',
    primary: ['neck'],
    secondary: ['traps'],
    movementPattern: 'Cervical',
    clinicalNote: 'Multi-directional cervical stimulation.',
  },
  cervical_extension: {
    machineId: 'cervical_extension',
    preferredView: 'side',
    primary: ['neck'],
    secondary: ['traps'],
    movementPattern: 'Cervical',
    clinicalNote: 'Cervical extension — posterior neck musculature isolation.',
  },
};

/**
 * Helper: ordered list of movement patterns for the menu's
 * "Movement Pattern" grouping mode.
 */
export const MOVEMENT_PATTERN_ORDER: MovementPattern[] = [
  'Horizontal Push',
  'Horizontal Pull',
  'Vertical Push',
  'Vertical Pull',
  'Shoulder Isolation',
  'Arm Isolation',
  'Lower Body Push',
  'Lower Body Pull',
  'Hip Isolation',
  'Core / Spine',
  'Cervical',
];

/**
 * Helper: ordered anatomical regions matching the existing
 * Machine.anatomicalRegion field convention.
 */
export const ANATOMICAL_REGION_ORDER = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Lower Body',
  'Core',
  'Neck',
] as const;
