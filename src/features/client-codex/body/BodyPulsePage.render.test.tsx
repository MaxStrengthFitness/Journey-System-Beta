// @vitest-environment jsdom
/**
 * BODY & PULSE, MOUNTED (client codex, phase 12).
 *
 * The page does work during render (every card's words are worked out from
 * the tab's load) and owns reads of its own (the one Pulse draft, the machine
 * catalog, machine fit), so only a mount proves it, against a fake Firestore
 * that counts every read:
 *
 *   - no "Recovery between sessions" anywhere (decision 7);
 *   - Watch-outs quotes the clinical list verbatim, and a machine chip opens
 *     that machine (it replaced BodyWatchOuts, whose cases moved here);
 *   - the figure's diamond sits on the midline, and a region row opens its
 *     sentences;
 *   - Update Pulse swaps in the Pulse panel over the page's ONE draft, with
 *     no second progressReports read; Hand to client opens client mode;
 *   - a reader who may not edit gets no Edit anywhere;
 *   - the saved wingspan shows (the old form never seeded it);
 *   - a failed read says unknown, never "none": the notes, the Pulse (on
 *     the Pulse card AND in Measured, and what she told us), her routines;
 *   - a region's sentences sit beside its button, never inside it;
 *   - no Tailwind text size or colour on the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  gets: [] as string[],
  listeners: [] as string[],
  progressReports: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } } }));
vi.mock("../../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("../../../contexts/ToastContext", () => {
  const api = { success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} };
  return { useToast: () => api };
});
vi.mock("../../../contexts/ActiveStudioContext", () => {
  const studios = [{ id: "s1", name: "Westlake" }];
  return {
    useActiveStudio: () => ({ activeStudioId: "s1", activeStudio: studios[0], studios, availableStudios: studios }),
  };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (parts: unknown[]) => parts.filter((p) => typeof p === "string").join("/");
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map(({ id, ...data }) => ({ id: String(id), data: () => data })),
    size: rows.length,
    empty: rows.length === 0,
  });
  return {
    ...real,
    collection: (_db: unknown, ...parts: unknown[]) => ({ path: path(parts) }),
    doc: (_db: unknown, ...parts: unknown[]) => ({ path: path(parts) }),
    query: (target: { path: string }, ...constraints: Array<Record<string, unknown>>) => ({
      path: target.path,
      constraints,
    }),
    where: (field: string, _op: string, value: unknown) => ({ where: field, value }),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (q: { path: string }, next: (s: unknown) => void) => {
      fake.listeners.push(q.path);
      const t = setTimeout(() => next(snap([])), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (q: { path: string; constraints?: Array<{ where?: string; value?: unknown }> }) => {
      fake.gets.push(q.path);
      const rows = q.path === "progressReports" ? fake.progressReports : [];
      // The equality filters, applied: the open-draft query must not find a
      // Finalized round.
      const wheres = (q.constraints ?? []).filter((c) => typeof c.where === "string");
      return snap(rows.filter((r) => wheres.every((c) => r[c.where as string] === c.value)));
    },
    getDoc: async (r: { path: string }) => {
      fake.gets.push(r.path);
      return { id: "x", exists: () => false, data: () => undefined };
    },
    addDoc: async () => ({ id: "new" }),
    updateDoc: async () => {},
    serverTimestamp: () => ({ __server: true }),
  };
});

import { BodyPulsePage, type BodyPulsePageProps } from "./BodyPulsePage";
import { useRecordForm } from "../useRecordForm";
import { pronounsOf } from "../kit/pronouns";
import { historyFromDocs } from "../../subjective-report/assessment-history";
import { emptyAssessment } from "../../subjective-report/scoring";
import { assembleThreads } from "../../client-notes/threads";
import { NO_PROGRAMMING, type CodexProgramming, type CodexPulse } from "../codex-data";
import type { Client, Machine, PreSessionCheckIn, Trainer, WorkoutSession } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import type { JournalLoad } from "../../../hooks/useClientJournal";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = "2027-03-24";
const MACHINES = [
  { id: "m-leg-press", name: "Leg Press" },
  { id: "m-chest-press", name: "Chest Press" },
] as Machine[];

const trainer = {
  id: "t-ann",
  fullName: "Ann Trainer",
  initials: "AT",
  role: "LifeTransformer",
  primaryHomeStudioId: "s1",
} as Trainer;

const carol = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Carol",
    lastName: "Brennan",
    gender: "Female",
    homeStudioId: "s1",
    isActive: true,
    remainingSessions: 10,
    height: `5'0"`,
    wingspan: "59",
    recoveryMetric: "Poor",
    clinicalFlags: ["gen-knee", "gen-blood-pressure"],
    medicalHistory: "R total knee replacement Mar 2024.",
    ...over,
  }) as Client;

function note(over: Partial<JournalEntry>): JournalEntry {
  return {
    id: "n1",
    clientId: "c1",
    studioId: "s1",
    kind: "injury",
    category: null,
    body: "Left shoulder sore from pruning.",
    importance: "elevated",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jess",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: new Date(2027, 2, 15, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  } as JournalEntry;
}

const critical = note({
  id: "crit",
  body: "Stop at 90° at the bottom turn.",
  importance: "critical",
  machineId: "m-leg-press",
});
const headsUp = note({ id: "hu" });

const round = {
  id: "r1",
  clientId: "c1",
  date: "2027-03-10",
  status: "Finalized",
  subjective: {
    ...emptyAssessment({ bodyWeightLbs: null }),
    answers: { strengthConfidence_1: { value: 8 } },
    painMap: [
      {
        id: "p1",
        region: "knee",
        side: "right",
        type: "joint",
        severity: 3,
        frequency: "occasional",
        aggravatingMachineIds: [],
        linkedJournalEntryIds: [],
        status: "active",
      },
    ],
  },
  createdAt: "2027-03-10T15:00:00Z",
};

const CRITICAL = [critical];

const readyPulse = (): CodexPulse => ({ status: "ready", history: historyFromDocs([round], 50) });

/** A completed session run in Journey (with the tablet's start time), as the journal's sessions listener hands it out. */
const visit = (id: string, date: string, check: Partial<PreSessionCheckIn> = {}, over: Partial<WorkoutSession> = {}) =>
  ({
    id,
    clientId: "c1",
    date,
    clientStartTime: `${date}T15:00:00.000Z`,
    status: "Completed",
    preSessionCheckIn: check,
    ...over,
  }) as WorkoutSession;

/** Brought in by the chart importer: no start time, so no briefing and no dose. */
const charted = (id: string, date: string) =>
  ({ id, clientId: "c1", date, status: "Completed", trainerId: "t-ann", trainerInitials: "AN" }) as WorkoutSession;

/** How many times `needle` appears in `text`. */
const occurrences = (text: string | null | undefined, needle: string) => (text ?? "").split(needle).length - 1;

/** Four sessions in March: recovery asked at three, a knee tapped at one, the dose judged at two. */
const SESSIONS: WorkoutSession[] = [
  visit("v4", "2027-03-20", { readiness: { recovery: -1 }, bodyStates: [{ region: "Knees", state: "stiff", dial: -1 }] }, { dose: -1 }),
  visit("v3", "2027-03-13", { readiness: { recovery: -2 } }, { dose: 0 }),
  visit("v2", "2027-03-06", { readiness: { recovery: 0 } }),
  visit("v1", "2027-02-27", {}),
];

interface HostProps {
  client?: Client;
  canEdit?: boolean;
  notesState?: JournalLoad;
  pulse?: CodexPulse;
  entries?: JournalEntry[];
  onOpenMachine?: (id: string) => void;
  programming?: CodexProgramming;
  /** The journal's sessions and whether they answered. */
  sessions?: WorkoutSession[];
  sessionsState?: JournalLoad;
}

function Host(p: HostProps) {
  // Held once, like a snapshot the profile hands down: a new object on every
  // render would re-seed the form on every render.
  const [{ client, pulse, threads, sessions, loadState }] = useState(() => ({
    client: p.client ?? carol(),
    pulse: p.pulse ?? readyPulse(),
    threads: assembleThreads(p.entries ?? [critical, headsUp]),
    sessions: (p.sessionsState ?? "ready") === "ready" ? (p.sessions ?? SESSIONS) : [],
    loadState: { notes: p.notesState ?? "ready", focuses: "ready", sessions: p.sessionsState ?? "ready" } as const,
  }));
  const { canEdit = true, notesState = "ready", onOpenMachine = () => {} } = p;
  const form = useRecordForm({ client, canEdit, trainerId: "t-ann", homeStudioName: "Westlake" });
  const props: BodyPulsePageProps = {
    client,
    form,
    canEdit,
    fordReadable: canEdit,
    authTrainer: trainer,
    machines: MACHINES,
    journal: { threads, criticalEntries: CRITICAL, recentSessions: sessions, loadState },
    notesState,
    coverage: "complete",
    pulse,
    filedReports: 1,
    inbody: { scans: [], loading: false, error: null },
    programming: p.programming ?? NO_PROGRAMMING,
    pronouns: pronounsOf(client),
    today: TODAY,
    go: () => {},
    onOpenNote: () => {},
    onOpenMachine,
    onOpenReports: () => {},
  };
  return (
    <div className="cx">
      <div className="cx-pages">
        <BodyPulsePage {...props} />
      </div>
    </div>
  );
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(props: HostProps = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <Host {...props} />
      </StrictMode>,
    );
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text) ??
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));

beforeEach(() => {
  fake.gets.length = 0;
  fake.listeners.length = 0;
  fake.progressReports = [round];
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  document.body.innerHTML = "";
});

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Body & Pulse — the page", () => {
  it("has no Recovery between sessions select (decision 7)", async () => {
    const host = await mount();
    expect(host.textContent).not.toContain("Recovery between sessions");
    expect(host.querySelector("select")).toBeNull();
  });

  it("shows the saved wingspan in Build, and the inputs behind Edit", async () => {
    const host = await mount();
    const build = host.querySelector("#body-build")!;
    expect(build.textContent).toContain(`4'11" wingspan`);
    expect(build.textContent).toContain(`1" less than her height`);
    expect(build.textContent).toContain("Shorter than our machines are set for.");
    await click(build.querySelector('[aria-label="Edit Build"]'));
    const wingspan = Array.from(build.querySelectorAll("input")).find((i) =>
      i.closest("div")?.textContent?.includes("Wingspan"),
    );
    expect(wingspan?.value).toBe("59");
  });

  it("gives a reader who may not edit no Edit button anywhere", async () => {
    const host = await mount({ canEdit: false });
    const edits = Array.from(host.querySelectorAll("button")).filter((b) =>
      /^(Edit|Set them)/.test((b.textContent ?? "").trim()),
    );
    expect(edits).toEqual([]);
    expect(host.querySelector('[aria-label^="Edit"]')).toBeNull();
  });

  it("uses no Tailwind text size or colour, and every button is a real one", async () => {
    const host = await mount();
    const classes = Array.from(host.querySelectorAll("[class]"))
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");
    expect(classes).not.toMatch(/\btext-(xs|sm|base|lg|xl|\[)/);
    expect(classes).not.toMatch(/\b(emerald|amber|sky|slate)-\d/);
    expect(classes).not.toMatch(/\btruncate\b/);
  });
});

describe("Body & Pulse — watch-outs (they replaced BodyWatchOuts)", () => {
  it("quotes the every-set instruction verbatim and opens a floor machine the instruction names", async () => {
    const onOpenMachine = vi.fn();
    const host = await mount({ onOpenMachine });
    const card = host.querySelector("#body-watchouts")!;
    expect(card.textContent).toContain("“Keep the breathing continuous on every set — no breath-holding under load.”");
    expect(card.textContent).toContain("Knee limitation");
    // Chest Press is not named by either flag: no chip for it.
    expect(buttonIn(card, "Chest Press")).toBeUndefined();
    await click(card.querySelector('[aria-label="Open Leg Press"]'));
    expect(onOpenMachine).toHaveBeenCalledWith("m-leg-press");
    expect(card.textContent).toContain("“R total knee replacement Mar 2024.”");
  });

  it("says No watch-outs on file when there are none, and offers to set them only to an editor", async () => {
    const host = await mount({ client: carol({ clinicalFlags: [], medicalHistory: "" }) });
    const card = host.querySelector("#body-watchouts")!;
    expect(card.textContent).toContain("No watch-outs on file.");
    expect(buttonIn(card, "Set them")).toBeTruthy();
  });
});

describe("Body & Pulse — where it matters", () => {
  it("draws the flag's diamond on the midline and her ring on her right knee", async () => {
    const host = await mount();
    const diamond = host.querySelector('rect.bp-fig__onfile[data-region="knee"]')!;
    expect(diamond.getAttribute("transform")).toBe("rotate(45 60 203)");
    const ring = host.querySelector('circle.bp-fig__told[data-region="knee"]')!;
    expect(ring.getAttribute("cx")).toBe("49");
  });

  it("opens a region row's sentences on tap, beside the button rather than inside it", async () => {
    const host = await mount();
    const row = Array.from(host.querySelectorAll<HTMLButtonElement>(".bp-region__btn")).find((b) =>
      b.textContent?.startsWith("Knee"),
    )!;
    expect(row.getAttribute("aria-expanded")).toBe("false");
    const detail = host.querySelector<HTMLElement>(`[id="${row.getAttribute("aria-controls")}"]`)!;
    expect(detail.hidden).toBe(true);
    await click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain("The flag doesn't record a side, so the diamond sits on the midline.");
    expect(detail.textContent).toContain("She told us: right knee, Mild (Pulse, Mar 10).");
    // The button's name is the region and its line, never the sentences.
    expect(row.textContent).not.toContain("She told us");
    expect(row.contains(detail)).toBe(false);
  });

  it("draws the open round's pain map when the saved Pulse failed, and says only that part is missing", async () => {
    fake.progressReports = [
      {
        id: "d1",
        clientId: "c1",
        isCheckInOnly: true,
        status: "Draft",
        subjective: { ...emptyAssessment({ bodyWeightLbs: null }), painMap: round.subjective.painMap },
        createdAt: "2027-03-20T15:00:00Z",
        updatedAt: "2027-03-20T15:00:00Z",
      },
    ];
    const host = await mount({ pulse: { status: "failed", history: null } });
    const card = host.querySelector("#body-figure")!;
    expect(card.querySelector('circle.bp-fig__told[data-region="knee"]')).not.toBeNull();
    expect(card.textContent).toContain("The saved Pulse couldn't be read just now; only the open round is drawn.");
    expect(card.textContent).not.toContain("what she told us isn't drawn");
  });

  it("lists her Heads-up injury note and leaves out the one on the critical line", async () => {
    const host = await mount();
    const card = host.querySelector("#body-figure")!;
    expect(card.textContent).toContain("Left shoulder sore from pruning.");
    expect(card.textContent).not.toContain("Stop at 90°");
  });

  it("never says no injury notes are logged when the notes could not be read", async () => {
    const host = await mount({ notesState: "failed", entries: [] });
    const card = host.querySelector("#body-figure")!.textContent ?? "";
    expect(card).toContain("Injury and incident notes couldn't be loaded, so some may be missing.");
    expect(card).not.toContain("No injury or incident notes logged");
  });
});

describe("Body & Pulse — the Pulse", () => {
  it("reads one statement per area in the Pulse's own words", async () => {
    const host = await mount();
    const card = host.querySelector("#body-pulse")!;
    expect(card.textContent).toContain("“I feel stronger than I did 3 months ago.” Often · Mar 10");
    expect(card.textContent).toContain("Right knee Mild · Mar 10");
  });

  it("swaps in the Pulse panel over the page's ONE draft, with no second progressReports read", async () => {
    const host = await mount();
    const before = fake.gets.filter((p) => p === "progressReports").length;
    expect(before).toBeGreaterThan(0);
    await click(buttonIn(host.querySelector("#body-pulse")!, "Update Pulse"));
    expect(host.querySelector("#client-check-in")).not.toBeNull();
    expect(fake.gets.filter((p) => p === "progressReports").length).toBe(before);
    await click(buttonIn(host.querySelector("#body-pulse")!, "Done"));
    // Kept mounted (hidden), so an open topic survives.
    expect(host.querySelector("#client-check-in")?.closest("[hidden]")).not.toBeNull();
  });

  it("hands the iPad to the client in client mode", async () => {
    const host = await mount();
    await click(buttonIn(host.querySelector("#body-pulse")!, "Hand to client"));
    expect(document.querySelector('[data-testid="pulse-client-mode"]')).not.toBeNull();
  });

  it("says the Pulse history could not be read, and never calls an area not asked", async () => {
    const host = await mount({ pulse: { status: "failed", history: null } });
    const card = host.querySelector("#body-pulse")!.textContent ?? "";
    expect(card).toContain("The Pulse history couldn't be loaded just now.");
    expect(card).not.toContain("Not asked yet");
    // Nor does Measured, and what she told us.
    const measured = host.querySelector("#body-measured")!.textContent ?? "";
    expect(measured).not.toContain("Not asked yet");
    expect(measured).toContain("Not known: the saved Pulse couldn't be read");
  });

  it("says it is loading what she told us, never Not asked yet, while the history loads", async () => {
    const host = await mount({ pulse: { status: "loading", history: null } });
    const measured = host.querySelector("#body-measured")!.textContent ?? "";
    expect(measured).not.toContain("Not asked yet");
    expect(measured).toContain("Loading what she told us…");
  });
});

describe("Body & Pulse — measured, and what she told us", () => {
  it("pairs a flag with the spot she told us about, each side with its own source", async () => {
    const host = await mount();
    const card = host.querySelector("#body-measured")!.textContent ?? "";
    expect(card).toContain("Knee limitation, on file.");
    expect(card).toContain("Pulse pain map, Mar 10");
    expect(card).toContain("No InBody scan yet.");
    // Consistency was never asked, and the Pulse answered: now it may say so.
    expect(card).toContain("Not asked yet");
  });
});

describe("Body & Pulse — over time (decision 9)", () => {
  it("draws how she arrives from the journal's own sessions, and reads no sessions of its own", async () => {
    const host = await mount();
    const card = host.querySelector("#body-timeline")!;
    expect(card.querySelector(".cx-lede")?.textContent).toBe(
      "“How's the body since last time?” asked at 3 of her last 4 sessions. “Still feeling it” or “Still wrecked” at 2 of them.",
    );
    expect(card.querySelectorAll('svg[data-lane="arrive:recovery"] rect.bp-tl__mark')).toHaveLength(3);
    expect(card.querySelector('[data-lane="arrive:dose"]')?.textContent).toContain("How it landed");
    // The Pulse round and the footer's counts sit on the same timeline.
    expect(card.querySelector('svg[data-lane="pulse:strengthConfidence_1"]')).not.toBeNull();
    expect(card.textContent).toContain("1 saved Pulse round, 0 InBody scans and 4 sessions in Journey in these six months.");
    // No sessions query anywhere: the journal already streams them.
    expect(fake.gets.filter((p) => p.startsWith("sessions"))).toEqual([]);
    expect(fake.listeners.filter((p) => p.startsWith("sessions"))).toEqual([]);
    // Every page's words, and never a retry for a listener that is final.
    expect(card.textContent).not.toContain("Try again");
  });

  it("says not asked — never as usual — for a client with no sessions", async () => {
    const host = await mount({ sessions: [] });
    const card = host.querySelector("#body-timeline")!;
    expect(card.querySelector(".cx-lede")?.textContent).toBe(
      "Not asked yet: Journey holds no session of hers in these six months.",
    );
    expect(card.querySelectorAll("rect.bp-tl__mark")).toHaveLength(0);
    expect(card.querySelector(".cx-lede")?.textContent).not.toContain("As usual");
  });

  it("says the sessions couldn't be loaded — never not asked — and the rest of the timeline still draws", async () => {
    const host = await mount({ sessionsState: "failed" });
    const card = host.querySelector("#body-timeline")!;
    // Said once, in its row — the lede only says what the card is about.
    const failed = "Her recent sessions couldn't be loaded just now, so how she arrived isn't drawn. The rest of this page is unaffected.";
    expect(occurrences(card.textContent, failed)).toBe(1);
    expect(card.querySelector(".cx-lede")?.textContent).toBe(
      "How she arrives at the door and how each session lands, over these six months.",
    );
    expect(card.textContent).not.toContain("Not asked");
    expect(card.textContent).not.toContain("Try again");
    expect(card.querySelector('svg[data-lane="pulse:strengthConfidence_1"]')).not.toBeNull();
    // The figure says nothing about the door while it is unknown.
    expect(host.querySelector("#body-figure")?.textContent).not.toContain("At the door");
  });

  it("says it is loading her sessions while the journal's listener is out", async () => {
    const host = await mount({ sessionsState: "loading" });
    const card = host.querySelector("#body-timeline")!;
    expect(card.querySelector('[data-lane="gap:sessions"] [role="status"]')?.getAttribute("aria-label")).toBe(
      "Loading her recent sessions…",
    );
    // Once — the loading mark's label — never again as the lede.
    expect(occurrences(card.textContent, "Loading her recent sessions…")).toBe(1);
    expect(card.textContent).not.toContain("sessions in these six months");
    expect(card.textContent).not.toContain("sessions in Journey in these six months");
  });

  it("never tells a migrating client's trainer the question wasn't asked at imported sessions", async () => {
    const host = await mount({
      sessions: [charted("c3", "2027-03-20"), charted("c2", "2027-03-13"), charted("c1", "2027-03-06")],
    });
    const card = host.querySelector("#body-timeline")!;
    expect(card.querySelector(".cx-lede")?.textContent).toBe(
      "The briefing asks “How's the body since last time?” at the door. Her 3 sessions in these six months were imported, and imports don't record the door.",
    );
    expect(card.textContent).not.toMatch(/wasn't asked|Not asked/);
    expect(card.querySelectorAll("rect.bp-tl__mark")).toHaveLength(0);
  });

  it("tells the figure's Knee row how often the knee was tapped at the door", async () => {
    const host = await mount();
    const row = Array.from(host.querySelectorAll<HTMLButtonElement>(".bp-region__btn")).find((b) =>
      b.textContent?.startsWith("Knee"),
    )!;
    await click(row);
    const detail = host.querySelector<HTMLElement>(`[id="${row.getAttribute("aria-controls")}"]`)!;
    expect(detail.textContent).toContain("At the door: “Stiff” on Mar 20 · tapped at 1 of her last 4 sessions.");
  });
});

describe("Body & Pulse — on our floor", () => {
  // Leg Press carries her critical note, so it is on the floor either way.
  it("never says a machine is not in her routines when her routines could not be read", async () => {
    const host = await mount({ programming: { ...NO_PROGRAMMING, status: "failed" } });
    const card = host.querySelector("#body-floor")!.textContent ?? "";
    expect(card).toContain("Leg Press");
    expect(card).not.toContain("Not in her routines");
    expect(card).not.toContain("No machines in her routines yet");
    expect(card).not.toContain("machines set up");
    expect(card).toContain("Her routines or machine settings couldn't be loaded just now, so a machine may be missing.");
    expect(card).toContain("Not known just now");
  });

  it("says it is loading her programme, and claims nothing from it, until it lands", async () => {
    const host = await mount({ programming: { ...NO_PROGRAMMING, status: "loading" } });
    const card = host.querySelector("#body-floor")!.textContent ?? "";
    expect(card).not.toContain("Not in her routines");
    expect(card).not.toContain("machines set up");
    expect(card).toContain("Loading her routines and machine settings…");
  });

  it("says what her programme holds once it answered", async () => {
    const host = await mount();
    const card = host.querySelector("#body-floor")!.textContent ?? "";
    expect(card).toContain("Not in her routines");
    expect(card).toContain("0 of 2 machines set up");
    expect(card).not.toContain("Loading her routines");
  });
});
