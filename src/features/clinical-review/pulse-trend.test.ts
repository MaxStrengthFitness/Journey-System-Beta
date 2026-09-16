import { describe, it, expect, vi } from "vitest";

// pulse-trend.ts imports from the subjective-report barrel, which reaches
// the Firestore client through the Pulse's own loader. The trend itself is
// pure; the app's Firebase module is not needed and must not initialise here.
vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {}, functions: {} }));

import { emptyAssessment, type AssessmentHistory, type AssessmentHistoryReport, type SubjectiveAssessment } from "../subjective-report";
import { monthWord, pulseDirection, pulseTrend } from "./pulse-trend";

/** An assessment with one category answered at a given 0–10 value on all three statements. */
function answered(values: Partial<Record<string, number>>): SubjectiveAssessment {
  const a = emptyAssessment();
  const answers: SubjectiveAssessment["answers"] = {};
  for (const [key, v] of Object.entries(values)) {
    if (v === undefined) continue;
    for (let i = 1; i <= 3; i++) answers[`${key}_${i}`] = { value: v };
  }
  return { ...a, answers };
}

function report(id: string, date: string, assessment: SubjectiveAssessment): AssessmentHistoryReport {
  return { id, date, savedAtMs: null, trainerId: "t1", trainerName: "AJ", enteredBy: "coach", assessment, sectionsReviewed: [] };
}

const TODAY = new Date(2026, 8, 16); // Sep 16 2026

describe("pulseTrend", () => {
  it("says 'unavailable' when the read failed and 'none' when nothing is saved — never 'no Pulse' for a failure", () => {
    expect(pulseTrend(null).status).toBe("unavailable");
    expect(pulseTrend(null).areas).toEqual([]);
    const none: AssessmentHistory = { reports: [], complete: true, coversSinceMs: null };
    expect(pulseTrend(none).status).toBe("none");
  });

  it("reads each area first → latest as RAG words with the month it started", () => {
    const history: AssessmentHistory = {
      // Newest first, as the loader returns them; the trend sorts by day.
      reports: [
        report("r3", "2026-09-01", answered({ sleepRecovery: 8, painMobility: 3 })),
        report("r2", "2026-08-05", answered({ sleepRecovery: 5 })),
        report("r1", "2026-07-02", answered({ sleepRecovery: 5, energyDailyFunction: 8 })),
      ],
      complete: true,
      coversSinceMs: null,
    };
    const t = pulseTrend(history, TODAY);
    expect(t.status).toBe("ok");
    expect(t.reports).toBe(3);
    expect(t.areas).toHaveLength(8);
    const sleep = t.areas.find((a) => a.key === "sleepRecovery")!;
    expect(sleep.first).toEqual({ date: "2026-07-02", rag: "yellow" });
    expect(sleep.latest).toEqual({ date: "2026-09-01", rag: "green" });
    expect(sleep.direction).toBe("up");
    expect(sleep.sentence).toBe("Sleep & Recovery: yellow → green since Jul");
    // One reading only.
    const pain = t.areas.find((a) => a.key === "painMobility")!;
    expect(pain.direction).toBe("single");
    expect(pain.sentence).toBe("Pain & Mobility: red (one Pulse so far, Sep)");
    // Never assessed.
    const nutrition = t.areas.find((a) => a.key === "nutritionProtein")!;
    expect(nutrition.first).toBeNull();
    expect(nutrition.sentence).toBe("Nutrition & Protein: not assessed yet");
    // Energy was answered once in July only: a single reading, not a trend.
    const energy = t.areas.find((a) => a.key === "energyDailyFunction")!;
    expect(energy.direction).toBe("single");
  });

  it("says 'unchanged' when the colour held, and carries the incomplete flag", () => {
    const history: AssessmentHistory = {
      reports: [report("b", "2026-08-05", answered({ sleepRecovery: 9 })), report("a", "2026-06-02", answered({ sleepRecovery: 8 }))],
      complete: false,
      coversSinceMs: 1,
    };
    const t = pulseTrend(history, TODAY);
    expect(t.complete).toBe(false);
    const sleep = t.areas.find((a) => a.key === "sleepRecovery")!;
    expect(sleep.direction).toBe("same");
    expect(sleep.sentence).toBe("Sleep & Recovery: green since Jun, unchanged");
  });

  it("names the year only when it is not this one", () => {
    expect(monthWord("2026-07-02", TODAY)).toBe("Jul");
    expect(monthWord("2025-11-20", TODAY)).toBe("Nov 2025");
    expect(pulseDirection("red", "green")).toBe("up");
    expect(pulseDirection("green", "yellow")).toBe("down");
    expect(pulseDirection("yellow", "yellow")).toBe("same");
  });
});
