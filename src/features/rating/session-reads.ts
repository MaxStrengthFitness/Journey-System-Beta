/**
 * Reading a session's Dial fields WITH their legacy fallbacks, in one place.
 *
 * Reporting round, Sep 2026. Sessions written before the round carry
 * `sleepQuality` / `stressLevel` / `energyLevel` / `clientFeel` / two-state
 * body regions; sessions written after it carry `preSessionCheckIn.readiness`,
 * `dose` and `bodyStates[].dial`. Every reader that wants "how did she arrive"
 * or "how did it land" goes through these so the two eras sit on one axis and
 * nobody re-implements the fallback (the clinical review keeps its own copy of
 * the same logic in facts.ts for its fact rows).
 */
import type { BodyStateTag, DialValue, PreSessionCheckIn, WorkoutSession } from "../../types";
import {
  dialFromClientFeel,
  dialFromEnergyLevel,
  dialFromRegionState,
  dialFromSleepQuality,
  dialFromStressLevel,
  isDialValue,
  type ReadinessKey,
} from "./scales";

/** How the session landed: the Dial, else the legacy feel words, else null. */
export function doseOf(s: Pick<WorkoutSession, "dose" | "clientFeel"> | null | undefined): DialValue | null {
  if (!s) return null;
  if (isDialValue(s.dose)) return s.dose;
  return dialFromClientFeel(s.clientFeel);
}

/** One readiness dial, with its legacy fallback. Recovery has no legacy field. */
export function readinessDial(check: PreSessionCheckIn | null | undefined, key: ReadinessKey): DialValue | null {
  if (!check) return null;
  const v = check.readiness?.[key];
  if (isDialValue(v)) return v;
  switch (key) {
    case "sleep":
      return dialFromSleepQuality(check.sleepQuality);
    case "energy":
      return dialFromEnergyLevel(check.energyLevel);
    case "stress":
      return dialFromStressLevel(check.stressLevel);
    case "recovery":
      return null;
  }
}

/** A body region's Dial value, with the two-state fallback. */
export function regionDial(tag: Pick<BodyStateTag, "dial" | "state">): DialValue | null {
  if (isDialValue(tag.dial)) return tag.dial;
  return dialFromRegionState(tag.state);
}
