/**
 * THE THREE PILLARS (Assessment round, Sep 2026).
 *
 * Twelve areas in one list is too many to hold in your head in a 20-minute
 * session. The owner's audit groups them into three diagnostic pillars, and
 * the panel draws them that way:
 *
 *   Recovery & Fuel              Sleep & Recovery · Nutrition & Protein ·
 *                                Protein compliance · Hydration
 *   Physical & Functional        Energy & Daily Function · Strength & Physical
 *                                Confidence · Pain & Mobility · Pain map
 *   Psychological & Behavioral   Mental & Emotional Impact · Consistency &
 *                                Habits · Lifestyle Alignment · Stress anchors
 *
 * This is presentation only. The question bank, the scoring and every
 * threshold in the 90-day document are untouched — `pillars.test.ts` checks
 * that each of the eight categories and the four extra areas sits in exactly
 * one pillar, so nothing can drop off the screen by being left out of a group.
 *
 * It also holds each area's SCALE: what its single number means and what the
 * two ends look like in plain words. The words are taken from the question
 * bank (`questions.ts`) — the first statement's anchors for a category, the
 * document's days-a-week rule for protein and hydration, and the labels the
 * pain and stress editors already print. Nothing clinical is invented here.
 */
import { CATEGORY_BY_KEY, DAYS_PER_WEEK_THRESHOLDS, LEGACY_CATEGORY_MAX, SCALE_MAX } from "./questions";
import { SUBJECTIVE_CATEGORY_KEYS, type SubjectiveCategoryKey } from "./types";

/** The four areas that are not one of the document's eight categories. */
export type AssessmentExtraId = "protein" | "hydration" | "pain" | "stress";
export const ASSESSMENT_EXTRA_IDS: readonly AssessmentExtraId[] = [
  "protein",
  "hydration",
  "pain",
  "stress",
];

/** Every area the panel shows: a category key or one of the extras. */
export type AssessmentSectionId = SubjectiveCategoryKey | AssessmentExtraId;

export const ALL_ASSESSMENT_SECTION_IDS: readonly AssessmentSectionId[] = [
  ...SUBJECTIVE_CATEGORY_KEYS,
  ...ASSESSMENT_EXTRA_IDS,
];

export type AssessmentPillarId = "recovery-fuel" | "physical-functional" | "psych-behavioral";

export interface AssessmentPillar {
  id: AssessmentPillarId;
  title: string;
  /** One plain line under the pillar header. */
  blurb: string;
  /** The areas in this pillar, in the order the audit lists them. */
  sectionIds: readonly AssessmentSectionId[];
}

export const ASSESSMENT_PILLARS: readonly AssessmentPillar[] = [
  {
    id: "recovery-fuel",
    title: "Recovery & Fuel",
    blurb: "Sleep, food and fluids: what the body runs on between sessions.",
    sectionIds: ["sleepRecovery", "nutritionProtein", "protein", "hydration"],
  },
  {
    id: "physical-functional",
    title: "Physical & Functional",
    blurb: "How the body feels and moves from day to day.",
    sectionIds: ["energyDailyFunction", "strengthConfidence", "painMobility", "pain"],
  },
  {
    id: "psych-behavioral",
    title: "Psychological & Behavioral",
    blurb: "Mood, habits and the life around the training.",
    sectionIds: ["mentalEmotional", "consistencyHabits", "lifestyleAlignment", "stress"],
  },
];

const PILLAR_BY_SECTION = new Map<string, AssessmentPillar>(
  ASSESSMENT_PILLARS.flatMap((p) => p.sectionIds.map((id) => [id, p] as const)),
);

export function pillarOf(sectionId: string): AssessmentPillar | null {
  return PILLAR_BY_SECTION.get(sectionId) ?? null;
}

export const isAssessmentSectionId = (id: string): id is AssessmentSectionId =>
  (ALL_ASSESSMENT_SECTION_IDS as readonly string[]).includes(id);

/** The area's name as the panel prints it. */
export function sectionTitle(sectionId: string): string {
  if (sectionId in CATEGORY_BY_KEY) return CATEGORY_BY_KEY[sectionId as SubjectiveCategoryKey].title;
  switch (sectionId) {
    case "protein":
      return "Protein compliance";
    case "hydration":
      return "Hydration";
    case "pain":
      return "Pain map";
    case "stress":
      return "Stress anchors";
    default:
      return sectionId;
  }
}

/**
 * Put a list of areas into pillar groups, each group in the audit's order.
 * Anything with an id no pillar knows is kept, in a trailing group, rather
 * than silently dropped.
 */
export function groupByPillar<T extends { id: string }>(
  items: readonly T[],
): { pillar: AssessmentPillar | null; items: T[] }[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const groups: { pillar: AssessmentPillar | null; items: T[] }[] = ASSESSMENT_PILLARS.map((pillar) => ({
    pillar,
    items: pillar.sectionIds.map((id) => byId.get(id)).filter((x): x is T => !!x),
  }));
  const leftovers = items.filter((it) => !PILLAR_BY_SECTION.has(it.id));
  if (leftovers.length) groups.push({ pillar: null, items: leftovers });
  return groups;
}

/* ------------------------------------------------------------------ *
 * Scales
 * ------------------------------------------------------------------ */

export interface SectionScale {
  /** The number an area is tracked by runs from 0 to this. */
  max: number;
  /** Printed after a value: "9 of 12", "5 days a week". */
  unit: string;
  /** Pain and stress: a smaller number is the better one. */
  lowerIsBetter: boolean;
  /** What 0 looks like, in plain words. */
  low: string;
  /** What `max` looks like, in plain words. */
  high: string;
  /**
   * False when the question bank had no words for an end and the neutral
   * fallback ("Struggling" / "Thriving") was used instead.
   */
  fromBank: boolean;
}

export const NEUTRAL_LOW = "Struggling";
export const NEUTRAL_HIGH = "Thriving";

const { green: DAYS_GREEN, yellow: DAYS_YELLOW } = DAYS_PER_WEEK_THRESHOLDS;
/** "0–1" and "5–7": the document's Red and Green bands for days a week. */
const DAYS_RED_BAND = `0–${DAYS_YELLOW - 1}`;
const DAYS_GREEN_BAND = `${DAYS_GREEN}–7`;

export function sectionScale(sectionId: string): SectionScale {
  if (sectionId in CATEGORY_BY_KEY) {
    // A category's number is its 0–12 score; its ends are described by the
    // first statement's anchors, which are the category's headline question
    // ("I am getting consistent, quality sleep" → under 5 hours … / 7–9 hours …).
    const first = CATEGORY_BY_KEY[sectionId as SubjectiveCategoryKey].statements[0];
    const low = first?.anchorLow?.trim();
    const high = first?.anchorHigh?.trim();
    return {
      max: LEGACY_CATEGORY_MAX,
      unit: `of ${LEGACY_CATEGORY_MAX}`,
      lowerIsBetter: false,
      low: low || NEUTRAL_LOW,
      high: high || NEUTRAL_HIGH,
      fromBank: !!low && !!high,
    };
  }
  switch (sectionId) {
    case "protein":
      return {
        max: 7,
        unit: "days a week",
        lowerIsBetter: false,
        low: `Hits the protein goal ${DAYS_RED_BAND} days a week`,
        high: `Hits the protein goal ${DAYS_GREEN_BAND} days a week`,
        fromBank: true,
      };
    case "hydration":
      return {
        max: 7,
        unit: "days a week",
        lowerIsBetter: false,
        low: `Reaches the fluid target ${DAYS_RED_BAND} days a week`,
        high: `Reaches the fluid target ${DAYS_GREEN_BAND} days a week`,
        fromBank: true,
      };
    case "pain":
      // The pain editor's own label: "Severity (0 none → 10 worst)".
      return {
        max: SCALE_MAX,
        unit: `of ${SCALE_MAX} (worst spot)`,
        lowerIsBetter: true,
        low: "No active pain",
        high: "Worst pain imaginable",
        fromBank: true,
      };
    case "stress":
      // The stress editor's own label: "how heavy does life feel right now?
      // (0 light → 10 crushing)".
      return {
        max: SCALE_MAX,
        unit: `of ${SCALE_MAX}`,
        lowerIsBetter: true,
        low: "Life feels light",
        high: "Life feels crushing",
        fromBank: true,
      };
    default:
      return {
        max: SCALE_MAX,
        unit: `of ${SCALE_MAX}`,
        lowerIsBetter: false,
        low: NEUTRAL_LOW,
        high: NEUTRAL_HIGH,
        fromBank: false,
      };
  }
}
