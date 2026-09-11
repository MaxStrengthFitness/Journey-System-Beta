/**
 * RENEWALS — shared types.
 *
 * Round: Renewals (Sep 2026). See OPERATIONS-RENEWALS-PROPOSAL.md and
 * docs/business/renewals.md for the business rules, and this folder's
 * README.md for the decisions.
 *
 * Nothing here imports Firebase. The server's nightly job and the browser run
 * the same code on these shapes.
 */

/* ------------------------------------------------------------------ *
 * Studio settings — studios/{studioId}/config/renewals
 * ------------------------------------------------------------------ */

/**
 * One package as a studio sells it. Prices vary by location, so every studio
 * keeps its own table; the defaults are the website's numbers (Sep 2026).
 */
export interface PackageTier {
  /** Stable id: "trial", "committed", "transformed", or a studio's own. */
  key: string;
  /** What the studio calls it: "Committed". */
  label: string;
  /** The commitment: 6, 12 or 18. */
  months: number;
  /** Payments, one every 4 weeks: 6, 12 or 18. */
  payments: number;
  /** Sessions in the whole package: 48, 96 or 144. */
  sessions: number;
  /** Monthly price per session: $70, $60, $54. */
  ratePerSession: number;
  /** Each 4-weekly payment: $560, $480, $432. */
  paymentAmount: number;
  /** Price per session when paid in full: $67, $57, $51. */
  prepayRatePerSession: number;
  /**
   * How this studio's Mindbody names the package — contract names AND
   * pricing-option names ("48 Sessions - 2X Week", "144 PIF"). Matched ignoring
   * capitals and extra spaces; see normalizeMindbodyName().
   */
  mindbodyNames: string[];
}

export type PayAsYouGoCountsAs = "retained" | "lost";

export interface RenewalSettings {
  /** Start the renewal conversation at this many sessions left. Default 10. */
  conversationAtSessionsLeft: number;
  /** Warn this many days before the auto-renew charge... Default 30. */
  chargeWarnDays: number;
  /** ...when at least this many sessions will still be banked. Default 4. */
  chargeWarnMinBanked: number;
  /** How far ahead the planning view looks, in months. Default 3. */
  horizonMonths: number;
  /** Days without a visit that count as a break. Default 14. */
  breakDays: number;
  /** A client is lost this many days after billing ends with no new package. Default 30. */
  lostAfterDays: number;
  /** Whether a client who moves to single sessions counts as kept. Default "retained". */
  payAsYouGoCountsAs: PayAsYouGoCountsAs;
  /** Vacation / Snowbird / Medical time pauses the clocks. Default true. */
  pauseDuringAwayEvents: boolean;
  /** The studio's package table. */
  packages: PackageTier[];
  /**
   * Pricing options that add sessions but are not a package — complimentary
   * sessions ("Session Comp"). Their sessions count toward sessions left.
   */
  extraSessionNames: string[];
}

/**
 * studios/{studioId}/config/renewalsSeen — written by the nightly job only.
 * Every contract and pricing-option name it met at this studio, so a leader
 * can match an unrecognized name to a package in one tap.
 */
export interface RenewalNamesSeen {
  names: Record<
    string,
    {
      /** As Mindbody spells it. */
      name: string;
      kind: "contract" | "pricing-option";
      /** Clients holding it, as of the last run. */
      clients: number;
    }
  >;
  updatedAt?: unknown;
}

/* ------------------------------------------------------------------ *
 * The snapshot — clients/{id}.renewal (written by the nightly job)
 * ------------------------------------------------------------------ */

/**
 * Where a client stands. Exactly one at a time, and every one renders as a
 * sentence (sentences.ts), never a score.
 */
export type RenewalSituation =
  /** Package known, nothing colliding. */
  | "on-track"
  /** Billing ends while sessions are still banked — the "12 months takes 14" case. */
  | "will-bank"
  /** Sessions run out well before billing ends. */
  | "will-run-out"
  /** A Vacation / Snowbird / Medical event, or the MIA pause, is on. Clocks paused. */
  | "away"
  /** The package ended and no new one has appeared — yet. Inside the studio's "lost" window. */
  | "ended"
  /** Past the studio's "lost" rule. The win-back list. */
  | "lapsed"
  /** Not enough Mindbody data to say. dataGaps says what is missing. */
  | "unknown";

export type RenewalFlagCode =
  | "autopay-suspended"
  | "no-future-booking"
  | "missed-sessions"
  | "on-break"
  | "rough-patch"
  | "check-in-red"
  | "no-report-this-cycle"
  | "expired-sessions";

export interface RenewalFlag {
  code: RenewalFlagCode;
  /** The sentence shown on screen, evidence included. */
  text: string;
}

export interface RenewalProof {
  /** Weeks with at least one visit, of the last 12 (away weeks not counted against). */
  weeksAttended: number | null;
  weeksObserved: number | null;
  /** Machines where the latest weight beats the first, of those logged 3+ times. */
  machinesImproved: number | null;
  machinesTracked: number | null;
  bestGain: { machineId: string; machineName: string; pct: number } | null;
  /** From the InBody scans, when there are two or more. */
  inbody: { muscleLbChange: number; bodyFatPctChange: number; since: string } | null;
}

export interface RenewalSnapshot {
  version: number;
  /** Firestore Timestamp, set by the writer. */
  computedAt?: unknown;
  /** The renewal cycle this describes: a contract id, or "pif-<pricing option>". */
  cycleKey: string | null;
  clientContractId: string | null;
  packageKey: string | null;
  /** "Committed · 12 months". */
  packageLabel: string | null;
  /**
   * monthly: a contract is billing. prepaid: paid in full. sessions-only:
   * billing has finished and the client is using banked sessions.
   */
  paymentMode: "monthly" | "prepaid" | "sessions-only" | null;
  /** YYYY-MM-DD. Dates, never countdowns: a countdown changes every night. */
  billingStart: string | null;
  /** When billing ends and the package renews. Mindbody's contract end date when known. */
  chargeDate: string | null;
  chargeDateSource: "mindbody" | "estimate" | null;
  autoRenews: boolean | null;
  /** Sessions left in the whole package: on hand, plus those still to be paid for. */
  sessionsLeft: number | null;
  sessionsLeftSource: "mindbody" | "estimate" | null;
  /** Sessions the client holds right now (Mindbody pricing options). */
  sessionsOnHand: number | null;
  /** Payments still to come on the current package. */
  paymentsLeft: number | null;
  /** Visits a week over the last 8 weeks, away time excluded. Null until there is enough to say. */
  pacePerWeek: number | null;
  runOutDate: string | null;
  /** Sessions still banked when billing ends, at the client's pace. */
  bankedAtCharge: number | null;
  situation: RenewalSituation;
  /** Sessions left at or below the studio's threshold. */
  conversationDue: boolean;
  /** Will bank, and the charge is inside the studio's warning window. */
  chargeWarning: boolean;
  /** When the package effectively ends — the pipeline's sort key and horizon. */
  focusDate: string | null;
  flags: RenewalFlag[];
  proof: RenewalProof;
  /** While away: when they are expected back. */
  awayUntil: string | null;
  awayReason: string | null;
  lastVisitDate: string | null;
  nextBookingDate: string | null;
  /** Trainers who coached this client in the last 60 days — powers "My renewals". */
  coachIds: string[];
  /** What is missing, in words: "No Mindbody contract on file — press Sync on the Mindbody card". */
  dataGaps: string[];
}
