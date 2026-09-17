export type Gender = 'Male' | 'Female';
export type SkillLevel = 'Novice' | 'Intermediate' | 'Advanced';
export type MachineSelection = 'Leg Press' | 'Chest Press' | 'Seated Dip' | 'Lumbar';

// Exercise categories based on the Exercise Selection Template
export type ExerciseCategory = 
  | 'Upper Body - Push'
  | 'Upper Body - Pull'
  | 'Lower Body'
  | 'Trunk/Spine/Core'
  | 'Hips';

export interface MachineData {
  category: ExerciseCategory;
  baseMale: number;
  baseFemale: number;
}

export const MACHINE_DICTIONARY: Record<string, MachineData> = {
  "CX (4 way neck)": { category: "Trunk/Spine/Core", baseMale: 30, baseFemale: 20 },
  "Hip Adduction": { category: "Hips", baseMale: 60, baseFemale: 50 },
  "Hip Abduction": { category: "Hips", baseMale: 60, baseFemale: 50 },
  "Leg Curl": { category: "Lower Body", baseMale: 60, baseFemale: 40 },
  "Leg Extension": { category: "Lower Body", baseMale: 60, baseFemale: 40 },
  "Leg Press": { category: "Lower Body", baseMale: 100, baseFemale: 60 },
  "Pulldown": { category: "Upper Body - Pull", baseMale: 70, baseFemale: 50 },
  "Chest Press": { category: "Upper Body - Push", baseMale: 50, baseFemale: 30 },
  "Compound Row": { category: "Upper Body - Pull", baseMale: 60, baseFemale: 40 },
  "Simple Row": { category: "Upper Body - Pull", baseMale: 60, baseFemale: 40 },
  "Overhead Press": { category: "Upper Body - Push", baseMale: 40, baseFemale: 20 },
  "Seated Pullover": { category: "Upper Body - Pull", baseMale: 60, baseFemale: 40 },
  "Seated Dip": { category: "Upper Body - Push", baseMale: 60, baseFemale: 40 },
  "Tricep Extension": { category: "Upper Body - Push", baseMale: 40, baseFemale: 25 },
  "Bicep": { category: "Upper Body - Pull", baseMale: 40, baseFemale: 25 },
  "Chest/Pec Fly": { category: "Upper Body - Push", baseMale: 50, baseFemale: 30 },
  "Lateral Raise": { category: "Upper Body - Push", baseMale: 30, baseFemale: 15 },
  "Lumbar": { category: "Trunk/Spine/Core", baseMale: 40, baseFemale: 30 },
  "Seated Abdominals": { category: "Trunk/Spine/Core", baseMale: 50, baseFemale: 30 },
  "Torso Rotation": { category: "Trunk/Spine/Core", baseMale: 40, baseFemale: 30 },
};

/**
 * STARTING LOADS THE ACADEMY STATES OUTRIGHT.
 *
 * The multipliers in calculateStartingWeight are a reasonable heuristic for
 * most of the floor, but they are not doctrine. Where an Academy document
 * states the starting load, the document wins:
 *
 *   ceiling - the heuristic may never suggest more than this
 *   floor   - nor less, when the stated load is also the lightest increment
 *             the machine offers (a lighter number cannot be set on it)
 *
 * Keyed by the same machine NAME as MACHINE_DICTIONARY. Add to this only with
 * a quotable sentence from docs/msf-academy/.
 *
 * History (beta-prep trim, Sep 17 2026): this rule was first written into a
 * second calculateStartingWeight in data/machine-database.ts that nothing
 * called, so the function the app does call could return 28-46 lb on the one
 * exercise the Academy says is never taken to failure. (In practice the
 * casing trap noted in calculateStartingWeight means it rarely returned
 * anything for that machine - the danger was latent, one rename away.)
 * There is ONE function now - this one.
 */
export const ACADEMY_STARTING_WEIGHT: Record<string, { ceiling: number; floor?: number }> = {
  // "Most clients will start with 20 pounds, the lightest increment available
  // on this exercise." - Comprehensive Equipment Overview / Cervical Extension.
  // The studio's equipment list calls the machine "CX (4 WAY NECK)"; Cx is the
  // Academy's abbreviation for Cervical Extension (see data/machine-database.ts).
  "CX (4 way neck)": { ceiling: 20, floor: 20 },
};

/**
 * The stated load for a machine, WHATEVER THE CASING of its name.
 *
 * The app's standard machine list (data/default-machines.ts) names the neck
 * machine "CX (4 WAY NECK)"; this table and MACHINE_DICTIONARY say
 * "CX (4 way neck)". A safety rule about a neck must not depend on capital
 * letters, so the ceiling is matched case-insensitively - even though the
 * heuristic's own lookup below is still exact (see the note there).
 */
export function statedStartingWeight(
  machineName: string,
): { ceiling: number; floor?: number } | undefined {
  const wanted = machineName.trim().toLowerCase();
  const key = Object.keys(ACADEMY_STARTING_WEIGHT).find((k) => k.toLowerCase() === wanted);
  return key ? ACADEMY_STARTING_WEIGHT[key] : undefined;
}

/**
 * Calculates the suggested starting weight for a client based on MSF baseline metrics.
 *
 * Age Multipliers: Under 40 (x1.2), 40-60 (x1.0), Over 60 (x0.8).
 * Skill Multipliers: Advanced (x1.3), Intermediate (x1.0), Novice (x0.8).
 *
 * A load the Academy states outright (ACADEMY_STARTING_WEIGHT) overrides the
 * heuristic.
 *
 * @returns The calculated weight rounded to the nearest 2 lbs (even number)
 */
export function calculateStartingWeight(
  machineName: string,
  gender: Gender,
  age: number,
  skillLevel: SkillLevel
): number {
  // EXACT lookup, on purpose left as found. Every standard machine name in the
  // app is UPPERCASE ("LEG PRESS") and these keys are Title Case, so the
  // tracker's first-time seed - which passes machine.name - gets 0 back for
  // every standard machine and suggests nothing. The same goes for
  // ConsultationWizard when it takes its names from the machine list. A number
  // comes back only for a caller that passes one of these Title Case keys:
  // ConsultationSetupWizard's fixed intro routine (Leg Press, Chest Press or
  // Seated Dip, Lumbar), or a machine whose stored name happens to match.
  // Making this case-insensitive would switch the tracker's suggestions ON for
  // every machine; that is a product decision, not a cleanup.
  const data = MACHINE_DICTIONARY[machineName];
  if (!data) return 0; // fallback if machine not found

  let baseWeight = gender === 'Female' ? data.baseFemale : data.baseMale;

  let ageMultiplier = 1.0;
  if (age < 40) ageMultiplier = 1.2;
  else if (age > 60) ageMultiplier = 0.8;
  
  let skillMultiplier = 1.0;
  switch (skillLevel) {
    case 'Novice': skillMultiplier = 0.8; break;
    case 'Intermediate': skillMultiplier = 1.0; break;
    case 'Advanced': skillMultiplier = 1.3; break;
  }

  const calculatedWeight = baseWeight * ageMultiplier * skillMultiplier;
  
  // Round to nearest 2 (nearest even number)
  const rounded = Math.round(calculatedWeight / 2) * 2;

  const stated = statedStartingWeight(machineName);
  if (stated) {
    const capped = Math.min(rounded, stated.ceiling);
    return stated.floor !== undefined ? Math.max(capped, stated.floor) : capped;
  }

  return rounded;
}
