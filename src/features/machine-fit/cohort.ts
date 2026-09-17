/**
 * MACHINE FIT — the tolerance ladder: who counts as "similar".
 *
 * Start as tight as the spec allows (her exact height), count the clients,
 * and widen ONE STEP AT A TIME — every switched-on factor together — until
 * the band holds the minimum sample or the ladder runs out:
 *
 *     ring 0   5'7"            2 clients
 *     ring 1   5'6" – 5'8"     4 clients
 *     ring 2   5'5" – 5'9"     9 clients   ← stops here (minimum 5)
 *
 * Stopping at the FIRST ring that is big enough is the whole trade: the
 * tightest band that can still be trusted. A wider band is never used just
 * because it is available, and a band that never reaches the minimum comes
 * back with `enough: false` so the screen can say "3 similar clients so far"
 * instead of quoting them.
 *
 * Three things that are decisions, not accidents:
 *
 *   · A factor that is ON but that THIS client has no value for cannot be
 *     matched on, so it is set aside and reported in `missing` ("no wingspan
 *     on file — matched on height only"). It does not empty the band.
 *   · A SAMPLE with no value for a factor in use is left out. An unknown
 *     height is not evidence about 5'7" clients.
 *   · The client herself is never in her own cohort (`excludeClientId`).
 *     Without that, an odd setting vouches for itself.
 */

import {
  FACTOR_FIELD,
  NUMERIC_FACTORS,
  type Band,
  type Cohort,
  type FactorKey,
  type FitFactors,
  type FitSample,
  type MatchSpec,
  type NumericFactor,
} from "./types.ts";

export interface CohortOptions {
  /** The client being set up or audited. */
  excludeClientId?: string | null;
}

export function sumClients(samples: readonly FitSample[]): number {
  let n = 0;
  for (const s of samples) n += s.n;
  return n;
}

/** The half-width a factor is held to at one ring. */
export function reachAt(spec: MatchSpec, factor: NumericFactor, ring: number): number {
  const t = spec.numeric[factor];
  return t.base + t.step * Math.min(ring, t.maxSteps);
}

export function buildCohort(
  samples: readonly FitSample[],
  target: FitFactors,
  spec: MatchSpec,
  options: CohortOptions = {},
): Cohort {
  const used: FactorKey[] = [];
  const missing: FactorKey[] = [];
  const numericUsed: NumericFactor[] = [];

  for (const f of NUMERIC_FACTORS) {
    if (!spec.numeric[f].on) continue;
    if (target[FACTOR_FIELD[f]] == null) missing.push(f);
    else {
      used.push(f);
      numericUsed.push(f);
    }
  }
  const useGender = spec.gender && target.gender != null;
  if (spec.gender) (useGender ? used : missing).push("gender");

  const pool = options.excludeClientId
    ? samples.filter((s) => s.clientId !== options.excludeClientId)
    : samples;

  const maxRing = numericUsed.reduce((m, f) => Math.max(m, spec.numeric[f].maxSteps), 0);
  const ladder: Cohort["ladder"] = [];

  let members: FitSample[] = [];
  let clients = 0;
  let ring = 0;
  let enough = false;

  for (let r = 0; r <= maxRing; r += 1) {
    members = pool.filter((s) => {
      if (useGender && s.factors.gender !== target.gender) return false;
      for (const f of numericUsed) {
        const field = FACTOR_FIELD[f];
        const theirs = s.factors[field];
        if (typeof theirs !== "number") return false;
        if (Math.abs(theirs - (target[field] as number)) > reachAt(spec, f, r) + 1e-9) return false;
      }
      return true;
    });
    clients = sumClients(members);
    ring = r;
    ladder.push({ ring: r, clients });
    if (clients >= spec.minClients) {
      enough = true;
      break;
    }
  }

  const bands: Partial<Record<NumericFactor, Band>> = {};
  for (const f of numericUsed) {
    const centre = target[FACTOR_FIELD[f]] as number;
    const reach = reachAt(spec, f, ring);
    bands[f] = { lo: centre - reach, hi: centre + reach };
  }

  return { samples: members, clients, ring, enough, bands, ladder, used, missing };
}
