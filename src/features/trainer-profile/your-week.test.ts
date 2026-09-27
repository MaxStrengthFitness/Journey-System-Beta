import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "../../types";
import {
  MAX_SPAN_SESSION_MINUTES,
  SPAN_BREAK_MINUTES,
  cutoverLine,
  dayLabel,
  durationLabel,
  emptyWeekSentence,
  leftOutSentence,
  partLabel,
  rangeLabel,
  sessionTimeSentence,
  spanDaySentence,
  spanParts,
  spanTotalSentence,
  summarizeWeek,
  whatItCounts,
  yourWeek,
  yourWeekQueryStart,
  yourWeekTitle,
  yourWeekWindows,
} from "./your-week";
import { hoursTally } from "../admin/hours/hours";

const TZ = "America/New_York";
/** A wall-clock time on a studio day, as an instant (EDT until Nov 1 2026). */
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

let seq = 0;
function session(day: string, from: string, to: string, over: Partial<WorkoutSession> = {}): WorkoutSession {
  seq += 1;
  return {
    id: `s${seq}`,
    clientId: `c${seq}`,
    trainerId: "t1",
    trainerInitials: "SK",
    hostedAtStudioId: "westlake",
    clientHomeStudioId: "westlake",
    isCrossTrain: false,
    sessionType: "Standard",
    sessionNumber: 1,
    status: "Completed",
    date: day,
    startTime: at(day, from),
    endTime: at(day, to),
    createdAt: at(day, from),
    ...over,
  } as WorkoutSession;
}

describe("the two weeks", () => {
  it("runs this week Monday to today and last week Monday to Sunday", () => {
    // Wed Sep 30 2026.
    expect(yourWeekWindows("2026-09-30")).toEqual({
      thisWeek: { from: "2026-09-28", to: "2026-09-30" },
      lastWeek: { from: "2026-09-21", to: "2026-09-27" },
    });
    // A Monday: this week is just today.
    expect(yourWeekWindows("2026-09-28").thisWeek).toEqual({ from: "2026-09-28", to: "2026-09-28" });
    // A Sunday belongs to the week that began the Monday before.
    expect(yourWeekWindows("2026-10-04").thisWeek.from).toBe("2026-09-28");
  });

  it("asks for the studio's sessions from the day before last Monday, in the studio's day", () => {
    // Last Monday is Sep 21; the day before is Sun Sep 20, midnight Eastern.
    expect(new Date(yourWeekQueryStart("2026-09-30", TZ)).toISOString()).toBe("2026-09-20T04:00:00.000Z");
  });

  it("names the weeks as Hours does", () => {
    expect(rangeLabel({ from: "2026-09-21", to: "2026-09-27" })).toBe("Sep 21–27");
    expect(rangeLabel({ from: "2026-09-28", to: "2026-10-04" })).toBe("Sep 28–Oct 4");
    expect(rangeLabel({ from: "2026-09-28", to: "2026-09-28" })).toBe("Sep 28");
    expect(dayLabel("2026-09-28")).toBe("Mon, Sep 28");
  });
});

describe("which sessions count", () => {
  const window = { from: "2026-09-28", to: "2026-10-04" };

  it("counts your completed sessions by Hours' rule, and the clients among them", () => {
    const sessions = [
      session("2026-09-28", "07:00", "07:25", { clientId: "judy" }),
      session("2026-09-28", "07:30", "07:55", { clientId: "judy" }),
      session("2026-09-29", "08:00", "08:25", { clientId: "sam" }),
      session("2026-09-29", "09:00", "09:25", { trainerId: "t2" }), // someone else's
      session("2026-09-29", "10:00", "10:25", { status: "In-Progress", endTime: undefined }), // still open
      session("2026-09-21", "10:00", "10:25"), // last week
    ];
    const week = summarizeWeek(sessions, { window, trainerId: "t1", sessionMinutes: 30 });
    expect(week.sessions).toBe(3);
    expect(week.clients).toBe(2);
    expect(week.slotMinutes).toBe(90);
    expect(sessionTimeSentence(week)).toBe("1.5 h (3 sessions × 30 min)");
  });

  it("gives the same count Operations → Insights → Hours gives for you", () => {
    const sessions = [
      session("2026-09-01", "07:00", "07:25"),
      session("2026-09-02", "07:00", "07:25"),
      session("2026-09-02", "08:00", "08:25", { startTime: "2026-09-02T12:00:00.000Z" }), // logged by hand
      session("2026-09-03", "07:00", "07:25", { trainerId: "t2" }),
      session("2026-09-04", "07:00", "07:25", { status: "In-Progress" }),
    ];
    const hours = hoursTally(sessions, { month: "2026-09", sessionMinutes: 30 });
    const mine = hours.rows.find((r) => r.trainerKey === "t1")!;
    const week = summarizeWeek(sessions, { window: { from: "2026-08-31", to: "2026-09-06" }, trainerId: "t1", sessionMinutes: 30 });
    expect(week.sessions).toBe(mine.month.sessions);
    expect(week.slotMinutes).toBe(mine.month.minutes);
  });

  it("leaves out of first session to last what has no real clock times", () => {
    const sessions = [
      session("2026-09-28", "07:00", "07:25"),
      // Logged by hand: the start is the noon placeholder.
      session("2026-09-28", "08:00", "08:25", { startTime: "2026-09-28T12:00:00.000Z" }),
      // Imported.
      session("2026-09-28", "08:00", "08:25", { legacy_filemaker_id: "fm-1" }),
      // Left running overnight.
      session("2026-09-28", "09:00", "09:00", { endTime: new Date(at("2026-09-28", "09:00").getTime() + (MAX_SPAN_SESSION_MINUTES + 1) * 60_000) }),
      // No end at all.
      session("2026-09-28", "10:00", "10:00", { endTime: null }),
    ];
    const week = summarizeWeek(sessions, { window, trainerId: "t1", sessionMinutes: 30 });
    expect(week.sessions).toBe(5);
    expect(week.leftOut).toBe(4);
    expect(week.days).toHaveLength(1);
    expect(week.days[0].sessions).toBe(1);
    expect(leftOutSentence(week.leftOut)).toBe(
      "Leaves out 4 sessions without real clock times: logged by hand, imported, or left running.",
    );
    expect(leftOutSentence(0)).toBeNull();
  });
});

describe("first session to last", () => {
  const window = { from: "2026-09-28", to: "2026-10-04" };

  it("splits the day wherever sessions are more than 90 minutes apart, and adds the parts", () => {
    const sessions = [
      session("2026-09-28", "06:58", "07:23"),
      session("2026-09-28", "07:30", "07:55"),
      session("2026-09-28", "09:09", "09:34"),
      session("2026-09-28", "16:02", "16:27"),
      session("2026-09-28", "18:45", "19:10"),
    ];
    const week = summarizeWeek(sessions, { window, trainerId: "t1", sessionMinutes: 30 });
    const day = week.days[0];
    // 06:58–09:34 (a 74-minute gap stays inside), then 16:02–16:27, then 18:45–19:10.
    expect(day.parts.map((p) => partLabel(p, TZ))).toEqual(["6:58 to 9:34 AM", "4:02 to 4:27 PM", "6:45 to 7:10 PM"]);
    expect(spanDaySentence(day, TZ)).toBe("Mon, Sep 28: 6:58 to 9:34 AM, 4:02 to 4:27 PM, and 6:45 to 7:10 PM (5 sessions).");
    expect(day.minutes).toBe(156 + 25 + 25);
  });

  it("keeps a break of exactly 90 minutes inside one part, and splits one of 91", () => {
    const base = at("2026-09-28", "07:00").getTime();
    const t = (m: number) => base + m * 60_000;
    expect(spanParts([{ startMs: t(0), endMs: t(25) }, { startMs: t(25 + SPAN_BREAK_MINUTES), endMs: t(140) }])).toHaveLength(1);
    expect(spanParts([{ startMs: t(0), endMs: t(25) }, { startMs: t(25 + SPAN_BREAK_MINUTES + 1), endMs: t(141) }])).toHaveLength(2);
  });

  it("measures a break from the end of the longest session so far, not the last one to start", () => {
    const base = at("2026-09-28", "07:00").getTime();
    const t = (m: number) => base + m * 60_000;
    // A 60-minute session with a short one inside it, then one 80 minutes after the long one ends.
    const parts = spanParts([
      { startMs: t(0), endMs: t(60) },
      { startMs: t(10), endMs: t(20) },
      { startMs: t(140), endMs: t(165) },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].sessions).toBe(3);
  });

  it("counts just the session on a day with one, and writes a part across noon with both halves", () => {
    const week = summarizeWeek([session("2026-09-29", "11:40", "12:05")], { window, trainerId: "t1", sessionMinutes: 30 });
    expect(week.days[0].minutes).toBe(25);
    expect(spanDaySentence(week.days[0], TZ)).toBe("Tue, Sep 29: 11:40 AM to 12:05 PM (1 session).");
  });

  it("sums the days: 24 h 10 min over 4 days", () => {
    // Four days of back-to-back 30-minute sessions from 6:00 to noon (6 h a
    // day), and one more on the last day from 12:00 to 12:10.
    const sessions: WorkoutSession[] = [];
    for (const day of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]) {
      for (let m = 0; m < 360; m += 30) {
        const from = new Date(at(day, "06:00").getTime() + m * 60_000);
        sessions.push(session(day, "06:00", "06:30", { startTime: from, endTime: new Date(from.getTime() + 30 * 60_000) }));
      }
    }
    sessions.push(session("2026-10-01", "12:00", "12:10"));
    const week = summarizeWeek(sessions, { window, trainerId: "t1", sessionMinutes: 30 });
    expect(week.spanMinutes).toBe(24 * 60 + 10);
    expect(spanTotalSentence(week)).toBe("24 h 10 min over 4 days");
  });

  it("reads the clock in the studio's zone across the fall-back on Nov 1 2026", () => {
    // Sun Nov 1 2026, 1:30 AM EST (after the clocks go back) to 2:00 AM.
    const start = new Date("2026-11-01T06:30:00Z");
    const end = new Date("2026-11-01T07:00:00Z");
    expect(partLabel({ startMs: start.getTime(), endMs: end.getTime() }, TZ)).toBe("1:30 to 2:00 AM");
  });
});

describe("the words", () => {
  it("titles the card with the studio and says what it counts", () => {
    expect(yourWeekTitle("Westlake")).toBe("Your week at Westlake");
    expect(whatItCounts("Westlake")).toBe(
      "Counts sessions logged in Journey at Westlake. First session to last isn't a timesheet: Journey doesn't know when you arrived or left.",
    );
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(180)).toBe("3 h");
    expect(durationLabel(1450)).toBe("24 h 10 min");
    expect(emptyWeekSentence("this", "Westlake")).toBe("No sessions with you logged in Journey at Westlake so far this week.");
  });

  it("says the studio is still moving off FileMaker until both weeks are after its cutover", () => {
    const line = "Westlake is still moving off FileMaker. Sessions logged there aren't counted.";
    expect(cutoverLine("Westlake", null, "2026-09-30")).toBe(line);
    expect(cutoverLine("Westlake", "2026-09-29", "2026-09-30")).toBe(line); // this week began before it
    expect(cutoverLine("Westlake", "2026-09-22", "2026-09-30")).toBe(line); // last week began before it
    expect(cutoverLine("Westlake", "2026-09-21", "2026-09-30")).toBeNull();
    expect(cutoverLine("Westlake", "not a date", "2026-09-30")).toBe(line);
  });

  it("works out both weeks from one read", () => {
    const sessions = [session("2026-09-22", "07:00", "07:25"), session("2026-09-29", "07:00", "07:25"), session("2026-09-29", "07:30", "07:55")];
    const both = yourWeek(sessions, { today: "2026-09-30", trainerId: "t1", sessionMinutes: 30 });
    expect(both.lastWeek.sessions).toBe(1);
    expect(both.thisWeek.sessions).toBe(2);
    expect(both.thisWeek.days[0].parts).toHaveLength(1);
  });
});
