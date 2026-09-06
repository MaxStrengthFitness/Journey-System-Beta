/**
 * Temporary profiles — the vocabulary.
 *
 * Mindbody is the source of truth for people. It is also, on any given
 * morning, possibly down, rate-limited, or simply not yet provisioned for a
 * studio that opens on Monday. The app has to keep running through all three,
 * so a manager can mint a TEMPORARY profile and reconcile it later.
 *
 * The field names deliberately echo the trainer-identity round
 * (src/features/trainer-identity/claim.ts), which solved the same shape of
 * problem for trainer documents: a placeholder that is real enough to work
 * with, marked clearly enough that it can never be mistaken for the genuine
 * record, and superseded rather than deleted when the real one arrives.
 *
 * The rule that matters: a provisional record is NEVER silently promoted. It
 * carries its marker until a human confirms the match, because merging two
 * people's training histories together is not a mistake you can back out of.
 */

/** Written on any client or trainer created in the app rather than by Mindbody. */
export interface ProvisionalFields {
  /** True while this record has no Mindbody counterpart. */
  provisional?: boolean;
  /** ISO timestamp. */
  provisionalSince?: string;
  /** Trainer document id of whoever minted it. */
  provisionalBy?: string;
  /** Why it exists, in the manager's words — shown on the reconcile screen. */
  provisionalReason?: string;

  /**
   * Set on the PROVISIONAL record once it has been merged into a real one.
   * Never deleted: anything still holding the temporary id stays traceable.
   */
  supersededById?: string | null;
  supersededAt?: string;

  /** Set on the SURVIVING record: where its history came from. */
  mergedFromId?: string | null;
  mergedAt?: string;
}

/** How a studio relates to Mindbody. */
export type StudioMindbodyMode =
  /** Normal: bookings and people arrive from Mindbody. */
  | "linked"
  /**
   * Deliberately running without it — a pre-launch floor, a demo area, or a
   * studio whose Mindbody account is not provisioned yet. Distinct from
   * "someone left the Site ID blank by accident", which is what the old
   * screen could not tell apart.
   */
  | "offline";

export const PROVISIONAL_REASONS = [
  "Mindbody not connected yet",
  "Mindbody is down",
  "New hire, not in Mindbody yet",
  "New client, not in Mindbody yet",
  "Pre-launch or demo floor",
  "Something else",
] as const;

export type ProvisionalReason = (typeof PROVISIONAL_REASONS)[number];
