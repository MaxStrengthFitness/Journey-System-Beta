/**
 * Scoring for the 90-Day Subjective Progress Report.
 *
 * Every function here is pure — no Firestore, no React, no Date.now() except
 * in `summarize` where the timestamp is a parameter with a default. That is
 * what lets scoring.test.ts pin the reference document's thresholds down
 * with plain numbers.
 *
 * Reading order: ragForFraction → scoreCategory → scoreOverall →
 * scoreProtein / scoreHydration → summarizePain → buildFlags → summarize.
 */
import type {
  CategoryComparison,
  CategoryScore,
  ClientSubjectiveSnapshot,
  HydrationStatus,
  HydrationTracking,
  OverallScore,
  PainPoint,
  PainSummary,
  ProteinCompliance,
  ProteinStatus,
  Rag,
  StatementAnswer,
  SubjectiveAssessment,
  SubjectiveCategoryKey,
  SubjectiveFlag,
  SubjectiveSummary,
} from "./types";
import {
  CATEGORY_DROP_POINTS,
  CATEGORY_BY_KEY,
  DAYS_PER_WEEK_THRESHOLDS,
  GREEN_MIN_FRACTION,
  HYDRATION_OZ_PER_LB_DEFAULT,
  HYDRATION_RATIO_THRESHOLDS,
  LEGACY_CATEGORY_MAX,
  LEGACY_OVERALL_MAX,
  LEGACY_SCALE_MAX,
  ML_PER_OZ,
  PAIN_SEVERE_THRESHOLD,
  PAIN_WORSENING_DELTA,
  PROTEIN_G_PER_LB_DEFAULT,
  PROTEIN_G_PER_LB_HIGH,
  PROTEIN_G_PER_LB_LOW,
  PROTEIN_INTAKE_RATIO_THRESHOLDS,
  SCALE_MAX,
  SUBJECTIVE_CATEGORIES,
  YELLOW_MIN_FRACTION,
} from "./questions";

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const RAG_RANK: Record<Rag, number> = { red: 0, yellow: 1, green: 2 };

/** The worse of two statuses; null is "unknown" and never wins. */
export function ragWorse(a: Rag | null, b: Rag | null): Rag | null {
  if (a === null) return b;
  if (b === null) return a;
  return RAG_RANK[a] <= RAG_RANK[b] ? a : b;
}

/**
 * The reference document's colours, as a fraction of the maximum:
 *   Green 9–12 of 12 (≥ 0.75) · Yellow 6–8 of 12 (≥ 0.50) · Red 0–5.
 *   Green 72–96 of 96 (≥ 0.75) · Yellow 48–71 of 96 (≥ 0.50) · Red 0–47.
 */
export function ragForFraction(fraction: number | null): Rag | null {
  if (fraction === null || Number.isNaN(fraction)) return null;
  if (fraction >= GREEN_MIN_FRACTION) return "green";
  if (fraction >= YELLOW_MIN_FRACTION) return "yellow";
  return "red";
}

/** Green = 5–7 days, Yellow = 2–4 days, Red = 0–1 days (verbatim). */
export function ragForDaysPerWeek(days: number | null): Rag | null {
  if (days === null || Number.isNaN(days)) return null;
  if (days >= DAYS_PER_WEEK_THRESHOLDS.green) return "green";
  if (days >= DAYS_PER_WEEK_THRESHOLDS.yellow) return "yellow";
  return "red";
}

function ragForRatio(
  ratio: number | null,
  t: { green: number; yellow: number },
): Rag | null {
  if (ratio === null || Number.isNaN(ratio)) return null;
  if (ratio >= t.green) return "green";
  if (ratio >= t.yellow) return "yellow";
  return "red";
}

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Scale v1 (0–4) → scale v2 (0–10). 0,1,2,3,4 → 0,3,5,8,10. */
export function convertLegacyAnswer(v: number | null): number | null {
  if (v === null || Number.isNaN(v)) return null;
  return Math.round(clamp(v, 0, LEGACY_SCALE_MAX) * (SCALE_MAX / LEGACY_SCALE_MAX));
}

/** "185", "185 lbs", "84 kg" → lbs. null when it can't be read. */
export function parseWeightLbs(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw > 0 ? raw : null;
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!(n > 0)) return null;
  return /kg/i.test(raw) ? Math.round(n * 2.20462) : n;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export function scoreCategory(
  key: SubjectiveCategoryKey,
  answers: Record<string, StatementAnswer | undefined>,
  scaleVersion: 1 | 2 = 2,
): CategoryScore {
  const def = CATEGORY_BY_KEY[key];
  let raw = 0;
  let answered = 0;
  for (const st of def.statements) {
    const a = answers[st.id];
    if (!a || a.value === null || a.value === undefined) continue;
    const v = scaleVersion === 1 ? convertLegacyAnswer(a.value) : a.value;
    if (v === null) continue;
    raw += clamp(v, 0, SCALE_MAX);
    answered += 1;
  }
  const rawMax = answered * SCALE_MAX;
  const percent = answered > 0 ? raw / rawMax : null;
  const isComplete = answered === def.statements.length;
  return {
    key,
    title: def.title,
    raw,
    rawMax,
    percent,
    legacyScore: percent === null ? null : Math.round(percent * LEGACY_CATEGORY_MAX),
    status: isComplete ? ragForFraction(percent) : null,
    answeredCount: answered,
    isComplete,
  };
}

export function scoreAllCategories(a: SubjectiveAssessment): CategoryScore[] {
  return SUBJECTIVE_CATEGORIES.map((c) =>
    scoreCategory(c.key, a.answers, a.scaleVersion),
  );
}

/** Overall Subjective Progress Score: sum of the eight categories. */
export function scoreOverall(categories: CategoryScore[]): OverallScore {
  const raw = categories.reduce((s, c) => s + c.raw, 0);
  const rawMax = categories.reduce((s, c) => s + c.rawMax, 0);
  const isComplete = categories.every((c) => c.isComplete);
  const percent = rawMax > 0 ? raw / rawMax : null;
  return {
    raw,
    rawMax,
    percent,
    legacyScore: percent === null ? null : Math.round(percent * LEGACY_OVERALL_MAX),
    status: isComplete ? ragForFraction(percent) : null,
    isComplete,
  };
}

export function compareCategories(
  current: CategoryScore[],
  previous: CategoryScore[] | null,
): CategoryComparison[] {
  return current.map((c) => {
    const p = previous?.find((x) => x.key === c.key) ?? null;
    const prevPct = p?.isComplete ? p.percent : null;
    const change =
      c.isComplete && c.percent !== null && prevPct !== null
        ? Math.round((c.percent - prevPct) * 100)
        : null;
    return {
      ...c,
      previousPercent: prevPct,
      previousLegacyScore: p?.isComplete ? p.legacyScore : null,
      previousStatus: p?.isComplete ? p.status : null,
      changePoints: change,
      changeLegacy:
        c.legacyScore !== null && p?.isComplete && p.legacyScore !== null
          ? c.legacyScore - p.legacyScore
          : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Protein Compliance Score
 * ------------------------------------------------------------------ */

export function proteinTargets(ibwLbs: number | null, gramsPerLb: number) {
  if (ibwLbs === null || !(ibwLbs > 0)) {
    return { targetLowG: null, targetHighG: null, targetG: null };
  }
  const factor = clamp(gramsPerLb, PROTEIN_G_PER_LB_LOW, PROTEIN_G_PER_LB_HIGH);
  return {
    targetLowG: Math.round(ibwLbs * PROTEIN_G_PER_LB_LOW),
    targetHighG: Math.round(ibwLbs * PROTEIN_G_PER_LB_HIGH),
    targetG: Math.round(ibwLbs * factor),
  };
}

export function scoreProtein(p: ProteinCompliance): ProteinStatus {
  const t = proteinTargets(p.idealBodyWeightLbs, p.gramsPerLb);
  const daysStatus = ragForDaysPerWeek(p.daysPerWeekOnTarget);
  const intakeRatio =
    t.targetG && p.typicalGramsPerDay !== null && p.typicalGramsPerDay >= 0
      ? p.typicalGramsPerDay / t.targetG
      : null;
  const intakeStatus = ragForRatio(intakeRatio, PROTEIN_INTAKE_RATIO_THRESHOLDS);
  return {
    ...t,
    daysStatus,
    intakeRatio,
    intakeStatus,
    status: ragWorse(daysStatus, intakeStatus),
  };
}

/* ------------------------------------------------------------------ *
 * Hydration
 * ------------------------------------------------------------------ */

export function defaultHydrationTarget(
  bodyWeightLbs: number | null,
  unit: "oz" | "ml",
): number | null {
  if (bodyWeightLbs === null || !(bodyWeightLbs > 0)) return null;
  const oz = bodyWeightLbs * HYDRATION_OZ_PER_LB_DEFAULT;
  return unit === "oz" ? Math.round(oz) : Math.round((oz * ML_PER_OZ) / 50) * 50;
}

export function scoreHydration(h: HydrationTracking): HydrationStatus {
  const ratio =
    h.targetPerDay && h.typicalPerDay !== null && h.typicalPerDay >= 0
      ? h.typicalPerDay / h.targetPerDay
      : null;
  const ratioStatus = ragForRatio(ratio, HYDRATION_RATIO_THRESHOLDS);
  const daysStatus = ragForDaysPerWeek(h.daysPerWeekOnTarget);
  return { ratio, ratioStatus, daysStatus, status: ragWorse(ratioStatus, daysStatus) };
}

/* ------------------------------------------------------------------ *
 * Pain map
 * ------------------------------------------------------------------ */

const painKey = (p: PainPoint) => `${p.region}:${p.side}`;

export function summarizePain(
  current: PainPoint[],
  previous: PainPoint[] | null,
): PainSummary {
  const prevActive = (previous ?? []).filter((p) => p.status !== "resolved");
  const prevByKey = new Map(prevActive.map((p) => [painKey(p), p]));
  const active = current.filter((p) => p.status !== "resolved");

  const trends = current.map((p) => {
    const prev = prevByKey.get(painKey(p)) ?? null;
    return {
      point: p,
      severityChange: prev ? p.severity - prev.severity : null,
      isNew: !prev,
    };
  });

  const currentKeys = new Set(active.map(painKey));
  const resolvedSinceLast = prevActive.filter((p) => !currentKeys.has(painKey(p)));

  return {
    activeCount: active.length,
    worstSeverity: active.length ? Math.max(...active.map((p) => p.severity)) : null,
    trends,
    resolvedSinceLast,
  };
}

/* ------------------------------------------------------------------ *
 * Flags
 * ------------------------------------------------------------------ */

export function buildFlags(input: {
  categories: CategoryComparison[];
  overall: OverallScore;
  protein: ProteinStatus;
  hydration: HydrationStatus;
  pain: PainSummary;
  assessment: SubjectiveAssessment;
}): SubjectiveFlag[] {
  const flags: SubjectiveFlag[] = [];
  const { categories, overall, protein, hydration, pain, assessment } = input;

  // --- the three the reference document names, always "red" severity ---
  if (protein.status === "red") {
    flags.push({
      code: "protein_red",
      severity: "red",
      label: "Protein compliance is Red",
      detail:
        protein.daysStatus === "red"
          ? `Hits the protein goal ${assessment.protein.daysPerWeekOnTarget ?? 0} day(s) a week.`
          : `Typical intake is ${Math.round((protein.intakeRatio ?? 0) * 100)}% of the ${protein.targetG} g target.`,
    });
  }
  for (const c of categories) {
    if (c.status !== "red") continue;
    const def = CATEGORY_BY_KEY[c.key];
    if (def.autoFlagWhenRed) {
      flags.push({
        code: c.key === "sleepRecovery" ? "sleep_red" : "consistency_red",
        severity: "red",
        label: `${c.title} is Red`,
        detail: `${c.legacyScore} / ${LEGACY_CATEGORY_MAX} this check-in.`,
        categoryKey: c.key,
      });
    } else {
      flags.push({
        code: "category_red",
        severity: "watch",
        label: `${c.title} is Red`,
        detail: `${c.legacyScore} / ${LEGACY_CATEGORY_MAX} this check-in.`,
        categoryKey: c.key,
      });
    }
  }

  // --- enhancements, "watch" severity ---
  if (overall.status === "red") {
    flags.push({
      code: "overall_red",
      severity: "watch",
      label: "Overall score is Red",
      detail: `${overall.legacyScore} / ${LEGACY_OVERALL_MAX} overall.`,
    });
  }
  if (hydration.status === "red") {
    flags.push({
      code: "hydration_red",
      severity: "watch",
      label: "Hydration is Red",
      detail:
        hydration.ratio !== null
          ? `Drinking about ${Math.round(hydration.ratio * 100)}% of the daily target.`
          : `Reaches the fluid target ${assessment.hydration.daysPerWeekOnTarget ?? 0} day(s) a week.`,
    });
  }
  for (const t of pain.trends) {
    if (t.point.status === "resolved") continue;
    if (t.point.severity >= PAIN_SEVERE_THRESHOLD) {
      flags.push({
        code: "pain_severe",
        severity: "watch",
        label: `Severe pain: ${t.point.region.replace(/_/g, " ")} (${t.point.side})`,
        detail: `Severity ${t.point.severity} / 10.`,
      });
    }
    if (t.severityChange !== null && t.severityChange >= PAIN_WORSENING_DELTA) {
      flags.push({
        code: "pain_worsening",
        severity: "watch",
        label: `Pain getting worse: ${t.point.region.replace(/_/g, " ")} (${t.point.side})`,
        detail: `Up ${t.severityChange} since the last check-in.`,
      });
    }
  }
  for (const s of assessment.stressAnchors) {
    if (s.status !== "resolved" && s.trainingImpact === "high") {
      flags.push({
        code: "stress_high_impact",
        severity: "watch",
        label: "A stressor could stop training",
        detail: s.label || s.category.replace(/_/g, " "),
      });
    }
  }
  for (const c of categories) {
    if (c.changePoints !== null && c.changePoints <= -CATEGORY_DROP_POINTS) {
      flags.push({
        code: "category_drop",
        severity: "watch",
        label: `${c.title} dropped`,
        detail: `Down ${Math.abs(c.changeLegacy ?? 0)} points (of ${LEGACY_CATEGORY_MAX}) since last time.`,
        categoryKey: c.key,
      });
    }
  }

  return flags;
}

/* ------------------------------------------------------------------ *
 * The whole thing
 * ------------------------------------------------------------------ */

export interface PreviousAssessmentRef {
  reportId: string;
  date: string;
  assessment: SubjectiveAssessment;
}

export function summarize(
  assessment: SubjectiveAssessment,
  previous: PreviousAssessmentRef | null,
  now: Date = new Date(),
): SubjectiveSummary {
  const current = scoreAllCategories(assessment);
  const prev = previous ? scoreAllCategories(previous.assessment) : null;
  const categories = compareCategories(current, prev);
  const overall = scoreOverall(current);
  const protein = scoreProtein(assessment.protein);
  const hydration = scoreHydration(assessment.hydration);
  const pain = summarizePain(assessment.painMap, previous?.assessment.painMap ?? null);
  const flags = buildFlags({ categories, overall, protein, hydration, pain, assessment });

  const withChange = categories.filter((c) => c.changePoints !== null);
  const largestImprovement =
    withChange.length > 0
      ? withChange.reduce((a, b) => ((b.changePoints ?? 0) > (a.changePoints ?? 0) ? b : a))
      : null;
  // "Largest Opportunity Area" = the lowest-scoring complete category.
  const complete = categories.filter((c) => c.isComplete && c.percent !== null);
  const largestOpportunity =
    complete.length > 0
      ? complete.reduce((a, b) => ((b.percent ?? 1) < (a.percent ?? 1) ? b : a))
      : null;

  return {
    computedAt: now.toISOString(),
    previousReportId: previous?.reportId ?? null,
    previousReportDate: previous?.date ?? null,
    categories,
    overall,
    protein,
    hydration,
    pain,
    flags,
    largestImprovement:
      largestImprovement && (largestImprovement.changePoints ?? 0) > 0
        ? largestImprovement
        : null,
    largestOpportunity,
    redCategories: categories.filter((c) => c.status === "red").map((c) => c.key),
  };
}

export function snapshotForClient(
  reportId: string,
  date: string,
  s: SubjectiveSummary,
): ClientSubjectiveSnapshot {
  return {
    reportId,
    date,
    overallStatus: s.overall.status,
    overallPercent: s.overall.percent,
    proteinStatus: s.protein.status,
    hydrationStatus: s.hydration.status,
    redCategories: s.redCategories,
    flags: s.flags,
  };
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function emptyAssessment(opts: {
  bodyWeightLbs?: number | null;
  enteredBy?: "coach" | "client";
} = {}): SubjectiveAssessment {
  const bw = opts.bodyWeightLbs ?? null;
  return {
    scaleVersion: 2,
    completedAt: null,
    enteredBy: opts.enteredBy ?? "coach",
    answers: {},
    categoryNotes: {},
    protein: {
      idealBodyWeightLbs: bw,
      gramsPerLb: PROTEIN_G_PER_LB_DEFAULT,
      daysPerWeekOnTarget: null,
      typicalGramsPerDay: null,
      primarySources: [],
    },
    hydration: {
      unit: "oz",
      typicalPerDay: null,
      targetPerDay: defaultHydrationTarget(bw, "oz"),
      targetSource: "studio_default",
      daysPerWeekOnTarget: null,
      primarySources: [],
    },
    painMap: [],
    stressAnchors: [],
    overallStressLevel: null,
    clientCopy: {
      includeCategoryScores: true,
      includeProteinHydration: true,
      includePainMap: true,
      includeStressAnchors: false,
    },
  };
}

/** How many of the 24 statements have an answer. */
export function answeredCount(a: SubjectiveAssessment): number {
  return Object.values(a.answers).filter((x) => x && x.value !== null).length;
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
