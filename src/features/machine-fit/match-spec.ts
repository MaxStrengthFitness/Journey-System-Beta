/**
 * MACHINE FIT — what "similar" means, and how far it may stretch.
 *
 * The default is the one in AJ's brief: height first, exact, then ±1", ±2",
 * ±3" until enough clients are found. Every other factor is OFF until someone
 * turns it on in the "Similar to" sheet — wingspan, weight, age and the two
 * InBody numbers are optional data that most clients will not have, and a
 * factor that is on but empty would shrink every band to nobody.
 */

import { MIN_CLIENTS } from "../machine-trends/trends.ts";
import type { FactorKey, FactorTolerance, MatchSpec, NumericFactor } from "./types.ts";

export { MIN_CLIENTS };

const off = (base: number, step: number, maxSteps: number): FactorTolerance => ({
  on: false,
  base,
  step,
  maxSteps,
});

export const DEFAULT_MATCH_SPEC: MatchSpec = {
  numeric: {
    height: { on: true, base: 0, step: 1, maxSteps: 3 },
    // Measured to the inch like height, but a tape across the back is less
    // repeatable than a wall chart — so it starts at ±1".
    wingspan: off(1, 1, 3),
    weight: off(10, 10, 3),
    age: off(5, 5, 3),
    bodyFat: off(3, 3, 3),
    muscle: off(5, 5, 3),
  },
  gender: false,
  minClients: MIN_CLIENTS,
};

/** Hard ceilings for the sheet's steppers, so a band can never be widened into "everyone". */
export const MAX_STEPS_LIMIT = 6;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  height: "Height",
  gender: "Gender",
  wingspan: "Wingspan",
  weight: "Weight",
  age: "Age",
  bodyFat: "Body fat",
  muscle: "Muscle mass",
};

export const FACTOR_UNITS: Record<NumericFactor, string> = {
  height: "in",
  wingspan: "in",
  weight: "lb",
  age: "yr",
  bodyFat: "pts",
  muscle: "lb",
};

/** A copy with one numeric factor changed — the sheet's only way to edit a spec. */
export function withFactor(
  spec: MatchSpec,
  factor: NumericFactor,
  patch: Partial<FactorTolerance>,
): MatchSpec {
  const next = { ...spec.numeric[factor], ...patch };
  next.maxSteps = Math.max(0, Math.min(MAX_STEPS_LIMIT, Math.round(next.maxSteps)));
  next.step = Math.max(0.5, next.step);
  next.base = Math.max(0, next.base);
  return { ...spec, numeric: { ...spec.numeric, [factor]: next } };
}

/** The widest a factor may reach either side of the client. */
export function widest(t: FactorTolerance): number {
  return t.base + t.step * t.maxSteps;
}

/** How many of the spec's factors are switched on. */
export function activeFactors(spec: MatchSpec): FactorKey[] {
  const out: FactorKey[] = [];
  for (const [k, t] of Object.entries(spec.numeric) as [NumericFactor, FactorTolerance][]) {
    if (t.on) out.push(k);
  }
  if (spec.gender) out.push("gender");
  return out;
}
