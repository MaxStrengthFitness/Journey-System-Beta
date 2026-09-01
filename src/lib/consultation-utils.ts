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
 * Calculates the suggested starting weight for a client based on MSF baseline metrics.
 * 
 * Age Multipliers: Under 40 (x1.2), 40-60 (x1.0), Over 60 (x0.8).
 * Skill Multipliers: Advanced (x1.3), Intermediate (x1.0), Novice (x0.8).
 * 
 * @returns The calculated weight rounded to the nearest 2 lbs (even number)
 */
export function calculateStartingWeight(
  machineName: string,
  gender: Gender,
  age: number,
  skillLevel: SkillLevel
): number {
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
  return Math.round(calculatedWeight / 2) * 2;
}
