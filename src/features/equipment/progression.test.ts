import { describe, expect, it } from "vitest";
import type { ExerciseLog, WorkoutSession } from "../../types";
import { loadProgression, progressionSentence, shortDay } from "./progression";

const session = (id: string, date: string): WorkoutSession => ({ id, date }) as WorkoutSession;
const log = (over: Partial<ExerciseLog>): ExerciseLog =>
  ({ sessionId: "s1", machineId: "leg-press", weight: "100", reps: "10", ...over }) as ExerciseLog;

const sessions = [session("s1", "2026-03-02"), session("s2", "2026-03-09"), session("s3", "2026-03-16")];

describe("loadProgression", () => {
  it("draws one point per session, oldest first, at the heaviest performed load", () => {
    const points = loadProgression(
      "leg-press",
      [
        log({ sessionId: "s3", weight: "120", reps: "8" }),
        log({ sessionId: "s1", weight: "100", reps: "10" }),
        // A unilateral machine logs twice a visit: one point, not two.
        log({ sessionId: "s2", weight: "104", reps: "9", side: "Left" }),
        log({ sessionId: "s2", weight: "110", reps: "7", side: "Right" }),
      ],
      sessions,
    );
    expect(points.map((p) => [p.day, p.weight, p.reps])).toEqual([
      ["2026-03-02", 100, 10],
      ["2026-03-09", 110, 7],
      ["2026-03-16", 120, 8],
    ]);
  });

  it("counts performed sets only — practice and skipped are history, not progression", () => {
    const points = loadProgression(
      "leg-press",
      [
        log({ sessionId: "s1", weight: "100" }),
        log({ sessionId: "s2", weight: "60", outcome: "practice" }),
        log({ sessionId: "s3", weight: "130", outcome: "skipped" }),
        // Legacy: a weight with no count is a skipped set, not a performed one.
        log({ sessionId: "s3", weight: "140", reps: undefined }),
      ],
      sessions,
    );
    expect(points.map((p) => p.weight)).toEqual([100]);
  });

  it("keeps a timed static contraction, with its seconds", () => {
    const points = loadProgression(
      "leg-press",
      [log({ sessionId: "s1", weight: "90", reps: undefined, seconds: "75", isTSC: true })],
      sessions,
    );
    expect(points).toHaveLength(1);
    expect(points[0].seconds).toBe(75);
    expect(points[0].reps).toBeNull();
  });

  it("skips sets with no load, other machines, and sessions it cannot date", () => {
    const points = loadProgression(
      "leg-press",
      [
        log({ sessionId: "s1", weight: "0" }),
        log({ sessionId: "s1", weight: "" }),
        log({ sessionId: "s2", machineId: "chest-press", weight: "80" }),
        log({ sessionId: "unknown", weight: "150" }),
      ],
      sessions,
    );
    expect(points).toEqual([]);
  });

  it("reads the session's day without slipping a day (US and date-time strings too)", () => {
    const points = loadProgression(
      "leg-press",
      [log({ sessionId: "a" }), log({ sessionId: "b", weight: "105" })],
      [session("a", "3/2/2026"), session("b", "2026-03-09T07:30:00")],
    );
    expect(points.map((p) => p.day)).toEqual(["2026-03-02", "2026-03-09"]);
    expect(shortDay("2026-03-02")).toBe("Mar 2");
  });

  it("returns nothing without a machine, logs or sessions", () => {
    expect(loadProgression(null, [log({})], sessions)).toEqual([]);
    expect(loadProgression("leg-press", [], sessions)).toEqual([]);
    expect(loadProgression("leg-press", [log({})], [])).toEqual([]);
  });
});

describe("progressionSentence", () => {
  it("says there is not enough data under two sessions", () => {
    expect(progressionSentence([])).toMatch(/^Not enough sessions yet/);
    expect(progressionSentence(loadProgression("leg-press", [log({})], sessions))).toMatch(/^Not enough sessions yet/);
  });

  it("names the movement and the sample it stands on", () => {
    const points = loadProgression(
      "leg-press",
      [log({ sessionId: "s1", weight: "100" }), log({ sessionId: "s3", weight: "120" })],
      sessions,
    );
    expect(progressionSentence(points)).toBe(
      "Up 20 lb, 100 → 120 lb across the 2 sessions loaded here (Mar 2 to Mar 16). Heaviest performed set in each.",
    );
  });

  it("says a plateau plainly", () => {
    const points = loadProgression(
      "leg-press",
      [log({ sessionId: "s1", weight: "100" }), log({ sessionId: "s2", weight: "100" })],
      sessions,
    );
    expect(progressionSentence(points)).toMatch(/^Held at 100 lb across the 2 sessions/);
  });
});
