/**
 * MACHINE FIT — the engine: two tiers, one answer.
 *
 * Two pools of evidence exist for every machine:
 *
 *   STUDIO    this studio's own clients, live (studios/{s}/machineFit). Every
 *             factor can be matched — height, gender, wingspan, weight, age,
 *             InBody — because the studio's client records are already in
 *             memory and rows are joined to them at read time.
 *   COMPANY   every studio pooled, anonymous, rebuilt weekly
 *             (machineTrends/{machineId}.fit). Height and gender only: a
 *             company cell is a count, not a person, so it has nothing else.
 *
 * WHICH ONE ANSWERS. The studio, when its ladder found enough clients within
 * one step of her (ring 0 or 1) — the studio's own floor, its own units, its
 * own habits, and the freshest data. Otherwise whichever pool reached the
 * minimum in the TIGHTER band; a tie goes to the studio. A brand-new studio
 * therefore starts on company data and moves onto its own as it fills in,
 * without anyone flipping a switch.
 *
 * This file is the only place the screens call. It returns sentences' worth
 * of evidence, never bare values.
 */

import { auditMachine } from "./audit.ts";
import { buildCohort } from "./cohort.ts";
import { suggestCluster, universalPicks } from "./clusters.ts";
import type {
  Cohort,
  FitAck,
  FitFactors,
  FitSample,
  FitTier,
  MachineAudit,
  MatchSpec,
  NumericFactor,
  Strength,
  SuggestionResult,
} from "./types.ts";

/** A studio cohort found this close to the client always wins over company data. */
export const STUDIO_PREFERRED_RING = 1;

/**
 * For a set-up of several fields to be "strong" (and so eligible for a bulk
 * accept), at least this share of the similar clients must hold the WHOLE
 * combination. Each link of the chain can be a majority while the chain as a
 * whole is rare — four 50% steps is one client in sixteen — and "most similar
 * clients sit like this" has to be true of the set-up, not just of its parts.
 */
export const STRONG_TOGETHER_SHARE = 0.3;

/** The company tier only knows height and gender; everything else is switched off for it. */
export function companySpec(spec: MatchSpec): MatchSpec {
  const numeric = { ...spec.numeric };
  for (const f of Object.keys(numeric) as NumericFactor[]) {
    if (f !== "height") numeric[f] = { ...numeric[f], on: false };
  }
  return { ...spec, numeric };
}

export interface FitSources {
  /** null = not loaded or not readable. An empty array = loaded, and nobody is set up yet. */
  studio: readonly FitSample[] | null;
  company: readonly FitSample[] | null;
}

interface TierChoice {
  tier: FitTier;
  cohort: Cohort;
  everyone: readonly FitSample[];
}

function chooseTier(
  sources: FitSources,
  target: FitFactors,
  spec: MatchSpec,
  excludeClientId?: string | null,
): { chosen: TierChoice | null; thin: TierChoice | null } {
  const studio: TierChoice | null = sources.studio
    ? {
        tier: "studio",
        cohort: buildCohort(sources.studio, target, spec, { excludeClientId }),
        everyone: sources.studio.filter((s) => s.clientId !== excludeClientId),
      }
    : null;
  const company: TierChoice | null = sources.company
    ? { tier: "company", cohort: buildCohort(sources.company, target, companySpec(spec)), everyone: sources.company }
    : null;

  // A tier only QUALIFIES when it matched on something. With height switched
  // off (or no height on file) the company tier has nothing left to match on:
  // its "cohort" is every client there is, which reaches the minimum at ring 0
  // and used to beat a studio cohort that had really matched on weight.
  const sOk = !!studio?.cohort.enough && studio.cohort.used.length > 0;
  const cOk = !!company?.cohort.enough && company.cohort.used.length > 0;
  let chosen: TierChoice | null = null;
  if (sOk && (!cOk || studio!.cohort.ring <= STUDIO_PREFERRED_RING || studio!.cohort.ring <= company!.cohort.ring)) {
    chosen = studio;
  } else if (cOk) {
    chosen = company;
  }

  // Nothing reached the minimum: keep the fuller of the two, so the screen
  // can still say how many similar clients there are so far.
  const thin =
    chosen ?? ([studio, company].filter(Boolean) as TierChoice[]).sort((a, b) => b.cohort.clients - a.cohort.clients)[0] ?? null;
  return { chosen, thin };
}

export interface SuggestArgs {
  /** The machine's fields, normalised keys, in display order. */
  fieldKeys: readonly string[];
  target: FitFactors;
  targetClientId?: string | null;
  sources: FitSources;
  spec: MatchSpec;
  /** Normalised values already set by the trainer (saved, or typed into the draft). */
  pinned?: Record<string, string>;
  /**
   * What is SAVED for her on this machine, normalised. She may already be in
   * the company block with these; one client like her is taken out of it so
   * her own half-finished set-up is not evidence for the rest of it.
   */
  saved?: Record<string, string>;
  /** Fields not to suggest. */
  skip?: readonly string[];
}

export function suggestForMachine({
  fieldKeys,
  target,
  targetClientId,
  sources,
  spec,
  pinned = {},
  saved = {},
  skip = [],
}: SuggestArgs): SuggestionResult {
  // Neither tier could be READ. That is not "nobody is set up": say unknown.
  if (!sources.studio && !sources.company) return { ok: false, tier: null, cohort: null, reason: "unknown" };

  const fair: FitSources =
    sources.company && Object.keys(saved).length > 0
      ? { studio: sources.studio, company: withoutSelf(sources.company, target, saved) }
      : sources;
  const { chosen, thin } = chooseTier(fair, target, spec, targetClientId);
  const alreadySet = [...skip, ...Object.keys(pinned)];

  if (chosen && chosen.cohort.used.length > 0) {
    const cluster = suggestCluster({
      fieldKeys,
      cohort: chosen.cohort.samples,
      everyone: chosen.everyone,
      pinned,
      skip,
      minClients: spec.minClients,
    });
    // Fields the similar clients could not speak for may still have a value
    // nearly everyone uses.
    const covered = new Set(cluster.picks.map((p) => p.key));
    const extras = universalPicks(fieldKeys, chosen.everyone, [...alreadySet, ...covered]);
    const order = new Map(fieldKeys.map((k, i) => [k, i]));
    const picks = [...cluster.picks, ...extras].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
    if (picks.length > 0) {
      const banded = cluster.picks;
      const together =
        cluster.seenTogether >= 2 && cluster.seenTogether >= chosen.cohort.clients * STRONG_TOGETHER_SHARE;
      const strength: Strength =
        banded.length > 0 && banded.every((p) => p.strength === "strong") && (banded.length === 1 || together)
          ? "strong"
          : "fair";
      return {
        ok: true,
        tier: chosen.tier,
        cohort: chosen.cohort,
        picks,
        seenTogether: cluster.seenTogether,
        strength,
        pinned: cluster.pinned,
        pinnedScope: cluster.pinnedScope,
      };
    }
  }

  // No band to speak of (no height on file, or too few similar clients):
  // the only honest offer left is what nearly everyone uses.
  if (thin) {
    const picks = universalPicks(fieldKeys, thin.everyone, alreadySet);
    if (picks.length > 0) {
      return {
        ok: true,
        tier: thin.tier,
        cohort: thin.cohort,
        picks,
        seenTogether: 0,
        strength: picks.every((p) => p.strength === "strong") ? "strong" : "fair",
        pinned: {},
        pinnedScope: "none",
      };
    }
  }

  const noFactor = (thin?.cohort.used.length ?? 0) === 0;
  return {
    ok: false,
    tier: thin?.tier ?? null,
    cohort: thin?.cohort ?? null,
    reason: noFactor
      ? "no-height"
      : !thin || thin.cohort.clients === 0
        ? "no-data"
        : // Enough similar clients, and still nothing to offer: no two of them agree.
          thin.cohort.enough
          ? "no-agreement"
          : "thin",
  };
}

/**
 * At the company tier a client cannot be removed by id — the cells are
 * anonymous. But she may well be IN the block (same height, same settings),
 * which would let an odd set-up vouch for itself. So one client who looks
 * like her is taken out.
 *
 * "LOOKS LIKE HER" IS NOT "EQUALS HER". The block was built from her
 * VERIFIED settings (an accepted, untrained value is left out) and from every
 * key on her row, while a screen passes the machine's own fields only — so
 * the two rarely match exactly, and an exact test quietly removed nobody. A
 * cell matches when it is at her height, in her gender's cell or the pooled
 * one, shares at least one setting with her and disagrees on none. The cell
 * sharing the MOST settings wins. If it is not actually her it is someone
 * indistinguishable from her on those settings, and removing one such client
 * is the same correction. If the weekly build has not seen her yet (or she has
 * changed a value since) nothing matches and nothing changes.
 */
export function withoutSelf(
  company: readonly FitSample[],
  target: FitFactors,
  settings: Record<string, string>,
): FitSample[] {
  let at = -1;
  let bestShared = 0;
  let bestExtra = Infinity;
  company.forEach((s, i) => {
    if (s.n <= 0 || s.factors.heightIn !== target.heightIn) return;
    const gender = s.factors.gender ?? null;
    if (gender !== null && gender !== (target.gender ?? null)) return;
    let shared = 0;
    let extra = 0;
    for (const [k, v] of Object.entries(s.settings)) {
      if (!(k in settings)) extra += 1;
      else if (settings[k] === v) shared += 1;
      else return; // disagrees with her on a setting both have: not her
    }
    if (shared === 0) return;
    if (shared > bestShared || (shared === bestShared && extra < bestExtra)) {
      at = i;
      bestShared = shared;
      bestExtra = extra;
    }
  });
  if (at < 0) return [...company];
  const out: FitSample[] = [];
  company.forEach((s, i) => {
    if (i !== at) out.push(s);
    else if (s.n > 1) out.push({ ...s, n: s.n - 1 });
  });
  return out;
}

export interface AuditForMachineArgs {
  fieldKeys: readonly string[];
  settings: Record<string, string>;
  target: FitFactors;
  targetClientId?: string | null;
  sources: FitSources;
  spec: MatchSpec;
  acks?: Record<string, FitAck> | null;
  fieldSteps?: Record<string, number | undefined>;
}

export function auditForMachine({
  fieldKeys,
  settings,
  target,
  targetClientId,
  sources,
  spec,
  acks,
  fieldSteps,
}: AuditForMachineArgs): MachineAudit {
  if (!sources.studio && !sources.company) {
    return { tier: null, cohort: null, flags: [], acknowledged: [], unchecked: [...fieldKeys], state: "unknown" };
  }
  const hasAny = fieldKeys.some((k) => settings[k] !== undefined && settings[k] !== "");
  const fair: FitSources = {
    studio: sources.studio,
    company: sources.company ? withoutSelf(sources.company, target, settings) : null,
  };
  const { chosen, thin } = chooseTier(fair, target, spec, targetClientId);
  const pick = chosen ?? thin;
  if (!pick || !hasAny) {
    return {
      tier: pick?.tier ?? null,
      cohort: pick?.cohort ?? null,
      flags: [],
      acknowledged: [],
      unchecked: [],
      state: !pick ? "not-enough" : pick.cohort.used.length === 0 ? "no-height" : "checked",
    };
  }
  return auditMachine({
    fieldKeys,
    settings,
    cohort: pick.cohort,
    tier: pick.tier,
    minClients: spec.minClients,
    acks,
    fieldSteps,
  });
}
