import { describe, expect, it } from "vitest";
import {
  FIRST_VISIT_WINDOW_DAYS,
  heartsLine,
  isAfterMarker,
  machineLine,
  newClientLine,
  newClientsCaveat,
  newClientsThisWeek,
  sinceNotices,
  weekDayWords,
  weekOf,
  type NewClientInputBooking,
  type NewClientInputClient,
  type NewClients,
} from "./since";

// Monday Sep 28 2026 is the studio's today in these tests; the week runs Mon 28 → Sun Oct 4.
const TODAY = "2026-09-28";
const WEEK = weekOf(TODAY);
const at = (iso: string) => Date.parse(iso);

function booking(clientId: string, day: string, hhmm: string, trainer = { id: "t-beregond", name: "Beregond Guard" }, extra: Partial<NewClientInputBooking> = {}): NewClientInputBooking {
  return {
    id: `${clientId}-${day}`,
    clientId,
    clientName: clientId,
    trainerId: trainer.id,
    trainerName: trainer.name,
    startTime: `${day}T${hhmm}:00-04:00`,
    status: "Scheduled",
    ...extra,
  };
}

function client(id: string, extra: Partial<NewClientInputClient> = {}): NewClientInputClient {
  const [first, last] = id.split("-");
  return { id, firstName: first, lastName: last ?? "", homeStudioId: "s1", ...extra };
}

function run(clients: NewClientInputClient[], bookings: NewClientInputBooking[] = [], roster: "loading" | "ready" | "error" = "ready", nowMin = 14 * 60) {
  return newClientsThisWeek({
    todayKey: TODAY,
    nowMin,
    week: WEEK,
    clients,
    bookings,
    roster,
    cutoverOf: () => "2026-09-01",
  });
}

describe("the week", () => {
  it("runs Monday to Sunday around today", () => {
    expect(weekOf("2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekOf("2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekOf("2026-10-04")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("names a day of the week in words", () => {
    expect(weekDayWords("2026-09-30", "2026-10-01")).toBe("yesterday");
    expect(weekDayWords("2026-10-01", "2026-10-01")).toBe("today");
    expect(weekDayWords("2026-10-02", "2026-10-01")).toBe("tomorrow");
    expect(weekDayWords("2026-09-28", "2026-10-01")).toBe("Monday");
  });
});

describe("new to the studio this week", () => {
  it("takes Mindbody's own first visit when it has one: in the week she is new, before it she isn't", () => {
    const out = run(
      [
        client("Hilda-Bracegirdle", { firstAppointmentDate: "2026-09-30" }),
        client("Lobelia-Sackville", { firstAppointmentDate: "2019-04-02" }),
        client("Fatty-Bolger", { firstAppointmentDate: "2026-10-09" }),
      ],
      [booking("Hilda-Bracegirdle", "2026-09-30", "09:20"), booking("Lobelia-Sackville", "2026-09-30", "10:00")],
    );
    expect(out.state).toBe("known");
    expect(out.clients.map((c) => c.clientId)).toEqual(["Hilda-Bracegirdle"]);
    expect(out.clients[0]).toMatchObject({ day: "2026-09-30", startMin: 9 * 60 + 20, trainerName: "Beregond Guard", upcoming: true, basis: "mindbody" });
    expect(out.unsure).toBe(0);
  });

  it("never calls a client new off her first Journey session: history before Journey says she isn't", () => {
    const out = run(
      [
        // Twelve years in, first Journey session this week.
        client("Odo-Proudfoot", { priorHistory: { sessions: 412, through: "2026-08-31", source: "filemaker" }, firstSessionDate: "2026-09-28" }),
        // Journey saw her before the week.
        client("Rosie-Cotton", { firstSessionDate: "2026-09-10" }),
        // Mindbody counts more visits than a new client could have.
        client("Farmer-Maggot", { clientsNumberOfVisitsAtSite: 120 }),
        // An inferred first date (a ceiling) before the week.
        client("Ted-Sandyman", { firstAppointmentDate: "2026-09-02T14:00:00Z", firstAppointmentDateSource: "pull-sync:2026-09-02" }),
      ],
      [
        booking("Odo-Proudfoot", TODAY, "15:00"),
        booking("Rosie-Cotton", TODAY, "15:20"),
        booking("Farmer-Maggot", TODAY, "15:40"),
        booking("Ted-Sandyman", TODAY, "16:00"),
      ],
    );
    expect(out.clients).toEqual([]);
    expect(out.unsure).toBe(0);
  });

  it("calls her new when Journey holds her whole story, or Mindbody counts no visit yet", () => {
    const out = run(
      [
        client("Adelard-Took", { historyIsComplete: true }),
        client("Estella-Bolger", { clientsNumberOfVisitsAtSite: 0 }),
        client("Melilot-Brandybuck", { priorHistory: { sessions: 0, through: "2026-09-27", source: "trainer-estimate" } }),
      ],
      [
        booking("Adelard-Took", TODAY, "15:00", { id: "t-ioreth", name: "Ioreth Healer" }),
        booking("Estella-Bolger", "2026-10-01", "08:40", { id: "t-mablung", name: "Mablung Ranger" }),
        booking("Melilot-Brandybuck", "2026-10-02", "11:00"),
      ],
    );
    expect(out.clients.map((c) => [c.clientId, c.day, c.basis])).toEqual([
      ["Adelard-Took", TODAY, "journey"],
      ["Estella-Bolger", "2026-10-01", "journey"],
      ["Melilot-Brandybuck", "2026-10-02", "journey"],
    ]);
  });

  it("counts anyone booked it can't judge as unsure, never as new and never as not new", () => {
    const out = run([client("Wiseman-Gamwich", { clientsNumberOfVisitsAtSite: 3 }), client("Hob-Hayward")], [
      booking("Wiseman-Gamwich", TODAY, "17:00"),
      booking("Hob-Hayward", "2026-10-03", "09:00"),
    ]);
    expect(out.clients).toEqual([]);
    expect(out.unsure).toBe(2);
    expect(newClientsCaveat(out)).toBe("Couldn't check 2 clients booked this week: Journey doesn't have their first visit on file.");
  });

  it("leaves out cancelled bookings, staff blocks and bookings outside the week", () => {
    const out = run([client("Hob-Hayward"), client("Lotho-Pimple")], [
      booking("Hob-Hayward", TODAY, "09:00", undefined, { status: "Cancelled" }),
      booking("Lotho-Pimple", "2026-10-06", "09:00"),
      { clientId: "x", clientName: "Unavailable", startTime: `${TODAY}T10:00:00-04:00`, status: "Scheduled" },
    ]);
    expect(out).toEqual({ state: "known", clients: [], unsure: 0 });
  });

  it("waits on the roster, and says so when it failed, rather than saying nobody is new", () => {
    expect(run([], [], "loading")).toEqual({ state: "loading", clients: [], unsure: 0 });
    const failed = run([], [], "error");
    expect(failed.state).toBe("failed");
    expect(newClientsCaveat(failed)).toMatch(/Couldn't check for new clients/);
  });

  it("says each one in a line: when, and with whom", () => {
    const me = new Set(["t-ioreth"]);
    const out = run(
      [client("Adelard-Took", { firstAppointmentDate: TODAY }), client("Hilda-Bracegirdle", { firstAppointmentDate: "2026-09-30" })],
      [booking("Adelard-Took", TODAY, "15:00", { id: "t-ioreth", name: "Ioreth Healer" })],
    );
    expect(out.clients.map((c) => newClientLine(c, TODAY, me))).toEqual([
      "Adelard Took · first visit today at 3:00 PM, with you",
      "Hilda Bracegirdle · first visit Wednesday",
    ]);
  });

  it("marks a visit still to come as upcoming, and one earlier today as not", () => {
    const out = run(
      [client("Adelard-Took", { firstAppointmentDate: TODAY }), client("Hilda-Bracegirdle", { firstAppointmentDate: TODAY })],
      [booking("Adelard-Took", TODAY, "15:00"), booking("Hilda-Bracegirdle", TODAY, "09:00")],
      "ready",
      12 * 60,
    );
    expect(Object.fromEntries(out.clients.map((c) => [c.clientId, c.upcoming]))).toEqual({ "Hilda-Bracegirdle": false, "Adelard-Took": true });
  });
});

describe("the notices", () => {
  const known = (clients: NewClients["clients"] = [], unsure = 0): NewClients => ({ state: "known", clients, unsure });
  const NOW = at("2026-09-28T18:18:00Z");

  it("marks what happened after the marker as new, and nothing while the marker loads", () => {
    const seen = at("2026-09-27T20:00:00Z");
    expect(isAfterMarker(at("2026-09-28T13:02:00Z"), seen, NOW)).toBe(true);
    expect(isAfterMarker(at("2026-09-27T13:02:00Z"), seen, NOW)).toBe(false);
    expect(isAfterMarker(at("2026-09-28T13:02:00Z"), undefined, NOW)).toBe(false);
    expect(isAfterMarker(null, seen, NOW)).toBe(false);
  });

  it("with no marker yet, the last week is new", () => {
    expect(isAfterMarker(NOW - (FIRST_VISIT_WINDOW_DAYS - 1) * 86_400_000, null, NOW)).toBe(true);
    expect(isAfterMarker(NOW - (FIRST_VISIT_WINDOW_DAYS + 1) * 86_400_000, null, NOW)).toBe(false);
  });

  it("orders leadership, new clients, machines, the Playbook and hearts, and counts the new ones", () => {
    const { notices, newCount } = sinceNotices({
      now: NOW,
      seenAt: at("2026-09-27T20:00:00Z"),
      announcements: [
        { id: "a1", title: "Closed Monday, Oct 12", authorId: "t-glorfindel", authorName: "Glorfindel Elf", createdAt: at("2026-09-28T13:02:00Z") },
        { id: "a0", title: "New towels", authorName: "Glorfindel Elf", createdAt: at("2026-09-20T13:02:00Z") },
      ],
      roleOf: (id) => (id === "t-glorfindel" ? "Studio Leader" : null),
      newClients: known([
        { clientId: "c1", name: "Adelard Took", day: TODAY, startMin: 900, trainerId: "t-ioreth", trainerName: "Ioreth Healer", upcoming: true, appearedAt: at("2026-09-28T12:00:00Z"), basis: "mindbody" },
      ]),
      machines: [{ machineId: "hip-add", name: "Hip Adductor", source: "flag", at: at("2026-09-26T13:10:00Z"), by: "Mablung Ranger", note: "Seat pin sheared." }],
      playbook: [
        { id: "p1", title: "Pullover and a sore shoulder", authorName: "Beregond Guard", createdAt: at("2026-09-28T15:00:00Z") },
        { id: "p-old", title: "Ancient tip", createdAt: at("2026-08-01T15:00:00Z") },
        { id: "p-ret", title: "Retired tip", createdAt: at("2026-09-28T15:00:00Z"), retiredAt: at("2026-09-28T16:00:00Z") },
      ],
      hearts: [{ key: "row:1", what: "“Closing wipe-down”", from: ["Beregond"], at: at("2026-09-28T01:00:00Z") }],
      readKeys: new Set(),
    });
    expect(notices.map((n) => n.key)).toEqual(["ann:a1", "ann:a0", "new-clients", "oos:flag:hip-add", "pb:p1", "hearts"]);
    expect(notices.filter((n) => n.isNew).map((n) => n.key)).toEqual(["ann:a1", "new-clients", "pb:p1", "hearts"]);
    expect(newCount).toBe(4);
    const first = notices[0];
    expect(first.kind === "announcement" && first.role).toBe("Studio Leader");
  });

  it("keeps a notice tapped as seen on this iPad hollow, and leaves out a new-clients notice with nothing to say", () => {
    const { notices } = sinceNotices({
      now: NOW,
      seenAt: null,
      announcements: [{ id: "a1", title: "Closed Monday", createdAt: NOW - 3_600_000 }],
      newClients: known(),
      machines: [],
      playbook: [],
      hearts: [],
      readKeys: new Set(["ann:a1"]),
    });
    expect(notices.map((n) => [n.key, n.isNew])).toEqual([["ann:a1", false]]);
  });

  it("keeps the new-clients notice when it couldn't check, so it can say so", () => {
    const { notices } = sinceNotices({
      now: NOW,
      seenAt: null,
      announcements: [],
      newClients: { state: "failed", clients: [], unsure: 0 },
      machines: [],
      playbook: [],
      hearts: [],
      readKeys: new Set(),
    });
    expect(notices.map((n) => n.kind)).toEqual(["new-clients"]);
  });
});

describe("the notices' words", () => {
  it("say who sent hearts, and for what", () => {
    expect(heartsLine([{ key: "a", what: "“Closing wipe-down”", from: ["Beregond"], at: null }])).toBe("Beregond sent you a heart for “Closing wipe-down”.");
    expect(
      heartsLine([
        { key: "a", what: "“Closing wipe-down”", from: ["Beregond", "Mablung"], at: null },
        { key: "b", what: "“Deep clean”", from: ["Damrod"], at: null },
      ]),
    ).toBe("Beregond, Mablung and 1 more sent you 3 hearts for 2 things you finished.");
  });

  it("say who flagged a machine and when, or since when it is off the floor", () => {
    const flagged = { machineId: "m", name: "Hip Adductor", source: "flag" as const, at: at("2026-09-28T13:10:00Z"), by: "Mablung Ranger", note: null };
    expect(machineLine(flagged, TODAY)).toBe("Flagged by Mablung, today at 9:10 AM.");
    expect(machineLine({ ...flagged, source: "roster", at: at("2026-09-26T13:10:00Z"), by: null }, TODAY)).toBe("Off the floor since Saturday.");
    expect(machineLine({ ...flagged, source: "roster", at: null, by: null }, TODAY)).toBe("Off the floor.");
  });
});
