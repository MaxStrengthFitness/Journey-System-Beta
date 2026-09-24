import { describe, expect, it } from "vitest";
import { FORD_PULSE_STATEMENTS, FORD_PULSE_STRESS, fordPulseLinks, statementText } from "./pulse-links";
import { SUBJECTIVE_CATEGORIES } from "../subjective-report/questions";
import type { AssessmentHistoryReport } from "../subjective-report/assessment-history";
import type { StressAnchor, SubjectiveAssessment } from "../subjective-report/types";

const NOW = new Date(2027, 2, 16, 12);

function round(
  id: string,
  date: string,
  a: Partial<SubjectiveAssessment> = {},
  sectionsReviewed: string[] = [],
): AssessmentHistoryReport {
  return {
    id,
    date,
    savedAtMs: null,
    trainerId: null,
    trainerName: null,
    enteredBy: "coach",
    assessment: { scaleVersion: 2, answers: {}, stressAnchors: [], overallStressLevel: null, ...a } as SubjectiveAssessment,
    sectionsReviewed,
  };
}

const anchor = (category: StressAnchor["category"], intensity: number, status: StressAnchor["status"] = "active"): StressAnchor => ({
  id: `${category}-${intensity}`,
  category,
  label: "in her words",
  intensity,
  trainingImpact: "low",
  status,
});

describe("the stress lines", () => {
  it("say the Dial's intensity word on each of the two newest rounds, oldest first", () => {
    const links = fordPulseLinks(
      [
        round("new", "2027-03-10", { stressAnchors: [anchor("caregiving", 2)] }),
        round("old", "2026-12-09", { stressAnchors: [anchor("caregiving", 5)] }),
      ],
      NOW,
    );
    expect(links.family).toEqual([
      {
        key: "stress:caregiving",
        sentence: "Pulse stress, “Caring for someone”: Moderate on Dec 9, 2026, Mild on Mar 10.",
      },
    ]);
  });

  it("say 'not raised' for a round that talked about stress without this worry", () => {
    const links = fordPulseLinks(
      [
        round("new", "2027-03-10", { overallStressLevel: 3 }),
        round("old", "2027-01-09", { stressAnchors: [anchor("work", 8)] }),
      ],
      NOW,
    );
    expect(links.occupation.map((l) => l.sentence)).toEqual([
      "Pulse stress, “Work / career”: Severe on Jan 9, not raised on Mar 10.",
    ]);
  });

  it("say nothing about a round that never touched stress", () => {
    const links = fordPulseLinks(
      [
        round("sleep-only", "2027-03-10", { answers: { sleepRecovery_1: { value: 5 } } }),
        round("old", "2027-01-09", { stressAnchors: [anchor("work", 8)] }),
      ],
      NOW,
    );
    expect(links.occupation.map((l) => l.sentence)).toEqual(["Pulse stress, “Work / career”: Severe on Jan 9."]);
  });

  it("say 'resolved' when the round closed the worry, and use the worst live one otherwise", () => {
    const links = fordPulseLinks(
      [
        round("new", "2027-03-10", { stressAnchors: [anchor("family_health", 5, "resolved")] }),
        round("old", "2027-02-01", { stressAnchors: [anchor("family_health", 2), anchor("family_health", 10)] }),
      ],
      NOW,
    );
    expect(links.family.map((l) => l.sentence)).toEqual([
      "Pulse stress, “A family member's health”: Worst on Feb 1, resolved on Mar 10.",
    ]);
  });

  it("put work and retirement under Occupation, caring and family health under Family, nothing under Dreams", () => {
    expect(FORD_PULSE_STRESS.occupation).toEqual(["work", "retirement"]);
    expect(FORD_PULSE_STRESS.family).toEqual(["caregiving", "family_health"]);
    expect(FORD_PULSE_STRESS.dreams).toEqual([]);
    const links = fordPulseLinks(
      [round("r", "2027-03-10", { stressAnchors: [anchor("retirement", 5), anchor("financial", 8), anchor("caregiving", 3)] })],
      NOW,
    );
    expect(links.occupation.map((l) => l.key)).toEqual(["stress:retirement"]);
    expect(links.family.map((l) => l.key)).toEqual(["stress:caregiving"]);
    expect(links.dreams).toEqual([]);
    expect(links.recreation).toEqual([]);
  });
});

describe("the statement lines", () => {
  it("quote the Pulse's own statement text, looked up by id", () => {
    const own = SUBJECTIVE_CATEGORIES.flatMap((c) => c.statements).find((s) => s.id === "lifestyleAlignment_2")!;
    expect(statementText("lifestyleAlignment_2")).toBe(own.text);
    expect(FORD_PULSE_STATEMENTS.recreation).toEqual(["lifestyleAlignment_2"]);
    expect(statementText("nope_9")).toBeNull();
  });

  it("say the frequency word for a v2 answer", () => {
    const links = fordPulseLinks([round("r", "2027-03-10", { answers: { lifestyleAlignment_2: { value: 10 } } })], NOW);
    expect(links.recreation).toEqual([
      {
        key: "statement:lifestyleAlignment_2",
        sentence: `Pulse, “${statementText("lifestyleAlignment_2")}” Nearly always on Mar 10.`,
      },
    ]);
  });

  it("convert a v1 answer before it is worded (3 of 4 is Often)", () => {
    const links = fordPulseLinks(
      [round("r", "2026-10-02", { scaleVersion: 1, answers: { lifestyleAlignment_2: { value: 3 } } })],
      NOW,
    );
    expect(links.recreation[0].sentence).toContain("Often on Oct 2, 2026.");
  });

  it("use the two newest rounds that answered, oldest first", () => {
    const links = fordPulseLinks(
      [
        round("a", "2027-03-10", { answers: { lifestyleAlignment_2: { value: 5 } } }),
        round("b", "2027-02-10", { answers: {} }),
        round("c", "2027-01-10", { answers: { lifestyleAlignment_2: { value: 0 } } }),
        round("d", "2026-12-10", { answers: { lifestyleAlignment_2: { value: 10 } } }),
      ],
      NOW,
    );
    expect(links.recreation[0].sentence).toMatch(/” Not at all on Jan 10, Sometimes on Mar 10\.$/);
  });
});

describe("with no rounds", () => {
  it("says nothing anywhere", () => {
    expect(fordPulseLinks([], NOW)).toEqual({ family: [], occupation: [], recreation: [], dreams: [] });
  });
});
