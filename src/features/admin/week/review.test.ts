import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../../types";
import { bookingMarks, loggedSessions } from "../../../lib/booking-state";
import { busiestDay, dayFacts, dayLine, mondayOf, readInFull, reviewLine, teamWeek, totals, weekFrom, type DayFacts } from "./review";

const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
const NOW = new Date("2026-09-28T13:00:00Z"); // Monday Sep 28, 9 AM Eastern

const booking = (id: string, clientId: string, day: string, hm: string, extra: Record<string, unknown> = {}) =>
  ({ id, clientId, clientName: clientId, trainerId: "t1", studioId: "westlake", startTime: eastern(day, hm), endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000), status: "Scheduled", ...extra }) as unknown as ScheduleEntry;

describe("the week's days", () => {
  it("runs Monday to Sunday", () => {
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(weekFrom("2026-09-21")).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("counts a day as done-means-logged, with late and unstamped cancellations, and never counts a staff block", () => {
    const entries = [
      booking("a", "ann", "2026-09-24", "09:00"),
      booking("b", "bea", "2026-09-24", "10:00"),
      booking("c", "cy", "2026-09-24", "11:00", { status: "Cancelled", cancelledAt: eastern("2026-09-24", "07:00") }), // 4 hours before: late
      booking("d", "dee", "2026-09-24", "12:00", { status: "Cancelled", cancelledAt: eastern("2026-09-21", "07:00") }), // days before: early
      booking("e", "eve", "2026-09-24", "13:00", { status: "Cancelled" }), // no stamp
      booking("f", "blk", "2026-09-24", "14:00", { clientName: "Unavailable" }),
    ];
    const logged = loggedSessions([{ status: "Completed", clientId: "ann", date: "2026-09-24" } as never], TZ);
    const d = dayFacts(entries, "2026-09-24", logged, NOW, TZ);
    expect(d).toMatchObject({ label: "Thu", booked: 2, done: 1, notLogged: 1, cancelled: 3, late: 1, unstamped: 1, toCome: 0 });
    expect(dayLine(d)).toBe("1 of 2 logged · 1 not logged · 1 late cancel");
  });

  it("is unknown, never zero, when the sessions couldn't be read", () => {
    const d = dayFacts([booking("a", "ann", "2026-09-24", "09:00")], "2026-09-24", null, NOW, TZ);
    expect(d.done).toBeNull();
    expect(d.notLogged).toBeNull();
    expect(totals([d]).done).toBeNull();
    expect(dayLine(d)).toBe("1 booked");
  });

  it("says what is still to come on a day that hasn't finished", () => {
    const d = dayFacts([booking("a", "ann", "2026-09-28", "15:00")], "2026-09-28", loggedSessions([], TZ), NOW, TZ);
    expect(d.toCome).toBe(1);
    expect(dayLine(d)).toBe("1 booked, 1 to come");
  });

  it("counts a booking a leader marked \"didn't come\" as that, never as not logged", () => {
    const entries = [booking("a", "ann", "2026-09-24", "09:00"), booking("b", "bea", "2026-09-24", "10:00")];
    const logged = loggedSessions([], TZ);
    const d = dayFacts(entries, "2026-09-24", logged, NOW, TZ, bookingMarks([{ id: "b", noShow: true }]));
    expect(d).toMatchObject({ booked: 2, done: 0, notLogged: 1, noShow: 1 });
    expect(dayLine(d)).toBe("0 of 2 logged · 1 not logged · 1 didn't come");
    expect(totals([d]).noShow).toBe(1);
  });
});

describe("the Monday review's bottom line", () => {
  const day = (over: Partial<DayFacts>): DayFacts => ({ day: "2026-09-21", label: "Mon", booked: 0, done: 0, notLogged: 0, noShow: 0, toCome: 0, cancelled: 0, late: 0, unstamped: 0, ...over });

  it("says what was logged, the late cancellations, who slipped and came back, and the renewals decided", () => {
    const t = totals([day({ booked: 56, done: 54, notLogged: 2 }), day({ day: "2026-09-22", booked: 49, done: 49, late: 3, cancelled: 3 })]);
    const line = reviewLine(t, { crossed: 5, back: 2, renewals: { total: 3, renewed: 1, upgraded: 1, downgraded: 0, payAsYouGo: 1, lost: 0, kept: 3, keptRate: 1 }, coverage: { read: 2, of: 2, unknown: 0 }, renewalUnknown: 0 });
    expect(line).toBe(
      "103 of 105 booked sessions were logged as done in Journey, and 2 have no workout logged. 3 cancellations came less than a day before the session. 5 clients crossed a line and started slipping; 2 clients booked again after a gap. 3 renewals were decided, 1 up to a longer package.",
    );
  });

  it("names what couldn't be read: the sessions, the outcomes, the whole-read record", () => {
    const unknown = reviewLine(totals([day({ booked: 4, done: null, notLogged: null })]), { crossed: 0, back: 0, renewals: null, coverage: null, renewalUnknown: 2 });
    expect(unknown).toContain("4 sessions were booked; what was logged couldn't be read.");
    expect(unknown).toContain("The week's renewal outcomes couldn't be read.");
    expect(unknown).toContain("Whether every day's bookings were read in full can't be told.");
    expect(unknown).toContain("Renewal timing is unknown for 2 clients.");
    const short = reviewLine(totals([day({ booked: 4, done: 4 })]), { crossed: 0, back: 0, renewals: null, coverage: { read: 5, of: 6, unknown: 0 }, renewalUnknown: 0 });
    expect(short).toContain("Bookings were read in full on 5 of 6 days with bookings, so the counts may be short.");
  });
});

describe("the whole-read record, and the busiest day", () => {
  it("counts days with bookings read in full, and can't tell a month whose record failed", () => {
    const days = [
      { day: "2026-09-29", label: "Tue", booked: 3, done: null, notLogged: null, noShow: 0, toCome: 3, cancelled: 0, late: 0, unstamped: 0 },
      { day: "2026-09-30", label: "Wed", booked: 0, done: null, notLogged: null, noShow: 0, toCome: 0, cancelled: 0, late: 0, unstamped: 0 },
      { day: "2026-10-01", label: "Thu", booked: 5, done: null, notLogged: null, noShow: 0, toCome: 5, cancelled: 0, late: 0, unstamped: 0 },
    ];
    const record = new Map<string, ReadonlySet<string> | null>([["2026-09", new Set(["2026-09-29"])], ["2026-10", null]]);
    expect(readInFull(days, record)).toEqual({ read: 1, of: 2, unknown: 1 });
    expect(readInFull(days, null)).toBeNull();
    expect(busiestDay(days)?.label).toBe("Thu");
  });
});

describe("each trainer's week", () => {
  const trainers = [
    { id: "t1", fullName: "Beregond Guard" },
    { id: "t2", authUid: "uid-2", fullName: "Anborn Ranger" },
  ];

  it("counts only the days asked about, in name order, with who isn't logged yet, earliest first", () => {
    const entries = [
      booking("a", "ann", "2026-09-21", "10:00"),
      booking("b", "bea", "2026-09-21", "09:00"),
      booking("c", "cy", "2026-09-22", "09:00", { trainerId: "uid-2" }), // an older account's sign-in id
      booking("d", "dee", "2026-09-23", "09:00", { status: "Cancelled" }),
      booking("e", "eve", "2026-09-29", "09:00"), // moved away from the week: not its day
      booking("f", "blk", "2026-09-22", "10:00", { clientName: "Unavailable" }),
      booking("g", "gil", "2026-09-22", "11:00", { trainerId: null, trainerName: "Westlake Rotation" }),
    ];
    const logged = loggedSessions([{ status: "Completed", clientId: "cy", date: "2026-09-22" } as never], TZ);
    const week = teamWeek(entries, logged, "2026-09-21", "2026-09-27", trainers, NOW, TZ);
    expect(week.map((r) => [r.name, r.booked, r.notLogged])).toEqual([
      ["Anborn Ranger", 1, 0],
      ["Beregond Guard", 2, 2],
    ]);
    expect(week[1].missing.map((m) => m.clientName)).toEqual(["bea", "ann"]);
  });

  it("leaves a booking a leader marked \"didn't come\" off the trainer's not logged", () => {
    const entries = [booking("a", "ann", "2026-09-21", "09:00"), booking("b", "bea", "2026-09-21", "10:00")];
    const week = teamWeek(entries, loggedSessions([], TZ), "2026-09-21", "2026-09-27", trainers, NOW, TZ, bookingMarks([{ id: "a", noShow: true }]));
    expect(week[0]).toMatchObject({ name: "Beregond Guard", booked: 2, notLogged: 1 });
    expect(week[0].missing.map((m) => m.clientName)).toEqual(["bea"]);
  });

  it("is unknown, never zero, when the sessions couldn't be read", () => {
    const week = teamWeek([booking("a", "ann", "2026-09-21", "09:00")], null, "2026-09-21", "2026-09-27", trainers, NOW, TZ);
    expect(week[0]).toMatchObject({ name: "Beregond Guard", booked: 1, notLogged: null, missing: [] });
  });
});
