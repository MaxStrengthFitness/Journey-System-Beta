// @vitest-environment jsdom
/**
 * Mounts the Notes area of the client record — the category-first composer
 * and the catalog — against a fake Firestore, plus the Active Session notes
 * sheet that shares the composer.
 *
 * The catalog does all its work during render (one pass building tiles,
 * shelves and months), and the composer hands FORD / Life off to a different
 * write path. Only a mount proves both: that the screen draws, that a tap
 * isolates a category, and that a personal detail never lands in
 * `journalEntries` (readable by every signed-in user).
 *
 * Reporting round (Sep 2026): the composer starts with no category and the
 * Save button reads "Save — file later"; an untagged save writes
 * `kind: "general"`; Heads up / Critical reveal "Matters until"; the To-file
 * tray files with one tap; the sheet's third tab mounts the Pulse quick-log
 * (stubbed here — its own render test covers it).
 *
 * Client codex (phase 1): the composer's FORD hand-off — on the Notes area
 * and in the quick-note dialog — stamps the studio the FORD read filters on
 * (`fordStudioIdOf`), so a client on the older `studioId` field still gets a
 * detail the rules accept and the Life section reads back.
 *
 * Client codex (the Notes page): the area is `NotesPage` on the tab's one
 * journal load. The composer is folded behind "Write a note…"; the critical
 * note is drawn once, in Open (never again as "Critical & pinned"); the seven
 * tiles became six chips and a door to FORD; and FORD / Life saves IN PLACE —
 * the same box, "Save to FORD" — on the page and in the quick-note dialog
 * alike. NotesPage.render.test.tsx covers the page's zones, doors and
 * briefing line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../subjective-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("../subjective-report")>();
  return {
    ...real,
    PulseQuickLog: (props: { client: { firstName?: string }; compact?: boolean; onDone?: () => void }) => (
      <div data-testid="pulse-stub" data-compact={props.compact ? "1" : "0"}>
        Pulse stub for {props.client.firstName}
        <button type="button" onClick={props.onDone}>Done</button>
      </div>
    ),
  };
});

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-jane" } },
}));

const writes: { path: string; data: any }[] = [];
const updates: { path: string; data: any }[] = [];
/** Set to refuse the next addDoc, as the rules or a dead connection would. */
const refuse = { nextAdd: false };

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], size: 0 }),
    addDoc: async (ref: any, data: any) => {
      if (refuse.nextAdd) {
        refuse.nextAdd = false;
        throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
      }
      writes.push({ path: ref.__path, data });
      return { id: `new-${writes.length}` };
    },
    updateDoc: async (ref: any, data: any) => {
      updates.push({ path: ref.__path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { SessionJournalSidebar } from "../../components/journal/SessionJournalSidebar";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import { NotesPage } from "./NotesPage";
import { NoteSweep } from "./NoteSweep";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { fileUnfiledEntry } from "./file-unfiled";
import { isUnfiled, splitUnfiled } from "./note-catalog";
import { notesOnRecord } from "./record-selectors";
import { assembleThreads } from "./threads";
import { fordStudioIdOf } from "../ford/ford-write";
import type { Client, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { UseClientJournalResult } from "../../hooks/useClientJournal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <ToastProvider>{ui}</ToastProvider>
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  writes.length = 0;
  updates.length = 0;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(text));

let seq = 0;
function entry(over: Partial<JournalEntry>): JournalEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: null,
    body: `note ${seq}`,
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: new Date(2026, 8, 1, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  };
}

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Client" } as Client;
const trainer = { id: "t-doc", fullName: "Jane Coach", initials: "JC", role: "LifeTransformer" } as any;

const critical = entry({
  id: "crit",
  kind: "general",
  isLegacy: true,
  origin: "profile",
  importance: "critical",
  body: "Check blood pressure before every session",
  authorId: "unknown",
});
const entries: JournalEntry[] = [
  entry({ id: "p1", category: "Pace", body: "Own the bottom", occurredAt: new Date(2026, 8, 10, 12) }),
  entry({ id: "p2", category: "Path", occurredAt: new Date(2026, 8, 12, 12) }),
  entry({ id: "p3", category: "Posture", occurredAt: new Date(2026, 7, 2, 12) }),
  entry({ id: "p4", category: "Purpose", occurredAt: new Date(2026, 7, 20, 12) }),
  entry({ id: "inj", kind: "injury", body: "Left knee — no deep flexion", occurredAt: new Date(2026, 7, 5, 12) }),
  entry({ id: "mb", kind: "consultation", isLegacy: true, origin: "mindbody", body: "Prefers 7am", authorId: "unknown" }),
  critical,
  // Saved mid-session with no category: unfiled, in the tray, not on a shelf.
  entry({ id: "raw", kind: "general", origin: "in_session", sessionId: "sess1", body: "Knee clicked on leg press", occurredAt: new Date(2026, 8, 14, 12) }),
];

const threads = assembleThreads(entries);
const journal: UseClientJournalResult = {
  entries,
  threads,
  focuses: [],
  criticalEntries: [critical],
  headsUpEntries: [],
  isLoading: false,
  needsIndex: false,
  capped: false,
};

const AUTHOR = { id: "uid-jane", initials: "JC", fullName: "Jane Coach" };
const TODAY = "2026-09-24";

/** The Notes page on the tab's one load, as the codex mounts it. */
function NotesArea({ onOpenFord = () => {}, who = client }: { onOpenFord?: () => void; who?: Client }) {
  return (
    <NotesPage
      client={who}
      journal={journal}
      record={notesOnRecord(threads, TODAY)}
      notesState="ready"
      dismissals={{ dismissals: {}, status: "ready" }}
      machines={[]}
      author={AUTHOR}
      today={TODAY}
      coverage="complete"
      possessive="her"
      fordWritable
      fordStudioId={fordStudioIdOf(who)}
      fordDoorCount={null}
      onOpenFord={onOpenFord}
    />
  );
}

/** Mount the page and open its composer, the way a trainer does. */
async function mountComposer(props: { onOpenFord?: () => void; who?: Client } = {}) {
  const host = await mount(<NotesArea {...props} />);
  await click(buttonByText(host, "Write a note…"));
  return { host, composer: host.querySelector('[data-testid="note-composer"]')! };
}

/** A pick's words, without its icon's or count's. */
const pickLabel = (el: Element) =>
  Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join("")
    .trim();

describe("the Notes page mounts", () => {
  it("draws the critical note once, six chips and a door, and the three zones", async () => {
    const host = await mount(<NotesArea />);
    const catalog = host.querySelector('[data-testid="notes-catalog"]')!;
    expect(catalog).toBeTruthy();
    // Drawn once, in Open: no "Critical & pinned" above the zones any more.
    expect(host.textContent).not.toContain("Critical & pinned");
    expect(host.textContent!.split("Check blood pressure").length - 1).toBe(1);

    const picks = Array.from(catalog.querySelectorAll(".nx-pick"));
    expect(picks.map(pickLabel)).toEqual(["All", "Coaching tip", "Equipment", "Incident", "Injury", "Preference", "Admin"]);
    const count = (id: string) => host.querySelector(`[data-testid="pick-${id}"] .nx-pick__count`)!.textContent;
    expect(count("coaching")).toBe("4");
    expect(count("admin")).toBe("2");
    // A category with nothing in it keeps its place, at 0.
    expect(count("equipment")).toBe("0");
    expect(catalog.querySelector(".nx-door")?.textContent).toContain("Life · in FORD");

    // The zones are the structure. Everything here is a plain "always" note
    // except the critical one, which shouts and therefore waits to be closed.
    const open = host.querySelector('[data-testid="zone-open"]')!;
    expect(open.querySelectorAll("article")).toHaveLength(1);
    expect(open.textContent).toContain("Check blood pressure");
    // Standing context is one line each, until a row is opened.
    const standing = host.querySelector('[data-testid="zone-standing"]')!;
    expect(standing.querySelectorAll("button.nx-row")).toHaveLength(6);
    expect(standing.querySelectorAll("article")).toHaveLength(0);
    // Nothing is resolved, so that zone is not drawn at all.
    expect(host.textContent).not.toContain("Resolved ·");
    // The coach chip row is gone: search finds a coach by name.
    expect(host.querySelector('[aria-label="Filter by coach"]')).toBeNull();
  });

  it("isolates a category with one tap and keeps the zones, and clears with a second", async () => {
    const host = await mount(<NotesArea />);
    const pick = host.querySelector('[data-testid="pick-coaching"]')!;
    await click(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("true");
    // A category narrows what is shown; it does not change how it is shown.
    expect(host.querySelectorAll('[data-testid="zone-standing"] button.nx-row')).toHaveLength(4);
    expect(host.querySelector('[data-testid="zone-open"]')).toBeNull();
    // …and the critical note it hid is still said, with a way back.
    expect(host.querySelector('[data-testid="critical-line"]')?.textContent).toContain("Check blood pressure");

    await click(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelectorAll('[data-testid="zone-standing"] button.nx-row')).toHaveLength(6);
    expect(host.querySelector('[data-testid="critical-line"]')).toBeNull();
  });

  it("searches across every category", async () => {
    const host = await mount(<NotesArea />);
    await typeInto(host.querySelector('input[type="search"]'), "knee");
    expect(host.querySelectorAll('[data-testid="zone-standing"] button.nx-row')).toHaveLength(1);
    expect(host.querySelector('[data-testid="zone-open"]')).toBeNull();
    expect(host.querySelector('[data-testid="pick-coaching"] .nx-pick__count')!.textContent).toBe("0");
    // The tray is not searched: an unfiled note is in the tray only.
    expect(host.querySelector('[data-testid="zone-standing"]')!.textContent).not.toContain("Knee clicked");
    await click(buttonByText(host.querySelector(".nx-search")!, "Clear"));
    expect(host.querySelectorAll('[data-testid="zone-standing"] button.nx-row').length).toBeGreaterThan(1);
  });

  it("folds the composer behind one bar, and Close keeps the words", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    expect(composer.closest("[hidden]")).not.toBeNull();
    await click(buttonByText(host, "Write a note…"));
    expect(composer.closest("[hidden]")).toBeNull();
    const box = composer.querySelector("textarea")!;
    expect(document.activeElement).toBe(box);
    await typeInto(box, "Half a thought");
    await click(buttonByText(host.querySelector(".nx-compose__head")!, "Close"));
    expect(composer.closest("[hidden]")).not.toBeNull();
    await click(buttonByText(host, "Finish your note…"));
    expect((composer.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Half a thought");
  });

  it("writes a note with the category chosen first", async () => {
    const { composer } = await mountComposer();
    const chips = Array.from(composer.querySelectorAll(".nc-chips")[0].querySelectorAll("button"));
    expect(chips.map((b) => b.textContent)).toEqual([
      "Coaching tip",
      "Equipment",
      "Incident",
      "Injury",
      "Preference",
      "FORD / Life",
    ]);
    // Nothing pre-selected, and the record says what that means.
    expect(chips.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(composer.textContent).toContain("Pick a category, or save and file it later.");
    expect(buttonByText(composer, "Save — file later")).toBeTruthy();

    await click(buttonByText(composer, "Injury"));
    // Injury starts as Heads up (the shared Loudness control), which reveals the mattering picker.
    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    expect(Array.from(loud.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Note", "Heads up", "Critical"]);
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Heads up");
    const when = composer.querySelector('[role="group"][aria-label="When does this matter"]')!;
    expect(when).toBeTruthy();
    expect(Array.from(when.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Always", "From – until", "Only on a day"]);
    expect(when.querySelector('[aria-pressed="true"]')!.textContent).toBe("Always");
    expect(composer.querySelector('input[aria-label="Starts mattering on"]')).toBeTruthy();
    await typeInto(composer.querySelector("textarea"), "Sore right shoulder since Tuesday");
    await click(buttonByText(composer, "Save injury"));

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("journalEntries");
    expect(writes[0].data).toMatchObject({
      clientId: "c1",
      kind: "injury",
      category: null,
      importance: "elevated",
      body: "Sore right shoulder since Tuesday",
      authorId: "uid-jane",
      focusId: null,
    });
    // The box is cleared for the next one, and nothing is chosen again.
    expect((composer.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect(buttonByText(composer, "Save — file later")).toBeTruthy();
  });

  it("saves an untagged note as general — capture now, file later", async () => {
    const { composer } = await mountComposer();
    await typeInto(composer.querySelector("textarea"), "Said her hip felt odd on the way in");
    // No "Matters until" while it is a plain Note.
    expect(composer.querySelector('input[aria-label="Matters until"]')).toBeNull();
    await click(buttonByText(composer, "Save — file later"));
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({
      kind: "general",
      category: null,
      importance: "standard",
      machineId: null,
      effectiveUntil: null,
      body: "Said her hip felt odd on the way in",
    });
    expect(isUnfiled({ kind: "general", isLegacy: undefined })).toBe(true);
  });

  it("offers the mattering picker for any Heads up, of any category, and writes a range's end as end of day", async () => {
    const { composer } = await mountComposer();
    await click(buttonByText(composer, "Preference"));
    await typeInto(composer.querySelector("textarea"), "On a trip — no sessions");
    // A plain note has no picker — only the offer to pin it to a date.
    expect(composer.querySelector('[role="group"][aria-label="When does this matter"]')).toBeNull();
    expect(buttonByText(composer, "Pin to a date (a birthday, an anniversary)")).toBeTruthy();

    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    await click(buttonByText(loud, "Heads up"));
    const when = composer.querySelector('[role="group"][aria-label="When does this matter"]')!;
    expect(when).toBeTruthy();
    await click(buttonByText(when, "From – until"));
    const until = composer.querySelector('input[aria-label="Stops mattering on"]');
    expect(until).toBeTruthy();
    expect(composer.textContent).toContain("After the last day it stops showing on the briefing.");
    await typeInto(until, "2026-09-20");
    await click(buttonByText(composer, "Save preference"));

    expect(writes[0].data).toMatchObject({ kind: "preference", importance: "elevated", repeat: null, effectiveFrom: null });
    const stored = writes[0].data.effectiveUntil.toDate() as Date;
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([2026, 8, 20, 23]);
  });

  it("pins a plain note to one day, every year — a birthday", async () => {
    const { composer } = await mountComposer();
    await click(buttonByText(composer, "Preference"));
    await typeInto(composer.querySelector("textarea"), "Birthday — brings the good coffee");
    await click(buttonByText(composer, "Pin to a date (a birthday, an anniversary)"));
    const on = composer.querySelector('input[aria-label="Only matters on"]');
    expect(on).toBeTruthy();
    await typeInto(on, "2026-11-05");
    const every = composer.querySelector('input[type="checkbox"]') as HTMLInputElement;
    every.click();
    await new Promise((r) => setTimeout(r, 0));
    await click(buttonByText(composer, "Save preference"));

    expect(writes[0].data).toMatchObject({ kind: "preference", importance: "standard", repeat: "yearly" });
    const from = writes[0].data.effectiveFrom.toDate() as Date;
    const until = writes[0].data.effectiveUntil.toDate() as Date;
    expect([from.getMonth(), from.getDate(), from.getHours()]).toEqual([10, 5, 12]);
    expect([until.getMonth(), until.getDate(), until.getHours()]).toEqual([10, 5, 23]);
  });

  it("keeps the incident's Critical default until the trainer touches loudness", async () => {
    const { composer } = await mountComposer();
    await click(buttonByText(composer, "Incident"));
    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Critical");
    await click(buttonByText(loud, "Note"));
    await click(buttonByText(composer, "Injury"));
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Note");
  });

  it("files a coaching tip with its P", async () => {
    const { composer } = await mountComposer();
    await click(buttonByText(composer, "Coaching tip"));
    await typeInto(composer.querySelector("textarea"), "Cue the exhale");
    await click(buttonByText(composer.querySelector('[aria-label="Which P"]')!, "Pace"));
    await click(buttonByText(composer, "Save coaching tip"));
    expect(writes[0].data).toMatchObject({ kind: "coaching", category: "Pace", importance: "standard" });
  });

  it("turns the typed words into a FORD capture in place — the same box, saved to FORD, never the journal", async () => {
    const onOpenFord = vi.fn();
    const { host, composer } = await mountComposer({ onOpenFord });
    // Typed first, as a note, then the trainer realises it is about her life.
    const box = composer.querySelector("textarea") as HTMLTextAreaElement;
    await typeInto(box, "Grandson graduates in May");
    await click(buttonByText(composer, "FORD / Life"));

    // The SAME box, still holding the words; no second capture component.
    expect(composer.querySelector("textarea")).toBe(box);
    expect(box.value).toBe("Grandson graduates in May");
    expect(composer.querySelector(".ford-capture")).toBeNull();
    expect(composer.getAttribute("data-mode")).toBe("ford");
    // A FORD detail has no loudness and no window.
    expect(composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')).toBeNull();
    const letters = composer.querySelector('[role="group"][aria-label="File under (optional)"]')!;
    expect(letters.querySelectorAll("button")).toHaveLength(4);
    expect(host.querySelector(".nx-compose__title")?.textContent).toBe("Something about her life");

    await click(buttonByText(composer, "Save to FORD"));
    expect(writes.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(writes[0].data).toMatchObject({
      clientId: "c1",
      studioId: "s1",
      pillar: null,
      body: "Grandson graduates in May",
      origin: "profile",
    });
    expect(writes.some((w) => w.path === "journalEntries")).toBe(false);
    // Saved: the composer folds, and says so.
    expect(composer.closest("[hidden]")).not.toBeNull();
    expect(host.textContent).toContain("Saved to FORD");

    await click(buttonByText(host.querySelector(".nx-fordline")!, "Open FORD"));
    expect(onOpenFord).toHaveBeenCalledTimes(1);
  });

  it("goes back to a note with the words intact, files under a letter, and refuses more than FORD holds", async () => {
    const { composer } = await mountComposer();
    const box = composer.querySelector("textarea") as HTMLTextAreaElement;
    await click(buttonByText(composer, "FORD / Life"));
    await typeInto(box, "x".repeat(2001));
    expect(composer.textContent).toContain("FORD details hold up to 2,000 characters — this one is 2,001.");
    expect((buttonByText(composer, "Save to FORD") as HTMLButtonElement).disabled).toBe(true);

    // A second tap is a note again, words and all — a note holds 5,000.
    await click(buttonByText(composer, "FORD / Life"));
    expect(composer.getAttribute("data-mode")).toBe("note");
    expect(box.value).toHaveLength(2001);
    expect(composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')).not.toBeNull();

    await click(buttonByText(composer, "FORD / Life"));
    await typeInto(box, "Plays pickleball Tuesdays");
    await click(buttonByText(composer.querySelector('[aria-label="File under (optional)"]')!, "Recreation"));
    await click(buttonByText(composer, "Save to FORD"));
    expect(writes[0].data).toMatchObject({ pillar: "recreation", body: "Plays pickleball Tuesdays" });
  });

  it("keeps the words when a FORD detail is refused, says so, and writes no note", async () => {
    // handleFirestoreError reports a failed write with window.alert outside the app shell.
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { host, composer } = await mountComposer();
      const box = composer.querySelector("textarea") as HTMLTextAreaElement;
      await typeInto(box, "Grandson graduates in May");
      await click(buttonByText(composer, "FORD / Life"));
      refuse.nextAdd = true;
      await click(buttonByText(composer, "Save to FORD"));
      expect(writes).toHaveLength(0);
      expect(box.value).toBe("Grandson graduates in May");
      expect(composer.getAttribute("data-mode")).toBe("ford");
      expect(composer.querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here, try again");
      // Still open, and never the "Saved to FORD" flash.
      expect(composer.closest("[hidden]")).toBeNull();
      expect(host.querySelector(".nc-saved")).toBeNull();
    } finally {
      refuse.nextAdd = false;
      alert.mockRestore();
      quiet.mockRestore();
    }
  });

  it("stamps a FORD detail with the studio the FORD read filters on — the older studioId when there is no home studio", async () => {
    // Before the client codex this stamped `homeStudioId || ""`, which the
    // create rule refuses, and which the Life section could never read back.
    const olderRecord = { id: "c1", studioId: "solon", firstName: "Judy", lastName: "Client" } as unknown as Client;
    const { composer } = await mountComposer({ who: olderRecord });
    await typeInto(composer.querySelector("textarea"), "Walks the dog every morning");
    await click(buttonByText(composer, "FORD / Life"));
    await click(buttonByText(composer, "Save to FORD"));
    expect(writes.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(writes[0].data).toMatchObject({ clientId: "c1", studioId: "solon" });
  });
});

describe("the quick note's FORD hand-off", () => {
  it("stamps a FORD detail with the client's studio, the older studioId when there is no home studio", async () => {
    const olderRecord = { id: "c1", studioId: "solon", firstName: "Judy", lastName: "Client" } as unknown as Client;
    // A trainer at Solon: the FORD create rule's isTrainerOfStudio.
    const solonTrainer = { ...trainer, primaryHomeStudioId: "solon" };
    await mount(<QuickNoteDialog open onOpenChange={() => {}} client={olderRecord} machines={[]} authTrainer={solonTrainer} />);
    // The dialog renders in a portal on document.body.
    const composer = document.body.querySelector('[data-testid="note-composer"]')!;
    expect(composer).toBeTruthy();
    await click(buttonByText(composer, "FORD / Life"));
    // In place, as on the Notes page: the note box is the capture.
    expect(composer.querySelector(".ford-capture")).toBeNull();
    await typeInto(composer.querySelector("textarea"), "Daughter starts college in the fall");
    await click(buttonByText(composer, "Save to FORD"));
    expect(writes.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(writes[0].data).toMatchObject({ clientId: "c1", studioId: "solon", pillar: null });
    expect(writes.some((w) => w.path === "journalEntries")).toBe(false);
    // The dialog stays open and says so, ready for the next thing she said.
    expect(document.body.querySelector('[data-testid="note-composer"]')?.textContent).toContain("Saved to FORD");
  });

  it("tells a cross-train trainer where FORD is kept, and offers no Save to FORD the rules would refuse", async () => {
    const visitor = { ...trainer, primaryHomeStudioId: "strongsville" };
    await mount(<QuickNoteDialog open onOpenChange={() => {}} client={client} machines={[]} authTrainer={visitor} />);
    const composer = document.body.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "FORD / Life"));
    expect(buttonByText(composer, "Save to FORD")).toBeUndefined();
    // The database refuses them FORD altogether, so that is what it says.
    expect(composer.textContent).toContain("Personal details are kept in FORD, which only the client’s home studio can read.");
    // Their note still saves: notes are not FORD.
    await click(buttonByText(composer, "FORD / Life"));
    await typeInto(composer.querySelector("textarea"), "Asked about the Saturday times");
    await click(buttonByText(composer, "Save — file later"));
    expect(writes.map((w) => w.path)).toEqual(["journalEntries"]);
  });

  it("offers an administrator who works elsewhere no Save to FORD either — the create rule has no clause for them (phase 19)", async () => {
    // They may change the record (the clients update rule) but not add to
    // FORD: the dialog follows the create rule (codexAccess().fordWritable).
    const admin = { ...trainer, role: "Admin", primaryHomeStudioId: "strongsville" };
    await mount(<QuickNoteDialog open onOpenChange={() => {}} client={client} machines={[]} authTrainer={admin} />);
    const composer = document.body.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "FORD / Life"));
    expect(buttonByText(composer, "Save to FORD")).toBeUndefined();
    // They may READ FORD, so the hand-off says adding isn't offered — not
    // the cross-train sentence, which would be false for them.
    expect(composer.textContent).toContain(
      "Personal details are kept in FORD. Only a trainer at the client’s home studio can add to it, so saving there isn’t offered here.",
    );
    expect(composer.textContent).not.toContain("which only the client’s home studio can read");
    expect(writes).toEqual([]);
  });

  it("keeps the words when a note is refused (the dialog rethrows, so the composer knows)", async () => {
    // handleFirestoreError reports a failed write with window.alert outside the app shell.
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await mount(<QuickNoteDialog open onOpenChange={() => {}} client={client} machines={[]} authTrainer={trainer} />);
      const composer = document.body.querySelector('[data-testid="note-composer"]')!;
      const box = composer.querySelector("textarea") as HTMLTextAreaElement;
      await typeInto(box, "Mentioned her knee on the stairs");
      refuse.nextAdd = true;
      await click(buttonByText(composer, "Save — file later"));
      expect(writes).toHaveLength(0);
      expect(box.value).toBe("Mentioned her knee on the stairs");
      expect(composer.querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here");
    } finally {
      refuse.nextAdd = false;
      alert.mockRestore();
      quiet.mockRestore();
    }
  });
});

describe("the To-file tray", () => {
  it("sits at the top of the Notes area, keeps the note off the shelves, and files with one tap", async () => {
    const host = await mount(<NotesArea />);
    const tray = host.querySelector('[data-testid="note-sweep"]')!;
    expect(tray).toBeTruthy();
    expect(tray.textContent).toContain("To file · 1");
    expect(tray.textContent).toContain("Knee clicked on leg press");
    // Not on the "Preferences & other" shelf while it is unfiled.
    expect(host.querySelector('[data-testid="shelf-preference"]')).toBeNull();
    expect(splitUnfiled(entries).unfiled.map((e) => e.id)).toEqual(["raw"]);

    await click(buttonByText(tray.querySelector('[data-testid="sweep-raw"]')!, "Injury"));
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("journalEntries/raw");
    expect(updates[0].data).toMatchObject({ kind: "injury", category: null });
    // Optimistic: the card is gone and the tray says so.
    expect(host.querySelector('[data-testid="sweep-raw"]')).toBeNull();
    expect(host.querySelector('[data-testid="note-sweep"]')!.textContent).toContain("Filed.");
  });

  it("files a coaching tip with its P in the same tap, discards by archiving, and draws nothing when empty", async () => {
    const onDiscard = vi.fn(async () => {});
    const rows = [
      entry({ id: "u1", kind: "general", origin: "in_session", body: "Own the bottom", machineId: "m1" }),
      entry({ id: "u2", kind: "general", origin: "in_session", body: "Fan off" }),
      entry({ id: "filed", kind: "coaching", body: "not shown" }),
    ];
    const host = await mount(
      <NoteSweep
        entries={rows}
        machines={[{ id: "m1", name: "Leg Press" } as any]}
        clientFirstName="Judy"
        onFile={fileUnfiledEntry}
        onDiscard={onDiscard}
      />,
    );
    const tray = host.querySelector('[data-testid="note-sweep"]')!;
    expect(tray.textContent).toContain("To file · 2");
    expect(tray.textContent).not.toContain("not shown");
    expect(tray.querySelector('[data-testid="sweep-u1"]')!.textContent).toContain("Leg Press");
    // Every target is a 40px chip.
    expect(tray.querySelectorAll(".nc-chip").length).toBe(2 * (5 + 4));

    await click(buttonByText(tray.querySelector('[data-testid="sweep-u1"]')!, "Pace"));
    expect(updates[0]).toMatchObject({ path: "journalEntries/u1", data: { kind: "coaching", category: "Pace" } });

    await click(buttonByText(tray.querySelector('[data-testid="sweep-u2"]')!, "Discard"));
    expect(onDiscard).toHaveBeenCalledWith("u2");
    expect(host.querySelector('[data-testid="note-sweep"]')!.textContent).toContain("Filed.");

    const empty = await mount(
      <NoteSweep entries={[rows[2]]} machines={[]} clientFirstName="Judy" onFile={fileUnfiledEntry} />,
    );
    expect(empty.querySelector('[data-testid="note-sweep"]')).toBeNull();
  });
});

describe("the entry card says the Loudness words", () => {
  it("marks an unfiled note To file, a Heads up as Heads up, and shows its until day", async () => {
    const host = await mount(
      <div>
        <JournalEntryCard entry={entry({ id: "a", kind: "general", origin: "in_session", body: "raw" })} machines={[]} />
        <JournalEntryCard
          entry={entry({ id: "b", kind: "preference", importance: "elevated", effectiveUntil: new Date(2099, 8, 20, 23, 59), body: "away" })}
          machines={[]}
        />
        <JournalEntryCard entry={entry({ id: "c", kind: "general", isLegacy: true, origin: "profile", body: "old" })} machines={[]} />
      </div>,
    );
    const cards = host.querySelectorAll("article");
    expect(cards[0].querySelector('[data-testid="to-file-mark"]')!.textContent).toContain("To file");
    expect(cards[1].querySelector('[data-testid="to-file-mark"]')).toBeNull();
    expect(cards[1].textContent).toContain("Heads up");
    expect(cards[1].textContent).toContain("Matters until Sep 20");
    expect(cards[2].querySelector('[data-testid="to-file-mark"]')).toBeNull();
  });
});

describe("the Active Session notes sheet mounts", () => {
  it("shows the same category chips, and FORD / Life switches to Remember this", async () => {
    const host = await mount(
      <SessionJournalSidebar
        session={{ id: "sess1" } as WorkoutSession}
        clientId="c1"
        clientFirstName="Judy"
        studioId="s1"
        author={{ id: "uid-jane", initials: "JC", fullName: "Jane Coach" }}
        machines={[]}
        onClose={() => {}}
      />,
    );
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    expect(composer).toBeTruthy();
    expect(buttonByText(composer, "Injury")).toBeTruthy();
    expect(buttonByText(composer, "Admin")).toBeUndefined();

    await click(buttonByText(composer, "FORD / Life"));
    expect(host.querySelector('[data-testid="note-composer"]')).toBeNull();
    expect(host.querySelector(".ford-capture")).toBeTruthy();
    expect(host.textContent).toContain("Remember this");
  });

  it("has a third tab, Pulse, that mounts the quick-log and comes back to the note on Done", async () => {
    const host = await mount(
      <SessionJournalSidebar
        session={{ id: "sess1" } as WorkoutSession}
        clientId="c1"
        clientFirstName="Judy"
        studioId="s1"
        author={{ id: "uid-jane", initials: "JC", fullName: "Jane Coach" }}
        machines={[]}
        client={client}
        trainer={trainer}
        onClose={() => {}}
      />,
    );
    const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(["Note", "Remember this", "Pulse"]);
    // Equal widths, 40px: every tab shares the same classes.
    expect(new Set(tabs.map((t) => t.className.includes("h-10 min-w-0 flex-1 basis-0"))).size).toBe(1);

    await click(tabs[2]);
    const stub = host.querySelector('[data-testid="pulse-stub"]')!;
    expect(stub).toBeTruthy();
    expect(stub.getAttribute("data-compact")).toBe("1");
    expect(stub.textContent).toContain("Judy");
    expect(host.textContent).toContain("Update Pulse");

    await click(buttonByText(stub, "Done"));
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeNull();
    expect(host.querySelector('[data-testid="note-composer"]')).toBeTruthy();
  });

  it("keeps the Pulse tab without a client, and says why", async () => {
    const host = await mount(
      <SessionJournalSidebar
        session={{ id: "sess1" } as WorkoutSession}
        clientId="c1"
        clientFirstName="Judy"
        studioId="s1"
        author={{ id: "uid-jane", initials: "JC", fullName: "Jane Coach" }}
        machines={[]}
        onClose={() => {}}
      />,
    );
    await click(Array.from(host.querySelectorAll('[role="tab"]'))[2]);
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeNull();
    expect(host.textContent).toContain("Open the client to update Pulse");
  });

  it("saves an untagged in-session note about the machine on screen, and the Loudness bar is compact", async () => {
    const host = await mount(
      <SessionJournalSidebar
        session={{ id: "sess1" } as WorkoutSession}
        clientId="c1"
        clientFirstName="Judy"
        studioId="s1"
        author={{ id: "uid-jane", initials: "JC", fullName: "Jane Coach" }}
        machines={[{ id: "m1", name: "Leg Press" } as any]}
        defaultMachineId="m1"
        onClose={() => {}}
      />,
    );
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    expect(composer.querySelector(".rt--compact")).toBeTruthy();
    expect(composer.textContent).toContain("untagged notes come back to be filed at the end");
    expect(buttonByText(composer, "About Leg Press")).toBeTruthy();
    await typeInto(composer.querySelector("textarea"), "Seat one notch higher next time");
    await click(buttonByText(composer, "Save — file later"));
    expect(writes[0].data).toMatchObject({
      kind: "general",
      category: null,
      machineId: "m1",
      origin: "in_session",
      sessionId: "sess1",
    });
  });
});
