import { describe, it, expect } from "vitest";
import { attendanceFromSchedules, attendanceFromSessions, feelFromSessions } from "./attendance";

const TZ = "America/New_York";

describe("attendance", () => {
  const now = new Date("2026-09-11T14:00:00Z"); // 10 AM Eastern

  it("reads a past, uncancelled booking as a visit and a later one as booked", () => {
    const rows = attendanceFromSchedules(
      [
        { startTime: new Date("2026-09-10T22:30:00Z"), status: "Scheduled", trainerId: "t1" },
        { startTime: new Date("2026-09-11T21:00:00Z"), status: "Scheduled", trainerId: "t1" },
        { startTime: new Date("2026-09-09T12:00:00Z"), status: "Cancelled", trainerId: "t1" },
        { startTime: new Date("2026-09-08T12:00:00Z"), status: "No-Show", trainerId: "t2" },
      ],
      now,
      TZ,
    );
    expect(rows).toEqual([
      // 6:30 PM Eastern on the 10th: the studio's day, not UTC's 11th.
      { day: "2026-09-10", kind: "visit", trainerId: "t1" },
      { day: "2026-09-11", kind: "booked", trainerId: "t1" },
      { day: "2026-09-09", kind: "cancelled", trainerId: "t1" },
      { day: "2026-09-08", kind: "no-show", trainerId: "t2" },
    ]);
  });

  it("reads Journey workouts as visits, never a future-dated one", () => {
    const rows = attendanceFromSessions(
      [
        { startTime: "2026-09-10T13:00:00Z", trainerId: "t1" } as any,
        { date: "2026-12-01", trainerId: "t1", trainerInitials: "Legacy" } as any,
      ],
      TZ,
      "2026-09-11",
    );
    expect(rows).toEqual([{ day: "2026-09-10", kind: "visit", trainerId: "t1" }]);
  });

  it("keeps how sessions felt", () => {
    const rows = feelFromSessions(
      [
        { startTime: "2026-09-10T13:00:00Z", clientFeel: "Wiped Out" } as any,
        { startTime: "2026-09-08T13:00:00Z", preSessionCheckIn: { energyLevel: "low" } } as any,
        { startTime: "2026-09-06T13:00:00Z" } as any,
      ],
      TZ,
    );
    expect(rows).toEqual([
      { day: "2026-09-10", clientFeel: "Wiped Out", energyLevel: null, mood: null },
      { day: "2026-09-08", clientFeel: null, energyLevel: "low", mood: null },
    ]);
  });
});
