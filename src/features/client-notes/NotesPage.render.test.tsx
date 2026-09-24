// @vitest-environment jsdom
/**
 * THE NOTES PAGE, MOUNTED (client codex, the Notes page).
 *
 * The page does its work during render (the catalog's chips and zones, the
 * briefing line on every Open card) and in effects (a door's one-shot
 * request: open a thread, the composer, Resolved). Only a mount proves it:
 *
 *   - a critical note is drawn ONCE, first in Open, the whole width; a chip or
 *     a search that hides it brings up the critical line, and "Show it" brings
 *     it back;
 *   - Standing context is one line each and opens in place; Resolved is folded
 *     to its count, then month by month, "closed …";
 *   - the chips count resolved notes too, and a filter that leaves nothing
 *     open or standing says so, with the way to the resolved ones;
 *   - the "Life · in FORD" door says its number only when it is known;
 *   - the briefing line: on your next briefing, hushed by you (and back), from
 *     a date, gone quiet after three weeks — and the hush writes only
 *     `noteDismissals/{Auth uid}`;
 *   - an unfiled critical note looks critical in the tray, and a door to it
 *     lands on its tray card;
 *   - a failed read is never "No notes": a banner says so; a migrating
 *     client's empty page says older notes live elsewhere;
 *   - no amber anywhere in the banners.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-jane" } },
}));

const fake = vi.hoisted(() => ({
  adds: [] as { path: string; data: any }[],
  sets: [] as { path: string; data: any }[],
  updates: [] as { path: string; data: any }[],
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], size: 0 }),
    addDoc: async (ref: any, data: any) => {
      fake.adds.push({ path: ref.__path, data });
      return { id: `new-${fake.adds.length}` };
    },
    setDoc: async (ref: any, data: any) => {
      fake.sets.push({ path: ref.__path, data });
    },
    updateDoc: async (ref: any, data: any) => {
      fake.updates.push({ path: ref.__path, data });
    },
    writeBatch: () => ({ update() {}, set() {}, delete() {}, commit: async () => {} }),
    deleteField: () => ({ __delete: true }),
    serverTimestamp: () => ({ __server: true }),
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { NotesPage, type NotesPageProps } from "./NotesPage";
import { notesOnRecord } from "./record-selectors";
import { assembleThreads } from "./threads";
import type { Client, Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { UseClientJournalResult } from "../../hooks/useClientJournal";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = "2026-09-24";
const day = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00-04:00`);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: null,
    body: `note ${over.id}`,
    importance: "standard",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jess",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: day("2026-09-01"),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const MACHINES = [{ id: "m-leg", name: "Leg Press" }] as Machine[];
const client = { id: "c1", homeStudioId: "s1", firstName: "Carol", lastName: "Brennan", gender: "Female" } as Client;

const crit = entry({
  id: "crit",
  kind: "injury",
  importance: "critical",
  machineId: "m-leg",
  body: "Right knee: stop at 90° at the bottom turn. She felt a pinch.",
  occurredAt: day("2026-09-03"),
});
const lifeCrit = entry({ id: "life-crit", kind: "life", category: "Other", importance: "critical", body: "Husband in hospital this week — go gently.", occurredAt: day("2026-09-02") });
const headsUp = entry({ id: "hu", kind: "coaching", category: "Pace", importance: "elevated", body: "Camino walks at weekends — Monday legs may be tired.", occurredAt: day("2026-09-15"), effectiveUntil: day("2026-10-03", 23) });
const agedOff = entry({ id: "old-hu", kind: "preference", importance: "elevated", body: "Wrap-up: a bit sore after the move.", occurredAt: day("2026-08-20") });
const eq1 = entry({ id: "eq1", kind: "equipment", machineId: "m-leg", body: "Seat 7, gap 6.\nBack angle P2." });
const pref1 = entry({ id: "pref1", kind: "preference", body: "Fan on, no music." });
const coach1 = entry({ id: "coach1", kind: "coaching", category: "Posture", body: "Count her into the turnaround." });
const coach1u = entry({ id: "coach1-u", threadId: "coach1", body: "Better today.", occurredAt: day("2026-09-10"), authorName: "AJ Jurgens" });
const lifeAnn = entry({ id: "life-ann", kind: "life", category: "Anniversary", body: "Anniversary is Oct 12 — planning a trip." });
const injOld = entry({ id: "inj-old", kind: "injury", body: "Right knee puffy after a long pickleball morning.", occurredAt: day("2026-08-03"), resolvedAt: day("2026-08-07") });
const eqOld = entry({ id: "eq-old", kind: "equipment", body: "Chest press seat 2 while the pad is out.", occurredAt: day("2026-09-05"), effectiveFrom: day("2026-09-05"), effectiveUntil: day("2026-09-20", 23) });
const rawCrit = entry({ id: "raw-crit", kind: "general", origin: "in_session", importance: "critical", body: "Dizzy after the leg press.", occurredAt: day("2026-09-23") });

const ALL = [crit, lifeCrit, headsUp, agedOff, eq1, pref1, coach1, coach1u, lifeAnn, injOld, eqOld, rawCrit];

function journalOf(list: JournalEntry[], over: Partial<UseClientJournalResult> = {}): UseClientJournalResult {
  const threads = assembleThreads(list);
  const roots = list.filter((e) => !e.threadId);
  return {
    entries: roots,
    threads,
    focuses: [],
    criticalEntries: [rawCrit, crit, lifeCrit].filter((e) => list.includes(e)),
    headsUpEntries: [headsUp].filter((e) => list.includes(e)),
    isLoading: false,
    needsIndex: false,
    capped: false,
    ...over,
  };
}

const AUTHOR = { id: "uid-jane", initials: "JC", fullName: "Jane Coach" };

function propsFor(list: JournalEntry[] = ALL, over: Partial<NotesPageProps> = {}): NotesPageProps {
  const journal = over.journal ?? journalOf(list);
  return {
    client,
    journal,
    record: notesOnRecord(journal.threads ?? [], TODAY),
    notesState: "ready",
    dismissals: { dismissals: {}, status: "ready" },
    machines: MACHINES,
    author: AUTHOR,
    today: TODAY,
    coverage: "complete",
    possessive: "her",
    fordWritable: true,
    fordStudioId: "s1",
    fordDoorCount: null,
    onOpenFord: () => {},
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let mounted: { root: Root; host: HTMLElement }[] = [];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount(props: NotesPageProps) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <ToastProvider>
          <NotesPage {...props} />
        </ToastProvider>
      </StrictMode>,
    );
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

async function rerender(host: HTMLElement, props: NotesPageProps) {
  const m = mounted.find((x) => x.host === host)!;
  await act(async () => {
    m.root.render(
      <StrictMode>
        <ToastProvider>
          <NotesPage {...props} />
        </ToastProvider>
      </StrictMode>,
    );
  });
  await settle();
}

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));
const zone = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-testid="zone-${id}"]`);

beforeEach(() => {
  fake.adds.length = 0;
  fake.sets.length = 0;
  fake.updates.length = 0;
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

describe("NotesPage — the zones", () => {
  it("draws a critical note once, first in Open and the whole width", async () => {
    const host = await mount(propsFor());
    expect(host.textContent).not.toContain("Critical & pinned");
    expect(host.textContent!.split("stop at 90° at the bottom turn").length - 1).toBe(1);
    const open = zone(host, "open")!;
    const cards = Array.from(open.querySelectorAll("article"));
    expect(cards.map((c) => c.id)).toEqual(["thread-crit", "thread-life-crit", "thread-hu", "thread-old-hu"]);
    expect(cards[0].className).toContain("nt-card--critical");
    // Open cards draw their spine open; a critical note names its machine in full.
    expect(cards[0].textContent).toContain("Leg Press");
    // No critical line on Notes while nothing is filtered: the card is right there.
    expect(host.querySelector('[data-testid="critical-line"]')).toBeNull();
  });

  it("draws Standing context one line each and opens a row in place", async () => {
    const host = await mount(propsFor());
    const standing = zone(host, "standing")!;
    const rows = Array.from(standing.querySelectorAll<HTMLButtonElement>("button.nx-row"));
    expect(rows).toHaveLength(4);
    expect(standing.querySelectorAll("article")).toHaveLength(0);
    // The machine first, in full, then the note's first line.
    const eq = standing.querySelector('[data-testid="row-eq1"]')!;
    expect(eq.querySelector(".nx-row__body")?.textContent).toBe("Leg Press: Seat 7, gap 6.");
    expect(eq.querySelector(".nx-row__meta")?.textContent).toBe("Jess · Sep 1");
    expect(standing.querySelector('[data-testid="row-coach1"] .nx-row__meta')?.textContent).toBe("Jess · Sep 1 · 1 update");
    // Settled life notes stay on Notes until the FORD page carries them.
    expect(standing.querySelector('[data-testid="row-life-ann"]')).not.toBeNull();

    await click(eq);
    expect(eq.getAttribute("aria-expanded")).toBe("true");
    const card = standing.querySelector("#thread-eq1")!;
    expect(card).not.toBeNull();
    expect(buttonIn(card, "Add an update")).toBeTruthy();
    await click(eq);
    expect(eq.getAttribute("aria-expanded")).toBe("false");
    expect(standing.querySelector("#thread-eq1")).toBeNull();
  });

  it("folds Resolved to its count, then lists it month by month with how each one ended", async () => {
    const host = await mount(propsFor());
    expect(host.textContent).toContain("Resolved · 2");
    expect(zone(host, "resolved")).toBeNull();
    const toggle = buttonIn(host, "Show the 2 resolved notes")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    const resolved = zone(host, "resolved")!;
    expect(Array.from(resolved.querySelectorAll(".nx-month__label")).map((h) => h.textContent)).toEqual([
      "September 2026",
      "August 2026",
    ]);
    expect(resolved.querySelector('[data-testid="row-inj-old"] .nx-row__meta')?.textContent).toBe("Jess · Aug 3 · closed Aug 7");
    expect(resolved.querySelector('[data-testid="row-eq-old"] .nx-row__meta')?.textContent).toBe("Jess · Sep 5 · ended Sep 20");
    expect(resolved.querySelector('[data-testid="row-inj-old"]')?.className).toContain("nx-row--done");
    expect(buttonIn(host, "Hide the 2 resolved notes")).toBeTruthy();
  });
});

describe("NotesPage — the filters", () => {
  it("says when nothing is open or standing, with one way to the resolved notes, not two", async () => {
    const host = await mount(propsFor([injOld, eqOld]));
    expect(host.querySelector(".nx-empty")?.textContent).toContain("Nothing open or standing right now.");
    // The Resolved header's toggle is the one button; the empty line adds none.
    expect(host.querySelector(".nx-empty button")).toBeNull();
    const toggles = Array.from(host.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").includes("Show the 2 resolved notes"),
    );
    expect(toggles).toHaveLength(1);
    await click(toggles[0]);
    expect(zone(host, "resolved")?.querySelector('[data-testid="row-inj-old"]')).not.toBeNull();
  });

  it("counts resolved notes on the chips, and a chip narrows every zone", async () => {
    const host = await mount(propsFor());
    const pick = host.querySelector('[data-testid="pick-injury"]')!;
    expect(pick.querySelector(".nx-pick__count")?.textContent).toBe("2");
    await click(pick);
    expect(host.textContent).toContain("Open · 1");
    expect(host.textContent).toContain("Resolved · 1");
    expect(zone(host, "standing")).toBeNull();
  });

  it("says when a filter leaves nothing open or standing, with the way to the resolved ones", async () => {
    const host = await mount(propsFor());
    await typeInto(host.querySelector('input[type="search"]'), "pickleball");
    const empty = host.querySelector(".nx-empty")!;
    expect(empty.textContent).toContain("Nothing open or standing matches this filter.");
    await click(buttonIn(empty, "Show the 1 resolved note"));
    expect(zone(host, "resolved")?.querySelector('[data-testid="row-inj-old"]')).not.toBeNull();
    await click(buttonIn(host.querySelector(".nx-empty")!, "Show everything"));
    expect(zone(host, "open")).not.toBeNull();
  });

  it("names a critical note a filter hides, and 'Show it' brings the card back", async () => {
    const host = await mount(propsFor());
    await click(host.querySelector('[data-testid="pick-equipment"]'));
    expect(zone(host, "open")).toBeNull();
    const line = host.querySelector('[data-testid="critical-line"]')!;
    expect(line.textContent).toContain("Critical ·");
    expect(line.textContent).toContain("Leg Press: Right knee: stop at 90° at the bottom turn.");
    await click(buttonIn(line, "Show it"));
    expect(host.querySelector('[data-testid="pick-equipment"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(zone(host, "open")?.querySelector("#thread-crit")).not.toBeNull();
    expect(host.querySelector('[data-testid="critical-line"]')).toBeNull();
  });

  it("has a door to FORD that says its number only when it is known", async () => {
    const onOpenFord = vi.fn();
    const host = await mount(propsFor(ALL, { fordDoorCount: 5, onOpenFord }));
    const door = host.querySelector<HTMLButtonElement>(".nx-door")!;
    expect(door.textContent).toContain("Life · in FORD");
    expect(door.querySelector(".nx-pick__count")?.textContent).toBe("5");
    expect(door.getAttribute("aria-label")).toBe("Life, in FORD: 5 details");
    await click(door);
    expect(onOpenFord).toHaveBeenCalledTimes(1);

    const unknown = await mount(propsFor(ALL, { fordDoorCount: null }));
    const door2 = unknown.querySelector(".nx-door")!;
    expect(door2.querySelector(".nx-pick__count")).toBeNull();
    expect(door2.getAttribute("aria-label")).toBe("Life, in FORD");
  });

  it("draws no counts while the notes load — unknown is not 0", async () => {
    const host = await mount(propsFor([], { notesState: "loading", journal: journalOf([], { isLoading: true }) }));
    expect(host.querySelector(".nx-pick__count")).toBeNull();
    expect(host.querySelector('[aria-label="Loading notes"]')).not.toBeNull();
    expect(host.textContent).not.toContain("No notes");
  });
});

describe("NotesPage — the briefing line", () => {
  it("says a Heads up is on your next briefing, and 'No need to remind me' writes only this trainer's dismissals", async () => {
    const host = await mount(propsFor());
    const card = host.querySelector("#thread-hu")!;
    expect(card.textContent).toContain("On your next briefing.");
    await click(buttonIn(card, "No need to remind me"));
    expect(fake.sets).toHaveLength(1);
    expect(fake.sets[0].path).toBe("noteDismissals/uid-jane");
    expect(Object.keys(fake.sets[0].data.threads)).toEqual(["hu"]);
    expect(fake.adds).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("says a hushed thread is hushed, only to you, and 'Show it again' takes the hush back", async () => {
    const host = await mount(propsFor(ALL, { dismissals: { dismissals: { hu: day("2026-09-20") }, status: "ready" } }));
    const card = host.querySelector("#thread-hu")!;
    expect(card.textContent).toContain("You hushed this on your briefing. Only you can see that.");
    await click(buttonIn(card, "Show it again"));
    expect(fake.sets[0].path).toBe("noteDismissals/uid-jane");
    expect(fake.sets[0].data.threads.hu).toEqual({ __delete: true });
  });

  it("offers no hush before the dismissals are read", async () => {
    const host = await mount(propsFor(ALL, { dismissals: { dismissals: {}, status: "loading" } }));
    const card = host.querySelector("#thread-hu")!;
    expect(card.textContent).toContain("On the briefing.");
    expect(buttonIn(card, "No need to remind me")).toBeUndefined();
  });

  it("says why an old Heads up with no end day is no longer read out", async () => {
    const host = await mount(propsFor());
    expect(host.querySelector("#thread-old-hu")?.textContent).toContain(
      "Off the briefing since Sep 10: a Heads up with no end day is read out for three weeks.",
    );
  });
});

describe("NotesPage — the tray and the doors", () => {
  it("shows an unfiled critical note as Critical in the tray, and a door to it lands on its tray card", async () => {
    const host = await mount(propsFor());
    const tray = host.querySelector('[data-testid="sweep-raw-crit"]')!;
    expect(tray.querySelector(".nc-loud")?.textContent).toBe("Critical");
    expect(tray.querySelector(".nc-loud")?.getAttribute("data-tone")).toBe("alert");
    // Not in a zone as well.
    expect(host.querySelector("#thread-raw-crit")).toBeNull();

    await rerender(host, propsFor(ALL, { intent: { key: 1, request: { kind: "thread", threadId: "raw-crit" } } }));
    expect(host.querySelector('[data-testid="sweep-raw-crit"]')?.classList.contains("nx-focus")).toBe(true);
  });

  it("opens a standing thread a door asks for, once per move", async () => {
    const host = await mount(propsFor(ALL, { intent: { key: 1, request: { kind: "thread", threadId: "pref1" } } }));
    const row = host.querySelector('[data-testid="row-pref1"]')!;
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("#thread-pref1")?.classList.contains("nx-focus")).toBe(true);
    // The trainer folds it; the same move is not acted on again.
    await click(row);
    await rerender(host, propsFor(ALL, { intent: { key: 1, request: { kind: "thread", threadId: "pref1" } } }));
    expect(row.getAttribute("aria-expanded")).toBe("false");
    // A new move to it opens it again.
    await rerender(host, propsFor(ALL, { intent: { key: 2, request: { kind: "thread", threadId: "pref1" } } }));
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });

  it("clears a filter hiding the thread a door asks for, and unfolds Resolved for a closed one", async () => {
    const host = await mount(propsFor());
    await click(host.querySelector('[data-testid="pick-coaching"]'));
    await rerender(host, propsFor(ALL, { intent: { key: 7, request: { kind: "thread", threadId: "inj-old" } } }));
    expect(host.querySelector('[data-testid="pick-coaching"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(zone(host, "resolved")?.querySelector('[data-testid="row-inj-old"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("waits for the notes before acting on a door to a thread", async () => {
    const loading = propsFor([], { notesState: "loading", journal: journalOf([], { isLoading: true }) });
    const host = await mount({ ...loading, intent: { key: 3, request: { kind: "thread", threadId: "pref1" } } });
    await rerender(host, propsFor(ALL, { intent: { key: 3, request: { kind: "thread", threadId: "pref1" } } }));
    expect(host.querySelector('[data-testid="row-pref1"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the composer with the cursor in it, and unfolds Resolved, when a door asks", async () => {
    const host = await mount(propsFor(ALL, { intent: { key: 1, request: { kind: "compose" } } }));
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    expect(composer.closest("[hidden]")).toBeNull();
    expect(document.activeElement).toBe(composer.querySelector("textarea"));

    const other = await mount(propsFor(ALL, { intent: { key: 1, request: { kind: "resolved" } } }));
    expect(zone(other, "resolved")).not.toBeNull();
  });

  it("puts the cursor back in a composer left open when a door asks for it again", async () => {
    // Opened on Notes, then the trainer went to the Overview (Notes stays
    // mounted, hidden) and tapped "Write a note".
    const host = await mount(propsFor());
    await click(buttonIn(host, "Write a note…"));
    const box = host.querySelector<HTMLTextAreaElement>('[data-testid="note-composer"] textarea')!;
    expect(document.activeElement).toBe(box);
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    try {
      elsewhere.focus();
      expect(document.activeElement).toBe(elsewhere);
      await rerender(host, propsFor(ALL, { intent: { key: 9, request: { kind: "compose" } } }));
      expect(document.activeElement).toBe(box);
    } finally {
      elsewhere.remove();
    }
  });
});

describe("NotesPage — empty, failed and large", () => {
  it("says there are no notes in Journey yet — and that older notes live elsewhere for a migrating client", async () => {
    const host = await mount(propsFor([]));
    expect(host.textContent).toContain("No notes in Journey yet.");
    expect(host.textContent).not.toContain("Notes from before Journey");
    const migrating = await mount(propsFor([], { coverage: "partial" }));
    expect(migrating.textContent).toContain("Notes from before Journey aren’t shown here.");
  });

  it("never says 'No notes' when the notes could not be read", async () => {
    const host = await mount(propsFor([], { notesState: "failed" }));
    expect(host.querySelector('[data-testid="notes-failed"]')?.textContent).toContain(
      "Some of her notes couldn’t be loaded",
    );
    expect(host.textContent).toContain("Nothing loaded yet.");
    expect(host.textContent).not.toContain("No notes in Journey yet.");
    // No "All 0", "Injury 0": a count is unknown when the read failed.
    expect(host.querySelector(".nx-pick__count")).toBeNull();

    // Some notes came back and some did not: still no counts that may run short.
    const partial = await mount(propsFor(ALL, { notesState: "failed" }));
    expect(zone(partial, "open")).not.toBeNull();
    expect(partial.querySelector(".nx-pick__count")).toBeNull();
  });

  it("says when the record is large or the index is missing, with no amber", async () => {
    const host = await mount(propsFor(ALL, { journal: journalOf(ALL, { capped: true, needsIndex: true }) }));
    const banners = Array.from(host.querySelectorAll(".nx-banner"));
    expect(banners).toHaveLength(2);
    expect(banners[0].textContent).toContain("only the first 200 are loaded");
    expect(banners[1].textContent).toContain("firebase deploy --only firestore:indexes");
    for (const el of Array.from(host.querySelectorAll("[class]"))) {
      expect(el.getAttribute("class")).not.toMatch(/amber/);
    }
  });

  it("offers FORD in place only to a reader who may write it", async () => {
    const host = await mount(propsFor(ALL, { fordWritable: false }));
    await click(buttonIn(host, "Write a note…"));
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    await click(buttonIn(composer, "FORD / Life"));
    expect(buttonIn(composer, "Save to FORD")).toBeUndefined();
    expect(composer.textContent).toContain("Personal details are kept in FORD");
  });
});
