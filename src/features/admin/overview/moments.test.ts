import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import type { DelightRow } from "../../ford/useClientFord";
import { moments, momentsByDay } from "./moments";

const TZ = "America/New_York";
const TODAY = "2026-09-19"; // Saturday
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);
const eod = (day: string) => new Date(`${day}T23:59:59-04:00`);

const client = (id: string, name: string, over: Partial<Client> = {}): Client => ({ id, firstName: name, lastName: "T", isActive: true, ...over }) as unknown as Client;

const booking = (id: string, clientId: string, day: string, hm = "10:00"): ScheduleEntry =>
  ({ id, clientId, clientName: "x", trainerName: "Tom", studioId: "s1", startTime: new Date(`${day}T${hm}:00-04:00`), endTime: null, status: "Scheduled", serviceName: "", source: "MindBody", createdAt: null }) as ScheduleEntry;

const gesture = (id: string, clientId: string, day: string, over: Partial<NonNullable<DelightRow["entry"]["opportunity"]>> = {}): DelightRow =>
  ({
    entry: { id, clientId, studioId: "s1", pillar: "family", body: "Anniversary at Giovanni's", subject: null, isPinned: false, eventDate: null, recurrence: "none", opportunity: { idea: "Cover the dinner", status: "idea", ownerTrainerId: null, ownerName: null, plannedFor: null, doneAt: null, outcome: null, ...over } },
    when: noon(day),
    daysAway: 0,
  }) as unknown as DelightRow;

describe("moments — gestures", () => {
  it("lists a gesture due this week and whether anyone owns it", () => {
    const m = moments({ delight: [gesture("g1", "a", "2026-09-22"), gesture("g2", "b", "2026-09-23", { ownerName: "Sam", status: "planned" })], datedNotes: [], clients: [client("a", "Ann"), client("b", "Bea")], weekEntries: [], today: TODAY, tz: TZ });
    expect(m.gestures).toBe(2);
    expect(m.gesturesUnowned).toBe(1);
    expect(m.rows.map((r) => [r.name, r.day, r.proof])).toEqual([
      ["Ann T", "2026-09-22", "Needs an owner."],
      ["Bea T", "2026-09-23", "Sam has it — planned."],
    ]);
  });
  it("leaves out gestures beyond the week, undated ones, and done ones", () => {
    const m = moments({
      delight: [gesture("far", "a", "2026-10-15"), { ...gesture("undated", "a", "2026-09-20"), when: null, daysAway: null }, gesture("done", "a", "2026-09-20", { status: "done", ownerName: "Sam" })],
      datedNotes: [],
      clients: [client("a", "Ann")],
      weekEntries: [],
      today: TODAY,
      tz: TZ,
    });
    expect(m.rows).toHaveLength(0);
  });
});

describe("moments — dates", () => {
  it("a birthday note shows on its next occurrence, with who wrote it", () => {
    const bday = { id: "n1", clientId: "a", importance: "standard", body: "Birthday — brings the good coffee", occurredAt: noon("2025-01-01"), effectiveFrom: noon("2025-09-24"), effectiveUntil: eod("2025-09-24"), repeat: "yearly", resolvedAt: null, isArchived: false, authorName: "Sam" } as unknown as JournalEntry;
    const m = moments({ delight: [], datedNotes: [bday], clients: [client("a", "Ann")], weekEntries: [], today: TODAY, tz: TZ });
    expect(m.dates).toBe(1);
    expect(m.rows[0]).toMatchObject({ kind: "date", day: "2026-09-24", sentence: "Birthday — brings the good coffee", proof: "Only on Sep 24, every year — noted by Sam." });
  });
  it("a range note is not a moment", () => {
    const range = { id: "n2", clientId: "a", importance: "elevated", body: "Away", occurredAt: noon("2026-09-01"), effectiveFrom: null, effectiveUntil: eod("2026-09-22"), resolvedAt: null, isArchived: false } as unknown as JournalEntry;
    expect(moments({ delight: [], datedNotes: [range], clients: [client("a", "Ann")], weekEntries: [], today: TODAY, tz: TZ }).rows).toHaveLength(0);
  });
});

describe("moments — milestones", () => {
  it("a 100th session this week, when the total may be quoted", () => {
    const c = client("a", "Ann", { sessionCount: 99, historyIsComplete: true });
    const m = moments({ delight: [], datedNotes: [], clients: [c], weekEntries: [booking("b1", "a", "2026-09-22", "14:00")], today: TODAY, tz: TZ });
    expect(m.milestones).toBe(1);
    expect(m.rows[0]).toMatchObject({ kind: "milestone", day: "2026-09-22", sentence: "Their 100th session." });
    expect(m.rows[0].proof).toBe("Booked Tue, Sep 22 2:00 PM with Tom. 99 so far.");
  });
  it("counts the second booking of the week as the next session", () => {
    const c = client("a", "Ann", { sessionCount: 48, priorHistory: { sessions: 40, importedCount: 0, through: "2026-08-31", source: "filemaker" } });
    const m = moments({ delight: [], datedNotes: [], clients: [c], weekEntries: [booking("b1", "a", "2026-09-21"), booking("b2", "a", "2026-09-24")], today: TODAY, tz: TZ });
    expect(m.rows.map((r) => [r.day, r.sentence])).toEqual([["2026-09-24", "Their 50th session."]]);
    expect(m.rows[0].proof).toContain("earlier sessions counted from the record");
  });
  it("never claims a milestone off an unknown history", () => {
    const c = client("a", "Ann", { sessionCount: 99 });
    expect(moments({ delight: [], datedNotes: [], clients: [c], weekEntries: [booking("b1", "a", "2026-09-22")], today: TODAY, tz: TZ }).rows).toHaveLength(0);
  });
  it("a year with the studio, from a Mindbody-backed first date, booked or not", () => {
    const c = client("a", "Ann", { firstSessionDate: "2024-09-23" });
    const m = moments({ delight: [], datedNotes: [], clients: [c], weekEntries: [], today: TODAY, tz: TZ });
    expect(m.rows[0]).toMatchObject({ kind: "milestone", day: "2026-09-23", sentence: "2 years with the studio." });
    expect(m.rows[0].proof).toContain("Not booked this week.");
  });
  it("a Journey createdAt is not a business date, so no anniversary comes from it", () => {
    const c = client("a", "Ann", { createdAt: "2025-09-23T12:00:00Z" });
    expect(moments({ delight: [], datedNotes: [], clients: [c], weekEntries: [], today: TODAY, tz: TZ }).rows).toHaveLength(0);
  });
});

describe("momentsByDay", () => {
  it("counts per day", () => {
    const m = moments({ delight: [gesture("g1", "a", "2026-09-22"), gesture("g2", "b", "2026-09-22")], datedNotes: [], clients: [client("a", "Ann"), client("b", "Bea")], weekEntries: [], today: TODAY, tz: TZ });
    expect(momentsByDay(m.rows)).toEqual({ "2026-09-22": 2 });
  });
});
