import { describe, expect, it } from "vitest";
import { machineStory } from "./machine-story";
import type { JourneyRow, JourneySession } from "./types";

const s = (id: string, date: string): JourneySession => ({ id, sessionNumber: 0, date, trainerInitials: "AJ" });
const history = [s("a", "2026-03-03"), s("b", "2026-05-01"), s("c", "2026-07-02"), s("d", "2026-09-17")];
const row = {
  machine: { id: "leg-press" },
  sets: {
    a: { sessionId: "a", outcome: "performed", weight: 90, reps: 10 },
    b: { sessionId: "b", outcome: "practice", weight: 60, reps: 8 },
    c: { sessionId: "c", outcome: "performed", weight: 110, reps: 12 },
    d: { sessionId: "d", outcome: "performed", weight: 120, reps: 11 },
  },
} as unknown as JourneyRow;

describe("a machine's story (Oct 2 2026)", () => {
  it("says Started, Last, Best, Lowest and Most reps, each with its weight, effort and day", () => {
    expect(machineStory(row, history).map((l) => [l.label, l.weight, l.effort, l.date])).toEqual([
      ["Started", 90, "10 reps", "2026-03-03"],
      ["Last", 120, "11 reps", "2026-09-17"],
      ["Best", 120, "11 reps", "2026-09-17"],
      ["Lowest", 90, "10 reps", "2026-03-03"],
      ["Most reps", 110, "12 reps", "2026-07-02"],
    ]);
  });

  it("never reads a practice set, and says nothing for a machine never performed", () => {
    expect(machineStory(row, history).some((l) => l.weight === 60)).toBe(false);
    expect(machineStory({ machine: { id: "x" }, sets: {} } as unknown as JourneyRow, history)).toEqual([]);
  });
});
