/**
 * EFFORT, LATELY (the Atlas answers, Oct 2 2026) — the reader of the effort
 * rating the Wrap-up writes (`sessions.effort`). Every number needs a reader.
 *
 * AJ: the rating "is collected over time to see effort declining before it
 * becomes a problem, and to recognise clients who push hard" ("valuable to
 * the studios as review and potential testimonials"). So this says one of
 * three things, in a sentence, on the Kaizen Deep Dive:
 *   - her effort has been lower lately (a decline worth a conversation);
 *   - she has been pushing hard lately (worth recognising);
 *   - it has been about where it usually is;
 * and "not enough data yet" below the sample.
 *
 * THE RULES
 *   - A named minimum sample: `EFFORT_MIN_RATED` TAPPED ratings before
 *     anything is said.
 *   - A Wrap-up left untouched stores "As expected" marked `effortDefaulted`
 *     (AJ's call). A default is not a judgement: it never counts toward the
 *     sample, and NEVER toward a decline. It is only counted where it argues
 *     against a claim (a default in her last five is a workout that was not
 *     marked as pushing hard).
 *   - Sentences, not scores: no number of the Dial is shown, only counts of
 *     workouts.
 *   - It reads her LATEST workouts, whatever the report's range, because
 *     "lately" is about now.
 *
 * Pure: facts in, a sentence out.
 */
import type { DialValue } from "../../types";

/** Tapped effort ratings needed before anything is said. */
export const EFFORT_MIN_RATED = 6;
/** How many of her latest workouts "pushing hard lately" looks at. */
export const EFFORT_RECENT = 5;
/** Of those, how many marked Pushed hard or Gave everything. */
export const EFFORT_PUSHING_MIN = 3;
/** The latest rated workouts a decline is judged on, against the ones before. */
export const EFFORT_DECLINE_WINDOW = 4;
/** Of those, how many below As expected before a decline is said. */
export const EFFORT_DECLINE_BELOW_MIN = 2;
/** How far the recent average must sit under the earlier one, in Dial positions. */
export const EFFORT_DECLINE_DROP = 0.75;

export interface EffortFactLike {
  date: string;
  dayMs: number;
  effort?: { value: DialValue; defaulted: boolean } | null;
}

export type EffortStatus = "not-enough" | "declining" | "pushing" | "steady";

export interface EffortTrend {
  status: EffortStatus;
  sentence: string;
  /** Workouts with a tapped rating. */
  rated: number;
  /** Workouts left at the untouched default. */
  defaulted: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function effortTrend(facts: EffortFactLike[], firstName: string): EffortTrend {
  const who = firstName.trim() || "This client";
  const withEffort = facts.filter((f) => !!f.effort).sort((a, b) => a.dayMs - b.dayMs);
  const rated = withEffort.filter((f) => !f.effort!.defaulted);
  const defaulted = withEffort.length - rated.length;

  if (rated.length < EFFORT_MIN_RATED) {
    return {
      status: "not-enough",
      sentence: `Not enough data yet: ${rated.length} of the ${EFFORT_MIN_RATED} rated workouts this needs.${
        defaulted > 0 ? ` ${defaulted} left at As expected without a tap don't count.` : ""
      }`,
      rated: rated.length,
      defaulted,
    };
  }

  // A decline: tapped ratings only. Defaults never count toward it.
  const recentRated = rated.slice(-EFFORT_DECLINE_WINDOW);
  const earlierRated = rated.slice(0, -EFFORT_DECLINE_WINDOW).slice(-8);
  const below = recentRated.filter((f) => f.effort!.value < 0).length;
  if (
    earlierRated.length >= 2 &&
    below >= EFFORT_DECLINE_BELOW_MIN &&
    mean(recentRated.map((f) => f.effort!.value)) <= mean(earlierRated.map((f) => f.effort!.value)) - EFFORT_DECLINE_DROP
  ) {
    return {
      status: "declining",
      sentence: `${who}'s effort has been lower lately: ${below} of the last ${recentRated.length} rated workouts were below what was expected. Worth a conversation.`,
      rated: rated.length,
      defaulted,
    };
  }

  // Pushing hard: her last few workouts, a default counting as not pushing.
  const recent = withEffort.slice(-EFFORT_RECENT);
  const pushing = recent.filter((f) => !f.effort!.defaulted && f.effort!.value > 0).length;
  if (recent.length >= EFFORT_RECENT && pushing >= EFFORT_PUSHING_MIN) {
    return {
      status: "pushing",
      sentence: `${who} has been pushing hard lately: ${pushing} of the last ${recent.length} workouts were marked Pushed hard or Gave everything.`,
      rated: rated.length,
      defaulted,
    };
  }

  return {
    status: "steady",
    sentence: `${who}'s effort has been about where it usually is across ${rated.length} rated workouts.`,
    rated: rated.length,
    defaulted,
  };
}
