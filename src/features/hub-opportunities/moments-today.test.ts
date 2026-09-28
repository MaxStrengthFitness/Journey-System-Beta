/**
 * Moments today: every rule asked about the SELECTED day, the one milestone
 * list, the noise caps, and "can't tell" never passed off as a fact. Run with
 * TZ=America/New_York.
 */
import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { loggedSessions } from "../../lib/booking-state";
import { buildDirectoryRows } from "../client-directory/row";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient, makeContext, makeSession } from "../client-directory/fixtures";
import {
  birthdayFrom,
  filterCounts,
  momentsToday,
  rowChips,
  runSections,
  type MomentsTodayInput,
  type RunSheetEntry,
} from "./moments-today";

const COMPLETE = { clientsNumberOfVisitsAtSite: 2 };

function run(clients: Client[], schedules: ScheduleEntry[], over: Partial<MomentsTodayInput> = {}): RunSheetEntry[] {
  const ctx = makeContext({ schedules });
  const rows = buildDirectoryRows(clients, ctx);
  return momentsToday({
    day: TODAY,
    today: TODAY,
    now: NOW,
    tz: "America/New_York",
    schedules,
    clientsById: new Map(clients.map((c) => [c.id as string, c])),
    rowsById: new Map(rows.map((r) => [r.id, r])),
    studios: STUDIOS,
    logged: loggedSessions([]),
    criticalFor: () => [],
    myIds: ["t-me"],
    myName: "Sam Rivera",
    trainerNameOf: (id) => ({ "t-ana": "Ana Lopez", "t-pip": "Pippin Took" })[id] ?? null,
    ...over,
  });
}

const kinds = (e: RunSheetEntry | undefined) => (e?.moments ?? []).map((m) => m.kind);
const today = (hhmm: string) => eastern(TODAY, hhmm);

describe("one row per client booked that day", () => {
  it("folds her two bookings into one, skips Unavailable, keeps an unlinked booking by its name", () => {
    const entries = run(
      [makeClient({ id: "a", firstName: "Ruth", lastName: "Alvarez" })],
      [
        makeBooking({ clientId: "a", start: today("16:00") }),
        makeBooking({ clientId: "a", start: today("17:00") }),
        makeBooking({ clientId: "", clientName: "Staff Unavailable", start: today("15:00") }),
        makeBooking({ clientId: "", clientName: "Walter Brennan-Okafor", start: today("15:30") }),
        makeBooking({ clientId: "a", start: eastern("2026-09-28", "09:00") }),
      ],
    );
    expect(entries.map((e) => e.name)).toEqual(["Walter Brennan-Okafor", "Ruth Alvarez"]);
    expect(entries[1].timeText).toBe("4:00 \u2013 4:30 PM");
  });
});

describe("milestones: Operations' one list, only when the total may be quoted", () => {
  it("the 100th today is a milestone; the 25th is not", () => {
    const entries = run(
      [
        makeClient({ id: "c100", sessionCount: 99, ...COMPLETE }),
        makeClient({ id: "c25", sessionCount: 24, ...COMPLETE }),
      ],
      [makeBooking({ clientId: "c100", start: today("16:00") }), makeBooking({ clientId: "c25", start: today("16:30") })],
    );
    const c100 = entries.find((e) => e.clientId === "c100")!;
    expect(c100.sessionNumber).toBe(100);
    expect(c100.moments.find((m) => m.kind === "milestone")).toMatchObject({ family: "celebrate", chip: "100th today" });
    expect(c100.facts.sessions).toMatchObject({ sentence: "100th session today", bucket: "milestone" });
    expect(kinds(entries.find((e) => e.clientId === "c25"))).not.toContain("milestone");
  });

  it("a later day counts her bookings in between (count + i + 1)", () => {
    const client = makeClient({ id: "c", sessionCount: 98, ...COMPLETE });
    const schedules = [makeBooking({ clientId: "c", start: eastern("2026-09-28", "09:00") }), makeBooking({ clientId: "c", start: eastern("2026-09-29", "09:00") })];
    const tuesday = run([client], schedules, { day: "2026-09-29" });
    expect(tuesday[0].sessionNumber).toBe(100);
    expect(tuesday[0].moments.find((m) => m.kind === "milestone")?.chip).toBe("100th");
    const monday = run([client], schedules, { day: "2026-09-28" });
    expect(monday[0].sessionNumber).toBe(99);
  });

  it("a session already logged today is already in the count", () => {
    const client = makeClient({ id: "c", sessionCount: 100, ...COMPLETE });
    const entries = run([client], [makeBooking({ clientId: "c", start: today("09:00") })], {
      logged: loggedSessions([makeSession({ clientId: "c", at: today("09:05") })]),
    });
    expect(entries[0].sessionNumber).toBe(100);
    expect(entries[0].stateText).toBe("done");
  });

  it("a migrating client is never numbered: no milestone, no New, Can't tell yet", () => {
    const entries = run([makeClient({ id: "m", sessionCount: 99, clientsNumberOfVisitsAtSite: 400 })], [makeBooking({ clientId: "m", start: today("16:00") })]);
    expect(entries[0].sessionNumber).toBeNull();
    expect(kinds(entries[0])).toEqual([]);
    expect(entries[0].facts.sessions).toMatchObject({ unknown: true, sentence: "Total not recorded yet" });
  });
});

describe("welcome", () => {
  it("a consultation, an early session and a first time with this trainer", () => {
    const entries = run(
      [
        makeClient({ id: "consult", requiresConsultation: true }),
        makeClient({ id: "second", sessionCount: 1, ...COMPLETE, trainerTally: { "t-ana": 1 } }),
        makeClient({ id: "newtrainer", sessionCount: 7, historyIsComplete: true, trainerTally: { "t-ana": 7 } }),
      ],
      [
        makeBooking({ clientId: "consult", start: today("15:00"), serviceName: "Consultation" }),
        makeBooking({ clientId: "second", start: today("15:30"), trainerId: "t-ana" }),
        makeBooking({ clientId: "newtrainer", start: today("16:00"), trainerId: "t-pip" }),
      ],
    );
    const by = (id: string) => entries.find((e) => e.clientId === id);
    expect(by("consult")?.moments[0]).toMatchObject({ family: "welcome", kind: "consult" });
    expect(by("second")?.moments.find((m) => m.kind === "early-session")?.chip).toBe("2nd session");
    expect(by("second")?.moments.some((m) => m.kind === "first-with-trainer")).toBe(false);
    expect(by("newtrainer")?.moments.find((m) => m.kind === "first-with-trainer")?.chip).toBe("First with Pippin");
  });

  it("back after a break is missed sessions at her own pace, claimed only where Journey owns the gap", () => {
    const pace = { renewal: { pacePerWeek: 2 } as never };
    const entries = run(
      [
        makeClient({ id: "back", ...COMPLETE, lastSessionDate: "2026-08-23", ...pace }),
        makeClient({ id: "nopace", ...COMPLETE, lastSessionDate: "2026-08-23" }),
        // Partial history, last visit before the studio's cutover: FileMaker may hold the visits since.
        makeClient({ id: "unowned", clientsNumberOfVisitsAtSite: 300, lastSessionDate: "2026-08-10", ...pace }),
      ],
      ["back", "nopace", "unowned"].map((id, i) => makeBooking({ clientId: id, start: today(`1${5 + i}:00`) })),
    );
    const by = (id: string) => entries.find((e) => e.clientId === id)!;
    expect(by("back").facts.lastSeen).toMatchObject({ bucket: "back", sentence: "Back after 5 weeks \u2014 missed about 9" });
    expect(by("back").moments.find((m) => m.kind === "back")?.chip).toBe("Back after 5 wk");
    expect(by("nopace").facts.lastSeen).toMatchObject({ bucket: "usual", sentence: "Last in Aug 23 (35 days)" });
    expect(kinds(by("nopace"))).not.toContain("back");
    expect(kinds(by("unowned"))).not.toContain("back");
  });
});

describe("birthdays, on the day on screen", () => {
  it("counts either side of the day, and says turns N only with a year", () => {
    expect(birthdayFrom("1946-10-01", TODAY)).toMatchObject({ nearest: 4, next: 4, turnsAtNext: 80 });
    expect(birthdayFrom("1946-09-24", TODAY)).toMatchObject({ nearest: -3, next: 362 });
    expect(birthdayFrom("1899-10-01", TODAY)?.turnsAtNext).toBeNull();
  });

  it("Sunday sees Thursday's 80th coming; Thursday sees it today", () => {
    const client = makeClient({ id: "r", dateOfBirth: "1946-10-01" });
    const sunday = run([client], [makeBooking({ clientId: "r", start: today("16:00") })]);
    expect(sunday[0].moments.find((m) => m.kind === "birthday")).toMatchObject({ family: "celebrate", chip: "Turns 80 Thu" });
    expect(sunday[0].facts.birthday).toMatchObject({ bucket: "week", sentence: "turns 80 \u00b7 Thu Oct 1" });
    const thursday = run([client], [makeBooking({ clientId: "r", start: eastern("2026-10-01", "09:00") })], { day: "2026-10-01" });
    expect(thursday[0].moments.find((m) => m.kind === "birthday")?.chip).toBe("Turns 80 today");
    expect(thursday[0].facts.birthday).toMatchObject({ bucket: "today", sentence: "Turns 80 today" });
  });

  it("no year on file: a birthday, never an age", () => {
    const entries = run([makeClient({ id: "r", dateOfBirth: "1899-09-29" })], [makeBooking({ clientId: "r", start: today("16:00") })]);
    expect(entries[0].moments.find((m) => m.kind === "birthday")?.chip).toBe("Birthday Tue");
    expect(entries[0].facts.birthday.sentence).not.toMatch(/turn/i);
  });
});

describe("read first, watch and renew", () => {
  const critical = {
    id: "n1",
    clientId: "c",
    body: "No overhead until cleared",
    importance: "critical",
    threadId: null,
    occurredAt: new Date("2026-09-21T16:00:00Z"),
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    resolvedAt: null,
    isArchived: false,
  } as unknown as JournalEntry;

  it("the Hub's own Critical read lights Read first; an unread client claims nothing", () => {
    const client = makeClient({ id: "c" });
    const read = run([client], [makeBooking({ clientId: "c", start: today("16:00") })], { criticalFor: () => [critical] });
    expect(read[0].moments[0]).toMatchObject({ family: "read-first", sentence: "Read first: Critical: No overhead until cleared" });
    const unread = run([client], [makeBooking({ clientId: "c", start: today("16:00") })], { criticalFor: () => null });
    expect(unread[0].criticalUnknown).toBe(true);
    expect(kinds(unread[0])).toEqual([]);
  });

  it("a red Pulse flag is Watch; a due renewal speaks in the Wrap-up's words", () => {
    const client = makeClient({
      id: "c",
      subjectiveSnapshot: { flags: [{ severity: "red", label: "Sleep" }] } as never,
      renewal: { situation: "on-track", conversationDue: true, chargeWarning: false, renewalOnBooks: null, sessionsLeft: 3 } as never,
    });
    const entries = run([client], [makeBooking({ clientId: "c", start: today("16:00") })]);
    expect(entries[0].moments.find((m) => m.family === "watch")?.sentence).toBe("Pulse: Sleep");
    expect(entries[0].moments.find((m) => m.family === "renew")?.sentence).toBe("Renewal: 3 left. Talk about it today?");
  });
});

describe("noise rules", () => {
  const busy = makeClient({
    id: "b",
    sessionCount: 99,
    ...COMPLETE,
    dateOfBirth: "1946-10-01",
    subjectiveSnapshot: { flags: [{ severity: "red", label: "Knee" }] } as never,
    renewal: { situation: "on-track", conversationDue: true, chargeWarning: false, renewalOnBooks: null, sessionsLeft: 2 } as never,
    requiresConsultation: true,
  });

  it("at most three chips, Read first first, never the sorted fact", () => {
    const [entry] = run([busy], [makeBooking({ clientId: "b", start: today("16:00") })], { criticalFor: () => [{ ...({} as JournalEntry), id: "x", clientId: "b", importance: "critical", body: "Hip", occurredAt: new Date("2026-09-20T12:00:00Z") } as JournalEntry] });
    expect(entry.moments.map((m) => m.family)).toEqual(["read-first", "watch", "welcome", "celebrate", "celebrate", "renew"]);
    const byTime = rowChips(entry, "time");
    expect(byTime).toHaveLength(3);
    expect(byTime[0].family).toBe("read-first");
    expect(rowChips(entry, "birthday").some((m) => m.kind === "birthday")).toBe(false);
    expect(rowChips(entry, "left").some((m) => m.kind === "renew")).toBe(false);
  });

  it("filter counts, and Can't tell yet folded last", () => {
    const entries = run(
      [busy, makeClient({ id: "q", clientsNumberOfVisitsAtSite: 400 })],
      [makeBooking({ clientId: "b", start: today("16:00") }), makeBooking({ clientId: "q", start: today("16:30") })],
    );
    expect(filterCounts(entries)).toMatchObject({ all: 2, "read-first": 0, watch: 1, welcome: 1, celebrate: 1, renew: 1 });
    const sections = runSections(entries, "sessions");
    expect(sections.map((s) => [s.label, s.entries.length, s.folded])).toEqual([
      ["Milestone", 1, false],
      ["Can\u2019t tell yet", 1, true],
    ]);
  });

  it("time sections for today, with the finished folded", () => {
    const entries = run(
      [makeClient({ id: "done" }), makeClient({ id: "soon" }), makeClient({ id: "late" })],
      [
        makeBooking({ clientId: "done", start: today("09:00") }),
        makeBooking({ clientId: "soon", start: today("14:20") }),
        makeBooking({ clientId: "late", start: today("17:00") }),
      ],
    );
    expect(runSections(entries, "time").map((s) => [s.label, s.folded])).toEqual([
      ["Now and the next 30 min", false],
      ["Later today", false],
      ["Earlier today", true],
    ]);
  });
});

describe("the waiver: Mindbody's \"nw\" corner (AJ, Sep 28 2026)", () => {
  const PRIORITY = "Left shoulder: no overhead press";
  const PULSE = "Sleep & Recovery is Red";

  it("a definite 'not signed' is a Watch moment, second only to Read first, before the Pulse flag", () => {
    const entries = run(
      [
        makeClient({
          id: "w",
          isLiabilityReleased: false,
          priorityNote: PRIORITY,
          subjectiveSnapshot: { flags: [{ severity: "red", label: PULSE }] },
        } as Partial<Client> & { id: string }),
      ],
      [makeBooking({ clientId: "w", start: today("16:00") })],
    );
    expect(kinds(entries[0])).toEqual(["critical", "waiver", "pulse"]);
    expect(entries[0].moments[1]).toMatchObject({ family: "watch", chip: "No waiver signed", words: "No waiver signed" });
    // The card labels its triangle and glyphs with the mark's own words, whole.
    expect(entries[0].moments[0].words).toBe(PRIORITY);
    expect(entries[0].moments[2].words).toBe(PULSE);
    expect(filterCounts(entries).watch).toBe(1);
  });

  it("signed, or never synced, says nothing: absent is 'we haven't asked', not 'no'", () => {
    for (const isLiabilityReleased of [true, undefined, null]) {
      const entries = run([makeClient({ id: "s", isLiabilityReleased } as Partial<Client> & { id: string })], [makeBooking({ clientId: "s", start: today("16:00") })]);
      expect(kinds(entries[0])).not.toContain("waiver");
    }
  });
});

describe("clinical history is standing context, never a mark", () => {
  it("rides on the entry for the peek and the opened row, and is not among the moments or the filters", () => {
    const entries = run([makeClient({ id: "h", clinicalNotes: "Hip replacement, 2024" } as Partial<Client> & { id: string })], [makeBooking({ clientId: "h", start: today("16:00") })]);
    expect(entries[0].clinicalOnFile).toBe(true);
    expect(entries[0].moments).toEqual([]);
    const plain = run([makeClient({ id: "p" })], [makeBooking({ clientId: "p", start: today("16:00") })]);
    expect(plain[0].clinicalOnFile).toBe(false);
  });
});
