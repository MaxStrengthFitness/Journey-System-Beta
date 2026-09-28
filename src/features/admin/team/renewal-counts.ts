/**
 * RENEWALS BY TRAINER — the leaders-only counts on Team → This week, and the
 * chance check. Pure: renewal-counts.test.ts.
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026). AJ's question 8
 * took the default: a trainer's renewals are COUNTS under TRAINER_RATE_MIN
 * renewal points and a rate from it, in name order, and a trainer is called
 * out only when their count falls outside the range chance alone gives for
 * their number. Head trainers count as leaders: the section shows to whoever
 * `canManageRenewals` says may see per-trainer rates (renewals/permissions:
 * "rates are for studio leaders only", AJ, Sep 10 2026), which includes
 * them. Context for a conversation, never a verdict: no colour, no order but
 * the alphabet, no "best".
 *
 * "Kept" is the Outcomes panel's own word and rule (renewals/rates.ts:
 * renewed, upgraded or downgraded, and pay-as-you-go when the studio says
 * it counts as kept). A renewal point is a closed package with an outcome.
 *
 * THE CHANCE CHECK. The studio's own share kept this quarter, p, is what
 * chance would give anybody. For a trainer with n renewal points the number
 * kept by chance alone falls, 95 times in 100, between the 2.5th and the
 * 97.5th percentile of a binomial(n, p): computed exactly, because the
 * normal approximation is poor at the small numbers a studio has. (With 23
 * of 30 kept across the studio, a trainer with 9 renewal points may land
 * anywhere from 4 to all 9 — the blueprint's own example.) Two floors keep
 * it honest: the studio needs STUDIO_CHECK_MIN renewal points before p means
 * anything, and nobody is called out below MIN_TRAINER_OUTCOMES (the
 * Outcomes panel's least for a line about one trainer), because a range
 * that wide says nothing about a person. A count outside the range is worth
 * a conversation, not a judgment.
 */
import { MIN_TRAINER_OUTCOMES, groupTallies, tallyOutcomes, type OutcomeRow, type PaygRule } from "../../renewals/rates";

/** A trainer's rate appears from this many renewal points (AJ's question 8). */
export const TRAINER_RATE_MIN = 10;
/** The chance check needs the studio to have this many renewal points. */
export const STUDIO_CHECK_MIN = 10;
export { MIN_TRAINER_OUTCOMES };

export interface TrainerRenewals {
  trainerId: string;
  name: string;
  /** Closed packages with an outcome, attributed to this trainer. */
  points: number;
  kept: number;
  /** "75%", from TRAINER_RATE_MIN points; null below. */
  rate: string | null;
  /** What chance alone gives for their number; null when the check can't be made. */
  range: { low: number; high: number } | null;
  /** Outside the chance range, and enough renewal points to say so. */
  outside: "above" | "below" | null;
}

export interface RenewalCounts {
  studio: { points: number; kept: number };
  /** In name order. */
  rows: TrainerRenewals[];
  /** Renewal points with no trainer on record. */
  unattributed: number;
  /** The studio's share kept, when the chance check can be made; null otherwise. */
  p: number | null;
}

/**
 * The 2.5th and 97.5th percentiles of a binomial(n, p): the range of counts
 * chance alone gives 95 times in 100. Summed in log space, so a long run of
 * tiny terms never underflows to a stuck zero.
 */
export function chanceRange(n: number, p: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 0 };
  if (p <= 0) return { low: 0, high: 0 };
  if (p >= 1) return { low: n, high: n };
  const logRatio = Math.log(p / (1 - p));
  let logPmf = n * Math.log(1 - p);
  let cdf = 0;
  let low: number | null = null;
  for (let k = 0; k <= n; k += 1) {
    if (k > 0) logPmf += Math.log((n - k + 1) / k) + logRatio;
    cdf += Math.exp(logPmf);
    if (low === null && cdf > 0.025) low = k;
    if (cdf >= 0.975) return { low: low ?? k, high: k };
  }
  return { low: low ?? 0, high: n };
}

export function renewalCounts(rows: readonly OutcomeRow[], rule: PaygRule, nameOf: (trainerId: string) => string): RenewalCounts {
  const studio = tallyOutcomes([...rows], rule);
  const p = studio.total >= STUDIO_CHECK_MIN && studio.kept > 0 && studio.kept < studio.total ? studio.kept / studio.total : null;
  let unattributed = 0;
  const out: TrainerRenewals[] = [];
  for (const g of groupTallies([...rows], (r) => r.primaryTrainerId, rule)) {
    if (g.key === null) {
      unattributed += g.tally.total;
      continue;
    }
    if (g.tally.total === 0) continue;
    const range = p === null ? null : chanceRange(g.tally.total, p);
    const outside =
      range === null || g.tally.total < MIN_TRAINER_OUTCOMES ? null : g.tally.kept < range.low ? "below" : g.tally.kept > range.high ? "above" : null;
    out.push({
      trainerId: g.key,
      name: nameOf(g.key),
      points: g.tally.total,
      kept: g.tally.kept,
      rate: g.tally.total >= TRAINER_RATE_MIN ? `${Math.round((g.tally.kept / g.tally.total) * 100)}%` : null,
      range,
      outside,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { studio: { points: studio.total, kept: studio.kept }, rows: out, unattributed, p };
}

const points = (n: number) => `${n} renewal ${n === 1 ? "point" : "points"}`;
const upTo = (high: number, n: number) => (high === n ? `all ${n}` : String(high));

/** The line under the table: who, if anyone, is outside what chance gives. */
export function checkLine(c: RenewalCounts): string {
  if (c.p === null) {
    return c.studio.points < STUDIO_CHECK_MIN
      ? `The chance check needs ${points(STUDIO_CHECK_MIN)} across the studio this quarter. There ${c.studio.points === 1 ? "is" : "are"} ${c.studio.points}.`
      : "Every renewal point this quarter went the same way, so there is nothing to check a trainer against.";
  }
  const out = c.rows.filter((r) => r.outside && r.range);
  if (out.length === 0) return "Nobody is outside the range chance alone gives for their number.";
  return out
    .map((r) => `${r.name}'s ${r.kept} of ${r.points} is outside the range chance alone gives for ${points(r.points)} (${r.range!.low} to ${upTo(r.range!.high, r.points)}).`)
    .concat("Worth a conversation, not a judgment.")
    .join(" ");
}

/** "How we check", in words, with the trainer who has the most renewal points as the example. */
export function howWeCheck(c: RenewalCounts): string {
  const method = `Chance alone is the studio's own share kept this quarter. Nobody is called out below ${points(MIN_TRAINER_OUTCOMES)}: a range that wide says nothing about a person.`;
  if (c.p === null) return `${checkLine(c)} ${method}`;
  const example = [...c.rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0];
  if (!example || !example.range) return method;
  const inside = example.kept >= example.range.low && example.kept <= example.range.high;
  return [
    `With ${c.studio.kept} of ${c.studio.points} kept across the studio, chance alone lets a trainer with ${points(example.points)} land anywhere from ${example.range.low} to ${upTo(example.range.high, example.points)}.`,
    inside
      ? `${example.name}'s ${example.kept} of ${example.points} sits inside that range, so it says nothing about them yet.`
      : `${example.name}'s ${example.kept} of ${example.points} is outside it.`,
    "A count outside the range is worth a conversation, not a judgment.",
    method,
  ].join(" ");
}
