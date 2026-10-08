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
 * empty: `historyCoverage` says "complete" (no prior record of sessions, and
 * Mindbody's visits are within the five-visit slop that a consult and an
 * intro already use) and Journey has no session. Anything Journey can't hold
 * whole is never called new (docs/business/migration-and-prior-history.md):
 * "partial" is a long-standing client new to Journey, and "unknown" says so
 * rather than guessing.
 */
import type { HistoryCoverage } from "../../lib/prior-history";

export type StartingKind =
  /** Has a routine already; nothing to set up. */
  | "established"
  /** Journey holds the whole story and it is empty: the first-time setup suggests a starting plan. */
  | "new-to-studio"
  /** Sessions before Journey: no suggestion, the trainer enters the routine the client already does. */
  | "new-to-journey"
  /** Journey can't tell. The setup offers both doors and claims neither. */
  | "unknown";

export interface StartingKindInput {
  /** The client has a Routine A (or B) with at least one machine. */
  hasRoutine: boolean;
  /** Journey's own sessions for the client, or null when unknown. */
  journeySessions: number | null;
  coverage: HistoryCoverage;
}

export interface StartingKindAnswer {
  kind: StartingKind;
  /** One sentence for the screen, never "new client" or "first session" off a low count. */
  says: string;
}

export function startingKindOf(input: StartingKindInput): StartingKindAnswer {
  if (input.hasRoutine) {
    return { kind: "established", says: "Has a routine." };
  }
  const sessions = input.journeySessions;
  if (input.coverage === "complete" && sessions === 0) {
    return { kind: "new-to-studio", says: "Nothing before Journey and no sessions yet: start a plan." };
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
  return {
    kind: "unknown",
    says: "Journey can't tell whether this client has trained here before. Start a plan, or enter the routine they already do.",
  };
}
