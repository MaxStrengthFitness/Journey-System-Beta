/**
 * WHAT A CLIENT DID BEFORE JOURNEY.
 *
 * Journey is not a fresh start. The original studio has been open for over
 * twelve years, longer than the FileMaker system it is replacing, and the
 * rollout is a migration measured in months: during it, a studio's roster is a
 * mix of brand-new clients, clients with fifty sessions behind them and
 * clients with several hundred. Read
 * `docs/business/migration-and-prior-history.md` before changing anything
 * here.
 *
 * The rule the whole app inherits:
 *
 *   A client's history did not begin when Journey first saw them.
 *
 * An empty Journey history means "we have no detail here", never "this never
 * happened" — the "In Journey since" rule, generalised, because during
 * migration it is the common case rather than the edge case.
 *
 * WHY AN OFFSET RATHER THAN A MANUAL TOTAL
 * ----------------------------------------
 * The profile reconciles `client.sessionCount` against a live aggregation
 * count every time it opens. A trainer who typed a total was therefore
 * overwritten the next time anyone looked at that client: two writers, one
 * field, and the automatic one always won.
 *
 * So they are given different things to own, and can no longer collide. The
 * reconciler owns what Journey can SEE; this record owns what it cannot.
 *
 * PURE MODULE — no React, no Firestore.
 */

export type PriorHistorySource = "filemaker" | "paper" | "trainer-estimate" | "other";

export const PRIOR_SOURCE_LABEL: Record<PriorHistorySource, string> = {
  filemaker: "FileMaker",
  paper: "Paper records",
  "trainer-estimate": "Trainer's estimate",
  other: "Other",
};

/** How sure the number is, in the order a trainer would trust it. */
export const PRIOR_SOURCES: readonly PriorHistorySource[] = [
  "filemaker",
  "paper",
  "trainer-estimate",
  "other",
];

export interface PriorHistory {
  /**
   * Total completed sessions before the cutover, as recorded by a person.
   * NEVER changed by the app once set — it is what a human stated, and it is
   * what the screen quotes back to them.
   */
  sessions: number;
  /**
   * How many of those now ALSO exist as real session documents in Journey,
   * because a historical import created them. Starts at 0 and is raised only
   * by `recordImportedSessions`. See the arithmetic rule below.
   */
  importedCount?: number;
  /** First studio day the prior record covers (yyyy-mm-dd), when anyone knows. */
  from?: string | null;
  /** Last studio day it covers. Journey owns everything AFTER this day. */
  through: string;
  source: PriorHistorySource;
  /** Where the number came from, what it leaves out — in studio English. */
  note?: string | null;
  recordedAt?: unknown;
  recordedById?: string | null;
  recordedByName?: string | null;
}

/**
 * The part of the prior history that exists ONLY as a number.
 *
 * Anything imported has become a real row that Journey counts for itself, so
 * it is taken off here — otherwise every imported session would be counted
 * twice. Clamped at zero: an `importedCount` larger than the stated total
 * means somebody imported more than they said existed, and the honest answer
 * to "how many are we still missing" is none, not a negative.
 */
export function priorUncounted(prior: PriorHistory | null | undefined): number {
  if (!prior) return 0;
  const stated = Number.isFinite(prior.sessions) ? Math.max(0, Math.trunc(prior.sessions)) : 0;
  const imported = Number.isFinite(prior.importedCount ?? 0)
    ? Math.max(0, Math.trunc(prior.importedCount ?? 0))
    : 0;
  return Math.max(0, stated - imported);
}

/**
 * The number a trainer would say out loud.
 *
 * `journeyCount` is null when it could not be read — a quota cooldown, a
 * failed query. Unknown is never zero, so the total is unknown too, and the
 * caller leaves whatever it was showing alone.
 */
export function totalSessions(
  journeyCount: number | null | undefined,
  prior: PriorHistory | null | undefined,
): number | null {
  if (journeyCount === null || journeyCount === undefined || !Number.isFinite(journeyCount)) {
    return null;
  }
  return Math.max(0, Math.trunc(journeyCount)) + priorUncounted(prior);
}

/**
 * THE IMPORTER'S CONTRACT.
 *
 * An importer that writes `n` historical session documents must put the result
 * of this back on the client, or the total drifts by `n` for good. It is the
 * one place `importedCount` moves; `sessions` is left exactly as stated.
 */
export function recordImportedSessions(
  prior: PriorHistory,
  n: number,
): PriorHistory {
  const added = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return { ...prior, importedCount: Math.max(0, Math.trunc(prior.importedCount ?? 0)) + added };
}

/** Defensive: this arrives off a Firestore document and drives a number on screen. */
export function isPriorHistory(v: unknown): v is PriorHistory {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<PriorHistory>;
  if (typeof p.sessions !== "number" || !Number.isFinite(p.sessions) || p.sessions < 0) return false;
  if (typeof p.through !== "string" || !p.through) return false;
  if (typeof p.source !== "string" || !PRIOR_SOURCES.includes(p.source as PriorHistorySource)) {
    return false;
  }
  return true;
}

/** The record off a client document, or null when there isn't a usable one. */
export function priorHistoryOf(client: { priorHistory?: unknown } | null | undefined): PriorHistory | null {
  const raw = client?.priorHistory;
  return isPriorHistory(raw) ? raw : null;
}

/**
 * The sentence under the count.
 *
 * The split is not a footnote: it is the thing that stops a two-month trend
 * being read as a twelve-year client's whole story. Returns null when there is
 * nothing before Journey to declare.
 */
export function priorHistoryLabel(prior: PriorHistory | null | undefined): string | null {
  const uncounted = priorUncounted(prior);
  if (!prior || uncounted <= 0) return null;
  return `${uncounted} before Journey · ${PRIOR_SOURCE_LABEL[prior.source]}`;
}

/**
 * Whether Journey holds the client's WHOLE story.
 *
 * "complete" — everything they have ever done is in here, so a trend, a pace
 * or a "never tried" is safe. "partial" — there is history we only have as a
 * number. "unknown" — nobody has said either way, which during the migration
 * is the most common and most dangerous state: it looks exactly like a new
 * client. A screen that would make a claim about the client's whole history
 * should soften it on anything but "complete".
 */
export type HistoryCoverage = "complete" | "partial" | "unknown";

export interface CoverageInput {
  priorHistory?: unknown;
  historyIsComplete?: boolean;
  /**
   * The client's FIRST session in Journey, as a studio day (yyyy-mm-dd).
   * A string, not a Timestamp: this module stays pure, and a date-only key
   * compares safely as text without ever being handed to `new Date()` — see
   * the date trap in CLAUDE.md.
   */
  firstJourneyDay?: string | null;
}

/**
 * @param cutover the studio's `journeyCutoverDate` — the day THAT studio moved
 * onto Journey (yyyy-mm-dd), or null when nobody has set it yet.
 */
export function historyCoverage(
  client: CoverageInput | null | undefined,
  cutover?: string | null,
): HistoryCoverage {
  const prior = priorHistoryOf(client);
  if (prior) return priorUncounted(prior) > 0 ? "partial" : "complete";
  if (client?.historyIsComplete === true) return "complete";
  /*
   * No record, but the studio has said when it moved over: a client whose
   * first session here predates that day was training before Journey existed,
   * so their history is partial whether or not anyone has written the number
   * down. A client who started after it began here, so Journey has all of it.
   */
  const first = client?.firstJourneyDay;
  if (cutover && first) return first >= cutover ? "complete" : "partial";
  return "unknown";
}

/** What a screen says instead of a confident figure. */
export const COVERAGE_CAVEAT: Record<HistoryCoverage, string | null> = {
  complete: null,
  partial: "Earlier sessions are counted but not detailed here.",
  unknown: "Sessions before this studio moved onto Journey may not be recorded.",
};

/**
 * "This client has not used this machine" — said two different ways, because
 * they are two different facts (AJ, Sep 2026).
 *
 * Machine-level history is NOT coming across from FileMaker. A client may have
 * used a machine four hundred times and `machineStats` will say zero, so the
 * app never claims they have not. "Never attempted" is a fact about the
 * CLIENT and may only be said when Journey holds their whole story; "Nothing
 * recorded" is a fact about our RECORDS and is what unknown gets too — when
 * the two look identical, only one of the wordings is safe.
 */
export const NEVER_LABEL: Record<HistoryCoverage, string> = {
  complete: "Never attempted",
  partial: "Nothing recorded",
  unknown: "Nothing recorded",
};

/** The same distinction, lower-case, for the middle of a sentence. */
export const NEVER_PHRASE: Record<HistoryCoverage, string> = {
  complete: "never attempted",
  partial: "nothing recorded",
  unknown: "nothing recorded",
};

/**
 * May a screen quote a lifetime figure off `client.machineStats` as though it
 * were the client's whole story? Only when it IS.
 *
 * This replaces `machineStatsBackfilledAt` as the gate. That marker existed
 * because the running totals only count sessions since they started being
 * kept — which is exactly the migration client, and a migration client is now
 * never quoted a number in the first place. For a client whose whole history
 * postdates their studio's cutover the rollup is complete on its own, and no
 * longer waits for a backfill somebody has to remember to run.
 */
export function canQuoteLifetime(coverage: HistoryCoverage): boolean {
  return coverage === "complete";
}
