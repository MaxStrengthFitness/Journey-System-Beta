// @vitest-environment jsdom
/**
 * THE CODEX SHELL, MOUNTED (client codex, phase 8).
 *
 * The shell does its work during render (pages mount on first visit, the
 * form re-seeds from the record) and in a layout effect (the scroll to a
 * card, the focus move), and it is the one place the tab's reads are opened.
 * Only a mount proves any of it, against a fake Firestore that records every
 * listener and every write:
 *
 *   - it opens on the Overview; every panel is in the page from the start,
 *     and a page mounts on its first visit and stays (hidden, not unmounted);
 *   - ONE listener each on journalEntries, FORD and the InBody scans however
 *     many pages are visited, none on FORD for a cross-train reader, and
 *     switching pages reads nothing;
 *   - the critical line sits under the bar on five pages, never on the
 *     Overview or Notes, and says "may be missing" when the notes failed;
 *   - an edit on FORD shows on the Save bar from Account, with where it is;
 *     Show goes back to it, Discard clears it, Save writes exactly the
 *     changed field and who changed it — and a refused save keeps the edit;
 *   - a cross-train reader gets the pages read only and no Save bar, and the
 *     form takes no edit from them even from a control the pages failed to hide;
 *   - a new snapshot of the record re-seeds the form only while nothing is
 *     unsaved — a half-typed edit is never wiped;
 *   - nothing scrolls or takes focus while the tab is hidden;
 *   - the neighbours, the Next card, a door to a card, and no duplicate ids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = { path: string; live: boolean };

const fake = vi.hoisted(() => ({
  listeners: [] as Listener[],
  gets: [] as string[],
  writes: [] as { op: string; path: string; data?: Record<string, unknown> }[],
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  /** Collection paths whose listener fails. */
  fail: new Set<string>(),
  /** What updateDoc throws, when set. */
  updateError: null as null | { code: string },
  toasts: [] as { kind: string; message: string }[],
  studios: [
    { id: "s1", name: "Westlake" },
    { id: "s2", name: "Solon" },
  ],
}));

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-ann" } },
  functions: {},
}));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("../../contexts/ToastContext", () => {
  const push = (kind: string) => (message: string) => fake.toasts.push({ kind, message });
  const api = { success: push("success"), error: push("error"), info: push("info"), warning: push("warning"), toast: push("toast") };
  return { useToast: () => api, ToastProvider: ({ children }: { children: unknown }) => children };
});
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: fake.studios[0],
    studios: fake.studios,
    availableStudios: fake.studios,
  }),
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({
    path: parts.filter((p) => typeof p === "string").join("/"),
  });
  const snapOf = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r) => ({ id: String(r.id), data: () => r, ref: { path: String(r.id) } })),
    size: rows.length,
    empty: rows.length === 0,
    exists: () => false,
    data: () => undefined,
    forEach(cb: (d: unknown) => void) {
      this.docs.forEach(cb);
    },
    docChanges: () => [],
  });
  return {
    ...real,
    collection: ref,
    doc: ref,
    collectionGroup: (_db: unknown, id: string) => ({ path: id }),
    query: (target: { path: string }) => ({ path: target.path }),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    startAfter: () => ({}),
    onSnapshot: (q: { path: string }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      const l: Listener = { path: q.path, live: true };
      fake.listeners.push(l);
      const t = setTimeout(() => {
        if (!l.live) return;
        if (fake.fail.has(q.path)) error?.({ code: "unavailable" });
        else next(snapOf(fake.rows[q.path] ?? []));
      }, 0);
      return () => {
        l.live = false;
        clearTimeout(t);
      };
    },
    getDocs: async (q: { path: string }) => {
      fake.gets.push(q.path);
      return snapOf(fake.rows[q.path] ?? []);
    },
    getDoc: async (r: { path: string }) => {
      fake.gets.push(r.path);
      return { id: "x", exists: () => false, data: () => undefined };
    },
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ op: "add", path: r.path, data });
      return { id: `new-${fake.writes.length}` };
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ op: "set", path: r.path, data });
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (fake.updateError) throw fake.updateError;
      fake.writes.push({ op: "update", path: r.path, data });
    },
    deleteDoc: async (r: { path: string }) => {
      fake.writes.push({ op: "delete", path: r.path });
    },
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    serverTimestamp: () => ({ __server: true }),
  };
});

import { ClientCodex } from "./ClientCodex";
import { useRecordForm, type RecordForm } from "./useRecordForm";
import type { CodexHosts } from "./codex-data";
import type { RecordPage } from "../client-profile/profile-nav";
import type { Client, Machine, Trainer } from "../../types";
import { studioTodayKey } from "../../lib/studio-time";
import { addDays } from "../client-history/model";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const MACHINES = [{ id: "m-leg", name: "Leg Press" }] as Machine[];

const homeTrainer = {
  id: "t-ann",
  fullName: "Ann Trainer",
  initials: "AT",
  role: "LifeTransformer",
  primaryHomeStudioId: "s1",
} as Trainer;

const crossTrainer = {
  id: "t-sol",
  fullName: "Sol Trainer",
  initials: "ST",
  role: "LifeTransformer",
  primaryHomeStudioId: "s2",
} as Trainer;

const baseClient = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Carol",
    lastName: "Brennan",
    gender: "Female",
    homeStudioId: "s1",
    approvedCrossTrainStudioIds: ["s2"],
    isActive: true,
    remainingSessions: 10,
    height: "5'0\"",
    wingspan: "59",
    ...over,
  }) as Client;

const criticalNote = {
  id: "crit1",
  clientId: "c1",
  studioId: "s1",
  kind: "injury",
  category: null,
  body: "Right knee: stop at 90° at the bottom turn. She felt a pinch on Mar 4.",
  importance: "critical",
  machineId: "m-leg",
  focusId: null,
  sessionId: null,
  origin: "manual",
  authorId: "uid-jess",
  authorInitials: "JM",
  authorName: "Jess Moreno",
  occurredAt: new Date(2026, 8, 1, 12),
  createdAt: null,
  updatedAt: null,
  effectiveFrom: null,
  effectiveUntil: null,
  resolvedAt: null,
  isArchived: false,
  searchTags: [],
};

const hosts: CodexHosts = {
  onSelectReport: vi.fn(),
  onDeleteReport: vi.fn(),
  onNewReport: vi.fn(),
  onOpenPlanner: vi.fn(),
  onOpenReports: vi.fn(),
  onOpenMigrationHub: vi.fn(),
};

interface HostProps {
  client: Client;
  trainer: Trainer;
  initial?: RecordPage;
  /** A card the nav starts on (a door's anchor). */
  initialAnchor?: string;
  /** Whether the Notes & Profile tab is showing. */
  active?: boolean;
}

/** Holds the nav the way useProfileNav does: a page, a card, and a new stamp per move. */
function Host({ client, trainer, initial = "overview", initialAnchor, active = true }: HostProps) {
  const [loc, setLoc] = useState<{ page: RecordPage; anchor?: string; n: number }>({
    page: initial,
    anchor: initialAnchor,
    n: 0,
  });
  const onNavigate = useCallback(
    (page: RecordPage, anchor?: string) => setLoc((l) => ({ page, anchor, n: l.n + 1 })),
    [],
  );
  return (
    <ClientCodex
      key={client.id}
      client={client}
      authTrainer={trainer}
      liveTrainer={trainer}
      machines={MACHINES}
      trainers={[trainer]}
      page={loc.page}
      anchor={loc.anchor}
      navStamp={loc}
      active={active}
      onNavigate={onNavigate}
      progressReports={[]}
      progressReportsStatus="ready"
      sessionTotals={{ total: 12, journey: 12, before: 0 }}
      coverage="complete"
      hosts={hosts}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let mounted: { root: Root; host: HTMLElement }[] = [];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });

const renderHost = (root: Root, props: HostProps) =>
  root.render(
    <StrictMode>
      <Host {...props} />
    </StrictMode>,
  );

async function mount(
  client = baseClient(),
  trainer = homeTrainer,
  initial?: RecordPage,
  more: Pick<HostProps, "initialAnchor" | "active"> = {},
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    renderHost(root, { client, trainer, initial, ...more });
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

/**
 * Render the same Host again with new props — a new client object is what a
 * Firestore snapshot of the record hands the profile. The nav's state stays.
 */
async function rerender(host: HTMLElement, props: HostProps) {
  const m = mounted.find((x) => x.host === host);
  if (!m) throw new Error("not mounted");
  await act(async () => {
    renderHost(m.root, props);
  });
  await settle();
}

/**
 * A Body & Pulse → Build input, found by its label. Build reads first since
 * phase 12, so its editor is opened when it is closed (a save closes it).
 */
async function buildInput(host: HTMLElement, label: string) {
  const build = panel(host, "body").querySelector<HTMLElement>("#body-build")!;
  const edit = build.querySelector('[aria-label="Edit Build"]');
  if (edit) await click(edit);
  return Array.from(build.querySelectorAll("input")).find((i) =>
    i.closest("div")?.textContent?.includes(label),
  ) as HTMLInputElement;
}

/** Stub scrollIntoView (jsdom has none) for one block, recording which ids it scrolled to. */
async function withScrollSpy(run: (seen: string[]) => Promise<void>) {
  const seen: string[] = [];
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
  proto.scrollIntoView = function (this: HTMLElement) {
    seen.push(this.id);
  };
  try {
    await run(seen);
  } finally {
    delete proto.scrollIntoView;
  }
}

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

function typeInto(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const tab = (host: HTMLElement, page: RecordPage) => host.querySelector<HTMLElement>(`#cx-tab-${page}`);
const panel = (host: HTMLElement, page: RecordPage) => host.querySelector<HTMLElement>(`#cx-panel-${page}`)!;
const selected = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="tab"][aria-selected="true"]')).map((t) => t.id);
const liveOn = (path: string) => fake.listeners.filter((l) => l.live && l.path === path).length;
const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text) ??
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));
const saveBar = (host: HTMLElement) => host.querySelector<HTMLElement>(".cx-savebar");

/** FORD → Occupation: open the Work band's editor and pick Retired (a record field, for the Save bar). */
async function markRetired(host: HTMLElement) {
  const occupation = panel(host, "ford").querySelector<HTMLElement>("#ford-occupation")!;
  await click(occupation.querySelector('[aria-label="Edit Occupation"]'));
  await click(buttonIn(occupation, "Retired"));
}

async function visitAll(host: HTMLElement) {
  for (const page of ["notes", "ford", "body", "goals", "story", "account", "overview"] as RecordPage[]) {
    await click(tab(host, page));
  }
}

beforeEach(() => {
  fake.listeners.length = 0;
  fake.gets.length = 0;
  fake.writes.length = 0;
  fake.toasts.length = 0;
  fake.fail.clear();
  fake.updateError = null;
  fake.rows = {};
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ClientCodex — pages", () => {
  it("opens on the Overview, with seven tabs and one selected", async () => {
    const host = await mount();
    const tabs = host.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(7);
    expect(Array.from(tabs).map((t) => t.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Overview"), expect.stringContaining("Account")]),
    );
    expect(selected(host)).toEqual(["cx-tab-overview"]);
    expect(host.querySelector(".psub-shell")?.hasAttribute("data-wrap")).toBe(true);
  });

  it("keeps every panel in the page from the start, and draws only the Overview until a page is visited", async () => {
    const host = await mount();
    const panels = host.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(7);
    expect(Array.from(panels).filter((p) => p.hasAttribute("hidden"))).toHaveLength(6);
    // Every tab's aria-controls points at a panel that exists.
    for (const t of Array.from(host.querySelectorAll('[role="tab"]'))) {
      expect(host.querySelector(`#${t.getAttribute("aria-controls")}`), t.id).not.toBeNull();
    }
    expect(panel(host, "overview").childElementCount).toBe(1);
    expect(panel(host, "ford").childElementCount).toBe(0);
    expect(panel(host, "goals").childElementCount).toBe(0);
  });

  it("mounts a page on its first visit and keeps the ones it left (hidden, not unmounted)", async () => {
    const host = await mount();
    await click(tab(host, "ford"));
    expect(selected(host)).toEqual(["cx-tab-ford"]);
    expect(panel(host, "ford").hidden).toBe(false);
    expect(panel(host, "ford").textContent).toContain("FORD");
    // The Overview is still there, just hidden.
    expect(panel(host, "overview").hidden).toBe(true);
    expect(panel(host, "overview").childElementCount).toBe(1);
    await click(tab(host, "overview"));
    expect(panel(host, "ford").hidden).toBe(true);
    expect(panel(host, "ford").childElementCount).toBe(1);
  });

  it("walks with the neighbour buttons, and Account's Next card says Done and goes home", async () => {
    const host = await mount(baseClient(), homeTrainer, "ford");
    await click(panel(host, "ford").querySelector('[aria-label="Previous page: Notes"]'));
    expect(selected(host)).toEqual(["cx-tab-notes"]);
    await click(tab(host, "ford"));
    await click(panel(host, "ford").querySelector('[aria-label="Next page: Body & Pulse"]'));
    expect(selected(host)).toEqual(["cx-tab-body"]);
    // The title of the page it walked to has the focus.
    expect(document.activeElement?.closest('[role="tabpanel"]')?.id).toBe("cx-panel-body");

    await click(tab(host, "account"));
    const next = panel(host, "account").querySelector<HTMLElement>(".cx-next")!;
    expect(next.textContent).toContain("Done");
    await click(next);
    expect(selected(host)).toEqual(["cx-tab-overview"]);
  });

  it("gives no two elements the same id, with every page mounted", async () => {
    const host = await mount();
    await visitAll(host);
    const ids = Array.from(host.querySelectorAll("[id]")).map((el) => el.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
    // The cards the Save bar and the doors land on are in the page.
    for (const anchor of [
      "ford-occupation",
      "ford-recreation",
      "body-build",
      "body-training-story",
      "body-watchouts",
      "body-figure",
      "body-floor",
      "body-measured",
      "body-timeline",
      "body-inbody",
      "body-pulse",
      "goals-coach",
      "goals-why",
      "goals-now",
      "goals-focus",
      "goals-plans",
      "goals-reached",
      "account-contact",
      "account-membership",
      "account-train-at",
      "account-on-file",
      "account-found-us",
      "account-fine-print",
    ]) {
      expect(host.querySelectorAll(`[id="${anchor}"][data-cx-anchor]`), anchor).toHaveLength(1);
    }
  });

  it("runs its layout effects with no ResizeObserver and no scrollIntoView (jsdom has neither)", async () => {
    expect(typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBe("undefined");
    expect(typeof HTMLElement.prototype.scrollIntoView).toBe("undefined");
    const host = await mount();
    await click(tab(host, "body"));
    expect(selected(host)).toEqual(["cx-tab-body"]);
  });

  it("shows a saved wingspan — the old form never seeded it", async () => {
    const host = await mount(baseClient({ wingspan: "59" }), homeTrainer, "body");
    // Read first (phase 12): Build says it, and its editor holds it.
    expect(panel(host, "body").querySelector("#body-build")?.textContent).toContain(`4'11" wingspan`);
    expect((await buildInput(host, "Wingspan")).value).toBe("59");
  });

  it("has no Recovery between sessions select any more (decision 7)", async () => {
    const host = await mount(baseClient({ recoveryMetric: "Poor" }), homeTrainer, "body");
    expect(panel(host, "body").textContent).not.toContain("Recovery between sessions");
  });

  it("says no injury notes are logged beside the body figure once the notes are read", async () => {
    const host = await mount(baseClient(), homeTrainer, "body");
    expect(panel(host, "body").querySelector("#body-figure")?.textContent).toContain(
      "No injury or incident notes logged.",
    );
  });

  it("never says no injury notes are logged when the notes could not be read", async () => {
    fake.fail.add("journalEntries");
    const host = await mount(baseClient(), homeTrainer, "body");
    const card = panel(host, "body").querySelector("#body-figure")?.textContent ?? "";
    expect(card).not.toContain("No injury or incident notes logged");
    expect(card).toContain("Injury and incident notes couldn't be loaded, so some may be missing.");
  });

  it("opens the Migration Hub from Account's fine print", async () => {
    vi.mocked(hosts.onOpenMigrationHub).mockClear();
    const host = await mount(baseClient(), homeTrainer, "account");
    await click(buttonIn(panel(host, "account"), "Migration Hub (OCR)"));
    expect(hosts.onOpenMigrationHub).toHaveBeenCalledTimes(1);
  });
});

describe("ClientCodex — while the tab is hidden", () => {
  it("scrolls to a door's card only once the tab is showing", async () => {
    const client = baseClient();
    await withScrollSpy(async (seen) => {
      const at = { client, trainer: homeTrainer, initial: "ford" as RecordPage, initialAnchor: "ford-occupation" };
      const host = await mount(client, homeTrainer, "ford", { initialAnchor: "ford-occupation", active: false });
      expect(seen).toEqual([]);
      await rerender(host, { ...at, active: true });
      expect(seen).toContain("ford-occupation");
    });
  });

  it("moves focus to the new page's title only once the tab is showing", async () => {
    const client = baseClient();
    const host = await mount(client, homeTrainer, "ford", { active: false });
    await click(panel(host, "ford").querySelector('[aria-label="Next page: Body & Pulse"]'));
    expect(selected(host)).toEqual(["cx-tab-body"]);
    expect(document.activeElement?.closest('[role="tabpanel"]')).toBeNull();
    await rerender(host, { client, trainer: homeTrainer, initial: "ford", active: true });
    expect(document.activeElement?.closest('[role="tabpanel"]')?.id).toBe("cx-panel-body");
  });
});

describe("ClientCodex — one load for the tab", () => {
  it("opens ONE listener each on the journal, FORD and the InBody scans, however many pages are visited", async () => {
    const host = await mount();
    await visitAll(host);
    await visitAll(host);
    expect(liveOn("journalEntries")).toBe(1);
    expect(liveOn("clients/c1/ford")).toBe(1);
    expect(liveOn("clients/c1/inbodyScans")).toBe(1);
    expect(liveOn("sessions")).toBe(1);
    expect(liveOn("noteDismissals/uid-ann")).toBe(1);
    // Body & Pulse's arrive/leave track reads the journal's sessions: no query of its own.
    expect(fake.gets.filter((p) => p === "sessions")).toEqual([]);
  });

  it("draws how she arrives on Body & Pulse from the journal's one sessions listener", async () => {
    const today = studioTodayKey();
    fake.rows.sessions = [
      [-2, -1],
      [-9, 0],
      [-16, 1],
    ].map(([ago, recovery], i) => {
      const date = addDays(today, ago);
      // Run in Journey: the live flow stamps the tablet's start time (mid-morning Eastern).
      return { id: `v${3 - i}`, clientId: "c1", date, clientStartTime: `${date}T15:00:00.000Z`, status: "Completed", preSessionCheckIn: { readiness: { recovery } } };
    });
    const host = await mount(baseClient(), homeTrainer, "body");
    const card = panel(host, "body").querySelector("#body-timeline")!;
    expect(card.querySelector(".cx-lede")?.textContent).toBe(
      "“How's the body since last time?” asked at 3 of her last 3 sessions. “Still feeling it” or “Still wrecked” at 1 of them.",
    );
    expect(card.querySelectorAll("rect.bp-tl__mark")).toHaveLength(3);
    expect(liveOn("sessions")).toBe(1);
    expect(fake.gets.filter((p) => p === "sessions")).toEqual([]);
  });

  it("opens Goals & Focus's own reads — the shared plans and the jots — on its first visit, once", async () => {
    const host = await mount();
    expect(liveOn("clients/c1/sharedNotes")).toBe(0);
    expect(liveOn("trainers/uid-ann/notes")).toBe(0);
    await click(tab(host, "goals"));
    expect(liveOn("clients/c1/sharedNotes")).toBe(1);
    expect(liveOn("trainers/uid-ann/notes")).toBe(1);
    await click(tab(host, "overview"));
    await click(tab(host, "goals"));
    expect(liveOn("clients/c1/sharedNotes")).toBe(1);
    expect(liveOn("trainers/uid-ann/notes")).toBe(1);
  });

  it("gives a cross-train reader Goals & Focus read only: no Edit, no Mark achieved, a focus still theirs to set", async () => {
    const host = await mount(baseClient({ smartGoal: "Walk the Camino" } as Partial<Client>), crossTrainer);
    await click(tab(host, "goals"));
    const goals = panel(host, "goals");
    expect(goals.textContent).toContain("Walk the Camino");
    expect(goals.querySelector('[aria-label^="Edit"]')).toBeNull();
    expect(buttonIn(goals, "Mark achieved")).toBeUndefined();
    expect(buttonIn(goals, "Set a focus")).toBeTruthy();
    // Her Dreams are FORD's, which a cross-train reader is refused.
    expect(goals.querySelector("#goals-why")?.textContent).toContain("FORD is kept by the home studio.");
  });

  it("reads nothing when switching between pages it has already shown", async () => {
    const host = await mount();
    await visitAll(host);
    const opened = fake.listeners.length;
    const got = fake.gets.length;
    await visitAll(host);
    expect(fake.listeners.length).toBe(opened);
    expect(fake.gets.length).toBe(got);
  });

  it("opens no FORD listener for a cross-train reader, and says whose it is", async () => {
    const host = await mount(baseClient(), crossTrainer);
    await visitAll(host);
    expect(fake.listeners.filter((l) => l.path === "clients/c1/ford")).toHaveLength(0);
    expect(tab(host, "ford")?.textContent).toContain("home studio only");
    await click(tab(host, "ford"));
    expect(panel(host, "ford").textContent).toContain("FORD is kept by Westlake");
  });
});

describe("ClientCodex — the critical line", () => {
  it("sits under the bar on the five other pages, never on the Overview or Notes", async () => {
    fake.rows.journalEntries = [criticalNote];
    const host = await mount();
    const line = () => host.querySelector('[data-testid="critical-line"]');
    expect(line()).toBeNull();
    await click(tab(host, "notes"));
    expect(line()).toBeNull();
    for (const page of ["ford", "body", "goals", "story", "account"] as RecordPage[]) {
      await click(tab(host, page));
      expect(line(), page).not.toBeNull();
      expect(line()?.getAttribute("data-state")).toBe("critical");
    }
    expect(line()?.textContent).toContain("Leg Press: Right knee: stop at 90° at the bottom turn.");
    expect(line()?.textContent).not.toContain("…");
  });

  it("is absent when nothing critical matters today", async () => {
    const host = await mount();
    await click(tab(host, "ford"));
    expect(host.querySelector('[data-testid="critical-line"]')).toBeNull();
  });

  it("says a critical note may be missing when the notes could not be read", async () => {
    fake.fail.add("journalEntries");
    const host = await mount();
    await click(tab(host, "ford"));
    const line = host.querySelector('[data-testid="critical-line"]');
    expect(line?.getAttribute("data-state")).toBe("failed");
    expect(line?.textContent).toContain("may be missing");
    expect(tab(host, "notes")?.textContent).toContain("couldn't load");
  });

  it("opens Notes from its button", async () => {
    fake.rows.journalEntries = [criticalNote];
    const host = await mount(baseClient(), homeTrainer, "account");
    await click(buttonIn(host.querySelector('[data-testid="critical-line"]')!, "Open the note"));
    expect(selected(host)).toEqual(["cx-tab-notes"]);
  });

  it("lands on the note itself, not just the page, and draws it once there", async () => {
    fake.rows.journalEntries = [criticalNote];
    const host = await mount(baseClient(), homeTrainer, "account");
    await click(buttonIn(host.querySelector('[data-testid="critical-line"]')!, "Open the note"));
    const notes = panel(host, "notes");
    const card = notes.querySelector("#thread-crit1");
    expect(card).not.toBeNull();
    expect(card?.classList.contains("nx-focus")).toBe(true);
    // The critical note is drawn once on Notes, and the line is not under the bar there.
    expect(notes.textContent!.split("stop at 90° at the bottom turn").length - 1).toBe(1);
    expect(host.querySelector('[data-testid="critical-line"]')).toBeNull();
  });
});

describe("ClientCodex — the Notes page", () => {
  it("opens the composer from the Overview's Write a note, with the cursor in it", async () => {
    const host = await mount();
    await click(buttonIn(panel(host, "overview"), "Write a note"));
    expect(selected(host)).toEqual(["cx-tab-notes"]);
    const composer = panel(host, "notes").querySelector('[data-testid="note-composer"]')!;
    expect(composer.closest("[hidden]")).toBeNull();
    expect(document.activeElement).toBe(composer.querySelector("textarea"));
  });

  it("puts the FORD door's number on Notes once FORD is read, and saves FORD / Life in place for the home studio", async () => {
    fake.rows["clients/c1/ford"] = [
      { id: "f1", clientId: "c1", studioId: "s1", pillar: "family", body: "Married to Tom", isArchived: false },
      { id: "f2", clientId: "c1", studioId: "s1", pillar: null, body: "Sister visiting", isArchived: false },
    ];
    const host = await mount(baseClient(), homeTrainer, "notes");
    const door = panel(host, "notes").querySelector(".nx-door")!;
    expect(door.getAttribute("aria-label")).toBe("Life, in FORD: 2 details");
    await click(buttonIn(panel(host, "notes"), "Write a note…"));
    const composer = panel(host, "notes").querySelector('[data-testid="note-composer"]')!;
    await typeInto(composer.querySelector("textarea"), "Grandson graduates in May");
    await click(buttonIn(composer, "FORD / Life"));
    await click(buttonIn(composer, "Save to FORD"));
    const adds = fake.writes.filter((w) => w.op === "add");
    expect(adds.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(adds[0].data).toMatchObject({ studioId: "s1", authorId: "uid-ann", body: "Grandson graduates in May" });
    await click(door);
    expect(selected(host)).toEqual(["cx-tab-ford"]);
  });

  it("gives a cross-train reader no FORD number and no FORD save, but their notes still save", async () => {
    const host = await mount(baseClient(), crossTrainer, "notes");
    const notes = panel(host, "notes");
    expect(notes.querySelector(".nx-door")?.getAttribute("aria-label")).toBe("Life, in FORD");
    await click(buttonIn(notes, "Write a note…"));
    const composer = notes.querySelector('[data-testid="note-composer"]')!;
    await click(buttonIn(composer, "FORD / Life"));
    expect(buttonIn(composer, "Save to FORD")).toBeUndefined();
    await click(buttonIn(composer, "FORD / Life"));
    await typeInto(composer.querySelector("textarea"), "Visiting from Solon this month");
    await click(buttonIn(composer, "Save — file later"));
    const adds = fake.writes.filter((w) => w.op === "add");
    expect(adds.map((w) => w.path)).toEqual(["journalEntries"]);
    expect(adds[0].data).toMatchObject({ authorId: "uid-ann", kind: "general" });
  });
});

describe("ClientCodex — the FORD page carries the older life notes", () => {
  const anniversary = {
    ...criticalNote,
    id: "anniv",
    kind: "life",
    category: "Anniversary",
    body: "Anniversary is Oct 12. They're planning a trip for the 41st.",
    importance: "standard",
    machineId: null,
  };

  it("shows an older Anniversary note in Family, and no longer on Notes", async () => {
    fake.rows.journalEntries = [anniversary];
    const host = await mount(baseClient(), homeTrainer, "notes");
    expect(panel(host, "notes").textContent).not.toContain("Anniversary is Oct 12.");
    // The door and the sub-toggle count it: it is on FORD now.
    expect(panel(host, "notes").querySelector(".nx-door")?.getAttribute("aria-label")).toBe("Life, in FORD: 1 detail");
    expect(tab(host, "ford")?.textContent).toContain("1 detail");
    await click(tab(host, "ford"));
    const family = panel(host, "ford").querySelector<HTMLElement>("#ford-family")!;
    expect(family.textContent).toContain("Anniversary is Oct 12.");
    expect(family.textContent).toContain("From an older note");
  });

  it("still shows it to a cross-train reader, who cannot read FORD", async () => {
    fake.rows.journalEntries = [anniversary];
    const host = await mount(baseClient(), crossTrainer, "ford");
    expect(panel(host, "ford").querySelector("#ford-family")?.textContent).toContain("Anniversary is Oct 12.");
    expect(fake.listeners.filter((l) => l.path === "clients/c1/ford")).toHaveLength(0);
  });
});

describe("ClientCodex — In one line (phase 11)", () => {
  const rows = () => [
    { id: "f1", clientId: "c1", studioId: "s1", pillar: "family", body: "Married to Tom", isPinned: true, isArchived: false },
    {
      id: "one-line",
      kind: "one-line",
      clientId: "c1",
      studioId: "s1",
      pillar: null,
      body: "Retired hygienist, pickleball regular",
      isPinned: true,
      isArchived: true,
      authorId: "uid-jess",
      authorName: "Jess Moreno",
      occurredAt: new Date(2026, 8, 20, 12),
    },
  ];

  it("arrives with FORD's one listener, heads the Overview's FORD door and the FORD page, and is never a detail", async () => {
    fake.rows["clients/c1/ford"] = rows();
    const host = await mount();
    const line = panel(host, "overview").querySelector('[data-testid="ov-one-line"]');
    expect(line?.textContent).toBe("Retired hygienist, pickleball regular");
    expect(line?.closest(".cx-slot")?.textContent).toContain("Written by the team · last by Jess Moreno");
    // Counted as nothing: one detail on the sub-toggle, none to file.
    expect(tab(host, "ford")?.textContent).toContain("1 detail");
    await click(tab(host, "ford"));
    const ford = panel(host, "ford");
    expect(ford.querySelector("#ford-one-line")?.textContent).toContain("Retired hygienist, pickleball regular");
    expect(ford.querySelector(".fordpg-tray")).toBeNull();
    expect(liveOn("clients/c1/ford")).toBe(1);
  });

  it("is never shown to a cross-train reader, whose FORD is never read", async () => {
    fake.rows["clients/c1/ford"] = rows();
    const host = await mount(baseClient(), crossTrainer);
    expect(panel(host, "overview").querySelector('[data-testid="ov-one-line"]')).toBeNull();
    expect(panel(host, "overview").textContent).not.toContain("Retired hygienist");
    expect(fake.listeners.filter((l) => l.path === "clients/c1/ford")).toHaveLength(0);
  });
});

describe("ClientCodex — the Story (phase 15)", () => {
  const migrated = () =>
    baseClient({
      priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker" },
      // Before Sep 24 2026, the day this was written: the Story is what has
      // already happened, and the shell's today is the real one.
      goalHistory: [{ goal: "Walk 5 miles without stopping", achievedAt: "2026-09-20T17:00:00Z", byName: "Jess" }],
    } as Partial<Client>);
  const camino = {
    id: "moment",
    clientId: "c1",
    studioId: "s1",
    pillar: "dreams",
    body: "Booked the Camino with Tom.",
    isPinned: false,
    isArchived: false,
    authorId: "uid-marcus",
    authorName: "Marcus Lee",
    occurredAt: new Date(2026, 8, 18, 12),
  };

  it("is built from the tab's one load: its line on the bar, the years before Journey, a FORD moment — and no read of its own", async () => {
    fake.rows["clients/c1/ford"] = [camino];
    const host = await mount(migrated());
    expect(tab(host, "story")?.textContent).toContain("since 2019");
    const opened = fake.listeners.length;
    const got = fake.gets.length;
    await click(tab(host, "story"));
    expect(fake.listeners.length).toBe(opened);
    expect(fake.gets.length).toBe(got);
    const story = panel(host, "story");
    expect(story.querySelector(".st-since")?.textContent).toMatch(/^With Max Strength since Mar 2019\./);
    expect(story.querySelector('[data-testid="story-era"]')?.textContent).toContain("Mar 2019 – Sep 2026 · 412 sessions in FileMaker");
    expect(story.textContent).toContain("Booked the Camino with Tom.");
    expect(story.textContent).toContain("Goal reached: Walk 5 miles without stopping.");
    expect(story.textContent).not.toMatch(/\bnew client\b/i);
  });

  it("opens the card a moment came from", async () => {
    const host = await mount(migrated());
    await click(tab(host, "story"));
    const goal = Array.from(panel(host, "story").querySelectorAll<HTMLButtonElement>("button.st-beat__door")).find((b) =>
      b.textContent?.includes("Goal reached"),
    );
    await withScrollSpy(async (seen) => {
      await click(goal);
      expect(selected(host)).toEqual(["cx-tab-goals"]);
      expect(seen).toContain("goals-reached");
    });
  });

  it("tells a cross-train reader FORD is the home studio's, with no FORD listener", async () => {
    fake.rows["clients/c1/ford"] = [camino];
    const host = await mount(migrated(), crossTrainer);
    await click(tab(host, "story"));
    const story = panel(host, "story");
    expect(story.textContent).toContain("FORD is kept by the home studio, so FORD moments aren't shown here.");
    expect(story.textContent).not.toContain("Booked the Camino");
    expect(fake.listeners.filter((l) => l.path === "clients/c1/ford")).toHaveLength(0);
  });
});

describe("ClientCodex — the one Save bar", () => {
  it("draws no bar while nothing is unsaved", async () => {
    const host = await mount();
    expect(saveBar(host)).toBeNull();
  });

  it("says where an edit is from another page, and Show goes back to it", async () => {
    const host = await mount(baseClient(), homeTrainer, "ford");
    await markRetired(host);
    await click(tab(host, "account"));
    expect(saveBar(host)?.textContent).toContain("1 unsaved change · FORD · Occupation");

    const seen: string[] = [];
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
    proto.scrollIntoView = function (this: HTMLElement) {
      seen.push(this.id);
    };
    try {
      await click(buttonIn(saveBar(host)!, "Show"));
    } finally {
      delete proto.scrollIntoView;
    }
    expect(selected(host)).toEqual(["cx-tab-ford"]);
    expect(seen).toContain("ford-occupation");
  });

  it("Discard puts the record back and closes the bar", async () => {
    const host = await mount(baseClient(), homeTrainer, "ford");
    await markRetired(host);
    expect(saveBar(host)).not.toBeNull();
    await click(buttonIn(saveBar(host)!, "Discard"));
    expect(saveBar(host)).toBeNull();
    // The editor closes on a discard, and the band reads the record again.
    const occupation = panel(host, "ford").querySelector<HTMLElement>("#ford-occupation")!;
    expect(occupation.querySelector('[aria-label="Edit Occupation"]')).not.toBeNull();
    expect(occupation.querySelector(".fordpg-band")?.textContent).toContain("Work not recorded yet");
    expect(fake.writes).toEqual([]);
  });

  it("Save writes exactly the changed field and who changed it, once", async () => {
    const host = await mount(baseClient(), homeTrainer, "ford");
    await markRetired(host);
    await click(buttonIn(saveBar(host)!, "Save changes"));
    const updates = fake.writes.filter((w) => w.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("clients/c1");
    expect(updates[0].data).toEqual({ isRetired: true, lastUpdatedBy: "t-ann" });
    expect(fake.toasts).toContainEqual({ kind: "success", message: "Saved 1 change." });
    expect(saveBar(host)).toBeNull();
  });

  it("names two cards on two pages, and saves both in one write", async () => {
    const host = await mount(baseClient(), homeTrainer, "ford");
    await markRetired(host);
    await click(tab(host, "body"));
    await typeInto(await buildInput(host, "Wingspan"), "61");
    expect(saveBar(host)?.textContent).toContain("2 unsaved changes · FORD · Occupation, Body & Pulse · Build");
    await click(buttonIn(saveBar(host)!, "Save changes"));
    const updates = fake.writes.filter((w) => w.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({ isRetired: true, wingspan: "61", lastUpdatedBy: "t-ann" });
  });

  it("keeps every edit when the save is refused, and says where the record is kept", async () => {
    fake.updateError = { code: "permission-denied" };
    const host = await mount(baseClient(), homeTrainer, "ford");
    await markRetired(host);
    await click(buttonIn(saveBar(host)!, "Save changes"));
    expect(saveBar(host)?.textContent).toContain("1 unsaved change");
    expect(fake.toasts).toContainEqual({
      kind: "error",
      message: "Couldn't save. Nothing was changed. This record can only be changed at Westlake.",
    });
  });
});

describe("ClientCodex — a new snapshot of the record", () => {
  it("follows the record while nothing is unsaved", async () => {
    const host = await mount(baseClient(), homeTrainer, "body");
    expect((await buildInput(host, "Wingspan")).value).toBe("59");
    await rerender(host, { client: baseClient({ wingspan: "62" }), trainer: homeTrainer, initial: "body" });
    expect((await buildInput(host, "Wingspan")).value).toBe("62");
    expect(saveBar(host)).toBeNull();
  });

  it("never wipes a half-typed edit, and never writes back what it held", async () => {
    const host = await mount(baseClient(), homeTrainer, "body");
    await typeInto(await buildInput(host, "Wingspan"), "61");
    // Something about the client saved elsewhere meanwhile (a height from another iPad).
    await rerender(host, { client: baseClient({ height: "5'2\"" }), trainer: homeTrainer, initial: "body" });
    expect((await buildInput(host, "Wingspan")).value).toBe("61");
    expect(saveBar(host)?.textContent).toContain("1 unsaved change · Body & Pulse · Build");
    // The form holds while anything is unsaved, so the other fields keep what it had.
    expect((await buildInput(host, "Height")).value).toBe("5'0\"");

    await click(buttonIn(saveBar(host)!, "Save changes"));
    // Only the edit is written: the height it held is never put back over the new one.
    expect(fake.writes.filter((w) => w.op === "update").map((w) => w.data)).toEqual([
      { wingspan: "61", lastUpdatedBy: "t-ann" },
    ]);
    // Nothing unsaved again, so it follows the record: the height saved elsewhere shows.
    expect((await buildInput(host, "Height")).value).toBe("5'2\"");
  });

  it("follows the next snapshot after a save", async () => {
    const host = await mount(baseClient(), homeTrainer, "body");
    await typeInto(await buildInput(host, "Wingspan"), "61");
    await click(buttonIn(saveBar(host)!, "Save changes"));
    expect(saveBar(host)).toBeNull();
    await rerender(host, {
      client: baseClient({ wingspan: "61", weight: "150" }),
      trainer: homeTrainer,
      initial: "body",
    });
    expect((await buildInput(host, "Wingspan")).value).toBe("61");
    expect((await buildInput(host, "Weight")).value).toBe("150");
    expect(saveBar(host)).toBeNull();
  });
});

describe("ClientCodex — read only", () => {
  it("gives a cross-train reader the pages read only, with the reason, and no Save bar", async () => {
    const host = await mount(baseClient(), crossTrainer);
    expect(host.querySelector(".psub-context")?.textContent).toBe(
      "Read only here · Westlake keeps this record. Notes you write still save.",
    );
    await visitAll(host);
    // Every page reads first; Account, the last to leave its form behind
    // (phase 16), offers them no editor: no nickname, no identity, no lock,
    // no studio to approve, no Edit on how she found us.
    const account = panel(host, "account");
    for (const text of ["Set a nickname", "Edit", "Lock the tier", "Use Mindbody's"]) {
      expect(buttonIn(account, text), text).toBeUndefined();
    }
    expect(account.querySelectorAll("input, textarea, select, .cx-pick")).toHaveLength(0);
    // The fine print is readable (the client document is); the Migration Hub
    // is for a reader who may change the record.
    expect(host.querySelector("#account-fine-print")).not.toBeNull();
    expect(buttonIn(account, "Migration Hub (OCR)")).toBeUndefined();
    expect(saveBar(host)).toBeNull();
  });

  it("takes no edit from a reader who may not change the record, even from a control a page failed to hide", async () => {
    // A control that escaped a page's canEdit gate (a portaled popover, an
    // editor added later) still calls updateField: the form refuses it.
    const probe: { form?: RecordForm } = {};
    function Probe() {
      probe.form = useRecordForm({ client: baseClient(), canEdit: false, trainerId: "t-sol" });
      return null;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    await act(async () => root.render(<Probe />));
    await act(async () => probe.form!.updateField("wingspan", "61"));
    expect(probe.form!.count).toBe(0);
    expect(probe.form!.formData.wingspan).toBe("59");
    let saved: boolean | undefined;
    await act(async () => {
      saved = await probe.form!.save();
    });
    expect(saved).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it("gives a trainer at the home studio live editors and no context line", async () => {
    const host = await mount();
    await visitAll(host);
    const account = panel(host, "account");
    for (const text of ["Set a nickname", "Edit", "Lock the tier", "Migration Hub (OCR)"]) {
      expect(buttonIn(account, text), text).toBeDefined();
    }
    // The studios she may also train at are picks for them.
    expect(account.querySelectorAll("#account-train-at .cx-pick").length).toBeGreaterThan(0);
    expect(host.querySelector(".psub-context")).toBeNull();
    expect(host.querySelector("#account-fine-print")).not.toBeNull();
  });
});

describe("ClientCodex — the Overview", () => {
  it("counts the notes and lists the open ones, loudest first", async () => {
    fake.rows.journalEntries = [criticalNote];
    const host = await mount();
    const overview = panel(host, "overview");
    expect(overview.textContent).toContain("1 open, 1 critical");
    expect(overview.textContent).toContain("Leg Press:");
    expect(overview.querySelector(".cx-loud")?.textContent).toBe("Critical");
  });

  it("says the notes could not be loaded rather than 'no notes'", async () => {
    fake.fail.add("journalEntries");
    const host = await mount();
    expect(panel(host, "overview").textContent).toContain("Notes couldn't be loaded");
    expect(panel(host, "overview").textContent).not.toContain("No notes");
  });

  it("has a door to every page but Notes, which has its own band", async () => {
    const host = await mount();
    const doors = Array.from(panel(host, "overview").querySelectorAll<HTMLElement>(".cx-ov-doors .cx-slot"));
    expect(doors.map((d) => d.querySelector(".cx-eyebrow")?.textContent)).toEqual([
      "FORD",
      "Body & Pulse",
      "Goals & Focus",
      "Story",
      "Account",
    ]);
    await click(doors[1]);
    expect(selected(host)).toEqual(["cx-tab-body"]);
  });
});
