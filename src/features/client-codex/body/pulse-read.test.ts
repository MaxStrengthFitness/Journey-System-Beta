import { describe, expect, it } from "vitest";
import { historyFromDocs, type AssessmentHistory } from "../../subjective-report/assessment-history";
import { CATEGORY_BY_KEY } from "../../subjective-report/questions";
import { emptyAssessment } from "../../subjective-report/scoring";
import type { PainPoint, StressAnchor, SubjectiveAssessment } from "../../subjective-report/types";
import {
  NOT_ASKED,
  STALE_SUFFIX,
  latestPain,
  latestPulseReadings,
  previousReading,
  pulseAreaRows,
  shownStatement,
  spotWords,
  statementChange,
  stressLabel,
  type PulseDraftView,
  type PulseSource,
} from "./pulse-read";

const NOW = new Date(2027, 2, 24, 12);

function assessment(over: Partial<SubjectiveAssessment> = {}): SubjectiveAssessment {
  return { ...emptyAssessment({ bodyWeightLbs: null }), scaleVersion: 2, ...over };
}

function round(id: string, date: string, a: Partial<SubjectiveAssessment>, reviewed: string[] = []) {
  return {
    id,
    date,
    status: "Finalized",
    subjective: assessment(a),
    checkInSectionsReviewed: reviewed,
    createdAt: `${date}T15:00:00Z`,
  };
}

/** Newest first, as the listener reads them; fewer than the limit, so complete. */
const history = (...docs: ReturnType<typeof round>[]): AssessmentHistory => historyFromDocs(docs, 50);

const pain = (over: Partial<PainPoint>): PainPoint => ({
  id: over.id ?? "p1",
  region: "knee",
  side: "right",
  type: "joint",
  severity: 3,
  frequency: "occasional",
  aggravatingMachineIds: [],
  linkedJournalEntryIds: [],
  status: "active",
  ...over,
});

const draft = (a: Partial<SubjectiveAssessment>, over: Partial<PulseDraftView> = {}): PulseDraftView => ({
  assessment: assessment(a),
  savedAt: new Date(2027, 2, 20, 10).getTime(),
  reviewed: [],
  ...over,
});

describe("the latest answer to each statement", () => {
  it("lets the open draft's answer beat an older saved round", () => {
    const src: PulseSource = {
      draft: draft({ answers: { sleepRecovery_2: { value: 10 } } }),
      history: history(round("r1", "2027-03-10", { answers: { sleepRecovery_2: { value: 3 } } })),
    };
    const r = latestPulseReadings(src).get("sleepRecovery_2")!;
    expect(r).toMatchObject({ value: 10, word: "Nearly always", source: "draft", day: "2027-03-20" });
  });

  it("carries a saved answer forward when the draft skipped it (the living rule)", () => {
    const src: PulseSource = {
      draft: draft({ answers: {} }),
      history: history(
        round("r2", "2027-03-10", { answers: {} }),
        round("r1", "2026-12-09", { answers: { sleepRecovery_2: { value: 8 } } }),
      ),
    };
    expect(latestPulseReadings(src).get("sleepRecovery_2")).toMatchObject({
      value: 8,
      word: "Often",
      day: "2026-12-09",
    });
  });

  it("reads words, never numbers: 8 is Often, 3 is Rarely", () => {
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r1", "2027-03-10", {
          answers: { energyDailyFunction_1: { value: 8 }, energyDailyFunction_2: { value: 3 } },
        }),
      ),
    };
    const readings = latestPulseReadings(src);
    expect(readings.get("energyDailyFunction_1")?.word).toBe("Often");
    expect(readings.get("energyDailyFunction_2")?.word).toBe("Rarely");
  });

  it("picks the most recently answered statement per area, ties in the bank's order", () => {
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r2", "2027-03-10", { answers: { sleepRecovery_3: { value: 5 } } }),
        round("r1", "2026-12-09", { answers: { sleepRecovery_1: { value: 8 }, sleepRecovery_2: { value: 8 } } }),
      ),
    };
    const shown = shownStatement("sleepRecovery", latestPulseReadings(src))!;
    expect(shown.id).toBe("sleepRecovery_3");
    expect(shown.text).toBe(CATEGORY_BY_KEY.sleepRecovery.statements[2].text);

    const tie: PulseSource = {
      draft: null,
      history: history(
        round("r1", "2027-03-10", { answers: { sleepRecovery_2: { value: 8 }, sleepRecovery_1: { value: 8 } } }),
      ),
    };
    expect(shownStatement("sleepRecovery", latestPulseReadings(tie))!.id).toBe("sleepRecovery_1");
    expect(shownStatement("mentalEmotional", latestPulseReadings(tie))).toBeNull();
  });

  it("finds the last different answer before, and says the change in words", () => {
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r3", "2027-03-10", { answers: { strengthConfidence_1: { value: 8 } } }),
        round("r2", "2026-12-09", { answers: { strengthConfidence_1: { value: 8 } } }),
        round("r1", "2026-09-16", { answers: { strengthConfidence_1: { value: 3 } } }),
      ),
    };
    const now = latestPulseReadings(src).get("strengthConfidence_1")!;
    const prev = previousReading("strengthConfidence_1", src, now)!;
    expect(prev).toMatchObject({ word: "Rarely", day: "2026-09-16" });
    expect(statementChange("I feel stronger than I did 3 months ago.", now, prev, NOW)).toBe(
      "“I feel stronger than I did 3 months ago.” Often, up from Rarely in Sep 2026.",
    );
    // With the current answer's own day, for a line that names a newer one.
    expect(statementChange("I feel stronger than I did 3 months ago.", now, prev, NOW, "Mar 10")).toBe(
      "“I feel stronger than I did 3 months ago.” Often (Mar 10), up from Rarely in Sep 2026.",
    );
    expect(statementChange("x", now, null, NOW)).toBeNull();
  });
});

describe("the pain map as she last told it", () => {
  it("takes the previous word from an earlier round, matched on region and side", () => {
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r2", "2027-03-10", {
          painMap: [pain({ id: "a", severity: 3 }), pain({ id: "b", region: "neck", side: "center", severity: 3 })],
        }),
        round("r1", "2026-09-16", {
          painMap: [
            pain({ id: "a0", side: "left", severity: 10 }),
            pain({ id: "a1", severity: 5 }),
            pain({ id: "b0", region: "neck", side: "center", severity: 3 }),
          ],
        }),
      ),
    };
    const p = latestPain(src)!;
    expect(p.day).toBe("2027-03-10");
    const knee = p.spots.find((s) => s.point.region === "knee")!;
    expect(knee.word).toBe("Mild");
    expect(knee.prev).toEqual({ word: "Moderate", day: "2026-09-16" });
    // The same word before: no "previous" to say.
    expect(p.spots.find((s) => s.point.region === "neck")!.prev).toBeNull();
  });

  it("reads the intensity scale reversed: 3 is Mild, 10 is Worst", () => {
    const src: PulseSource = { draft: draft({ painMap: [pain({ severity: 10 })] }), history: history() };
    expect(latestPain(src)!.spots[0].word).toBe("Worst");
  });

  it("leaves a resolved spot out, and says nothing to report when the round found nothing active", () => {
    const src: PulseSource = {
      draft: null,
      history: history(round("r1", "2027-03-10", { painMap: [pain({ status: "resolved" })] })),
    };
    const p = latestPain(src)!;
    expect(p.spots).toEqual([]);
    expect(p.reviewedNone).toBe(true);
    const reviewed: PulseSource = { draft: draft({}, { reviewed: ["pain"] }), history: history() };
    expect(latestPain(reviewed)!.reviewedNone).toBe(true);
    expect(latestPain({ draft: null, history: history() })).toBeNull();
  });

  it("names a spot the way a sentence does", () => {
    expect(spotWords({ region: "knee", side: "right" })).toBe("right knee");
    expect(spotWords({ region: "shoulder", side: "both" })).toBe("shoulder (both sides)");
    expect(spotWords({ region: "neck", side: "center" })).toBe("neck");
  });
});

describe("the read grid", () => {
  const rowsOf = (src: PulseSource) =>
    pulseAreaRows(src, NOW).flatMap((p) => p.rows.map((r) => ({ ...r, pillar: p.title })));

  it("groups the twelve areas under the Pulse's three pillars, titles verbatim", () => {
    const pillars = pulseAreaRows({ draft: null, history: history() }, NOW);
    expect(pillars.map((p) => p.title)).toEqual([
      "Recovery & Fuel",
      "Physical & Functional",
      "Psychological & Behavioral",
    ]);
    expect(pillars[0].rows.map((r) => r.title)).toEqual([
      "Sleep & Recovery",
      "Nutrition & Protein",
      "Protein compliance",
      "Hydration",
    ]);
    expect(rowsOf({ draft: null, history: history() }).every((r) => r.line === NOT_ASKED)).toBe(true);
  });

  it("writes each kind of area its own way", () => {
    const anchor: StressAnchor = {
      id: "s1",
      category: "caregiving",
      label: "Looking after Mum",
      intensity: 3,
      trainingImpact: "low",
      status: "active",
    };
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r1", "2027-03-10", {
          answers: { sleepRecovery_2: { value: 8 } },
          protein: { ...assessment().protein, daysPerWeekOnTarget: 5 },
          painMap: [pain({}), pain({ id: "n", region: "neck", side: "center" })],
          stressAnchors: [anchor],
        }),
      ),
    };
    const rows = rowsOf(src);
    const line = (id: string) => rows.find((r) => r.id === id)!.line;
    expect(line("sleepRecovery")).toBe("“I wake up feeling rested.” Often · Mar 10");
    expect(line("protein")).toBe("On target 5 days a week · Mar 10");
    expect(line("pain")).toBe("Right knee Mild · neck Mild · Mar 10");
    expect(line("stress")).toBe("Looking after Mum · Mild · Mar 10");
    expect(rows.find((r) => r.id === "stress")!.alsoOnFord).toEqual(["family"]);
    expect(stressLabel({ label: " ", category: "work" })).toBe("Work / career");
  });

  it("marks an area gone quiet for over 90 days", () => {
    const src: PulseSource = {
      draft: null,
      history: history(
        round("r2", "2027-03-10", { answers: { sleepRecovery_1: { value: 8 } } }),
        round("r1", "2026-09-16", { hydration: { ...assessment().hydration, daysPerWeekOnTarget: 4 } }),
      ),
    };
    const rows = rowsOf(src);
    const hydration = rows.find((r) => r.id === "hydration")!;
    expect(hydration.stale).toBe(true);
    expect(hydration.line).toBe(`On target 4 days a week · Sep 16, 2026${STALE_SUFFIX}`);
    expect(rows.find((r) => r.id === "sleepRecovery")!.stale).toBe(false);
  });
});
