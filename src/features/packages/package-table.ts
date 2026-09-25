/**
 * PACKAGES — the studio's package table, read for a person deciding.
 *
 * The packages screen (consultation round, Sep 2026) explains the
 * commitments to someone who has not chosen one: a prospect on their free
 * workouts, or anyone Mindbody shows with no package. It adds no prices of
 * its own. Every figure here is the studio's own table
 * (studios/{s}/config/renewals, cleaned by renewals/settings.ts), so a
 * location with different prices shows its own, and the totals are the same
 * sums the Renewal Brief does (renewals/options.ts), in the same order, with
 * the same formatter (renewals/money.ts).
 *
 * THE RULES THIS FILE KEEPS
 *   - A confident wrong number is worse than a missing one. A package with no
 *     price says "not set"; a package whose payments and per-session price
 *     do not multiply out gets no whole-package total at all (`addsUp`);
 *     a paid-in-full "saving" of zero or less is not a saving and is null.
 *   - Paying in full is one payment. Nothing here words a paid-in-full figure
 *     as if it were billed every 4 weeks.
 *   - Only claim what this studio's table shows. "A longer commitment lowers
 *     every payment" is the website's line (docs/business/packages-and-
 *     pricing.md); `lowersEveryPayment` says whether it is true HERE.
 *   - How often a package is for is worked out, never stored: sessions per
 *     payment ÷ 4 weeks. 8 a payment is twice a week (all three of the
 *     standard packages); 4 is once a week, the Academy's last option when
 *     money is truly the problem.
 *   - Weeks, not months, for how long sessions take. The Trial is sold as "6
 *     months" and bills for 24 weeks; turning weeks back into calendar months
 *     would print "5½ months" beside a package called 6 months. The package's
 *     own `months` is the only months figure on the screen.
 *
 * Pure: no React, no Firebase.
 */

import { byPackageLength } from "../renewals/options";
import { sessionsPerPayment } from "../renewals/settings";
import type { PackageTier, RenewalSettings } from "../renewals/types";

export { formatMoney } from "../renewals/money";

export type PayMode = "monthly" | "full";
export type ShowAs = "session" | "week" | "payment";
export type Frequency = "twice" | "once" | "other";

/** Every MSF package bills once every 4 weeks. */
export const WEEKS_PER_PAYMENT = 4;
/** The "Life happens" stepper: 0 to 16 weeks away. */
export const MAX_WEEKS_AWAY = 16;
/** Payments and per-session price may disagree by rounding, never by more. */
export const ADDS_UP_TOLERANCE = 1;
/**
 * The length the trainer's recommendation starts on (AJ, Sep 24 2026:
 * "allow the trainer to recommend one but auto default to 12"). It is the
 * Academy's "middle option" (the consultation script's price commitments).
 */
export const DEFAULT_RECOMMENDED_MONTHS = 12;
/** Dots are drawn one per session only while they stay countable. */
const MAX_DOT_GROUPS = 24;
const MAX_DOTS_PER_GROUP = 12;

/* ------------------------------------------------------------------ *
 * How often, and which packages lead
 * ------------------------------------------------------------------ */

/** Visits a week the package is priced for: sessions per payment ÷ 4. */
export function visitsPerWeek(tier: PackageTier): number | null {
  if (!(tier.sessions > 0) || !(tier.payments > 0)) return null;
  return sessionsPerPayment(tier) / WEEKS_PER_PAYMENT;
}

export function frequencyOf(tier: PackageTier): Frequency {
  const v = visitsPerWeek(tier);
  if (v === null) return "other";
  if (Math.abs(v - 2) < 1e-9) return "twice";
  if (Math.abs(v - 1) < 1e-9) return "once";
  return "other";
}

export interface Lineup {
  /** The lengths the screen leads with: twice a week, shortest first. */
  headline: PackageTier[];
  /** Once-a-week rows, kept for the trainer notes. */
  once: PackageTier[];
  /** Anything else in the table (three a week, a studio's own). */
  other: PackageTier[];
  /**
   * False when the table has no twice-a-week package at all, so the
   * headline is simply every row. The screen then says nothing about how
   * often, and claims nothing across the lengths.
   */
  headlineIsTwiceAWeek: boolean;
}

export function lineup(settings: Pick<RenewalSettings, "packages">): Lineup {
  const all = [...settings.packages].sort(byPackageLength);
  const twice = all.filter((t) => frequencyOf(t) === "twice");
  if (twice.length === 0) return { headline: all, once: [], other: [], headlineIsTwiceAWeek: false };
  return {
    headline: twice,
    once: all.filter((t) => frequencyOf(t) === "once"),
    other: all.filter((t) => frequencyOf(t) === "other"),
    headlineIsTwiceAWeek: true,
  };
}

/**
 * Which length carries the trainer's recommendation when the screen opens:
 * the 12-month package, or failing that the middle of an odd number of
 * lengths (the Academy's "middle option"). Null when neither exists.
 */
export function defaultRecommendationKey(headline: PackageTier[]): string | null {
  const twelve = headline.find((t) => t.months === DEFAULT_RECOMMENDED_MONTHS);
  if (twelve) return twelve.key;
  if (headline.length >= 3 && headline.length % 2 === 1) return headline[(headline.length - 1) / 2].key;
  return null;
}

/* ------------------------------------------------------------------ *
 * One package's figures
 * ------------------------------------------------------------------ */

export interface TierFigures {
  tier: PackageTier;
  sessionsPerPayment: number;
  visitsPerWeek: number | null;
  /** The studio never set a price for this package. */
  priceMissing: boolean;
  /** Every 4 weeks: the monthly rate. */
  rate: number | null;
  /** Paid in full: the paid-in-full rate (the monthly rate when none is set). */
  fullRate: number | null;
  /** Each 4-weekly payment. */
  payment: number | null;
  /** sessions × rate (what the Renewal Brief shows), when the table adds up. */
  wholeMonthly: number | null;
  /** sessions × the paid-in-full rate. */
  wholeFull: number | null;
  /** wholeMonthly − wholeFull, only when it is a real saving. */
  fullSaving: number | null;
  /** rate − paid-in-full rate, only when it is a real saving. */
  fullSavingPerSession: number | null;
  /**
   * Whether payments × each payment and sessions × the rate agree to the
   * dollar. Nothing in the settings form enforces it; when they differ the
   * screen withholds the totals rather than pick one.
   */
  addsUp: boolean;
  /** payments × 4: the week the payments end. */
  billingWeeks: number;
}

export function figuresFor(tier: PackageTier): TierFigures {
  const spp = sessionsPerPayment(tier);
  const rate = tier.ratePerSession > 0 ? tier.ratePerSession : null;
  const payment = tier.paymentAmount > 0 ? tier.paymentAmount : null;
  const fullRate = rate === null ? null : tier.prepayRatePerSession > 0 ? tier.prepayRatePerSession : rate;

  const addsUp =
    rate !== null &&
    payment !== null &&
    Math.abs(tier.payments * payment - tier.sessions * rate) <= ADDS_UP_TOLERANCE;
  const wholeMonthly = addsUp && rate !== null ? tier.sessions * rate : null;
  const wholeFull = fullRate !== null ? tier.sessions * fullRate : null;
  const rawSaving = wholeMonthly !== null && wholeFull !== null ? wholeMonthly - wholeFull : null;
  const perSessionSaving = rate !== null && fullRate !== null ? rate - fullRate : null;

  return {
    tier,
    sessionsPerPayment: spp,
    visitsPerWeek: visitsPerWeek(tier),
    priceMissing: rate === null,
    rate,
    fullRate,
    payment,
    wholeMonthly,
    wholeFull,
    fullSaving: rawSaving !== null && rawSaving > 0.005 ? rawSaving : null,
    fullSavingPerSession: perSessionSaving !== null && perSessionSaving > 0.005 ? perSessionSaving : null,
    addsUp,
    billingWeeks: tier.payments * WEEKS_PER_PAYMENT,
  };
}

/** The pick labels for "Show the price as", which change with how they pay. */
export function showAsLabel(showAs: ShowAs, pay: PayMode): string {
  if (showAs === "session") return "A session";
  if (showAs === "week") return "A week";
  return pay === "full" ? "Paid once" : "Each payment";
}

/**
 * The one number the screen shows big, in the unit the trainer chose.
 *
 * Every 4 weeks, the three units are real: a session's price, a payment ÷ 4,
 * and the payment. Paid in full there is ONE payment, so the third unit is
 * the whole amount, and "a week" is what the whole works out to per week of
 * the package's own pace, said as such.
 */
export function priceAs(f: TierFigures, showAs: ShowAs, pay: PayMode): { amount: number | null; unit: string } {
  if (pay === "full") {
    if (showAs === "payment") return { amount: f.wholeFull, unit: "once, in full" };
    if (showAs === "week") {
      const perWeek =
        f.fullRate !== null && f.visitsPerWeek !== null ? f.fullRate * f.visitsPerWeek : null;
      return { amount: perWeek, unit: "a week, paid in full" };
    }
    return { amount: f.fullRate, unit: "a session, paid in full" };
  }
  if (showAs === "payment") return { amount: f.payment, unit: "every 4 weeks" };
  if (showAs === "week") return { amount: f.payment !== null ? f.payment / WEEKS_PER_PAYMENT : null, unit: "a week" };
  return { amount: f.rate, unit: "a session" };
}

/* ------------------------------------------------------------------ *
 * Across the lengths
 * ------------------------------------------------------------------ */

/**
 * True only when every longer package costs strictly less every 4 weeks than
 * the one before it. Nothing is claimed with fewer than two lengths, a
 * missing price, a package that doesn't add up, two packages of the same
 * length, or packages for different numbers of visits a week.
 */
export function lowersEveryPayment(headline: PackageTier[]): boolean {
  if (headline.length < 2) return false;
  const rows = headline.map(figuresFor);
  const pace = rows[0].visitsPerWeek;
  for (const r of rows) {
    if (r.priceMissing || !r.addsUp || r.payment === null) return false;
    if (r.visitsPerWeek === null || pace === null || Math.abs(r.visitsPerWeek - pace) > 1e-9) return false;
  }
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i].tier.months > rows[i - 1].tier.months)) return false;
    if (!(rows[i].payment! < rows[i - 1].payment!)) return false;
  }
  return true;
}

export interface StepRow {
  key: string;
  label: string;
  months: number;
  /** Each 4-weekly payment; null when the package has no price. */
  amount: number | null;
  /** 0–1 of the tallest bar, for drawing. 0 when there is no amount. */
  share: number;
}

/** The "every 4 weeks" steps: one bar per headline package. */
export function steps(headline: PackageTier[]): StepRow[] {
  const rows = headline.map((t) => ({
    key: t.key,
    label: t.label,
    months: t.months,
    amount: figuresFor(t).payment,
  }));
  const max = Math.max(0, ...rows.map((r) => r.amount ?? 0));
  return rows.map((r) => ({ ...r, share: max > 0 && r.amount !== null ? r.amount / max : 0 }));
}

/**
 * The Academy's first money fallback, worked out from this table: "our lowest
 * monthly rate … in exchange for our lowest commitment" (consultation script,
 * price commitments). The lowest per-session rate among the lengths, applied
 * to the shortest one. For the trainer notes only (AJ, Sep 24: the money
 * fallbacks are trainer notes). Null when the shortest length already has
 * the lowest rate, or prices are missing.
 */
export interface LowestRateOffer {
  /** The package whose rate it is ("Life Transformed"). */
  rateFrom: PackageTier;
  /** The commitment it is offered on ("The Trial"). */
  on: PackageTier;
  rate: number;
  payment: number;
  total: number;
}

export function lowestRateOnShortest(headline: PackageTier[]): LowestRateOffer | null {
  if (headline.length < 2) return null;
  const rows = headline.map(figuresFor);
  if (rows.some((r) => r.rate === null)) return null;
  const shortest = rows[0];
  const lowest = rows.reduce((a, b) => (b.rate! < a.rate! ? b : a));
  if (!(lowest.rate! < shortest.rate!)) return null;
  return {
    rateFrom: lowest.tier,
    on: shortest.tier,
    rate: lowest.rate!,
    payment: lowest.rate! * shortest.sessionsPerPayment,
    total: lowest.rate! * shortest.tier.sessions,
  };
}

/* ------------------------------------------------------------------ *
 * Life happens
 * ------------------------------------------------------------------ */

/**
 * Whole weeks for this many sessions at this pace, a part week counted as a
 * week. The epsilon keeps floating-point noise (24.000000000000004) from
 * adding a week that is not there.
 */
export function weeksFor(sessions: number, perWeek: number): number {
  return Math.ceil(sessions / perWeek - 1e-9);
}

export function clampWeeksAway(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WEEKS_AWAY, Math.max(0, Math.round(n)));
}

export interface Stretch {
  weeksAway: number;
  /** Weeks of training the sessions take at the package's own pace. */
  trainingWeeks: number;
  /** trainingWeeks + weeksAway. */
  totalWeeks: number;
  /** payments × 4: the week the payments end. */
  billingWeeks: number;
  /** Which of the totalWeeks are away, spread evenly, 0-based. */
  awayWeeks: number[];
}

/**
 * How time away stretches the package. A session is used only by coming in
 * or by cancelling inside 24 hours (AJ, Sep 24 2026), and sessions never
 * expire (AJ, same day), so a week away moves the last session a week
 * later. Null when the package's pace cannot be worked out.
 */
export function stretch(tier: PackageTier, weeksAway: number): Stretch | null {
  const vpw = visitsPerWeek(tier);
  if (!vpw) return null;
  const away = clampWeeksAway(weeksAway);
  const trainingWeeks = weeksFor(tier.sessions, vpw);
  const totalWeeks = trainingWeeks + away;
  const awayWeeks: number[] = [];
  for (let a = 0; a < away; a++) awayWeeks.push(Math.floor(((a + 0.5) * totalWeeks) / away));
  return {
    weeksAway: away,
    trainingWeeks,
    totalWeeks,
    billingWeeks: tier.payments * WEEKS_PER_PAYMENT,
    awayWeeks,
  };
}

/* ------------------------------------------------------------------ *
 * The dots
 * ------------------------------------------------------------------ */

/**
 * One small grid per payment (four weeks across, the visits a week down), one
 * dot per session, while that stays countable. Null for a table that doesn't
 * divide evenly; the screen says it in words instead.
 */
export function dotGroups(tier: PackageTier): { groups: number; perGroup: number; rows: number } | null {
  const spp = sessionsPerPayment(tier);
  if (!Number.isInteger(spp) || spp < 1 || spp > MAX_DOTS_PER_GROUP) return null;
  if (!Number.isInteger(tier.payments) || tier.payments < 1 || tier.payments > MAX_DOT_GROUPS) return null;
  return { groups: tier.payments, perGroup: spp, rows: Math.ceil(spp / WEEKS_PER_PAYMENT) };
}

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

/** The first word of a full name, for "Sam's recommendation". Never cut short. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first : null;
}

/** "Sam's recommendation"; "Your trainer's recommendation" when there is no name. */
export function recommendationLabel(trainerFullName: string | null | undefined): string {
  const first = firstNameOf(trainerFullName);
  return first ? `${first}’s recommendation` : "Your trainer’s recommendation";
}
