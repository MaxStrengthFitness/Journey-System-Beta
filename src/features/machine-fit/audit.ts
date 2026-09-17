/**
 * MACHINE FIT — the passive audit: is anything set somewhere odd?
 *
 * "Trainers ultimately know best. The app should never force a setting.
 * However, we want an audit feature … that flags obscure or highly unusual
 * settings for their body type … catching accidental bad setups."
 *
 * So this never says WRONG. It compares each saved value with what similar
 * clients use and, when nobody similar is anywhere near it, marks it "worth
 * a look" with the evidence attached. A trainer who looks and says "that's
 * right for her" quiets the mark for as long as the value stays the same.
 *
 * THE RULES (every number here is named and exported, so the screen's
 * sentence and the test agree with the code):
 *
 *   · Nothing is judged on fewer than the spec's minimum similar clients
 *     WITH THAT FIELD SET. Below it the field is `unchecked` — unknown, not
 *     fine and not odd.
 *   · She is never in her own comparison group (the cohort is built with
 *     `excludeClientId`), or every odd value would vouch for itself.
 *   · A NUMBERED setting is judged by DISTANCE, in notches, from the middle
 *     of the group, scaled by how spread out the group is. Seat 5 when the
 *     group runs 3–7 is nothing; Seat 9 when the group is all 4s and 5s is
 *     worth a look. The scale never drops below one notch, so a group that
 *     all sits at 4 does not make a 5 look extreme.
 *   · A LETTERED setting (Handles: In / Out) has no distance, so it is judged
 *     by SHARE alone, and only called rare when the group is big enough
 *     (twice the minimum) for "nobody" to mean something.
 *   · RARE NEEDS A SECOND OPINION. The comparison group is the TIGHTEST band
 *     with enough clients — often six or seven people. "None of the 6 clients
 *     her exact height use Gap 4" is weak when one client in ten, at every
 *     height, uses Gap 4: six people is simply too few to have met one. So a
 *     value is only called rare when it is ALSO rare across the widest band
 *     the ladder could reach (cohort.wide). A setting that follows height is
 *     still rare out there (no 5'1" client is near Seat 1, and no 5'4" one
 *     either); a setting that follows nothing is not, and is marked
 *     `uncommon` — the faint dot — instead. A confident wrong mark is worse
 *     than a missing one.
 *   · A COMBINATION: two values that are each common but that no similar
 *     client uses together — the interdependent-settings mistake (the seat
 *     was moved, the pad was not). Only raised when chance alone would have
 *     put at least COMBO_MIN_EXPECTED clients on the pair.
 *
 * Two levels, and only one is ever counted anywhere: `rare` draws the plum
 * mark and adds to "n to review" on the Setup segment; `uncommon` is a faint
 * dot inside the row. Plum, never red — the red mark is rep quality's.
 */

import { MIN_FIELD_SUPPORT, countField, medianOfPoints, numericOf, numericPoints, weightedMedian } from "./clusters.ts";
import type {
  Cohort,
  ComboFlag,
  FieldFlag,
  FitAck,
  FitFlag,
  FitSample,
  FitTier,
  MachineAudit,
  ValueShare,
} from "./types.ts";

export const RARE_Z = 3;
export const UNCOMMON_Z = 2;
export const RARE_SHARE = 0.05;
export const UNCOMMON_SHARE = 0.1;
/** A field counts as numbered when at least this share of the group's values are numbers. */
export const NUMERIC_FIELD_SHARE = 0.8;
export const COMBO_MIN_EXPECTED = 2;

const MAD_TO_SIGMA = 1.4826;

/** Spread of a numbered field among clients: the median distance from the median, as a sigma. */
export function weightedSpread(samples: readonly FitSample[], key: string, median: number): number {
  const distances = numericPoints(samples, key).map((p) => ({ x: Math.abs(p.x - median), n: p.n }));
  const mad = medianOfPoints(distances);
  return mad === null ? 0 : mad * MAD_TO_SIGMA;
}

/**
 * "One notch", when the catalog does not give a step: the smallest gap
 * between two values that EACH have more than one client on them.
 *
 * The support rule is the point. One client on Seat 3.75 among a group on 4
 * used to make a notch of 0.25 — and with it a client on 5 looked four
 * notches away from a group she was one notch from. A half-step is only a
 * notch once the machine's half-steps are actually in use.
 */
export function observedNotch(counts: ReadonlyMap<string, number>): number {
  const nums: number[] = [];
  for (const [value, clients] of counts) {
    if (clients < MIN_FIELD_SUPPORT) continue;
    const n = numericOf(value);
    if (n !== null) nums.push(n);
  }
  nums.sort((a, b) => a - b);
  let notch = Infinity;
  for (let i = 1; i < nums.length; i += 1) {
    const gap = nums[i] - nums[i - 1];
    if (gap > 1e-9 && gap < notch) notch = gap;
  }
  return Number.isFinite(notch) ? notch : 1;
}

function distributionOf(counts: Map<string, number>): ValueShare[] {
  return [...counts.entries()]
    .map(([value, clients]) => ({ value, clients }))
    .sort((a, b) => b.clients - a.clients || (a.value < b.value ? -1 : 1));
}

/** The ack key for a pair, so "reviewed" can be stored the same way as for one field. */
export function comboAckKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}
export function comboAckValue(keys: [string, string], values: [string, string]): string {
  const pairs = keys.map((k, i) => [k, values[i]] as const).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  return pairs.map(([, v]) => v).join("+");
}

export interface AuditArgs {
  fieldKeys: readonly string[];
  /** The client's saved settings, normalised. */
  settings: Record<string, string>;
  cohort: Cohort;
  tier: FitTier;
  minClients: number;
  /** clientMachineSettings.fitAcks, keyed by normalised field key (or comboAckKey). */
  acks?: Record<string, FitAck> | null;
  /** The catalog's step for a numbered field, when it has one. */
  fieldSteps?: Record<string, number | undefined>;
}

export function auditMachine({
  fieldKeys,
  settings,
  cohort,
  tier,
  minClients,
  acks,
  fieldSteps = {},
}: AuditArgs): MachineAudit {
  if (cohort.used.length === 0) {
    return { tier: null, cohort, flags: [], acknowledged: [], unchecked: [...fieldKeys], state: "no-height" };
  }
  if (!cohort.enough) {
    return { tier, cohort, flags: [], acknowledged: [], unchecked: [...fieldKeys], state: "not-enough" };
  }

  const flags: FitFlag[] = [];
  const acknowledged: FitFlag[] = [];
  const unchecked: string[] = [];
  const typical: string[] = [];

  const file = (flag: FitFlag, ackKey: string, ackValue: string) => {
    if (acks?.[ackKey]?.value === ackValue) acknowledged.push(flag);
    else flags.push(flag);
  };

  for (const key of fieldKeys) {
    const value = settings[key];
    if (value === undefined || value === "") continue;

    const field = countField(cohort.samples, key);
    if (field.total < minClients) {
      unchecked.push(key);
      continue;
    }
    const mine = field.counts.get(value) ?? 0;
    const share = mine / field.total;
    // The second opinion: is it still rare with the net cast as wide as it goes?
    const wider = countField(cohort.wide, key);
    const rareOutThere = wider.total === 0 || (wider.counts.get(value) ?? 0) / wider.total < RARE_SHARE;
    const base: Omit<FieldFlag, "level"> = {
      kind: "value",
      key,
      value,
      clients: mine,
      outOf: field.total,
      distribution: distributionOf(field.counts),
    };

    let numbered = 0;
    for (const [v, n] of field.counts) if (numericOf(v) !== null) numbered += n;
    const myNumber = numericOf(value);

    if (myNumber !== null && numbered / field.total >= NUMERIC_FIELD_SHARE) {
      const median = weightedMedian(cohort.samples, key);
      if (median === null) {
        unchecked.push(key);
        continue;
      }
      const notch = fieldSteps[key] && fieldSteps[key]! > 0 ? fieldSteps[key]! : observedNotch(field.counts);
      const scale = Math.max(weightedSpread(cohort.samples, key, median), notch);
      const z = Math.abs(myNumber - median) / scale;
      if (z >= RARE_Z && share < RARE_SHARE && rareOutThere) file({ ...base, level: "rare", median }, key, value);
      else if (z >= UNCOMMON_Z && share < UNCOMMON_SHARE) file({ ...base, level: "uncommon", median }, key, value);
      else typical.push(key);
      continue;
    }

    if (mine === 0 && field.total >= minClients * 2 && rareOutThere) file({ ...base, level: "rare" }, key, value);
    else if (mine === 0 || (mine <= 1 && share < UNCOMMON_SHARE)) file({ ...base, level: "uncommon" }, key, value);
    else typical.push(key);
  }

  // Pairs of values that are each ordinary but never sit together.
  for (let i = 0; i < typical.length; i += 1) {
    for (let j = i + 1; j < typical.length; j += 1) {
      const a = typical[i];
      const b = typical[j];
      const va = settings[a];
      const vb = settings[b];
      let outOf = 0;
      let withA = 0;
      let withB = 0;
      let both = 0;
      for (const s of cohort.samples) {
        const sa = s.settings[a];
        const sb = s.settings[b];
        if (sa === undefined || sb === undefined) continue;
        outOf += s.n;
        if (sa === va) withA += s.n;
        if (sb === vb) withB += s.n;
        if (sa === va && sb === vb) both += s.n;
      }
      if (outOf < minClients || both > 0) continue;
      if ((withA * withB) / outOf < COMBO_MIN_EXPECTED) continue;
      const flag: ComboFlag = {
        kind: "combo",
        keys: [a, b],
        values: [va, vb],
        level: "uncommon",
        each: [withA, withB],
        outOf,
      };
      file(flag, comboAckKey(a, b), comboAckValue([a, b], [va, vb]));
    }
  }

  return { tier, cohort, flags, acknowledged, unchecked, state: "checked" };
}

/** How many marks a client's Setup segment should mention: the rare ones only. */
export function countToReview(audits: Iterable<MachineAudit>): number {
  let n = 0;
  for (const a of audits) for (const f of a.flags) if (f.level === "rare") n += 1;
  return n;
}
