/**
 * MACHINE FIT — "Correct the starting weight" on the Setup screen.
 *
 * AJ, Oct 4 2026, Q3 (a) ("ill take all your recommended"): once the old
 * Prescription card went with the machine menu, nothing could change a
 * starting weight already on file — Setup only filled one in when there was
 * none (the load typed on a machine with no start stamps it). The starting
 * weight is the number the green % counts from (Q2 (a), machine-menu/
 * progress-figure.ts, shared with the Now Bar), so a trainer who copies the
 * true start from a paper chart needs a place to put it. It is here, beside
 * the load Setup already edits, and not on the machine menu, which stays the
 * same in both doors apart from the notes.
 *
 * THE RULES IT KEEPS
 *   · Only a machine with a starting weight ON FILE offers it.
 *   · It is a draft until Save set-up, like every box on this screen, and it
 *     counts as one unsaved change (setup-draft.ts `start`).
 *   · ± move it 2 lb (the Academy's two-pound increments); the number can
 *     also be typed. It never goes to 0 or below: a start is a load someone
 *     began at.
 *   · It needs no reason and blocks nothing: a box that doesn't hold a weight
 *     is simply not written, and the line under it says the number on file
 *     stands.
 *
 * PURE — no React, no Firestore. Every sentence the control says is here.
 */
import { MAX_LOAD_LB, parseStartingWeight } from "../setup-plan";

/** One tap of − or +, in lb. */
export const START_STEP_LB = 2;

export interface StartCorrection {
  /** What the box shows: the draft, else the number on file. */
  shown: string;
  /** `same`: what is on file; `changed`: a different weight; `invalid`: not a weight, so not written. */
  state: "same" | "changed" | "invalid";
  /** The corrected weight when `changed`. */
  value: number | null;
  /** "was 84 lb" once the box differs from what is on file. */
  was: string | null;
}

/** "84", "37.5": a load as the box shows it. */
export function loadText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The control's state for one machine. `saved` is the starting weight on file. */
export function startCorrection(draft: string | undefined, saved: number): StartCorrection {
  if (draft === undefined) return { shown: loadText(saved), state: "same", value: null, was: null };
  const n = parseStartingWeight(draft);
  if (n === null) return { shown: draft, state: "invalid", value: null, was: wasWords(saved) };
  if (n === saved) return { shown: draft, state: "same", value: null, was: null };
  return { shown: draft, state: "changed", value: n, was: wasWords(saved) };
}

/**
 * One tap of − (-1) or + (+1) from what the box shows (the number on file
 * when the box holds no weight), or null at a bound: never 0 or below, never
 * above the heaviest load the box takes.
 */
export function stepStart(shown: string, saved: number, dir: 1 | -1): string | null {
  const base = parseStartingWeight(shown) ?? saved;
  const next = Math.round((base + dir * START_STEP_LB) * 100) / 100;
  if (next <= 0 || next > MAX_LOAD_LB) return null;
  return loadText(next);
}

export const canStepStart = (shown: string, saved: number, dir: 1 | -1): boolean => stepStart(shown, saved, dir) !== null;

/** "was 84 lb" */
export function wasWords(saved: number): string {
  return `was ${loadText(saved)} lb`;
}

export const STARTING_WEIGHT_WORDS = {
  /** The button that opens the control. */
  open: "Correct the starting weight",
  label: "Starting weight",
  unit: "lb",
  /** What the number is for, under the control. */
  why: "The green % counts from the starting weight. Save set-up keeps the change.",
} as const;

/** "Starting weight 84 lb", beside the button while the control is shut. */
export function onFileWords(saved: number): string {
  return `${STARTING_WEIGHT_WORDS.label} ${loadText(saved)} lb`;
}

/** "Keep 84 lb": puts the number on file back and shuts the control. */
export function keepWords(saved: number): string {
  return `Keep ${loadText(saved)} lb`;
}

/** Under a box that doesn't hold a weight: nothing is written over the number on file. */
export function invalidWords(saved: number): string {
  return `Type the weight in pounds. Until then the starting weight stays ${loadText(saved)} lb.`;
}

/** The spoken names of the controls, with the machine (nothing is found by hover). */
export const startLabels = (machine: string) => ({
  group: `${STARTING_WEIGHT_WORDS.open} on ${machine}`,
  open: `${STARTING_WEIGHT_WORDS.open} on ${machine}`,
  input: `${machine} starting weight in pounds`,
  down: `${machine}: starting weight ${START_STEP_LB} lb lighter`,
  up: `${machine}: starting weight ${START_STEP_LB} lb heavier`,
});
