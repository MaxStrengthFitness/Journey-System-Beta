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
import type { Routine } from "../../types";
import { ADD_CLIENT_REASONS, isProvisional } from "../admin/provisional/provisional";
import type { ProvisionalFields } from "../admin/provisional/types";
import { stillBuilding } from "./plan";

export type StartingKind =
  /** Has a routine already, or a plan kept with Routine A still empty; nothing to set up. */
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
  /**
   * The client's Routine A carries a plan, machines or none. A plan kept for
   * a client starting out leaves Routine A empty, because the consult is not
   * Routine A (AJ, Oct 8 2026: "sometimes the consult machines will not be
   * the same as their a routine"): the plan is set up, so the client is
   * never offered Start a plan again, before the consult or after it.
   * Required, so every caller says: left out, a kept plan would be offered
   * Start a plan again.
   */
  hasPlan: boolean;
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
  if (input.hasPlan) {
    return { kind: "established", says: "Has a plan." };
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

/**
 * Sessions past which a client is out of the Academy's learning curve: "after
 * the initial 'learning curve' period of around 4 to 6 workouts" (Exercise
 * Selection and Long-Term Programming). The top of the range, so a client is
 * never called thin while still inside it.
 */
export const LEARNING_CURVE_SESSIONS = 6;

export interface LearningCurveInput {
  /**
   * The client's routines and the session count have answered. False while
   * either is loading or its read failed: then nothing is claimed.
   */
  known: boolean;
  coverage: HistoryCoverage;
  /** The client's sessions as Journey counts them (`client.sessionCount`), or null when unknown. */
  journeySessions: number | null;
  /** Routine A carries a plan whose switch is on (`plan.building`). */
  routineABeingBuilt: boolean;
}

/**
 * Whether the routine builder may call a short routine thin for this client
 * (`analyzeRoutine`'s `established`: "Most established clients run at least
 * 6"). The Academy puts it after the learning curve: "most clients typically
 * perform at least 6 exercises per workout (after the initial 'learning
 * curve' period of around 4 to 6 workouts)" (Exercise Selection and
 * Long-Term Programming). So it is true only for a client with at least
 * `LEARNING_CURVE_SESSIONS` sessions, or one who trained here before Journey
 * (coverage "partial"). Never while Routine A is being built (its plan's
 * switch), when a short routine is the plan; never for a client whose whole
 * story is in Journey and is still inside the curve, routine or not; and
 * never when Journey can't tell, which claims nothing.
 *
 * The briefing and the routine drawer both ask it, with the SAME inputs
 * (`learningCurveInputOf`), so one client gets one answer on both screens.
 * It replaced the briefing's intro-session flag (`established={!isIntroSession}`,
 * which no caller ever set) and the drawer's `sessions.length >= 6` (the
 * first-session design round, Oct 8 2026, §4.8).
 */
export function pastLearningCurve(input: LearningCurveInput): boolean {
  if (!input.known || input.routineABeingBuilt) return false;
  if (input.journeySessions !== null && input.journeySessions >= LEARNING_CURVE_SESSIONS) return true;
  return input.coverage === "partial";
}

/**
 * The learning curve's inputs, worked out one way for every screen that asks
 * (the whole-branch review, Oct 9 2026: the drawer said `known: true` and
 * counted the sessions it had loaded, the briefing waited for the routines
 * and read the client's count, so one client could be "established" in one
 * and not the other):
 * - known: the client's routines have answered (a failed or unanswered
 *   read claims nothing);
 * - the sessions: the client's own count (`sessionCount`), null when absent;
 * - Routine A being built: its plan's switch on AND still short of its plan
 *   (`stillBuilding`), so a finished plan with the switch left on never
 *   keeps a client inside the curve for good.
 */
export function learningCurveInputOf(input: {
  routinesKnown: boolean;
  coverage: HistoryCoverage;
  client: { sessionCount?: unknown } | null | undefined;
  routineA: Pick<Routine, "machineIds" | "plan"> | null | undefined;
}): LearningCurveInput {
  const count = input.client?.sessionCount;
  return {
    known: input.routinesKnown,
    coverage: input.coverage,
    journeySessions: typeof count === "number" ? count : null,
    routineABeingBuilt: stillBuilding(input.routineA?.plan, input.routineA?.machineIds),
  };
}
