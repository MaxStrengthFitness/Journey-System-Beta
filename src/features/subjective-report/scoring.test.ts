import { describe, expect, it } from "vitest";
import {
  buildFlags,
  compareCategories,
  convertLegacyAnswer,
  emptyAssessment,
  parseWeightLbs,
  ragForDaysPerWeek,
  ragForFraction,
  scoreCategory,
  scoreHydration,
  scoreOverall,
  scoreProtein,
  summarize,
  summarizePain,
} from "./scoring";
import {
  ALL_STATEMENT_IDS,
  LEGACY_CATEGORY_MAX,
  LEGACY_OVERALL_MAX,
  SUBJECTIVE_CATEGORIES,
} from "./questions";
import type { StatementAnswer, SubjectiveAssessment } from "./types";

/** Build an answers map giving every statement in a category the same value. */
const answersFor = (
  values: Partial<Record<string, number | null>>,
): Record<string, StatementAnswer> =>
  Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, { value: value ?? null }]),
  );

const allAnswers = (value: number) =>
  answersFor(Object.fromEntries(ALL_STATEMENT_IDS.map((id) => [id, value])));

describe("reference document is intact", () => {
  it("has eight categories with three statements each", () => {
    expect(SUBJECTIVE_CATEGORIES).toHaveLength(8);
    for (const c of SUBJECTIVE_CATEGORIES) expect(c.statements).toHaveLength(3);
    expect(ALL_STATEMENT_IDS).toHaveLength(24);
  });

  it("keeps the titles verbatim", () => {
    expect(SUBJECTIVE_CATEGORIES.map((c) => c.title)).toEqual([
      "Sleep & Recovery",
      "Energy & Daily Function",
      "Strength & Physical Confidence",
      "Pain & Mobility",
      "Consistency & Habits",
      "Mental & Emotional Impact",
      "Nutrition & Protein",
      "Lifestyle Alignment",
    ]);
  });

  it("auto-flags exactly Sleep & Recovery and Consistency & Habits", () => {
    expect(
      SUBJECTIVE_CATEGORIES.filter((c) => c.autoFlagWhenRed).map((c) => c.key),
    ).toEqual(["sleepRecovery", "consistencyHabits"]);
  });
});

describe("category thresholds: Green 9–12, Yellow 6–8, Red 0–5 (of 12)", () => {
  // Walk every legacy total 0..12 and check the colour the document gives it.
  const expected = (legacy: number) =>
    legacy >= 9 ? "green" : legacy >= 6 ? "yellow" : "red";

  it("matches on the 0–12 scale", () => {
    for (let legacy = 0; legacy <= LEGACY_CATEGORY_MAX; legacy++) {
      expect(ragForFraction(legacy / LEGACY_CATEGORY_MAX)).toBe(expected(legacy));
    }
  });

  it("matches on the 0–4 legacy scale after conversion", () => {
    // 3 statements × (0..4) = 0..12 legacy total.
    for (let a = 0; a <= 4; a++)
      for (let b = 0; b <= 4; b++)
        for (let c = 0; c <= 4; c++) {
          const score = scoreCategory(
            "sleepRecovery",
            answersFor({ sleepRecovery_1: a, sleepRecovery_2: b, sleepRecovery_3: c }),
            1,
          );
          expect(score.status).toBe(expected(a + b + c));
        }
  });

  it("converts 0,1,2,3,4 → 0,3,5,8,10", () => {
    expect([0, 1, 2, 3, 4].map(convertLegacyAnswer)).toEqual([0, 3, 5, 8, 10]);
  });

  it("is incomplete (no status) until all three statements are answered", () => {
    const s = scoreCategory(
      "sleepRecovery",
      answersFor({ sleepRecovery_1: 10, sleepRecovery_2: 10 }),
    );
    expect(s.isComplete).toBe(false);
    expect(s.status).toBeNull();
    expect(s.percent).toBe(1);
  });
});

describe("overall thresholds: Green 72–96, Yellow 48–71, Red 0–47 (of 96)", () => {
  it("scores 96 when every statement is 10", () => {
    const a: SubjectiveAssessment = { ...emptyAssessment(), answers: allAnswers(10) };
    const overall = scoreOverall(
      SUBJECTIVE_CATEGORIES.map((c) => scoreCategory(c.key, a.answers)),
    );
    expect(overall.legacyScore).toBe(LEGACY_OVERALL_MAX);
    expect(overall.status).toBe("green");
  });

  it("puts the boundaries where the document does", () => {
    expect(ragForFraction(72 / 96)).toBe("green");
    expect(ragForFraction(71 / 96)).toBe("yellow");
    expect(ragForFraction(48 / 96)).toBe("yellow");
    expect(ragForFraction(47 / 96)).toBe("red");
  });
});

describe("protein compliance", () => {
  it("Green = 5–7 days, Yellow = 2–4 days, Red = 0–1 days", () => {
    expect([0, 1].map(ragForDaysPerWeek)).toEqual(["red", "red"]);
    expect([2, 3, 4].map(ragForDaysPerWeek)).toEqual(["yellow", "yellow", "yellow"]);
    expect([5, 6, 7].map(ragForDaysPerWeek)).toEqual(["green", "green", "green"]);
  });

  it("calculates the 0.75–1.0 g/lb range from ideal body weight", () => {
    const s = scoreProtein({
      idealBodyWeightLbs: 160,
      gramsPerLb: 0.85,
      daysPerWeekOnTarget: 6,
      typicalGramsPerDay: null,
      primarySources: [],
    });
    expect(s.targetLowG).toBe(120);
    expect(s.targetHighG).toBe(160);
    expect(s.targetG).toBe(136);
    expect(s.status).toBe("green");
  });

  it("lets a low real intake pull a green days score down", () => {
    const s = scoreProtein({
      idealBodyWeightLbs: 160,
      gramsPerLb: 0.85,
      daysPerWeekOnTarget: 6,
      typicalGramsPerDay: 70, // ~51 % of target
      primarySources: [],
    });
    expect(s.daysStatus).toBe("green");
    expect(s.intakeStatus).toBe("red");
    expect(s.status).toBe("red");
  });
});

describe("hydration", () => {
  it("defaults the target to half the body weight in oz", () => {
    expect(emptyAssessment({ bodyWeightLbs: 180 }).hydration.targetPerDay).toBe(90);
  });
  it("scores the ratio of typical to target", () => {
    expect(
      scoreHydration({
        unit: "oz",
        typicalPerDay: 40,
        targetPerDay: 90,
        targetSource: "studio_default",
        daysPerWeekOnTarget: null,
        primarySources: ["water"],
      }).status,
    ).toBe("red");
  });
});

describe("pain map trends", () => {
  const knee = {
    id: "p1",
    region: "knee" as const,
    side: "left" as const,
    type: "joint" as const,
    frequency: "daily" as const,
    aggravatingMachineIds: [],
    linkedJournalEntryIds: [],
    status: "active" as const,
  };
  it("matches by region + side and reports the change", () => {
    const s = summarizePain([{ ...knee, severity: 7 }], [{ ...knee, severity: 4 }]);
    expect(s.trends[0].severityChange).toBe(3);
    expect(s.trends[0].isNew).toBe(false);
    expect(s.worstSeverity).toBe(7);
  });
  it("lists points that were active last time and are gone now", () => {
    const s = summarizePain([], [{ ...knee, severity: 4 }]);
    expect(s.resolvedSinceLast).toHaveLength(1);
    expect(s.activeCount).toBe(0);
  });
});

describe("flags", () => {
  it("raises the three documented red flags", () => {
    const a: SubjectiveAssessment = {
      ...emptyAssessment({ bodyWeightLbs: 160 }),
      answers: allAnswers(2), // every category red
    };
    a.protein.daysPerWeekOnTarget = 1;
    const s = summarize(a, null);
    const red = s.flags.filter((f) => f.severity === "red").map((f) => f.code);
    expect(red).toContain("protein_red");
    expect(red).toContain("sleep_red");
    expect(red).toContain("consistency_red");
    // the other six red categories are "watch", never "red"
    expect(s.flags.filter((f) => f.code === "category_red")).toHaveLength(6);
    expect(s.redCategories).toHaveLength(8);
  });

  it("flags a 25 % drop and picks largest improvement / opportunity", () => {
    const prev: SubjectiveAssessment = { ...emptyAssessment(), answers: allAnswers(8) };
    const cur: SubjectiveAssessment = {
      ...emptyAssessment(),
      answers: {
        ...allAnswers(8),
        // sleep drops to 5s (−30 pts), strength rises to 10s (+20 pts)
        sleepRecovery_1: { value: 5 },
        sleepRecovery_2: { value: 5 },
        sleepRecovery_3: { value: 5 },
        strengthConfidence_1: { value: 10 },
        strengthConfidence_2: { value: 10 },
        strengthConfidence_3: { value: 10 },
      },
    };
    const s = summarize(cur, { reportId: "r0", date: "2026-06-01", assessment: prev });
    expect(s.flags.some((f) => f.code === "category_drop" && f.categoryKey === "sleepRecovery")).toBe(true);
    expect(s.largestImprovement?.key).toBe("strengthConfidence");
    expect(s.largestOpportunity?.key).toBe("sleepRecovery");
    expect(s.previousReportId).toBe("r0");
  });

  it("does not raise flags on an untouched assessment", () => {
    const s = summarize(emptyAssessment(), null);
    expect(s.flags).toEqual([]);
    expect(s.overall.status).toBeNull();
  });

  it("compareCategories tolerates no previous", () => {
    const cur = SUBJECTIVE_CATEGORIES.map((c) => scoreCategory(c.key, allAnswers(6)));
    expect(compareCategories(cur, null)[0].changePoints).toBeNull();
    expect(buildFlags).toBeTypeOf("function");
  });
});

describe("parseWeightLbs", () => {
  it("reads lbs, kg and bare numbers", () => {
    expect(parseWeightLbs("185 lbs")).toBe(185);
    expect(parseWeightLbs("84 kg")).toBe(185);
    expect(parseWeightLbs("172")).toBe(172);
    expect(parseWeightLbs("")).toBeNull();
    expect(parseWeightLbs(undefined)).toBeNull();
  });
});
