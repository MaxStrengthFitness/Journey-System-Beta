/**
 * RENEWALS — how a package's story ends, the pure half.
 *
 * The nightly job (server/renewals-job.ts) records an outcome on the renewal
 * cycle (studios/{s}/renewals/{cycleKey}) when it can tell from Mindbody:
 *
 *   renewed / upgraded / downgraded
 *     a newer package appeared — already on the books while the current one
 *     runs, or in its place since last night. Longer commitment: upgraded;
 *     shorter: downgraded; the same length: renewed.
 *   lost
 *     the studio's lost rule fired (no new package, no visits, for the
 *     studio's number of days past the end). Undone by the job if the client
 *     comes back on the same package.
 *
 * Pay-as-you-go is a leader's call, made in the Renewal Brief: from Mindbody
 * alone the job can't tell single sessions from a package the studio hasn't
 * matched in its settings, and a wrong "pay-as-you-go" would quietly count a
 * renewal as something else.
 *
 * A leader's outcome is never overwritten by the job.
 */

import { addDays, daysBetween } from "../client-history/model";
import { LAPSED_LOOKBACK_DAYS } from "./pipeline";
import type { RenewalCycle, RenewalOutcome, RenewalSettings, RenewalSnapshot } from "./types";

/** A cycle key is a Firestore document id (see isUsableCycleKey in useRenewalCycle.ts). */
export const CYCLE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

/** Without two start dates to compare, a package change only counts this close to the old one's end. */
export const SUCCESSOR_WINDOW_DAYS = 60;

export const OUTCOMES: { key: RenewalOutcome; label: string }[] = [
  { key: "renewed", label: "Renewed" },
  { key: "upgraded", label: "Upgraded" },
  { key: "downgraded", label: "Downgraded" },
  { key: "pay-as-you-go", label: "Pay-as-you-go" },
  { key: "lost", label: "Lost" },
];

export function outcomeLabel(o: RenewalOutcome | null | undefined): string {
  return OUTCOMES.find((x) => x.key === o)?.label ?? "Not recorded";
}

/** Renewed, upgraded or downgraded, by the two packages' commitment lengths. */
export function renewalKind(
  settings: RenewalSettings,
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
): "renewed" | "upgraded" | "downgraded" {
  const from = settings.packages.find((p) => p.key === fromKey);
  const to = settings.packages.find((p) => p.key === toKey);
  if (!from || !to || from.months === to.months) return "renewed";
  return to.months > from.months ? "upgraded" : "downgraded";
}

/**
 * The day a package closed, for "outcomes this quarter": the day it ended,
 * or today when it closed early (a renewal signed before the old one ran out).
 */
export function closedOnFor(s: Pick<RenewalSnapshot, "focusDate"> | null | undefined, today: string): string {
  const f = s?.focusDate;
  return f && f < today ? f : today;
}

/**
 * Is `next` the package that followed `stored`, or has the engine merely
 * changed its mind about which contract is current (new data arriving)?
 */
export function isSuccessor(stored: RenewalSnapshot, next: RenewalSnapshot, today: string): boolean {
  if (!stored.cycleKey || !next.cycleKey || stored.cycleKey === next.cycleKey) return false;
  if (stored.billingStart && next.billingStart) return next.billingStart > stored.billingStart;
  return Boolean(next.packageKey && stored.focusDate && stored.focusDate <= addDays(today, SUCCESSOR_WINDOW_DAYS));
}

export interface OutcomeCandidate {
  /** The cycle the outcome belongs to: the package that closed. */
  cycleKey: string;
  /** Null: take back the job's own "lost" (they came back). */
  outcome: RenewalOutcome | null;
  packageKey: string | null;
  nextCycleKey: string | null;
  nextPackageKey: string | null;
  closedOn: string | null;
}

/**
 * What tonight's snapshot says about how a package ended, if anything.
 * `stored` is the snapshot written last time; `next` is tonight's.
 */
export function outcomeCandidate(args: {
  stored: RenewalSnapshot | null | undefined;
  next: RenewalSnapshot;
  settings: RenewalSettings;
  today: string;
}): OutcomeCandidate | null {
  const { stored, next, settings, today } = args;
  const onTheBooks = next.renewalOnBooks ?? null;

  // 1. The next package is already signed while this one runs.
  if (next.cycleKey && onTheBooks && onTheBooks.cycleKey !== next.cycleKey) {
    return {
      cycleKey: next.cycleKey,
      outcome: renewalKind(settings, next.packageKey, onTheBooks.packageKey),
      packageKey: next.packageKey,
      nextCycleKey: onTheBooks.cycleKey,
      nextPackageKey: onTheBooks.packageKey,
      closedOn: closedOnFor(next, today),
    };
  }

  // 2. A new package took over since last night.
  if (stored && isSuccessor(stored, next, today)) {
    return {
      cycleKey: stored.cycleKey as string,
      outcome: renewalKind(settings, stored.packageKey, next.packageKey),
      packageKey: stored.packageKey,
      nextCycleKey: next.cycleKey,
      nextPackageKey: next.packageKey,
      closedOn: closedOnFor(stored, today),
    };
  }

  // 3. The studio's lost rule fired. Older than the pipeline's lapsed list is
  //    history from before this tool, and is left alone.
  if (
    next.cycleKey &&
    next.situation === "lapsed" &&
    next.focusDate &&
    daysBetween(next.focusDate, today) <= LAPSED_LOOKBACK_DAYS
  ) {
    return {
      cycleKey: next.cycleKey,
      outcome: "lost",
      packageKey: next.packageKey,
      nextCycleKey: null,
      nextPackageKey: null,
      closedOn: next.focusDate,
    };
  }

  // 4. Back from lapsed on the same package: they weren't lost after all.
  if (
    stored?.situation === "lapsed" &&
    next.situation !== "lapsed" &&
    next.situation !== "unknown" &&
    stored.cycleKey &&
    stored.cycleKey === next.cycleKey
  ) {
    return {
      cycleKey: next.cycleKey,
      outcome: null,
      packageKey: next.packageKey,
      nextCycleKey: null,
      nextPackageKey: null,
      closedOn: null,
    };
  }

  return null;
}

/** Fields the job sets on a cycle when it records an outcome (plus outcomeAt, set by the writer). */
export interface OutcomePatch {
  outcome: RenewalOutcome | null;
  outcomeBy: "job" | null;
  nextCycleKey: string | null;
  nextPackageKey: string | null;
  closedOn: string | null;
}

/**
 * What to write, given what the cycle already says. Null: leave it alone —
 * a leader's outcome, an unchanged one, or nothing to take back.
 */
export function outcomePatch(
  c: OutcomeCandidate,
  existing: Pick<RenewalCycle, "outcome" | "outcomeBy" | "nextCycleKey"> | null | undefined,
): OutcomePatch | null {
  const has = Boolean(existing?.outcome);
  if (has && existing?.outcomeBy !== "job") return null;
  if (c.outcome === null) {
    // Only ever undo the job's own "lost".
    if (!has || existing?.outcome !== "lost") return null;
    return { outcome: null, outcomeBy: null, nextCycleKey: null, nextPackageKey: null, closedOn: null };
  }
  // Same story as already recorded: keep the first closing date rather than
  // move it night to night.
  if (existing?.outcome === c.outcome && (existing?.nextCycleKey ?? null) === c.nextCycleKey) return null;
  return {
    outcome: c.outcome,
    outcomeBy: "job",
    nextCycleKey: c.nextCycleKey,
    nextPackageKey: c.nextPackageKey,
    closedOn: c.closedOn,
  };
}
