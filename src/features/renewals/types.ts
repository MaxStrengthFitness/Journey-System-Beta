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
  /**
   * Whether this package renews by itself when its payments finish: this
   * package's own answer, over the studio's (`RenewalSettings.
   * packagesRenewAutomatically`). Absent means "same as the studio" (Sep 25
   * 2026). The packages screen and the renewal engine both read it, through
   * auto-renew.ts, so a prospect and a client on the package hear the same
   * thing. Sessions never expire at any studio (AJ, Sep 24), so there is no
   * setting for that.
   */
  renewsAutomatically?: boolean;
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
  /**
   * Whether this studio's packages renew by themselves when their payments
   * finish. AJ, Sep 25 2026: the franchise studios have auto-renewal on and
   * the corporate studios don't; a studio may turn it off, and it is on by
   * default. Absent means the studio hasn't answered, which reads as ON
   * (auto-renew.ts, STUDIO_AUTO_RENEW_DEFAULT). A package's own answer wins
   * over this one; see auto-renew.ts for the whole order.
   */
  packagesRenewAutomatically?: boolean;
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
 * Auto-renew — decided in one place (auto-renew.ts)
 * ------------------------------------------------------------------ */

/**
 * Where an auto-renew answer came from, first to last in the order that
 * decides it: Mindbody's own flag on the contract, a trainer's mark on the
 * client's profile for that contract, the package's answer, the studio's
 * answer, and the standard (the studio never answered, so ON).
 */
export type AutoRenewSource = "mindbody" | "client" | "package" | "studio" | "default";

export interface AutoRenewAnswer {
  renews: boolean;
  from: AutoRenewSource;
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
  /**
   * The next package, already signed while this one runs. The renewal
   * conversation is over, so no one is prompted to start it.
   */
  renewalOnBooks: { cycleKey: string; packageKey: string | null; startsOn: string } | null;
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
  /**
   * Whether the running contract renews by itself when its payments finish:
   * the DECIDED answer, in auto-renew.ts's order (Mindbody's contract, the
   * trainer's mark on this contract, the package's answer, the studio's, the
   * standard ON). Null only when nothing is running or coming, under a
   * coach's lock that says paid in full or banked sessions, when the package
   * isn't matched in Renewal settings and neither Mindbody nor a mark has
   * answered, or on a version-1 snapshot that Mindbody hadn't flagged —
   * the words then claim neither (sentences.ts, billingEndPhrase).
   */
  autoRenews: boolean | null;
  /** Where `autoRenews` came from; null when it is null. Absent on a version-1 snapshot. */
  autoRenewsFrom?: AutoRenewSource | null;
  /**
   * The answer WITHOUT the client's own mark or a coach's lock: what the
   * profile's box shows until a trainer marks this contract. Absent on a
   * version-1 snapshot.
   */
  autoRenewsInherited?: AutoRenewAnswer | null;
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
  /**
   * Will bank, and the charge is inside the studio's warning window. Never on
   * a contract the decided answer says won't renew (`autoRenews` false): no
   * charge is coming.
   */
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
  /**
   * Who coached the most visits over the last 90 days. A closed package's
   * outcome is attributed to them in the leader-only renewal rates.
   */
  primaryTrainerId: string | null;
  /** What is missing, in words: "No Mindbody contract on file — press Sync on the Mindbody card". */
  dataGaps: string[];

  /* ---- Version 3 (the renewals dashboard, Oct 7 2026). Absent on older snapshots. ---- */

  /**
   * Where `sessionsLeft` comes from, part by part: "52 left: 9 rolled over ·
   * 11 this contract · 32 to come · +2 won". Its `total` IS `sessionsLeft`:
   * never a second balance. Null when the parts can't be told apart (no
   * pricing options on file, or no balance at all).
   */
  ledger?: SessionLedger | null;
  /**
   * When the commitment ends: Mindbody's contract end for a monthly contract
   * (`chargeDate`), else the package's start plus its payments × 28 days.
   * Null when no commitment is running.
   */
  commitmentEnd?: string | null;
  commitmentEndSource?: "mindbody" | "estimate" | null;
  /** Sessions projected left when the commitment ends. Null without a commitment end or a balance. */
  projection?: RenewalProjection | null;
  /** What the client pays: Mindbody's own charge when it is on file, else the package table's rate. */
  rate?: RenewalRate | null;
  /** The smaller retention signals, each said as a sentence (sentences.ts). */
  signals?: RetentionSignals | null;
}

/**
 * Sessions left, part by part (snapshot version 3). Every part is a count of
 * Mindbody's own, except `toCome`, which is 8 for each payment still to come
 * (`source: "estimate"` when the payments were counted from the contract's
 * dates rather than Mindbody's scheduled charges).
 */
export interface SessionLedger {
  /**
   * Unused sessions on pricing options bought before the current contract
   * began: rolled over (sessions never expire, and an auto-renewed contract
   * carries them in).
   */
  carriedIn: number;
  /** Unused sessions on pricing options bought under the current contract (or the paid-in-full package). */
  thisContract: number;
  /** Sessions still to arrive: 8 for each payment still to come. */
  toCome: number;
  /**
   * Complimentary and won sessions: pricing options named in the studio's
   * extra-sessions names (AJ, Oct 6 2026: won sessions are "added to
   * mindbody" as pricing options).
   */
  extra: number;
  /** carriedIn + thisContract + toCome + extra — always equal to `sessionsLeft`. */
  total: number;
  source: "mindbody" | "estimate";
  /** The studio's day of the Mindbody pull these counts come from. Null when the pull's time isn't on file. */
  asOf: string | null;
}

/**
 * Sessions projected left when the commitment ends (snapshot version 3).
 *
 *   leftAtEnd = sessionsLeft − booked − pace × paceWeeks
 *
 * `booked` is the client's bookings from today to the end, as far as the
 * bookings are read (30 days ahead); after the last booked day, the pace.
 * Away time ahead (Vacation, Snowbird, Medical) uses no sessions.
 */
export interface RenewalProjection {
  /** The commitment's end (the snapshot's `commitmentEnd`). */
  endsOn: string;
  endsOnSource: "mindbody" | "estimate";
  /** Booked days from today to the end. */
  booked: number;
  /** The last booked day counted; null when nothing is booked. */
  bookedThrough: string | null;
  /** Weeks after the last booked day (or today) to the end, away time taken off. One decimal. */
  paceWeeks: number;
  /** The pace the projection used (the snapshot's `pacePerWeek`). Null below the minimum sample. */
  pacePerWeek: number | null;
  /** Sessions left when the commitment ends; 0 when they run out first; null when there's not enough to project. */
  leftAtEnd: number | null;
  /** The range, from this client's fastest and slowest 4-week pace. Equal to leftAtEnd when there is only one. */
  leftAtEndLow: number | null;
  leftAtEndHigh: number | null;
  /** When the sessions run out, when that is before the end. */
  runOutDate: string | null;
}

/** What the client pays (snapshot version 3). */
export interface RenewalRate {
  /** Per session. Null when the package isn't known (a payment can't be split into sessions). */
  perSession: number | null;
  /** Each 4-weekly payment; null for paid in full. */
  payment: number | null;
  /** "mindbody": the contract's scheduled charge. "package": the studio's package table. */
  source: "mindbody" | "package";
  /** The package table's rate, for "at $54 (special)". Null without a package. */
  packageRate: number | null;
  /** Mindbody's charge differs from the package table's payment. */
  special: boolean;
}

/** The smaller retention signals (snapshot version 3). Sentences, never scores. */
export interface RetentionSignals {
  /** Visits (late cancels counted as used) a week over the last 4 weeks; null below 21 observed days. */
  paceRecent: number | null;
  /** The same over the 8 weeks before those. */
  pacePrior: number | null;
  /** Recent against prior: "down", "up", or "steady"; null when either is unknown. */
  paceTrend: "up" | "down" | "steady" | null;
  /** Her total sessions so far, before Journey included (lib/session-total.ts). */
  totalSessions: number | null;
  totalSessionsBasis: "confirmed" | "whole-story" | "mindbody" | "journey-only" | null;
  /**
   * The package whose sessions a week fit the client's pace best (the
   * current package on a tie). Null without a pace.
   */
  suggestedPackageKey: string | null;
}

/* ------------------------------------------------------------------ *
 * Conversations — studios/{studioId}/renewals/{cycleKey}[/touches/{id}]
 * ------------------------------------------------------------------ */

/** How the client is leaning, as the trainer heard it. */
export type RenewalLeaning = "renewing" | "leaning-yes" | "unsure" | "leaning-no" | "not-renewing";

/** What they are on the fence about. Price first: AJ, Sep 10 — the top reason clients leave. */
export type RenewalConcern =
  | "price"
  | "commitment-length"
  | "results"
  | "schedule"
  | "health"
  | "travel"
  | "trainer-fit"
  | "other";

/** What they said they might want next. */
export type RenewalInterest = "same" | "longer" | "shorter" | "prepay" | "monthly";

/** Where the leader has the conversation. Set by leaders only. */
export type RenewalStage = "not-started" | "talking" | "decided";

export type RenewalOutcome = "renewed" | "upgraded" | "downgraded" | "pay-as-you-go" | "lost";

/**
 * One renewal cycle (one package term) at a studio. Trainers write the
 * `latest*`, `needsLeader` and `lastTouch*` fields as a side effect of
 * logging a conversation; leaders own stage, lead and outcome.
 */
export interface RenewalCycle {
  clientId: string;
  clientName: string;
  cycleKey: string;
  packageKey: string | null;
  /** Copied at the last conversation, for context in lists. */
  chargeDate: string | null;
  stage?: RenewalStage;
  /** Trainer document id of whoever is leading the conversation. */
  leadTrainerId?: string | null;
  latestLeaning: RenewalLeaning | null;
  latestConcerns: RenewalConcern[];
  latestInterestedIn: RenewalInterest | null;
  needsLeader: boolean;
  lastTouchAt: unknown | null;
  /** Sign-in uid of the last person to log a conversation. */
  lastTouchBy: string | null;
  lastTouchByName: string | null;
  touchCount?: number;
  outcome?: RenewalOutcome | null;
  outcomeAt?: unknown | null;
  /** "job" when the nightly job recorded it, else the leader's uid. */
  outcomeBy?: string | null;
  nextCycleKey?: string | null;
  /** The package that followed, when the outcome is a renewal. */
  nextPackageKey?: string | null;
  /** YYYY-MM-DD the package closed — what "outcomes this quarter" counts by. */
  closedOn?: string | null;
  /** The trainer who coached most sessions this cycle — for leader-only rates. */
  primaryTrainerId?: string | null;
  /**
   * What the studio has decided about the renewal (the renewals dashboard,
   * Oct 7 2026; AJ: "allow in app response"). Anyone who works at the studio
   * sets it; every change also writes a touch of kind "plan". Never an
   * outcome: a leader's outcome stands beside it and wins.
   */
  plan?: RenewalPlan | null;
  updatedAt?: unknown;
  updatedBy?: string;
}

/**
 * The renewal plan's choices (plan.ts says which are offered when).
 *
 * A contract that renews by itself and will bank sessions:
 *   let-renew       "Let it renew (sessions carry over)"
 *   pause-billing   "Pause billing in Mindbody until sessions run low"
 * A contract that doesn't renew by itself (Strongsville; AJ, Oct 6 2026:
 * "allow ... for studios without auto renew to mark if a client is set to
 * renew or not"):
 *   renew-same · upgrade · downgrade · pay-as-you-go
 * Both:
 *   not-renewing · undecided
 */
export type RenewalPlanChoice =
  | "let-renew"
  | "pause-billing"
  | "renew-same"
  | "upgrade"
  | "downgrade"
  | "pay-as-you-go"
  | "not-renewing"
  | "undecided";

export interface RenewalPlan {
  choice: RenewalPlanChoice;
  /** The package they are renewing onto (renew-same, upgrade, downgrade). */
  packageKey?: string | null;
  note?: string;
  /** Sign-in uid of whoever set it. */
  byUid: string;
  byName: string;
  /** Firestore server time. */
  at: unknown;
}

/** One logged conversation. Never edited; a leader can delete a mistake. */
export interface RenewalTouch {
  clientId: string;
  /** Sign-in uid. */
  authorId: string;
  authorName: string;
  at: unknown;
  leaning: RenewalLeaning;
  concerns: RenewalConcern[];
  interestedIn: RenewalInterest | null;
  note: string;
  needsLeader: boolean;
  /**
   * "plan" when the touch records a change to the renewal plan (its leaning
   * is the plan's, plan.ts `planLeaning`); absent on a conversation.
   */
  kind?: "plan";
  plan?: { choice: RenewalPlanChoice; packageKey?: string | null };
}
