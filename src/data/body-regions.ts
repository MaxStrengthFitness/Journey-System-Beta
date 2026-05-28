/**
 * Canonical body regions for the pre-session check-in body state tracker.
 * Order matters — this is the display order in the picker.
 */
export const BODY_REGIONS = [
  'Neck',
  'Shoulders',
  'Upper Back',
  'Chest',
  'Lower Back',
  'Core',
  'Hips',
  'Glutes',
  'Quads',
  'Hamstrings',
  'Knees',
  'Calves',
  'Ankles',
  'Wrists / Forearms',
] as const;

export type BodyRegion = typeof BODY_REGIONS[number];
