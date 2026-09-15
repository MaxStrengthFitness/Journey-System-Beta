import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ db: { __fake: true } }));

const getDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, dir: string) => ({ orderBy: field, dir }),
  limit: (n: number) => ({ limit: n }),
  getDocs: (...args: any[]) => getDocs(...args),
  Timestamp: {},
}));

import type { ExerciseLog, WorkoutSession } from "../types";
import {
  AVG_DURATION_MIN_SESSIONS,
  AVG_REST_MIN_GAPS,
  attendanceStatsFrom,
  loadTrainingHistory,
  machineStatsFrom,
  sessionsInWindow,
  type TrainingHistory,
} from "./progress-utils";

const at = (iso: string) => ({ toDate: () => new Date(iso) });
const ms = (n: number) => ({ toMillis: () => n });

const session = (id: string, date: string, over: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({ id, date, sessionNumber: Number(id.replace(/\D/g, "")) || 0, status: "Completed", ...over }) as WorkoutSession;

const log = (sessionId: string, machineId: string, over: Partial<ExerciseLog> = {}): ExerciseLog =>
  ({ sessionId, machineId, weight: "100", reps: "8", ...over }) as ExerciseLog;

const timed = (id: string, date: string, minutes: number) =>
  session(id, date, {
    startTime: at(`${date}T10:00:00`),
    endTime: at(new Date(new Date(`${date}T10:00:00`).getTime() + minutes * 60000).toISOString()),
  });

describe("sessionsInWindow", () => {
  const list = [session("s1", "2026-01-01"), session("s2", "2026-02-01"), { id: "x" } as WorkoutSession];
  it("blank start keeps every session", () => {
    expect(sessionsInWindow(list)).toHaveLength(3);
  });
  it("a start date drops earlier sessions and undated ones", () => {
    expect(sessionsInWindow(list, "2026-01-15").map((s) => s.id)).toEqual(["s2"]);
  });
});

describe("attendanceStatsFrom", () => {
  it("reports nothing for a client with no sessions", () => {
    const s = attendanceStatsFrom({ sessions: [], logs: [] });
    expect(s.totalSessions).toBe(0);
    expect(s.avgDuration).toBe(0);
    expect(s.punctuality).toBe("No data");
  });

  it("gives no session length below the named minimum — legacy imports carry no times", () => {
    const sessions = [
      timed("s1", "2026-03-02", 30),
      timed("s2", "2026-03-05", 40),
      session("s3", "2026-03-09"), // imported: no start / end
    ];
    expect(AVG_DURATION_MIN_SESSIONS).toBe(3);
    expect(attendanceStatsFrom({ sessions, logs: [] }).avgDuration).toBe(0);
    const enough = [...sessions, timed("s4", "2026-03-12", 50)];
    expect(attendanceStatsFrom({ sessions: enough, logs: [] }).avgDuration).toBe(40);
  });

  it("ignores sessions of 5 minutes or less and 2 hours or more", () => {
    const sessions = [
      timed("s1", "2026-03-02", 30),
      timed("s2", "2026-03-05", 30),
      timed("s3", "2026-03-09", 30),
      timed("s4", "2026-03-12", 4),
      timed("s5", "2026-03-16", 180),
    ];
    expect(attendanceStatsFrom({ sessions, logs: [] }).avgDuration).toBe(30);
  });

  it("gives no average rest below the named minimum of gaps", () => {
    expect(AVG_REST_MIN_GAPS).toBe(2);
    const two = [session("s1", "2026-03-02"), session("s2", "2026-03-05")];
    expect(attendanceStatsFrom({ sessions: two, logs: [] }).avgRestDays).toBe(0);
    const three = [...two, session("s3", "2026-03-10")];
    expect(attendanceStatsFrom({ sessions: three, logs: [] }).avgRestDays).toBe(4);
  });

  it("counts only performed sets in the window toward volume, reps and top quality", () => {
    const history: TrainingHistory = {
      sessions: [session("s1", "2026-01-01"), session("s2", "2026-03-01")],
      logs: [
        log("s1", "m", { repQuality: 3 }), // before the window
        log("s2", "m", { reps: "10", repQuality: 3 }),
        log("s2", "m", { reps: "10", outcome: "practice", repQuality: 3 }),
        log("s2", "m", { reps: undefined }), // seeded weight only — not performed
        log("s2", "h", { reps: undefined, seconds: "60", isTSC: true, weight: "50" }),
      ],
    };
    const s = attendanceStatsFrom(history, "2026-02-01");
    expect(s.totalSessions).toBe(1);
    expect(s.firstSessionDate).toBe("2026-01-01");
    expect(s.totalGoodReps).toBe(1);
    expect(s.totalVolume).toBe(100 * 10 + 50 * 4);
    expect(s.totalReps).toBe(14);
  });
});

describe("machineStatsFrom", () => {
  const history: TrainingHistory = {
    sessions: [
      session("s1", "2026-01-05"),
      session("s2", "2026-01-12"),
      session("s3", "2026-01-19"),
      session("s4", "2026-01-26"),
    ],
    logs: [
      log("s3", "leg", { weight: "120", createdAt: ms(3) }),
      log("s1", "leg", { weight: "100", repQuality: 3, createdAt: ms(1) }),
      log("s2", "leg", { weight: "110", createdAt: ms(2) }),
      log("s4", "leg", { weight: "200", outcome: "practice" }), // never current
      log("s4", "leg", { weight: "130", reps: undefined }), // seeded, not performed
      log("s1", "row", { weight: "50" }),
      log("s1", "empty", { weight: "0" }),
      log("elsewhere", "leg", { weight: "999" }),
    ],
  };

  it("computes start → current per machine from one history, performed sets only", () => {
    const out = machineStatsFrom(history);
    expect(out.leg).toMatchObject({
      startWeight: 100,
      currentWeight: 120,
      percentageIncrease: 20,
      perfectSets: 1,
      sessionCount: 3,
    });
    expect(out.leg.totalVolume).toBe((100 + 110 + 120) * 8);
    expect(out.row).toMatchObject({ startWeight: 50, currentWeight: 50, percentageIncrease: 0, sessionCount: 1 });
    expect(out.empty).toBeUndefined();
  });

  it("orders by session number, then date, then write time", () => {
    const shuffled: TrainingHistory = {
      sessions: [session("s2", "2026-01-01", { sessionNumber: 2 }), session("s1", "2026-02-01", { sessionNumber: 1 })],
      logs: [log("s2", "m", { weight: "80" }), log("s1", "m", { weight: "60" })],
    };
    expect(machineStatsFrom(shuffled).m).toMatchObject({ startWeight: 60, currentWeight: 80 });
  });

  it("respects the window", () => {
    const out = machineStatsFrom(history, "2026-01-12");
    expect(out.leg).toMatchObject({ startWeight: 110, currentWeight: 120, sessionCount: 2 });
    expect(out.row).toBeUndefined();
    expect(machineStatsFrom(history, "2027-01-01")).toEqual({});
  });
});

describe("loadTrainingHistory", () => {
  beforeEach(() => getDocs.mockReset());

  const snap = (docs: Array<Record<string, unknown>>) => ({
    docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
  });

  it("reads the sessions, then the logs — two reads, whatever the machine count", async () => {
    getDocs
      .mockResolvedValueOnce(snap([{ id: "s1", date: "2026-01-01", status: "Completed" }]))
      .mockResolvedValueOnce(snap([{ id: "l1", sessionId: "s1", machineId: "m" }]));
    const h = await loadTrainingHistory("c1");
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(h.sessions[0].id).toBe("s1");
    expect(h.logs[0]).toMatchObject({ id: "l1", machineId: "m" });
    const [sessionsQuery, logsQuery] = getDocs.mock.calls.map((c) => c[0]);
    expect(sessionsQuery.path).toBe("sessions");
    expect(sessionsQuery.constraints).toContainEqual({ field: "clientId", op: "==", value: "c1" });
    expect(logsQuery.path).toBe("exerciseLogs");
  });

  it("skips the logs read when there are no completed sessions", async () => {
    getDocs.mockResolvedValueOnce(snap([]));
    expect(await loadTrainingHistory("c1")).toEqual({ sessions: [], logs: [] });
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("lets a failed read fail — unknown is not empty", async () => {
    getDocs.mockRejectedValueOnce(new Error("permission-denied"));
    await expect(loadTrainingHistory("c1")).rejects.toThrow("permission-denied");
  });
});
