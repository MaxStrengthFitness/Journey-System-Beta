/**
 * The directory row: every cell's known, none, unknown and before-Journey
 * states. Run with TZ=America/New_York (the studio's day is Eastern).
 */
import { describe, expect, it } from "vitest";
import { buildDirectoryRow, buildDirectoryRows, heightWords, pastDayWords, futureDayWords } from "./row";
import { TODAY, eastern, makeBooking, makeClient, makeContext, makeSession } from "./fixtures";

const PIF = { s1: { serviceId: 1, name: "96 PIF", count: 96, remaining: 36 } };
const COMP = { s2: { serviceId: 2, name: "Session Comp", count: 12, remaining: 12 } };

describe("name", () => {
  it("puts the nickname between the legal names and goes by it", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", firstName: "Judith", lastName: "Alvarez", nickname: "Judy" }), makeContext());
    expect(row.name.display).toBe("Judith \u201cJudy\u201d Alvarez");
    expect(row.name.goesBy).toBe("Judy");
    expect(row.name.initials).toBe("JA");
  });

  it("ignores a nickname that is just the first name again", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", firstName: "Nancy", lastName: "Kowalski", nickname: "nancy" }), makeContext());
    expect(row.name.nickname).toBeNull();
    expect(row.name.display).toBe("Nancy Kowalski");
  });
});

describe("age and birthday", () => {
  it("says a decade birthday within the week", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", dateOfBirth: "1946-10-01" }), makeContext());
    expect(row.age.value).toBe(79);
    expect(row.age.turns).toBe(80);
    expect(row.age.birthdayPhrase).toBe("Turns 80 Thursday");
    expect(row.age.milestone).toBe(true);
  });

  it("an ordinary birthday is just a birthday", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", dateOfBirth: "1954-09-28" }), makeContext());
    expect(row.age.birthdayPhrase).toBe("Birthday tomorrow");
    expect(row.age.milestone).toBe(false);
  });

  it("never gives an age without a birth year", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", dateOfBirth: "1899-10-01" }), makeContext());
    expect(row.age.value).toBeNull();
    expect(row.age.text).toBe("Not on file");
    expect(row.age.birthdayPhrase).toBe("Birthday Thursday");
  });

  it("no date of birth is not on file", () => {
    const row = buildDirectoryRow(makeClient({ id: "a" }), makeContext());
    expect(row.age.text).toBe("Not on file");
    expect(row.age.birthdayPhrase).toBeNull();
  });
});

describe("last in", () => {
  it("a session finished in Journey today wins, with its trainer", () => {
    const ctx = makeContext({ recentSessions: [makeSession({ clientId: "a", at: eastern(TODAY, "09:30"), trainerId: "t-mike" })] });
    const row = buildDirectoryRow(makeClient({ id: "a", lastSessionDate: "2026-09-20" }), ctx);
    expect(row.lastIn).toMatchObject({ state: "known", day: TODAY, text: "Today", sub: "with Mike" });
  });

  it("takes the latest day any record gives", () => {
    const row = buildDirectoryRow(
      makeClient({ id: "a", lastSessionDate: "2026-09-24", renewal: { lastVisitDate: "2026-09-25" } as never }),
      makeContext(),
    );
    expect(row.lastIn).toMatchObject({ state: "known", day: "2026-09-25", text: "Fri" });
  });

  it("reads a date-only string as the studio day, not the evening before (the date trap)", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", lastSessionDate: "2026-09-26" }), makeContext());
    expect(row.lastIn.day).toBe("2026-09-26");
    expect(row.lastIn.text).toBe("Yesterday");
  });

  it("names the trainer only when a held booking that day says so", () => {
    const ctx = makeContext({
      schedules: [makeBooking({ clientId: "a", start: eastern("2026-09-26", "09:00"), trainerId: "t-ana", trainerName: "Ana Lopez" })],
    });
    expect(buildDirectoryRow(makeClient({ id: "a", lastSessionDate: "2026-09-26" }), ctx).lastIn.sub).toBe("with Ana");
    expect(buildDirectoryRow(makeClient({ id: "a", lastSessionDate: "2026-09-20" }), ctx).lastIn.sub).toBeNull();
  });

  it("ignores a day after today", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", lastSessionDate: "2026-10-02", clientsNumberOfVisitsAtSite: 2 }), makeContext());
    expect(row.lastIn.state).toBe("nothing-recorded");
  });

  it("a migrated client with a prior record reads Before Journey, never nothing", () => {
    const row = buildDirectoryRow(
      makeClient({ id: "a", priorHistory: { sessions: 304, through: "2026-08-31", source: "filemaker" } }),
      makeContext(),
    );
    expect(row.lastIn).toMatchObject({ state: "before-journey", text: "Before Journey", sub: "FileMaker record to Aug 2026" });
  });

  it("a long-standing client Mindbody has counted reads Before Journey too", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", clientsNumberOfVisitsAtSite: 212 }), makeContext());
    expect(row.lastIn.state).toBe("before-journey");
  });

  it("Journey holding her whole story with no visit is Nothing recorded", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", clientsNumberOfVisitsAtSite: 1 }), makeContext());
    expect(row.lastIn).toMatchObject({ state: "nothing-recorded", text: "Nothing recorded" });
  });

  it("nothing known either way is Unknown, with a reason", () => {
    const row = buildDirectoryRow(makeClient({ id: "a" }), makeContext());
    expect(row.lastIn.state).toBe("unknown");
    expect(row.lastIn.text).toBe("Unknown");
    expect(row.lastIn.reason).toMatch(/not recorded yet/);
  });
});

describe("next booking", () => {
  it("reads the held bookings, with who it is with", () => {
    const ctx = makeContext({
      schedules: [makeBooking({ clientId: "a", start: eastern("2026-09-28", "09:20"), trainerId: "t-ana", trainerName: "Ana Lopez" })],
    });
    const row = buildDirectoryRow(makeClient({ id: "a" }), ctx);
    expect(row.next).toMatchObject({ state: "booked", day: "2026-09-28", text: "Tomorrow 9:20 AM", sub: "with Ana", source: "held" });
  });

  it("says with you for the signed-in trainer, by id or by name", () => {
    const byId = makeContext({ schedules: [makeBooking({ clientId: "a", start: eastern("2026-09-29", "10:00"), trainerId: "t-me", trainerName: "S R" })] });
    expect(buildDirectoryRow(makeClient({ id: "a" }), byId).next.sub).toBe("with you");
    const byName = makeContext({ schedules: [makeBooking({ clientId: "a", start: eastern("2026-09-29", "10:00"), trainerName: "sam  rivera" })] });
    const row = buildDirectoryRow(makeClient({ id: "a" }), byName);
    expect(row.next.sub).toBe("with you");
    expect(row.bookedWithMe).toBe(true);
  });

  it("skips a booking already over today, and a cancelled one", () => {
    const ctx = makeContext({
      schedules: [
        makeBooking({ clientId: "a", start: eastern(TODAY, "09:00") }),
        makeBooking({ clientId: "a", start: eastern("2026-09-29", "08:00"), status: "Cancelled" }),
        makeBooking({ clientId: "a", start: eastern("2026-10-01", "07:40") }),
      ],
    });
    const row = buildDirectoryRow(makeClient({ id: "a" }), ctx);
    expect(row.next.text).toBe("Thu 7:40 AM");
    expect(row.today?.over).toBe(true);
  });

  it("matches a booking by client id only, never by name", () => {
    const ctx = makeContext({ schedules: [makeBooking({ clientId: "someone-else", clientName: "Nancy Kowalski", start: eastern("2026-09-28", "09:00") })] });
    const row = buildDirectoryRow(makeClient({ id: "a", firstName: "Nancy", lastName: "Kowalski" }), ctx);
    expect(row.next.state).toBe("none");
  });

  it("says nothing is booked only while the bookings are fresh", () => {
    const fresh = buildDirectoryRow(makeClient({ id: "a" }), makeContext());
    expect(fresh.next).toMatchObject({ state: "none", text: "Nothing booked", sub: "next 8 days" });
  });

  it("an unknown feed never reads Nothing booked", () => {
    const stale = buildDirectoryRow(makeClient({ id: "a" }), makeContext({ bookingsFresh: false }));
    expect(stale.next.state).toBe("unknown");
    expect(stale.next.text).toBe("Unknown");
    expect(stale.next.text).not.toMatch(/Nothing booked/);
    expect(stale.next.reason).toMatch(/last read 1:05 PM/);

    const unread = buildDirectoryRow(makeClient({ id: "a" }), makeContext({ schedules: null, bookingsFresh: false, bookingsAsOf: null }));
    expect(unread.next).toMatchObject({ state: "unknown", text: "Unknown", reason: "Bookings haven't loaded yet." });
  });

  it("beyond the held days, last night's record answers", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", renewal: { nextBookingDate: "2026-10-14" } as never }), makeContext());
    expect(row.next).toMatchObject({ state: "booked", day: "2026-10-14", text: "Oct 14", sub: "as of last night", source: "nightly" });
  });

  it("inside the held days, the fresh bookings know better than last night", () => {
    const client = makeClient({ id: "a", renewal: { nextBookingDate: "2026-09-30" } as never });
    expect(buildDirectoryRow(client, makeContext()).next.state).toBe("none");
    expect(buildDirectoryRow(client, makeContext({ bookingsFresh: false })).next).toMatchObject({ state: "booked", day: "2026-09-30", source: "nightly" });
  });
});

describe("a client whose home is another studio", () => {
  it("her next booking is unknown here unless she is booked here", () => {
    const visitor = makeClient({ id: "v", homeStudioId: "solon" });
    expect(buildDirectoryRow(visitor, makeContext()).next).toMatchObject({ state: "unknown", text: "Unknown" });
    const bookedHere = makeContext({ schedules: [makeBooking({ clientId: "v", start: eastern("2026-09-28", "10:00") })] });
    expect(buildDirectoryRow(visitor, bookedHere).next.state).toBe("booked");
  });

  it("her sessions left are unknown when only this studio's table is read", () => {
    const visitor = makeClient({ id: "v", homeStudioId: "solon", mindbodyServices: { ...PIF } as never });
    expect(buildDirectoryRow(visitor, makeContext({ packageStudioId: "westlake" })).left).toMatchObject({ state: "unknown", value: null });
    expect(buildDirectoryRow(visitor, makeContext({ packageStudioId: "solon" })).left.value).toBe(36);
  });
});

describe("sessions left", () => {
  it("left in the contract, with the extras beside it", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", mindbodyServices: { ...PIF, ...COMP } as never }), makeContext());
    expect(row.left).toMatchObject({ state: "known", value: 36, text: "36 left", sub: "+12 extra" });
  });

  it("a contract paid by the month is on hand, never left", () => {
    const monthly = { s1: { serviceId: 1, name: "96 Sessions - 2X Week", count: 8, remaining: 5 } };
    const row = buildDirectoryRow(makeClient({ id: "a", mindbodyServices: monthly as never }), makeContext());
    expect(row.left).toMatchObject({ value: 5, text: "5 on hand", perPayment: true });
  });

  it("never 0 when the packages were never read", () => {
    const row = buildDirectoryRow(makeClient({ id: "a" }), makeContext());
    expect(row.left.state).toBe("unknown");
    expect(row.left.value).toBeNull();
    expect(row.left.text).toBe("Unknown");
    expect(row.left.text).not.toMatch(/0|None/);
  });

  it("never 0 while the studio's package table is not loaded", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", mindbodyServices: { ...PIF } as never }), makeContext({ packageIndex: null }));
    expect(row.left).toMatchObject({ state: "unknown", value: null });
  });

  it("read and empty is None left", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", mindbodyServices: {}, mindbodyServicesSyncedAt: new Date() }), makeContext());
    expect(row.left).toMatchObject({ state: "known", value: 0, text: "None left" });
  });
});

describe("total sessions", () => {
  it("counts the sessions before Journey and says so", () => {
    const row = buildDirectoryRow(
      makeClient({ id: "a", sessionCount: 312, priorHistory: { sessions: 304, through: "2026-08-31", source: "filemaker" } }),
      makeContext(),
    );
    expect(row.total).toMatchObject({ state: "known", value: 312, text: "312", sub: "304 before Journey" });
  });

  it("adds the prior record when the count has not taken it in yet", () => {
    const row = buildDirectoryRow(
      makeClient({ id: "a", sessionCount: 8, priorHistory: { sessions: 304, through: "2026-08-31", source: "filemaker" } }),
      makeContext(),
    );
    expect(row.total.value).toBe(312);
  });

  it("a migrated client never reads new or #1", () => {
    const counted = buildDirectoryRow(makeClient({ id: "a", sessionCount: 1, clientsNumberOfVisitsAtSite: 212 }), makeContext());
    expect(counted.total).toMatchObject({ state: "unknown", value: null, text: "Unknown" });
    const unsynced = buildDirectoryRow(makeClient({ id: "b", sessionCount: 1 }), makeContext());
    expect(unsynced.total.state).toBe("unknown");
    for (const row of [counted, unsynced]) {
      expect(row.total.text).not.toMatch(/^1$|new|#1/i);
    }
  });

  it("a genuinely new client whose whole story is in Journey is counted", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", sessionCount: 2, clientsNumberOfVisitsAtSite: 2 }), makeContext());
    expect(row.total).toMatchObject({ state: "known", value: 2, text: "2" });
  });
});

describe("the rest of the row", () => {
  it("height, gender, occupation, Kaizen, visiting and badges", () => {
    const ctx = makeContext({ kaizen: [{ clientId: "a", clientName: "x", reason: "Form", addedAt: null, addedByTrainerId: "t-me" }] });
    const row = buildDirectoryRow(
      makeClient({ id: "a", height: "5'6\"", gender: "Female", occupation: "ICU nurse", homeStudioId: "solon", isActive: false }),
      ctx,
    );
    expect(row.height).toEqual({ inches: 66, text: heightWords(66) });
    expect(row.gender).toBe("female");
    expect(row.occupation).toEqual({ text: "ICU nurse", retired: false });
    expect(row.kaizen?.reason).toBe("Form");
    expect(row.visitingFrom).toBe("Solon");
    expect(row.badges).toEqual(["Inactive"]);
  });

  it("reads a height typed with primes", () => {
    const row = buildDirectoryRow(makeClient({ id: "a", height: "5\u20326\u2033" }), makeContext());
    expect(row.height.inches).toBe(66);
  });

  it("client since only from a date that proves it", () => {
    const proven = buildDirectoryRow(makeClient({ id: "a", firstAppointmentDate: "2014-03-02T12:00:00" }), makeContext());
    expect(proven.since.year).toBe(2014);
    const journeyOnly = buildDirectoryRow(makeClient({ id: "b", createdAt: new Date("2026-09-02T12:00:00Z") }), makeContext());
    expect(journeyOnly.since).toMatchObject({ year: null, text: "Not on file" });
  });

  it("buildDirectoryRows drops nameless and repeated records", () => {
    const rows = buildDirectoryRows(
      [makeClient({ id: "a", firstName: "A" }), makeClient({ id: "a", firstName: "A" }), makeClient({ id: "b", firstName: "", lastName: "" })],
      makeContext(),
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("day words", () => {
  it("past and future days as a person says them", () => {
    expect(pastDayWords("2026-09-27", TODAY)).toBe("Today");
    expect(pastDayWords("2026-09-22", TODAY)).toBe("Tue");
    expect(pastDayWords("2026-09-17", TODAY)).toBe("Sep 17");
    expect(pastDayWords("2025-03-02", TODAY)).toBe("Mar 2025");
    expect(futureDayWords("2026-09-28", TODAY)).toBe("Tomorrow");
    expect(futureDayWords("2026-10-01", TODAY)).toBe("Thu");
    expect(futureDayWords("2026-10-14", TODAY)).toBe("Oct 14");
  });
});
