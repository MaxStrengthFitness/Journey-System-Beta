/**
 * RENEWALS — the options conversation: the studio's own package table applied
 * to one client.
 *
 * AJ, Sep 10 2026: price is the top reason clients leave; 18 months scares
 * people who "just want to be healthy, not a body builder"; and 18 months is
 * what the studio needs most. So this answers, from the studio's own numbers:
 *   - what each package costs per session, per payment and in total;
 *   - "can I afford a bigger commitment?" — a longer package LOWERS every
 *     payment ($480 -> $432 on the website's table);
 *   - whether a package fits the client's real habit (at 1.5 visits a week,
 *     every package banks sessions — the Brief says so honestly).
 *
 * An upgrade is only suggested when the evidence supports it: consistent
 * attendance, visible progress, and nothing that makes it the wrong moment
 * (a rough patch, a Red check-in, an autopay problem). No pressure copy —
 * information for a conversation between people.
 */

import type { PackageTier, RenewalSettings, RenewalSnapshot } from "./types";

export interface PackageOption {
  tier: PackageTier;
  isCurrent: boolean;
  /** vs the client's current package, per session. Negative = cheaper. */
  perSessionDiff: number | null;
  /** vs the client's current package, per 4-weekly payment. Negative = less. */
  paymentDiff: number | null;
  totalMonthly: number;
  totalPrepaid: number;
  /** The whole package bought at this rate instead of the current one. */
  savingsVsCurrent: number | null;
  /** Paying in full instead of monthly. */
  prepaySavings: number;
  /** How the package fits the client's pace, when known. */
  fitNote: string | null;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "About 64 weeks" of use at this pace, against the weeks it bills for. */
export function fitNote(tier: PackageTier, pacePerWeek: number | null): string | null {
  if (pacePerWeek === null || pacePerWeek <= 0) return null;
  const weeksToUse = Math.round(tier.sessions / pacePerWeek);
  const billingWeeks = tier.payments * 4;
  const pace = Number.isInteger(pacePerWeek) ? String(pacePerWeek) : String(pacePerWeek);
  if (weeksToUse >= billingWeeks + 4) {
    return `At ${pace}× a week, ${tier.sessions} sessions last about ${weeksToUse} weeks — ${weeksToUse - billingWeeks} past its ${billingWeeks} weeks of billing.`;
  }
  if (weeksToUse <= billingWeeks - 4) {
    return `At ${pace}× a week, ${tier.sessions} sessions last about ${weeksToUse} weeks — they'd run out ${billingWeeks - weeksToUse} weeks before billing ends.`;
  }
  return `At ${pace}× a week, ${tier.sessions} sessions fit its ${billingWeeks} weeks of billing.`;
}

export function optionsFor(
  settings: RenewalSettings,
  currentKey: string | null,
  pacePerWeek: number | null,
): PackageOption[] {
  const current = settings.packages.find((p) => p.key === currentKey) ?? null;
  return [...settings.packages]
    .sort((a, b) => a.months - b.months || a.sessions - b.sessions)
    .map((tier) => {
      const isCurrent = tier.key === currentKey;
      const perSessionDiff = current ? money(tier.ratePerSession - current.ratePerSession) : null;
      const paymentDiff = current ? money(tier.paymentAmount - current.paymentAmount) : null;
      const savingsVsCurrent =
        current && !isCurrent ? money(tier.sessions * (current.ratePerSession - tier.ratePerSession)) : null;
      return {
        tier,
        isCurrent,
        perSessionDiff,
        paymentDiff,
        totalMonthly: money(tier.sessions * tier.ratePerSession),
        totalPrepaid: money(tier.sessions * tier.prepayRatePerSession),
        savingsVsCurrent,
        prepaySavings: money(tier.sessions * (tier.ratePerSession - tier.prepayRatePerSession)),
        fitNote: fitNote(tier, pacePerWeek),
      };
    });
}

/** Share of observed weeks with a visit that reads as "consistent". */
export const CONSISTENT_SHARE = 0.75;
/** ...measured over at least this many weeks. */
export const CONSISTENT_MIN_WEEKS = 8;
/** "Progress is visible": at least half the tracked machines are up. */
export const PROGRESS_SHARE = 0.5;

const BLOCKING_FLAGS = new Set(["rough-patch", "check-in-red", "autopay-suspended", "missed-sessions"]);

export interface UpgradeVerdict {
  candidate: boolean;
  /** The evidence for, in words. */
  reasons: string[];
  /** Why not now, in words. Empty when it's a candidate. */
  blockers: string[];
}

export function upgradeVerdict(s: RenewalSnapshot, settings: RenewalSettings): UpgradeVerdict {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const current = settings.packages.find((p) => p.key === s.packageKey) ?? null;
  const longer = current
    ? settings.packages.some((p) => p.months > current.months)
    : false;

  if (!current) blockers.push("The current package isn't known.");
  else if (!longer) blockers.push(`${current.label} is already the longest package.`);
  if (s.situation === "lapsed" || s.situation === "away" || s.situation === "unknown") {
    blockers.push("Not while they're away, lapsed or missing Mindbody data.");
  }

  const p = s.proof;
  if (p.weeksAttended !== null && p.weeksObserved !== null && p.weeksObserved >= CONSISTENT_MIN_WEEKS) {
    if (p.weeksAttended / p.weeksObserved >= CONSISTENT_SHARE) {
      reasons.push(`Trained in ${p.weeksAttended} of the last ${p.weeksObserved} weeks.`);
    } else {
      blockers.push(`Attendance is patchy: ${p.weeksAttended} of the last ${p.weeksObserved} weeks.`);
    }
  } else {
    blockers.push("Not enough weeks on record to call attendance consistent.");
  }

  const strength =
    p.machinesImproved !== null && p.machinesTracked !== null && p.machinesTracked > 0
      ? p.machinesImproved / p.machinesTracked >= PROGRESS_SHARE
      : false;
  const body = p.inbody ? p.inbody.muscleLbChange > 0 || p.inbody.bodyFatPctChange < 0 : false;
  if (strength) reasons.push(`Stronger on ${p.machinesImproved} of ${p.machinesTracked} machines.`);
  if (body && p.inbody) {
    const bits = [
      p.inbody.muscleLbChange > 0 ? `muscle up ${Math.round(p.inbody.muscleLbChange * 10) / 10} lb` : null,
      p.inbody.bodyFatPctChange < 0 ? `body fat down ${Math.abs(Math.round(p.inbody.bodyFatPctChange * 10) / 10)} points` : null,
    ].filter(Boolean);
    reasons.push(`InBody: ${bits.join(", ")}.`);
  }
  if (!strength && !body) blockers.push("Progress isn't visible in the data yet.");

  for (const f of s.flags) if (BLOCKING_FLAGS.has(f.code)) blockers.push(f.text);

  return { candidate: blockers.length === 0, reasons, blockers };
}
