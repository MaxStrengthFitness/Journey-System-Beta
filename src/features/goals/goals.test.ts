import { describe, expect, it } from "vitest";
import {
  EMPTY_SMART,
  GOAL_HISTORY_CAP,
  buildAchievedGoal,
  dayKeyToDate,
  daysUntil,
  formatDayKey,
  normalizeSmartChecks,
  pushGoalHistory,
  readGoalHistory,
  sameSmartChecks,
  smartBadge,
  smartCount,
  targetDateLabel,
  type GoalHistoryEntry,
} from "./goals";

describe("SMART checklist", () => {
  it("reads anything on the record as five booleans", () => {
    expect(normalizeSmartChecks(undefined)).toEqual(EMPTY_SMART);
    expect(normalizeSmartChecks(null)).toEqual(EMPTY_SMART);
    // "Discard edits" resets an unknown field to "".
    expect(normalizeSmartChecks("")).toEqual(EMPTY_SMART);
    expect(normalizeSmartChecks({ s: true, m: "yes", t: 1 })).toEqual({
      ...EMPTY_SMART,
      s: true,
    });
  });

  it("is a SMART goal only with all five", () => {
    const all = { s: true, m: true, a: true, r: true, t: true };
    expect(smartBadge(all)).toEqual({ smart: true, label: "SMART goal" });
    expect(smartBadge({ ...all, r: false })).toEqual({ smart: false, label: "Raw goal · 4 of 5" });
    expect(smartBadge(EMPTY_SMART).label).toBe("Raw goal · 0 of 5");
    expect(smartCount({ ...EMPTY_SMART, m: true, t: true })).toBe(2);
  });

  it("compares two checklists by value", () => {
    expect(sameSmartChecks({ ...EMPTY_SMART }, EMPTY_SMART)).toBe(true);
    expect(sameSmartChecks({ ...EMPTY_SMART, a: true }, EMPTY_SMART)).toBe(false);
  });
});

describe("target date", () => {
  it("reads a day key at local noon, never as UTC midnight", () => {
    const d = dayKeyToDate("2026-11-26")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(12);
    expect(dayKeyToDate("11/26/2026")).toBeNull();
    expect(formatDayKey("nope")).toBe("");
    expect(formatDayKey("2026-11-26")).toContain("26");
  });

  it("counts calendar days to the target, late in the evening too", () => {
    // 11:30pm local on Sep 15: still Sep 15 for the studio.
    const lateEvening = new Date(2026, 8, 15, 23, 30);
    expect(daysUntil("2026-09-16", lateEvening)).toBe(1);
    expect(daysUntil("2026-09-15", lateEvening)).toBe(0);
    expect(daysUntil("2026-09-10", lateEvening)).toBe(-5);
    expect(targetDateLabel("2026-09-15", lateEvening)).toBe("today");
    expect(targetDateLabel("2026-09-16", lateEvening)).toBe("tomorrow");
    expect(targetDateLabel("2026-09-25", lateEvening)).toBe("in 10 days");
    expect(targetDateLabel("2026-09-10", lateEvening)).toBe("5 days ago");
  });
});

describe("achieving a goal", () => {
  const now = new Date("2026-09-15T16:00:00Z");

  it("builds a history row with no undefined values in it", () => {
    const row = buildAchievedGoal({
      goal: "  Carry both grandkids up the stairs  ",
      targetDate: "2026-11-26",
      reward: " Kaizen pin ",
      byTrainerId: "t1",
      byName: "Jane Coach",
      now,
    })!;
    expect(row).toEqual({
      goal: "Carry both grandkids up the stairs",
      targetDate: "2026-11-26",
      achievedAt: "2026-09-15T16:00:00.000Z",
      reward: "Kaizen pin",
      byTrainerId: "t1",
      byName: "Jane Coach",
    });
    // Firestore refuses undefined anywhere in a document.
    const bare = buildAchievedGoal({ goal: "Walk the 5k", reward: "  ", targetDate: "", now })!;
    expect(Object.keys(bare).sort()).toEqual(["achievedAt", "goal"]);
    expect(Object.values(bare).every((v) => v !== undefined)).toBe(true);
  });

  it("refuses to record an empty goal", () => {
    expect(buildAchievedGoal({ goal: "   ", now })).toBeNull();
    expect(buildAchievedGoal({ goal: undefined, now })).toBeNull();
  });

  it("pushes newest first and keeps the newest 30", () => {
    const row = (i: number): GoalHistoryEntry => ({
      goal: `Goal ${i}`,
      achievedAt: new Date(2026, 0, i + 1).toISOString(),
    });
    const full = Array.from({ length: GOAL_HISTORY_CAP }, (_, i) => row(GOAL_HISTORY_CAP - i));
    const next = pushGoalHistory(full, row(99));
    expect(next).toHaveLength(GOAL_HISTORY_CAP);
    expect(next[0].goal).toBe("Goal 99");
    // The oldest one fell off the end.
    expect(next.some((g) => g.goal === "Goal 1")).toBe(false);
    // The input is not mutated.
    expect(full).toHaveLength(GOAL_HISTORY_CAP);
  });

  it("starts a history from nothing, and drops junk rows", () => {
    const first = pushGoalHistory(undefined, { goal: "A", achievedAt: now.toISOString() });
    expect(first).toEqual([{ goal: "A", achievedAt: now.toISOString() }]);
    const cleaned = pushGoalHistory(
      [null, "x", { nope: true }, { goal: "B", achievedAt: now.toISOString() }],
      { goal: "C", achievedAt: now.toISOString() },
    );
    expect(cleaned.map((g) => g.goal)).toEqual(["C", "B"]);
    expect(pushGoalHistory("", { goal: "D", achievedAt: now.toISOString() })).toHaveLength(1);
  });

  it("reads a stored history newest first", () => {
    const list = readGoalHistory([
      { goal: "old", achievedAt: "2025-01-01T12:00:00.000Z" },
      { goal: "new", achievedAt: "2026-01-01T12:00:00.000Z" },
      7,
    ]);
    expect(list.map((g) => g.goal)).toEqual(["new", "old"]);
    expect(readGoalHistory(undefined)).toEqual([]);
  });
});
