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
