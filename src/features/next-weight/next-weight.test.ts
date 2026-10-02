import { describe, expect, it, vi } from "vitest";

vi.mock("../../firebase", () => ({ db: {} }));

import {
  DEFAULT_WEIGHT_STEP_LB,
  bumpWeight,
  isNextWeightLive,
  nextWeightChangeLine,
  nextWeightMark,
  nextWeightSourceLine,
  parseWeightEntry,
} from "./next-weight";
import { nextWeightPatch } from "./store";

const mark = {
  weight: 104,
  fromWeight: 100,
  sessionId: "s1",
  setAt: "2026-10-02T15:00:00.000Z",
  setById: "uid-sam",
  setByName: "Sam Trainer",
};

describe("the next session's weight", () => {
  it("moves in two pounds by default, never below zero", () => {
    expect(DEFAULT_WEIGHT_STEP_LB).toBe(2);
    expect(bumpWeight(100, 1)).toBe(102);
    expect(bumpWeight(100, -1)).toBe(98);
    expect(bumpWeight(1, -1)).toBe(0);
    expect(bumpWeight(null, 1)).toBe(2);
    expect(bumpWeight(100, 1, 5)).toBe(105);
  });

  it("reads a typed weight, refusing what isn't one", () => {
    expect(parseWeightEntry(" 105 ")).toBe(105);
    expect(parseWeightEntry("102.5")).toBe(102.5);
    expect(parseWeightEntry("")).toBeNull();
    expect(parseWeightEntry("abc")).toBeNull();
    expect(parseWeightEntry("-4")).toBeNull();
  });

  it("stores no mark when it is set back to today's weight", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(nextWeightMark({ weight: 100, today: 100, sessionId: "s1", setById: "u", setByName: "Sam", now })).toBeNull();
    expect(nextWeightMark({ weight: 104, today: 100, sessionId: "s1", setById: "uid-sam", setByName: "Sam Trainer", now })).toEqual(mark);
  });

  it("is live until a session logs the machine, or the weight on file changes", () => {
    expect(isNextWeightLive(mark, "s1", 104)).toBe(true);
    expect(isNextWeightLive(mark, "s2", 104)).toBe(false);
    expect(isNextWeightLive(mark, "s1", 110)).toBe(false);
    expect(isNextWeightLive(null, "s1", 104)).toBe(false);
  });

  it("says where it came from, and what changed, never why", () => {
    expect(nextWeightSourceLine(mark)).toBe("Set for today at the last Wrap-up by Sam.");
    expect(nextWeightSourceLine({ ...mark, setByName: "" })).toBe("Set for today at the last Wrap-up.");
    expect(nextWeightChangeLine(104, 100)).toBe("Up 4 lb from today");
    expect(nextWeightChangeLine(96, 100)).toBe("Down 4 lb from today");
    expect(nextWeightChangeLine(100, 100)).toBeNull();
  });

  it("writes the weight and the mark on the settings document, and deletes the mark when it is cleared", () => {
    const set = nextWeightPatch({ clientId: "c1", machineId: "m1", homeStudioId: "s1", weight: 104, mark, updatedBy: "uid-sam" });
    expect(set.currentWeight).toBe(104);
    expect(set.nextWeight).toEqual(mark);
    const cleared = nextWeightPatch({ clientId: "c1", machineId: "m1", homeStudioId: null, weight: 100, mark: null, updatedBy: "uid-sam" });
    expect(cleared.currentWeight).toBe(100);
    expect(typeof cleared.nextWeight).toBe("object");
    expect(cleared).not.toHaveProperty("homeStudioId");
  });
});
