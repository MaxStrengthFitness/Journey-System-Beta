import { describe, expect, it } from "vitest";
import { historyFromDocs } from "../../subjective-report/assessment-history";
import { emptyAssessment } from "../../subjective-report/scoring";
import { bodySubline, newestPulseDay } from "./page-lines";

const NOW = new Date(2027, 2, 24, 12);

describe("Body & Pulse's sub-toggle line", () => {
  it("counts the watch-outs with a plum dot, crimson only for an absolute contraindication", () => {
    expect(bodySubline({ flagIds: ["gen-blood-pressure"], pulseDay: null, now: NOW })).toEqual({
      meta: "1 watch-out",
      flag: true,
      flagTone: "warn",
    });
    expect(bodySubline({ flagIds: ["joint-tka", "cv-hypertension"], pulseDay: "2027-03-10", now: NOW })).toEqual({
      meta: "2 watch-outs",
      flag: true,
      flagTone: "alert",
    });
  });

  it("says when the Pulse was last saved when nothing is on file, else what the page holds", () => {
    expect(bodySubline({ flagIds: [], pulseDay: "2027-03-10", now: NOW })).toMatchObject({
      meta: "Pulse Mar 10",
      flag: false,
    });
    expect(bodySubline({ flagIds: [], pulseDay: "2025-11-02", now: NOW }).meta).toBe("Pulse Nov 2, 2025");
    expect(bodySubline({ flagIds: undefined, pulseDay: null, now: NOW })).toMatchObject({
      meta: "Build and Pulse",
      flag: false,
    });
  });

  it("reads the newest saved round's day from the history, and nothing while it is unknown", () => {
    const round = (id: string, date: string) => ({
      id,
      date,
      status: "Finalized",
      subjective: emptyAssessment({ bodyWeightLbs: null }),
      createdAt: `${date}T15:00:00Z`,
    });
    expect(newestPulseDay(historyFromDocs([round("a", "2026-12-09"), round("b", "2027-03-10")], 50))).toBe(
      "2027-03-10",
    );
    expect(newestPulseDay(null)).toBeNull();
    expect(newestPulseDay(historyFromDocs([], 50))).toBeNull();
  });
});
