import { describe, expect, it } from "vitest";
import {
  createMachineClocks,
  focusMachine,
  machineTimeFields,
  resetMachine,
  secondsOn,
  setPaused,
} from "./machine-clock";

describe("time on machine", () => {
  it("runs only while the machine is the current one", () => {
    const s = createMachineClocks();
    focusMachine(s, "leg_press", 0);
    focusMachine(s, "row", 30_000); // 30s on leg press, then away
    focusMachine(s, "leg_press", 90_000); // 60s on row, back to leg press
    expect(secondsOn(s, "leg_press", 100_000)).toBe(40); // 30 + 10
    expect(secondsOn(s, "row", 100_000)).toBe(60);
  });

  it("charges nothing to a machine that was never current — no 'since the last one'", () => {
    const s = createMachineClocks();
    focusMachine(s, "leg_press", 0);
    expect(secondsOn(s, "lumbar", 600_000)).toBe(0);
  });

  it("a session pause freezes the current clock and resume continues it", () => {
    const s = createMachineClocks();
    focusMachine(s, "leg_press", 0);
    setPaused(s, true, 20_000);
    setPaused(s, false, 80_000); // a 60s pause
    expect(secondsOn(s, "leg_press", 90_000)).toBe(30);
  });

  it("focusing while paused starts nothing until the session resumes", () => {
    const s = createMachineClocks();
    setPaused(s, true, 0);
    focusMachine(s, "row", 0);
    expect(secondsOn(s, "row", 50_000)).toBe(0);
    setPaused(s, false, 50_000);
    expect(secondsOn(s, "row", 60_000)).toBe(10);
  });

  it("the time follows the machine, whatever its slot in the routine", () => {
    // Reordering is a no-op to the clocks: they are keyed by machine id.
    const s = createMachineClocks();
    focusMachine(s, "b", 0);
    focusMachine(s, "a", 45_000);
    expect(secondsOn(s, "b", 45_000)).toBe(45);
    expect(secondsOn(s, "a", 60_000)).toBe(15);
  });

  it("reset zeroes a written machine but keeps it running if it is still current", () => {
    const s = createMachineClocks();
    focusMachine(s, "a", 0);
    resetMachine(s, "a", 30_000);
    expect(secondsOn(s, "a", 40_000)).toBe(10);
  });
});

describe("machineTimeFields", () => {
  it("prefers the trainer's stopwatch seconds for time under load", () => {
    const f = machineTimeFields({ onMachineSeconds: 240, manualSeconds: 75, reps: 0, isStatic: true, now: 5 });
    expect(f.timeSpent).toBe("240");
    expect(f.totalTimeUnderLoad).toBe(75);
    expect(f.machineDurationSeconds).toBe(75);
    expect(f.machineEndedAt).toBe(5);
    expect(f.averageTimePerRep).toBeUndefined();
  });

  it("never passes time on machine off as time under load", () => {
    // 80 seconds on the machine includes getting in, the briefing and
    // getting out. Without a stopwatch there is NO time under load to
    // record — publishing the 80 would make every TUT reader call two
    // minutes of set-up a set (docs/business/the-floor.md).
    const f = machineTimeFields({ onMachineSeconds: 80, manualSeconds: 0, reps: 8, isStatic: false });
    expect(f.timeSpent).toBe("80");
    expect(f.totalTimeUnderLoad).toBeUndefined();
    expect(f.machineDurationSeconds).toBeUndefined();
    expect(f.averageTimePerRep).toBeUndefined();
  });

  it("derives seconds per rep only from the stopwatch", () => {
    const f = machineTimeFields({ onMachineSeconds: 240, manualSeconds: 80, reps: 8, isStatic: false });
    expect(f.totalTimeUnderLoad).toBe(80);
    expect(f.averageTimePerRep).toBe(10);
  });

  it("writes no per-rep figure for a hold, or with nothing to divide", () => {
    expect(machineTimeFields({ onMachineSeconds: 0, manualSeconds: 0, reps: 8, isStatic: false }).averageTimePerRep).toBeUndefined();
    expect(machineTimeFields({ onMachineSeconds: 90, manualSeconds: 60, reps: 0, isStatic: true }).averageTimePerRep).toBeUndefined();
  });
});
