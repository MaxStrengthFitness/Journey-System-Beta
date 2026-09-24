// @vitest-environment jsdom
/**
 * GOALS & FOCUS, MOUNTED (client codex, phase 14).
 *
 * The page works out its words during render (how to coach her, her why's
 * lines, Reached) and owns reads of its own (the team's shared plans, the
 * trainer's jots), so only a mount proves it, against a fake Firestore that
 * records every listener:
 *
 *   - How to coach her lists Notes' Preference and Coaching-tip threads in
 *     Notes' order, Critical shown, a focus check-in and a closed tip left
 *     out; a row opens its thread on Notes;
 *   - a failed or loading notes read says so, never "no coaching tips";
 *   - her why shows her Dreams in FORD only once FORD answered, and says who
 *     keeps it for a reader FORD refuses;
 *   - a reader who may not edit gets no Edit and no Mark achieved, and may
 *     still set a focus;
 *   - Coach focuses heads its card with how many are running and folds the
 *     history; while the focuses load it offers nothing;
 *   - the jot strip is inside the plans' panel, and the page opens exactly
 *     one listener for each of its own reads;
 *   - the neighbours and the Next card; every anchor once; no Tailwind size.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  listeners: [] as { path: string; live: boolean }[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } } }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("../../contexts/ToastContext", () => {
  const api = { success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} };
  return { useToast: () => api };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (parts: unknown[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: unknown[]) => ({ path: path(parts) }),
    doc: (_db: unknown, ...parts: unknown[]) => ({ path: path(parts) }),
    query: (target: { path: string }) => ({ path: target.path }),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (q: { path: string }, next: (s: unknown) => void) => {
      const l = { path: q.path, live: true };
      fake.listeners.push(l);
      const t = setTimeout(() => next({ docs: [], size: 0, empty: true }), 0);
      return () => {
        l.live = false;
        clearTimeout(t);
      };
    },
    getDocs: async () => ({ docs: [], size: 0, empty: true }),
    addDoc: async () => ({ id: "new" }),
    setDoc: async () => {},
    updateDoc: async () => {},
    serverTimestamp: () => ({ __server: true }),
  };
});

import { GoalsPage, type GoalsPageProps } from "./GoalsPage";
import { useRecordForm } from "../client-codex/useRecordForm";
import { pronounsOf } from "../client-codex/kit/pronouns";
import { assembleThreads } from "../client-notes/threads";
import type { CodexFordStatus } from "../client-codex/codex-data";
import type { Client, Machine, Trainer } from "../../types";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import type { JournalLoad } from "../../hooks/useClientJournal";
import type { FordEntry } from "../ford/types";
import type { HistoryCoverage } from "../../lib/prior-history";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = "2027-03-16";
const MACHINES = [{ id: "m-leg", name: "Leg Press" }] as Machine[];

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
    discoveryNotes: "Sets up short on everything.\nTalk her through the first rep.",
    globalNotes: "Keep up with my granddaughters.",
    goals: "Walk the Camino with Tom.",
    mindbodyIndexes: { LongtermGoal: "IncreasedFlexibility" },
    smartGoal: "Walk 10 miles two days running",
    goalHistory: [{ goal: "Walk 5 miles without stopping", achievedAt: "2027-01-23T03:30:00.000Z", byName: "AJ" }],
    ...over,
  }) as Client;

function note(over: Partial<JournalEntry> & { id: string }): JournalEntry {
  return {
    clientId: "c1",
    studioId: "s1",
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
    occurredAt: new Date(2027, 2, 1, 12),
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

const ENTRIES: JournalEntry[] = [
  note({ id: "pref", kind: "preference", body: "Fan on, no music.", occurredAt: new Date(2027, 2, 10, 12) }),
  note({
    id: "tip",
    kind: "coaching",
    category: "Pace",
    importance: "critical",
    machineId: "m-leg",
    body: "Count the lower turnaround out loud.",
    occurredAt: new Date(2027, 1, 1, 12),
  }),
  // Left out of How to coach: a focus check-in, and a tip someone closed.
  note({ id: "checkin", kind: "coaching", category: "Pace", focusId: "f1", body: "Slower today." }),
  note({ id: "closed", kind: "coaching", category: "Path", body: "Old tip.", resolvedAt: new Date(2027, 2, 5, 12) }),
];

const focus = (over: Partial<ClientFocus> & { id: string }): ClientFocus =>
  ({
    clientId: "c1",
    studioId: "s1",
    trainerId: "uid-ann",
    trainerName: "Ann Trainer",
    trainerInitials: "AT",
    category: "Pace",
    intent: "Slow the lower turnaround. No bounce.",
    targetMachineId: "m-leg",
    status: "active",
    startedAt: new Date(2027, 2, 2, 10),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: new Date(2027, 2, 2, 10),
    updatedAt: new Date(2027, 2, 2, 10),
    ...over,
  }) as ClientFocus;

const FOCUSES = [
  focus({ id: "f1" }),
  focus({
    id: "f-done",
    category: "Path",
    intent: "Knees tracking straight on Leg Press",
    status: "passed",
    startedAt: new Date(2027, 0, 25, 10),
    achievedAt: new Date(2027, 1, 20, 12),
  }),
];

const dream = {
  id: "d1",
  clientId: "c1",
  studioId: "s1",
  pillar: "dreams",
  body: "The Camino with Tom.",
  isPinned: true,
  isArchived: false,
  occurredAt: new Date(2027, 0, 5, 12),
} as unknown as FordEntry;

interface HostProps {
  client?: Client;
  canEdit?: boolean;
  notesState?: JournalLoad;
  focusesState?: JournalLoad;
  fordStatus?: CodexFordStatus;
  coverage?: HistoryCoverage;
  signUpGoals?: string[];
  go?: GoalsPageProps["go"];
  onOpenThread?: (id: string) => void;
}

function Host(p: HostProps) {
  const [{ client, threads, entries }] = useState(() => {
    const threads = assembleThreads(ENTRIES);
    return { client: p.client ?? carol(), threads, entries: ENTRIES.filter((e) => !e.threadId) };
  });
  const { canEdit = true, notesState = "ready", focusesState = "ready", fordStatus = "ready" } = p;
  const form = useRecordForm({ client, canEdit, trainerId: "t-ann", homeStudioName: "Westlake" });
  const props: GoalsPageProps = {
    client,
    form,
    canEdit,
    authTrainer: trainer,
    machines: MACHINES,
    journal: {
      entries,
      threads,
      focuses: focusesState === "ready" ? FOCUSES : [],
      loadState: { notes: notesState, focuses: focusesState, sessions: "ready" },
      capped: false,
    },
    notesState,
    ford: { status: fordStatus, entries: fordStatus === "ready" ? [dream] : [] },
    coverage: p.coverage ?? "complete",
    pronouns: pronounsOf(client),
    today: TODAY,
    go: p.go ?? (() => {}),
    onOpenThread: p.onOpenThread ?? (() => {}),
    onOpenPlanner: () => {},
    signUpGoals: p.signUpGoals,
  };
  return (
    <div className="cx">
      <div className="cx-pages">
        <GoalsPage {...props} />
      </div>
    </div>
  );
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function settle() {
  for (let i = 0; i < 3; i += 1) {
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
const cardOf = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[id="${id}"]`)!;

beforeEach(() => {
  fake.listeners.length = 0;
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

describe("Goals & Focus — the page", () => {
  it("lays out every card once, each on its anchor, with the neighbours and a Next card to Story", async () => {
    const go = vi.fn();
    const host = await mount({ go });
    for (const anchor of ["goals-coach", "goals-why", "goals-now", "goals-focus", "goals-plans", "goals-reached"]) {
      expect(host.querySelectorAll(`[id="${anchor}"][data-cx-anchor]`), anchor).toHaveLength(1);
    }
    expect(host.querySelector('[aria-label="Previous page: Body & Pulse"]')).not.toBeNull();
    const next = host.querySelector<HTMLElement>(".cx-next")!;
    expect(next.textContent).toContain("Story");
    await click(next);
    expect(go).toHaveBeenCalledWith("story");
  });

  it("opens one listener for each of its own reads — the shared plans and the jots — and none of the tab's", async () => {
    await mount();
    const live = fake.listeners.filter((l) => l.live).map((l) => l.path);
    expect(live.filter((p) => p === "clients/c1/sharedNotes")).toHaveLength(1);
    expect(live.filter((p) => p === "trainers/uid-ann/notes")).toHaveLength(1);
    expect(fake.listeners.some(({ path: p }) => p.includes("journalEntries") || p.includes("clientFocuses") || p.includes("ford"))).toBe(
      false,
    );
  });

  it("uses no Tailwind text size or colour", async () => {
    const host = await mount();
    const classes = Array.from(host.querySelectorAll("[class]"))
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");
    expect(classes).not.toMatch(/\btext-(xs|sm|base|lg|xl|\[)/);
    expect(classes).not.toMatch(/\b(emerald|amber|sky|slate|orange)-\d/);
    expect(classes).not.toMatch(/\btruncate\b/);
  });
});

describe("Goals & Focus — how to coach her", () => {
  it("quotes the strategy, then her Preference and Coaching-tip notes in Notes' order, Critical shown", async () => {
    const host = await mount();
    const card = cardOf(host, "goals-coach");
    expect(card.textContent).toContain("How to coach her");
    expect(card.querySelector(".gf-strategy")?.textContent).toBe(
      "Sets up short on everything.\nTalk her through the first rep.",
    );
    const rows = Array.from(card.querySelectorAll(".gf-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Leg Press: Count the lower turnaround out loud.");
    expect(rows[0].querySelector(".cx-loud")?.textContent).toBe("Critical");
    expect(rows[1].textContent).toContain("Preference");
    expect(rows[1].textContent).toContain("Fan on, no music.");
    expect(rows[1].querySelector(".cx-loud")).toBeNull();
    // The check-in stays on its focus, the closed tip on Notes.
    expect(card.textContent).not.toContain("Slower today.");
    expect(card.textContent).not.toContain("Old tip.");
    expect(card.textContent).toContain("Her Preference and Coaching-tip notes, as they are in Notes. Nothing new is stored.");
  });

  it("opens a row's thread on Notes", async () => {
    const onOpenThread = vi.fn();
    const host = await mount({ onOpenThread });
    await click(cardOf(host, "goals-coach").querySelector(".gf-row"));
    expect(onOpenThread).toHaveBeenCalledWith("tip");
  });

  it("says a failed or loading read of her notes is one, never that none are written", async () => {
    const failed = await mount({ notesState: "failed" });
    expect(cardOf(failed, "goals-coach").textContent).toContain("Couldn't load her notes just now");
    expect(cardOf(failed, "goals-coach").textContent).not.toContain("No coaching tips");
    const loading = await mount({ notesState: "loading" });
    expect(cardOf(loading, "goals-coach").textContent).toContain("Loading her notes…");
    expect(cardOf(loading, "goals-coach").textContent).not.toContain("No coaching tips");
  });

  it("edits the strategy through the record form, and Done leaves it unsaved", async () => {
    const host = await mount();
    const card = cardOf(host, "goals-coach");
    await click(card.querySelector('[aria-label="Edit How to coach her"]'));
    const box = card.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Count her in.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(card.querySelector('[aria-label="Done editing How to coach her"]'));
    expect(card.querySelector(".gf-strategy")?.textContent).toBe("Count her in.");
    expect(card.textContent).toContain("Unsaved");
  });
});

describe("Goals & Focus — her why", () => {
  it("quotes her why, then Mindbody's goal, the consultation, the sign-up line and her Dreams with a door", async () => {
    const go = vi.fn();
    const host = await mount({ go, signUpGoals: ["Keep up w/ grandkids. Camino!"] });
    const card = cardOf(host, "goals-why");
    expect(card.textContent).toContain("“Keep up with my granddaughters.”");
    expect(card.textContent).toContain("In Mindbody (long-term goal): IncreasedFlexibility");
    expect(card.textContent).toContain("At consultation: “Walk the Camino with Tom.”");
    expect(card.textContent).toContain("At sign-up (Mindbody notes): “Keep up w/ grandkids. Camino!”");
    expect(card.textContent).toContain("Dreams (FORD): The Camino with Tom.");
    // The sign-up line is read only here: no "Use as her why".
    expect(buttonIn(card, "Use as")).toBeUndefined();
    await click(card.querySelector('[aria-label="Open Dreams on FORD"]'));
    expect(go).toHaveBeenCalledWith("ford", "ford-dreams");
  });

  it("never names a Dream FORD has not answered with, and says who keeps FORD for a cross-train reader", async () => {
    const off = await mount({ fordStatus: "off", canEdit: false });
    expect(cardOf(off, "goals-why").textContent).toContain("Dreams (FORD): FORD is kept by the home studio.");
    expect(cardOf(off, "goals-why").querySelector('[aria-label="Open Dreams on FORD"]')).toBeNull();
    expect(cardOf(off, "goals-why").textContent).not.toContain("The Camino with Tom.");
    const failed = await mount({ fordStatus: "failed" });
    expect(cardOf(failed, "goals-why").textContent).toContain("Couldn't read FORD just now.");
    expect(cardOf(failed, "goals-why").textContent).not.toContain("Nothing in Dreams");
  });
});

describe("Goals & Focus — who may do what", () => {
  it("gives a reader who may not edit no Edit and no Mark achieved, and still lets them set a focus", async () => {
    const host = await mount({ canEdit: false, fordStatus: "off" });
    expect(host.querySelector('[aria-label^="Edit"]')).toBeNull();
    expect(buttonIn(host, "Mark achieved")).toBeUndefined();
    expect(buttonIn(host, "Write it")).toBeUndefined();
    // Any trainer may set a focus and check in (the clientFocuses and journal rules).
    expect(buttonIn(cardOf(host, "goals-focus"), "Set a focus")).toBeTruthy();
    expect(host.textContent).toContain("Walk 10 miles two days running");
  });
});

describe("Goals & Focus — focuses, plans and Reached", () => {
  it("heads Coach focuses with how many are running, and folds the history", async () => {
    const host = await mount();
    const board = cardOf(host, "goals-focus");
    expect(board.textContent).toContain("Coach focuses · 1 running");
    expect(board.querySelectorAll('[data-testid="active-focus"]')).toHaveLength(1);
    const history = board.querySelector('[data-testid="focus-history"]')!;
    expect(history.tagName).toBe("DETAILS");
    expect(history.textContent).toContain("Focus history · 1");
  });

  it("offers nothing on the focuses while they load, and never says none is running", async () => {
    const loading = await mount({ focusesState: "loading" });
    const card = cardOf(loading, "goals-focus");
    expect(card.textContent).toContain("Loading the focuses…");
    expect(buttonIn(card, "Set a focus")).toBeUndefined();
    expect(card.textContent).not.toContain("No focus running");
    // Reached counts the goals only, and says the focuses are still loading.
    const reached = cardOf(loading, "goals-reached");
    expect(reached.textContent).toContain("Reached · 1 goal");
    expect(reached.textContent).toContain("Loading the focuses…");
  });

  it("keeps the jot strip inside the plans' panel, with only Write a plan in its head", async () => {
    const host = await mount();
    const plans = cardOf(host, "goals-plans");
    expect(plans.textContent).toContain("Plans from the team");
    expect(plans.querySelector(".snc-more .jot")).not.toBeNull();
    expect(plans.textContent).toContain("Your working notes · only you");
    expect(buttonIn(plans, "Write a plan")).toBeTruthy();
    expect(buttonIn(plans, "Jot a note")).toBeUndefined();
    // Worded with the pronoun, never the client's name.
    expect(plans.textContent).toContain("everyone who coaches her");
    expect(plans.textContent).not.toContain("Carol");
  });

  it("shelves the goals and focuses reached, newest first, with the caveat for a client older than Journey", async () => {
    const host = await mount({ coverage: "partial" });
    const reached = cardOf(host, "goals-reached");
    expect(reached.textContent).toContain("Reached · 1 goal, 1 focus");
    const rows = Array.from(reached.querySelectorAll(".gf-shelf__row"));
    expect(rows.map((r) => r.querySelector(".gf-shelf__title")?.textContent)).toEqual([
      "Path: Knees tracking straight on Leg Press",
      "Walk 5 miles without stopping",
    ]);
    expect(rows[1].textContent).toContain("Goal · Jan 22, 2027 · marked by AJ");
    expect(reached.textContent).toContain("Only what was marked in Journey.");
  });
});
