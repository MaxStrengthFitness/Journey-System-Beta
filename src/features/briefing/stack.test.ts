import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "../../types";
import {
  USUAL_MIN_SETS,
  lastTimeLines,
  machinesTouchingLimits,
  routineCodes,
  safetyRegions,
  tagOfSlug,
  viewsToDraw,
} from "./stack";

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 15));

function log(p: Partial<ExerciseLog> & { sessionId: string; machineId: string; day: number }): ExerciseLog {
  const { day, ...rest } = p;
  return { outcome: "performed", createdAt: at(day), ...rest } as ExerciseLog;
}

const machines = [
  { id: "lp", name: "Leg Press", shortName: "LP" },
  { id: "cp", name: "Chest Press", shortName: "CP" },
  { id: "lx", name: "Lumbar Extension", comparisonKey: "m-lumbar" },
];

describe("safetyRegions", () => {
  it("places flags with the codex's table and carried tags by their region", () => {
    expect(safetyRegions(["gen-shoulder", "spine-ddd"], ["Knees"])).toEqual(["shoulder", "lower_back", "knee"]);
  });
  it("drops repeats and whole-body flags", () => {
    expect(safetyRegions(["gen-shoulder", "soft-rotator", "cv-hypertension"], ["Shoulders"])).toEqual(["shoulder"]);
  });
  it("ignores a tag the figure does not know", () => {
    expect(safetyRegions([], ["Elsewhere"])).toEqual([]);
  });
});

describe("viewsToDraw", () => {
  it("draws only the sides with something lit, front first", () => {
    expect(viewsToDraw(["lower_back"])).toEqual(["back"]);
    expect(viewsToDraw(["lower_back", "shoulder"])).toEqual(["front", "back"]);
  });
  it("draws the front when nothing is placed", () => {
    expect(viewsToDraw([])).toEqual(["front"]);
  });
});

describe("tagOfSlug", () => {
  it("turns a tap on the model into the tracker's region", () => {
    expect(tagOfSlug("deltoids")).toBe("Shoulders");
    expect(tagOfSlug("lower-back")).toBe("Lower Back");
    expect(tagOfSlug("head")).toBeNull();
  });
});

describe("lastTimeLines", () => {
  const last = { id: "s9" };
  const earlierLp = [8, 9, 8, 7, 8].map((reps, i) =>
    log({ sessionId: `s${i + 1}`, machineId: "lp", reps: String(reps), day: i + 1 }),
  );

  it("says a machine came in short of her usual, the median of her last five", () => {
    const logs = [...earlierLp, log({ sessionId: "s9", machineId: "lp", reps: "5", day: 20 })];
    expect(lastTimeLines({ lastSession: last, logs, machines }).map((l) => l.text)).toEqual([
      "Leg Press: 5 reps last time, usually 8.",
    ]);
  });

  it("says nothing about usual below the minimum sample", () => {
    const few = earlierLp.slice(0, USUAL_MIN_SETS - 1);
    const logs = [...few, log({ sessionId: "s9", machineId: "lp", reps: "2", day: 20 })];
    expect(lastTimeLines({ lastSession: last, logs, machines })).toEqual([]);
  });

  it("says nothing when she was within one rep of her usual", () => {
    const logs = [...earlierLp, log({ sessionId: "s9", machineId: "lp", reps: "7", day: 20 })];
    expect(lastTimeLines({ lastSession: last, logs, machines })).toEqual([]);
  });

  it("names a skip and its reason, and a blood-flow set", () => {
    const logs = [
      log({ sessionId: "s9", machineId: "cp", day: 20, outcome: "skipped", skipReason: "pain_injury" }),
      log({ sessionId: "s9", machineId: "lp", day: 20, outcome: "practice", bloodFlow: true, reps: "12" }),
    ];
    expect(lastTimeLines({ lastSession: last, logs, machines }).map((l) => l.text)).toEqual([
      "Skipped Chest Press last time: pain or injury.",
      "Leg Press was a light set last time (blood flow), not counted.",
    ]);
  });

  it("leaves out a skip's reason when there is none worth saying", () => {
    const logs = [log({ sessionId: "s9", machineId: "cp", day: 20, outcome: "skipped", skipReason: "other" })];
    expect(lastTimeLines({ lastSession: last, logs, machines })[0].text).toBe("Skipped Chest Press last time.");
  });

  it("never guesses the client's gender: no pronoun at all", () => {
    const logs = [...earlierLp, log({ sessionId: "s9", machineId: "lp", reps: "5", day: 20 })];
    expect(lastTimeLines({ lastSession: last, logs, machines })[0].text).not.toMatch(/\b(she|her|he|his|him)\b/i);
  });

  it("is empty with no last session", () => {
    expect(lastTimeLines({ lastSession: null, logs: earlierLp, machines })).toEqual([]);
  });
});

describe("the routine line", () => {
  it("reads each machine's short name, else its name, in order", () => {
    expect(routineCodes(["cp", "lx", "missing", "lp"], machines)).toEqual(["CP", "Lumbar Extension", "LP"]);
  });
  it("names the machines one of her flags touches", () => {
    expect(machinesTouchingLimits(["lp", "lx"], machines, ["gen-low-back"])).toContain("Lumbar Extension");
    expect(machinesTouchingLimits(["lp", "lx"], machines, [])).toEqual([]);
  });
});
