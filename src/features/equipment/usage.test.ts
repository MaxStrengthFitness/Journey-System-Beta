import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import { NO_USAGE, progressionPct, usageFromLogs, usageFromStats } from "./adapters";

describe("progressionPct", () => {
  it("is the change from the first load, rounded, or null without both ends", () => {
    expect(progressionPct(40, 66)).toBe(65);
    expect(progressionPct(100, 92)).toBe(-8);
    expect(progressionPct(50, 50)).toBe(0);
    expect(progressionPct(null, 66)).toBeNull();
    expect(progressionPct(40, null)).toBeNull();
    expect(progressionPct(0, 40)).toBeNull();
  });
});

describe("usageFromStats", () => {
  it("reads the lifetime rollup and measures progression to the prescribed current weight", () => {
    const u = usageFromStats({ firstPerformedDate: "2026-06-15", firstWeight: 40, lastPerformedDate: "2026-09-01", lastWeight: 62, timesPerformed: 12 }, 66);
    expect(u).toEqual({ firstPerformed: "2026-06-15", lastPerformed: "2026-09-01", timesPerformed: 12, firstWeight: 40, lastWeight: 62, progressionPct: 65, partial: false });
  });

  it("falls back to the last performed load when nothing is prescribed", () => {
    const u = usageFromStats({ firstWeight: 40, lastWeight: 60, timesPerformed: 3 }, null);
    expect(u.progressionPct).toBe(50);
  });

  it("is empty for a machine with no rollup entry", () => {
    expect(usageFromStats(undefined, 50)).toBe(NO_USAGE);
  });
});

describe("usageFromLogs", () => {
  const sessions: WorkoutSession[] = [
    { id: "s1", date: "2026-08-03" } as WorkoutSession,
    { id: "s2", date: "2026-08-10" } as WorkoutSession,
    { id: "s3", date: "2026-08-17" } as WorkoutSession,
  ];
  const logs: ExerciseLog[] = [
    { id: "a", sessionId: "s2", machineId: "leg-press", weight: "110" } as ExerciseLog,
    { id: "b", sessionId: "s1", machineId: "leg-press", weight: "100" } as ExerciseLog,
    { id: "c", sessionId: "s1", machineId: "leg-press", weight: "100" } as ExerciseLog, // second set, same session
    { id: "d", sessionId: "s3", machineId: "leg-press", loadLb: "120" } as ExerciseLog,
    { id: "e", sessionId: "s3", machineId: "pulldown", weight: "70" } as ExerciseLog,
  ];

  it("counts sessions rather than sets, finds the first and last by session date, and is partial", () => {
    const u = usageFromLogs("leg-press", logs, sessions, null);
    expect(u).toEqual({ firstPerformed: "2026-08-03", lastPerformed: "2026-08-17", timesPerformed: 3, firstWeight: 100, lastWeight: 120, progressionPct: 20, partial: true });
  });

  it("prefers the prescribed current weight for progression", () => {
    expect(usageFromLogs("leg-press", logs, sessions, 130).progressionPct).toBe(30);
  });

  it("is empty-but-partial for a machine with no logs", () => {
    expect(usageFromLogs("chest-press", logs, sessions, null)).toEqual({ ...NO_USAGE, partial: true });
  });
});
