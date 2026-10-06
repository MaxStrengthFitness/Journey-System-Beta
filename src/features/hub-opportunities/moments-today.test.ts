/**
 * Moments today: every rule asked about the SELECTED day, the one milestone
 * list, the noise caps, and "can't tell" never passed off as a fact. Run with
 * TZ=America/New_York.
 */
import { describe, expect, it } from "vitest";
import type { Client, ScheduleEntry } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
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

  it("only the cache has answered: a finished session in hand still counts and is done, a gap is unknown (speed round R16)", () => {
    // Her 99th finished this morning and the cache holds it: the count already has it, so #99, never a false "100th today".
    const done = makeClient({ id: "c", sessionCount: 99, ...COMPLETE });
    const quiet = makeClient({ id: "q", sessionCount: 40, ...COMPLETE });
    const schedules = [makeBooking({ clientId: "c", start: today("09:00") }), makeBooking({ clientId: "q", start: today("09:30") })];
    const cacheOnly = loggedSessions([makeSession({ clientId: "c", at: today("09:05") })], undefined, { complete: false });
    const entries = run([done, quiet], schedules, { logged: cacheOnly });
    const c = entries.find((e) => e.clientId === "c")!;
    expect(c.sessionNumber).toBe(99);
    expect(c.stateText).toBe("done");
    expect(kinds(c)).not.toContain("milestone");
    // What the Hub said before the fix, with nothing in hand: a confident wrong number.
    const blind = run([done, quiet], schedules, { logged: null });
    expect(blind.find((e) => e.clientId === "c")!.sessionNumber).toBe(100);
    // Nothing in hand for the 9:30: unknown, never "not logged", until the server answers.
    expect(entries.find((e) => e.clientId === "q")!.stateText).toBeNull();
    const known = run([done, quiet], schedules, { logged: loggedSessions([makeSession({ clientId: "c", at: today("09:05") })]) });
    expect(known.find((e) => e.clientId === "q")!.stateText).toBe("not logged");
  });

  it("a migrating client is numbered from Mindbody's guess, but no milestone is claimed off it (Atlas answers, Oct 2 2026)", () => {
    // 400 visits before Journey (no Journey session yet) + 99 = 499 so far: this booking is the 500th.
    const entries = run([makeClient({ id: "m", sessionCount: 99, clientsNumberOfVisitsAtSite: 400 })], [makeBooking({ clientId: "m", start: today("16:00") })]);
    expect(entries[0].sessionNumber).toBe(500);
    expect(entries[0].sessionBasis).toBe("mindbody");
    expect(kinds(entries[0])).toEqual([]);
    expect(entries[0].facts.sessions).toMatchObject({ unknown: false, sentence: "#500 \u00b7 from Mindbody, not yet confirmed" });
  });

  it("with no guess at all, only Journey's own number, and it says so: #6 in Journey", () => {
    const entries = run([makeClient({ id: "j", sessionCount: 5 })], [makeBooking({ clientId: "j", start: today("16:00") })]);
    expect(entries[0].sessionNumber).toBeNull();
    expect(entries[0].sessionBasis).toBe("journey-only");
    expect(entries[0].journeyNumber).toBe(6);
    expect(entries[0].facts.sessions).toMatchObject({ unknown: true, sentence: "#6 in Journey" });
  });

  it("once a trainer confirms the before-Journey count, the milestone is claimed", () => {
    const prior = { sessions: 450, through: "2026-09-01", source: "mindbody" as const };
    const entries = run([makeClient({ id: "c", sessionCount: 499, priorHistory: prior } as Partial<Client> & { id: string })], [makeBooking({ clientId: "c", start: today("16:00") })]);
    expect(entries[0].sessionNumber).toBe(500);
    expect(entries[0].sessionBasis).toBe("confirmed");
    expect(kinds(entries[0])).toContain("milestone");
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

  // Auto-renewal (Oct 1 2026): the Run-sheet reads her renewal through
  // renewalOf, so a trainer's "not on auto-renewal" mark on the profile stops
  // the before-the-charge talk at once, as on the Hub card and the Wrap-up.
  it("a before-the-charge renewal follows the profile's auto-renewal mark", () => {
    const warning = {
      version: 2,
      cycleKey: "9001",
      clientContractId: "9001",
      situation: "will-bank",
      paymentMode: "monthly",
      chargeDate: "2026-10-20",
      bankedAtCharge: 16,
      sessionsLeft: 30,
      chargeWarning: true,
      conversationDue: false,
      renewalOnBooks: null,
      autoRenews: true,
      autoRenewsFrom: "studio",
      autoRenewsInherited: { renews: true, from: "studio" },
      flags: [],
      dataGaps: [],
    } as never;
    const booking = [makeBooking({ clientId: "c", start: today("16:00") })];
    const renews = run([makeClient({ id: "c", renewal: warning })], booking);
    expect(renews[0].moments.find((m) => m.family === "renew")?.sentence).toBe(
      "Auto-renews with about 16 sessions banked. Talk about it today?",
    );
    const marked = makeClient({
      id: "c",
      renewal: warning,
      autoRenewMark: { renews: false, contractId: "9001", setAt: "2026-09-25T14:00:00.000Z" },
    });
    expect(run([marked], booking)[0].moments.some((m) => m.family === "renew")).toBe(false);
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

describe("Get to know: the ✎ Ask about from FORD (wave 2 hub)", () => {
  const fordDetail = (clientId: string, over: Partial<FordEntry> = {}): FordEntry =>
    ({
      id: `ford-${clientId}`,
      clientId,
      studioId: "westlake",
      pillar: "family",
      body: "Her granddaughter's recital on Thursday.",
      subject: "the recital",
      isPinned: false,
      eventDate: eastern("2026-10-01", "00:00"),
      recurrence: "none",
      opportunity: null,
      occurredAt: eastern("2026-09-10", "09:00"),
      isArchived: false,
      ...over,
    }) as FordEntry;
  const fordFor = (byClient: Record<string, FordEntry[]>) => (id: string) => byClient[id] ?? [];

  it("is the last family in the Key's order, the chip and the sentence the trainer's words, the label only 'Something to ask about'", () => {
    const busy = makeClient({ id: "b", sessionCount: 99, ...COMPLETE, renewal: { situation: "on-track", conversationDue: true, chargeWarning: false, renewalOnBooks: null, sessionsLeft: 2 } as never });
    const [entry] = run([busy], [makeBooking({ clientId: "b", start: today("16:00") })], { fordFor: fordFor({ b: [fordDetail("b")] }) });
    expect(entry.moments.map((m) => m.family)).toEqual(["celebrate", "renew", "get-to-know"]);
    expect(entry.moments[2]).toEqual({
      family: "get-to-know",
      kind: "ask-about",
      chip: "Ask: the recital · Thu",
      sentence: "Ask about: Her granddaughter's recital on Thursday — Thursday, Oct 1 (Family, noted Sep 10).",
      words: "Something to ask about",
      loudness: "standard",
    });
    expect(entry.askUnknown).toBe(false);
    expect(filterCounts([entry])["get-to-know"]).toBe(1);
  });

  it("is asked about the booking's day: the day after the recital, how it went; ten days after, nothing", () => {
    const client = makeClient({ id: "r" });
    const byClient = fordFor({ r: [fordDetail("r")] });
    const friday = run([client], [makeBooking({ clientId: "r", start: eastern("2026-10-02", "09:00") })], { day: "2026-10-02", fordFor: byClient });
    expect(kinds(friday[0])).toContain("ask-about");
    expect(friday[0].moments.find((m) => m.kind === "ask-about")?.sentence).toMatch(/^Ask how it went: /);
    const later = run([client], [makeBooking({ clientId: "r", start: eastern("2026-10-11", "09:00") })], { day: "2026-10-11", fordFor: byClient });
    expect(kinds(later[0])).not.toContain("ask-about");
  });

  it("an unknown FORD says so on the entry and claims nothing; with no read at all, nothing either way", () => {
    const client = makeClient({ id: "u" });
    const booking = [makeBooking({ clientId: "u", start: today("16:00") })];
    const unknown = run([client], booking, { fordFor: () => null });
    expect(unknown[0].askUnknown).toBe(true);
    expect(kinds(unknown[0])).toEqual([]);
    const noRead = run([client], booking);
    expect(noRead[0].askUnknown).toBe(false);
  });

  it("asks only a booked client's own details", () => {
    const entries = run([makeClient({ id: "a" }), makeClient({ id: "z" })], [makeBooking({ clientId: "a", start: today("16:00") })], {
      fordFor: fordFor({ z: [fordDetail("z")] }),
    });
    expect(entries.map((e) => e.clientId)).toEqual(["a"]);
    expect(kinds(entries[0])).toEqual([]);
  });
});

describe("All stars: the nightly marks' word on the Sessions sort (wave 2 hub)", () => {
  const star = (clientId: string, weeksIn = 25, perWeek = 2) => ({ clientId, weeksIn, perWeek });
  const allStarOf = (...ids: string[]) => (id: string) => (ids.includes(id) ? star(id) : null);

  it("gets her own section after Regulars, with her number and her weeks; everyone else keeps theirs", () => {
    const entries = run(
      [makeClient({ id: "a", sessionCount: 263, ...COMPLETE }), makeClient({ id: "r", sessionCount: 120, ...COMPLETE }), makeClient({ id: "b", sessionCount: 20, ...COMPLETE })],
      [makeBooking({ clientId: "a", start: today("15:00") }), makeBooking({ clientId: "r", start: today("15:30") }), makeBooking({ clientId: "b", start: today("16:00") })],
      { allStarOf: allStarOf("a") },
    );
    const a = entries.find((e) => e.clientId === "a")!;
    expect(a.allStar).toEqual({ weeksIn: 25, perWeek: 2, words: "All star: in 25 of the last 26 weeks, about twice a week." });
    expect(a.facts.sessions).toMatchObject({ sentence: "#264 · in 25 of the last 26 weeks", bucket: "all-stars", unknown: false });
    expect(runSections(entries, "sessions").map((s) => [s.label, s.entries.map((e) => e.clientId)])).toEqual([
      ["Building (4–49)", ["b"]],
      ["Regulars (50+)", ["r"]],
      ["All stars", ["a"]],
    ]);
    expect(entries.find((e) => e.clientId === "r")!.allStar).toBeNull();
  });

  it("a milestone today keeps its own section; she is still an all star in the peek", () => {
    const [entry] = run([makeClient({ id: "a", sessionCount: 99, ...COMPLETE })], [makeBooking({ clientId: "a", start: today("15:00") })], { allStarOf: allStarOf("a") });
    expect(entry.facts.sessions.bucket).toBe("milestone");
    expect(entry.allStar?.words).toBe("All star: in 25 of the last 26 weeks, about twice a week.");
  });

  it("stands where her total can't be quoted: the job's claim is about the 26 weeks Journey holds", () => {
    const [entry] = run([makeClient({ id: "m", sessionCount: 99 })], [makeBooking({ clientId: "m", start: today("15:00") })], {
      allStarOf: allStarOf("m"),
    });
    expect(entry.sessionNumber).toBeNull();
    expect(entry.facts.sessions).toMatchObject({ sentence: "In 25 of the last 26 weeks", bucket: "all-stars", unknown: false, value: null });
  });

  it("with no marks (missing, stale, unreadable), nobody is one and nothing is said", () => {
    const [entry] = run([makeClient({ id: "a", sessionCount: 263, ...COMPLETE })], [makeBooking({ clientId: "a", start: today("15:00") })]);
    expect(entry.allStar).toBeNull();
    expect(entry.facts.sessions.bucket).toBe("regulars");
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
