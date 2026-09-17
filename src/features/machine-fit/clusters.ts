/**
 * MACHINE FIT — setting CLUSTERS: values that go together.
 *
 * The brief's point, in its own words: "changing one setting (like the Seat)
 * dictates that you must change another (like the Pad). The algorithm must
 * suggest cohesive clusters of settings, not just isolated averages."
 *
 * The per-field answer the Settings card has used since Sep 16 takes each
 * field's most common value on its own. That can offer Seat 3 (the short
 * clients' seat) beside Pad 5 (the tall clients' pad) — a pair nobody in the
 * building actually uses. So this module never picks a field on its own. It
 * builds the set-up the way a head trainer would say it out loud:
 *
 *     "People her height mostly sit at Seat 3.           ← most agreed field first
 *      The ones at Seat 3 mostly use Pad 2.              ← GIVEN Seat 3
 *      The ones at Seat 3 and Pad 2 are mostly at Gap 4."  ← GIVEN both
 *
 * Each pick narrows the group the next pick is read from, so every value
 * offered sits beside the others in real clients. When the group gets too
 * thin to narrow again (under MIN_CONDITIONAL clients) the chain stops
 * narrowing and says so on the pick (`given` stops growing) rather than
 * quoting two people.
 *
 * PINNED VALUES. Anything the trainer has already set is a fact, not a
 * suggestion, and the chain STARTS from it: set Seat 4 by hand and the Pad
 * offered is the Pad of Seat-4 clients. That is what makes the screen
 * re-suggest as they type. If too few similar-height clients sit at the
 * pinned value, the link is read across every height instead — given the
 * seat, the pad depends far more on the seat than on the height that chose it.
 *
 * Why not just count whole combinations? With five fields of eight values
 * the full combination is almost always unique, and clients rarely have
 * every field filled in ("Gap:4 Seat:3" for one, "G:4, S:4, C:4, H:W" for the
 * next, on the same machine). The chain uses whatever each client has.
 * `seenTogether` still reports how many clients hold the WHOLE offered
 * combination, because that is the number a trainer trusts.
 */

import { sumClients } from "./cohort.ts";
import type { FieldPick, FitSample, Strength } from "./types.ts";

/** One client's choice is an anecdote. A value needs at least this many clients behind it. */
export const MIN_FIELD_SUPPORT = 2;
/** Keep narrowing only while the narrowed group still has this many clients. */
export const MIN_CONDITIONAL = 3;
/** "Strong": at least this many clients, and at least this share of the group. */
export const STRONG_SUPPORT = 3;
export const STRONG_SHARE = 0.5;
/** A value nearly everyone uses whatever their build ("Gap 0"). */
export const UNIVERSAL_MIN_CLIENTS = 10;
export const UNIVERSAL_SHARE = 0.7;
export const UNIVERSAL_STRONG_SHARE = 0.85;

/** "6" → 6, "6_5" → 6.5, "b" → null. Normalised values keep their dot as an underscore. */
export function numericOf(value: string): number | null {
  if (!/^-?\d+(?:_\d+)?$/.test(value)) return null;
  const n = Number(value.replace("_", "."));
  return Number.isFinite(n) ? n : null;
}

export interface FieldCounts {
  counts: Map<string, number>;
  /** Clients with any value for the field. */
  total: number;
}

export function countField(samples: readonly FitSample[], key: string): FieldCounts {
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of samples) {
    const v = s.settings[key];
    if (v === undefined) continue;
    counts.set(v, (counts.get(v) ?? 0) + s.n);
    total += s.n;
  }
  return { counts, total };
}

export interface WeightedPoint {
  x: number;
  /** How many clients sit at x. */
  n: number;
}

/** The ordinary median (lower and upper middle, averaged) of points that each stand for `n` clients. */
export function medianOfPoints(input: readonly WeightedPoint[]): number | null {
  const points = input.filter((p) => p.n > 0 && Number.isFinite(p.x));
  let total = 0;
  for (const p of points) total += p.n;
  if (total === 0) return null;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lowerAt = Math.floor((total - 1) / 2);
  const upperAt = Math.ceil((total - 1) / 2);
  let seen = 0;
  let lower: number | null = null;
  let upper: number | null = null;
  for (const p of sorted) {
    const next = seen + p.n;
    if (lower === null && lowerAt < next) lower = p.x;
    if (upper === null && upperAt < next) upper = p.x;
    seen = next;
    if (lower !== null && upper !== null) break;
  }
  return lower === null || upper === null ? null : (lower + upper) / 2;
}

/** A numbered field's values among clients, as weighted points. Non-numbers are left out. */
export function numericPoints(samples: readonly FitSample[], key: string): WeightedPoint[] {
  const points: WeightedPoint[] = [];
  for (const s of samples) {
    const raw = s.settings[key];
    if (raw === undefined) continue;
    const x = numericOf(raw);
    if (x !== null) points.push({ x, n: s.n });
  }
  return points;
}

/** The middle value of a numbered field among clients. */
export function weightedMedian(samples: readonly FitSample[], key: string): number | null {
  return medianOfPoints(numericPoints(samples, key));
}

/**
 * The most common value. Ties are settled, in order, by: the value more
 * common in the wider group (`tieBreak`), the value nearer the numeric
 * middle, then plain ordering — so the same data always offers the same value.
 */
export function modeOf(
  field: FieldCounts,
  samples: readonly FitSample[],
  key: string,
  tieBreak?: FieldCounts,
): { value: string; clients: number } | null {
  let best: string[] = [];
  let bestCount = 0;
  for (const [value, n] of field.counts) {
    if (n > bestCount) {
      best = [value];
      bestCount = n;
    } else if (n === bestCount) best.push(value);
  }
  if (best.length === 0) return null;
  if (best.length > 1) {
    const median = weightedMedian(samples, key);
    best.sort((a, b) => {
      const wide = (tieBreak?.counts.get(b) ?? 0) - (tieBreak?.counts.get(a) ?? 0);
      if (wide !== 0) return wide;
      if (median !== null) {
        const na = numericOf(a);
        const nb = numericOf(b);
        if (na !== null && nb !== null && na !== nb) return Math.abs(na - median) - Math.abs(nb - median);
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  return { value: best[0], clients: bestCount };
}

function strengthOf(support: number, outOf: number): Strength {
  return support >= STRONG_SUPPORT && outOf > 0 && support / outOf >= STRONG_SHARE ? "strong" : "fair";
}

function matchesAll(sample: FitSample, wanted: Record<string, string>): boolean {
  for (const [k, v] of Object.entries(wanted)) if (sample.settings[k] !== v) return false;
  return true;
}

export interface ClusterArgs {
  /** The machine's fields, normalised keys, in the order the machine shows them. */
  fieldKeys: readonly string[];
  /** The similar clients (already banded by the ladder). */
  cohort: readonly FitSample[];
  /** Every sample of the same tier, any build — for the pinned fallback and universal values. */
  everyone: readonly FitSample[];
  /** Normalised values the trainer has already set. */
  pinned?: Record<string, string>;
  /** Fields not to suggest (already filled, or an absolute standard). */
  skip?: readonly string[];
}

export interface ClusterResult {
  picks: FieldPick[];
  seenTogether: number;
  pinnedScope: "band" | "all" | "none";
  /** The pinned values that were actually used (those on this machine's own fields). */
  pinned: Record<string, string>;
}

export function suggestCluster({ fieldKeys, cohort, everyone, pinned = {}, skip = [] }: ClusterArgs): ClusterResult {
  const known = new Set(fieldKeys);
  const pinnedHere: Record<string, string> = {};
  for (const [k, v] of Object.entries(pinned)) if (known.has(k) && v) pinnedHere[k] = v;

  // Where the chain starts: from the clients who share what is already set.
  let current: readonly FitSample[] = cohort;
  let pinnedScope: ClusterResult["pinnedScope"] = "none";
  if (Object.keys(pinnedHere).length > 0) {
    const inBand = cohort.filter((s) => matchesAll(s, pinnedHere));
    if (sumClients(inBand) >= MIN_CONDITIONAL) {
      current = inBand;
      pinnedScope = "band";
    } else {
      const anywhere = everyone.filter((s) => matchesAll(s, pinnedHere));
      if (sumClients(anywhere) >= MIN_CONDITIONAL) {
        current = anywhere;
        pinnedScope = "all";
      }
    }
  }

  const skipped = new Set(skip);
  const remaining = fieldKeys.filter((k) => !(k in pinnedHere) && !skipped.has(k));
  const picks: FieldPick[] = [];
  const given: Record<string, string> = pinnedScope === "none" ? {} : { ...pinnedHere };
  let narrowing = true;

  while (remaining.length > 0) {
    // The field the group agrees on most goes next: it is the safest thing to
    // narrow by, and narrowing by a coin-flip first would split the group for
    // nothing.
    let choice: { at: number; key: string; value: string; support: number; outOf: number } | null = null;
    for (let i = 0; i < remaining.length; i += 1) {
      const key = remaining[i];
      const field = countField(current, key);
      const mode = modeOf(field, current, key, countField(cohort, key));
      if (!mode || mode.clients < MIN_FIELD_SUPPORT) continue;
      const better =
        !choice ||
        mode.clients > choice.support ||
        (mode.clients === choice.support && mode.clients / field.total > choice.support / choice.outOf);
      if (better) choice = { at: i, key, value: mode.value, support: mode.clients, outOf: field.total };
    }
    if (!choice) break;

    picks.push({
      key: choice.key,
      value: choice.value,
      support: choice.support,
      outOf: choice.outOf,
      given: { ...given },
      strength: strengthOf(choice.support, choice.outOf),
    });
    remaining.splice(choice.at, 1);

    if (narrowing) {
      const narrowed = current.filter((s) => s.settings[choice!.key] === choice!.value);
      if (sumClients(narrowed) >= MIN_CONDITIONAL) {
        current = narrowed;
        given[choice.key] = choice.value;
      } else {
        narrowing = false;
      }
    }
  }

  const offered: Record<string, string> = { ...(pinnedScope === "band" ? pinnedHere : {}) };
  for (const p of picks) offered[p.key] = p.value;
  const seenTogether =
    picks.length === 0 ? 0 : sumClients(cohort.filter((s) => matchesAll(s, offered)));

  // Put the picks back in the machine's own order — the chain's order is how
  // they were reasoned, not how a trainer reads the machine.
  const order = new Map(fieldKeys.map((k, i) => [k, i]));
  picks.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));

  return { picks, seenTogether, pinnedScope, pinned: pinnedHere };
}

/**
 * Values nearly everyone uses whatever their build. Read from EVERY sample,
 * so it still has something to say when the similar-client band is empty —
 * a brand-new client with no height on file is still going to be at Gap 0.
 */
export function universalPicks(
  fieldKeys: readonly string[],
  everyone: readonly FitSample[],
  skip: readonly string[] = [],
): FieldPick[] {
  const skipped = new Set(skip);
  const picks: FieldPick[] = [];
  for (const key of fieldKeys) {
    if (skipped.has(key)) continue;
    const field = countField(everyone, key);
    if (field.total < UNIVERSAL_MIN_CLIENTS) continue;
    const mode = modeOf(field, everyone, key);
    if (!mode) continue;
    const share = mode.clients / field.total;
    if (share < UNIVERSAL_SHARE) continue;
    picks.push({
      key,
      value: mode.value,
      support: mode.clients,
      outOf: field.total,
      given: {},
      strength: share >= UNIVERSAL_STRONG_SHARE ? "strong" : "fair",
      universal: true,
    });
  }
  return picks;
}
