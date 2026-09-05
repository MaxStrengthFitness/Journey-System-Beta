import { describe, expect, it } from "vitest";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, Routine, RoutineAdjustment, Trainer, WorkoutSession } from "../../types";
import {
  buildRoutineChanges,
  buildRoutineRows,
  changesThisMonth,
  latestChangeFor,
  relativeTime,
  resolveRoutine,
  templateDrift,
} from "./routine-rows";

const machines: Machine[] = [
  { id: "leg-press", name: "Leg Press", anatomicalRegion: "Thigh / Quad" },
  { id: "hip-add", name: "Hip Adduction", fullName: "Hip Adduction (TSC)", anatomicalRegion: "Hip" },
  { id: "row", name: "Compound Row" },
];

const sessions: WorkoutSession[] = [
  { id: "s-old", date: "2026-08-01", sessionNumber: 1 } as WorkoutSession,
  { id: "s-new", date: "2026-09-01", sessionNumber: 2 } as WorkoutSession,
];

const logs: ExerciseLog[] = [
  { id: "1", sessionId: "s-old", machineId: "leg-press", weight: "100", reps: "12" } as ExerciseLog,
  { id: "2", sessionId: "s-new", machineId: "leg-press", weight: "110", reps: "9" } as ExerciseLog,
  { id: "3", sessionId: "s-new", machineId: "hip-add", weight: "60", seconds: "75", isTSC: true } as ExerciseLog,
];

const settings: Record<string, ClientMachineSetting> = {
  "leg-press": { clientId: "c", machineId: "leg-press", settings: { "Seat Height": "4", Gap: "0" }, updatedBy: "t", updatedAt: null, startingWeight: 80, currentWeight: 110 },
  row: { clientId: "c", machineId: "row", settings: {}, updatedBy: "t", updatedAt: null, startingWeight: 50 },
};

describe("buildRoutineRows", () => {
  it("takes the newest session's log for weight and outcome, and keeps routine order", () => {
    const rows = buildRoutineRows({ machineIds: ["hip-add", "leg-press"] }, machines, null, settings, logs, sessions);
    expect(rows.map((r) => r.name)).toEqual(["Hip Adduction (TSC)", "Leg Press"]);
    expect(rows[1]).toMatchObject({ order: 2, weight: 110, outcome: 9, isHold: false, startingWeight: 80, region: "Thigh / Quad" });
  });

  it("reads seconds for a timed static contraction", () => {
    const [row] = buildRoutineRows({ machineIds: ["hip-add"] }, machines, null, settings, logs, sessions);
    expect(row).toMatchObject({ weight: 60, outcome: 75, isHold: true });
  });

  it("prefers the client's current metric over any log", () => {
    const client = { currentMachineMetrics: { "leg-press": { weight: 115, reps: 8 } } } as unknown as Client;
    const [row] = buildRoutineRows({ machineIds: ["leg-press"] }, machines, client, settings, logs, sessions);
    expect(row.weight).toBe(115);
    expect(row.outcome).toBe(8);
  });

  it("falls back to the setting's starting weight when nothing has been logged", () => {
    const [row] = buildRoutineRows({ machineIds: ["row"] }, machines, null, settings, logs, sessions);
    expect(row.weight).toBe(50);
    expect(row.outcome).toBeNull();
    expect(row.settings).toEqual([]);
  });

  it("builds setup chips from the first letter of each setting, in the shared order", () => {
    const [row] = buildRoutineRows({ machineIds: ["leg-press"] }, machines, null, settings, logs, sessions);
    expect(row.settings).toEqual([
      ["G", "0"],
      ["S", "4"],
    ]);
  });

  it("flags a machine that is not on the roster and carries routine notes", () => {
    const [ghost, real] = buildRoutineRows({ machineIds: ["gone", "row"], machineNotes: { row: " Slow eccentric " } }, machines, null, settings, logs, sessions);
    expect(ghost.missing).toBe(true);
    expect(ghost.name).toBe("Unknown machine");
    expect(real.note).toBe("Slow eccentric");
  });
});

describe("resolveRoutine / templateDrift", () => {
  it("returns a temp stand-in when a routine does not exist yet", () => {
    const r = resolveRoutine([], "Routine B", "c1", "solon");
    expect(r).toMatchObject({ id: "temp-b", name: "Routine B", clientId: "c1", machineIds: [] });
  });

  it("counts machines added to and removed from the applied template", () => {
    const r: Routine = { id: "r", clientId: "c", name: "Routine A", machineIds: ["a", "b", "d"], templateId: "t", templateMachineIds: ["a", "b", "c"] };
    expect(templateDrift(r)).toEqual({ added: 1, removed: 1 });
    expect(templateDrift({ ...r, templateId: undefined })).toBeNull();
  });
});

describe("buildRoutineChanges", () => {
  const routines: Routine[] = [
    { id: "ra", clientId: "c", name: "Routine A", machineIds: [] },
    { id: "rb", clientId: "c", name: "Routine B", machineIds: [] },
  ];
  const trainers: Trainer[] = [{ id: "t-aj", fullName: "Austin Jurgens", initials: "AJ" } as Trainer];
  const now = Date.now();
  const adjustments: RoutineAdjustment[] = [
    { id: "x1", routineId: "ra", clientId: "c", previousMachineIds: ["leg-press"], newMachineIds: ["leg-press", "row"], trainerId: "t-aj", createdAt: { toMillis: () => now - 86_400_000 }, notes: "  added row " },
    { id: "x2", routineId: "rb", clientId: "c", previousMachineIds: [], newMachineIds: [], trainerId: "t-zz", changeType: "enabled", createdAt: { seconds: Math.floor((now - 40 * 86_400_000) / 1000) } },
  ];

  it("names added and removed machines and resolves the trainer", () => {
    const [c1, c2] = buildRoutineChanges(adjustments, routines, machines, trainers);
    expect(c1).toMatchObject({ routineLabel: "A", kind: "machines", added: ["Compound Row"], removed: [], trainerInitials: "AJ", trainerName: "Austin Jurgens", notes: "added row" });
    expect(c2).toMatchObject({ routineLabel: "B", kind: "enabled", added: [], removed: [], trainerInitials: "T-", notes: null });
  });

  it("finds the newest change per routine and counts this month's", () => {
    const changes = buildRoutineChanges(adjustments, routines, machines, trainers);
    expect(latestChangeFor(changes, "ra")?.id).toBe("x1");
    expect(latestChangeFor(changes, "nope")).toBeNull();
    // x1 is yesterday — same month unless today is the 1st, in which case it is last month.
    const expected = new Date(now - 86_400_000).getMonth() === new Date(now).getMonth() ? 1 : 0;
    expect(changesThisMonth(changes)).toBe(expected);
  });
});

describe("relativeTime", () => {
  const t0 = Date.UTC(2026, 8, 5, 12);
  it("reads like a person", () => {
    expect(relativeTime(null, t0)).toBe("never");
    expect(relativeTime(t0 - 3_600_000, t0)).toBe("today");
    expect(relativeTime(t0 - 86_400_000, t0)).toBe("yesterday");
    expect(relativeTime(t0 - 12 * 86_400_000, t0)).toBe("12 days ago");
    expect(relativeTime(t0 - 35 * 86_400_000, t0)).toBe("a month ago");
    expect(relativeTime(t0 - 95 * 86_400_000, t0)).toBe("3 months ago");
  });
});
