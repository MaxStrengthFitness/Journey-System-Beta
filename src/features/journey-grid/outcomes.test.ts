import { describe, expect, it } from "vitest";
import { toJourneyRows, toJourneySet, toJourneySessions } from "./adapters";
import { computeRowStats, journeySummary, orderedSets } from "./stats";

const sessions = toJourneySessions([
  { id: "s1", sessionNumber: 1, date: "2026-09-01", trainerInitials: "aj" },
  { id: "s2", sessionNumber: 2, date: "2026-09-03", trainerInitials: "aj" },
  { id: "s3", sessionNumber: 3, date: "2026-09-05", trainerInitials: "aj" },
  { id: "s4", sessionNumber: 4, date: "2026-09-08", trainerInitials: "aj" },
  { id: "s5", sessionNumber: 5, date: "2026-09-10", trainerInitials: "aj" },
]);

const logs = [
  { sessionId: "s1", machineId: "lp", weight: "100", reps: "10" },
  // A practice set at a lighter load — recorded, never counted.
  { sessionId: "s2", machineId: "lp", weight: "60", reps: "15", outcome: "practice" as const },
  { sessionId: "s3", machineId: "lp", weight: "104", reps: "9" },
  // Skipped for pain: no numbers at all.
  { sessionId: "s4", machineId: "lp", outcome: "skipped" as const, skipReason: "pain_injury" },
  // Written by Finish Session for a machine the session never got to.
  { sessionId: "s5", machineId: "lp", outcome: "not_reached" as const },
  // A legacy log with a weight and no count: skipped, reason unknown.
  { sessionId: "s5", machineId: "cp", weight: "80" },
];

describe("toJourneySet — every outcome gets a cell, only performed gets a rating", () => {
  it("draws a practice set with its numbers and no quality edge", () => {
    const set = toJourneySet(logs[1]);
    expect(set?.outcome).toBe("practice");
    expect(set?.weight).toBe(60);
    expect(set?.reps).toBe(15);
  });

  it("draws a skipped machine with its reason and a zero load", () => {
    const set = toJourneySet(logs[3]);
    expect(set?.outcome).toBe("skipped");
    expect(set?.skipReason).toBe("pain_injury");
    expect(set?.weight).toBe(0);
  });

  it("reads a legacy weight-only log as skipped, reason unknown", () => {
    const set = toJourneySet(logs[5]);
    expect(set?.outcome).toBe("skipped");
    expect(set?.skipReason).toBe("unknown");
  });

  it("gives a performed set with no load no cell at all — a broken record is not a data point", () => {
    expect(toJourneySet({ sessionId: "s1", machineId: "lp", reps: "10" })).toBeNull();
  });
});

describe("the row's numbers read performed sets only", () => {
  const [row] = toJourneyRows([{ id: "lp", name: "Leg Press" }], logs, {});

  it("orderedSets skips practice, skipped and not-reached cells", () => {
    expect(orderedSets(row, sessions).map((s) => s.sessionId)).toEqual(["s1", "s3"]);
  });

  it("the Analytics column never sees the practice load as a lowest weight", () => {
    const stats = computeRowStats(row, sessions);
    expect(stats.low?.set.weight).toBe(100);
    expect(stats.high?.set.weight).toBe(104);
    expect(stats.mostReps?.set.reps).toBe(10); // not the practice set's 15
  });

  it("the summary runs from the first performed load to the last", () => {
    expect(journeySummary(row, sessions)).toBe("100 → 104 lb (+4%)");
  });

  it("the cells themselves are all present, so the row still tells the whole story", () => {
    expect(Object.keys(row.sets).sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(row.sets.s5.outcome).toBe("not_reached");
  });
});
