/**
 * 90-Day Subjective Progress Report — data model.
 *
 * Round: Subjective Report, Sep 2026. Spec in ./README.md, which also carries
 * the original reference document verbatim. Nothing in that document is
 * dropped here; the enhancements are additive.
 *
 * Where it lives: as the `subjective` block on a `ProgressReport` document in
 * the `progressReports` collection (folded in rather than a separate
 * collection — the check-in happens inside the 90-day coaching conversation).
 *
 * Two kinds of thing in this file:
 *   - INPUT types: what a coach records. Stored as entered.
 *   - COMPUTED types: scores, statuses, deltas, flags. Derived by scoring.ts
 *     and ALSO stored on the report as `subjective.summary` so lists and the
 *     hub can read them without recomputing; the UI still recomputes from
 *     inputs when it renders, so the stored copy is a cache, not the truth.
 */

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

/** Green / Yellow / Red. Lower-case on purpose so it never collides with the
 *  4 P's talking-point status ("red" | "black" | "green"). */
export type Rag = "green" | "yellow" | "red";

/* ------------------------------------------------------------------ *
 * The eight categories (original document, verbatim keys → titles in
 * questions.ts)
 * ------------------------------------------------------------------ */

export type SubjectiveCategoryKey =
  | "sleepRecovery"
  | "energyDailyFunction"
  | "strengthConfidence"
  | "painMobility"
  | "consistencyHabits"
  | "mentalEmotional"
  | "nutritionProtein"
  | "lifestyleAlignment";

export const SUBJECTIVE_CATEGORY_KEYS: SubjectiveCategoryKey[] = [
  "sleepRecovery",
  "energyDailyFunction",
  "strengthConfidence",
  "painMobility",
  "consistencyHabits",
  "mentalEmotional",
  "nutritionProtein",
  "lifestyleAlignment",
];

export interface SubjectiveStatement {
  /** Stable id, e.g. "sleepRecovery_1". Answers are keyed by this. */
  id: string;
  /** The statement exactly as written in the reference document. */
  text: string;
  /** What a 0 looks like for THIS statement (the scale enhancement). */
  anchorLow: string;
  /** What a 10 looks like for THIS statement. */
  anchorHigh: string;
}

export interface SubjectiveCategoryDef {
  key: SubjectiveCategoryKey;
  /** Title exactly as written in the reference document. */
  title: string;
  /** Plain-language line the coach reads to open the topic. */
  coachPrompt: string;
  statements: [SubjectiveStatement, SubjectiveStatement, SubjectiveStatement];
  /**
   * From the reference document: "Automatically flag any client who scores
   * Red in Protein Compliance, Sleep & Recovery, or Consistency & Habits."
   * True for the two categories named there.
   */
  autoFlagWhenRed: boolean;
}

/* ------------------------------------------------------------------ *
 * Rating scale
 * ------------------------------------------------------------------ */

/**
 * Scale v2: each statement is answered 0–10 against statement-specific
 * anchors. Scale v1 was the reference document's 0–4 frequency scale
 * (0 Not At All, 1 Rarely, 2 Sometimes, 3 Often, 4 Nearly Always); v1 answers
 * convert to v2 by ×2.5 (see scoring.ts) so history stays comparable.
 */
export type SubjectiveScaleVersion = 1 | 2;

export interface StatementAnswer {
  /** 0–10 on scale v2. null = not asked / skipped. */
  value: number | null;
  /** What the client said, in their words. Optional. */
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Protein Compliance Score (displayed separately from the subjective score)
 * ------------------------------------------------------------------ */

export interface ProteinCompliance {
  /** Ideal body weight the target is calculated from, in lbs. */
  idealBodyWeightLbs: number | null;
  /**
   * Chosen point inside the reference document's 0.75–1.0 g per lb range.
   * The target range (low = ×0.75, high = ×1.0) is always shown alongside.
   */
  gramsPerLb: number;
  /** Original measure: "On average, how many days per week do you hit your protein goal?" 0–7. */
  daysPerWeekOnTarget: number | null;
  /** Enhancement: the client's estimated real intake on a typical day, grams. */
  typicalGramsPerDay: number | null;
  /** Enhancement: where the protein mostly comes from (free-form chips). */
  primarySources: string[];
  coachNote?: string;
}

/* ------------------------------------------------------------------ *
 * Hydration (mandatory enhancement #1)
 * ------------------------------------------------------------------ */

export type FluidUnit = "oz" | "ml";

export type HydrationSource =
  | "water"
  | "coffee"
  | "tea"
  | "soda"
  | "sports_drink"
  | "juice"
  | "alcohol"
  | "other";

export type HydrationTargetSource =
  /** ½ oz per lb of body weight — the studio default. */
  | "studio_default"
  /** The coach typed a different number. */
  | "coach"
  /** Adjusted to a limit the client's clinician set. The reason is NOT stored here. */
  | "medical";

export interface HydrationTracking {
  unit: FluidUnit;
  /** Typical total fluid on a normal day, in `unit`. */
  typicalPerDay: number | null;
  /** Daily target, in `unit`. */
  targetPerDay: number | null;
  targetSource: HydrationTargetSource;
  /** Days per week the client reaches the target. 0–7. */
  daysPerWeekOnTarget: number | null;
  primarySources: HydrationSource[];
  coachNote?: string;
}

/* ------------------------------------------------------------------ *
 * Pain map (mandatory enhancement #2)
 * ------------------------------------------------------------------ */

export type BodyRegion =
  | "neck"
  | "shoulder"
  | "upper_back"
  | "mid_back"
  | "lower_back"
  | "chest"
  | "elbow"
  | "wrist_hand"
  | "hip"
  | "glute"
  | "groin"
  | "thigh"
  | "hamstring"
  | "knee"
  | "calf_shin"
  | "ankle"
  | "foot";

export type BodySide = "left" | "right" | "both" | "center";

export type PainType = "joint" | "muscular" | "nerve" | "unsure";

export type PainFrequency =
  | "constant"
  | "daily"
  | "during_training"
  | "after_training"
  | "occasional";

export type PainStatus = "active" | "improving" | "resolved";

export interface PainPoint {
  id: string;
  region: BodyRegion;
  side: BodySide;
  type: PainType;
  /** 0 = none, 10 = worst imaginable. */
  severity: number;
  frequency: PainFrequency;
  /** ISO date, or free text like "since the fall in March". */
  since?: string | null;
  /** Machines that bring it on. Links to the Equipment tab / journey grid. */
  aggravatingMachineIds: string[];
  /**
   * Journal entries this pain is tied to — `incident` entries and `life /
   * Injury` entries written pre-, mid- or post-session. Suggested
   * automatically from the client's journal; the coach confirms the link.
   */
  linkedJournalEntryIds: string[];
  status: PainStatus;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Stress anchors (mandatory enhancement #3)
 * ------------------------------------------------------------------ */

/**
 * Categories chosen for a 40–95 client base: the things that actually pull a
 * client off a training routine at that stage of life.
 */
export type StressCategory =
  | "caregiving"
  | "family_health"
  | "own_health"
  | "work"
  | "retirement"
  | "financial"
  | "grief_loss"
  | "relationship"
  | "loneliness"
  | "sleep"
  | "travel_schedule"
  | "home_move"
  | "other";

export type TrainingImpact = "none" | "low" | "moderate" | "high";

export type StressStatus = "active" | "easing" | "resolved";

export interface StressAnchor {
  id: string;
  category: StressCategory;
  /** The stressor in the client's own words. */
  label: string;
  /** 0–10. */
  intensity: number;
  /** How much it threatens attendance / effort / recovery. */
  trainingImpact: TrainingImpact;
  /** What the coach and client agreed to do about it. */
  coachResponse?: string;
  status: StressStatus;
}

/* ------------------------------------------------------------------ *
 * The assessment as entered
 * ------------------------------------------------------------------ */

export type SubjectiveEnteredBy = "coach" | "client";

export interface SubjectiveAssessment {
  scaleVersion: SubjectiveScaleVersion;
  /** ISO date the conversation happened. */
  completedAt: string | null;
  enteredBy: SubjectiveEnteredBy;

  /** Keyed by statement id (see questions.ts). Missing = unanswered. */
  answers: Record<string, StatementAnswer>;
  /** Free-form note per category, in the coach's words. */
  categoryNotes: Partial<Record<SubjectiveCategoryKey, string>>;

  protein: ProteinCompliance;
  hydration: HydrationTracking;
  painMap: PainPoint[];
  stressAnchors: StressAnchor[];
  /** Overall "how heavy does life feel right now?" 0–10. */
  overallStressLevel: number | null;

  /** What goes on the client's printed copy. Coach-only material stays off it. */
  clientCopy: {
    includeCategoryScores: boolean;
    includeProteinHydration: boolean;
    includePainMap: boolean;
    /** Off by default — stressors are coaching context, not report content. */
    includeStressAnchors: boolean;
  };

  /** One-paragraph coach summary of the check-in, for the client copy. */
  coachSummary?: string;

  /** Filled by scoring.ts at save time. See file header. */
  summary?: SubjectiveSummary;
}

/* ------------------------------------------------------------------ *
 * Computed
 * ------------------------------------------------------------------ */

export interface CategoryScore {
  key: SubjectiveCategoryKey;
  title: string;
  /** Sum of answered statements on the 0–10 scale (max 30). */
  raw: number;
  /** Max possible for the statements answered (30 when all three are). */
  rawMax: number;
  /** raw / rawMax, 0–1. null when nothing answered. */
  percent: number | null;
  /**
   * Same result expressed on the reference document's 0–12 scale, so the
   * printed report can still say "10 / 12".
   */
  legacyScore: number | null;
  /** null when incomplete. Thresholds: green ≥ 75 %, yellow ≥ 50 %, else red. */
  status: Rag | null;
  answeredCount: number;
  isComplete: boolean;
}

export interface CategoryComparison extends CategoryScore {
  previousPercent: number | null;
  previousLegacyScore: number | null;
  previousStatus: Rag | null;
  /** Change since the last assessment as percentage points (−100..100). */
  changePoints: number | null;
  /** Change on the 0–12 scale, for the printed copy. */
  changeLegacy: number | null;
}

export interface OverallScore {
  raw: number;
  rawMax: number;
  percent: number | null;
  /** On the reference document's 0–96 scale. */
  legacyScore: number | null;
  status: Rag | null;
  isComplete: boolean;
}

export interface ProteinStatus {
  targetLowG: number | null;
  targetHighG: number | null;
  targetG: number | null;
  /** Original rule: Green 5–7 days, Yellow 2–4, Red 0–1. */
  daysStatus: Rag | null;
  /** Enhancement: typical intake ÷ target. */
  intakeRatio: number | null;
  intakeStatus: Rag | null;
  /** Worse of the two when both known; daysStatus alone otherwise. */
  status: Rag | null;
}

export interface HydrationStatus {
  ratio: number | null;
  ratioStatus: Rag | null;
  daysStatus: Rag | null;
  status: Rag | null;
}

export interface PainPointTrend {
  point: PainPoint;
  /** Severity change vs the matching point (region + side) last time. */
  severityChange: number | null;
  isNew: boolean;
}

export interface PainSummary {
  activeCount: number;
  worstSeverity: number | null;
  trends: PainPointTrend[];
  /** Points that were active last time and are absent or resolved now. */
  resolvedSinceLast: PainPoint[];
}

export type SubjectiveFlagCode =
  /* the three the reference document names */
  | "protein_red"
  | "sleep_red"
  | "consistency_red"
  /* enhancements */
  | "category_red"
  | "overall_red"
  | "hydration_red"
  | "pain_severe"
  | "pain_worsening"
  | "stress_high_impact"
  | "category_drop";

export interface SubjectiveFlag {
  code: SubjectiveFlagCode;
  /** "red" = the document's automatic flag; "watch" = enhancement, softer. */
  severity: "red" | "watch";
  label: string;
  detail: string;
  categoryKey?: SubjectiveCategoryKey;
}

export interface SubjectiveSummary {
  computedAt: string;
  previousReportId: string | null;
  previousReportDate: string | null;
  categories: CategoryComparison[];
  overall: OverallScore;
  protein: ProteinStatus;
  hydration: HydrationStatus;
  pain: PainSummary;
  flags: SubjectiveFlag[];
  largestImprovement: CategoryComparison | null;
  largestOpportunity: CategoryComparison | null;
  redCategories: SubjectiveCategoryKey[];
}

/**
 * The slice written onto the client document on finalize so the hub schedule
 * and client list can show a Red flag without opening the report.
 */
export interface ClientSubjectiveSnapshot {
  reportId: string;
  date: string;
  overallStatus: Rag | null;
  overallPercent: number | null;
  proteinStatus: Rag | null;
  hydrationStatus: Rag | null;
  redCategories: SubjectiveCategoryKey[];
  flags: SubjectiveFlag[];
}
