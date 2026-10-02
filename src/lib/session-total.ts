/**
 * HER SESSION TOTAL — sessions before Journey plus Journey's, and how sure
 * the first half is (Atlas answers, Oct 2 2026).
 *
 * AJ, Oct 2 2026: "we need to be smart about this and stop hoping we get the
 * filemaker data and start being realistic and going 'well lets just make
 * the app work without it'." And: "we dont need to know WHEN people joined
 * journey. we just need to know how many sessions they have TOTAL and when
 * was their first session."
 *
 * So the total is always the same sum — before Journey + Journey's — and
 * what changes is where the first half comes from:
 *
 *   confirmed     a person said how many (`client.priorHistory`, which a
 *                 trainer writes by confirming Mindbody's guess or typing the
 *                 right number on Notes & Profile → Account). Milestones may
 *                 be claimed.
 *   whole-story   Journey holds her whole story (`coverage === "complete"`):
 *                 nothing came before, so Journey's count is her total.
 *                 Milestones may be claimed.
 *   mindbody      nobody has confirmed it yet, so the first half is GUESSED
 *                 from Mindbody's own visit count, which the sync already
 *                 stores (`clientsNumberOfVisitsAtSite`), less the sessions
 *                 Journey logged (`visitsBeforeJourney`). The Hub card, the
 *                 header and the briefing show it as her total ("#312"); a
 *                 place a trainer opens on purpose says it is "from
 *                 Mindbody, not yet confirmed". No milestone is claimed off
 *                 a guess.
 *   journey-only  no guess at all: Mindbody hasn't said. Only Journey's own
 *                 number may be said, and it says so: "#6 in Journey".
 *
 * Late cancels never count as sessions: Journey's count is completed
 * sessions only, and a late cancel is tallied beside it (`lib/late-cancels`),
 * never inside it.
 *
 * PURE — no React, no Firestore, no clock.
 */
import {
  priorHistoryOf,
  priorUncounted,
  visitsBeforeJourney,
  type HistoryCoverage,
} from "./prior-history";

export type SessionTotalBasis = "confirmed" | "whole-story" | "mindbody" | "journey-only";

/** The client fields the total depends on — any client-shaped object fits. */
export interface SessionTotalClient {
  /**
   * `client.sessionCount`: what Journey can see, plus the prior record's
   * uncounted part once the profile's reconciler has run (types.ts).
   */
  sessionCount?: number | null;
  priorHistory?: unknown;
  /** Mindbody's lifetime visit count at the site, when a sync has brought it. */
  clientsNumberOfVisitsAtSite?: number | null;
  /** Her first Journey session: only then are Journey's own sessions taken off Mindbody's count. */
  firstSessionDate?: unknown;
}

export interface SessionTotal {
  basis: SessionTotalBasis;
  /**
   * Her total so far — before Journey plus Journey's — or null when it can't
   * be said: Journey's own count is unknown, or nothing before Journey is
   * known at all ("journey-only": say `journey` with "in Journey").
   */
  total: number | null;
  /** Journey's own completed sessions, or null when unknown. */
  journey: number | null;
  /** The sessions before Journey the total counts: confirmed, or Mindbody's guess. Null for journey-only. */
  before: number | null;
}

const whole = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;

export function sessionTotalOf(
  client: SessionTotalClient | null | undefined,
  coverage: HistoryCoverage,
): SessionTotal {
  const count = whole(client?.sessionCount);
  const prior = priorHistoryOf(client);
  if (prior) {
    const before = priorUncounted(prior);
    // The reconciler folds the prior record into `sessionCount`; until it
    // has run on this client (a count below the record), it is added here.
    // The Client Directory's row reads the same way.
    const total = count === null ? null : count < before ? count + before : count;
    return { basis: "confirmed", total, journey: total === null ? null : Math.max(0, total - before), before };
  }
  if (coverage === "complete") {
    return { basis: "whole-story", total: count, journey: count, before: 0 };
  }
  const visits = client?.clientsNumberOfVisitsAtSite;
  if (typeof visits === "number" && Number.isInteger(visits) && visits >= 0) {
    const before = visitsBeforeJourney(visits, {
      journeySessions: count,
      firstJourneyDay: client?.firstSessionDate ? "known" : null,
    });
    return { basis: "mindbody", total: count === null ? null : count + before, journey: count, before };
  }
  return { basis: "journey-only", total: null, journey: count, before: null };
}

/**
 * May a screen celebrate a session milestone (every 25th, the 100th) or call
 * a session her first? Only off a total a person confirmed, or one Journey
 * holds whole. A guess never earns a milestone.
 */
export function canClaimMilestone(basis: SessionTotalBasis | null | undefined): boolean {
  return basis === "confirmed" || basis === "whole-story";
}

/** May the total stand in for her session number at all ("#312")? */
export function totalIsSayable(t: Pick<SessionTotal, "basis" | "total">): boolean {
  return t.basis !== "journey-only" && t.total !== null;
}

/** The quiet words under a number that came from Mindbody, for a place a trainer opens on purpose. */
export const MINDBODY_GUESS_WORDS = "from Mindbody, not yet confirmed";

/**
 * "#312", "#312 · from Mindbody, not yet confirmed" (with `explain`), or
 * "#6 in Journey" when no guess exists. `n` is the session number being
 * talked about (her total, or the number a booking will be); `basis` is the
 * total's. Null when there is no number.
 */
export function sessionNumberWords(
  n: number | null | undefined,
  basis: SessionTotalBasis | null | undefined,
  { explain = false }: { explain?: boolean } = {},
): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1 || !basis) return null;
  const num = `#${Math.trunc(n)}`;
  if (basis === "journey-only") return `${num} in Journey`;
  if (basis === "mindbody" && explain) return `${num} · ${MINDBODY_GUESS_WORDS}`;
  return num;
}

/**
 * The guess a trainer is asked to confirm on Account: "about 306 (from
 * Mindbody)". Null when there is nothing to confirm — the total is already
 * confirmed or whole, or Mindbody has not said.
 */
export function beforeJourneyGuess(t: SessionTotal): number | null {
  return t.basis === "mindbody" && t.before !== null ? t.before : null;
}
