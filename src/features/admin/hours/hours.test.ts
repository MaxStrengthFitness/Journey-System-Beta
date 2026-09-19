import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../../types";
import {
  DEFAULT_SESSION_MINUTES,
  averageMinutes,
  formatHours,
  hoursTally,
  monthLabel,
  queryWindowForMonth,
  sessionMinutesOf,
  shiftMonth,
  weekStartOf,
  weeksOfMonth,
} from "./hours";

const session = (extra: Partial<WorkoutSession>): WorkoutSession =>
  ({
    hostedAtStudioId: "solon",
    clientHomeStudioId: "solon",
    isCrossTrain: false,
    sessionType: "Standard",
    sessionNumber: 1,
    trainerInitials: "AJ",
    trainerId: "t-aj",
    status: "Completed",
    date: "2026-09-15",
    ...extra,
  }) as WorkoutSession;

describe("weeks run Monday to Sunday", () => {
  it("finds the Monday on or before a day", () => {
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14"); // a Monday
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14"); // the Sunday after it
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07"); // the Sunday before
  });

  it("lists a month's weeks clipped to the month, partial ones marked", () => {
    const weeks = weeksOfMonth("2026-09");
    expect(weeks.map((w) => w.label)).toEqual(["Sep 1–6", "Sep 7–13", "Sep 14–20", "Sep 21–27", "Sep 28–30"]);
    expect(weeks[0]).toMatchObject({ key: "2026-08-31", start: "2026-09-01", end: "2026-09-06", partial: true });
    expect(weeks[1].partial).toBe(false);
    expect(weeks[4]).toMatchObject({ key: "2026-09-28", end: "2026-09-30", partial: true });
  });

  it("labels a one-day week without a dash", () => {
    // Nov 30 2026 is a Monday, alone at the end of its month.
    const weeks = weeksOfMonth("2026-11");
    expect(weeks[weeks.length - 1].label).toBe("Nov 30");
  });
});

describe("months", () => {
  it("shifts across a year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthLabel("2026-09")).toBe("September 2026");
  });

  it("asks Firestore for a day early and two weeks late, in studio time", () => {
    const w = queryWindowForMonth("2026-09", "America/New_York");
    expect(new Date(w.startMs).toISOString()).toBe("2026-08-31T04:00:00.000Z");
    // Oct 14, end of the Eastern day.
    expect(new Date(w.endMs).toISOString()).toBe("2026-10-15T03:59:59.999Z");
  });
});

describe("the session length", () => {
  it("defaults to thirty and clamps what is stored", () => {
    expect(sessionMinutesOf(null)).toBe(DEFAULT_SESSION_MINUTES);
    expect(sessionMinutesOf({ sessionMinutes: 20 })).toBe(20);
    expect(sessionMinutesOf({ sessionMinutes: 0 })).toBe(5);
    expect(sessionMinutesOf({ sessionMinutes: 900 })).toBe(120);
    expect(sessionMinutesOf({ sessionMinutes: Number.NaN })).toBe(DEFAULT_SESSION_MINUTES);
  });
});

describe("hoursTally — slots, not stopwatch", () => {
  const names = { "t-aj": "AJ Jurgens", "initials:LB": "Lee B" };

  it("counts completed sessions by trainer, by week and for the month, at the slot length", () => {
    const tally = hoursTally(
      [
        session({ date: "2026-09-01" }),
        session({ date: "2026-09-02" }),
        session({ date: "2026-09-08" }),
        session({ date: "2026-09-08", trainerId: undefined, trainerInitials: "LB" }),
      ],
      { month: "2026-09", sessionMinutes: 30, names },
    );
    expect(tally.rows.map((r) => r.label)).toEqual(["AJ Jurgens", "Lee B"]);
    const aj = tally.rows[0];
    expect(aj.weeks["2026-08-31"]).toEqual({ sessions: 2, minutes: 60 });
    expect(aj.weeks["2026-09-07"]).toEqual({ sessions: 1, minutes: 30 });
    expect(aj.month).toEqual({ sessions: 3, minutes: 90 });
    expect(tally.totals.weeks["2026-09-07"]).toEqual({ sessions: 2, minutes: 60 });
    expect(tally.totals.month).toEqual({ sessions: 4, minutes: 120 });
  });

  it("leaves out other months, counts open sessions and nameless ones separately", () => {
    const tally = hoursTally(
      [
        session({ date: "2026-08-31" }),
        session({ date: "2026-10-01" }),
        session({ date: "2026-09-10", status: "In-Progress" }),
        session({ date: "2026-09-10", trainerId: undefined, trainerInitials: "" }),
        session({ date: "2026-09-10" }),
      ],
      { month: "2026-09", sessionMinutes: 30, names },
    );
    expect(tally.totals.month).toEqual({ sessions: 1, minutes: 30 });
    expect(tally.open).toBe(1);
    expect(tally.unattributed).toBe(1);
  });

  it("uses the studio's day of the start when the document has no date", () => {
    // 11 PM Eastern on Sep 30 is Oct 1 in UTC; it is still September here.
    const tally = hoursTally(
      [session({ date: undefined as unknown as string, startTime: new Date("2026-10-01T03:00:00Z"), createdAt: new Date("2026-10-01T03:00:00Z") })],
      { month: "2026-09", sessionMinutes: 30, names },
    );
    expect(tally.totals.month.sessions).toBe(1);
  });

  it("keeps the measured floor time apart from the slot", () => {
    const tally = hoursTally(
      [
        session({ startTime: new Date("2026-09-15T14:00:00Z"), endTime: new Date("2026-09-15T14:22:00Z") }),
        session({ startTime: new Date("2026-09-15T15:00:00Z"), endTime: new Date("2026-09-15T15:18:00Z") }),
        session({}), // no stopwatch
      ],
      { month: "2026-09", sessionMinutes: 30, names },
    );
    const aj = tally.rows[0];
    expect(aj.month).toEqual({ sessions: 3, minutes: 90 });
    expect(aj.measured).toEqual({ sessions: 2, minutes: 40 });
    expect(averageMinutes(aj.measured)).toBe(20);
    expect(averageMinutes({ sessions: 0, minutes: 0 })).toBeNull();
  });

  it("formats hours to one decimal without a trailing zero", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(90)).toBe("1.5 h");
    expect(formatHours(120)).toBe("2 h");
    expect(formatHours(125)).toBe("2.1 h");
  });
});
