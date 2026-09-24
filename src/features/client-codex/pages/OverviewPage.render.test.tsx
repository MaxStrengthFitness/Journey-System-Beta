// @vitest-environment jsdom
/**
 * THE OVERVIEW, MOUNTED (client codex, phase 18).
 *
 * The page works out every slot during render (`overviewModel`, memoised on
 * the tab's one load), so only a mount proves what a trainer sees. Four
 * clients, as the plan names them:
 *
 *   full       Carol: notes, FORD with its In one line, flags, two Pulse
 *              rounds, a goal and a focus, a FileMaker past, a package;
 *   sparse     six sessions in Journey, two FORD details, no Pulse, no
 *              flags, no line;
 *   migrating  180 sessions before Journey, a story Journey holds only part
 *              of — never "new", never "First session.";
 *   failed     every read the tab makes failed: each slot says so in its
 *              own words, and never what it says when something is missing.
 *
 * And for each: the slots in AJ's order; each slot's lede and lines are the
 * model's words; a whole-slot door holds no other button; no ellipsis, no
 * percentage, no Tailwind size; the doors land where they say (a note on
 * Notes, the composer, a FORD pillar's card, the In one line, a page).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../../types";
import type { ClientFocus, JournalEntry } from "../../../types/journal";
import type { FordEntry } from "../../ford/types";
import type { InBodyScan } from "../../inbody/types";
import { assembleThreads, type NoteThread } from "../../client-notes/threads";
import { groupByPillar } from "../../ford/ford-rollup";
import { FORD_READ_NOTICE } from "../../ford/read-status";
import { buildStory, type Src, type StoryInput } from "../../client-story/story";
import { pronounsOf } from "../kit/pronouns";
import { notesOfJournal, pulseFromReports, type CodexData, type CodexPageProps, type CodexPulse } from "../codex-data";
import { overviewModel, type OverviewInput } from "../overview-model";
import { OverviewPage } from "./OverviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2027-03-16";
const SHE = pronounsOf({ gender: "Female" });
const noon = (day: string) => new Date(`${day}T12:00:00-05:00`);
const ready = <T,>(data: T): Src<T> => ({ status: "ready", data });

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

const round = (id: string, date: string, answers: Record<string, number>) => ({
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
  },
});

const pulseOf = (...rounds: ReturnType<typeof round>[]): CodexPulse =>
  pulseFromReports(rounds.slice().sort((a, b) => b.date.localeCompare(a.date)) as never, "c1", "ready");

const STUDIOS = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
];

type Load = "ready" | "loading" | "failed";

interface Fixture {
  client: Client;
  entries?: JournalEntry[];
  focuses?: ClientFocus[];
  notes?: Load;
  focusesLoad?: Load;
  fordEntries?: FordEntry[];
  oneLine?: FordEntry | null;
  fordStatus?: OverviewInput["fordStatus"];
  fordWritable?: boolean;
  fordReadable?: boolean;
  pulse?: CodexPulse;
  inbody?: Load;
  totals?: StoryInput["totals"];
  coverage?: StoryInput["coverage"];
}

/** The tab's one load, as the shell hands it to the page. */
function dataOf(f: Fixture): { data: CodexData; input: OverviewInput } {
  const notesLoad = f.notes ?? "ready";
  const focusesLoad = f.focusesLoad ?? "ready";
  const entries = f.entries ?? [];
  const threads = assembleThreads(entries);
  const journal = {
    entries,
    threads,
    focuses: f.focuses ?? [],
    criticalEntries: entries.filter((e) => e.importance === "critical" && !e.resolvedAt && !e.threadId),
    loadState: { notes: notesLoad, focuses: focusesLoad, sessions: "ready" },
    capped: false,
    isLoading: false,
    needsIndex: false,
  } as unknown as CodexData["journal"];
  const fordStatus = f.fordStatus ?? "ready";
  const fordEntries = f.fordEntries ?? [];
  const fordRead = {
    status: fordStatus === "off" ? "loading" : fordStatus,
    entries: fordStatus === "ready" ? fordEntries : [],
    buckets: groupByPillar(fordStatus === "ready" ? fordEntries : []).buckets,
    untagged: [],
    upcoming: [],
    isLoading: fordStatus === "loading",
    oneLine: fordStatus === "ready" ? (f.oneLine ?? null) : null,
  } as unknown as CodexData["ford"];
  const pulse = f.pulse ?? pulseOf();
  const src = <T,>(load: Load, data: T): Src<T> =>
    load === "ready" ? ready(data) : load === "failed" ? { status: "failed" } : { status: "loading" };
  const story = buildStory({
    today: TODAY,
    client: f.client,
    coverage: f.coverage ?? "complete",
    totals: f.totals ?? null,
    pronouns: SHE,
    notes: src(notesLoad, threads as NoteThread[]),
    focuses: src(focusesLoad, (f.focuses ?? []) as ClientFocus[]),
    ford:
      fordStatus === "ready"
        ? ready(fordEntries)
        : fordStatus === "failed"
          ? { status: "failed" }
          : fordStatus === "loading"
            ? { status: "loading" }
            : { status: "off" },
    inbody: src(f.inbody ?? "ready", [] as InBodyScan[]),
    pulse:
      pulse.status === "ready" && pulse.history
        ? ready(pulse.history)
        : pulse.status === "failed"
          ? { status: "failed" }
          : { status: "loading" },
  });
  const input: OverviewInput = {
    client: f.client,
    today: TODAY,
    access: {
      fordReadable: f.fordReadable ?? fordStatus !== "off",
      fordWritable: f.fordWritable ?? fordStatus === "ready",
      homeStudioName: "Westlake",
    },
    pronouns: SHE,
    machines: [{ id: "m-leg", name: "Leg Press" }],
    notes: notesOfJournal(journal, TODAY),
    journal,
    ford: fordRead,
    fordStatus,
    pulse,
    story,
    studios: STUDIOS,
  };
  const data = {
    ...input,
    availableStudios: STUDIOS,
    authTrainer: null,
    author: { id: "uid-ann", initials: "AT", fullName: "Ann Trainer" },
    trainers: [],
    focusesRunning: null,
    inbody: { scans: [], loading: false, error: f.inbody === "failed" ? new Error("x") : null },
    progressReports: [],
    dismissals: { dismissed: {}, status: "ready" },
    sessionTotals: f.totals ?? { total: null, journey: null, before: 0 },
    coverage: f.coverage ?? "complete",
    programming: { clientSettings: {}, routines: [], studioClients: [], activeStudioId: null, status: "ready" },
  } as unknown as CodexData;
  return { data, input };
}

/* Carol: everything on file. */
const carol = (over: Partial<Client> = {}): Client =>
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
    globalNotes: "Keep up with my granddaughters, and walk the Camino with Tom before my knees say no.",
    smartGoal: "10 miles two days running, a Camino rehearsal",
    goalTargetDate: "2027-05-01",
    discoveryNotes: "Talk her through the first rep. She goes quiet when she's working hard, and that's a good sign.",
    emergencyContactName: "Tom Brennan",
    emergencyContactRelationship: "husband",
    inbodySummary: { scanCount: 2, firstTestedAt: "2026-10-02", latestTestedAt: "2027-03-03" },
    priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker" },
    ...over,
  }) as Client;

const FULL: Fixture = {
  client: carol(),
  entries: [
    entry({
      id: "crit",
      importance: "critical",
      machineId: "m-leg",
      body: "Right knee. Stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer.",
      authorName: "AJ Jurgens",
      occurredAt: noon("2027-03-04"),
    }),
    entry({
      id: "heads",
      importance: "elevated",
      body: "Left shoulder sore from pruning. Keep Overhead Press to an easy range this week.",
      occurredAt: noon("2027-03-15"),
      effectiveUntil: noon("2027-03-22"),
    }),
    entry({ id: "tip", kind: "coaching", body: "Slow on the way down.", occurredAt: noon("2026-12-02") }),
  ],
  focuses: [
    {
      id: "f1",
      clientId: "c1",
      trainerName: "AJ",
      trainerInitials: "AJ",
      category: "Pace",
      intent: "Slow the lower turnaround on Leg Press.",
      status: "active",
      startedAt: noon("2027-03-02"),
    } as unknown as ClientFocus,
  ],
  fordEntries: [
    ford({ id: "fam", pillar: "family", body: "Married to Tom, 41 years this October.", isPinned: true }),
    ford({ id: "rec", pillar: "recreation", body: "Pickleball Tue & Thu mornings at the rec centre.", isPinned: true }),
    ford({
      id: "camino",
      pillar: "dreams",
      body: "The Camino de Santiago with Tom: May 12, Sarria to Santiago, 100 km.",
      isPinned: true,
      opportunity: { idea: "Buen Camino send-off", status: "planned", ownerTrainerId: "uid-aj", ownerName: "AJ Jurgens", plannedFor: noon("2027-05-10"), doneAt: null, outcome: null },
    }),
  ],
  oneLine: ford({
    id: "one-line",
    pillar: null,
    isArchived: true,
    body: "Retired hygienist, pickleball regular, walking the Camino with Tom in May.",
    authorName: "Jess Moreno",
    occurredAt: noon("2027-03-15"),
  }),
  pulse: pulseOf(round("r1", "2027-01-10", { sleepRecovery_2: 5 }), round("r2", "2027-03-10", { sleepRecovery_2: 8 })),
  totals: { total: 461, journey: 49, before: 412 },
};

const SPARSE: Fixture = {
  client: carol({
    clinicalFlags: [],
    priorHistory: undefined,
    globalNotes: "",
    smartGoal: "",
    goalTargetDate: "",
    discoveryNotes: "",
    inbodySummary: undefined,
    emergencyContactName: "",
    firstSessionDate: noon("2027-02-01"),
  } as Partial<Client>),
  entries: [],
  fordEntries: [
    ford({ id: "fam", pillar: "family", body: "Two grandsons in Columbus.", isPinned: true }),
    ford({ id: "occ", pillar: "occupation", body: "Retired from the post office in 2019." }),
  ],
  oneLine: null,
  pulse: pulseOf(),
  totals: { total: 6, journey: 6, before: 0 },
};

const MIGRATING: Fixture = {
  client: carol({
    priorHistory: { sessions: 180, importedCount: 0, from: "2021-05-01", through: "2027-03-01", source: "filemaker" },
    firstSessionDate: noon("2027-03-02"),
  } as Partial<Client>),
  entries: [],
  fordEntries: [],
  oneLine: null,
  pulse: pulseOf(),
  totals: { total: 183, journey: 3, before: 180 },
  coverage: "partial",
};

const FAILED: Fixture = {
  client: carol(),
  notes: "failed",
  focusesLoad: "failed",
  fordStatus: "failed",
  pulse: { status: "failed", history: null },
  inbody: "failed",
  totals: { total: 461, journey: 49, before: 412 },
};

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let mounted: { root: Root; host: HTMLElement }[] = [];

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

async function mount(f: Fixture) {
  const { data, input } = dataOf(f);
  const go = vi.fn();
  const props: CodexPageProps = { data, form: {} as CodexPageProps["form"], go, hosts: {} as CodexPageProps["hosts"] };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <div className="cx">
          <OverviewPage {...props} />
        </div>
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, go, model: overviewModel(input) };
}

const slots = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>(".cx-ov > .cx-slot"));
const slot = (host: HTMLElement, cls: string) => host.querySelector<HTMLElement>(`.cx-ov-${cls}`)!;
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const text = (el: Element | null | undefined) => squash(el?.textContent ?? "");
const buttonIn = (root: ParentNode, words: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => text(b) === words) ??
  Array.from(root.querySelectorAll("button")).find((b) => text(b).includes(words));
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

/** The checks every fixture passes. */
async function expectTheContract(f: Fixture) {
  const { host, model } = await mount(f);
  expect(slots(host).map((s) => text(s.querySelector(".cx-eyebrow")))).toEqual([
    "Notes",
    "Who she is · FORD",
    "Body & Pulse",
    "Goals & Focus",
    "Story",
    "Account · contact and membership",
  ]);
  // The four whole-slot doors are one button each, holding no other control.
  for (const name of ["body", "goals", "story", "account"]) {
    const s = slot(host, name);
    expect(s.tagName, name).toBe("BUTTON");
    expect(s.querySelector("button, a, input, select, textarea"), name).toBeNull();
  }
  // Each slot says the model's words.
  const page = text(host);
  const says = (el: HTMLElement, words: string | null | undefined, what: string) => {
    if (words) expect(text(el), what).toContain(squash(words));
  };
  expect(page).toContain(model.notes.line);
  // FORD: the notice, or the line (or its absence), every tile, the dates and the gestures.
  const ford = slot(host, "ford");
  says(ford, model.ford.notice, "FORD notice");
  says(ford, model.ford.line?.text, "In one line");
  says(ford, model.ford.line?.meta, "In one line's meta");
  says(ford, model.ford.lineMissing, "no line yet");
  const tiles = Array.from(ford.querySelectorAll<HTMLElement>(".cx-ov-pillar"));
  expect(tiles.map((t) => t.getAttribute("data-pillar"))).toEqual(model.ford.tiles.map((t) => t.pillar));
  model.ford.tiles.forEach((t, i) => {
    for (const w of [t.label, t.lead, t.empty, t.ask, t.meta]) says(tiles[i], w, `${t.pillar} tile`);
  });
  for (const d of model.ford.dates ?? []) {
    says(ford, d.when, "Coming up");
    says(ford, d.what, "Coming up");
  }
  says(ford, model.ford.datesEmpty, "no dates");
  for (const g of model.ford.gestures ?? []) {
    says(ford, g.status, "Above and beyond");
    says(ford, `${g.idea} · ${g.owner}`, "Above and beyond");
  }
  says(ford, model.ford.gesturesEmpty, "no ideas");
  // Body & Pulse: the lede, the flag chips in the model's tones, the quote, what she says.
  const body = slot(host, "body");
  expect(text(body)).toContain(model.body.lede);
  const chips = Array.from(body.querySelectorAll(".cx-chip"));
  expect(chips.map((c) => [text(c), c.getAttribute("data-tone")])).toEqual(model.body.chips.map((c) => [c.text, c.tone]));
  says(body, model.body.chipsEmpty, "no flags");
  says(body, model.body.everySet?.quote, "every set");
  expect(text(body)).toContain(model.body.says.text);
  // Goals & Focus: her why (or its absence) and every line, label and words.
  const goals = slot(host, "goals");
  says(goals, model.goals.why, "her why");
  says(goals, model.goals.whyMissing, "no why");
  for (const l of model.goals.lines) {
    says(goals, l.importance ? l.label : `${l.label} ${l.text}`, l.label);
    says(goals, l.text, l.label);
  }
  says(goals, model.goals.foot, "goals footer");
  expect(text(slot(host, "story"))).toContain(model.story.lede);
  for (const r of model.story.rows) expect(text(slot(host, "story"))).toContain(r.text);
  for (const l of [...model.account.who, ...model.account.membership]) expect(text(slot(host, "account"))).toContain(l);
  // Never a score, a clipped line or a Tailwind size; the client's name is the header's.
  expect(page).not.toContain("…");
  expect(page).not.toMatch(/\d\s*%|\/\s*10\b/);
  expect(host.innerHTML).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b|\btruncate\b|line-clamp/);
  expect(page).not.toContain("Carol");
  return { host, model };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("OverviewPage — a full client", () => {
  it("keeps the contract", async () => {
    await expectTheContract(FULL);
  });

  it("lists the loudest open notes with their Loudness, and opens the thread on Notes", async () => {
    const { host, go } = await mount(FULL);
    const notes = slot(host, "notes");
    expect(text(notes)).toContain("2 open, 1 critical · 1 standing");
    const rows = Array.from(notes.querySelectorAll<HTMLElement>(".cx-row"));
    expect(rows.map((r) => r.querySelector(".cx-loud")?.getAttribute("data-tone"))).toEqual(["alert", "warn"]);
    expect(text(rows[0])).toContain("Leg Press: Right knee. Stop at 90° at the bottom turn.");
    await click(rows[0]);
    expect(go).toHaveBeenLastCalledWith("notes", "note-crit");
    await click(buttonIn(notes, "Write a note"));
    expect(go).toHaveBeenLastCalledWith("notes", "notes-compose");
    await click(buttonIn(notes, "All 3 notes"));
    expect(go).toHaveBeenLastCalledWith("notes");
  });

  it("gives FORD the most room: the In one line, four pillars that open their cards, Coming up and the gestures", async () => {
    const { host, go } = await mount(FULL);
    const f = slot(host, "ford");
    expect(text(f.querySelector('[data-testid="ov-one-line"]'))).toBe(
      "Retired hygienist, pickleball regular, walking the Camino with Tom in May.",
    );
    expect(text(f)).toContain("Written by the team · last by Jess Moreno, Mar 15");
    expect(buttonIn(f, "Write one")).toBeUndefined();
    const tiles = Array.from(f.querySelectorAll<HTMLElement>(".cx-ov-pillar"));
    expect(tiles.map((t) => t.getAttribute("data-pillar"))).toEqual(["family", "occupation", "recreation", "dreams"]);
    expect(text(tiles[0])).toContain("Married to Tom, 41 years this October.");
    await click(tiles[2]);
    expect(go).toHaveBeenLastCalledWith("ford", "ford-recreation");
    // The when is coloured by urgency, never by pillar.
    const when = f.querySelector(".cx-ov-when");
    expect(text(when)).toBe("in 17 days");
    expect(when?.getAttribute("data-urgency")).toBe("soon");
    expect(text(f)).toContain("Her 69th birthday · Apr 2");
    expect(text(f)).toContain("Buen Camino send-off · AJ Jurgens");
    await click(buttonIn(f, "Open FORD"));
    expect(go).toHaveBeenLastCalledWith("ford");
  });

  it("quotes the every-set watch-out verbatim from the clinical list, and says what she says in the Dial's words", async () => {
    const { host, go } = await mount(FULL);
    const b = slot(host, "body");
    expect(text(b.querySelector('[data-testid="ov-every-set"]'))).toBe(
      "Every set: “Keep the breathing continuous on every set — no breath-holding under load.”",
    );
    expect(text(b.querySelector('[data-testid="ov-says"]'))).toBe(
      "She says: “I wake up feeling rested.” Often, up from Sometimes in January.",
    );
    // Crimson only for an absolute contraindication: the chips carry the flags' own tones.
    expect(Array.from(b.querySelectorAll(".cx-chip")).length).toBe(2);
    expect(text(b)).toContain("Watch-outs quoted from the studio's clinical list · Pulse Mar 10 · InBody Mar 3");
    await click(b);
    expect(go).toHaveBeenLastCalledWith("body");
  });

  it("quotes her why and says how to coach her, and the whole slot opens Goals & Focus", async () => {
    const { host, go } = await mount(FULL);
    const g = slot(host, "goals");
    expect(text(g.querySelector(".cx-lede"))).toBe(
      "“Keep up with my granddaughters, and walk the Camino with Tom before my knees say no.”",
    );
    expect(text(g)).toContain("Working toward: 10 miles two days running, a Camino rehearsal · target May 1, 2027");
    expect(text(g)).toContain("Focus · Pace: Slow the lower turnaround on Leg Press.");
    expect(text(g)).toContain("How to coach her: Talk her through the first rep.");
    await click(g);
    expect(go).toHaveBeenLastCalledWith("goals");
  });

  it("tells her story from the Story's own line, and splits Account into its two columns", async () => {
    const { host, go } = await mount(FULL);
    expect(text(slot(host, "story"))).toContain("412 sessions in FileMaker before Journey, and 49 in Journey.");
    const columns = slot(host, "account").querySelectorAll(".cx-ov-acct > .cx-ov-lines");
    expect(columns).toHaveLength(2);
    expect(text(columns[0])).toContain("68, turns 69 on Apr 2 · Female");
    expect(text(columns[1])).toContain("Home: Westlake · also trains at Solon");
    await click(slot(host, "account"));
    expect(go).toHaveBeenLastCalledWith("account");
  });
});

describe("OverviewPage — a sparse client", () => {
  it("keeps the contract", async () => {
    await expectTheContract(SPARSE);
  });

  it("says what is missing, and offers the In one line to a writer", async () => {
    const { host, go } = await mount(SPARSE);
    expect(text(slot(host, "notes"))).toContain("No notes in Journey yet.");
    const f = slot(host, "ford");
    expect(text(f)).toContain("No line yet.");
    await click(buttonIn(f, "Write one"));
    expect(go).toHaveBeenLastCalledWith("ford", "ford-one-line");
    expect(text(f.querySelector('[data-pillar="dreams"]'))).toContain("Nothing on file yet.");
    expect(text(f.querySelector('[data-pillar="dreams"]'))).toMatch(/Ask: “[^”]+”/);
    expect(text(f)).toContain("No ideas yet.");
    const b = slot(host, "body");
    expect(text(b)).toContain("No clinical flags on file.");
    expect(b.querySelector('[data-testid="ov-every-set"]')).toBeNull();
    expect(text(b)).toContain("No Pulse saved in Journey yet.");
    expect(text(slot(host, "goals"))).toContain("Her why isn't written down yet.");
    expect(text(slot(host, "goals"))).toContain("How to coach her: not written yet.");
    // A count of none is never a footer: "none running" says it once.
    expect(text(slot(host, "goals"))).not.toContain("0 focuses");
  });

  it("offers no Write one to a reader who may not write FORD", async () => {
    const { host } = await mount({ ...SPARSE, fordWritable: false });
    expect(text(slot(host, "ford"))).toContain("No line yet.");
    expect(buttonIn(slot(host, "ford"), "Write one")).toBeUndefined();
  });
});

describe("OverviewPage — a migrating client", () => {
  it("keeps the contract", async () => {
    await expectTheContract(MIGRATING);
  });

  it("states the years before Journey and never calls her new", async () => {
    const { host } = await mount(MIGRATING);
    const s = text(slot(host, "story"));
    expect(s).toContain("180 sessions in FileMaker before Journey, and 3 in Journey.");
    expect(text(host)).not.toMatch(/\bnew\b|First session\./);
    // Notes and the Pulse say where they looked: in Journey.
    expect(text(slot(host, "notes"))).toContain("No notes in Journey yet.");
    expect(text(slot(host, "body"))).toContain("No Pulse saved in Journey yet.");
  });
});

describe("OverviewPage — every read failed", () => {
  it("keeps the contract", async () => {
    await expectTheContract(FAILED);
  });

  it("says each read failed in its own words, and never what it says when something is missing", async () => {
    const { host } = await mount(FAILED);
    expect(text(slot(host, "notes"))).toContain("Notes couldn't be loaded, so nothing here is certain.");
    expect(slot(host, "notes").querySelector(".cx-row")).toBeNull();
    expect(text(slot(host, "ford").querySelector('[data-testid="ov-ford-notice"]'))).toBe(FORD_READ_NOTICE.failed);
    // No empty pillar tiles beside it: they would read as nothing on file.
    expect(slot(host, "ford").querySelector(".cx-ov-pillar")).toBeNull();
    expect(text(slot(host, "body"))).toContain("The Pulse couldn't be loaded, so what she says isn't shown here.");
    expect(text(slot(host, "goals"))).toContain("Focus: the focuses couldn't be loaded.");
    expect(text(slot(host, "story"))).toMatch(/Couldn't read .* here, so a moment may be missing\./);
    const page = text(host);
    for (const empty of [
      "No notes in Journey yet",
      "Nothing on file yet",
      "No line yet",
      "No ideas yet",
      "No dates in the next",
      "No Pulse saved",
      "Nothing dated yet",
      "none running",
    ]) {
      expect(page, empty).not.toContain(empty);
    }
  });
});

describe("OverviewPage — while the tab's reads are on their way", () => {
  it("says it is reading, and draws nothing it does not know", async () => {
    const { host } = await mount({ ...FULL, notes: "loading", focusesLoad: "loading", fordStatus: "loading", pulse: { status: "loading", history: null } });
    expect(text(slot(host, "notes"))).toContain("Loading notes…");
    expect(slot(host, "notes").querySelector(".cx-row")).toBeNull();
    expect(text(slot(host, "ford").querySelector('[data-testid="ov-ford-notice"]'))).toBe("Reading FORD…");
    expect(slot(host, "ford").querySelector(".cx-ov-pillar")).toBeNull();
    expect(text(slot(host, "body"))).toContain("Loading the Pulse…");
    expect(text(slot(host, "goals"))).toContain("Focus: loading…");
    expect(text(slot(host, "story"))).toContain("Still reading notes, focuses, FORD and Pulse rounds, so a moment may be missing.");
    for (const empty of ["No notes in Journey yet", "Nothing on file yet", "No Pulse saved", "none running", "Nothing dated yet"]) {
      expect(text(host), empty).not.toContain(empty);
    }
    // The app's one loading mark beside the Notes and FORD waits, never a hand-rolled spinner.
    expect(slot(host, "notes").querySelector(".cx-ov-wait .lm[role='status']")).not.toBeNull();
    expect(slot(host, "ford").querySelector(".cx-ov-wait .lm[role='status']")).not.toBeNull();
  });

  it("draws no loading mark once the reads have answered", async () => {
    const { host } = await mount(FULL);
    expect(host.querySelector(".lm")).toBeNull();
  });
});

describe("OverviewPage — a reader FORD refuses", () => {
  it("says whose FORD it is, and shows none of it", async () => {
    const { host } = await mount({ ...FULL, fordStatus: "off", fordReadable: false, fordWritable: false });
    const f = slot(host, "ford");
    expect(text(f.querySelector('[data-testid="ov-ford-notice"]'))).toBe(
      "FORD is kept by Westlake. It opens for the people who work there.",
    );
    expect(f.querySelector(".cx-ov-pillar")).toBeNull();
    expect(f.querySelector('[data-testid="ov-one-line"]')).toBeNull();
    expect(text(host)).not.toContain("Married to Tom");
    expect(buttonIn(f, "Write one")).toBeUndefined();
  });
});
