/**
 * THE NEXT SESSION'S WEIGHT, SET FROM THE WRAP-UP (the Atlas answers, Oct 2 2026).
 *
 * AJ: "in the wrap up screen you should be able to adjust the weight for the
 * next session ... currently our app uses the last sessions weight ... a
 * trainer needs to be able to adjust this weight directly from a wrap up so
 * that way i dont have to finish the session, go to the clients profile,
 * adjust their weight/make a note ... the opposite needs to work too".
 *
 * HOW THE NEXT SESSION PICKS ITS WEIGHT TODAY (WorkoutTrackerView, session
 * start): `clientMachineSettings/{clientId}_{machineId}.currentWeight` wins,
 * then the last performed weight (`client.currentMachineMetrics`), then the
 * starting weight. Finish (`lib/sync-utils.ts`) rewrites `currentWeight` to
 * the weight she performed, which is what makes it "last session's weight".
 *
 * So the Wrap-up — which opens AFTER Finish — writes two things on that same
 * settings document, and nothing on the client document:
 *   - `currentWeight`: the weight the next session will load, read by every
 *     session start at any studio, by any trainer, with no new reader needed;
 *   - `nextWeight`: the mark of who set it, when, and at which session, so
 *     the next session can say where its weight came from.
 *
 * USED UP. Once a session has logged that machine the mark is spent: Finish
 * deletes it (sync-utils), and a reader also asks `isNextWeightLive`, which
 * holds the mark only while the machine's last performed session is still
 * the one it was set at AND the weight it set is still the one on file (a
 * trainer who changes the weight on the profile afterwards owns it then).
 *
 * The app never suggests a weight: the trainer sets it, in the machine's
 * increment (two pounds where none is defined), up or down. Pure: no React,
 * no Firestore.
 */

/** Who set the next session's weight, and where (declared in src/types.ts beside the settings document). */
import type { NextWeightMark } from "../../types";
export type { NextWeightMark };

/**
 * The weight stack's step, lb. No machine in the catalog defines its own
 * increment yet (there is no such field); the MedX-style stacks move in two
 * pounds (the Academy's increments, and the Now Bar's stepper). When a
 * machine grows one, it is read here and nowhere else.
 */
export const DEFAULT_WEIGHT_STEP_LB = 2;

/** One step up or down, never below zero. */
export function bumpWeight(weight: number | null, dir: 1 | -1, step: number = DEFAULT_WEIGHT_STEP_LB): number {
  const next = (weight ?? 0) + dir * step;
  return Math.max(0, Math.round(next * 10) / 10);
}

/** A typed entry, or null when it isn't a weight (empty, letters, negative). */
export function parseWeightEntry(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 2000) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Is the mark still the reason the next session's weight is what it is?
 * Only while the machine's last performed session is the one it was set at
 * (no session has logged the machine since), and the weight on file is the
 * weight it set.
 */
export function isNextWeightLive(
  mark: NextWeightMark | null | undefined,
  lastPerformedSessionId: string | null | undefined,
  currentWeight: number | null | undefined,
): boolean {
  if (!mark || typeof mark.weight !== "number") return false;
  if (lastPerformedSessionId && lastPerformedSessionId !== mark.sessionId) return false;
  if (typeof currentWeight === "number" && currentWeight !== mark.weight) return false;
  return true;
}

/** The first word of a person's name, for the source line. */
function firstWord(name: string): string {
  return (name || "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Where today's starting weight came from, on the Active Session:
 * "Set for today at the last Wrap-up by Sam." Null when there is no live mark.
 */
export function nextWeightSourceLine(mark: NextWeightMark | null | undefined): string | null {
  if (!mark) return null;
  const who = firstWord(mark.setByName);
  return who ? `Set for today at the last Wrap-up by ${who}.` : "Set for today at the last Wrap-up.";
}

/**
 * The Wrap-up's line beside a changed weight: what it will be and what she
 * did today. Says what the trainer set, never why.
 */
export function nextWeightChangeLine(weight: number, today: number | null): string | null {
  if (today === null || weight === today) return null;
  const diff = Math.round((weight - today) * 10) / 10;
  return diff > 0 ? `Up ${diff} lb from today` : `Down ${Math.abs(diff)} lb from today`;
}

/** The mark to store, or null to clear it (set back to today's weight). */
export function nextWeightMark(input: {
  weight: number;
  today: number | null;
  sessionId: string;
  setById: string;
  setByName: string;
  now: Date;
}): NextWeightMark | null {
  if (input.today !== null && input.weight === input.today) return null;
  return {
    weight: input.weight,
    fromWeight: input.today,
    sessionId: input.sessionId,
    setAt: input.now.toISOString(),
    setById: input.setById,
    setByName: input.setByName,
  };
}
