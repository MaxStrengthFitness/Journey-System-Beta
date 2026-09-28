import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../../types";
import type { RunSheetEntry } from "../../hub-opportunities/moments-today";
import { NIGHTLY_STALE_DAYS, bottomLine, catchToday, countWord, dayStartMs, heldAgainst, leftWithNothingBooked, nightlyRead, partOfDay, renewalUnknownCount, sinceYesterday, type BottomLineInput } from "./brief";

const NOW = new Date("2026-09-28T13:52:00Z"); // Monday 9:52 AM Eastern
const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const base: BottomLineInput = {
  part: "this morning",
  needs: 0,
  needsPartial: false,
  catchCount: 0,
  neverLogged: 0,
  week: "ready",
  renewalUnknown: 0,
  nightly: { stale: false, lastChangedAt: new Date("2026-09-28T06:31:00Z") },
  tz: TZ,
};

describe("words", () => {
  it("spells small counts and falls back to digits", () => {
    expect(countWord(3)).toBe("Three");
    expect(countWord(1, false)).toBe("one");
    expect(countWord(14)).toBe("14");
  });

  it("names the studio's part of the day", () => {
    expect(partOfDay(NOW, TZ)).toBe("this morning");
    expect(partOfDay(new Date("2026-09-28T18:00:00Z"), TZ)).toBe("this afternoon");
    expect(partOfDay(new Date("2026-09-28T22:30:00Z"), TZ)).toBe("this evening");
  });
});

describe("the bottom line", () => {
  it("leads with what needs you and who to catch, in words", () => {
    const line = bottomLine({ ...base, needs: 3, catchCount: 4, neverLogged: 0 });
    expect(line.sentence).toBe("Three things need you this morning, and four clients are worth catching in person. The rest of the day looks steady.");
  });

  it("says steady only when every read answered", () => {
    expect(bottomLine({ ...base }).sentence).toBe("Nothing needs you this morning. Nobody needs catching in person today. The rest of the day looks steady.");
    // One unknown renewal is enough to lose the all-clear, and it is named.
    const unknown = bottomLine({ ...base, renewalUnknown: 3 }).sentence;
    expect(unknown).toContain("Renewal timing is unknown for 3 clients, so nothing here calls them on track.");
    expect(unknown).not.toContain("steady");
  });

  it("names an unread schedule, an unread day's logging and sessions nobody logged", () => {
    expect(bottomLine({ ...base, week: "loading", catchCount: null, neverLogged: null }).sentence).toBe("Nothing needs you this morning. Today's bookings are still being read.");
    expect(bottomLine({ ...base, week: "offline", catchCount: null, neverLogged: null }).sentence).toContain("Today's bookings couldn't be read, so the floor is unknown.");
    expect(bottomLine({ ...base, neverLogged: null }).sentence).toContain("Today's logging couldn't be read, so what was done is unknown.");
    const two = bottomLine({ ...base, neverLogged: 2 }).sentence;
    expect(two).toContain("Two of today's finished sessions have no workout logged yet.");
    expect(two).not.toContain("steady");
  });

  it("never says nothing needs you off a partial read", () => {
    expect(bottomLine({ ...base, needsPartial: true }).sentence).toMatch(/^Nothing that could be read needs you this morning\./);
    expect(bottomLine({ ...base, needs: 1, needsPartial: true }).sentence).toContain("Part of the page couldn't be read, so there may be more.");
  });

  it("names a nightly record that has stopped changing", () => {
    const stale = bottomLine({ ...base, nightly: { stale: true, lastChangedAt: new Date("2026-09-20T06:31:00Z") } }).sentence;
    expect(stale).toContain("The nightly record hasn't changed since Sun, Sep 20, so nobody's rhythm is judged from it.");
    expect(bottomLine({ ...base, nightly: { stale: true, lastChangedAt: null } }).sentence).toContain("There is no nightly record for this studio yet");
  });

  it("writes down its own rules, with this morning's numbers", () => {
    const rules = bottomLine({ ...base, needs: 2, catchCount: null }).rules;
    expect(rules[0]).toContain("Needs you: 2 rows you can clear on this page");
    expect(rules[1]).toContain("unknown until today's bookings are read");
  });
});

describe("the nightly record", () => {
  const snap = (extra: Record<string, unknown> = {}) => ({ situation: "on-track", flags: [], computedAt: new Date("2026-09-28T06:31:00Z"), ...extra });
  const clients = [
    { id: "a", homeStudioId: "solon", isActive: true, renewal: snap() },
    { id: "b", homeStudioId: "solon", isActive: true, renewal: snap({ situation: "unknown", computedAt: new Date("2026-09-27T06:31:00Z") }) },
    { id: "c", homeStudioId: "solon", isActive: true },
    { id: "v", homeStudioId: "westlake", isActive: true },
    { id: "x", homeStudioId: "solon", isActive: false },
  ] as unknown as Client[];

  it("counts the studio's own active clients whose renewal timing is unknown, and when the record last changed", () => {
    const n = nightlyRead(clients, "solon", NOW);
    expect(n.homeClients).toBe(3);
    expect(n.missing).toEqual(["c"]);
    expect(n.unknownData).toEqual(["b"]);
    expect(renewalUnknownCount(n)).toBe(2);
    expect(n.lastChangedAt?.toISOString()).toBe("2026-09-28T06:31:00.000Z");
    expect(n.stale).toBe(false);
  });

  it(`is stale after ${NIGHTLY_STALE_DAYS} quiet days, or with nothing ever written`, () => {
    const old = clients.map((c) => (c.renewal ? { ...c, renewal: { ...c.renewal, computedAt: new Date("2026-09-24T06:31:00Z") } } : c)) as Client[];
    expect(nightlyRead(old, "solon", NOW).stale).toBe(true);
    expect(nightlyRead([{ id: "c", homeStudioId: "solon", isActive: true }] as unknown as Client[], "solon", NOW).stale).toBe(true);
    // A studio with no clients has nothing to be stale about.
    expect(nightlyRead([], "solon", NOW).stale).toBe(false);
  });
});

describe("catch today", () => {
  const entry = (over: Partial<RunSheetEntry>): RunSheetEntry =>
    ({
      key: "b1",
      booking: {} as ScheduleEntry,
      clientId: "c1",
      client: null,
      name: "Hamfast Gamgee",
      start: eastern("2026-09-28", "11:00").getTime(),
      end: eastern("2026-09-28", "11:30").getTime(),
      timeText: "11:00 – 11:30 AM",
      withText: "with Imrahil",
      stateText: null,
      mine: false,
      moments: [{ family: "renew", kind: "renew", chip: "Renewal talk", sentence: "Renewal: 6 left. Talk about it today?" }],
      facts: {} as RunSheetEntry["facts"],
      criticalUnknown: false,
      sessionNumber: null,
      clinicalOnFile: false,
      ...over,
    }) as RunSheetEntry;

  it("lists the day's clients still to come with a reason to see them, in the order they're in", () => {
    const rows = catchToday(
      [
        entry({}),
        entry({ key: "b2", clientId: "c2", name: "Rosie Cotton", start: eastern("2026-09-28", "10:00").getTime(), end: eastern("2026-09-28", "10:30").getTime(), withText: "with Ioreth", moments: [{ family: "welcome", kind: "back", chip: "Back after 5 wk", sentence: "Back after 5 weeks — missed about 10 at her usual pace." }] }),
        // Over already: the chance has passed.
        entry({ key: "b3", clientId: "c3", name: "Odo Proudfoot", start: eastern("2026-09-28", "08:00").getTime(), end: eastern("2026-09-28", "08:30").getTime() }),
        // Only a waiver to sign: the floor's to see to, not a reason to catch her.
        entry({ key: "b4", clientId: "c4", name: "Daisy Gamgee", moments: [{ family: "watch", kind: "waiver", chip: "No waiver signed", sentence: "No liability waiver signed in Mindbody." }] }),
      ],
      NOW.getTime(),
      TZ,
    );
    expect(rows.map((r) => r.name)).toEqual(["Rosie Cotton", "Hamfast Gamgee"]);
    expect(rows[0].sentence).toBe("In at 10:00 AM with Ioreth.");
    expect(rows[1].proof).toBe("Renewal: 6 left. Talk about it today?");
  });

  it("says who is on the floor now", () => {
    const rows = catchToday([entry({ stateText: "now", start: eastern("2026-09-28", "09:30").getTime(), end: eastern("2026-09-28", "10:00").getTime() })], NOW.getTime(), TZ);
    expect(rows[0].sentence).toBe("On the floor now with Imrahil.");
  });
});

describe("leaving with nothing booked", () => {
  const logged = { has: (id: string, day: string) => day === "2026-09-28" && (id === "maggot" || id === "lobelia" || id === "far") };
  const clients = [
    { id: "maggot", firstName: "Farmer", lastName: "Maggot", isActive: true, renewal: { pacePerWeek: 2, nextBookingDate: null } },
    { id: "lobelia", firstName: "Lobelia", lastName: "Sackville-Baggins", isActive: true },
    { id: "far", firstName: "Hilda", lastName: "Bracegirdle", isActive: true, renewal: { pacePerWeek: 1, nextBookingDate: "2026-10-09" } },
    { id: "absent", firstName: "Nobody", lastName: "Here", isActive: true },
  ] as unknown as Client[];
  const week = [
    { id: "w1", clientId: "lobelia", status: "Scheduled", startTime: eastern("2026-09-30", "10:00") },
    { id: "w2", clientId: "maggot", status: "Cancelled", startTime: eastern("2026-10-01", "10:00") },
  ] as unknown as ScheduleEntry[];

  it("names who trained today with nothing ahead, and trusts a booking last night's record holds past the week", () => {
    const rows = leftWithNothingBooked({ clients, weekEntries: week, logged, today: "2026-09-28", now: NOW, tz: TZ, readAt: eastern("2026-09-28", "09:45").getTime() });
    expect(rows?.map((r) => r.name)).toEqual(["Farmer Maggot"]);
    expect(rows?.[0].proof).toBe("Usually about 2 a week over the last eight weeks. Next booking: none in the week read at 9:45 AM.");
  });

  it("is unknown, never nobody, while today's logging is unread", () => {
    expect(leftWithNothingBooked({ clients, weekEntries: week, logged: null, today: "2026-09-28", now: NOW, tz: TZ })).toBeNull();
  });
});

describe("since yesterday", () => {
  const cancelled = (id: string, day: string, hm: string, stamp: Date | null, extra: Record<string, unknown> = {}) =>
    ({ id, clientId: id, clientName: `Client ${id}`, trainerName: "Mablung", studioId: "solon", status: "Cancelled", startTime: eastern(day, hm), endTime: eastern(day, hm), cancelledAt: stamp, cancelSource: "sweep", ...extra }) as unknown as ScheduleEntry;

  it("keeps changes noticed since yesterday began, each held against its own day, and today's unstamped ones", () => {
    const since = dayStartMs("2026-09-27", TZ);
    const rows = sinceYesterday(
      [
        cancelled("wed", "2026-09-30", "10:00", eastern("2026-09-27", "16:00")),
        cancelled("thu", "2026-10-01", "08:30", eastern("2026-09-25", "12:00")), // noticed Friday: last week's news
        cancelled("today", "2026-09-28", "14:00", null),
        cancelled("fri", "2026-10-02", "09:00", null), // a later day, no stamp: can't be dated here
      ],
      "2026-09-28",
      TZ,
      since,
    );
    expect(rows.map((r) => r.id)).toEqual(["today", "wed"]);
    expect(heldAgainst("2026-09-30", "2026-09-28")).toBe("Wednesday");
    expect(heldAgainst("2026-09-29", "2026-09-28")).toBe("tomorrow");
  });

  it("starts yesterday at the studio's midnight", () => {
    expect(new Date(dayStartMs("2026-09-27", TZ)).toISOString()).toBe("2026-09-27T04:00:00.000Z");
  });
});
