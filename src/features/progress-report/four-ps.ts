/**
 * THE 4 P's ON THE DIAL — Posture · Pace · Path · Purpose (reporting round,
 * Sep 2026).
 *
 * Before this round each P had TWO controls: a red / black / green status
 * and a 1–5 rank drawn as five bars, and the printed card said "4 / 5". Now
 * each P is one Dial on the mastery scale (Needs work · Developing · Solid ·
 * Strong · Mastered) and nothing a trainer rates is shown as a number.
 *
 * STORAGE
 * -------
 * `performanceMatrix.<p>.score` is the field every older report already
 * carries: the rank × 20 (20 … 100), read back as `round(score / 20)`. It
 * stays the store, so a report saved in August prints the same way in
 * October. The Dial's −2 … +2 is the rank 1 … 5 (`rank = v + 3`).
 *
 * UNTOUCHED = NOT RATED. The old editor started every P at 80 (rank 4 —
 * "Strong") and printed it whether or not the trainer had looked. A new
 * report now starts every P at `UNRATED_SCORE` (0), which no old report ever
 * wrote (the buttons only wrote 20 … 100), and the card says "Not rated"
 * until the trainer taps. An old report's 80 still reads as Strong — that is
 * what its trainer saw and left standing.
 *
 * `status` — the red / black / green the talking points carry — is DERIVED
 * from the rank on every write (≤ 2 red, 3 black, ≥ 4 green) so anything
 * that still reads it keeps working. Nothing writes it by hand any more.
 *
 * Pure: no React. `four-ps.test.ts` pins every conversion.
 */
import { MASTERY_SCALE, dialWord, isDialValue, type DialValue } from "../rating/dial";

export const FOUR_PS = ["posture", "pace", "path", "purpose"] as const;
export type PKey = (typeof FOUR_PS)[number];

/** 1 … 5, the rank the report has always stored (as `score = rank × 20`). */
export type PRank = 1 | 2 | 3 | 4 | 5;

/** The talking points' legacy status, derived from the rank. */
export type PStatus = "red" | "black" | "green";

/** A score no old report ever wrote: "the trainer has not rated this P". */
export const UNRATED_SCORE = 0;

export const P_TITLES: Record<PKey, string> = {
  posture: "Posture",
  pace: "Pace",
  path: "Path",
  purpose: "Purpose",
};

/* ------------------------------------------------------------------ *
 * Rank ↔ Dial
 * ------------------------------------------------------------------ */

export function rankFromDial(v: DialValue): PRank {
  return (v + 3) as PRank;
}

export function dialFromRank(rank: number | null | undefined): DialValue | null {
  if (rank === null || rank === undefined || !Number.isFinite(rank)) return null;
  const v = Math.round(rank) - 3;
  return isDialValue(v) ? v : null;
}

/* ------------------------------------------------------------------ *
 * Rank ↔ the stored score
 * ------------------------------------------------------------------ */

export function scoreFromRank(rank: PRank): number {
  return rank * 20;
}

/**
 * The stored score → rank, or null when the P was never rated. Anything an
 * old report wrote (20 … 100, or an odd value from a hand edit) lands on the
 * nearest rank; 0, a missing field or garbage is "not rated".
 */
export function rankFromScore(score: number | null | undefined): PRank | null {
  if (score === null || score === undefined || !Number.isFinite(score) || score <= 0) return null;
  const r = Math.max(1, Math.min(5, Math.round(score / 20)));
  return r as PRank;
}

/** The Dial position for a stored score (null = not rated). */
export function dialFromScore(score: number | null | undefined): DialValue | null {
  return dialFromRank(rankFromScore(score));
}

/** The stored score for a Dial position; a cleared dial stores "not rated". */
export function scoreFromDial(v: DialValue | null): number {
  return v === null ? UNRATED_SCORE : scoreFromRank(rankFromDial(v));
}

/* ------------------------------------------------------------------ *
 * Derived status and words
 * ------------------------------------------------------------------ */

/** ≤ 2 red · 3 black · ≥ 4 green. An unrated P is black (nothing said yet). */
export function statusFromRank(rank: PRank | null): PStatus {
  if (rank === null) return "black";
  if (rank <= 2) return "red";
  if (rank === 3) return "black";
  return "green";
}

/** The mastery word for a rank — what the card prints. Never a number. */
export function masteryWord(rank: PRank | null): string {
  return dialWord(MASTERY_SCALE, dialFromRank(rank));
}

/** The mastery word for a stored score. */
export function masteryWordForScore(score: number | null | undefined): string {
  return masteryWord(rankFromScore(score));
}

/**
 * How a rated P colours on the card. Colour by urgency, never by identity:
 * the tones are the Dial's own (rating.css), so a "Needs work" P on the
 * report looks like a "Rough night" on the briefing.
 */
export type PTone = "alert" | "warn" | "live" | "ok" | "ok-strong" | "none";

export function toneFromRank(rank: PRank | null): PTone {
  switch (rank) {
    case 1:
      return "alert";
    case 2:
      return "warn";
    case 3:
      return "live";
    case 4:
      return "ok";
    case 5:
      return "ok-strong";
    default:
      return "none";
  }
}

/* ------------------------------------------------------------------ *
 * The Clinical Performance Matrix text — definitions and talking points
 * ------------------------------------------------------------------ */

export interface PText {
  title: string;
  definition: string;
  /** The suggested talking point at the top, the middle and the bottom of the scale. */
  rank5: string;
  rank3: string;
  rank1: string;
}

export const FOUR_PILLARS_DATA: Record<PKey, PText> = {
  posture: {
    title: "POSTURE",
    definition:
      "Maintaining a perfectly rigid midsection and stable setup from head to toe to prevent energy leaks and ensure precise loading of the target muscle.",
    rank5:
      "Maintained a completely locked torso, neutral head, and relaxed face through the hardest reps. Zero shifting or wiggling.",
    rank3:
      "Great initial setup, but experienced structural breakdown (e.g., chest collapsing, chin tucking, or wiggling) as discomfort increased.",
    rank1:
      "Required constant cueing to maintain basic joint stacking, keep hips anchored, or keep feet planted.",
  },
  pace: {
    title: "PACE",
    definition:
      "Moving at a smooth, continuous 6-to-10-second speed to eliminate momentum, forcing the muscles to manage the load at all times.",
    rank5:
      "Masterful, unvarying speed. Turnarounds were perfectly seamless ('touch and go') with absolutely no pausing or resting at the bottom.",
    rank3:
      "Mostly controlled, but instinctively sped up during the pushing phase or paused slightly at the turnarounds to catch a break.",
    rank1:
      "Movements were fast, segmented, or jerky. Struggled to control the weight on the descent (dropping the weight).",
  },
  path: {
    title: "PATH",
    definition:
      "Keeping the limbs in the exact prescribed plane of motion to force the intended muscle to do the work, fighting the instinct to shift to fresh muscles.",
    rank5:
      "Limbs tracked flawlessly. Completely overcame the survival instinct to shift the load, keeping tension exactly where it belonged.",
    rank3:
      "Path altered slightly under heavy load (e.g., elbows flaring, shoulders shrugging) in an attempt to find the path of least resistance.",
    rank1:
      "Major deviations from the prescribed movement path, which unloads the target muscle and requires physical correction.",
  },
  purpose: {
    title: "PURPOSE",
    definition:
      "The mental intent to maximize Motor Unit Recruitment (MUR) by actively pushing harder as fatigue sets in, rather than just trying to survive the set.",
    rank5:
      "Actively embraced the discomfort. Voluntarily increased effort (pushed/pulled harder) as the weight bogged down to reach the Stimulating Reps.",
    rank3:
      "Tolerated the high effort but mentally 'hung on' to survive rather than actively attacking the final reps. Needed heavy vocal prompting.",
    rank1:
      "Aborted the set at the first sensation of muscle burning. Unwilling to exert the meaningful effort required to trigger an adaptation.",
  },
};

/**
 * The suggested talking point for a rank: Mastered → the top text, Needs
 * work / Developing → the bottom, everything else (and an unrated P) → the
 * middle. Same thresholds the old editor used, so a saved "include in
 * summary" still matches its text.
 */
export function talkingPointFor(p: PKey, rank: PRank | null): string {
  const t = FOUR_PILLARS_DATA[p];
  if (rank === 5) return t.rank5;
  if (rank !== null && rank <= 2) return t.rank1;
  return t.rank3;
}

/* ------------------------------------------------------------------ *
 * Writing one P
 * ------------------------------------------------------------------ */

/** The shape of one P on the report (src/types.ts `performanceMatrix.<p>`). */
export interface PEntry {
  score: number;
  note: string;
  talkingPoints: { id: string; text: string; status: PStatus }[];
}

/**
 * One P after a Dial tap: the score for the position, and every talking
 * point's status derived from it. A cleared dial stores "not rated". The
 * note is untouched.
 */
export function withDial(entry: PEntry | undefined, v: DialValue | null): PEntry {
  const score = scoreFromDial(v);
  const status = statusFromRank(rankFromScore(score));
  return {
    score,
    note: entry?.note ?? "",
    talkingPoints: (entry?.talkingPoints ?? []).map((tp) => ({ ...tp, status })),
  };
}
