/**
 * The question bank and every constant from the reference document
 * ("Subjective Reports", Sep 2026), plus the labels for the enhancements.
 *
 * RULE FOR THIS FILE: category titles and statement text are the document's
 * words, verbatim. Change them here and you change what the client is asked;
 * do not "tidy" them.
 */
import type {
  BodyRegion,
  BodySide,
  HydrationSource,
  PainFrequency,
  PainType,
  StressCategory,
  SubjectiveCategoryDef,
  SubjectiveCategoryKey,
  TrainingImpact,
} from "./types";

/* ------------------------------------------------------------------ *
 * Purpose (verbatim)
 * ------------------------------------------------------------------ */

export const SUBJECTIVE_PURPOSE =
  "Measure meaningful lifestyle and behavior changes supporting strength, health, independence, and longevity.";

export const SUBJECTIVE_CADENCE =
  "Completed every 90 days as a coaching conversation tool.";

export const SUBJECTIVE_CADENCE_DAYS = 90;

/* ------------------------------------------------------------------ *
 * Rating scale
 * ------------------------------------------------------------------ */

/** Scale v1 — the reference document's scale, kept for conversion + display. */
export const LEGACY_SCALE = [
  { value: 0, label: "Not At All" },
  { value: 1, label: "Rarely" },
  { value: 2, label: "Sometimes" },
  { value: 3, label: "Often" },
  { value: 4, label: "Nearly Always" },
] as const;

export const LEGACY_SCALE_MAX = 4;

/**
 * Scale v2 — 0–10 per statement. The frequency words sit at the points the
 * v1 values land on after ×2.5 (0, 2.5→3, 5, 7.5→8, 10), so a coach who
 * thinks in the old words still lands on the same colour.
 */
export const SCALE_MAX = 10;

export const SCALE_ANCHORS = [
  { value: 0, label: "Not at all" },
  { value: 3, label: "Rarely" },
  { value: 5, label: "Sometimes" },
  { value: 8, label: "Often" },
  { value: 10, label: "Nearly always" },
] as const;

/* ------------------------------------------------------------------ *
 * Thresholds (verbatim, expressed once as fractions of the maximum)
 *
 *   Category Status:  Green = 9–12, Yellow = 6–8, Red = 0–5   (of 12)
 *   Overall:          Green = 72–96, Yellow = 48–71, Red = 0–47 (of 96)
 *
 *   9/12 = 72/96 = 0.75   and   6/12 = 48/96 = 0.50
 *
 * So the same two numbers give the documented colours on the 0–12 and 0–96
 * scales AND on the 0–30 / 0–240 scales the v2 answers add up to.
 * ------------------------------------------------------------------ */

export const GREEN_MIN_FRACTION = 0.75;
export const YELLOW_MIN_FRACTION = 0.5;

/** The document's own numbers, kept for display and for the tests. */
export const LEGACY_CATEGORY_MAX = 12;
export const LEGACY_CATEGORY_THRESHOLDS = { green: 9, yellow: 6 } as const;
export const LEGACY_OVERALL_MAX = 96;
export const LEGACY_OVERALL_THRESHOLDS = { green: 72, yellow: 48 } as const;

/* ------------------------------------------------------------------ *
 * Categories (titles + statements verbatim; anchors are the enhancement)
 * ------------------------------------------------------------------ */

const s = (
  key: SubjectiveCategoryKey,
  n: 1 | 2 | 3,
  text: string,
  anchorLow: string,
  anchorHigh: string,
) => ({ id: `${key}_${n}`, text, anchorLow, anchorHigh });

export const SUBJECTIVE_CATEGORIES: SubjectiveCategoryDef[] = [
  {
    key: "sleepRecovery",
    title: "Sleep & Recovery",
    coachPrompt: "Let's start with how you're sleeping and bouncing back.",
    autoFlagWhenRed: true,
    statements: [
      s(
        "sleepRecovery",
        1,
        "I am getting consistent, quality sleep.",
        "Under 5 hours most nights, broken sleep, no routine",
        "7–9 hours most nights on a steady schedule",
      ),
      s(
        "sleepRecovery",
        2,
        "I wake up feeling rested.",
        "Wake up exhausted; need a long time to get going",
        "Wake up refreshed, usually without an alarm",
      ),
      s(
        "sleepRecovery",
        3,
        "I recover well between workouts.",
        "Sore or drained for days; dread the next session",
        "Ready and fresh for every session",
      ),
    ],
  },
  {
    key: "energyDailyFunction",
    title: "Energy & Daily Function",
    coachPrompt: "How is your energy holding up through a normal day?",
    autoFlagWhenRed: false,
    statements: [
      s(
        "energyDailyFunction",
        1,
        "I have steady energy throughout the day.",
        "Big crashes; afternoons are a struggle",
        "Even energy from morning to evening",
      ),
      s(
        "energyDailyFunction",
        2,
        "I feel physically capable doing daily tasks.",
        "Groceries, stairs and chores are hard or avoided",
        "Daily tasks feel easy; nothing is avoided",
      ),
      s(
        "energyDailyFunction",
        3,
        "I don't rely heavily on caffeine.",
        "Can't function without several coffees / energy drinks",
        "Coffee is a pleasure, not a requirement",
      ),
    ],
  },
  {
    key: "strengthConfidence",
    title: "Strength & Physical Confidence",
    coachPrompt: "Compared with three months ago, how does your body feel?",
    autoFlagWhenRed: false,
    statements: [
      s(
        "strengthConfidence",
        1,
        "I feel stronger than I did 3 months ago.",
        "No change, or weaker",
        "Clearly stronger — I notice it outside the gym",
      ),
      s(
        "strengthConfidence",
        2,
        "I feel confident in my body's ability to perform.",
        "Don't trust my body; worry about hurting myself",
        "Trust my body completely",
      ),
      s(
        "strengthConfidence",
        3,
        "I can handle physical challenges without hesitation.",
        "Avoid lifting, carrying, climbing or getting off the floor",
        "Say yes to physical challenges without thinking",
      ),
    ],
  },
  {
    key: "painMobility",
    title: "Pain & Mobility",
    coachPrompt:
      "Any aches or stiffness getting in the way? (We'll map anything specific in a moment.)",
    autoFlagWhenRed: false,
    statements: [
      s(
        "painMobility",
        1,
        "I am free from nagging aches and pains.",
        "Something hurts every day",
        "No nagging aches or pains",
      ),
      s(
        "painMobility",
        2,
        "My mobility/flexibility allows me to move comfortably.",
        "Stiff; can't reach, bend, turn or get up comfortably",
        "Move freely in everything I need to do",
      ),
      s(
        "painMobility",
        3,
        "Physical limitations are not holding me back.",
        "Limitations decide what I can and can't do",
        "Nothing physical is holding me back",
      ),
    ],
  },
  {
    key: "consistencyHabits",
    title: "Consistency & Habits",
    coachPrompt: "How is training fitting into your life right now?",
    autoFlagWhenRed: true,
    statements: [
      s(
        "consistencyHabits",
        1,
        "I am consistent with my workouts.",
        "Miss or reschedule most weeks",
        "Never miss; rescheduling is rare",
      ),
      s(
        "consistencyHabits",
        2,
        "I follow through on commitments I make to myself.",
        "Good intentions, little follow-through",
        "If I say I'll do it, it gets done",
      ),
      s(
        "consistencyHabits",
        3,
        "Fitness is part of my routine, not something I \"try to fit in.\"",
        "Training is the first thing to go when life gets busy",
        "Training is non-negotiable, like brushing my teeth",
      ),
    ],
  },
  {
    key: "mentalEmotional",
    title: "Mental & Emotional Impact",
    coachPrompt: "What does training do for you beyond the physical?",
    autoFlagWhenRed: false,
    statements: [
      s(
        "mentalEmotional",
        1,
        "Exercise positively impacts my mood.",
        "No noticeable effect on mood",
        "A session reliably lifts my mood",
      ),
      s(
        "mentalEmotional",
        2,
        "I feel less stressed because of my fitness routine.",
        "Training doesn't touch my stress",
        "Training is my main stress outlet",
      ),
      s(
        "mentalEmotional",
        3,
        "I feel more confident overall.",
        "No change in how I carry myself",
        "Noticeably more confident in daily life",
      ),
    ],
  },
  {
    key: "nutritionProtein",
    title: "Nutrition & Protein",
    coachPrompt: "Let's talk about food — protein first.",
    autoFlagWhenRed: false,
    statements: [
      s(
        "nutritionProtein",
        1,
        "I consistently eat enough protein to support my goals.",
        "Rarely think about protein; most meals have little",
        "Protein at every meal; hit my number most days",
      ),
      s(
        "nutritionProtein",
        2,
        "My eating habits support my health and strength goals.",
        "Eating works against my goals",
        "Eating clearly supports my goals",
      ),
      s(
        "nutritionProtein",
        3,
        "I make intentional food choices most days.",
        "Eat whatever's easiest, no plan",
        "Choose food on purpose nearly every day",
      ),
    ],
  },
  {
    key: "lifestyleAlignment",
    title: "Lifestyle Alignment",
    coachPrompt: "And outside these walls — how does the rest of your week line up?",
    autoFlagWhenRed: false,
    statements: [
      s(
        "lifestyleAlignment",
        1,
        "My habits outside the gym support my goals.",
        "Habits outside the gym undo the work",
        "Habits outside the gym reinforce the work",
      ),
      s(
        "lifestyleAlignment",
        2,
        "I stay physically active outside of workouts.",
        "Sit most of the day; little walking",
        "Walk, garden, play or move most days",
      ),
      s(
        "lifestyleAlignment",
        3,
        "I am prioritizing my long-term health.",
        "Long-term health isn't on my radar",
        "Long-term health drives my decisions",
      ),
    ],
  },
];

export const CATEGORY_BY_KEY: Record<SubjectiveCategoryKey, SubjectiveCategoryDef> =
  Object.fromEntries(SUBJECTIVE_CATEGORIES.map((c) => [c.key, c])) as Record<
    SubjectiveCategoryKey,
    SubjectiveCategoryDef
  >;

export const ALL_STATEMENT_IDS: string[] = SUBJECTIVE_CATEGORIES.flatMap((c) =>
  c.statements.map((st) => st.id),
);

/* ------------------------------------------------------------------ *
 * Protein Compliance Score (verbatim)
 * ------------------------------------------------------------------ */

export const PROTEIN_INSTRUCTOR_PROMPT =
  "Calculate ideal protein (0.75-1.0g per lb of ideal body weight per day).";

export const PROTEIN_QUESTION =
  "On average, how many days per week do you hit your protein goal?";

export const PROTEIN_G_PER_LB_LOW = 0.75;
export const PROTEIN_G_PER_LB_HIGH = 1.0;
/** Where the slider starts. Inside the documented range; coach can move it. */
export const PROTEIN_G_PER_LB_DEFAULT = 0.85;

/** Rating (verbatim): Green = 5-7 days, Yellow = 2-4 days, Red = 0-1 days. */
export const DAYS_PER_WEEK_THRESHOLDS = { green: 5, yellow: 2 } as const;

/** Enhancement: typical intake ÷ target. */
export const PROTEIN_INTAKE_RATIO_THRESHOLDS = { green: 0.9, yellow: 0.7 } as const;

export const PROTEIN_SOURCE_SUGGESTIONS = [
  "Chicken / turkey",
  "Beef / pork",
  "Fish / seafood",
  "Eggs",
  "Dairy / Greek yogurt",
  "Protein shake",
  "Beans / lentils / tofu",
  "Protein bar",
];

/* ------------------------------------------------------------------ *
 * Hydration (enhancement)
 * ------------------------------------------------------------------ */

/** Studio default target: ½ fl oz per lb of body weight per day. */
export const HYDRATION_OZ_PER_LB_DEFAULT = 0.5;
export const ML_PER_OZ = 29.5735;

export const HYDRATION_RATIO_THRESHOLDS = { green: 0.9, yellow: 0.6 } as const;

export const HYDRATION_SOURCE_LABELS: Record<HydrationSource, string> = {
  water: "Water",
  coffee: "Coffee",
  tea: "Tea",
  soda: "Soda",
  sports_drink: "Sports drink",
  juice: "Juice",
  alcohol: "Alcohol",
  other: "Other",
};

/* ------------------------------------------------------------------ *
 * Pain map (enhancement)
 * ------------------------------------------------------------------ */

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  neck: "Neck",
  shoulder: "Shoulder",
  upper_back: "Upper back",
  mid_back: "Mid back",
  lower_back: "Lower back",
  chest: "Chest",
  elbow: "Elbow",
  wrist_hand: "Wrist / hand",
  hip: "Hip",
  glute: "Glute",
  groin: "Groin",
  thigh: "Thigh / quad",
  hamstring: "Hamstring",
  knee: "Knee",
  calf_shin: "Calf / shin",
  ankle: "Ankle",
  foot: "Foot",
};

/** Grouped for the picker. Centre-line regions have no left/right. */
export const BODY_REGION_GROUPS: { title: string; regions: BodyRegion[] }[] = [
  { title: "Neck & back", regions: ["neck", "upper_back", "mid_back", "lower_back"] },
  { title: "Upper body", regions: ["shoulder", "chest", "elbow", "wrist_hand"] },
  { title: "Hips", regions: ["hip", "glute", "groin"] },
  { title: "Legs", regions: ["thigh", "hamstring", "knee", "calf_shin", "ankle", "foot"] },
];

export const CENTERLINE_REGIONS: BodyRegion[] = [
  "neck",
  "upper_back",
  "mid_back",
  "lower_back",
  "chest",
];

export const BODY_SIDE_LABELS: Record<BodySide, string> = {
  left: "Left",
  right: "Right",
  both: "Both",
  center: "Centre",
};

export const PAIN_TYPE_LABELS: Record<PainType, string> = {
  joint: "Joint",
  muscular: "Muscle",
  nerve: "Nerve / tingling",
  unsure: "Not sure",
};

export const PAIN_FREQUENCY_LABELS: Record<PainFrequency, string> = {
  constant: "Constant",
  daily: "Most days",
  during_training: "During training",
  after_training: "After training",
  occasional: "Now and then",
};

/** Severity at or above this raises a "watch" flag. */
export const PAIN_SEVERE_THRESHOLD = 7;
/** Severity rise of this much since last time raises a "watch" flag. */
export const PAIN_WORSENING_DELTA = 2;

/* ------------------------------------------------------------------ *
 * Stress anchors (enhancement)
 * ------------------------------------------------------------------ */

export const STRESS_CATEGORY_LABELS: Record<StressCategory, string> = {
  caregiving: "Caring for someone",
  family_health: "A family member's health",
  own_health: "My own health",
  work: "Work / career",
  retirement: "Retirement transition",
  financial: "Money",
  grief_loss: "Grief / loss",
  relationship: "Relationship",
  loneliness: "Loneliness / isolation",
  sleep: "Sleep",
  travel_schedule: "Travel / schedule",
  home_move: "Home / moving",
  other: "Something else",
};

export const TRAINING_IMPACT_LABELS: Record<TrainingImpact, string> = {
  none: "No effect on training",
  low: "Might miss the odd session",
  moderate: "Attendance or effort is suffering",
  high: "Could stop training altogether",
};

/* ------------------------------------------------------------------ *
 * Category drop worth a watch flag: 3 points on the 0–12 scale = 25 %.
 * ------------------------------------------------------------------ */

export const CATEGORY_DROP_POINTS = 25;
