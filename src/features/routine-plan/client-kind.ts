/**
 * Which kind of "no routine" a client is (AJ, Oct 7 2026).
 *
 * "There's definitely two types of no routine. It's people new to the studio
 * and new to Journey. ... new to journey, that's really easy. That's just a
 * plug and play type of deal. ... if it is a long-standing, it's no suggestion
 * they're going to go ahead and go on their profile, go to programming, fill
 * it in."
 *
 * New to the studio means Journey holds the client's whole story and it is
 * empty: `historyCoverage` says "complete" and Journey has no session. Or the
 * client is a temporary profile Add Client made for "New client, not in
 * Mindbody yet" (the walk-in AJ described: "a client walked in and there's
 * free time ... They could run a session right then and there on a
 * consult"). Anything Journey can't hold whole is never called new
 * (docs/business/migration-and-prior-history.md): "partial" is a
 * long-standing client new to Journey, and "unknown" says so rather than
 * guessing. A read that hasn't answered (the routines, or the session count)
 * is "unknown" too, never new: a failed read means unknown, never empty.
 *
 * "Complete" allows up to five Mindbody visits before Journey
 * (`NEW_CLIENT_MAX_VISITS`: a consultation and an intro already use some),
 * and can come from a confirmed prior history rather than Mindbody, so the
 * sentences never say "nothing before Journey", "new client" or "first
 * session": the client is "starting out at the studio".
 */
import type { HistoryCoverage } from "../../lib/prior-history";
import { ADD_CLIENT_REASONS, isProvisional } from "../admin/provisional/provisional";
import type { ProvisionalFields } from "../admin/provisional/types";

export type StartingKind =
  /** Has a routine already; nothing to set up. */
  | "established"
  /** Starting out at the studio: the first-time setup suggests a starting plan. */
  | "new-to-studio"
  /** Sessions before Journey: no suggestion, the trainer enters the routine the client already does. */
  | "new-to-journey"
  /** Journey can't tell. The setup offers both doors and claims neither. */
  | "unknown";

export interface StartingKindInput {
  /**
   * The client's routines and the session count have both answered. False
   * while either is still loading or its read failed: then nothing about the
   * client is claimed.
   */
  known: boolean;
  /** The client has a Routine A (or B) with at least one machine. */
  hasRoutine: boolean;
  /** Journey's own sessions for the client, or null when unknown. */
  journeySessions: number | null;
  coverage: HistoryCoverage;
  /** A temporary profile Add Client made for a new client (`isProvisionalNewClient`). */
  provisionalNewClient: boolean;
}

export interface StartingKindAnswer {
  kind: StartingKind;
  /** One sentence for the screen, never "new client", "first session" or "nothing before Journey". */
  says: string;
}

/** Add Client's reason for a walk-in Mindbody doesn't have yet. */
export const NEW_CLIENT_REASON: string = ADD_CLIENT_REASONS[0];

/**
 * A temporary profile made by Add Client for "New client, not in Mindbody
 * yet", and not yet merged into the real record. A profile made because
 * Mindbody was down is a client Journey can't see the history of, so it is
 * not new.
 */
export function isProvisionalNewClient(
  client: (ProvisionalFields & { supersededByUid?: string | null }) | null | undefined,
): boolean {
  return isProvisional(client) && (client?.provisionalReason ?? "").trim() === NEW_CLIENT_REASON;
}

const CANT_TELL =
  "Journey can't tell whether this client has trained here before. Start a plan, or enter the routine they already do.";

export function startingKindOf(input: StartingKindInput): StartingKindAnswer {
  if (!input.known) return { kind: "unknown", says: CANT_TELL };
  if (input.hasRoutine) {
    return { kind: "established", says: "Has a routine." };
  }
  if (input.provisionalNewClient) {
    return { kind: "new-to-studio", says: "Starting out at the studio: start a plan." };
  }
  const sessions = input.journeySessions;
  if (input.coverage === "complete" && sessions === 0) {
    return { kind: "new-to-studio", says: "Starting out at the studio: start a plan." };
  }
  if (input.coverage === "partial") {
    return {
      kind: "new-to-journey",
      says: "Has trained here before Journey. Enter the routine they already do on Programming.",
    };
  }
  if (input.coverage === "complete" && sessions !== null && sessions > 0) {
    // Sessions in Journey but no routine: a free-form start, or a routine
    // removed. Nothing about the client is new; the plan starts from today.
    return { kind: "new-to-journey", says: "Sessions in Journey but no routine yet. Set one up on Programming." };
  }
  return { kind: "unknown", says: CANT_TELL };
}
