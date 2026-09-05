import { describe, it, expect } from "vitest";
import {
  completedSessionRollup,
  deletedSessionRollup,
  importedSessionsRollup,
  plainFieldOps,
  resolveTopTrainer,
  rollupFromHistory,
  tallyFromSessions,
  toIsoDay,
  trainerKeyFor,
} from "./client-rollups";
import type { Trainer } from "../types";

const trainer = (id: string, fullName: string, initials: string): Trainer =>
  ({
    id,
    fullName,
    initials,
    role: "Trainer",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
  }) as Trainer;

const AJ = trainer("t-aj", "Austin Jurgens", "AJ");
const MP = trainer("t-mp", "Maria Perez", "MP");
const TRAINERS = [AJ, MP];

describe("trainerKeyFor", () => {
  it("prefers the trainer id", () => {
    expect(trainerKeyFor({ trainerId: "t-aj", trainerInitials: "MP" })).toBe("t-aj");
  });
  it("falls back to initials for legacy sessions", () => {
    expect(trainerKeyFor({ trainerId: "legacy-trainer", trainerInitials: "aj" })).toBe("initials:AJ");
  });
  it("returns null when nothing identifies the coach", () => {
    expect(trainerKeyFor({ trainerId: "legacy-trainer", trainerInitials: "Chart" })).toBeNull();
    expect(trainerKeyFor({})).toBeNull();
  });
});

describe("resolveTopTrainer", () => {
  it("picks the highest count and resolves the trainer document", () => {
    const top = resolveTopTrainer({ "t-aj": 30, "t-mp": 16 }, TRAINERS);
    expect(top?.trainer?.fullName).toBe("Austin Jurgens");
    expect(top?.sessions).toBe(30);
    expect(top?.total).toBe(46);
    expect(top?.share).toBeCloseTo(30 / 46);
  });
  it("breaks ties toward the previously stored winner so the header does not flip", () => {
    expect(resolveTopTrainer({ "t-aj": 10, "t-mp": 10 }, TRAINERS, "t-mp")?.key).toBe("t-mp");
    expect(resolveTopTrainer({ "t-aj": 10, "t-mp": 10 }, TRAINERS, "t-aj")?.key).toBe("t-aj");
  });
  it("maps initials-only keys to a trainer by initials", () => {
    const top = resolveTopTrainer({ "initials:MP": 3 }, TRAINERS);
    expect(top?.trainer?.id).toBe("t-mp");
    expect(top?.name).toBe("Maria Perez");
  });
  it("returns null for an empty or missing tally", () => {
    expect(resolveTopTrainer(undefined, TRAINERS)).toBeNull();
    expect(resolveTopTrainer({}, TRAINERS)).toBeNull();
    expect(resolveTopTrainer({ "t-aj": 0 }, TRAINERS)).toBeNull();
  });
});

describe("tallyFromSessions", () => {
  it("counts only completed sessions and skips unidentifiable coaches", () => {
    const tally = tallyFromSessions([
      { status: "Completed", trainerId: "t-aj" },
      { status: "Completed", trainerId: "t-aj" },
      { status: "In-Progress", trainerId: "t-aj" },
      { status: "Completed", trainerId: "legacy-trainer", trainerInitials: "MP" },
      { status: "Completed", trainerId: "legacy-trainer", trainerInitials: "Legacy" },
    ]);
    expect(tally).toEqual({ "t-aj": 2, "initials:MP": 1 });
  });
});

describe("completedSessionRollup", () => {
  it("increments the coach's tally, re-derives the winner and rolls the machines", () => {
    const client = { trainerTally: { "t-aj": 22, "t-mp": 22 }, topTrainerId: "t-aj", machineStats: {} };
    const u = completedSessionRollup(
      client,
      { date: "2026-09-05", trainerId: "t-mp" },
      [
        { machineId: "leg-press", weight: "116", reps: "12" },
        { machineId: "leg-press", weight: "116", reps: "10" }, // second set: one vote per machine
        { machineId: "lumbar", weight: "40", seconds: "60" },
        { machineId: "empty" }, // nothing logged → ignored
      ],
      TRAINERS,
      plainFieldOps,
    );
    expect(u["trainerTally.t-mp"]).toBe(1);
    expect(u.topTrainerId).toBe("t-mp");
    expect(u.topTrainerName).toBe("Maria Perez");
    expect(u.topTrainerSessions).toBe(23);
    expect(u["machineStats.leg-press.timesPerformed"]).toBe(1);
    expect(u["machineStats.leg-press.firstPerformedDate"]).toBe("2026-09-05");
    expect(u["machineStats.leg-press.firstWeight"]).toBe(116);
    expect(u["machineStats.leg-press.lastWeight"]).toBe(116);
    expect(u["machineStats.lumbar.timesPerformed"]).toBe(1);
    expect(u["machineStats.empty.timesPerformed"]).toBeUndefined();
  });

  it("never overwrites an earlier first-performed date or weight", () => {
    const client = {
      trainerTally: {},
      topTrainerId: null,
      machineStats: { "leg-press": { firstPerformedDate: "2026-01-10", firstWeight: 80, lastPerformedDate: "2026-08-01", lastWeight: 110 } },
    };
    const u = completedSessionRollup(
      client,
      { date: "2026-09-05", trainerId: "t-aj" },
      [{ machineId: "leg-press", weight: "116", reps: "8" }],
      TRAINERS,
      plainFieldOps,
    );
    expect(u["machineStats.leg-press.firstPerformedDate"]).toBeUndefined();
    expect(u["machineStats.leg-press.firstWeight"]).toBeUndefined();
    expect(u["machineStats.leg-press.lastPerformedDate"]).toBe("2026-09-05");
    expect(u["machineStats.leg-press.lastWeight"]).toBe(116);
  });

  it("fixes a wrong first date when a back-dated session is logged", () => {
    const client = {
      machineStats: { lumbar: { firstPerformedDate: "2026-06-01", firstWeight: 50, lastPerformedDate: "2026-08-01", lastWeight: 50 } },
    };
    const u = completedSessionRollup(
      client,
      { date: "2026-05-01", trainerId: "t-aj" },
      [{ machineId: "lumbar", weight: "40", reps: "8" }],
      TRAINERS,
      plainFieldOps,
    );
    expect(u["machineStats.lumbar.firstPerformedDate"]).toBe("2026-05-01");
    expect(u["machineStats.lumbar.firstWeight"]).toBe(40);
    // A back-dated session is not the most recent one, so `last*` is untouched.
    expect(u["machineStats.lumbar.lastPerformedDate"]).toBeUndefined();
  });

  it("writes nothing about trainers when the session has no identifiable coach", () => {
    const u = completedSessionRollup(null, { date: "2026-09-05", trainerId: "legacy-trainer", trainerInitials: "Chart" }, [], TRAINERS, plainFieldOps);
    expect(Object.keys(u)).toEqual([]);
  });
});

describe("deletedSessionRollup", () => {
  it("takes the vote and the machine counts back", () => {
    const u = deletedSessionRollup(
      { trainerId: "t-aj" },
      [{ machineId: "leg-press" }, { machineId: "leg-press" }, { machineId: "lumbar" }],
      plainFieldOps,
    );
    expect(u["trainerTally.t-aj"]).toBe(-1);
    expect(u["machineStats.leg-press.timesPerformed"]).toBe(-1);
    expect(u["machineStats.lumbar.timesPerformed"]).toBe(-1);
  });
});

describe("importedSessionsRollup (CSV import)", () => {
  it("sums tally increments per coach and folds first/last in date order", () => {
    const u = importedSessionsRollup(
      { trainerTally: { "t-aj": 5 }, topTrainerId: "t-aj", machineStats: {} },
      [
        { date: "3/2/2026", trainerId: "legacy-trainer", trainerInitials: "MP", logs: [{ machineId: "leg-press", weight: 100, reps: 10 }] },
        { date: "1/5/2026", trainerId: "legacy-trainer", trainerInitials: "MP", logs: [{ machineId: "leg-press", weight: 80, reps: 12 }] },
        { date: "2/1/2026", trainerId: "t-aj", trainerInitials: "AJ", logs: [{ machineId: "leg-press", weight: 90, reps: 11 }] },
      ],
      TRAINERS,
      plainFieldOps,
    );
    expect(u["trainerTally.initials:MP"]).toBe(2);
    expect(u["trainerTally.t-aj"]).toBe(1);
    // 5 + 1 = 6 for AJ beats 2 for MP.
    expect(u.topTrainerId).toBe("t-aj");
    expect(u.topTrainerSessions).toBe(6);
    expect(u["machineStats.leg-press.timesPerformed"]).toBe(3);
    expect(u["machineStats.leg-press.firstPerformedDate"]).toBe("2026-01-05");
    expect(u["machineStats.leg-press.firstWeight"]).toBe(80);
    expect(u["machineStats.leg-press.lastPerformedDate"]).toBe("2026-03-02");
    expect(u["machineStats.leg-press.lastWeight"]).toBe(100);
  });
});

describe("rollupFromHistory (one-time backfill)", () => {
  it("rebuilds the whole rollup from sessions + logs", () => {
    const r = rollupFromHistory(
      [
        { id: "s1", status: "Completed", date: "2026-06-01", trainerId: "t-aj" },
        { id: "s2", status: "Completed", date: "2026-06-03", trainerId: "t-mp" },
        { id: "s3", status: "Completed", date: "2026-06-05", trainerId: "t-aj" },
        { id: "s4", status: "In-Progress", date: "2026-06-07", trainerId: "t-mp" },
      ],
      [
        { sessionId: "s1", machineId: "leg-press", weight: "100", reps: "10" },
        { sessionId: "s2", machineId: "leg-press", weight: "104", reps: "10" },
        { sessionId: "s3", machineId: "leg-press", weight: "108", reps: "9" },
        { sessionId: "s3", machineId: "lumbar", weight: "40", reps: "8" },
        { sessionId: "s4", machineId: "lumbar", weight: "44", reps: "8" }, // in-progress: ignored
      ],
      TRAINERS,
    );
    expect(r.trainerTally).toEqual({ "t-aj": 2, "t-mp": 1 });
    expect(r.topTrainerId).toBe("t-aj");
    expect(r.topTrainerName).toBe("Austin Jurgens");
    expect(r.machineStats["leg-press"]).toEqual({
      timesPerformed: 3,
      firstPerformedDate: "2026-06-01",
      firstWeight: 100,
      lastPerformedDate: "2026-06-05",
      lastWeight: 108,
    });
    expect(r.machineStats.lumbar.timesPerformed).toBe(1);
  });
});

describe("toIsoDay", () => {
  it("normalises the date shapes the app has stored over time", () => {
    expect(toIsoDay("2026-09-02")).toBe("2026-09-02");
    expect(toIsoDay("2026-9-2")).toBe("2026-09-02");
    expect(toIsoDay("2026-09-02 10:30")).toBe("2026-09-02");
    expect(toIsoDay("9/2/2026")).toBe("2026-09-02");
    expect(toIsoDay("")).toBe("");
    expect(toIsoDay(undefined)).toBe("");
  });
});
