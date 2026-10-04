import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../../types";
import type { RunSheetEntry } from "../../hub-opportunities/moments-today";
import { NIGHTLY_STALE_DAYS, catchToday, dayStartMs, heldAgainst, leftWithNothingBooked, nightlyNote, nightlyRead, renewalUnknownCount, sinceYesterday } from "./brief";

const NOW = new Date("2026-09-28T13:52:00Z"); // Monday 9:52 AM Eastern
const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

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

describe("the nightly record, said once", () => {
  const today = "2026-09-28";
  const names = (ids: string[]) => ids.join(", ");
  const read = (over: Partial<ReturnType<typeof nightlyRead>> = {}) => ({ lastChangedAt: new Date("2026-09-28T06:31:00Z"), stale: false, homeClients: 3, missing: [], unknownData: [], ...over });

  it("before a studio's Journey start: one line that it isn't live yet, and why behind it", () => {
    const note = nightlyNote(read({ lastChangedAt: null, stale: true, missing: ["a", "b", "c"] }), { name: "Strongsville Ohio", journeyCutoverDate: null }, today, names, TZ);
    expect(note?.kind).toBe("not-live");
    expect(note?.text).toBe("Strongsville Ohio isn't live in Journey yet. Rhythm, MIA and renewals start after its first nightly run.");
    expect(note?.why).toContain("doesn't have one yet");
    expect(note?.why).toContain("3 clients are waiting on it.");
    expect(nightlyNote(read({ lastChangedAt: null, stale: true }), { name: "Solon", journeyCutoverDate: "2026-11-01" }, today, names)?.why).toContain("(Solon's is 2026-11-01)");
  });

  it("after the start date with nothing written, it says so instead", () => {
    const note = nightlyNote(read({ lastChangedAt: null, stale: true }), { name: "Solon", journeyCutoverDate: "2026-09-01" }, today, names);
    expect(note?.kind).toBe("no-record");
    expect(note?.text).toBe("No nightly record for Solon yet, so rhythm, MIA and renewals aren't judged.");
  });

  it("names a record that has stopped changing", () => {
    const note = nightlyNote(read({ lastChangedAt: new Date("2026-09-20T06:31:00Z"), stale: true }), { name: "Solon" }, today, names, TZ);
    expect(note?.kind).toBe("stale");
    expect(note?.text).toBe("The nightly record last changed Sun, Sep 20, so nobody is called slipping until it runs again.");
  });

  it("on a fresh record, only the clients it couldn't place, by name behind Why", () => {
    const note = nightlyNote(read({ missing: ["c"], unknownData: ["b"] }), { name: "Solon" }, today, names);
    expect(note?.kind).toBe("unknown");
    expect(note?.text).toBe("2 clients can't be judged yet.");
    expect(note?.why).toContain(": c, b.");
  });

  it("says nothing when there is nothing to say", () => {
    expect(nightlyNote(read(), { name: "Solon" }, today, names)).toBeNull();
    expect(nightlyNote(read({ homeClients: 0, lastChangedAt: null, stale: false }), { name: "Solon" }, today, names)).toBeNull();
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
