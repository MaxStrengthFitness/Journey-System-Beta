/**
 * BODY & PULSE → OVER TIME — the one timeline: how she arrives and how the
 * session lands, what she told us in the Pulse, and what InBody measured, on
 * one six-month axis (AJ's decisions 7, 8 and 9).
 *
 * Client codex, Sep 2026 (phase 13). The model only: which lanes, in which
 * order, with which points on which days, and every sentence the card says.
 * BodyTimeline.tsx turns it into pixels; nothing here knows a width.
 *
 * LANE ORDER (decision 7: the everyday half first):
 *
 *   1  "How's the body since last time?" at the door  — always
 *   2  sleep · 3 energy · 4 stress at the door        — when asked at least once
 *   5  How it landed, the dose                        — when judged at least once
 *   6  the Pulse: one statement each for Sleep & Recovery, Strength &
 *      Physical Confidence and Pain & Mobility (the one the read grid shows),
 *      then at most PAIN_LANES_MAX pain-map spots, most severe first
 *   7  InBody: skeletal muscle and body fat % (each with the scanner's
 *      normal variation around her first scan, her HOME studio's numbers),
 *      then weight (no band: weight is never called)
 *
 * Every reading sits where she gave it, on its own words: the door and the
 * dose on the Dial's five words, the Pulse on its frequency words (pain on
 * the intensity words, None at the top — better is higher), InBody as the
 * scanner printed it. Nothing is merged into a score, and no lane suggests
 * anything to do next.
 *
 * A read that has not answered is a row that says so ("Loading her recent
 * sessions…"), never an empty lane; a failed one says it couldn't be read,
 * and the rest of the timeline still draws. Days are studio day keys
 * throughout, with day arithmetic on the keys (client-history/model.ts) —
 * never `new Date("yyyy-mm-dd")`.
 *
 * Pure: no React, no Firestore. timeline.test.ts (TZ=America/New_York).
 */
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { FREQUENCY_SCALE, INTENSITY_SCALE, tenToAbsolute, type DialWords } from "../../rating/scales";
import { addDays, daysBetween } from "../../client-history/model";
import { CATEGORY_BY_KEY } from "../../subjective-report/questions";
import { statementAnswer } from "../../subjective-report/assessment-history";
import { painKeyOf } from "../../subjective-report/scoring";
import type { PainPoint, SubjectiveCategoryKey } from "../../subjective-report/types";
import type { InBodyScan } from "../../inbody/types";
import type { InBodyScansState } from "../../inbody/useInBodyScans";
import { formatMeasure, sortScans, type MeasureKey } from "../../inbody/scans";
import { thresholdFor, type InBodyVariation } from "../../inbody/variation";
import { COVERAGE_CAVEAT, PRIOR_SOURCE_LABEL, priorUncounted, type HistoryCoverage, type PriorHistory } from "../../../lib/prior-history";
import { studioDayKeyOf } from "../../../lib/studio-time";
import { agree, type Pronouns } from "../kit/pronouns";
import { plural } from "../kit/text";
import {
  ARRIVE_ORDER,
  arriveDetail,
  arriveSentence,
  arriveSummary,
  arriveValue,
  scaleOf,
  type ArriveKey,
  type ArrivalsRead,
} from "./arrivals";
import {
  dayWords,
  draftDayOf,
  latestPain,
  latestPulseReadings,
  roundsNewestFirst,
  shownStatement,
  spotWords,
  type PulseSource,
} from "./pulse-read";

/* ------------------------------------------------------------------ */
/* The window                                                          */
/* ------------------------------------------------------------------ */

export const TIMELINE_WEEKS = 26;
/** 26 weeks, in days. */
export const TIMELINE_DAYS = TIMELINE_WEEKS * 7;
/** At most this many pain-map spots get a lane. */
export const PAIN_LANES_MAX = 2;

export interface TimelineWindow {
  /** yyyy-mm-dd, TIMELINE_DAYS before `to`. */
  from: string;
  /** Today, the studio's day. */
  to: string;
  days: number;
}

/** The six months up to and including today, on studio day keys. */
export function timelineWindow(today: string): TimelineWindow {
  return { from: addDays(today, -TIMELINE_DAYS), to: today, days: TIMELINE_DAYS };
}

/** Days from the window's start, or null when the day is outside it (or not a day). */
export function dayOffset(window: TimelineWindow, day: string | null | undefined): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (day < window.from || day > window.to) return null;
  return daysBetween(window.from, day);
}

export interface TimelineMonth {
  day: string;
  offset: number;
  /** "Oct", and "Jan 2027" at a new year. */
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The first of every month inside the window (after its first day). */
export function monthTicks(window: TimelineWindow): TimelineMonth[] {
  const out: TimelineMonth[] = [];
  let y = Number(window.from.slice(0, 4));
  let m = Number(window.from.slice(5, 7));
  for (let i = 0; i < 14; i += 1) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const day = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
    const offset = dayOffset(window, day);
    if (offset === null) break;
    out.push({ day, offset, label: m === 1 ? `Jan ${y}` : MONTHS[m - 1] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lanes                                                               */
/* ------------------------------------------------------------------ */

/** The plot's height per lane kind, in px (the only pixels the model holds). */
export const LANE_PLOT_HEIGHT = { marks: 56, rung: 70, measure: 80 } as const;

interface LaneHead {
  key: string;
  /** The question, the statement in quotes, the spot, or the measure. */
  title: string;
  /** The lines under the title: where it comes from, and what it says. */
  lines: string[];
  /** The whole lane in words, for a screen reader (the SVG's <desc>). */
  desc: string;
}

/** A mark per session where the question was asked: a Dial position, 0 (worst) … 4. */
export interface LaneMark {
  day: string;
  offset: number;
  pos: number;
  word: string;
  /** Below the centre. */
  below: boolean;
}

/** A Pulse answer: a position on the scale's five words, 0 (worst) … 4 (best). */
export interface LanePoint {
  day: string;
  offset: number;
  pos: number;
  word: string;
}

/** An InBody reading, in the scanner's unit. */
export interface MeasurePoint {
  day: string;
  offset: number;
  value: number;
  /** "48.3 lb", "31.2%". */
  label: string;
}

export interface MarksLane extends LaneHead {
  kind: "marks";
  words: DialWords;
  marks: LaneMark[];
}

export interface RungLane extends LaneHead {
  kind: "rung";
  words: DialWords;
  points: LanePoint[];
  /** Two or more points draw a line. */
  line: boolean;
}

export interface MeasureLane extends LaneHead {
  kind: "measure";
  unit: "lb" | "%";
  points: MeasurePoint[];
  line: boolean;
  /** The scanner's normal variation around her first scan; null for weight. */
  band: { lo: number; hi: number } | null;
  /** The value range drawn: every point and the band, padded. */
  lo: number;
  hi: number;
}

/** A row that says why nothing is drawn: loading, failed, or nothing there. */
export interface GapLane extends LaneHead {
  kind: "gap";
  state: "loading" | "failed" | "none";
}

export type TimelineLane = MarksLane | RungLane | MeasureLane | GapLane;

export interface TimelineModel {
  window: TimelineWindow;
  months: TimelineMonth[];
  lanes: TimelineLane[];
  /** The card's lede: the recovery question over her sessions. */
  lede: string;
  /** The footer's sentences. */
  footer: string[];
}

/* ------------------------------------------------------------------ */
/* The door and the dose                                               */
/* ------------------------------------------------------------------ */

function sessionsUnknownText(read: ArrivalsRead, p: Pronouns): { state: GapLane["state"]; text: string } | null {
  if (read.state === "loading") return { state: "loading", text: `Loading ${p.possessive} recent sessions…` };
  if (read.state === "failed") {
    return {
      state: "failed",
      text: `${cap(p.possessive)} recent sessions couldn't be loaded just now, so how ${p.subject} arrived isn't drawn. The rest of this page is unaffected.`,
    };
  }
  if (read.state === "unordered") {
    return {
      state: "failed",
      text: `The sessions the app read for ${p.object} carry an older date format, so it can't tell which are recent; how ${p.subject} arrived isn't drawn.`,
    };
  }
  return null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function arriveLanes(read: ArrivalsRead, window: TimelineWindow, p: Pronouns, now: Date): TimelineLane[] {
  const unknown = sessionsUnknownText(read, p);
  if (unknown) {
    return [
      {
        kind: "gap",
        key: "gap:sessions",
        state: unknown.state,
        title: "At the door and after the session",
        lines: [unknown.text],
        desc: unknown.text,
      },
    ];
  }
  const lanes: TimelineLane[] = [];
  for (const key of ARRIVE_ORDER) {
    const summary = arriveSummary(read, key);
    if (key !== "recovery" && summary.asked === 0) continue;
    const scale = scaleOf(key);
    const sentence = arriveSentence(summary, p, now);
    const marks: LaneMark[] = [];
    for (const a of read.arrivals) {
      const v = arriveValue(a, key);
      const offset = dayOffset(window, a.day);
      if (v === null || offset === null) continue;
      marks.push({ day: a.day, offset, pos: v + 2, word: scale.words[v + 2], below: v < 0 });
    }
    const dose = key === "dose";
    lanes.push({
      kind: "marks",
      key: `arrive:${key}`,
      title: dose ? "How it landed" : `“${scale.ask}”`,
      // The recovery sentence is the card's lede; its lane says only where it is asked.
      lines:
        key === "recovery"
          ? ["At the door, in the briefing."]
          : [dose ? "After the session, judged by the trainer." : "At the door, in the briefing.", arriveDetail(summary, p, now)],
      desc: sentence,
      words: scale.words,
      marks,
    });
  }
  return lanes;
}

/* ------------------------------------------------------------------ */
/* The Pulse                                                           */
/* ------------------------------------------------------------------ */

/** The three areas whose statement the timeline draws, in the read grid's order. */
export const TIMELINE_PULSE_AREAS: readonly SubjectiveCategoryKey[] = [
  "sleepRecovery",
  "strengthConfidence",
  "painMobility",
];

const reportDay = (date: string) => studioDayKeyOf(date) ?? "";

/** Where a saved round's day sits, and whether the history reaches the window's start. */
function pulseSinceDay(source: PulseSource, window: TimelineWindow): string | null {
  const h = source.history;
  if (!h || h.complete || h.coversSinceMs === null) return null;
  const day = studioDayKeyOf(new Date(h.coversSinceMs));
  return day && day > window.from ? day : null;
}

/** "Often on Mar 10", "Sometimes on Sep 16, Often on Mar 10". */
function wordsOnDays(points: ReadonlyArray<{ word: string; day: string }>, now: Date): string {
  return points.map((pt) => `${pt.word}${dayWords(pt.day, now) ? ` on ${dayWords(pt.day, now)}` : ""}`).join(", ");
}

/** One statement's answers in the window, oldest first: each saved round's, then the open round's. */
export function statementSeries(statementId: string, source: PulseSource, window: TimelineWindow): LanePoint[] {
  const out: LanePoint[] = [];
  const push = (value: number | null, day: string) => {
    const offset = dayOffset(window, day);
    if (value === null || offset === null) return;
    const dial = tenToAbsolute(value, FREQUENCY_SCALE);
    if (dial === null) return;
    out.push({ day, offset, pos: dial + 2, word: FREQUENCY_SCALE.words[dial + 2] });
  };
  for (const r of roundsNewestFirst(source.history).reverse()) push(statementAnswer(r.assessment, statementId), reportDay(r.date));
  const d = source.draft;
  if (d) {
    const area = statementId.split("_")[0];
    push(statementAnswer(d.assessment, statementId), draftDayOf(d, area));
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** One pain-map spot (region and side) in the window, oldest first: its intensity word each time it was told. */
export function painSeries(
  point: Pick<PainPoint, "region" | "side">,
  source: PulseSource,
  window: TimelineWindow,
): LanePoint[] {
  const key = painKeyOf(point);
  const out: LanePoint[] = [];
  const push = (points: readonly PainPoint[] | null | undefined, day: string) => {
    const offset = dayOffset(window, day);
    if (offset === null) return;
    const match = (points ?? []).find(
      (x) => x && x.status !== "resolved" && Number.isFinite(x.severity) && painKeyOf(x) === key,
    );
    if (!match) return;
    const dial = tenToAbsolute(match.severity, INTENSITY_SCALE);
    if (dial === null) return;
    out.push({ day, offset, pos: dial + 2, word: INTENSITY_SCALE.words[dial + 2] });
  };
  for (const r of roundsNewestFirst(source.history).reverse()) push(r.assessment.painMap, reportDay(r.date));
  if (source.draft) push(source.draft.assessment.painMap, draftDayOf(source.draft, "pain"));
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const ONE_ROUND = "one round so far; two or more draw a line.";

/** Saved rounds whose day falls in the window — the footer's count, too. */
function savedRoundsIn(source: PulseSource, window: TimelineWindow): number {
  return (source.history?.reports ?? []).filter((r) => dayOffset(window, reportDay(r.date)) !== null).length;
}

/** Whether the open round holds any answer yet: a statement or a pain-map spot. */
function draftHasAnswer(source: PulseSource): boolean {
  const a = source.draft?.assessment;
  if (!a) return false;
  const told = Object.values(a.answers ?? {}).some((x) => typeof x?.value === "number" && Number.isFinite(x.value));
  return told || (a.painMap ?? []).length > 0;
}

/**
 * Why no Pulse lane is drawn, said truthfully. The timeline draws only three
 * statements and two pain spots, and Update Pulse answers one area at a time,
 * so a round in the window that answered other areas is common: that is
 * "with no answer to the statements drawn here", never "no answer saved".
 * "No Pulse answer saved in these six months" is said only when no saved
 * round falls in the window and the history read reaches its first day.
 */
function pulseNothingDrawn(source: PulseSource, window: TimelineWindow, since: string | null, now: Date): string {
  const card = "the Pulse card below has every area";
  const saved = savedRoundsIn(source, window);
  if (saved > 0) {
    const span = since ? `since ${dayWords(since, now)}` : "in these six months";
    return `${plural(saved, "saved Pulse round")} ${span}, with no answer to the statements drawn here; ${card}.`;
  }
  const h = source.history;
  const none =
    h && !h.complete && h.coversSinceMs === null
      ? "The saved Pulse rounds the app read carry no day it can place"
      : since
        ? `No Pulse answer saved since ${dayWords(since, now)}`
        : "No Pulse answer saved in these six months";
  const open = draftHasAnswer(source) ? `; the open round has no answer to the statements drawn here yet, and ${card}` : "";
  return `${none}${open}.`;
}

function pulseLanes(
  status: ProgressReportsStatus,
  source: PulseSource,
  window: TimelineWindow,
  p: Pronouns,
  now: Date,
): TimelineLane[] {
  if (status === "loading") {
    const text = `Loading what ${p.subject} told us in the Pulse…`;
    return [{ kind: "gap", key: "gap:pulse", state: "loading", title: "The Pulse", lines: [text], desc: text }];
  }
  if (status === "failed") {
    const text = `The saved Pulse couldn't be read just now, so ${p.possessive} answers aren't drawn.`;
    return [{ kind: "gap", key: "gap:pulse", state: "failed", title: "The Pulse", lines: [text], desc: text }];
  }
  const since = pulseSinceDay(source, window);
  const sinceClause = since ? ` · since ${dayWords(since, now)}` : "";
  const lanes: TimelineLane[] = [];
  const readings = latestPulseReadings(source);
  for (const area of TIMELINE_PULSE_AREAS) {
    const shown = shownStatement(area, readings);
    if (!shown) continue;
    const points = statementSeries(shown.id, source, window);
    if (points.length === 0) continue;
    const title = `“${shown.text}”`;
    const one = points.length === 1 ? ` · ${ONE_ROUND}` : "";
    lanes.push({
      kind: "rung",
      key: `pulse:${shown.id}`,
      title,
      lines: [`Pulse · ${CATEGORY_BY_KEY[area].title}${sinceClause}${one}`],
      desc: `${title} ${wordsOnDays(points, now)}.`,
      words: FREQUENCY_SCALE.words,
      points,
      line: points.length >= 2,
    });
  }
  const pain = latestPain(source);
  for (const spot of (pain?.spots ?? []).slice(0, PAIN_LANES_MAX)) {
    const points = painSeries(spot.point, source, window);
    if (points.length === 0) continue;
    const title = cap(spotWords(spot.point));
    const one = points.length === 1 ? ` · ${ONE_ROUND}` : "";
    lanes.push({
      kind: "rung",
      key: `pain:${painKeyOf(spot.point)}`,
      title,
      lines: [`Pulse · pain map${sinceClause}${one}`],
      desc: `${title}: ${wordsOnDays(points, now)}.`,
      words: INTENSITY_SCALE.words,
      points,
      line: points.length >= 2,
    });
  }
  if (lanes.length === 0) {
    const text = pulseNothingDrawn(source, window, since, now);
    return [{ kind: "gap", key: "gap:pulse", state: "none", title: "The Pulse", lines: [text], desc: text }];
  }
  return lanes;
}

/* ------------------------------------------------------------------ */
/* InBody                                                              */
/* ------------------------------------------------------------------ */

const MEASURES: ReadonlyArray<{ key: MeasureKey; title: string; unit: "lb" | "%"; banded: boolean }> = [
  { key: "skeletalMuscleMassLb", title: "Skeletal muscle", unit: "lb", banded: true },
  { key: "percentBodyFat", title: "Body fat %", unit: "%", banded: true },
  { key: "weightLb", title: "Weight", unit: "lb", banded: false },
];

/** The value range a lane draws: its points and band, padded so nothing sits on the edge. */
function valueRange(values: readonly number[]): { lo: number; hi: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, 0.5);
  return { lo: Math.floor((lo - pad) * 10) / 10, hi: Math.ceil((hi + pad) * 10) / 10 };
}

function inbodyLanes({
  inbody,
  window,
  variation,
  variationOwner,
  p,
  now,
}: {
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  window: TimelineWindow;
  variation: InBodyVariation;
  variationOwner: string | null;
  p: Pronouns;
  now: Date;
}): TimelineLane[] {
  if (inbody.error) {
    const text = `${inbody.error} They aren't drawn.`;
    return [{ kind: "gap", key: "gap:inbody", state: "failed", title: "InBody", lines: [text], desc: text }];
  }
  if (inbody.loading) {
    const text = "Loading the InBody scans…";
    return [{ kind: "gap", key: "gap:inbody", state: "loading", title: "InBody", lines: [text], desc: text }];
  }
  const scans: InBodyScan[] = sortScans(inbody.scans ?? []);
  if (scans.length === 0) {
    const text = "No InBody scan in Journey yet.";
    return [{ kind: "gap", key: "gap:inbody", state: "none", title: "InBody", lines: [text], desc: text }];
  }
  const inWindow = scans.filter((s) => dayOffset(window, s.testedAt) !== null);
  if (inWindow.length === 0) {
    const last = scans[scans.length - 1];
    const text = `Last scan ${dayWords(last.testedAt, now) || last.testedAt}, before these six months.`;
    return [{ kind: "gap", key: "gap:inbody", state: "none", title: "InBody", lines: [text], desc: text }];
  }

  const whose = variationOwner ? `set by ${variationOwner}` : "Max Strength's default";
  const lanes: TimelineLane[] = [];
  for (const m of MEASURES) {
    const withValue = scans.filter((s) => typeof s[m.key] === "number");
    const points: MeasurePoint[] = [];
    for (const s of withValue) {
      const offset = dayOffset(window, s.testedAt);
      const value = s[m.key] as number;
      if (offset === null) continue;
      points.push({ day: s.testedAt, offset, value, label: formatMeasure(value, m.key) });
    }
    if (points.length === 0) continue;

    // The band is centred on her FIRST scan — the summary's own baseline —
    // even when that scan is older than the window.
    const first = withValue[0];
    const v = m.banded ? thresholdFor(m.key, variation) : null;
    const band = v !== null && first ? { lo: (first[m.key] as number) - v, hi: (first[m.key] as number) + v } : null;
    const range = valueRange([...points.map((pt) => pt.value), ...(band ? [band.lo, band.hi] : [])]);

    // The lane's line, built from its parts: "InBody", then the band's words
    // and a single scan's note after one separator.
    const parts: string[] = [];
    if (band && first) {
      const unit = m.unit === "%" ? " points" : " lb";
      parts.push(
        `the shaded band is the scanner's normal variation around ${p.possessive} first scan (${dayWords(
          first.testedAt,
          now,
        )}): ±${v}${unit}, ${whose}.`,
      );
    }
    if (points.length === 1) {
      parts.push(`${parts.length ? "One" : "one"} scan in these six months; two or more draw a line.`);
    }
    const lines = [parts.length ? `InBody · ${parts.join(" ")}` : "InBody"];
    const said = points.map((pt) => `${pt.label}${dayWords(pt.day, now) ? ` on ${dayWords(pt.day, now)}` : ""}`).join(", ");
    lanes.push({
      kind: "measure",
      key: `inbody:${m.key}`,
      title: m.title,
      lines,
      desc: `${m.title}: ${said}.${band ? ` ${lines[0]}` : ""}`,
      unit: m.unit,
      points,
      line: points.length >= 2,
      band,
      lo: range.lo,
      hi: range.hi,
    });
  }
  return lanes;
}

/* ------------------------------------------------------------------ */
/* The card's words                                                    */
/* ------------------------------------------------------------------ */

/**
 * The card's lede: the recovery sentence once the sessions are known. While
 * they load, or after they failed, the lede is only what the card is about —
 * the gap row below says the state, once (never the same sentence twice).
 */
function ledeOf(read: ArrivalsRead, p: Pronouns, now: Date): string {
  if (sessionsUnknownText(read, p)) {
    return `How ${p.subject} ${agree(p, "arrives", "arrive")} at the door and how each session lands, over these six months.`;
  }
  return arriveSentence(arriveSummary(read, "recovery"), p, now);
}

function footerOf({
  read,
  pulseStatus,
  source,
  inbody,
  window,
  coverage,
  prior,
  p,
  now,
}: {
  read: ArrivalsRead;
  pulseStatus: ProgressReportsStatus;
  source: PulseSource;
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  window: TimelineWindow;
  coverage: HistoryCoverage;
  prior: PriorHistory | null;
  p: Pronouns;
  now: Date;
}): string[] {
  const out: string[] = [
    `Every reading sits where ${p.subject} gave it: how ${p.subject} arrived and how the session landed on the Dial's words, Pulse answers on the Pulse's own five words (better is higher), InBody as the scanner printed it.`,
  ];

  // Only the counts that are known: a source still loading or failed is left out, never 0.
  const counts: string[] = [];
  if (pulseStatus === "ready") {
    const saved = savedRoundsIn(source, window);
    const since = pulseSinceDay(source, window);
    counts.push(`${plural(saved, "saved Pulse round")}${since ? ` (since ${dayWords(since, now)})` : ""}`);
  }
  if (!inbody.loading && !inbody.error) {
    const n = (inbody.scans ?? []).filter((s) => dayOffset(window, s.testedAt) !== null).length;
    counts.push(plural(n, "InBody scan"));
  }
  if (read.state === "ready") {
    counts.push(
      `${plural(read.arrivals.length, "session")}${read.sinceDay ? ` (since ${dayWords(read.sinceDay, now)})` : ""}`,
    );
  }
  if (counts.length) {
    // What Journey holds, not her whole six months: a migrating client's 0 is Journey's 0.
    const list = counts.length === 1 ? counts[0] : `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}`;
    out.push(`${cap(list)} in Journey in these six months.`);
  }

  const caveat = COVERAGE_CAVEAT[coverage];
  if (caveat) out.push(caveat);
  const before = priorUncounted(prior);
  if (prior && before > 0) {
    const where = PRIOR_SOURCE_LABEL[prior.source];
    out.push(
      before === 1
        ? `The one session ${p.subject} had before Journey (${where}) isn't drawn.`
        : `The ${before} sessions ${p.subject} had before Journey (${where}) aren't drawn.`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

export interface TimelineInput {
  window: TimelineWindow;
  /** The journal's sessions, read (`readArrivals`). */
  arrivals: ArrivalsRead;
  /** Whether what she told us is known (the saved rounds and the open round). */
  pulseStatus: ProgressReportsStatus;
  source: PulseSource;
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  /** Her HOME studio's numbers. */
  variation: InBodyVariation;
  /** The home studio's name when it set its own numbers; null for Max Strength's defaults. */
  variationOwner: string | null;
  coverage: HistoryCoverage;
  prior: PriorHistory | null;
  pronouns: Pronouns;
  now: Date;
}

export function buildTimeline(input: TimelineInput): TimelineModel {
  const { window, arrivals, pulseStatus, source, inbody, variation, variationOwner, coverage, prior, pronouns: p, now } = input;
  return {
    window,
    months: monthTicks(window),
    lanes: [
      ...arriveLanes(arrivals, window, p, now),
      ...pulseLanes(pulseStatus, source, window, p, now),
      ...inbodyLanes({ inbody, window, variation, variationOwner, p, now }),
    ],
    lede: ledeOf(arrivals, p, now),
    footer: footerOf({ read: arrivals, pulseStatus, source, inbody, window, coverage, prior, p, now }),
  };
}
