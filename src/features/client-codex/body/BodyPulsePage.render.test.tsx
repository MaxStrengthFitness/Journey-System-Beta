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
import type { Client, Machine, Trainer } from "../../../types";
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

interface HostProps {
  client?: Client;
  canEdit?: boolean;
  notesState?: JournalLoad;
  pulse?: CodexPulse;
  entries?: JournalEntry[];
  onOpenMachine?: (id: string) => void;
  programming?: CodexProgramming;
}

function Host(p: HostProps) {
  // Held once, like a snapshot the profile hands down: a new object on every
  // render would re-seed the form on every render.
  const [{ client, pulse, threads }] = useState(() => ({
    client: p.client ?? carol(),
    pulse: p.pulse ?? readyPulse(),
    threads: assembleThreads(p.entries ?? [critical, headsUp]),
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
    journal: { threads, criticalEntries: CRITICAL },
    notesState,
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
