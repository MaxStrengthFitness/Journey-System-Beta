/**
 * THE DIAL — the one way anything about a client is rated.
 *
 * Reporting round, Sep 2026. Before this round the app asked a trainer to
 * rate things eleven different ways: sleep was three words, stress was 1–5,
 * energy and mood were three words each, body regions were two states, the
 * post-session feel was three words, the closing note was Low/Medium/High,
 * journal notes were Standard/Elevated/Critical, the 4 P's were
 * red/black/green AND a 1–5 rank, and the assessment was 0–10 per statement
 * with pain and stress on their own 0–10s. None of it was wrong on its own.
 * Together it meant a trainer re-learned how to answer on every screen.
 *
 * There are only two kinds of question underneath:
 *
 *   1. RATE something → the Dial (this file + Dial.tsx). Five positions.
 *   2. WRITE something and say how loud it is → Loudness (Loudness.tsx),
 *      which is the journal's existing three importances with one component
 *      and one set of words.
 *
 * THE ANCHOR
 * ----------
 * The centre of the Dial is where we expect the client to be, and the trainer
 * records DRIFT. What the centre means depends on the question:
 *
 *   relative  — the centre is THIS CLIENT'S USUAL ("how'd you sleep — about
 *               normal?"), or the RIGHT DOSE after a session (Goldilocks:
 *               too much · just right · too little). Two intensities each way.
 *   absolute  — the centre is the middle of a fixed scale: the reference
 *               document's own frequency words (Not at all … Nearly always)
 *               on the Pulse, how far a P has come, how bad a pain is.
 *
 * A trainer who has trained a client thirty times knows whether she is off
 * today and roughly by how much. They do not know whether her sleep is a 6
 * or a 7 out of 10, and asking makes them look at the screen instead of the
 * client. That is the whole argument for five positions.
 *
 * THREE RULES EVERY DIAL OBEYS
 * ----------------------------
 *   • Left is always worse, right is always better. Even for pain: the words
 *     run Worst → None, not None → Worst, so the thumb never has to remember
 *     which way a scale goes. Consistency of direction beats numeric order.
 *   • The centre is the RESTING position on screen, but nothing is stored
 *     until the trainer taps. An untouched dial is "not asked" (`null`), not
 *     "as usual". Storing 0 by default would let the Kaizen deep dive find
 *     that a client slept normally on two hundred nights nobody asked about —
 *     a confident wrong number, which is worse than a missing one. Tapping
 *     the centre explicitly confirms "normal", and that is one tap, so
 *     exception-only logging still holds.
 *   • Nothing a trainer rates is ever shown to them as a number. Words on
 *     screen; the number is for storage and the deep dive.
 *
 * Pure: no React, no Firestore. `scales.test.ts` pins every word set and every
 * legacy conversion.
 */

import type { DialValue } from "../../types";

/** Five positions. 0 is the centre. Declared in src/types.ts beside the session fields that store it. */
export type { DialValue };

export const DIAL_VALUES: readonly DialValue[] = [-2, -1, 0, 1, 2] as const;

export function isDialValue(v: unknown): v is DialValue {
  return v === -2 || v === -1 || v === 0 || v === 1 || v === 2;
}

/** Clamp any number onto the five positions (rounds toward the centre on .5). */
export function toDialValue(n: number): DialValue {
  if (!Number.isFinite(n)) return 0;
  const r = Math.max(-2, Math.min(2, Math.round(n)));
  return r as DialValue;
}

/**
 * Words for the five positions, left to right — always worse → better.
 * Index 2 is the centre.
 */
export type DialWords = readonly [string, string, string, string, string];

export type DialMode = "relative" | "absolute";

export interface DialScale {
  /** Stable id — stored nowhere, used for tests and aria labels. */
  id: string;
  mode: DialMode;
  /** The five words, worst first. */
  words: DialWords;
  /** The question a trainer reads out, e.g. "How'd you sleep?" */
  ask: string;
  /**
   * What to say when nothing has been tapped. Relative dials say the centre
   * word muted ("As usual") because that is what the screen is resting on;
   * absolute dials say nothing is chosen.
   */
  untouched: string;
}

/* ------------------------------------------------------------------ *
 * RELATIVE scales — the floor. Centre = this client's usual / the right dose.
 * ------------------------------------------------------------------ */

/** "On the way in": the four readiness questions. Same shape, own words. */
export const SLEEP_SCALE: DialScale = {
  id: "sleep",
  mode: "relative",
  ask: "How'd you sleep?",
  words: ["Rough night", "A bit short", "As usual", "Slept well", "Best in a while"],
  untouched: "Not asked",
};

export const ENERGY_SCALE: DialScale = {
  id: "energy",
  mode: "relative",
  ask: "How are you feeling?",
  words: ["Running on empty", "A bit flat", "As usual", "Good energy", "Firing"],
  untouched: "Not asked",
};

export const RECOVERY_SCALE: DialScale = {
  id: "recovery",
  mode: "relative",
  ask: "How's the body since last time?",
  words: ["Still wrecked", "Still feeling it", "As usual", "Fresh", "Fully recovered"],
  untouched: "Not asked",
};

/**
 * The studio day the briefing began asking the recovery question (the
 * reporting round, Sep 16 2026). It has no legacy field, so a session before
 * this day could not have been asked it: a reader that counts "not asked"
 * leaves those sessions out rather than calling them unasked (client codex,
 * phase 13 — `client-codex/body/arrivals.ts`).
 */
export const RECOVERY_ASKED_FROM = "2026-09-16";

export const STRESS_SCALE: DialScale = {
  id: "stress",
  mode: "relative",
  ask: "How's life this week?",
  words: ["Really stressed", "A bit stressed", "As usual", "Calmer", "Really calm"],
  untouched: "Not asked",
};

/** A body region, tapped on the map: tracks an injury coming back. */
export const REGION_SCALE: DialScale = {
  id: "region",
  mode: "relative",
  ask: "How is it today?",
  words: ["Pain", "Stiff", "As usual", "Better", "Recovered"],
  untouched: "Not asked",
};

/** After the session, judged by the trainer. Goldilocks. */
export const DOSE_SCALE: DialScale = {
  id: "dose",
  mode: "relative",
  ask: "How did the session land?",
  words: ["Wiped out", "Drained", "Just right", "Had more", "Barely worked"],
  untouched: "Not judged",
};

export const READINESS_KEYS = ["sleep", "energy", "recovery", "stress"] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

export const READINESS_SCALES: Record<ReadinessKey, DialScale> = {
  sleep: SLEEP_SCALE,
  energy: ENERGY_SCALE,
  recovery: RECOVERY_SCALE,
  stress: STRESS_SCALE,
};

/** What the briefing stores: only the dials that were tapped. */
export type Readiness = Partial<Record<ReadinessKey, DialValue>>;

/* ------------------------------------------------------------------ *
 * ABSOLUTE scales — the Pulse and the report card. Centre = the middle of a
 * fixed scale, and the words are the reference document's own.
 * ------------------------------------------------------------------ */

/**
 * The Subjective Report document's rating scale, verbatim: 0 Not At All,
 * 1 Rarely, 2 Sometimes, 3 Often, 4 Nearly Always. The Pulse stores answers
 * on the 0–10 scale its scoring already uses; see `absoluteToTen`.
 */
export const FREQUENCY_SCALE: DialScale = {
  id: "frequency",
  mode: "absolute",
  ask: "How often is this true?",
  words: ["Not at all", "Rarely", "Sometimes", "Often", "Nearly always"],
  untouched: "Not answered",
};

/**
 * Pain and stress intensity on the Pulse. WORST IS ON THE LEFT so the
 * direction rule holds; `absoluteToTen` reverses it for the stored 0–10
 * severity where 10 is worst.
 */
export const INTENSITY_SCALE: DialScale = {
  id: "intensity",
  mode: "absolute",
  ask: "How bad is it?",
  words: ["Worst", "Severe", "Moderate", "Mild", "None"],
  untouched: "Not answered",
};

/** How far a P (Posture, Pace, Path, Purpose) has come, on the report card. */
export const MASTERY_SCALE: DialScale = {
  id: "mastery",
  mode: "absolute",
  ask: "Where is this P today?",
  words: ["Needs work", "Developing", "Solid", "Strong", "Mastered"],
  untouched: "Not rated",
};

/* ------------------------------------------------------------------ *
 * Conversions — the Pulse's 0–10 storage
 * ------------------------------------------------------------------ */

/**
 * The five positions on the 0–10 scale the Pulse stores. These are exactly
 * where scale v2 already put the frequency words as anchors (0 / 3 / 5 / 8 /
 * 10), so an answer tapped on the Dial is scored, compared and logged like
 * every answer before it. Nothing in scoring.ts moves.
 */
export const TEN_POINTS: readonly [number, number, number, number, number] = [0, 3, 5, 8, 10];

/** Dial position → stored 0–10 value. Intensity is reversed (left = worst = 10). */
export function absoluteToTen(v: DialValue, scale: DialScale = FREQUENCY_SCALE): number {
  const idx = v + 2;
  const pts = scale.id === "intensity" ? [...TEN_POINTS].reverse() : TEN_POINTS;
  return pts[idx];
}

/** Stored 0–10 value → nearest Dial position. Old 0–10 answers land on the closest word. */
export function tenToAbsolute(n: number | null | undefined, scale: DialScale = FREQUENCY_SCALE): DialValue | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const pts = scale.id === "intensity" ? [...TEN_POINTS].reverse() : TEN_POINTS;
  let best = 0;
  let bestDist = Infinity;
  pts.forEach((p, i) => {
    const d = Math.abs(p - n);
    // Ties go to the position nearer the centre.
    if (d < bestDist || (d === bestDist && Math.abs(i - 2) < Math.abs(best - 2))) {
      best = i;
      bestDist = d;
    }
  });
  return (best - 2) as DialValue;
}

/* ------------------------------------------------------------------ *
 * Conversions — every legacy vocabulary the app wrote before this round.
 * Read-side only: nothing is migrated, and nothing writes these any more.
 * The deep dive reads history through these so a session from August and
 * one from October sit on the same axis.
 * ------------------------------------------------------------------ */

/** Poor / Average / Optimal. Three words can't say "really", so ±1 only. */
export function dialFromSleepQuality(v: unknown): DialValue | null {
  if (v === "poor") return -1;
  if (v === "average") return 0;
  if (v === "optimal") return 1;
  return null;
}

/** Stress 1–5, where 1 was calm and 5 was maxed out. */
export function dialFromStressLevel(v: unknown): DialValue | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return 1;
  if (n <= 3) return 0;
  if (n === 4) return -1;
  return -2;
}

/** Low / Normal / High. */
export function dialFromEnergyLevel(v: unknown): DialValue | null {
  if (v === "low") return -1;
  if (v === "normal") return 0;
  if (v === "high") return 1;
  return null;
}

/** Wiped Out / Good / Energized — the post-session feel before the Dial. */
export function dialFromClientFeel(v: unknown): DialValue | null {
  if (v === "Wiped Out" || v === "wiped") return -2;
  if (v === "Good" || v === "good") return 0;
  if (v === "Energized" || v === "energized") return 1;
  return null;
}

/** stiff / prime — the two-state body region before the Dial. */
export function dialFromRegionState(v: unknown): DialValue | null {
  if (v === "stiff") return -1;
  if (v === "prime") return 1;
  return null;
}

/** The reverse: what the legacy two-state field should say for a Dial value. */
export function regionStateFromDial(v: DialValue): "stiff" | "prime" {
  return v < 0 ? "stiff" : "prime";
}

/**
 * Low / Medium / High — the closing note's old priority. Maps onto the
 * journal's importances, which are what Loudness stores.
 */
export function importanceFromPriority(v: unknown): "standard" | "elevated" | "critical" {
  if (v === "High") return "critical";
  if (v === "Medium") return "elevated";
  return "standard";
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** The word for a value on a scale, or the scale's untouched text. */
export function dialWord(scale: DialScale, v: DialValue | null | undefined): string {
  if (v === null || v === undefined) return scale.untouched;
  return scale.words[v + 2];
}

/** True when the value is on the "worse" side — what a flag reads. */
export function isBelowCentre(v: DialValue | null | undefined): boolean {
  return v !== null && v !== undefined && v < 0;
}

/**
 * How a value colours: the app colours by urgency, never by identity.
 * `alert` and `warn` are the equipment tokens' names; `live` is the brand
 * blue the centre sits on; `ok` is the green the right side earns.
 */
export type DialTone = "alert" | "warn" | "live" | "ok" | "ok-strong";

export function dialTone(v: DialValue): DialTone {
  switch (v) {
    case -2:
      return "alert";
    case -1:
      return "warn";
    case 0:
      return "live";
    case 1:
      return "ok";
    case 2:
      return "ok-strong";
  }
}

/**
 * A readiness object with only the tapped keys, or `undefined` when nothing
 * was tapped — so a session that asked nothing stores nothing.
 */
export function compactReadiness(r: Readiness): Readiness | undefined {
  const out: Readiness = {};
  for (const k of READINESS_KEYS) {
    const v = r[k];
    if (isDialValue(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The lowest readiness reading, for a one-line summary ("arrived a bit
 * short on sleep"). Null when nothing was asked.
 */
export function worstReadiness(r: Readiness | undefined | null): { key: ReadinessKey; value: DialValue } | null {
  if (!r) return null;
  let worst: { key: ReadinessKey; value: DialValue } | null = null;
  for (const k of READINESS_KEYS) {
    const v = r[k];
    if (!isDialValue(v)) continue;
    if (!worst || v < worst.value) worst = { key: k, value: v };
  }
  return worst;
}
