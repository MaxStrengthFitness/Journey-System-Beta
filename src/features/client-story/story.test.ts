import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import type { InBodyScan } from "../inbody/types";
import { assembleThreads, type NoteThread } from "../client-notes/threads";
import { historyFromDocs, type AssessmentHistory } from "../subjective-report/assessment-history";
import { CATEGORY_BY_KEY } from "../subjective-report/questions";
import { COVERAGE_CAVEAT, type PriorHistory } from "../../lib/prior-history";
import { pronounsOf } from "../client-codex/kit/pronouns";
import {
  STORY_READ_KIND,
  buildStory,
  filterStory,
  firstVisitOf,
  foldText,
  monthYear,
  sinceLine,
  storySince,
  storyTabHint,
  unreadUnder,
  type Src,
  type StoryClient,
  type StoryInput,
  type StoryRead,
  type StorySource,
} from "./story";

/*
 * Run under TZ=America/New_York (the date trap): the goal below was marked at
 * 03:30 UTC on the 23rd, which is the evening of the 22nd at the studio.
 */
const TZ = "America/New_York";
const TODAY = "2027-03-16";
const SHE = pronounsOf({ gender: "Female" });
/** A studio instant at noon Eastern on a day. */
const noon = (day: string) => new Date(`${day}T12:00:00-05:00`);

const ready = <T,>(data: T): Src<T> => ({ status: "ready", data });

/* ------------------------------------------------------------------ */
/* Fixture builders                                                    */
/* ------------------------------------------------------------------ */

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
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

const focus = (over: Partial<ClientFocus> & { id: string }): ClientFocus =>
  ({
    clientId: "c1",
    studioId: "westlake",
    trainerId: "uid-aj",
    trainerName: "AJ",
    trainerInitials: "AJ",
    category: "Pace",
    intent: "Slow the lower turnaround",
    targetMachineId: null,
    status: "active",
    startedAt: noon("2027-01-01"),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: noon("2027-01-01"),
    updatedAt: noon("2027-01-01"),
    ...over,
  }) as ClientFocus;

const ford = (over: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    pillar: "family",
    body: "A detail",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: noon("2026-12-01"),
    createdAt: noon("2026-12-01"),
    updatedAt: noon("2026-12-01"),
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "in_session",
    sessionId: null,
    isArchived: false,
    ...over,
  }) as FordEntry;

const scan = (id: string, testedAt: string, weightLb: number, skeletalMuscleMassLb: number): InBodyScan =>
  ({
    id,
    testedAt,
    device: "InBody 270S",
    source: "manual",
    studioId: "westlake",
    enteredBy: "uid-marcus",
    enteredByName: "Marcus Lee",
    weightLb,
    skeletalMuscleMassLb,
    bodyFatMassLb: 50,
    percentBodyFat: 35,
    bmi: null,
    totalBodyWaterLb: null,
    dryLeanMassLb: null,
    fatFreeMassLb: null,
    basalMetabolicRateKcal: null,
    smi: null,
    phaseAngle: null,
    segmentalLean: null,
  }) as InBodyScan;

/** A saved Pulse round as the progressReports listener hands it over (raw). */
const report = (id: string, date: string, answers: Record<string, number>, trainerName = "Jess Moreno", enteredBy = "coach") => ({
  id,
  clientId: "c1",
  status: "Finalized",
  date,
  trainerName,
  updatedAt: noon(date),
  createdAt: noon(date),
  subjective: {
    scaleVersion: 2,
    enteredBy,
    completedAt: date,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { value: v }])),
  },
});

/** The history as the shell builds it: the raw page, newest first, at the listener's limit. */
const historyOf = (docs: ReturnType<typeof report>[], max = 50): AssessmentHistory =>
  historyFromDocs(docs.slice().sort((a, b) => b.date.localeCompare(a.date)), max);

const input = (over: Partial<StoryInput> & { client: StoryClient }): StoryInput => ({
  today: TODAY,
  tz: TZ,
  coverage: "complete",
  totals: null,
  pronouns: SHE,
  notes: ready([] as NoteThread[]),
  focuses: ready([] as ClientFocus[]),
  ford: ready([] as FordEntry[]),
  inbody: ready([] as InBodyScan[]),
  pulse: ready(historyOf([])),
  ...over,
});

/* ------------------------------------------------------------------ */
/* (A) Carol — seven years of FileMaker, six months of Journey          */
/* ------------------------------------------------------------------ */

const carol: StoryClient = {
  priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker" },
  firstAppointmentDate: new Date(Date.UTC(2019, 2, 6)),
  referredBy: "Janet Olsen",
  mindbodyContracts: {
    "1": {
      clientContractId: 1,
      contractName: "96 PIF",
      status: "Active",
      startDate: "2026-03-14T00:00:00Z",
      endDate: "2027-03-14T00:00:00Z",
    },
    "2": {
      clientContractId: 2,
      contractName: "96 PIF",
      status: "Active",
      startDate: "2027-03-14T00:00:00Z",
      endDate: "2028-03-14T00:00:00Z",
    },
  },
  goalHistory: [
    {
      goal: "Walk 5 miles without stopping",
      achievedAt: "2027-01-23T03:30:00Z",
      reward: "dinner out with Tom",
      byName: "AJ",
    },
  ],
  pedigreeHistory: [
    { level: "Intermediate", at: "" },
    { level: "Advanced", at: "2026-11-12T15:00:00Z", byName: "AJ" },
  ],
};

const LONG_BODY =
  "A pinch in the right knee on Leg Press with the seat one notch closer. Back to seat 7, stop at 90 degrees at the bottom turn and hold the pause. " +
  "She said it felt fine the next day but asked us to keep an eye on it through the spring, because the pickleball season starts in April and she wants to play. " +
  "Check in with her before every Leg Press set until the end of the month.";

const carolThreads = assembleThreads([
  entry({ id: "crit", body: LONG_BODY, importance: "critical", occurredAt: noon("2027-03-04"), authorName: "AJ Jurgens" }),
  entry({ id: "crit-u1", threadId: "crit", body: "Seat 7 held.", occurredAt: noon("2027-03-06") }),
  entry({ id: "crit-u2", threadId: "crit", body: "Still fine.", occurredAt: noon("2027-03-09") }),
  entry({ id: "old-knee", body: "Left knee sore after a hike.", occurredAt: noon("2026-10-01"), resolvedAt: noon("2026-11-01") }),
  entry({ id: "tip", kind: "coaching", category: "Pace", body: "Slow on the way down.", occurredAt: noon("2026-12-02") }),
  entry({ id: "archived", importance: "critical", body: "Gone.", isArchived: true, occurredAt: noon("2026-12-03") }),
  entry({ id: "legacy:profile:medicalHistory", kind: "injury", importance: "elevated", body: "R TKA Mar 2024", isLegacy: true, origin: "profile" }),
  entry({ id: "legacy:profile:globalNotes", kind: "general", body: "Keep up with the grandkids", isLegacy: true, origin: "profile" }),
]);

const carolFocuses = [
  focus({
    id: "f-knees",
    intent: "Knees tracking straight on Leg Press",
    status: "passed",
    startedAt: noon("2027-01-25"),
    achievedAt: noon("2027-02-20"),
    rewardNote: "a Kaizen pin",
  }),
  focus({ id: "f-retired", status: "retired", retiredAt: noon("2027-02-01") }),
];

const carolFord = [
  ford({ id: "moment", pillar: "dreams", body: "Booked the Camino with Tom: May 12, Sarria to Santiago.", occurredAt: noon("2026-12-18"), authorName: "Marcus Lee" }),
  ford({
    id: "camino",
    pillar: "dreams",
    isPinned: true,
    body: "Walk the Camino with Tom.",
    opportunity: {
      idea: "Send a trail-map postcard",
      status: "done",
      ownerTrainerId: "uid-aj",
      ownerName: "AJ Jurgens",
      plannedFor: null,
      doneAt: noon("2027-01-20"),
      outcome: "AJ sent a trail-map postcard for the Camino. She pinned it on her fridge.",
    },
  }),
  ford({ id: "fact", pillar: "family", isPinned: true, body: "Husband Tom." }),
  ford({ id: "birthday", pillar: "family", isPinned: true, recurrence: "annual", body: "Birthday Apr 2." }),
  ford({ id: "archived", pillar: "family", body: "Old line.", isArchived: true }),
  ford({ id: "untagged", pillar: null, body: "Caught mid-set." }),
  ford({ id: "legacy", pillar: "recreation", body: "Vacation", isLegacy: true, occurredAt: noon("2026-12-20") }),
  ford({ id: "one-line", pillar: null, kind: "one-line", isArchived: true, body: "Retired hygienist." }),
];

const carolScans = [scan("s1", "2026-09-20", 145.24, 47.1), scan("s2", "2026-12-05", 143, 47.9), scan("s3", "2027-03-03", 142, 48.3)];

const carolPulse = historyOf([
  report("r1", "2026-09-16", { strengthConfidence_1: 3, sleepRecovery_2: 5 }),
  report("r2", "2026-12-10", { strengthConfidence_1: 5 }, "AJ Jurgens"),
  report("r3", "2027-03-10", { strengthConfidence_1: 8, sleepRecovery_2: 5 }, "AJ Jurgens"),
]);

const carolStory = () =>
  buildStory(
    input({
      client: carol,
      coverage: "partial",
      totals: { total: 461, journey: 49, before: 412 },
      notes: ready(carolThreads),
      focuses: ready(carolFocuses),
      ford: ready(carolFord),
      inbody: ready(carolScans),
      pulse: ready(carolPulse),
    }),
  );

describe("buildStory — (A) a migrated client", () => {
  it("lists every moment, newest first, with the years before Journey where Journey took over", () => {
    const story = carolStory();
    expect(story.beats.map((b) => `${b.day} ${b.key}`)).toEqual([
      "2027-03-14 contract-start:c-2",
      "2027-03-10 pulse:r3",
      "2027-03-04 note-open:crit",
      "2027-03-03 inbody:s3",
      "2027-02-20 focus:f-knees",
      "2027-01-22 goal:2027-01-23T03:30:00Z:0",
      "2027-01-20 ford-done:camino",
      "2026-12-18 ford:moment",
      "2026-12-10 pulse:r2",
      "2026-12-05 inbody:s2",
      "2026-11-12 pedigree:1",
      "2026-11-01 note-close:old-knee",
      "2026-10-01 note-open:old-knee",
      "2026-09-20 inbody:s1",
      "2026-09-16 pulse:r1",
      "2026-09-12 era",
      "2026-03-14 contract-start:c-1",
      "2019-03-06 mindbody-first-visit",
    ]);
    expect(story.pending).toEqual([]);
    expect(story.failed).toEqual([]);
    expect(story.off).toEqual([]);
  });

  it("groups the years newest first", () => {
    expect(carolStory().years.map((y) => [y.year, y.beats.length])).toEqual([
      [2027, 7],
      [2026, 10],
      [2019, 1],
    ]);
  });

  it("draws the FileMaker years as one panel, dated where Journey took over", () => {
    const era = carolStory().beats.find((b) => b.isEra)!;
    expect(era.day).toBe("2026-09-12");
    expect(era.text).toBe("Mar 2019 – Sep 2026 · 412 sessions in FileMaker");
    expect(era.eraDetail).toContain("The detail of those years lives in FileMaker.");
    expect(era.eraDetail).toContain("so she is never treated as new");
    expect(era.kind).toBe("milestone");
    expect(era.door).toBeNull();
  });

  it("reads the packages: the first Journey holds started, the next renewed, no end while one follows", () => {
    const beats = carolStory().beats;
    const text = (key: string) => beats.find((b) => b.key === key)?.text;
    expect(text("contract-start:c-1")).toBe("Started a package: 96 PIF (Committed · 12 months · paid in full).");
    expect(text("contract-start:c-2")).toBe("Renewed: 96 PIF (Committed · 12 months · paid in full).");
    expect(beats.some((b) => b.key.startsWith("contract-end:"))).toBe(false);
    expect(beats.find((b) => b.key === "contract-start:c-2")?.door).toEqual({ page: "account", anchor: "account-membership" });
  });

  it("says Mindbody's first visit is the first, and who referred her", () => {
    const visit = carolStory().beats.find((b) => b.key === "mindbody-first-visit")!;
    expect(visit.text).toBe("First visit, as Mindbody records it. Referred by Janet Olsen.");
    expect(visit.sourceLine).toBe("Mindbody · first appointment");
    expect(visit.door).toEqual({ page: "account", anchor: "account-on-file" });
  });

  it("dates a goal on the studio's day, not UTC's", () => {
    const goal = carolStory().beats.find((b) => b.source === "goal")!;
    expect(goal.day).toBe("2027-01-22");
    expect(goal.text).toBe("Goal reached: Walk 5 miles without stopping. Reward: dinner out with Tom.");
    expect(goal.sourceLine).toBe("Goal · marked by AJ");
    expect(goal.door).toEqual({ page: "goals", anchor: "goals-reached" });
  });

  it("says a focus reached, how long it ran and its reward; a retired focus is no moment", () => {
    const beats = carolStory().beats;
    const f = beats.find((b) => b.key === "focus:f-knees")!;
    expect(f.text).toBe("Focus reached, Pace: Knees tracking straight on Leg Press. Reward: a Kaizen pin.");
    expect(f.sourceLine).toBe("Focus · AJ · after 4 weeks");
    expect(beats.some((b) => b.key === "focus:f-retired")).toBe(false);
  });

  it("names a step in protocol mastery and the one before; the undated first step is no moment", () => {
    const beats = carolStory().beats.filter((b) => b.source === "pedigree");
    expect(beats).toHaveLength(1);
    expect(beats[0].text).toBe("Protocol mastery: Advanced. It was Intermediate.");
    expect(beats[0].sourceLine).toBe("Training story · AJ");
  });

  it("prints each scan's numbers and never a change", () => {
    const scans = carolStory().beats.filter((b) => b.source === "inbody");
    expect(scans.map((b) => b.text)).toEqual([
      "InBody scan: 142 lb, skeletal muscle 48.3 lb.",
      "InBody scan: 143 lb, skeletal muscle 47.9 lb.",
      "InBody scan: 145.2 lb, skeletal muscle 47.1 lb.",
    ]);
    for (const b of scans) expect(b.text).not.toMatch(/\b(up|down|gain|gained|lost|change|more|less)\b/i);
    expect(scans[0].sourceLine).toBe("InBody · Marcus");
  });

  it("quotes the Pulse statements that moved, verbatim, in words", () => {
    const beats = carolStory().beats;
    const r1 = beats.find((b) => b.key === "pulse:r1")!;
    const r2 = beats.find((b) => b.key === "pulse:r2")!;
    const r3 = beats.find((b) => b.key === "pulse:r3")!;
    expect(r1.text).toBe("First Pulse in Journey: 2 of 24 statements answered.");
    expect(r1.quotes).toBeUndefined();
    expect(r2.text).toBe("Pulse saved: 1 statement moved.");
    expect(r2.quotes?.map((q) => [q.from, q.to])).toEqual([["Rarely", "Sometimes"]]);
    expect(r3.text).toBe("Pulse saved: 1 statement moved.");
    expect(r3.quotes).toEqual([
      {
        statementId: "strengthConfidence_1",
        text: CATEGORY_BY_KEY.strengthConfidence.statements[0].text,
        from: "Sometimes",
        to: "Often",
      },
    ]);
    // Words, never the stored 0–10.
    for (const b of [r1, r2, r3]) expect(`${b.text} ${JSON.stringify(b.quotes ?? [])}`).not.toMatch(/\b(3|5|8)\/10\b|\b\d+ ?%/);
    expect(r3.sourceLine).toBe("Pulse · AJ");
    expect(r3.door).toEqual({ page: "body", anchor: "body-pulse" });
  });

  it("opens and closes critical and injury notes, with the thread's own words and its updates", () => {
    const beats = carolStory().beats;
    const open = beats.find((b) => b.key === "note-open:crit")!;
    expect(open.text).toBe(LONG_BODY);
    expect(open.sourceLine).toBe("Critical note · AJ · 2 updates");
    expect(open.door).toEqual({ page: "notes", anchor: "note-crit" });
    const closed = beats.find((b) => b.key === "note-close:old-knee")!;
    expect(closed.text).toBe("Closed: Left knee sore after a hike.");
    expect(closed.sourceLine).toBe("Injury note · opened Oct 1, 2026");
  });

  it("draws FORD moments and gestures done — never a standing fact, an archived or unfiled detail, an import or the one line", () => {
    const beats = carolStory().beats.filter((b) => b.source === "ford");
    expect(beats.map((b) => b.key)).toEqual(["ford-done:camino", "ford:moment"]);
    expect(beats[0].text).toBe("AJ sent a trail-map postcard for the Camino. She pinned it on her fridge.");
    expect(beats[0].sourceLine).toBe("FORD · above and beyond · AJ");
    expect(beats[0].door).toEqual({ page: "ford", anchor: "ford-beyond" });
    expect(beats[1].sourceLine).toBe("FORD · Dreams · Marcus");
    expect(beats[1].door).toEqual({ page: "ford", anchor: "ford-dreams" });
    for (const b of beats) expect(b.kind).toBe("life");
  });

  it("gives no beat for the profile fields the journal adapts, an archived note or a coaching tip", () => {
    const keys = carolStory().beats.map((b) => b.key);
    expect(keys.some((k) => k.includes("legacy:profile"))).toBe(false);
    expect(keys.some((k) => k.includes("archived"))).toBe(false);
    expect(keys.some((k) => k.includes(":tip"))).toBe(false);
  });

  it("never calls her new", () => {
    for (const b of carolStory().beats) {
      expect(b.text).not.toMatch(/\bnew client\b/i);
      expect(b.text).not.toMatch(/^First session\.$/);
    }
  });

  it("says since when, with the header's own numbers", () => {
    expect(carolStory().sinceLine).toBe(
      "With Max Strength since Mar 2019. 412 sessions in FileMaker before Journey, and 49 in Journey.",
    );
    expect(storyTabHint({ client: carol, coverage: "partial", tz: TZ })).toBe("since 2019");
  });
});

/* ------------------------------------------------------------------ */
/* (B)–(J)                                                             */
/* ------------------------------------------------------------------ */

describe("buildStory — the other clients", () => {
  it("(B) a brand-new client: First session, no era, and her first Pulse in Journey", () => {
    const story = buildStory(
      input({
        client: { firstSessionDate: noon("2027-02-01") },
        coverage: "complete",
        totals: { total: 6, journey: 6, before: 0 },
        pulse: ready(historyOf([report("r1", "2027-02-01", { sleepRecovery_1: 5 })])),
      }),
    );
    expect(story.beats.find((b) => b.key === "journey-first")?.text).toBe("First session.");
    expect(story.beats.some((b) => b.isEra)).toBe(false);
    expect(story.beats.find((b) => b.key === "pulse:r1")?.text).toBe("First Pulse in Journey: 1 of 24 statements answered.");
    expect(story.sinceLine).toBe("With Max Strength since Feb 2027. 6 sessions, all in Journey.");
  });

  it("(B) with a prior record, the first session in Journey is only that", () => {
    const story = buildStory(input({ client: { ...carol, firstSessionDate: noon("2026-09-14") }, coverage: "partial" }));
    expect(story.beats.find((b) => b.key === "journey-first")?.text).toBe("First session recorded in Journey.");
  });

  it("(C) unknown coverage, no record, no sessions: a Before Journey panel at the end, and the caveat said once", () => {
    const story = buildStory(input({ client: {}, coverage: "unknown" }));
    const last = story.years[story.years.length - 1];
    expect(last.year).toBeNull();
    expect(last.beats).toHaveLength(1);
    expect(last.beats[0].text).toBe("Before Journey");
    expect(last.beats[0].day).toBeNull();
    expect(last.beats[0].eraDetail).toContain("may start partway through");
    // The since line carries the caveat (it is the Overview's line too); the
    // panel says it in its own words, so the page never says it twice.
    expect(story.sinceLine).toBe(COVERAGE_CAVEAT.unknown);
    expect(last.beats[0].eraDetail).not.toContain(COVERAGE_CAVEAT.unknown!);
  });

  it("(C) partial coverage with no record says the page starts partway through", () => {
    const story = buildStory(
      input({ client: { firstSessionDate: noon("2026-10-01") }, coverage: "partial", totals: { total: 12, journey: 12, before: 0 } }),
    );
    expect(story.beats.find((b) => b.isEra)?.eraDetail).toContain("starts partway through");
    expect(story.beats.find((b) => b.key === "journey-first")?.text).toBe("First session recorded in Journey.");
    expect(story.sinceLine).toBe("In Journey since Oct 2026. 12 sessions in Journey. Her sessions before Journey aren't recorded here yet.");
  });

  it("(D) an inferred first appointment is the earliest seen, never the first visit", () => {
    const client: StoryClient = {
      firstAppointmentDate: new Date("2026-06-03T14:00:00Z"),
      firstAppointmentDateSource: "pull-sync:earliest-in-window",
    };
    const story = buildStory(input({ client, coverage: "partial" }));
    const visit = story.beats.find((b) => b.source === "mindbody")!;
    expect(visit.text).toBe("The earliest Mindbody visit Journey has seen; the first may be earlier.");
    expect(visit.text).not.toContain("First visit");
    expect(visit.sourceLine).toBe("Mindbody · earliest booking seen");
    expect(firstVisitOf(client, TZ)).toEqual({ day: "2026-06-03", authoritative: false, basis: "booking" });
    expect(storyTabHint({ client, coverage: "partial", tz: TZ })).toBe("since 2026 or earlier");
    expect(story.sinceLine).toMatch(/^With Max Strength since at least Jun 2026\./);
  });

  it("(E) a failed or pending source is named and makes no beat", () => {
    const story = buildStory(
      input({
        client: carol,
        coverage: "partial",
        inbody: { status: "failed" },
        ford: { status: "loading" },
        notes: { status: "loading" },
        pulse: { status: "failed" },
        focuses: ready(carolFocuses),
      }),
    );
    expect(story.failed).toEqual(["inbody", "pulse"]);
    expect(story.pending).toEqual(["notes", "ford"]);
    expect(story.beats.filter((b) => ["inbody", "ford", "note", "pulse"].includes(b.source))).toEqual([]);
    // What the client document holds is still there.
    expect(story.beats.some((b) => b.isEra)).toBe(true);
    expect(story.beats.some((b) => b.source === "focus")).toBe(true);
  });

  it("(E) FORD refused for this reader is off, not failed", () => {
    const story = buildStory(input({ client: carol, coverage: "partial", ford: { status: "off" } }));
    expect(story.off).toEqual(["ford"]);
    expect(story.failed).toEqual([]);
    expect(story.beats.some((b) => b.source === "ford")).toBe(false);
  });

  it("(F) an incomplete Pulse read never claims her first Pulse, and quotes nothing from an unknown baseline", () => {
    const history = historyOf(
      [report("r1", "2026-10-01", { strengthConfidence_1: 3 }), report("r2", "2026-11-01", { strengthConfidence_1: 8, sleepRecovery_1: 5 })],
      2,
    );
    expect(history.complete).toBe(false);
    const story = buildStory(input({ client: {}, coverage: "partial", pulse: ready(history) }));
    const [newer, older] = story.beats.filter((b) => b.source === "pulse");
    expect(older.text).toBe("Pulse saved.");
    expect(older.quotes).toBeUndefined();
    expect(story.beats.some((b) => b.text.includes("First Pulse"))).toBe(false);
    // The newer round moved a statement the window holds; the one it answered
    // for the first time in the window may have been answered before it.
    expect(newer.text).toBe("Pulse saved: 1 statement moved.");
  });

  it("(F) says no earlier answer changed only when every answer could be compared", () => {
    const complete = historyOf([report("r1", "2026-10-01", { strengthConfidence_1: 5 }), report("r2", "2026-11-01", { strengthConfidence_1: 5, sleepRecovery_1: 5 })]);
    expect(buildStory(input({ client: {}, pulse: ready(complete) })).beats[0].text).toBe("Pulse saved: no earlier answer changed.");
    const partial = historyOf(
      [report("r1", "2026-10-01", { strengthConfidence_1: 5 }), report("r2", "2026-11-01", { strengthConfidence_1: 5, sleepRecovery_1: 5 })],
      2,
    );
    const newer = buildStory(input({ client: {}, coverage: "partial", pulse: ready(partial) })).beats.find((b) => b.key === "pulse:r2");
    expect(newer?.text).toBe("Pulse saved.");
  });

  it("(F) a round she filled in herself says so", () => {
    const history = historyOf([report("r1", "2026-10-01", { strengthConfidence_1: 5 }, "", "client")]);
    const beat = buildStory(input({ client: {}, pulse: ready(history) })).beats[0];
    expect(beat.sourceLine).toBe("Pulse · in her own words");
  });

  it("(G) came back after a gap, ended with nothing after, cancelled when Mindbody said so, on UTC days", () => {
    const client: StoryClient = {
      mindbodyContracts: {
        a: { clientContractId: "a", contractName: "48 Sessions - 2X Week", status: "Active", startDate: "2025-01-01T00:00:00Z", endDate: "2025-07-01T00:00:00Z" },
        b: { clientContractId: "b", contractName: "96 PIF", status: "Active", startDate: "2025-11-01T00:00:00Z", endDate: "2027-01-01T00:00:00Z" },
        c: {
          clientContractId: "c",
          contractName: "Month to month",
          status: "Cancelled",
          startDate: "2027-01-10T00:00:00Z",
          endDate: "2028-01-10T00:00:00Z",
          cancelledAt: new Date("2027-02-02T15:00:00Z"),
        },
      },
    };
    const story = buildStory(input({ client, coverage: "partial" }));
    const text = (key: string) => story.beats.find((b) => b.key === key);
    expect(text("contract-start:c-a")?.text).toBe("Started a package: 48 Sessions - 2X Week (The Trial · 6 months · paying every 4 weeks).");
    expect(text("contract-start:c-b")?.text).toBe("Came back: 96 PIF (Committed · 12 months · paid in full).");
    // a had b after it, but more than 60 days on: it ended.
    expect(text("contract-end:c-a")).toMatchObject({ day: "2025-07-01", text: "48 Sessions - 2X Week ended." });
    // b ended on Jan 1 and she signed c nine days later: renewed, not ended —
    // even though c was cancelled later. One rule for both passes: a term is
    // never both renewed into and "ended".
    expect(text("contract-start:c-c")?.text).toBe("Renewed: Month to month (Month-to-month).");
    expect(text("contract-end:c-b")).toBeUndefined();
    expect(text("contract-cancel:c-c")).toMatchObject({ day: "2027-02-02", text: "Cancelled: Month to month." });
    // c itself was cancelled: its cancellation is its end, never "ended" too.
    expect(text("contract-end:c-c")).toBeUndefined();
  });

  it("(G) a cancelled contract with no stamp says nothing about when, and a future start is not a moment yet", () => {
    const client: StoryClient = {
      mindbodyContracts: {
        x: { clientContractId: "x", contractName: "96 PIF", status: "Cancelled", startDate: "2026-01-01T00:00:00Z" },
        y: { clientContractId: "y", contractName: "96 PIF", status: "Active", startDate: "2027-04-01T00:00:00Z" },
      },
    };
    const keys = buildStory(input({ client })).beats.map((b) => b.key);
    expect(keys).toContain("contract-start:c-x");
    expect(keys.some((k) => k.startsWith("contract-cancel:"))).toBe(false);
    expect(keys).not.toContain("contract-start:c-y");
  });

  it("(H) filters: Life keeps only life and drops the era; Milestones keeps the era; empty years go", () => {
    const story = carolStory();
    const life = filterStory(story, "life");
    expect(life.beats.every((b) => b.kind === "life")).toBe(true);
    expect(life.beats.some((b) => b.isEra)).toBe(false);
    expect(life.years.map((y) => y.year)).toEqual([2027, 2026]);
    const milestones = filterStory(story, "milestone");
    expect(milestones.beats.some((b) => b.isEra)).toBe(true);
    expect(milestones.years.map((y) => y.year)).toEqual([2027, 2026, 2019]);
    expect(filterStory(story, "all")).toBe(story);
  });

  it("(I) folds a long text at whole sentences when it can, else on a space with …", () => {
    const f = foldText(LONG_BODY, 280);
    expect(f.folded).toBe(true);
    expect(LONG_BODY.startsWith(f.short)).toBe(true);
    expect(f.short.length).toBeLessThanOrEqual(280);
    expect(f.short.endsWith(".")).toBe(true);

    const oneSentence = `${"word ".repeat(80)}end`;
    const g = foldText(oneSentence, 280);
    expect(g.folded).toBe(true);
    expect(g.short.endsWith("word…")).toBe(true);
    expect(g.short.length).toBeLessThanOrEqual(281);

    expect(foldText("Short.", 280)).toEqual({ short: "Short.", folded: false });
  });

  it("(J) the tab line and the page's line say the same year", () => {
    const client: StoryClient = { firstSessionDate: noon("2026-09-20") };
    expect(storyTabHint({ client, coverage: "partial", tz: TZ })).toBe("in Journey since 2026");
    expect(sinceLine({ client, coverage: "partial", tz: TZ, pronouns: SHE })).toMatch(/^In Journey since Sep 2026\./);
    expect(storyTabHint({ client: {}, coverage: "unknown", tz: TZ })).toBeNull();
  });

  it("(J) a long-standing client's first Journey session never becomes her start", () => {
    // Mindbody saw her first in 2016; Journey's first session was this year.
    // The header's resolveClientSince would say "Client since Sep 2026".
    const client: StoryClient = { firstAppointmentDate: new Date(Date.UTC(2016, 4, 2)), firstSessionDate: noon("2026-09-20") };
    expect(storySince(client, "partial", TZ)).toEqual({ kind: "client", day: "2016-05-02" });
    expect(storyTabHint({ client, coverage: "partial", tz: TZ })).toBe("since 2016");
  });

  it("(J) a prior record with no first day says since at least, never a later contract as her start", () => {
    const client: StoryClient = {
      priorHistory: { sessions: 200, through: "2026-09-01", source: "paper" },
      mindbodyContracts: { a: { clientContractId: "a", contractName: "96 PIF", status: "Active", startDate: "2026-03-01T00:00:00Z" } },
    };
    expect(storySince(client, "partial", TZ)).toEqual({ kind: "at-least", day: "2026-03-01" });
    const era = buildStory(input({ client, coverage: "partial" })).beats.find((b) => b.isEra)!;
    expect(era.text).toBe("Until Sep 2026 · 200 sessions on paper records");
  });

  it("drops nothing it cannot date and invents no day", () => {
    const story = buildStory(
      input({
        client: { goalHistory: [{ goal: "No date", achievedAt: "not a date" }], pedigreeHistory: [{ level: "Advanced", at: "" }] },
        inbody: ready([scan("bad", "2026-02-30", 140, 45)]),
      }),
    );
    expect(story.beats).toEqual([]);
    expect(story.sinceLine).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The prior record's edge cases, the first visit's basis, unreadUnder */
/* ------------------------------------------------------------------ */

const priorClient = (over: Partial<PriorHistory> = {}): StoryClient => ({
  priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker", ...over },
});

describe("the years before Journey — every source, and the record's edge cases", () => {
  it.each([
    ["filemaker", "412 sessions in FileMaker before Journey"],
    ["paper", "412 sessions on paper records before Journey"],
    ["trainer-estimate", "412 sessions before Journey (a trainer's estimate)"],
    ["other", "412 sessions before Journey"],
  ] as const)("the since line names a %s record, saying “before Journey” once", (source, words) => {
    const client = priorClient({ source });
    const withCount = sinceLine({ client, coverage: "partial", tz: TZ, pronouns: SHE, totals: { total: 461, journey: 49, before: 412 } });
    expect(withCount).toBe(`With Max Strength since Mar 2019. ${words}, and 49 in Journey.`);
    expect(withCount!.split("before Journey").length - 1).toBe(1);
    const noCount = sinceLine({ client, coverage: "partial", tz: TZ, pronouns: SHE, totals: { total: null, journey: null, before: 412 } });
    expect(noCount).toBe(`With Max Strength since Mar 2019. ${words}.`);
    // The panel's own words never double it either.
    const era = buildStory(input({ client, coverage: "partial" })).beats.find((b) => b.isEra)!;
    expect(era.text.split("before Journey").length - 1).toBeLessThanOrEqual(1);
  });

  it("keeps the panel when its last day was typed after today: at today, in the words as typed", () => {
    // TODAY is 2027-03-16; a studio typed its planned cutover.
    const client = priorClient({ through: "2027-12-31" });
    const story = buildStory(input({ client, coverage: "partial", totals: { total: 461, journey: 49, before: 412 } }));
    const era = story.beats.find((b) => b.isEra);
    expect(era).toBeDefined();
    expect(era!.day).toBe(TODAY);
    expect(era!.text).toBe("Mar 2019 – Dec 2027 · 412 sessions in FileMaker");
    expect(story.years[0].year).toBe(2027);
    expect(story.sinceLine).toBe("With Max Strength since Mar 2019. 412 sessions in FileMaker before Journey, and 49 in Journey.");
  });

  it("never says since at least a month that hasn't come", () => {
    const client: StoryClient = {
      priorHistory: { sessions: 200, through: "2027-12-31", source: "paper" },
      firstSessionDate: noon("2026-10-01"),
    };
    expect(storySince(client, "partial", TZ, TODAY)).toEqual({ kind: "journey", day: "2026-10-01" });
    expect(storyTabHint({ client, coverage: "partial", tz: TZ, today: TODAY })).toBe("in Journey since 2026");
    expect(buildStory(input({ client, coverage: "partial" })).sinceLine).toMatch(/^In Journey since Oct 2026\./);
  });

  it("a record brought wholly into Journey says so, and never that Journey can't show them", () => {
    const all = buildStory(input({ client: priorClient({ sessions: 100, importedCount: 100 }), coverage: "complete" })).beats.find((b) => b.isEra)!;
    expect(all.eraDetail).not.toContain("can't show");
    expect(all.eraDetail).toContain("so she is never treated as new.");
    expect(all.eraDetail).toContain("All of them have since been brought into Journey.");
    // More imported than stated reads as all of them, never a bigger number.
    const over = buildStory(input({ client: priorClient({ sessions: 100, importedCount: 140 }), coverage: "complete" })).beats.find((b) => b.isEra)!;
    expect(over.eraDetail).toContain("All of them have since been brought into Journey.");
    expect(over.eraDetail).not.toContain("140");
    const some = buildStory(input({ client: priorClient({ importedCount: 100 }), coverage: "partial" })).beats.find((b) => b.isEra)!;
    expect(some.eraDetail).toContain("but it can't show what happened in each one.");
    expect(some.eraDetail).toContain("100 of them have since been brought into Journey.");
  });

  it("a record of no sessions makes no panel and dates nothing", () => {
    const client = priorClient({ sessions: 0 });
    const story = buildStory(input({ client, coverage: "complete" }));
    expect(story.beats.some((b) => b.isEra)).toBe(false);
    expect(story.beats.some((b) => b.text.includes("0 sessions"))).toBe(false);
    // Neither its first day nor its last is a "since".
    expect(storySince(client, "complete", TZ, TODAY)).toBeNull();
    expect(story.sinceLine).toBeNull();
  });
});

describe("firstVisitOf — named for what the date was taken from", () => {
  it.each([
    ["backfill:firstSessionDate", "session", "The earliest session Journey has on file; the first visit may be earlier.", "Journey · earliest session on file"],
    ["backfill:earliest-session", "session", "The earliest session Journey has on file; the first visit may be earlier.", "Journey · earliest session on file"],
    ["backfill:earliest-contract", "contract", "The earliest package Journey has on file began; the first visit may be earlier.", "Mindbody · earliest package on file"],
    ["rehome:earliest-booking", "booking", "The earliest Mindbody visit Journey has seen; the first may be earlier.", "Mindbody · earliest booking seen"],
    ["pull-sync:earliest-in-window", "booking", "The earliest Mindbody visit Journey has seen; the first may be earlier.", "Mindbody · earliest booking seen"],
    ["someday:new-marker", "other", "The earliest date Journey has on file; the first visit may be earlier.", "Client record · earliest date on file"],
  ] as const)("(D) %s", (source, basis, text, sourceLine) => {
    const client: StoryClient = { firstAppointmentDate: new Date("2026-06-03T14:00:00Z"), firstAppointmentDateSource: source };
    expect(firstVisitOf(client, TZ)).toMatchObject({ day: "2026-06-03", authoritative: false, basis });
    const beat = buildStory(input({ client, coverage: "partial" })).beats.find((b) => b.key === "mindbody-first-visit")!;
    expect(beat.text).toBe(text);
    expect(beat.sourceLine).toBe(sourceLine);
    expect(beat.text).not.toContain("First visit");
    // Only a booking Mindbody returned may be called a Mindbody visit.
    if (basis !== "booking") expect(beat.text).not.toContain("Mindbody visit");
    expect(storySince(client, "partial", TZ, TODAY)).toEqual({ kind: "at-least", day: "2026-06-03" });
  });

  it("(D) a contract-start backfill is a Mindbody date: its UTC day, not the studio's evening before", () => {
    const client: StoryClient = {
      firstAppointmentDate: new Date("2026-03-01T00:00:00Z"),
      firstAppointmentDateSource: "backfill:earliest-contract",
    };
    expect(firstVisitOf(client, TZ)?.day).toBe("2026-03-01");
  });

  it("(D) with no marker, or “mindbody”, it is THE first visit", () => {
    const at = new Date(Date.UTC(2019, 2, 6));
    expect(firstVisitOf({ firstAppointmentDate: at }, TZ)).toEqual({ day: "2019-03-06", authoritative: true, basis: "mindbody" });
    expect(firstVisitOf({ firstAppointmentDate: at, firstAppointmentDateSource: "mindbody" }, TZ)?.basis).toBe("mindbody");
  });
});

describe("unreadUnder", () => {
  it("lists the reads that feed a filter and may be missing", () => {
    const story = buildStory(
      input({ client: carol, coverage: "partial", ford: { status: "off" }, inbody: { status: "loading" }, pulse: { status: "failed" } }),
    );
    expect(unreadUnder(story, "life")).toEqual(["ford"]);
    expect(unreadUnder(story, "body")).toEqual(["inbody", "pulse"]);
    expect(unreadUnder(story, "milestone")).toEqual([]);
    expect(unreadUnder(story, "coaching")).toEqual([]);
    expect(unreadUnder(story, "all")).toEqual(["ford", "inbody", "pulse"]);
    expect(unreadUnder(carolStory(), "all")).toEqual([]);
  });

  it("a capped journal leaves notes and focuses uncertain", () => {
    const story = buildStory(input({ client: {}, capped: true }));
    expect(unreadUnder(story, "coaching")).toEqual(["focuses"]);
    expect(unreadUnder(story, "body")).toEqual(["notes"]);
    expect(unreadUnder(story, "life")).toEqual([]);
  });

  it("files each read under the kind of moment it gives", () => {
    const readOf: Partial<Record<StorySource, StoryRead>> = {
      note: "notes",
      focus: "focuses",
      ford: "ford",
      inbody: "inbody",
      pulse: "pulse",
    };
    const seen = new Set<StoryRead>();
    for (const b of carolStory().beats) {
      const read = readOf[b.source];
      if (!read) continue;
      seen.add(read);
      expect(b.kind).toBe(STORY_READ_KIND[read]);
    }
    expect([...seen].sort()).toEqual(["focuses", "ford", "inbody", "notes", "pulse"]);
  });
});

describe("monthYear", () => {
  it("reads a day key at local noon", () => {
    expect(monthYear("2019-03-01")).toBe("Mar 2019");
    expect(monthYear("2026-12-31")).toBe("Dec 2026");
  });
});

describe("story.ts source", () => {
  it("uses no regex lookbehind (older iPadOS Safari fails the module)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "story.ts"), "utf8");
    expect(src).not.toContain("(?<");
  });
});
