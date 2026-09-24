import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import type { InBodyScan } from "../inbody/types";
import { assembleThreads, type NoteThread } from "../client-notes/threads";
import { historyFromDocs } from "../subjective-report/assessment-history";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { groupByPillar } from "../ford/ford-rollup";
import { askNext } from "../ford/ask-next";
import { FORD_READ_NOTICE } from "../ford/read-status";
import { accountGlance } from "../client-admin/account";
import { buildStory, type Src, type StoryInput } from "../client-story/story";
import { pronounsOf } from "./kit/pronouns";
import { notesOfJournal, pulseFromReports, type CodexPulse } from "./codex-data";
import {
  OV_NOTE_ROWS,
  accountOverview,
  bodyGlance,
  fordEyebrow,
  fordGlance,
  goalsOverview,
  notesGlance,
  overviewModel,
  pulseGlance,
  storyGlance,
  type OverviewInput,
} from "./overview-model";

/*
 * Run under TZ=America/New_York (the date trap). The studio's day is fixed so
 * every "in 17 days" and "Mar 10" is known.
 */
const TODAY = "2027-03-16";
const NOW = new Date(2027, 2, 16, 12);
const SHE = pronounsOf({ gender: "Female" });
const HE = pronounsOf({ gender: "Male" });
const THEY = pronounsOf(null);
const noon = (day: string) => new Date(`${day}T12:00:00-05:00`);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
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

const focus = (over: Partial<ClientFocus> & { id: string }): ClientFocus =>
  ({
    clientId: "c1",
    studioId: "westlake",
    trainerId: "uid-aj",
    trainerName: "AJ",
    trainerInitials: "AJ",
    category: "Pace",
    intent: "Slow the lower turnaround on Leg Press. No bounce.",
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

/** A saved Pulse round as the progress-reports listener hands it over (raw). */
const round = (id: string, date: string, answers: Record<string, number>, painMap: unknown[] = []) => ({
  id,
  clientId: "c1",
  status: "Finalized",
  date,
  trainerName: "Jess Moreno",
  createdAt: noon(date),
  updatedAt: noon(date),
  subjective: {
    scaleVersion: 2,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { value: v }])),
    painMap,
  },
});

const knee = (severity: number) => ({
  id: "p-knee",
  region: "knee",
  side: "right",
  type: "joint",
  severity,
  frequency: "occasional",
  aggravatingMachineIds: [],
  linkedJournalEntryIds: [],
  status: "active",
});

/** The Pulse as the shell derives it: the raw page, newest first, from the profile's listener. */
const pulseOf = (...rounds: ReturnType<typeof round>[]): CodexPulse =>
  pulseFromReports(rounds.slice().sort((a, b) => b.date.localeCompare(a.date)) as never, "c1", "ready");

const carolClient = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    mindbodyClientId: "100004418",
    firstName: "Carol",
    lastName: "Brennan",
    gender: "Female",
    dateOfBirth: "1958-04-02",
    homeStudioId: "westlake",
    approvedCrossTrainStudioIds: ["solon"],
    isActive: true,
    remainingSessions: 0,
    height: "5'0\"",
    wingspan: "59",
    occupation: "Dental hygienist",
    isRetired: true,
    clinicalFlags: ["gen-blood-pressure", "joint-tka"],
    globalNotes: "“Keep up with my granddaughters, and walk the Camino with Tom before my knees say no.”",
    smartGoal: "10 miles two days running, a Camino rehearsal",
    goalTargetDate: "2027-05-01",
    discoveryNotes: "Talk her through the first rep. She goes quiet when she's working hard, and that's a good sign.\n\nNever rush the set-up.",
    emergencyContactName: "Tom Brennan",
    emergencyContactRelationship: "husband",
    inbodySummary: { scanCount: 2, firstTestedAt: "2026-10-02", latestTestedAt: "2027-03-03" },
    priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker" },
    ...over,
  }) as Client;

const carolEntries = [
  entry({
    id: "crit",
    kind: "injury",
    importance: "critical",
    machineId: "m-leg",
    body: "Right knee. Stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer.",
    authorName: "AJ Jurgens",
    authorInitials: "AJ",
    occurredAt: noon("2027-03-04"),
  }),
  entry({ id: "crit-u1", threadId: "crit", body: "Seat 7 held.", occurredAt: noon("2027-03-09") }),
  entry({
    id: "heads",
    kind: "injury",
    importance: "elevated",
    body: "Left shoulder sore from pruning. Keep Overhead Press to an easy range this week.",
    occurredAt: noon("2027-03-15"),
    effectiveUntil: noon("2027-03-22"),
  }),
  entry({ id: "tip", kind: "coaching", body: "Slow on the way down.", occurredAt: noon("2026-12-02") }),
  entry({ id: "old", body: "Left wrist sore.", occurredAt: noon("2026-10-01"), resolvedAt: noon("2026-11-01") }),
];

const READY = { notes: "ready", focuses: "ready", sessions: "ready" } as const;

function journalOf(entries: JournalEntry[], loadState: Record<string, string> = READY, focuses: ClientFocus[] = []) {
  const threads = assembleThreads(entries);
  const criticalEntries = entries.filter((e) => e.importance === "critical" && !e.resolvedAt && !e.threadId);
  return {
    threads,
    focuses,
    criticalEntries,
    loadState: loadState as unknown as OverviewInput["journal"]["loadState"],
    capped: false,
  };
}

const ready = <T,>(data: T): Src<T> => ({ status: "ready", data });

function storyOf(client: Client, over: Partial<StoryInput> = {}) {
  return buildStory({
    today: TODAY,
    client,
    coverage: "complete",
    totals: { total: 461, journey: 49, before: 412 },
    pronouns: SHE,
    notes: ready([] as NoteThread[]),
    focuses: ready([] as ClientFocus[]),
    ford: ready([] as FordEntry[]),
    inbody: ready([] as InBodyScan[]),
    pulse: ready(historyFromDocs([], 50)),
    ...over,
  });
}

const STUDIOS = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
];
const MACHINES = [{ id: "m-leg", name: "Leg Press" }];

/** A whole input: Carol, everything read, FORD open to this reader. */
function input(over: Partial<OverviewInput> = {}, entries = carolEntries): OverviewInput {
  const client = over.client ?? carolClient();
  // The fixtures always carry the critical notes the journal hook derives.
  const journal = (over.journal ?? journalOf(entries)) as ReturnType<typeof journalOf>;
  const fordEntries = [
    ford({ id: "fam", pillar: "family", body: "Married to Tom, 41 years this October.", isPinned: true }),
    ford({ id: "fam2", pillar: "family", body: "Granddaughter Ellie's first piano recital.", eventDate: noon("2027-04-20") }),
    ford({
      id: "card",
      pillar: "family",
      body: "Ellie's recital.",
      opportunity: { idea: "Good-luck card for Ellie", status: "idea", ownerTrainerId: null, ownerName: "Jess Moreno", plannedFor: null, doneAt: null, outcome: null },
    }),
    ford({
      id: "camino",
      pillar: "dreams",
      body: "The Camino de Santiago with Tom: May 12, Sarria to Santiago, 100 km.",
      isPinned: true,
      opportunity: { idea: "“Buen Camino” send-off", status: "planned", ownerTrainerId: null, ownerName: null, plannedFor: noon("2027-05-10"), doneAt: null, outcome: null },
    }),
  ];
  return {
    client,
    today: TODAY,
    access: { fordReadable: true, fordWritable: true, homeStudioName: "Westlake" },
    pronouns: SHE,
    machines: MACHINES,
    notes: notesOfJournal(journal, TODAY),
    journal,
    ford: {
      status: "ready",
      entries: fordEntries,
      buckets: groupByPillar(fordEntries).buckets,
      oneLine: ford({
        id: "one-line",
        pillar: null,
        kind: "one-line",
        isArchived: true,
        body: "Retired hygienist, pickleball regular, walking the Camino with Tom in May.",
        authorName: "Jess Moreno",
        occurredAt: noon("2027-03-15"),
      }),
    },
    fordStatus: "ready",
    pulse: pulseOf(round("r1", "2027-01-10", { sleepRecovery_2: 5 }, [knee(5)]), round("r2", "2027-03-10", { sleepRecovery_2: 8 }, [knee(3)])),
    story: storyOf(client),
    studios: STUDIOS,
    ...over,
  };
}

/** Every string the model holds, for the "never" checks. */
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object") return Object.values(value).flatMap(allText);
  return [];
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

describe("notesGlance", () => {
  it("counts the zones and lists the loudest open notes, critical first, machine named in full", () => {
    const g = notesGlance(input());
    expect(g.state).toBe("ready");
    expect(g.line).toBe("2 open, 1 critical · 1 standing · 1 resolved");
    expect(g.rows.map((r) => r.threadId)).toEqual(["crit", "heads"]);
    expect(g.rows[0]).toMatchObject({ importance: "critical", machine: "Leg Press" });
    // Whole first sentences, never cut and never an ellipsis.
    expect(g.rows[0].text).toBe(
      "Right knee. Stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer.",
    );
    expect(g.rows[0].meta).toBe("AJ · Mar 4 · matters always · 1 update");
    expect(g.rows[1]).toMatchObject({ importance: "elevated", machine: null });
    expect(g.allLabel).toBe("All 4 notes");
    expect(g.nothingOpen).toBeNull();
  });

  it(`lists at most ${OV_NOTE_ROWS} open notes`, () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `h${i}`, importance: "elevated", body: `Heads up ${i}.`, occurredAt: noon(`2027-03-1${i}`) }),
    );
    expect(notesGlance(input({}, many)).rows).toHaveLength(OV_NOTE_ROWS);
  });

  it("draws a critical note still waiting in the To-file tray, and says it is waiting", () => {
    const g = notesGlance(input({}, [entry({ id: "u", kind: "general", importance: "critical", body: "No overhead work." })]));
    expect(g.line).toBe("1 critical · 1 to file");
    expect(g.rows.map((r) => r.threadId)).toEqual(["u"]);
    expect(g.rows[0].meta).toContain("waiting to be filed");
  });

  it("says nothing is open, and where the standing notes are, when nothing is open", () => {
    const g = notesGlance(input({}, [entry({ id: "s", kind: "equipment", body: "Seat 7." })]));
    expect(g.rows).toEqual([]);
    expect(g.nothingOpen).toBe("Nothing open. 1 standing note is on Notes.");
  });

  it("says there are no notes IN JOURNEY only once they are read and there are none", () => {
    const g = notesGlance(input({}, []));
    expect(g).toMatchObject({ none: true, line: "No notes in Journey yet.", allLabel: "Notes" });
  });

  it("says loading, and a failed read in its own words, never 'no notes'", () => {
    const loading = notesGlance(input({ journal: journalOf(carolEntries, { notes: "loading", focuses: "ready", sessions: "ready" }) }));
    expect(loading).toMatchObject({ state: "loading", line: "Loading notes…", none: false, rows: [] });
    const failed = notesGlance(input({ journal: journalOf(carolEntries, { notes: "failed", focuses: "ready", sessions: "ready" }) }));
    expect(failed).toMatchObject({ state: "failed", line: "Notes couldn't be loaded, so nothing here is certain.", none: false });
    expect(failed.line).not.toMatch(/no notes/i);
  });

  it("says when the journal hit its guard rail", () => {
    const i = input();
    const g = notesGlance({ ...i, journal: { ...i.journal, capped: true } });
    expect(g.line).toMatch(/ · some older items not loaded$/);
  });
});

/* ------------------------------------------------------------------ */
/* FORD                                                                */
/* ------------------------------------------------------------------ */

describe("fordGlance", () => {
  it("leads with the In one line and who wrote it last", () => {
    const g = fordGlance(input());
    expect(g.line).toEqual({
      text: "Retired hygienist, pickleball regular, walking the Camino with Tom in May.",
      meta: "Written by the team · last by Jess Moreno, Mar 15",
    });
    expect(g.lineMissing).toBeNull();
    expect(g.writeLine).toBe(false);
  });

  it("gives each pillar its first standing fact, her work off the record, and FORD's counts", () => {
    const g = fordGlance(input());
    const byPillar = Object.fromEntries(g.tiles.map((t) => [t.pillar, t]));
    expect(g.tiles.map((t) => t.label)).toEqual(["Family", "Occupation", "Recreation", "Dreams"]);
    expect(byPillar.family).toMatchObject({ lead: "Married to Tom, 41 years this October.", meta: "3 details · 1 idea", empty: null, ask: null });
    // Occupation leads with the work sentence the Work band reads.
    expect(byPillar.occupation.lead).toMatch(/Dental hygienist/);
    expect(byPillar.dreams.meta).toBe("1 detail · 1 planned");
  });

  it("says a pillar holds nothing only once FORD answered, and asks FORD's own question, retirement-aware", () => {
    const g = fordGlance(input());
    const recreation = g.tiles.find((t) => t.pillar === "recreation")!;
    expect(recreation.empty).toBe("Nothing on file yet.");
    const q = askNext("recreation", { retired: true, seed: NOW, entries: input().ford.entries }).question;
    expect(recreation.ask).toBe(`Ask: “${q}”`);
    // A retired client is never asked about work (the occupation tile has a lead, so no ask).
    expect(g.tiles.find((t) => t.pillar === "occupation")!.ask).toBeNull();
  });

  it("lists Coming up within two months — her Mindbody birthday first — coloured by urgency", () => {
    const g = fordGlance(input());
    expect(g.dates).toEqual([
      { key: "birthday", when: "in 17 days", urgency: "soon", what: "Her 69th birthday · Apr 2" },
      { key: "fam2", when: "in 5 weeks", urgency: "later", what: "Granddaughter Ellie's first piano recital. · Apr 20" },
    ]);
    expect(g.datesEmpty).toBeNull();
  });

  it("lists the open gestures with who is doing each, and says when nobody is yet", () => {
    const g = fordGlance(input());
    expect(g.gestures).toEqual([
      { key: "camino", status: "Planned", idea: "“Buen Camino” send-off", owner: "no owner yet" },
      { key: "card", status: "Idea", idea: "Good-luck card for Ellie", owner: "Jess Moreno" },
    ]);
  });

  it("says what is missing once FORD answered with nothing, and offers the line only to a writer", () => {
    const base = input();
    const empty = { ...base, ford: { status: "ready" as const, entries: [], buckets: groupByPillar([]).buckets, oneLine: null } };
    const g = fordGlance({ ...empty, client: carolClient({ dateOfBirth: "", occupation: "", isRetired: false }) });
    expect(g.lineMissing).toBe("No line yet.");
    expect(g.writeLine).toBe(true);
    expect(g.tiles.every((t) => t.empty === "Nothing on file yet." && t.ask?.startsWith("Ask: “"))).toBe(true);
    expect(g.datesEmpty).toBe("No dates in the next two months.");
    expect(g.gesturesEmpty).toBe("No ideas yet.");
    const reader = fordGlance({ ...empty, access: { ...empty.access, fordWritable: false } });
    expect(reader.writeLine).toBe(false);
  });

  it("says whose FORD it is to a reader the rule refuses, and nothing of it", () => {
    for (const fordStatus of ["off", "denied"] as const) {
      const g = fordGlance(input({ fordStatus, access: { fordReadable: fordStatus === "denied", fordWritable: false, homeStudioName: "Westlake" } }));
      expect(g.state).toBe("off");
      expect(g.notice).toBe("FORD is kept by Westlake. It opens for the people who work there.");
      expect(g.tiles).toEqual([]);
      expect(g.line).toBeNull();
      expect(g.dates).toBeNull();
      expect(allText(g).join(" ")).not.toContain("Married to Tom");
    }
    const unnamed = fordGlance(input({ fordStatus: "off", access: { fordReadable: false, fordWritable: false, homeStudioName: null } }));
    expect(unnamed.notice).toBe("FORD is kept by the home studio. It opens for the people who work there.");
  });

  it("while FORD loads, shows counts the tab holds — never the client document's copied lines", () => {
    const client = carolClient({
      fordSummary: {
        counts: { family: 3, occupation: 0, recreation: 0, dreams: 1 },
        untagged: 0,
        pinned: { family: ["Married to Tom (copied onto the record)"] },
        nextDate: null,
        openOpportunities: 2,
        updatedAt: "",
      },
    } as Partial<Client>);
    const g = fordGlance(input({ client, fordStatus: "loading", ford: { ...input().ford, status: "loading" } }));
    expect(g.state).toBe("loading");
    expect(g.notice).toBe("Reading FORD… 4 details on file.");
    // No tiles until FORD answered: an empty tile would read as nothing on file.
    expect(g.tiles).toEqual([]);
    expect(allText(g).join(" ")).not.toContain("copied onto the record");
    expect(allText(g).join(" ")).not.toContain("Nothing on file yet");
    expect(g.dates).toBeNull();
    expect(g.gestures).toBeNull();
    const noSummary = fordGlance(input({ fordStatus: "loading", ford: { ...input().ford, status: "loading" } }));
    expect(noSummary.notice).toBe("Reading FORD…");
  });

  it("says a failed read in FORD's own words, never 'nothing on file'", () => {
    const g = fordGlance(input({ fordStatus: "failed", ford: { ...input().ford, status: "failed" } }));
    expect(g.state).toBe("failed");
    expect(g.notice).toBe(FORD_READ_NOTICE.failed);
    expect(g.tiles).toEqual([]);
    expect(allText(g).join(" ")).not.toContain("Nothing on file yet");
    const noStudio = fordGlance(
      input({ client: carolClient({ homeStudioId: "" }), fordStatus: "failed", ford: { ...input().ford, status: "failed" } }),
    );
    expect(noStudio.notice).toBe(FORD_READ_NOTICE.noStudio);
  });

  it("names the slot with her pronoun", () => {
    expect(fordEyebrow(SHE)).toBe("Who she is · FORD");
    expect(fordEyebrow(HE)).toBe("Who he is · FORD");
    expect(fordEyebrow(THEY)).toBe("Who they are · FORD");
  });
});

/* ------------------------------------------------------------------ */
/* Body & Pulse                                                        */
/* ------------------------------------------------------------------ */

describe("bodyGlance", () => {
  it("says where she sits against the machines, with her height and wingspan", () => {
    expect(bodyGlance(input()).lede).toBe(`Shorter than our machines are set for: 5'0", with a 4'11" wingspan.`);
    expect(bodyGlance(input({ client: carolClient({ wingspan: "" }) })).lede).toBe(`Shorter than our machines are set for: 5'0".`);
  });

  it("says a missing height, and an unreadable one, in Build's own words", () => {
    expect(bodyGlance(input({ client: carolClient({ height: "" }) })).lede).toBe(
      "No height on file, so machine set-up can't be matched to her.",
    );
    expect(bodyGlance(input({ client: carolClient({ height: "tall" }) })).lede).toMatch(/isn't one the app can read/);
  });

  it("chips the flags as Watch-outs does and QUOTES the first every-set instruction verbatim", () => {
    const g = bodyGlance(input());
    expect(g.chips.map((c) => c.id).sort()).toEqual(["gen-blood-pressure", "joint-tka"]);
    const matrix = CLINICAL_FLAGS_MATRIX.find((f) => f.id === "gen-blood-pressure")!;
    const general = matrix.protocolHandling!.filter((r) => (r.affectedMachineIds ?? []).length === 0)[0].instruction;
    expect(g.everySet).toEqual({ quote: general, more: 0 });
    expect(g.everySet?.quote).toBe("Keep the breathing continuous on every set — no breath-holding under load.");
    expect(g.chipsEmpty).toBeNull();
  });

  it("says no flags are on file, and leaves the clinical list out of the source line", () => {
    const g = bodyGlance(input({ client: carolClient({ clinicalFlags: [] }) }));
    expect(g.chips).toEqual([]);
    expect(g.chipsEmpty).toBe("No clinical flags on file.");
    expect(g.everySet).toBeNull();
    expect(g.foot).toBe("Pulse Mar 10 · InBody Mar 3");
  });

  it("names where its lines come from", () => {
    expect(bodyGlance(input()).foot).toBe("Watch-outs quoted from the studio's clinical list · Pulse Mar 10 · InBody Mar 3");
  });
});

describe("pulseGlance", () => {
  it("quotes Sleep & Recovery verbatim with its word and the last different one, then the pain map", () => {
    const g = pulseGlance(input().pulse, SHE, NOW);
    expect(g.label).toBe("She says:");
    expect(g.text).toBe("“I wake up feeling rested.” Often, up from Sometimes in January. Right knee Mild, was Moderate in January.");
  });

  it("dates an answer from a round older than the newest, so an old word is never read as today's", () => {
    // The newest round (Mar 10, the footer's day) asked only about strength;
    // Sleep and the pain map were last answered on Feb 10.
    const pulse = pulseOf(
      round("r1", "2027-01-05", { sleepRecovery_2: 5 }, [knee(5)]),
      round("r2", "2027-02-10", { sleepRecovery_2: 8 }, [knee(3)]),
      round("r3", "2027-03-10", { strengthConfidence_1: 10 }),
    );
    expect(pulseGlance(pulse, SHE, NOW).text).toBe(
      "“I wake up feeling rested.” Often (Feb 10), up from Sometimes in January. Right knee Mild (Feb 10), was Moderate in January.",
    );
    expect(bodyGlance(input({ pulse })).foot).toMatch(/Pulse Mar 10/);
  });

  it("says no 'was' from one round (a minimum sample of two)", () => {
    const g = pulseGlance(pulseOf(round("r2", "2027-03-10", { sleepRecovery_2: 8 }, [knee(3)])), SHE, NOW);
    expect(g.text).toBe("“I wake up feeling rested.” Often, Mar 10. Right knee Mild.");
    expect(g.text).not.toMatch(/\bwas\b|up from|down from/);
  });

  it("with no Sleep answer, quotes the first answered area in the Pulse's own order", () => {
    const g = pulseGlance(pulseOf(round("r2", "2027-03-10", { strengthConfidence_1: 10, mentalEmotional_1: 3 })), HE, NOW);
    expect(g.label).toBe("He says:");
    expect(g.text).toMatch(/^“[^”]+” Nearly always, Mar 10\.$/);
    expect(g.text).not.toContain("Rarely");
  });

  it("says loading, failed and none each in its own words", () => {
    expect(pulseGlance({ status: "loading", history: null }, SHE, NOW)).toEqual({ label: null, text: "Loading the Pulse…" });
    expect(pulseGlance({ status: "failed", history: null }, THEY, NOW)).toEqual({
      label: null,
      text: "The Pulse couldn't be loaded, so what they say isn't shown here.",
    });
    expect(pulseGlance(pulseOf(), SHE, NOW)).toEqual({ label: null, text: "No Pulse saved in Journey yet." });
  });

  it("never gives a number, a percentage or a traffic light", () => {
    const text = pulseGlance(input().pulse, SHE, NOW).text;
    expect(text).not.toMatch(/\d\s*%|\/\s*10|\b(Red|Yellow|Green)\b/);
  });
});

/* ------------------------------------------------------------------ */
/* Goals & Focus                                                       */
/* ------------------------------------------------------------------ */

describe("goalsOverview", () => {
  it("quotes her why, the goal, the newest focus and the first of the coach strategy", () => {
    const i = input({ journal: journalOf(carolEntries, READY, [focus({ id: "f1" })]) });
    const g = goalsOverview(i);
    expect(g.why).toBe("Keep up with my granddaughters, and walk the Camino with Tom before my knees say no.");
    expect(g.whyMissing).toBeNull();
    expect(g.lines[0]).toEqual({ label: "Working toward:", text: "10 miles two days running, a Camino rehearsal · target May 1, 2027" });
    expect(g.lines[1].label).toBe("Focus ·");
    expect(g.lines[1].text).toMatch(/^Pace: Slow the lower turnaround on Leg Press\. No bounce\. · AJ, /);
    expect(g.lines[2]).toMatchObject({
      label: "How to coach her:",
      text: "Talk her through the first rep. She goes quiet when she's working hard, and that's a good sign.",
    });
    expect(g.foot).toBe("1 focus running");
  });

  it("says what is not written yet, once it is known", () => {
    const client = carolClient({ globalNotes: "", smartGoal: "", goalTargetDate: "", discoveryNotes: "" });
    const g = goalsOverview(input({ client }, [entry({ id: "x", kind: "equipment", body: "Seat 7." })]));
    expect(g.why).toBeNull();
    expect(g.whyMissing).toBe("Her why isn't written down yet.");
    expect(g.lines.map((l) => `${l.label} ${l.text}`)).toEqual([
      "Working toward: nothing set yet.",
      "Focus: none running.",
      "How to coach her: not written yet.",
    ]);
  });

  it("says loading and couldn't-load for the focuses and the notes, never 'none'", () => {
    const client = carolClient({ discoveryNotes: "" });
    const loading = goalsOverview(input({ client, journal: journalOf(carolEntries, { notes: "loading", focuses: "loading", sessions: "ready" }) }));
    expect(loading.lines.slice(1).map((l) => l.text)).toEqual(["loading…", "loading…"]);
    const failed = goalsOverview(input({ client, journal: journalOf(carolEntries, { notes: "failed", focuses: "failed", sessions: "ready" }) }));
    expect(failed.lines.slice(1).map((l) => l.text)).toEqual(["the focuses couldn't be loaded.", "her notes couldn't be loaded."]);
  });

  it("with no strategy, leads with her first coaching note, its machine and its author", () => {
    const client = carolClient({ discoveryNotes: "" });
    const g = goalsOverview(
      input({ client }, [
        entry({ id: "t1", kind: "coaching", importance: "elevated", machineId: "m-leg", body: "Count her down on the last rep. She likes it." }),
      ]),
    );
    expect(g.lines[2]).toEqual({
      label: "How to coach her:",
      text: "Leg Press: Count her down on the last rep. She likes it. — Jess",
      importance: "elevated",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Story                                                               */
/* ------------------------------------------------------------------ */

describe("storyGlance", () => {
  it("leads with the Story's own since line and its three newest moments", () => {
    const client = carolClient({
      goalHistory: [{ goal: "Walk 5 miles without stopping", achievedAt: "2027-01-23T15:00:00Z", byName: "AJ" }],
    } as Partial<Client>);
    const story = storyOf(client, {
      pulse: ready(
        historyFromDocs(
          [round("r2", "2027-03-10", { strengthConfidence_1: 8 }), round("r1", "2026-12-10", { strengthConfidence_1: 3 })] as never,
          50,
        ),
      ),
    });
    const g = storyGlance(input({ client, story }));
    expect(g.lede).toBe(story.sinceLine);
    expect(g.lede).toContain("412 sessions in FileMaker before Journey, and 49 in Journey.");
    expect(g.rows).toHaveLength(3);
    expect(g.rows[0].day).toBe("Mar 10");
    // A Pulse moment carries the statement that moved, verbatim, in its words.
    expect(g.rows[0].text).toMatch(/“[^”]+” Often, was Rarely\.$/);
    expect(g.empty).toBeNull();
    expect(g.unread).toBeNull();
    // Prior history is real history.
    expect(allText(g).join(" ")).not.toMatch(/\bnew\b|First session\./);
  });

  it("says nothing is dated yet only when nothing is unknown", () => {
    const client = carolClient({ priorHistory: undefined, mindbodyClientId: "" } as Partial<Client>);
    const story = storyOf(client, { totals: { total: 0, journey: 0, before: 0 } });
    const g = storyGlance(input({ client, story }));
    expect(g.rows).toEqual([]);
    expect(g.empty).toBe("Nothing dated yet. It fills in as the team records things.");
  });

  it("says what could not be read, and then never 'nothing dated yet'", () => {
    const client = carolClient({ priorHistory: undefined });
    const pending = storyGlance(input({ client, story: storyOf(client, { notes: { status: "loading" }, ford: { status: "loading" } }) }));
    expect(pending.unread).toBe("Still reading notes and FORD, so a moment may be missing.");
    expect(pending.empty).toBeNull();
    const failed = storyGlance(input({ client, story: storyOf(client, { inbody: { status: "failed" } }) }));
    expect(failed.unread).toBe("Couldn't read InBody scans here, so a moment may be missing.");
    const off = storyGlance(input({ client, story: storyOf(client, { ford: { status: "off" } }) }));
    expect(off.unread).toBe("FORD is kept by the home studio, so FORD moments aren't shown here.");
  });

  it("says when she started isn't on file when the Story cannot say", () => {
    const story = { ...storyOf(carolClient()), sinceLine: null };
    expect(storyGlance(input({ story })).lede).toBe("When she started isn't on file yet.");
  });
});

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

describe("accountOverview", () => {
  it("is Account's own glance, in its two columns", () => {
    const i = input();
    const g = accountOverview(i);
    const own = accountGlance(i.client, STUDIOS, TODAY, NOW);
    expect(g.who).toEqual(own.who);
    expect(g.membership).toEqual(own.membership);
    expect(g.who[0]).toBe("68, turns 69 on Apr 2 · Female");
    expect(g.membership).toContain("Home: Westlake · also trains at Solon");
    expect(g.empty).toBeNull();
    expect(g.foot).toBe(own.foot);
  });

  it("says nothing is on file for a client typed into Journey with nothing on it", () => {
    const client = carolClient({
      mindbodyClientId: "",
      dateOfBirth: "",
      gender: "",
      emergencyContactName: "",
      homeStudioId: "",
      approvedCrossTrainStudioIds: [],
    } as Partial<Client>);
    const g = accountOverview(input({ client }));
    expect(g).toMatchObject({ who: [], membership: [], empty: "Nothing on file for the account yet." });
    expect(g.foot).toBe("Typed in Journey · not linked to Mindbody");
  });
});

/* ------------------------------------------------------------------ */
/* The whole front page                                                */
/* ------------------------------------------------------------------ */

describe("overviewModel", () => {
  it("is the six slots, and never a score, an ellipsis it added, or the client's name", () => {
    const m = overviewModel(input());
    expect(Object.keys(m)).toEqual(["notes", "ford", "body", "goals", "story", "account"]);
    const text = allText(m).join("\n");
    expect(text).not.toMatch(/\d\s*%|\/\s*10\b|\b(Red|Yellow|Green)\b/);
    expect(text).not.toContain("…”");
    expect(text).not.toContain("Carol");
  });
});
