import { describe, expect, it } from "vitest";
import type { ScheduleEntry, WorkoutSession } from "../../../types";
import { teamThisWeek } from "./team";

const TODAY = "2026-09-23"; // Wednesday
const NOW = new Date("2026-09-23T12:00:00-04:00");

const session = (date: string, trainerId: string, clientId: string, status = "Completed"): WorkoutSession => ({ date, trainerId, clientId, status, hostedAtStudioId: "s1" }) as unknown as WorkoutSession;

const booking = (id: string, hm: string, trainerId: string | undefined, trainerName: string, status: ScheduleEntry["status"] = "Scheduled"): ScheduleEntry =>
  ({ id, clientId: "c", clientName: "C", trainerId, trainerName, studioId: "s1", startTime: new Date(`${TODAY}T${hm}:00-04:00`), endTime: new Date(new Date(`${TODAY}T${hm}:00-04:00`).getTime() + 30 * 60_000), status, serviceName: "", source: "MindBody", createdAt: null }) as ScheduleEntry;

const NAMES = { t1: "Sara Kim", t2: "Tom Lee", "initials:JC": "Jo Cole" };

describe("teamThisWeek", () => {
  it("counts completed sessions and distinct clients since Monday, alphabetically, never ranked", () => {
    const sessions = [
      session("2026-09-21", "t2", "a"),
      session("2026-09-22", "t2", "b"),
      session("2026-09-22", "t2", "a"),
      session("2026-09-22", "t1", "c"),
      session("2026-09-20", "t1", "d"), // Sunday: last week
      session("2026-09-22", "t1", "e", "In-Progress"),
    ];
    const t = teamThisWeek(sessions, [], NOW, TODAY, 30, NAMES);
    expect(t.since).toBe("2026-09-21");
    expect(t.sessions).toBe(4);
    expect(t.rows.map((r) => [r.name, r.sessions, r.clients, r.minutes])).toEqual([
      ["Sara Kim", 1, 1, 30],
      ["Tom Lee", 3, 2, 90],
    ]);
  });

  it("adds today's unlogged sessions per trainer, joining the schedule by trainer id or name", () => {
    const today = [
      booking("x", "08:00", "t2", "Tom Lee"), // past, unmarked
      booking("y", "09:00", undefined, "Jo Cole"), // past, unmarked, no id on the booking
      booking("z", "14:00", "t2", "Tom Lee"), // still to come
      booking("w", "08:30", "t1", "Sara Kim", "Completed"),
    ];
    const t = teamThisWeek([session("2026-09-22", "t1", "c")], today, NOW, TODAY, 30, NAMES, { "Jo Cole": "initials:JC" });
    expect(t.unloggedToday).toBe(2);
    expect(t.rows.map((r) => [r.name, r.sessions, r.unloggedToday])).toEqual([
      ["Jo Cole", 0, 1],
      ["Sara Kim", 1, 0],
      ["Tom Lee", 0, 1],
    ]);
  });

  it("a trainer the roster cannot name is still listed, by their initials", () => {
    const t = teamThisWeek([{ date: "2026-09-22", trainerInitials: "ZZ", clientId: "a", status: "Completed" } as unknown as WorkoutSession], [], NOW, TODAY, 30, NAMES);
    expect(t.rows[0].name).toBe("ZZ");
  });
});
