/**
 * BODY & PULSE → WHAT THE PULSE SAYS — the latest answer to each statement,
 * the pain map as she last told it, and one line per area.
 *
 * Client codex, Sep 2026 (phase 12). The Pulse is filled a piece at a time,
 * so "her latest Pulse" is not one document: it is the open draft's answers
 * where the draft has them, and otherwise the newest saved round that asked
 * (the LIVING RULE, assessment-history.ts). This module reads the two
 * together, the same way for every card on the page — the read grid, the
 * figure's rings, the Measured-and-told pairs — so none of them can disagree
 * about what she said.
 *
 * Where each half comes from:
 *   draft    the page's ONE `useCheckInDraft` (the Pulse editor), which is
 *            the only place an open round lives;
 *   history  the tab's one read-only history (`CodexData.pulse`, derived from
 *            the profile's progress-reports listener) — the saved rounds.
 *
 * Words, never numbers. Every answer is the Dial's own word: a statement on
 * the Pulse's five frequency words (Not at all … Nearly always), pain and
 * stress on the intensity words (Worst … None, left is worse). The statement
 * text and the area titles are the question bank's, verbatim. A stress
 * worry is the client's own words.
 *
 * Unknown is not "not asked": when the history could not be read the page
 * says so itself; here, no answer found is simply null.
 *
 * Pure: no React, no Firestore. pulse-read.test.ts (TZ=America/New_York).
 */
import { FREQUENCY_SCALE, INTENSITY_SCALE, dialWord, tenToAbsolute, type DialValue } from "../../rating/scales";
import { studioDayKeyOf } from "../../../lib/studio-time";
import {
  ALL_STATEMENT_IDS,
  BODY_REGION_LABELS,
  CATEGORY_BY_KEY,
  STRESS_CATEGORY_LABELS,
} from "../../subjective-report/questions";
import {
  dayOrInstantMs,
  freshnessOf,
  sectionTouches,
  statementAnswer,
  type AssessmentHistory,
  type AssessmentHistoryReport,
} from "../../subjective-report/assessment-history";
import { ALL_ASSESSMENT_SECTION_IDS, groupByPillar, sectionTitle } from "../../subjective-report/pillars";
import { painKeyOf } from "../../subjective-report/scoring";
import type {
  AssessmentChange,
  BodySide,
  PainPoint,
  StressAnchor,
  SubjectiveAssessment,
  SubjectiveCategoryKey,
} from "../../subjective-report/types";
import { FORD_PULSE_STRESS } from "../../ford/pulse-links";
import { FORD_PILLARS, type FordPillar } from "../../ford/types";
import { dayKeyDate, monthDayYear } from "../kit/text";

/* ------------------------------------------------------------------ */
/* What the page hands in                                              */
/* ------------------------------------------------------------------ */

/** The open draft, as `useCheckInDraft` holds it. */
export interface PulseDraftView {
  assessment: SubjectiveAssessment;
  /** When the draft was last written, epoch ms. */
  savedAt: number | null;
  /** Areas the coach settled ("nothing to report"). */
  reviewed: readonly string[];
  /** Areas the draft has answered or settled (the hook's `sections[].isDone`). */
  doneIds?: readonly string[];
}

export interface PulseSource {
  /** The open draft once it is loaded; null while it loads or when no round is open. */
  draft: PulseDraftView | null;
  /** The saved rounds, newest first (the tab's one history); null while unknown. */
  history: AssessmentHistory | null;
}

export type ReadingSource = "draft" | "report";

export interface PulseReading {
  /** The stored answer, 0–10. */
  value: number;
  /** The Dial's word for it. */
  word: string;
  /** The Dial position (−2…2), for comparing two answers. */
  dial: DialValue;
  /** The studio day it was given, yyyy-mm-dd ("" when it cannot be told). */
  day: string;
  source: ReadingSource;
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

/** Saved rounds, newest first by their day (the history is already; this makes sure). */
export function roundsNewestFirst(history: AssessmentHistory | null | undefined): AssessmentHistoryReport[] {
  const t = (r: AssessmentHistoryReport) => dayOrInstantMs(r.date) ?? r.savedAtMs ?? 0;
  return (history?.reports ?? []).slice().sort((a, b) => t(b) - t(a));
}

const reportDay = (r: AssessmentHistoryReport): string => studioDayKeyOf(r.date) ?? "";

/**
 * The day the open draft touched an area: its newest change-log entry for
 * that area, else the draft's last save. "" when neither is known.
 */
export function draftDayOf(draft: PulseDraftView, areaId: string): string {
  let newest: string | null = null;
  for (const c of (draft.assessment.changeLog ?? []) as AssessmentChange[]) {
    if (c.categoryId !== areaId) continue;
    if (newest === null || c.at > newest) newest = c.at;
  }
  if (newest) return studioDayKeyOf(newest) ?? "";
  return draft.savedAt ? (studioDayKeyOf(new Date(draft.savedAt)) ?? "") : "";
}

/** "Mar 10", or "Mar 10, 2025" when it is not this year; "" when not a day. */
export function dayWords(dayKey: string | null | undefined, now: Date): string {
  const d = dayKeyDate(dayKey);
  return d ? monthDayYear(d, now) : "";
}

/* ------------------------------------------------------------------ */
/* Statements                                                          */
/* ------------------------------------------------------------------ */

const AREA_OF_STATEMENT = new Map<string, SubjectiveCategoryKey>(
  Object.values(CATEGORY_BY_KEY).flatMap((c) => c.statements.map((s) => [s.id, c.key] as const)),
);

/** A statement's words, verbatim; null for an id the bank does not have. */
export function statementTextOf(id: string): string | null {
  const area = AREA_OF_STATEMENT.get(id);
  return area ? (CATEGORY_BY_KEY[area].statements.find((s) => s.id === id)?.text ?? null) : null;
}

function frequencyReading(value: number, day: string, source: ReadingSource): PulseReading {
  const dial = tenToAbsolute(value, FREQUENCY_SCALE) ?? 0;
  return { value, word: dialWord(FREQUENCY_SCALE, dial), dial, day, source };
}

/**
 * The latest answer to every statement that has one. The open draft's own
 * answer wins; otherwise the newest saved round that answered it — the living
 * rule: a round that did not ask about a statement did not clear it.
 */
export function latestPulseReadings(source: PulseSource): Map<string, PulseReading> {
  const out = new Map<string, PulseReading>();
  const rounds = roundsNewestFirst(source.history);
  for (const id of ALL_STATEMENT_IDS) {
    const area = AREA_OF_STATEMENT.get(id) ?? "";
    const own = source.draft ? statementAnswer(source.draft.assessment, id) : null;
    if (own !== null && source.draft) {
      out.set(id, frequencyReading(own, draftDayOf(source.draft, area), "draft"));
      continue;
    }
    for (const r of rounds) {
      const v = statementAnswer(r.assessment, id);
      if (v !== null) {
        out.set(id, frequencyReading(v, reportDay(r), "report"));
        break;
      }
    }
  }
  return out;
}

/**
 * The answer a statement had BEFORE `current`, when it was a different word:
 * the newest earlier saved round that answered it with another word. Null
 * when it has only ever had this word, or was asked once.
 */
export function previousReading(statementId: string, source: PulseSource, current: PulseReading): PulseReading | null {
  const rounds = roundsNewestFirst(source.history);
  for (const r of rounds) {
    const day = reportDay(r);
    // Only rounds before the current answer's: the draft is newer than every
    // saved round; a saved answer is compared with the rounds before its day.
    if (current.source === "report" && !(day < current.day)) continue;
    const v = statementAnswer(r.assessment, statementId);
    if (v === null) continue;
    const reading = frequencyReading(v, day, "report");
    if (reading.word !== current.word) return reading;
  }
  return null;
}

/**
 * Which statement an area shows, one per area: the most recently answered —
 * the draft's first, then by day — with ties going to the question bank's
 * order. Null when none of its statements has an answer.
 */
export function shownStatement(
  area: SubjectiveCategoryKey,
  readings: ReadonlyMap<string, PulseReading>,
): { id: string; text: string; reading: PulseReading } | null {
  let best: { id: string; text: string; reading: PulseReading } | null = null;
  for (const s of CATEGORY_BY_KEY[area].statements) {
    const r = readings.get(s.id);
    if (!r) continue;
    if (!best) {
      best = { id: s.id, text: s.text, reading: r };
      continue;
    }
    const a = r.source === "draft" ? 1 : 0;
    const b = best.reading.source === "draft" ? 1 : 0;
    // Strictly newer only: an equal day keeps the earlier statement (bank order).
    if (a > b || (a === b && r.day > best.reading.day)) best = { id: s.id, text: s.text, reading: r };
  }
  return best;
}

/**
 * "“I feel stronger than I did 3 months ago.” Often, up from Rarely in
 * September." — a statement against its previous different answer. Null when
 * there is none. Higher is better on every Pulse statement. `day` (words,
 * "Jan 10") puts the current answer's own day after its word — "Often (Jan
 * 10), up from …" — for a line whose surroundings name a newer day.
 */
export function statementChange(
  text: string,
  reading: PulseReading,
  previous: PulseReading | null,
  now: Date,
  day?: string,
): string | null {
  if (!previous || previous.dial === reading.dial) return null;
  const when = dayKeyDate(previous.day);
  const month = when
    ? when.getFullYear() === now.getFullYear()
      ? when.toLocaleDateString("en-US", { month: "long" })
      : when.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";
  const dir = reading.dial > previous.dial ? "up" : "down";
  return `“${text}” ${reading.word}${day ? ` (${day})` : ""}, ${dir} from ${previous.word}${month ? ` in ${month}` : ""}.`;
}

/* ------------------------------------------------------------------ */
/* The pain map                                                        */
/* ------------------------------------------------------------------ */

export interface PainSpot {
  point: PainPoint;
  /** The intensity word (Worst … None). */
  word: string;
  /** The last different word for the same spot (region and side), from an earlier round. */
  prev: { word: string; day: string } | null;
}

export interface PainReading {
  /** Active and improving spots; a resolved spot is not drawn or listed. */
  spots: PainSpot[];
  /** The round that last looked at pain found nothing active. */
  reviewedNone: boolean;
  day: string;
  source: ReadingSource;
}

const intensityWord = (severity: number) => dialWord(INTENSITY_SCALE, tenToAbsolute(severity, INTENSITY_SCALE));
const livePoints = (points: readonly PainPoint[] | null | undefined) =>
  (points ?? []).filter((p) => p && p.status !== "resolved" && Number.isFinite(p.severity));

/**
 * The pain map as she last told it: the open draft's when the draft has
 * looked at pain (a spot, or "nothing to report"), else the newest saved
 * round that did. Null when no round has ever asked.
 */
export function latestPain(source: PulseSource): PainReading | null {
  const rounds = roundsNewestFirst(source.history);
  let points: PainPoint[] | null = null;
  let day = "";
  let from: ReadingSource = "report";
  let olderThan: string | null = null;

  const d = source.draft;
  if (d && ((d.assessment.painMap ?? []).length > 0 || d.reviewed.includes("pain"))) {
    points = d.assessment.painMap ?? [];
    day = draftDayOf(d, "pain");
    from = "draft";
  } else {
    const r = rounds.find((x) => (x.assessment.painMap ?? []).length > 0 || x.sectionsReviewed.includes("pain"));
    if (!r) return null;
    points = r.assessment.painMap ?? [];
    day = reportDay(r);
    olderThan = day;
  }

  const earlier = olderThan === null ? rounds : rounds.filter((r) => reportDay(r) < (olderThan as string));
  const spots: PainSpot[] = livePoints(points).map((point) => {
    const word = intensityWord(point.severity);
    const key = painKeyOf(point);
    let prev: PainSpot["prev"] = null;
    for (const r of earlier) {
      const match = livePoints(r.assessment.painMap).find((p) => painKeyOf(p) === key);
      if (!match) continue;
      const w = intensityWord(match.severity);
      if (w !== word) {
        prev = { word: w, day: reportDay(r) };
        break;
      }
    }
    return { point, word, prev };
  });
  // Most severe first.
  spots.sort((a, b) => b.point.severity - a.point.severity);
  return { spots, reviewedNone: spots.length === 0, day, source: from };
}

/** "right knee", "knee (both sides)", "neck" — the way a sentence says a spot. */
export function spotWords(point: Pick<PainPoint, "region" | "side">): string {
  const region = (BODY_REGION_LABELS[point.region] ?? point.region).toLowerCase();
  const side: BodySide | undefined = point.side;
  if (side === "left" || side === "right") return `${side} ${region}`;
  if (side === "both") return `${region} (both sides)`;
  return region;
}

/* ------------------------------------------------------------------ */
/* Stress                                                              */
/* ------------------------------------------------------------------ */

export interface StressReading {
  anchors: StressAnchor[];
  day: string;
  source: ReadingSource;
}

/** The stress anchors as last told: the draft's once it has touched stress, else the newest round that did. */
export function latestStress(source: PulseSource): StressReading | null {
  const touched = (a: SubjectiveAssessment, reviewed: readonly string[]) =>
    (a.stressAnchors ?? []).length > 0 || reviewed.includes("stress");
  const d = source.draft;
  if (d && touched(d.assessment, d.reviewed)) {
    return {
      anchors: (d.assessment.stressAnchors ?? []).filter((x) => x && x.status !== "resolved"),
      day: draftDayOf(d, "stress"),
      source: "draft",
    };
  }
  const r = roundsNewestFirst(source.history).find((x) => touched(x.assessment, x.sectionsReviewed));
  if (!r) return null;
  return {
    anchors: (r.assessment.stressAnchors ?? []).filter((x) => x && x.status !== "resolved"),
    day: reportDay(r),
    source: "report",
  };
}

/** A worry in the client's own words, else the category's label. */
export function stressLabel(anchor: Pick<StressAnchor, "label" | "category">): string {
  return (anchor.label ?? "").trim() || STRESS_CATEGORY_LABELS[anchor.category] || "Something else";
}

/* ------------------------------------------------------------------ */
/* The read grid                                                       */
/* ------------------------------------------------------------------ */

export const STALE_SUFFIX = " · over 90 days, due a look";
export const NOT_ASKED = "Not asked yet";
/** How many stress worries an area line names. */
export const STRESS_SHOWN = 2;

export interface PulseAreaRow {
  id: string;
  /** The area's title, verbatim (the question bank's, or the panel's for the four extras). */
  title: string;
  line: string;
  /** Untouched for more than 90 days (and the history can say so). */
  stale: boolean;
  /** FORD pillars that show one of this row's stress worries (the stress row only). */
  alsoOnFord: FordPillar[];
}

export interface PulsePillarRows {
  title: string;
  rows: PulseAreaRow[];
}

/** "On target 5 days a week" from the newest source that has a number. */
function daysRow(
  source: PulseSource,
  id: "protein" | "hydration",
  rounds: AssessmentHistoryReport[],
  now: Date,
): string {
  const own = source.draft?.assessment[id]?.daysPerWeekOnTarget;
  let n: number | null = typeof own === "number" && Number.isFinite(own) ? own : null;
  let day = n !== null && source.draft ? draftDayOf(source.draft, id) : "";
  if (n === null) {
    for (const r of rounds) {
      const v = r.assessment[id]?.daysPerWeekOnTarget;
      if (typeof v === "number" && Number.isFinite(v)) {
        n = v;
        day = reportDay(r);
        break;
      }
    }
  }
  if (n === null) return NOT_ASKED;
  const when = dayWords(day, now);
  return `On target ${n} ${n === 1 ? "day" : "days"} a week${when ? ` · ${when}` : ""}`;
}

function painRow(source: PulseSource, now: Date): string {
  const pain = latestPain(source);
  if (!pain) return NOT_ASKED;
  const when = dayWords(pain.day, now);
  if (pain.spots.length === 0) return `Nothing to report${when ? ` · ${when}` : ""}`;
  const parts = pain.spots.map((s) => `${spotWords(s.point)} ${s.word}`);
  const line = parts.join(" · ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}${when ? ` · ${when}` : ""}`;
}

function stressRow(source: PulseSource, now: Date): { line: string; alsoOnFord: FordPillar[] } {
  const stress = latestStress(source);
  if (!stress) return { line: NOT_ASKED, alsoOnFord: [] };
  const when = dayWords(stress.day, now);
  if (stress.anchors.length === 0) return { line: `Nothing to report${when ? ` · ${when}` : ""}`, alsoOnFord: [] };
  const shown = stress.anchors
    .slice()
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))
    .slice(0, STRESS_SHOWN);
  const parts = shown.map((a) => `${stressLabel(a)} · ${intensityWord(a.intensity)}`);
  const more = stress.anchors.length - shown.length;
  if (more > 0) parts.push(`${more} more`);
  const pillars = FORD_PILLARS.filter((p) => shown.some((a) => FORD_PULSE_STRESS[p].includes(a.category)));
  return { line: `${parts.join(" · ")}${when ? ` · ${when}` : ""}`, alsoOnFord: pillars };
}

/**
 * One line per area, grouped by the Pulse's three pillars, as the read grid
 * shows them. `now` is the studio's now (for "Mar 10" and the 90 days).
 */
export function pulseAreaRows(source: PulseSource, now: Date): PulsePillarRows[] {
  const readings = latestPulseReadings(source);
  const rounds = roundsNewestFirst(source.history);
  const touches = sectionTouches({
    history: source.history,
    draftChangeLog: source.draft?.assessment.changeLog ?? null,
    draftDoneIds: source.draft?.doneIds ?? [],
    draftSavedAtMs: source.draft?.savedAt ?? null,
  });
  const nowMs = now.getTime();

  const rowFor = (id: string): PulseAreaRow => {
    let line = NOT_ASKED;
    let alsoOnFord: FordPillar[] = [];
    if (id in CATEGORY_BY_KEY) {
      const shown = shownStatement(id as SubjectiveCategoryKey, readings);
      if (shown) {
        const when = dayWords(shown.reading.day, now);
        line = `“${shown.text}” ${shown.reading.word}${when ? ` · ${when}` : ""}`;
      }
    } else if (id === "protein" || id === "hydration") {
      line = daysRow(source, id, rounds, now);
    } else if (id === "pain") {
      line = painRow(source, now);
    } else if (id === "stress") {
      ({ line, alsoOnFord } = stressRow(source, now));
    }
    const stale = line !== NOT_ASKED && freshnessOf(id, touches, source.history, nowMs) === "stale";
    return { id, title: sectionTitle(id), line: stale ? `${line}${STALE_SUFFIX}` : line, stale, alsoOnFord };
  };

  return groupByPillar(ALL_ASSESSMENT_SECTION_IDS.map((id) => ({ id }))).map((g) => ({
    title: g.pillar?.title ?? "Other",
    rows: g.items.map((it) => rowFor(it.id)),
  }));
}
