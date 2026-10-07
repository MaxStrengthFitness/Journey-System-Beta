/**
 * RENEWALS — the projection, the session ledger, the rate and the smaller
 * retention signals: the pure pieces of snapshot version 3 (the renewals
 * dashboard, Oct 7 2026). engine.ts calls them; nothing here imports Firebase
 * or engine.ts, so the nightly job and the browser run the same code.
 *
 * AJ's ask (Oct 6-7 2026): a leader must be AHEAD of the renewal, so the
 * dashboard shows, per client, the exact sessions left including what rolled
 * over and what was given or won, and how many will still be left on the day
 * the commitment ends. Sessions never expire; a 12-month, 96-session contract
 * can take 14 months.
 *
 * THE RULES THIS FILE KEEPS
 *   - Never a second balance. Sessions left is Mindbody's number (engine.ts,
 *     `sessionsLeft`); the ledger only says where its parts came from, and
 *     its total IS sessions left.
 *   - The projection is the old "banked at the charge" carried to the
 *     commitment's end. Booked days come off first ONLY while Mindbody's
 *     remaining still counts them (`MINDBODY_REMAINING_INCLUDES_BOOKED`); as
 *     shipped it doesn't subtract them, so it is the version-2 arithmetic to
 *     the session.
 *   - Below the pace's minimum sample (21 observed days) there is no
 *     projection, only "Not enough to project yet".
 *   - Away time ahead uses no sessions.
 */

import { addDays, daysBetween } from "../client-history/model";
import { sessionsPerPayment, type PackageNameIndex } from "./settings";
import type { MindbodyContract, MindbodyService } from "../../types";
import type { PackageTier, RenewalProjection, RenewalRate, RetentionSignals } from "./types";

/* ------------------------------------------------------------------ *
 * Constants, each with its reason
 * ------------------------------------------------------------------ */

/** Below 3 weeks of observable time there is no pace yet, only a guess. */
export const MIN_PACE_WINDOW_DAYS = 21;
/**
 * Bookings count only this far ahead: the nightly job and the live read both
 * read 30 days of bookings, so both see the same ones.
 */
export const BOOKING_LOOKAHEAD_DAYS = 30;
/** The projection's range comes from 4-week paces... */
export const RANGE_WINDOW_DAYS = 28;
/** ...ending today and each week back for 8 weeks (inside the 90 days the job reads). */
export const RANGE_WINDOWS = 9;
/** "Coming less" compares the last 4 weeks... */
export const TREND_RECENT_DAYS = 28;
/** ...with the 8 weeks before them. */
export const TREND_PRIOR_DAYS = 56;
/** A change of at least a quarter of the earlier pace... */
export const TREND_SHARE = 0.25;
/** ...and at least half a visit a week, so 1 against 1.25 is "steady". */
export const TREND_MIN_DIFF = 0.5;
/**
 * Whether Mindbody's "remaining" on a pricing option has already taken off
 * the visits booked ahead (true: it has, so booked days must NOT come off a
 * second time). The design AJ approved (Oct 7 2026) subtracts the bookings,
 * which is right only if Mindbody doesn't. Mindbody most likely takes a
 * session off at booking, and taking them off again would count each
 * regular's standing bookings twice and move numbers that already exist
 * (banked at the charge, the run-out day, Running low's order). So it ships
 * TRUE, the version-2 arithmetic, until one real client is checked: a
 * Strongsville regular's Remaining against their future booked visits
 * (docs/rounds/2026-10-07-renewals-dashboard.md). Set it to false only if
 * Remaining still counts the booked visits.
 */
export const MINDBODY_REMAINING_INCLUDES_BOOKED = true;

/* ------------------------------------------------------------------ *
 * Away time
 * ------------------------------------------------------------------ */

export interface AwayRange {
  from: string;
  to: string;
  reason: string;
}

export function isAwayOn(day: string, ranges: readonly AwayRange[]): boolean {
  return ranges.some((r) => r.from <= day && day <= r.to);
}

/** Days in [from, to] covered by away time. */
export function awayDaysBetween(from: string, to: string, ranges: readonly AwayRange[]): number {
  if (ranges.length === 0 || from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isAwayOn(d, ranges)) n++;
  return n;
}

/* ------------------------------------------------------------------ *
 * Pace over a window
 * ------------------------------------------------------------------ */

/** To the nearest quarter: nobody's habit is known to two decimal places. */
export function quarter(n: number): number {
  return Math.round(n * 4) / 4;
}

/**
 * Sessions used a week over [from, to] (both included), away days left out.
 * Null below the minimum observed days. `used` is visit days plus late
 * cancels (engine.ts: a late cancel takes a session without being a visit).
 */
export function paceBetween(
  used: ReadonlySet<string>,
  from: string,
  to: string,
  away: readonly AwayRange[],
  minObserved = MIN_PACE_WINDOW_DAYS,
): number | null {
  if (from > to) return null;
  const observed = daysBetween(from, to) + 1 - awayDaysBetween(from, to, away);
  if (observed < minObserved) return null;
  let visits = 0;
  for (const d of used) if (d >= from && d <= to) visits++;
  return quarter(visits / (observed / 7));
}

/**
 * The client's slowest and fastest 4-week pace: windows of 28 days ending
 * today and each week back, never before `floor` (the pace window's own
 * floor: the first synced booking, and the package's start). Null with fewer
 * than two windows that clear the minimum sample: one window is no range.
 */
export function paceRange(params: {
  used: ReadonlySet<string>;
  today: string;
  floor: string | null;
  away: readonly AwayRange[];
}): { slowest: number; fastest: number } | null {
  const { used, today, floor, away } = params;
  if (!floor) return null;
  const paces: number[] = [];
  for (let k = 0; k < RANGE_WINDOWS; k++) {
    const to = addDays(today, -7 * k);
    if (to < floor) break;
    const from0 = addDays(to, -(RANGE_WINDOW_DAYS - 1));
    const p = paceBetween(used, from0 > floor ? from0 : floor, to, away);
    if (p !== null) paces.push(p);
  }
  if (paces.length < 2) return null;
  return { slowest: Math.min(...paces), fastest: Math.max(...paces) };
}

/* ------------------------------------------------------------------ *
 * Bookings ahead and the run-out day
 * ------------------------------------------------------------------ */

/**
 * The distinct days booked from today to `until` (and never past the
 * bookings' read horizon), soonest first, that still have to come off
 * sessions left. Empty while Mindbody's remaining has already taken them off
 * (`MINDBODY_REMAINING_INCLUDES_BOOKED`, the default; tests pass the other
 * answer to check the arithmetic for the day it is flipped).
 */
export function bookedDaysAhead(
  rows: ReadonlyArray<{ day: string; kind: string }>,
  today: string,
  until: string | null,
  remainingIncludesBooked: boolean = MINDBODY_REMAINING_INCLUDES_BOOKED,
): string[] {
  if (remainingIncludesBooked) return [];
  const horizon = addDays(today, BOOKING_LOOKAHEAD_DAYS);
  const last = until && until < horizon ? until : horizon;
  return Array.from(
    new Set(rows.filter((r) => r.kind === "booked" && r.day >= today && r.day <= last).map((r) => r.day)),
  ).sort();
}

/**
 * When the sessions run out: the booked days use them first, then the pace
 * from the last booked day, pushed past away time. Null without a pace (or a
 * pace of nothing). With nothing booked it is the old arithmetic exactly.
 */
export function runOutDay(params: {
  sessionsLeft: number | null;
  booked: readonly string[];
  pacePerWeek: number | null;
  today: string;
  away: readonly AwayRange[];
}): string | null {
  const { sessionsLeft, booked, pacePerWeek, today, away } = params;
  if (sessionsLeft === null || pacePerWeek === null || pacePerWeek <= 0) return null;
  if (sessionsLeft <= 0) return today;
  if (sessionsLeft <= booked.length) return booked[sessionsLeft - 1];
  const start = booked.length > 0 ? booked[booked.length - 1] : today;
  let date = addDays(start, Math.ceil(((sessionsLeft - booked.length) / pacePerWeek) * 7));
  // Away time ahead uses no sessions: push the date past it.
  date = addDays(date, awayDaysBetween(start, date, away));
  return date;
}

/* ------------------------------------------------------------------ *
 * The projection at the commitment's end
 * ------------------------------------------------------------------ */

export function projectAtEnd(params: {
  sessionsLeft: number;
  endsOn: string;
  endsOnSource: "mindbody" | "estimate";
  today: string;
  /** Booked days from today, soonest first; those past the end are left out here. */
  booked: readonly string[];
  pacePerWeek: number | null;
  range: { slowest: number; fastest: number } | null;
  away: readonly AwayRange[];
  runOutDate: string | null;
}): RenewalProjection {
  const { sessionsLeft, endsOn, endsOnSource, today, pacePerWeek, range, away, runOutDate } = params;
  const booked = params.booked.filter((d) => d <= endsOn);
  const bookedThrough = booked.length > 0 ? booked[booked.length - 1] : null;
  const paceStart = bookedThrough ?? today;
  // The old "banked at the charge" counted daysBetween(today, end) less the
  // away days in [today, end]; from the last booked day it is the same.
  const days = Math.max(0, daysBetween(paceStart, endsOn) - awayDaysBetween(paceStart, endsOn, away));
  const weeks = days / 7;
  const left = (perWeek: number) => Math.max(0, Math.round(sessionsLeft - booked.length - perWeek * weeks));
  const leftAtEnd = pacePerWeek === null ? null : left(pacePerWeek);
  let low = leftAtEnd;
  let high = leftAtEnd;
  if (leftAtEnd !== null && range) {
    low = Math.min(leftAtEnd, left(range.fastest));
    high = Math.max(leftAtEnd, left(range.slowest));
  }
  return {
    endsOn,
    endsOnSource,
    booked: booked.length,
    bookedThrough,
    // Only with a pace to multiply it by: without one it would change every
    // night and rewrite a snapshot that otherwise says the same thing.
    paceWeeks: pacePerWeek === null ? null : Math.round(weeks * 10) / 10,
    pacePerWeek,
    leftAtEnd,
    leftAtEndLow: low,
    leftAtEndHigh: high,
    runOutDate: leftAtEnd !== null && runOutDate && runOutDate < endsOn ? runOutDate : null,
  };
}

/* ------------------------------------------------------------------ *
 * The session ledger
 * ------------------------------------------------------------------ */

/**
 * Sessions on hand, by where they came from. A pricing option's day is its
 * active date (else its payment date): one bought before `refStart` (the
 * current contract's start) was carried in — rolled over. Extra-sessions
 * names (complimentary, won) are their own part. Exactly the options
 * `sessionBalance` counts in `onHand`, so the parts add up to it.
 */
export function ledgerParts(
  services: Record<string, MindbodyService> | undefined,
  index: PackageNameIndex,
  refStart: string | null,
  dayOf: (v: unknown) => string | null,
): { carriedIn: number; thisContract: number; extra: number } {
  let carriedIn = 0;
  let thisContract = 0;
  let extra = 0;
  for (const s of Object.values(services ?? {})) {
    if (!s) continue;
    const remaining = typeof s.remaining === "number" && s.remaining > 0 ? s.remaining : 0;
    if (remaining === 0) continue;
    const tier = index.tierFor(s.name);
    if (!tier) {
      if (index.isExtraSessions(s.name)) extra += remaining;
      continue;
    }
    const day = dayOf(s.activeDate) ?? dayOf(s.paymentDate);
    if (refStart && day && day < refStart) carriedIn += remaining;
    else thisContract += remaining;
  }
  return { carriedIn, thisContract, extra };
}

/**
 * Did Mindbody issue the running contract's whole package up front, on one
 * pricing option bought under it (its count at least the package's
 * sessions, its day on or after the contract's start)? Then the payments
 * still to come are already on hand, and sessions left is what's on hand:
 * adding a payment's sessions for each one would count them twice. Most
 * monthly contracts issue a payment's worth at a time, and this is false.
 * An option with no day, or a contract with no start, is never assumed to
 * be up front.
 */
export function issuedUpFront(
  services: Record<string, MindbodyService> | undefined,
  index: PackageNameIndex,
  contractStart: string | null,
  tier: PackageTier,
  dayOf: (v: unknown) => string | null,
): boolean {
  if (!contractStart) return false;
  return Object.values(services ?? {}).some((s) => {
    if (!s || !(typeof s.count === "number" && s.count >= tier.sessions)) return false;
    if (index.tierFor(s.name)?.key !== tier.key) return false;
    const day = dayOf(s.activeDate) ?? dayOf(s.paymentDate);
    return day !== null && day >= contractStart;
  });
}

/* ------------------------------------------------------------------ *
 * The rate
 * ------------------------------------------------------------------ */

/** A payment differing from the package table's by at least this much is a special rate. */
export const SPECIAL_RATE_MIN_DIFF = 1;
/**
 * Mindbody's charge sets the rate only when at least this many scheduled
 * charges agree on it and no other amount is as common: one odd charge (a
 * prorated first one, a fee) never makes a client "special".
 */
export const RATE_MIN_AGREEING_CHARGES = 2;

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What the client pays. A monthly contract with Mindbody's scheduled
 * charges on file: the amount most of them charge, when at least two agree
 * and no other amount is as common (a first, prorated charge doesn't set
 * the rate; a tie is no evidence), split into sessions by the package;
 * "special" when
 * it differs from the package table's payment (AJ, Oct 7 2026: "i believe
 * so, we will say yes for now" — a 6-month commitment at the 18-month rate).
 * Otherwise the package table's rate: paid in full at the prepay rate.
 */
export function rateOf(params: {
  contract: MindbodyContract | null;
  tier: PackageTier | null;
  paymentMode: "monthly" | "prepaid" | "sessions-only" | null;
}): RenewalRate | null {
  const { contract, tier, paymentMode } = params;
  if (paymentMode === "monthly" && contract) {
    const amounts = (contract.upcomingAutopayEvents ?? [])
      .map((e) => e?.chargeAmount)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
    const counts = new Map<number, number>();
    for (const a of amounts) counts.set(cents(a), (counts.get(cents(a)) ?? 0) + 1);
    const ranked = Array.from(counts.entries()).sort((x, y) => y[1] - x[1]);
    const top = ranked[0];
    // Fewer than two agreeing charges, or a tie, would let the stored order
    // decide the rate: fall back to the package's instead.
    const clear =
      top !== undefined && top[1] >= RATE_MIN_AGREEING_CHARGES && (ranked.length < 2 || ranked[1][1] < top[1]);
    if (clear) {
      const payment = top[0];
      return {
        perSession: tier ? cents(payment / sessionsPerPayment(tier)) : null,
        payment: cents(payment),
        source: "mindbody",
        packageRate: tier ? tier.ratePerSession : null,
        special: tier ? Math.abs(payment - tier.paymentAmount) >= SPECIAL_RATE_MIN_DIFF : false,
      };
    }
  }
  if (!tier) return null;
  if (paymentMode === "prepaid") {
    return {
      perSession: tier.prepayRatePerSession,
      payment: null,
      source: "package",
      packageRate: tier.prepayRatePerSession,
      special: false,
    };
  }
  return {
    perSession: tier.ratePerSession,
    payment: tier.paymentAmount,
    source: "package",
    packageRate: tier.ratePerSession,
    special: false,
  };
}

/* ------------------------------------------------------------------ *
 * The smaller signals
 * ------------------------------------------------------------------ */

/** Recent against prior, in one word. */
export function paceTrendOf(recent: number | null, prior: number | null): RetentionSignals["paceTrend"] {
  if (recent === null || prior === null) return null;
  const diff = recent - prior;
  if (Math.abs(diff) < TREND_MIN_DIFF) return "steady";
  if (recent <= prior * (1 - TREND_SHARE)) return "down";
  if (recent >= prior * (1 + TREND_SHARE)) return "up";
  return "steady";
}

/**
 * The last 4 weeks and the 8 before them, never reaching before `floor`
 * (the first synced booking, or the client's first package, whichever is
 * later): a new client's weeks before they joined are not "coming less".
 */
export function paceTrendWindows(params: {
  used: ReadonlySet<string>;
  today: string;
  floor: string | null;
  away: readonly AwayRange[];
}): { recent: number | null; prior: number | null } {
  const { used, today, floor, away } = params;
  if (!floor || floor > today) return { recent: null, prior: null };
  const clip = (d: string) => (d < floor ? floor : d);
  const recentFrom = addDays(today, -(TREND_RECENT_DAYS - 1));
  const priorTo = addDays(recentFrom, -1);
  const priorFrom = addDays(recentFrom, -TREND_PRIOR_DAYS);
  return {
    recent: paceBetween(used, clip(recentFrom), today, away),
    prior: priorTo < floor ? null : paceBetween(used, clip(priorFrom), priorTo, away),
  };
}

/**
 * Another package fits the pace better only when its sessions a week are
 * closer to the pace than the current package's by at least this much: a
 * quarter of a session a week, the precision a pace is known to.
 */
export const SUGGEST_MIN_BETTER = 0.25;

/**
 * The package whose sessions a week (sessions ÷ its weeks of billing) fit
 * the client's pace clearly better than the one they are on, else the one
 * they are on. Null without a pace, and null when the current package isn't
 * known: with nothing to compare against, any answer would be a confident,
 * made-up upsell, and a confident wrong claim is worse than none. At Max
 * Strength every package is 2 a week, so this is the current package unless
 * a studio sells another rhythm; how a package fits the pace is said by
 * options.ts `fitNote`.
 */
export function suggestPackage(
  packages: readonly PackageTier[],
  pacePerWeek: number | null,
  currentKey: string | null,
): string | null {
  if (pacePerWeek === null || pacePerWeek <= 0 || packages.length === 0) return null;
  const current = currentKey ? packages.find((t) => t.key === currentKey) : undefined;
  if (!current) return null;
  const miss = (t: PackageTier) => Math.abs(t.sessions / Math.max(1, t.payments * 4) - pacePerWeek);
  let best = current;
  for (const t of packages) {
    if (t.key === current.key) continue;
    if (miss(current) - miss(t) >= SUGGEST_MIN_BETTER - 1e-9 && miss(t) < miss(best)) best = t;
  }
  return best.key;
}
