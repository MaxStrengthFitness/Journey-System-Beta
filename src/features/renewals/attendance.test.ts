import { describe, it, expect } from "vitest";
import { attendanceFromSchedules, attendanceFromSessions, feelFromSessions } from "./attendance";
import { loggedSessions } from "../../lib/booking-state";
import { cutoverOf } from "../../lib/client-coverage";

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

  describe("with Journey's sessions: a booking is a visit when a session was logged that day", () => {
    // AJ, Sep 24 2026. Mindbody never marks a booking Completed, so the old
    // reading made every no-show a visit. Solon moved onto Journey on the 9th.
    const cutovers = [{ id: "solon", journeyCutoverDate: "2026-09-09" }, { id: "westlake", journeyCutoverDate: null }];
    const journey = (sessions: Array<Record<string, unknown>>) => ({
      logged: loggedSessions(sessions as never, TZ),
      cutoverOf: (id: string | null | undefined) => cutoverOf(cutovers, id),
    });
    const at = (iso: string, studioId = "solon") => ({
      clientId: "c1",
      studioId,
      startTime: new Date(iso),
      endTime: new Date(new Date(iso).getTime() + 30 * 60_000),
      status: "Scheduled" as const,
      trainerId: "t1",
    });

    it("from the cutover on, a booking nobody logged is neither a visit nor a miss", () => {
      const rows = attendanceFromSchedules(
        [at("2026-09-10T13:00:00Z"), at("2026-09-09T13:00:00Z")],
        now,
        TZ,
        journey([{ clientId: "c1", status: "Completed", startTime: "2026-09-10T13:04:00Z" }]),
      );
      // The 10th was logged; the 9th — cutover day — was not.
      expect(rows).toEqual([{ day: "2026-09-10", kind: "visit", trainerId: "t1" }]);
    });

    it("before the cutover, or with none set, an unlogged booking is still a visit — FileMaker holds that record", () => {
      const rows = attendanceFromSchedules(
        [at("2026-09-08T13:00:00Z"), at("2026-09-10T13:00:00Z", "westlake"), at("2026-09-10T13:00:00Z", "somewhere-unloaded")],
        now,
        TZ,
        journey([]),
      );
      expect(rows.map((r) => [r.day, r.kind])).toEqual([
        ["2026-09-08", "visit"],
        ["2026-09-10", "visit"],
        ["2026-09-10", "visit"],
      ]);
    });

    it("an open session is not a logged one, and unread sessions leave the old reading alone", () => {
      const open = attendanceFromSchedules([at("2026-09-10T13:00:00Z")], now, TZ, journey([{ clientId: "c1", status: "In-Progress", startTime: "2026-09-10T13:04:00Z" }]));
      expect(open).toEqual([]);
      const unread = attendanceFromSchedules([at("2026-09-10T13:00:00Z")], now, TZ, { logged: null, cutoverOf: () => "2026-09-09" });
      expect(unread.map((r) => r.kind)).toEqual(["visit"]);
    });

    it("cancellations, no-shows and bookings ahead read as they always did", () => {
      const rows = attendanceFromSchedules(
        [
          { ...at("2026-09-10T13:00:00Z"), status: "Cancelled" as const },
          { ...at("2026-09-10T15:00:00Z"), status: "No-Show" as const },
          at("2026-09-12T13:00:00Z"),
        ],
        now,
        TZ,
        journey([]),
      );
      expect(rows.map((r) => r.kind)).toEqual(["cancelled", "no-show", "booked"]);
    });
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
        // Reporting round: a session on the Dial, with nothing legacy on it.
        { startTime: "2026-09-07T13:00:00Z", dose: 0, preSessionCheckIn: { readiness: { energy: -2 } } } as any,
        { startTime: "2026-09-06T13:00:00Z" } as any,
      ],
      TZ,
    );
    // The legacy words are kept, and read onto the Dial beside them.
    expect(rows).toEqual([
      { day: "2026-09-10", clientFeel: "Wiped Out", energyLevel: null, mood: null, dose: -2, energy: null },
      { day: "2026-09-08", clientFeel: null, energyLevel: "low", mood: null, dose: null, energy: -1 },
      { day: "2026-09-07", clientFeel: null, energyLevel: null, mood: null, dose: 0, energy: -2 },
    ]);
  });
});
