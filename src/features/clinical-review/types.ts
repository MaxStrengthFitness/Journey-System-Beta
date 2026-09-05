/**
 * CLINICAL REVIEW — view models.
 *
 * Everything the dashboard renders is derived from ONE normalised row per
 * completed session (`SessionFact`). `facts.ts` builds those rows from the
 * app's Firestore records; `analytics.ts` turns them into trends,
 * correlations, heatmaps and plateau flags; `insights.ts` turns the numbers
 * into sentences. None of it imports React or Firestore, so it is unit-tested
 * as plain functions (analytics.test.ts).
 */

import type { RepQuality, SleepQuality } from "../../types";

/* ------------------------------------------------------------------ *
 * Subjective vocab
 * ------------------------------------------------------------------ */

/** Pre-session energy, one tap (added Sep 2026 alongside sleep + stress). */
export type EnergyLevel = "low" | "normal" | "high";
/** Pre-session mood, one tap. */
export type MoodLevel = "low" | "neutral" | "good";
/** The existing post-session "how do you feel" answer. */
export type PostFeel = "Wiped Out" | "Good" | "Energized";

export const SLEEP_ORDER: SleepQuality[] = ["poor", "average", "optimal"];
export const ENERGY_ORDER: EnergyLevel[] = ["low", "normal", "high"];
export const MOOD_ORDER: MoodLevel[] = ["low", "neutral", "good"];
export const POST_FEEL_ORDER: PostFeel[] = ["Wiped Out", "Good", "Energized"];

/* ------------------------------------------------------------------ *
 * The fact row
 * ------------------------------------------------------------------ */

export interface SessionFact {
  id: string;
  /** ISO day, YYYY-MM-DD, as the session was logged (never timezone-shifted). */
  date: string;
  /** Local midnight of `date`, ms. Used for ordering and day arithmetic. */
  dayMs: number;
  /** Actual start instant when the session recorded one. */
  startMs: number | null;
  /** Hour of day (0–23) in the studio's time zone, or null when no start time. */
  hour: number | null;
  /** 0 = Sunday … 6 = Saturday, from `date`. */
  dayOfWeek: number;
  /** Whole days since the client's previous completed session; null for the first. */
  restDays: number | null;
  /** Minutes from start to end minus pauses, when both stamps exist. */
  durationMin: number | null;
  trainerKey: string | null;
  trainerInitials: string;
  isCrossTrain: boolean;

  /* ---- subjective: before the session ---- */
  sleep: SleepQuality | null;
  stress: 1 | 2 | 3 | 4 | 5 | null;
  energy: EnergyLevel | null;
  mood: MoodLevel | null;
  hydration: "low" | "ok" | "good" | null;
  stiffRegions: string[];
  primeRegions: string[];

  /* ---- subjective: after the session ---- */
  postFeel: PostFeel | null;
  postPhysical: number | null;
  postMental: number | null;
  postRpe: number | null;

  /* ---- objective ---- */
  /** Logged sets with a load or an outcome. */
  sets: number;
  /** Sets that carry a rep-quality rating (imported paper charts have none). */
  setsRated: number;
  setsMax: number;
  setsDone: number;
  setsPoor: number;
  reps: number;
  /** lb × reps over non-timed sets. */
  tonnage: number;
  /** Seconds under tension across sets that recorded it. */
  tutSeconds: number;
  /** Sets that contributed to `tutSeconds`. */
  setsWithTut: number;
  machineIds: string[];
  avgRpe: number | null;
  symptomCount: number;
  symptomRegions: string[];
  incidentCount: number;
}

/** One rated set, denormalised with its session's date — the heatmap and plateau engines read these. */
export interface SetFact {
  sessionId: string;
  date: string;
  dayMs: number;
  machineId: string;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  isTSC: boolean;
  quality: RepQuality | null;
  tutSeconds: number | null;
}

/* ------------------------------------------------------------------ *
 * Range
 * ------------------------------------------------------------------ */

export type RangePreset = "30d" | "90d" | "6m" | "12m" | "all" | "custom";

export interface ReportRange {
  preset: RangePreset;
  /** Inclusive ISO day, or null for "everything on record". */
  from: string | null;
  /** Inclusive ISO day. */
  to: string;
}

/* ------------------------------------------------------------------ *
 * Analytics outputs
 * ------------------------------------------------------------------ */

export type Confidence = "insufficient" | "early" | "solid";

export interface LevelStat {
  level: string;
  label: string;
  n: number;
  /** Mean of the outcome across the sessions at this level (null when n = 0). */
  mean: number | null;
  /** mean − overall mean, in the outcome's own units (pp for rates, % for indexes). */
  delta: number | null;
  confidence: Confidence;
}

export interface Correlation {
  dimension: DimensionKey;
  dimensionLabel: string;
  outcome: OutcomeKey;
  outcomeLabel: string;
  /** Sessions that had BOTH a value for the dimension and the outcome. */
  n: number;
  overallMean: number | null;
  levels: LevelStat[];
  /** The level furthest from the overall mean, if any level is solid or early. */
  standout: LevelStat | null;
  /** Range of level means — how much the dimension "moves" the outcome. */
  spread: number | null;
}

export type DimensionKey =
  | "sleep"
  | "stress"
  | "energy"
  | "mood"
  | "postFeel"
  | "stiffness"
  | "restGap"
  | "timeOfDay"
  | "dayOfWeek"
  | "trainer"
  | "crossTrain";

export type OutcomeKey = "poorRate" | "maxRate" | "tonnageIndex" | "tutIndex" | "repsIndex" | "avgRpe";

export interface WeekBucket {
  /** ISO Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  label: string;
  sessions: number;
  tonnage: number;
  reps: number;
  tutSeconds: number;
  setsWithTut: number;
  sets: number;
  setsRated: number;
  setsMax: number;
  setsDone: number;
  setsPoor: number;
}

export interface HeatCell {
  poor: number;
  rated: number;
  /** poor / rated, or null when nothing was rated. */
  rate: number | null;
}

export interface HeatRow {
  machineId: string;
  machineName: string;
  group: string;
  cells: HeatCell[];
  total: HeatCell;
}

export interface Heatmap {
  /** Column labels, oldest → newest. */
  columns: { key: string; label: string }[];
  rows: HeatRow[];
  /** Roll-up by broad muscle group, same columns. */
  groups: HeatRow[];
  /** Highest cell rate in the map — the top of the colour scale. */
  maxRate: number;
}

export type PlateauStatus = "progressing" | "plateau" | "regressing" | "insufficient";

export interface MachinePlateau {
  machineId: string;
  machineName: string;
  group: string;
  status: PlateauStatus;
  /** Sessions in the range where this machine was logged. */
  sessions: number;
  firstDate: string | null;
  lastDate: string | null;
  firstWeight: number | null;
  lastWeight: number | null;
  bestWeight: number | null;
  /** (last − first) / first, as a %; null when first is 0/unknown. */
  weightChangePct: number | null;
  /**
   * Outcome at the current weight, first time vs most recent time it was
   * lifted: reps for a normal set, SECONDS for a timed static contraction.
   */
  repsAtCurrentFirst: number | null;
  repsAtCurrentLast: number | null;
  /** Consecutive sessions ending at `lastDate` at the same load. */
  sessionsAtCurrentWeight: number;
  /**
   * True when the machine has been at the same load, with no rep gain, for
   * the last 4+ sessions — even if it progressed earlier in the range.
   * `status` answers "did it move over the whole range?"; `stalled` answers
   * "is it moving NOW?". A trainer needs both.
   */
  stalled: boolean;
  /** Poor-quality share on this machine in the range. */
  poorRate: number | null;
  /** True when this machine is logged as a timed static contraction (outcome = seconds). */
  isTSC: boolean;
  /** Weight per session, oldest → newest, for a sparkline. `reps` is seconds for a TSC. */
  series: { date: string; weight: number | null; reps: number | null; quality: RepQuality | null }[];
}

export interface Summary {
  sessions: number;
  tonnage: number;
  reps: number;
  tutSeconds: number;
  setsRated: number;
  setsMax: number;
  setsDone: number;
  setsPoor: number;
  maxRate: number | null;
  poorRate: number | null;
  /** Share of sets that recorded time under tension — gates the TUT panels. */
  tutCoverage: number;
  /** Share of sessions with any pre-session check-in field. */
  checkInCoverage: number;
  sessionsPerWeek: number | null;
  medianRestDays: number | null;
  longestGapDays: number | null;
  firstDate: string | null;
  lastDate: string | null;
  /** Days spanned by the facts (first → last), at least 1. */
  spanDays: number;
}

export type InsightKind = "correlation" | "rhythm" | "plateau" | "volume" | "coverage" | "form";
export type InsightTone = "notable" | "good" | "info";

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
  /** Short evidence line: "n = 7 sessions · +14 pp". */
  evidence: string;
  /** Ranking weight, higher first. */
  score: number;
  machineId?: string;
  dimension?: DimensionKey;
  outcome?: OutcomeKey;
}
