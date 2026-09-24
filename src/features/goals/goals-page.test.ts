import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import { assembleThreads, type NoteThread } from "../client-notes/threads";
import {
  HOW_TO_COACH_SHOWN,
  dayWords,
  firstParagraph,
  goalsGlance,
  goalsTabHint,
  herWhyLinks,
  howToCoachLead,
  howToCoachRows,
  reachedHeading,
  reachedShelf,
  smartLabel,
  smartSentence,
  targetLine,
  withoutOuterQuotes,
} from "./goals-page";

const TZ = "America/New_York";
const TODAY = "2027-03-16";
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "preference",
    category: null,
    body: "note",
    importance: "standard",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jess",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: noon("2027-03-01"),
    createdAt: noon("2027-03-01"),
    updatedAt: noon("2027-03-01"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const threadsOf = (...entries: JournalEntry[]): NoteThread[] => assembleThreads(entries);

const focus = (over: Partial<ClientFocus> & { id: string }): ClientFocus =>
  ({
    clientId: "c1",
    studioId: "westlake",
    trainerId: "uid-aj",
    trainerName: "AJ",
    trainerInitials: "AJ",
    category: "Pace",
    intent: "Slow the lower turnaround.",
    targetMachineId: null,
    status: "active",
    startedAt: noon("2027-03-02"),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: noon("2027-03-02"),
    updatedAt: noon("2027-03-02"),
    ...over,
  }) as ClientFocus;

const ford = (over: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    pillar: "dreams",
    body: "detail",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: noon("2027-01-10"),
    createdAt: noon("2027-01-10"),
    updatedAt: noon("2027-01-10"),
    authorId: "uid-aj",
    authorName: "AJ",
    authorInitials: "AJ",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...over,
  }) as FordEntry;

/* ------------------------------------------------------------------ */

describe("howToCoachLead", () => {
  const tips = threadsOf(
    entry({ id: "pref", kind: "preference", body: "Fan on, no music.", occurredAt: noon("2027-03-10") }),
    entry({
      id: "tip",
      kind: "coaching",
      category: "Pace",
      importance: "elevated",
      body: "She rushes the last rep. Count her into the turnaround.",
      occurredAt: noon("2027-02-01"),
    }),
  );

  it("quotes the first paragraph of the coach strategy, verbatim", () => {
    const strategy = "Sets up short on everything.\r\nTalk her through the first rep.\r\n\r\nShe goes quiet when working hard.";
    expect(howToCoachLead({ discoveryNotes: strategy, threads: [], notesState: "ready", today: TODAY, tz: TZ })).toEqual({
      kind: "strategy",
      text: "Sets up short on everything.\nTalk her through the first rep.",
      more: true,
    });
    // One paragraph and no notes: nothing more on Goals & Focus.
    expect(howToCoachLead({ discoveryNotes: "One line.", threads: [], notesState: "ready", today: TODAY, tz: TZ })).toEqual({
      kind: "strategy",
      text: "One line.",
      more: false,
    });
    // One paragraph, but coaching notes under it: there is more.
    expect(howToCoachLead({ discoveryNotes: "One line.", threads: tips, notesState: "ready", today: TODAY, tz: TZ })).toMatchObject({
      more: true,
    });
  });

  it("with no strategy, leads with her first coaching note — loudest first — whole, with who wrote it", () => {
    expect(howToCoachLead({ discoveryNotes: "  ", threads: tips, notesState: "ready", today: TODAY, tz: TZ })).toEqual({
      kind: "note",
      text: "She rushes the last rep. Count her into the turnaround.",
      author: "Jess",
      threadId: "tip",
      machineId: null,
      importance: "elevated",
      more: true,
    });
  });

  it("carries the note's machine and Loudness, and passes over a Critical note the red line already carries", () => {
    const critical = entry({
      id: "crit",
      kind: "coaching",
      category: "Pace",
      importance: "critical",
      machineId: "m-leg",
      body: "Stop at 90° at the bottom turn.",
      occurredAt: noon("2027-03-12"),
    });
    const machineTip = entry({
      id: "leg",
      kind: "coaching",
      category: "Pace",
      importance: "elevated",
      machineId: "m-leg",
      body: "Count the lower turnaround out loud.",
      occurredAt: noon("2027-03-01"),
    });
    const pref = entry({ id: "pref", kind: "preference", body: "Fan on, no music.", occurredAt: noon("2027-03-10") });
    // Critical sorts first in the list, but the lead is the Heads up tip — with its machine.
    expect(
      howToCoachLead({ discoveryNotes: "", threads: threadsOf(critical, machineTip, pref), notesState: "ready", today: TODAY, tz: TZ }),
    ).toEqual({
      kind: "note",
      text: "Count the lower turnaround out loud.",
      author: "Jess",
      threadId: "leg",
      machineId: "m-leg",
      importance: "elevated",
      more: true,
    });
    // Only a Critical coaching note: it leads, marked Critical — never "nothing written".
    expect(howToCoachLead({ discoveryNotes: "", threads: threadsOf(critical), notesState: "ready", today: TODAY, tz: TZ })).toEqual({
      kind: "note",
      text: "Stop at 90° at the bottom turn.",
      author: "Jess",
      threadId: "crit",
      machineId: "m-leg",
      importance: "critical",
      more: false,
    });
  });

  it("never says nothing is written while the notes are unknown", () => {
    expect(howToCoachLead({ discoveryNotes: "", threads: tips, notesState: "loading", today: TODAY, tz: TZ })).toEqual({
      kind: "unknown",
      state: "loading",
    });
    expect(howToCoachLead({ discoveryNotes: undefined, threads: [], notesState: "failed", today: TODAY, tz: TZ })).toEqual({
      kind: "unknown",
      state: "failed",
    });
    expect(howToCoachLead({ discoveryNotes: "", threads: [], notesState: "ready", today: TODAY, tz: TZ })).toEqual({ kind: "none" });
  });

  it("firstParagraph splits at a blank line only", () => {
    expect(firstParagraph("a\nb\n \nc")).toBe("a\nb");
    expect(firstParagraph("   ")).toBeNull();
    expect(firstParagraph(null)).toBeNull();
  });
});

describe("howToCoachRows", () => {
  it("lists Notes' own how-to-coach threads, in Notes' words and order", () => {
    const { rows, total } = howToCoachRows(
      threadsOf(
        entry({ id: "pref", kind: "preference", body: "Prefers “you owned that one” to numbers.", occurredAt: noon("2027-03-10") }),
        entry({ id: "tip", kind: "coaching", category: "Pace", importance: "critical", machineId: "m-leg", body: "Count the turnaround.", occurredAt: noon("2027-01-01") }),
        entry({ id: "heads", kind: "coaching", category: null, importance: "elevated", body: "Talk her through rep one.", occurredAt: noon("2027-02-01") }),
        // Left out: a focus check-in, an unfiled capture, a legacy wrap-up, a closed tip, an equipment note.
        entry({ id: "checkin", kind: "coaching", category: "Posture", focusId: "f1" }),
        entry({ id: "unfiled", kind: "general" }),
        entry({ id: "legacy:sessions:s1", kind: "general", isLegacy: true, origin: "legacy", legacySource: "Session summary" }),
        entry({ id: "closed", kind: "preference", resolvedAt: noon("2027-03-05") }),
        entry({ id: "equip", kind: "equipment" }),
      ),
      TODAY,
      TZ,
    );
    expect(total).toBe(3);
    expect(rows.map((r) => r.threadId)).toEqual(["tip", "heads", "pref"]);
    expect(rows[0]).toMatchObject({ label: "Pace", importance: "critical", loud: true, machineId: "m-leg", text: "Count the turnaround." });
    expect(rows[1]).toMatchObject({ label: "Coaching tip", loud: true });
    expect(rows[2]).toMatchObject({ label: "Preference", importance: "standard", loud: false });
  });

  it(`shows ${HOW_TO_COACH_SHOWN}, and counts them all`, () => {
    const many = Array.from({ length: 9 }, (_, i) => entry({ id: `p${i}`, body: `Preference ${i}` }));
    const { rows, total } = howToCoachRows(threadsOf(...many), TODAY, TZ);
    expect(rows).toHaveLength(HOW_TO_COACH_SHOWN);
    expect(total).toBe(9);
  });
});

/* ------------------------------------------------------------------ */

describe("herWhyLinks", () => {
  const client = (over: Partial<Client> = {}) =>
    ({ mindbodyIndexes: {}, goals: "", ...over }) as Pick<Client, "mindbodyIndexes" | "goals">;

  it("reads Mindbody's long-term goal under either spelling, verbatim", () => {
    expect(herWhyLinks({ client: client({ mindbodyIndexes: { LongtermGoal: "IncreasedFlexibility" } }), fordStatus: "ready", fordEntries: [] }).longTermGoal).toBe(
      "IncreasedFlexibility",
    );
    expect(herWhyLinks({ client: client({ mindbodyIndexes: { LongTermGoal: "Strength" } }), fordStatus: "ready", fordEntries: [] }).longTermGoal).toBe("Strength");
    expect(herWhyLinks({ client: client(), fordStatus: "ready", fordEntries: [] }).longTermGoal).toBeNull();
  });

  it("quotes the consultation and the sign-up lines once, without their own quote marks", () => {
    const links = herWhyLinks({
      client: client({ goals: "“Keep up with the grandkids.”" }),
      fordStatus: "ready",
      fordEntries: [],
      signUp: ['"Keep up w/ grandkids. Camino!"', "  "],
    });
    expect(links.consultation).toBe("Keep up with the grandkids.");
    expect(links.signUp).toEqual(["Keep up w/ grandkids. Camino!"]);
  });

  it("names her Dreams only from a FORD read that answered: a standing one first, else the newest", () => {
    const entries = [
      ford({ id: "moment", body: "Booked flights for the Camino.", occurredAt: noon("2027-03-01") }),
      ford({ id: "pinned", body: "The Camino with Tom.", isPinned: true, occurredAt: noon("2026-11-01") }),
      ford({ id: "old", body: "An old dream.", isPinned: true, isArchived: true, occurredAt: noon("2027-03-10") }),
      ford({ id: "done", body: "Done with it.", isPinned: true, resolvedAt: noon("2027-03-02"), occurredAt: noon("2027-03-09") }),
      ford({ id: "fam", pillar: "family", body: "Grandkids", isPinned: true }),
    ];
    expect(herWhyLinks({ client: client(), fordStatus: "ready", fordEntries: entries }).dreams).toEqual({
      status: "ok",
      text: "The Camino with Tom.",
    });
    expect(
      herWhyLinks({ client: client(), fordStatus: "ready", fordEntries: entries.filter((e) => e.id !== "pinned") }).dreams,
    ).toEqual({ status: "ok", text: "Booked flights for the Camino." });
    expect(herWhyLinks({ client: client(), fordStatus: "ready", fordEntries: [entries[4]] }).dreams).toEqual({ status: "none" });
  });

  it("never reads Dreams as none while FORD is loading, failed or kept by the home studio", () => {
    expect(herWhyLinks({ client: client(), fordStatus: "loading", fordEntries: [] }).dreams).toEqual({ status: "loading" });
    expect(herWhyLinks({ client: client(), fordStatus: "failed", fordEntries: [] }).dreams).toEqual({ status: "failed" });
    expect(herWhyLinks({ client: client(), fordStatus: "off", fordEntries: [] }).dreams).toEqual({ status: "home-only" });
    expect(herWhyLinks({ client: client(), fordStatus: "denied", fordEntries: [] }).dreams).toEqual({ status: "home-only" });
  });

  it("never reads the FORD lines copied onto the client document", () => {
    const withSummary = {
      ...client(),
      fordSummary: { pinned: { dreams: ["The Camino with Tom."] } },
    } as unknown as Pick<Client, "mindbodyIndexes" | "goals">;
    expect(herWhyLinks({ client: withSummary, fordStatus: "off", fordEntries: [] }).dreams).toEqual({ status: "home-only" });
    expect(herWhyLinks({ client: withSummary, fordStatus: "ready", fordEntries: [] }).dreams).toEqual({ status: "none" });
  });

  it("takes a matched pair of quote marks off, and only a pair", () => {
    expect(withoutOuterQuotes("“Walk the Camino.”")).toBe("Walk the Camino.");
    expect(withoutOuterQuotes("'garden again'")).toBe("garden again");
    expect(withoutOuterQuotes('"I want to garden" she said')).toBe('"I want to garden" she said');
    expect(withoutOuterQuotes(undefined)).toBe("");
  });

  it("never rewords her: marks that do not pair with each other are left exactly as typed", () => {
    // Two quotes, not one: the first mark's partner is not the last character.
    expect(withoutOuterQuotes('"Lose weight" and "get strong"')).toBe('"Lose weight" and "get strong"');
    expect(withoutOuterQuotes("“Lose weight” and “get strong”")).toBe("“Lose weight” and “get strong”");
    // A leading apostrophe is not an opening quote when another single sits inside.
    expect(withoutOuterQuotes("'Tis the season, I'm told'")).toBe("'Tis the season, I'm told'");
    // A double and a single are not a pair.
    expect(withoutOuterQuotes("\"garden again'")).toBe("\"garden again'");
    // A quote of the other family inside is hers, and stays.
    expect(withoutOuterQuotes("“She said 'go slow' to me”")).toBe("She said 'go slow' to me");
    expect(withoutOuterQuotes("“I’m in”")).toBe("I’m in");
    // Straight or curly, a double is a double.
    expect(withoutOuterQuotes("\"Keep up with the grandkids.”")).toBe("Keep up with the grandkids.");
    expect(withoutOuterQuotes("\"")).toBe("\"");
  });
});

/* ------------------------------------------------------------------ */

describe("the SMART words", () => {
  it("says how much is ticked in words, never a score", () => {
    expect(smartSentence({ s: true, m: true, a: true, r: true, t: true })).toBe("All five ticked");
    expect(smartSentence({ s: true, m: false, a: true, r: false, t: true })).toBe("3 of 5 ticked");
    expect(smartSentence(null)).toBe("Nothing ticked yet");
    expect(smartSentence(undefined)).toBe("Nothing ticked yet");
  });

  it("names the ticked letters for a screen reader", () => {
    expect(smartLabel({ s: true, m: false, a: false, r: false, t: true })).toBe("SMART checklist: Specific, Time-bound ticked, 2 of 5");
    expect(smartLabel({ s: true, m: true, a: true, r: true, t: true })).toContain("all five ticked");
  });

  it("says the target as a day and how far off it is", () => {
    expect(targetLine("2027-05-01", new Date(2027, 2, 20, 9))).toBe("May 1, 2027 · in 6 weeks");
    expect(targetLine("2027-03-17", new Date(2027, 2, 16, 9))).toBe("Mar 17, 2027 · tomorrow");
    expect(targetLine("", new Date(2027, 2, 16, 9))).toBe("");
    expect(targetLine("May 1", new Date(2027, 2, 16, 9))).toBe("");
  });
});

/* ------------------------------------------------------------------ */

describe("reachedShelf", () => {
  const saved = [
    { goal: "Walk 5 miles without stopping", achievedAt: "2027-01-23T03:30:00.000Z", reward: "dinner out with Tom", byName: "AJ" },
    { goal: "A full pickleball morning", achievedAt: "2026-11-05T15:00:00.000Z", targetDate: "2026-11-01", byName: "Jess" },
  ];

  it("merges goals and achieved focuses newest first, on the studio's day", () => {
    const rows = reachedShelf({
      current: saved,
      saved,
      focuses: [
        focus({ id: "f-pass", category: "Path", intent: "Knees tracking straight on Leg Press", status: "passed", startedAt: noon("2027-01-25"), achievedAt: noon("2027-02-20") }),
        focus({ id: "f-retired", status: "retired", retiredAt: noon("2027-03-01") }),
        focus({ id: "f-active" }),
      ],
      tz: TZ,
    });
    expect(rows.map((r) => r.key)).toEqual([
      "focus:f-pass",
      "goal:2027-01-23T03:30:00.000Z:0",
      "goal:2026-11-05T15:00:00.000Z:1",
    ]);
    expect(rows[0]).toMatchObject({ kind: "focus", title: "Path: Knees tracking straight on Leg Press", meta: "Focus · Feb 20, 2027 · 4 weeks · AJ" });
    // 03:30 UTC on the 23rd is the evening of the 22nd in the studio.
    expect(rows[1].meta).toBe("Goal · Jan 22, 2027 · reward: dinner out with Tom · marked by AJ");
    expect(rows[2].meta).toBe("Goal · Nov 5, 2026 · target was Nov 1, 2026 · marked by Jess");
    expect(rows.every((r) => !r.unsaved)).toBe(true);
  });

  it("flags a goal marked achieved in the form and not saved yet", () => {
    const fresh = { goal: "Walk 10 miles two days running", achievedAt: "2027-03-16T14:00:00.000Z" };
    const rows = reachedShelf({ current: [fresh, ...saved], saved, focuses: [], tz: TZ });
    expect(rows[0]).toMatchObject({ title: "Walk 10 miles two days running", unsaved: true });
    expect(rows.slice(1).every((r) => !r.unsaved)).toBe(true);
  });

  it("holds the goals only while the focuses are unknown, and the heading never says 0 focuses", () => {
    const rows = reachedShelf({ current: saved, saved, focuses: null, tz: TZ });
    expect(rows.every((r) => r.kind === "goal")).toBe(true);
    expect(reachedHeading(rows, false)).toBe("Reached · 2 goals");
    expect(reachedHeading([], true)).toBe("Reached");
    const both = reachedShelf({
      current: saved.slice(0, 1),
      saved,
      focuses: [focus({ id: "p", status: "passed", achievedAt: noon("2027-02-20") })],
      tz: TZ,
    });
    expect(reachedHeading(both, true)).toBe("Reached · 1 goal, 1 focus");
  });

  it("tolerates a history that is not a list", () => {
    expect(reachedShelf({ current: "nonsense", saved: null, focuses: [], tz: TZ })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe("goalsTabHint and goalsGlance", () => {
  it("counts running focuses, else says whether a goal is set", () => {
    expect(goalsTabHint({ running: 2, goal: "" })).toBe("2 focuses running");
    expect(goalsTabHint({ running: 1, goal: "" })).toBe("1 focus running");
    expect(goalsTabHint({ running: 0, goal: "Walk the Camino" })).toBe("a goal set");
    expect(goalsTabHint({ running: 0, goal: "  " })).toBe("no focus running");
  });

  it("gives the Overview its lines, and never counts focuses it has not read", () => {
    const client = {
      globalNotes: "“Keep up with my granddaughters.”",
      smartGoal: "Walk 10 miles two days running",
      goalTargetDate: "2027-05-01",
      goalHistory: [{ goal: "Walk 5 miles", achievedAt: "2027-01-23T03:30:00.000Z" }],
      discoveryNotes: "Sets up short on everything.",
    } as Pick<Client, "globalNotes" | "smartGoal" | "goalTargetDate" | "goalHistory" | "discoveryNotes">;
    const glance = goalsGlance({
      client,
      focuses: [
        focus({ id: "old", intent: "Chin tucked.", category: "Posture", trainerName: "Jess", startedAt: noon("2027-02-16") }),
        focus({ id: "new", startedAt: noon("2027-03-02") }),
        focus({ id: "p", status: "passed", achievedAt: noon("2027-02-20") }),
      ],
      threads: [],
      notesState: "ready",
      today: TODAY,
      tz: TZ,
    });
    expect(glance.why).toBe("Keep up with my granddaughters.");
    expect(glance.workingToward).toBe("Walk 10 miles two days running · target May 1, 2027");
    expect(glance.focusLine).toMatch(/^Pace: Slow the lower turnaround\. · AJ, /);
    expect(glance.coach).toEqual({ kind: "strategy", text: "Sets up short on everything.", more: false });
    expect(glance.foot).toBe("2 focuses running · 1 goal reached · 1 focus achieved");

    const unknown = goalsGlance({ client, focuses: null, threads: [], notesState: "loading", today: TODAY, tz: TZ });
    expect(unknown.focusLine).toBeNull();
    expect(unknown.foot).toBe("1 goal reached");
  });

  it("never prints a confident zero for what was reached, nor a span a focus cannot have", () => {
    const client = {
      globalNotes: "",
      smartGoal: "",
      goalTargetDate: "",
      goalHistory: [],
      discoveryNotes: "",
    } as Pick<Client, "globalNotes" | "smartGoal" | "goalTargetDate" | "goalHistory" | "discoveryNotes">;
    // Her goals may have been reached before Journey: no "0 goals reached".
    const glance = goalsGlance({
      client,
      focuses: [focus({ id: "undated", startedAt: null, createdAt: null })],
      threads: [],
      notesState: "ready",
      today: TODAY,
      tz: TZ,
    });
    expect(glance.foot).toBe("1 focus running");
    expect(glance.foot).not.toContain("reached");
    // No start date: the coach alone, never "AJ, —".
    expect(glance.focusLine).toBe("Pace: Slow the lower turnaround. · AJ");
    expect(goalsGlance({ client, focuses: null, threads: [], notesState: "ready", today: TODAY, tz: TZ }).foot).toBe("");
  });

  it("formats a day key as a studio day, never through UTC", () => {
    expect(dayWords("2027-01-22")).toBe("Jan 22, 2027");
    expect(dayWords("2027-02-30")).toBe("");
  });
});

describe("the module ships to an iPad", () => {
  it("uses no regex lookbehind", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    expect(readFileSync(join(here, "goals-page.ts"), "utf8")).not.toContain("(?<");
  });
});
