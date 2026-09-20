import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../../types";
import { nextDays, notBookedAhead } from "./next-days";

const TZ = "America/New_York";
const TODAY = "2026-09-19"; // Saturday

const booking = (id: string, clientId: string, day: string, status: ScheduleEntry["status"] = "Scheduled"): ScheduleEntry =>
  ({ id, clientId, clientName: clientId, trainerName: "Tom", studioId: "s1", startTime: new Date(`${day}T10:00:00-04:00`), endTime: null, status, serviceName: "", source: "MindBody", createdAt: null }) as ScheduleEntry;

const client = (id: string, name: string, over: Record<string, unknown> = {}): Client => ({ id, firstName: name, lastName: "T", isActive: true, ...over }) as unknown as Client;

describe("nextDays", () => {
  it("picks the next three days WITH bookings — a closed Sunday is skipped", () => {
    const entries = [booking("a", "c1", "2026-09-21"), booking("b", "c2", "2026-09-22"), booking("c", "c1", "2026-09-23"), booking("d", "c3", "2026-09-24")];
    const days = nextDays({ weekEntries: entries, changesByDay: {}, momentsByDay: {}, hotClientIds: new Set(), clients: [], today: TODAY, tz: TZ });
    expect(days.map((d) => [d.day, d.label, d.booked])).toEqual([
      ["2026-09-21", "Mon", 1],
      ["2026-09-22", "Tue", 1],
      ["2026-09-23", "Wed", 1],
    ]);
  });

  it("fills from the calendar when fewer than three days ahead have bookings", () => {
    const days = nextDays({ weekEntries: [booking("a", "c1", "2026-09-22")], changesByDay: {}, momentsByDay: {}, hotClientIds: new Set(), clients: [], today: TODAY, tz: TZ });
    expect(days.map((d) => [d.day, d.label, d.booked])).toEqual([
      ["2026-09-20", "Tomorrow", 0],
      ["2026-09-21", "Mon", 0],
      ["2026-09-22", "Tue", 1],
    ]);
  });

  it("carries changes, moments and who is booked with something live on the notes panel", () => {
    const entries = [booking("a", "c1", "2026-09-21"), booking("b", "c2", "2026-09-21"), booking("x", "c9", "2026-09-21", "Cancelled"), booking("c", "c1", "2026-09-22"), booking("d", "c3", "2026-09-23")];
    const days = nextDays({
      weekEntries: entries,
      changesByDay: { "2026-09-21": 1 },
      momentsByDay: { "2026-09-22": 2 },
      hotClientIds: new Set(["c1"]),
      clients: [client("c1", "Ann")],
      today: TODAY,
      tz: TZ,
    });
    expect(days[0]).toMatchObject({ day: "2026-09-21", booked: 2, clients: 2, changes: 1, moments: 0, hot: 1, hotNames: ["Ann T"] });
    expect(days[1]).toMatchObject({ day: "2026-09-22", booked: 1, moments: 2, hot: 1 });
    expect(days[2]).toMatchObject({ day: "2026-09-23", booked: 1, hot: 0 });
  });

  it("today itself is never one of the next days", () => {
    const days = nextDays({ weekEntries: [booking("a", "c1", TODAY), booking("b", "c1", "2026-09-21")], changesByDay: {}, momentsByDay: {}, hotClientIds: new Set(), clients: [], today: TODAY, tz: TZ });
    expect(days.some((d) => d.day === TODAY)).toBe(false);
    expect(days.map((d) => [d.day, d.booked])).toEqual([
      ["2026-09-20", 0],
      ["2026-09-21", 1],
      ["2026-09-22", 0],
    ]);
  });
});

describe("notBookedAhead", () => {
  const snap = (over: Record<string, unknown>) => ({ situation: "on-track", flags: [], lastVisitDate: null, ...over });
  it("counts live clients the nightly job flagged, most recently seen first", () => {
    const r = notBookedAhead([
      client("a", "Ann", { renewal: snap({ flags: [{ code: "no-future-booking", text: "x" }], lastVisitDate: "2026-09-10" }) }),
      client("b", "Bea", { renewal: snap({ flags: [{ code: "no-future-booking", text: "x" }], lastVisitDate: "2026-09-15" }) }),
      client("c", "Cal", { renewal: snap({ flags: [] }) }),
      client("d", "Dee", { renewal: snap({ situation: "away", flags: [{ code: "no-future-booking", text: "x" }] }) }),
      client("e", "Eve", { isActive: false, renewal: snap({ flags: [{ code: "no-future-booking", text: "x" }] }) }),
    ]);
    expect(r.count).toBe(2);
    expect(r.measured).toBe(3);
    expect(r.rows.map((x) => [x.name, x.proof])).toEqual([
      ["Bea T", "Last visit Sep 15."],
      ["Ann T", "Last visit Sep 10."],
    ]);
  });
});
