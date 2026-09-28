/**
 * A CLIENT'S RHYTHM — her usual gap between visits, and the least it takes to
 * say one. Pure: rhythm.test.ts.
 *
 * The redesign's Operations room, phase 3 (Sep 28 2026; research-operations
 * §5.2 and §5.3). Every client is judged against HER OWN rhythm, never a
 * studio average: a once-a-week client twelve days out is fine, a twice-a-week
 * client twelve days out is not.
 *
 * TWO WAYS TO MEASURE IT, one rule:
 *
 *   rhythmFromVisits   the research's rule, from the visit days themselves:
 *                      the median of the last six gaps between visits in the
 *                      last twelve weeks, once there are at least six visits
 *                      spanning at least four weeks. This is what the nightly
 *                      job would store once AJ says yes to writing states
 *                      (not approved yet: the job is not touched).
 *   rhythmFromSnapshot what a screen can say TODAY without reading anyone's
 *                      history: last night's renewal snapshot already carries
 *                      her pace (visits a week over up to eight weeks, from
 *                      Mindbody bookings and Journey sessions, away time left
 *                      out; features/renewals/engine.ts computePace) and how
 *                      many of the last twelve weeks were observed. The usual
 *                      gap is 7 ÷ pace. The job stores the pace but not the
 *                      visits behind it, so the minimum is checked on an
 *                      estimate: pace × observed weeks (at most the pace's own
 *                      eight). Below the minimum it is "too new to judge",
 *                      never a guess.
 *
 * THE MIGRATION RULE. Both measures come from visits Mindbody and Journey hold
 * since the studio's bookings began syncing (the snapshot's attendanceSince),
 * so a twelve-year client whose visits are in FileMaker has no rhythm here
 * until enough recent visits exist: "too new to judge", never "new".
 */
import { daysBetween } from "../../client-history/model";
import type { RenewalSnapshot } from "../../renewals/types";

/** A usual gap needs at least this many visits… */
export const MIN_RHYTHM_VISITS = 6;
/** …spanning at least this many weeks. */
export const MIN_RHYTHM_WEEKS = 4;
/** Visits older than this are not her rhythm now. */
export const RHYTHM_WINDOW_DAYS = 84;
/** The usual gap is the median of her last this-many gaps. */
export const RHYTHM_GAPS = 6;
/** The pace the nightly job measures reaches back at most this many weeks (engine.ts, PACE_WINDOW_DAYS). */
export const PACE_WINDOW_WEEKS = 8;

export interface Rhythm {
  /** Her usual gap between visits, in days (a median, or 7 ÷ pace). */
  gapDays: number;
  /** Visits behind it (counted, or estimated from the pace). */
  visits: number;
  /** "every 3–4 days", "about once a week" — a person's words for the gap. */
  words: string;
  /** Where it came from, for the proof. */
  source: "visits" | "pace";
  /** The pace as the nightly job wrote it, when that is the source. */
  pacePerWeek: number | null;
  /** The gaps themselves, newest last, when counted from visits. */
  gaps: number[];
}

export type RhythmResult = { measured: true; rhythm: Rhythm } | { measured: false; visits: number | null; why: string };

/** A person's words for a usual gap: "every 3–4 days", "about once a week", "about every 2 weeks". */
export function gapWords(gapDays: number): string {
  if (gapDays < 1.5) return "most days";
  if (gapDays >= 6 && gapDays <= 8) return "about once a week";
  if (gapDays > 8 && gapDays < 12) return `about every ${Math.round(gapDays)} days`;
  if (gapDays >= 12) return `about every ${Math.round(gapDays / 7)} weeks`;
  const lo = Math.floor(gapDays);
  const hi = Math.ceil(gapDays);
  return lo === hi ? `every ${lo} days` : `every ${lo}–${hi} days`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The research's rule, from her visit days (yyyy-mm-dd, any order, repeats
 * allowed): the median of her last six gaps in the last twelve weeks, once
 * six visits span four weeks.
 */
export function rhythmFromVisits(days: readonly string[], today: string): RhythmResult {
  const recent = [...new Set(days.filter((d) => d <= today && daysBetween(d, today) < RHYTHM_WINDOW_DAYS))].sort();
  if (recent.length < MIN_RHYTHM_VISITS) {
    return { measured: false, visits: recent.length, why: `${recent.length} of ${MIN_RHYTHM_VISITS} visits in the last ${RHYTHM_WINDOW_DAYS / 7} weeks` };
  }
  const span = daysBetween(recent[0], recent[recent.length - 1]);
  if (span < MIN_RHYTHM_WEEKS * 7) {
    return { measured: false, visits: recent.length, why: `${recent.length} visits, but over less than ${MIN_RHYTHM_WEEKS} weeks` };
  }
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i += 1) gaps.push(daysBetween(recent[i - 1], recent[i]));
  const last = gaps.slice(-RHYTHM_GAPS);
  const gapDays = median(last);
  return { measured: true, rhythm: { gapDays, visits: recent.length, words: gapWords(gapDays), source: "visits", pacePerWeek: null, gaps: last } };
}

/**
 * What a screen can say without reading her history: last night's snapshot's
 * pace, held to the same minimum on an estimate of the visits behind it.
 */
export function rhythmFromSnapshot(s: Pick<RenewalSnapshot, "pacePerWeek" | "proof"> | null | undefined): RhythmResult {
  if (!s) return { measured: false, visits: null, why: "no nightly record for her yet" };
  const pace = typeof s.pacePerWeek === "number" && Number.isFinite(s.pacePerWeek) ? s.pacePerWeek : null;
  const weeks = typeof s.proof?.weeksObserved === "number" ? s.proof.weeksObserved : null;
  if (pace === null) return { measured: false, visits: null, why: "not enough weeks on record for a pace yet" };
  if (weeks === null || weeks < MIN_RHYTHM_WEEKS) return { measured: false, visits: null, why: `fewer than ${MIN_RHYTHM_WEEKS} weeks of visits on record` };
  if (pace <= 0) return { measured: false, visits: 0, why: "no visits in the weeks on record" };
  const visits = Math.round(pace * Math.min(PACE_WINDOW_WEEKS, weeks));
  if (visits < MIN_RHYTHM_VISITS) return { measured: false, visits, why: `about ${visits} of ${MIN_RHYTHM_VISITS} visits on record` };
  const gapDays = 7 / pace;
  return { measured: true, rhythm: { gapDays, visits, words: gapWords(gapDays), source: "pace", pacePerWeek: pace, gaps: [] } };
}

/** "about 2 a week over the last eight weeks" / "gaps 3, 4, 3, 4, 3, 4 days" — the rhythm's proof. */
export function rhythmProof(r: Rhythm): string {
  if (r.source === "visits") return `last ${r.gaps.length} gaps ${r.gaps.join(", ")} days`;
  const pace = r.pacePerWeek ?? 0;
  const per = pace === 1 ? "once a week" : `${pace} a week`;
  return `about ${per} over the last ${PACE_WINDOW_WEEKS} weeks`;
}
