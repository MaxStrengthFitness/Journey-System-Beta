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
    /*
     * THE REAR DELT WAS MISSING, AND THE LATS AND BICEPS WERE INVENTED.
     *
     * "Posterior Deltoid (Rear Delt) - Shoulder horizontal Abduction /
     *  Rhomboids / Trapezius", synergists "Infraspinatus / Erector Spinae"
     *   - Comprehensive Equipment Overview / Simple Row.txt
     *
     * The Academy names the rear delt FIRST and lists neither lats nor biceps
     * anywhere. academy.ts:404 already said so in prose ("Simple Row takes
     * rear delt, traps and rhomboids") while this map said otherwise - and
     * musclesOf() reads THIS file, so the routine builder's frequency
     * accounting for the rear delt was wrong on every routine using it.
     */
    primary: ['delts-rear', 'rhomboids', 'traps'],
    secondary: ['lower-back'],
    movementPattern: 'Upper Body: Horizontal Pull',
    clinicalNote: 'Scapular retraction and rear deltoid, not a lat movement.',
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
    /*
     * PECS PRIMARY. This said triceps, which contradicted both the Academy and
     * the app's own MACHINE_DATABASE - and adapters.ts gives this file's
     * clinicalNote precedence over the database's target list, so the wrong
     * one is what the Catalog showed.
     *
     * "Pectoralis Major - Costal and Sternal Heads (Chest/Pecs) - Shoulder
     *  Flexion (from hyperextension), horizontal Adduction / Triceps - Elbow
     *  Extension / Anterior Deltoid - Shoulder Flexion"
     *   - Comprehensive Equipment Overview / Seated Dip.txt, in that order
     */
    primary: ['pecs'],
    secondary: ['triceps', 'delts-front'],
    movementPattern: 'Upper Body: Vertical Push',
    clinicalNote: 'Chest-dominant push, with triceps and anterior deltoid assisting.',
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
    /*
     * THE FIGURE CANNOT TELL THE THREE DELTOID HEADS APART.
     *
     * BODY_SLUG_MAP collapses delts-front and delts-rear onto one 'deltoids'
     * region, so whichever id is used here paints the same blob. The id is
     * therefore not the thing to get right - the NOTE is, and it used to say
     * "medial deltoid isolation" while pairing it with delts-front, so the
     * object contradicted itself.
     *
     * The Academy is unambiguous about which head this is:
     *   "We are targeting the sides of the shoulders (middle deltoid) on this
     *    movement." - MSF Upper Body - setup and instruction.txt
     *   "Primary Muscles: Lateral Deltoid (shoulder abduction)"
     *    - Set Up Machines/machine-setup-template.md
     *
     * If the figure ever gains a separate lateral-deltoid region, this entry
     * and BODY_SLUG_MAP are the two places to change.
     */
    primary: ['delts-front'],
    secondary: ['traps'],
    movementPattern: 'Upper Body: Isolation',
    clinicalNote: 'Frontal-plane shoulder abduction — lateral (middle) deltoid.',
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
    /*
     * The Academy documents ONE neck machine, the Cervical Extension, and
     * there is no document anywhere in docs/msf-academy/ for a "4-way neck".
     * This note used to read "Multi-directional cervical stimulation", which
     * described the 4-way framing the rest of the app has now dropped — see
     * features/catalog/machine-identity.ts.
     */
    clinicalNote: 'Cervical extension - posterior neck musculature isolation.',
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
