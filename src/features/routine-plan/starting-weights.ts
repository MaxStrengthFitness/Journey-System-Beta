/**
 * The Academy's suggested starting weights, as a reference (AJ, Oct 7 2026).
 *
 * Source: "MSF - Suggested Starting Weights" (the sheet titled "MSF + Imagine
 * Strength Equipment Loading Guidelines"), brought into the corpus on Oct 7
 * 2026 as `docs/msf-academy/Academy/Academy 6 - General Recommendations for
 * Programming and Progression/MSF - Suggested Starting Weights.txt`.
 *
 * AJ: "Thing I don't like about the Academy starting weights is they don't
 * really follow too much. I think we can use this as a crutch until we have
 * reliable data within our app. But let's go ahead and just have this as a
 * reference point, not as an end-all be-all."
 *
 * So the rules for every reader:
 * - a RANGE with its source, beside the weight, never typed into it; the
 *   trainer types the weight (the Sep 28 ruling, "no house starting weight",
 *   stands for the cell itself);
 * - the trainer picks the column; the sheet is split by sex and the app never
 *   guesses a client's gender on screen;
 * - once a client has a weight on a machine, this is never shown for it
 *   again, and the app still never moves a weight;
 * - Journey's own clients replace it once there are enough of them (machine
 *   fit's rule: a named minimum sample).
 */

export type StartingColumn = "female-novice" | "female-advanced" | "male-novice" | "male-advanced";

export const STARTING_COLUMN_LABEL: Record<StartingColumn, string> = {
  "female-novice": "Female · Novice",
  "female-advanced": "Female · Advanced",
  "male-novice": "Male · Novice",
  "male-advanced": "Male · Advanced",
};

export interface WeightRange {
  low: number;
  high: number;
}

const r = (low: number, high: number): WeightRange => ({ low, high });

/** By catalog machine id, the sheet's four columns in its order. */
export const ACADEMY_STARTING_WEIGHTS: Record<string, Record<StartingColumn, WeightRange>> = {
  "m-leg-press": { "female-novice": r(60, 100), "female-advanced": r(160, 200), "male-novice": r(160, 190), "male-advanced": r(240, 320) },
  "m-leg-curl": { "female-novice": r(40, 60), "female-advanced": r(80, 100), "male-novice": r(60, 90), "male-advanced": r(90, 120) },
  "m-ext": { "female-novice": r(20, 40), "female-advanced": r(60, 80), "male-novice": r(50, 80), "male-advanced": r(100, 130) },
  "m-hip-abd": { "female-novice": r(20, 40), "female-advanced": r(50, 70), "male-novice": r(40, 60), "male-advanced": r(70, 90) },
  "m-hip-add": { "female-novice": r(40, 60), "female-advanced": r(80, 100), "male-novice": r(60, 80), "male-advanced": r(100, 120) },
  "m-pulldown": { "female-novice": r(50, 80), "female-advanced": r(120, 160), "male-novice": r(100, 140), "male-advanced": r(180, 220) },
  "m-compound-row": { "female-novice": r(40, 70), "female-advanced": r(80, 120), "male-novice": r(80, 120), "male-advanced": r(160, 200) },
  "m-pullover": { "female-novice": r(60, 80), "female-advanced": r(100, 120), "male-novice": r(110, 130), "male-advanced": r(160, 200) },
  "m-simple-row": { "female-novice": r(20, 30), "female-advanced": r(30, 50), "male-novice": r(40, 60), "male-advanced": r(70, 90) },
  "m-bicep": { "female-novice": r(20, 30), "female-advanced": r(30, 40), "male-novice": r(30, 50), "male-advanced": r(60, 80) },
  "m-chest-press": { "female-novice": r(20, 30), "female-advanced": r(50, 70), "male-novice": r(60, 90), "male-advanced": r(120, 160) },
  "m-overhead-press": { "female-novice": r(20, 40), "female-advanced": r(60, 80), "male-novice": r(50, 80), "male-advanced": r(100, 140) },
  "m-dip": { "female-novice": r(50, 80), "female-advanced": r(80, 110), "male-novice": r(120, 150), "male-advanced": r(180, 220) },
  "m-chest-fly": { "female-novice": r(20, 30), "female-advanced": r(40, 60), "male-novice": r(50, 80), "male-advanced": r(80, 120) },
  "m-lateral-raise": { "female-novice": r(20, 30), "female-advanced": r(30, 40), "male-novice": r(30, 50), "male-advanced": r(50, 80) },
  "m-tricep-ext": { "female-novice": r(20, 24), "female-advanced": r(28, 34), "male-novice": r(28, 36), "male-advanced": r(40, 50) },
  "m-lumbar": { "female-novice": r(20, 40), "female-advanced": r(50, 80), "male-novice": r(40, 60), "male-advanced": r(90, 120) },
  "m-torso-rotation": { "female-novice": r(20, 30), "female-advanced": r(40, 50), "male-novice": r(40, 50), "male-advanced": r(60, 70) },
  "m-abs": { "female-novice": r(40, 60), "female-advanced": r(80, 100), "male-novice": r(80, 110), "male-advanced": r(140, 170) },
  "m-neck": { "female-novice": r(20, 20), "female-advanced": r(24, 30), "male-novice": r(20, 26), "male-advanced": r(30, 40) },
};

export const STARTING_WEIGHTS_SOURCE =
  "docs/msf-academy/Academy/Academy 6 - General Recommendations for Programming and Progression/MSF - Suggested Starting Weights.txt";

/** The sheet's own notes, shortened, for the reference's (i). */
export const STARTING_WEIGHTS_NOTES = [
  "For a new client, or a machine new to an existing client. Relatively challenging but within their control.",
  "Novice: new to resistance training, below-average strength, possibly intensity-averse or sedentary. Advanced: some training or naturally strong and active, still new to MSF.",
  "New to training but fit and active: between the two. Severely deconditioned or an injury history: below Novice, and slowly.",
  "Based on fresh strength: a machine later in the workout may need less.",
] as const;

export interface StartingReference {
  range: WeightRange;
  /** "Academy's starting range: 60–100 lb (a reference, not a rule)". */
  says: string;
  source: string;
}

/**
 * The Academy's range for a machine in the column the trainer picked, or null
 * when the sheet doesn't cover the machine (a studio's own machine) or the
 * client already has a weight on it (`hasWeight`: then it is never shown).
 */
export function academyStartingReference(input: {
  canonicalMachineId: string;
  column: StartingColumn;
  hasWeight: boolean;
}): StartingReference | null {
  if (input.hasWeight) return null;
  const row = ACADEMY_STARTING_WEIGHTS[input.canonicalMachineId];
  if (!row) return null;
  const range = row[input.column];
  const span = range.low === range.high ? `${range.low} lb` : `${range.low}–${range.high} lb`;
  return {
    range,
    says: `Academy's starting range: ${span} (a reference, not a rule)`,
    source: STARTING_WEIGHTS_SOURCE,
  };
}
