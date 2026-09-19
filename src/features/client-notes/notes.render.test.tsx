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
import { ClientJournalTab } from "../../components/journal/ClientJournalTab";
import { SessionJournalSidebar } from "../../components/journal/SessionJournalSidebar";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import { NoteSweep } from "./NoteSweep";
import { fileUnfiledEntry } from "./file-unfiled";
import { isUnfiled, splitUnfiled } from "./note-catalog";
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

const journal: UseClientJournalResult = {
  entries,
  focuses: [],
  criticalEntries: [critical],
  isLoading: false,
  needsIndex: false,
  capped: false,
};

function NotesArea({ onOpenFord }: { onOpenFord?: () => void }) {
  return (
    <ClientJournalTab
      areas={["notes"]}
      journal={journal}
      clientId="c1"
      client={client}
      machines={[]}
      trainers={[]}
      authTrainer={trainer}
      progressReports={[]}
      onSelectReport={() => {}}
      onDeleteReport={() => {}}
      onNewReport={() => {}}
      onOpenFord={onOpenFord}
    />
  );
}

describe("the Notes catalog mounts", () => {
  it("draws critical & pinned, seven tiles, and a shelf per category", async () => {
    const host = await mount(<NotesArea />);
    const catalog = host.querySelector('[data-testid="notes-catalog"]')!;
    expect(catalog).toBeTruthy();
    expect(catalog.textContent).toContain("Critical & pinned");
    expect(catalog.textContent).toContain("Check blood pressure");

    const tiles = catalog.querySelectorAll(".nc-tile");
    expect(Array.from(tiles).map((t) => t.querySelector(".nc-tile__label")!.textContent)).toEqual([
      "Coaching tip",
      "Equipment",
      "Incident",
      "Injury",
      "Preference",
      "FORD / Life",
      "Admin",
    ]);
    expect(host.querySelector('[data-testid="tile-coaching"] .nc-tile__count')!.textContent).toBe("4");
    expect(host.querySelector('[data-testid="tile-admin"] .nc-tile__count')!.textContent).toBe("2");
    expect(host.querySelector('[data-testid="tile-equipment"]')!.textContent).toContain("None yet");

    const coaching = host.querySelector('[data-testid="shelf-coaching"]')!;
    expect(coaching.querySelectorAll("article")).toHaveLength(3);
    expect(buttonByText(coaching, "See all 4")).toBeTruthy();
    expect(host.querySelector('[data-testid="shelf-equipment"]')).toBeNull();
    // Only one coach has written here: no coach filter.
    expect(host.querySelector('[aria-label="Filter by coach"]')).toBeNull();
  });

  it("isolates a category with one tap, month by month, and clears with a second", async () => {
    const host = await mount(<NotesArea />);
    const tile = host.querySelector('[data-testid="tile-coaching"]')!;
    await click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    const months = host.querySelector('[data-testid="notes-months"]')!;
    expect(months.querySelectorAll("article")).toHaveLength(4);
    expect(months.querySelectorAll(".nc-shelf")).toHaveLength(2);
    expect(host.querySelector('[data-testid="notes-shelves"]')).toBeNull();

    await click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('[data-testid="notes-shelves"]')).toBeTruthy();

    // "See all" does the same as the tile.
    await click(buttonByText(host.querySelector('[data-testid="shelf-coaching"]')!, "See all 4"));
    expect(host.querySelector('[data-testid="tile-coaching"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("searches across every category", async () => {
    const host = await mount(<NotesArea />);
    await typeInto(host.querySelector('input[type="search"]'), "knee");
    const shelves = host.querySelector('[data-testid="notes-shelves"]')!;
    expect(Array.from(shelves.querySelectorAll(".nc-shelf")).map((s) => s.getAttribute("data-testid"))).toEqual([
      "shelf-injury",
    ]);
    expect(host.querySelector('[data-testid="tile-coaching"] .nc-tile__count')!.textContent).toBe("0");
    await click(buttonByText(host, "Show everything"));
    expect(host.querySelectorAll('[data-testid="notes-shelves"] .nc-shelf').length).toBeGreaterThan(1);
  });

  it("writes a note with the category chosen first", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
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
    // Injury starts as Heads up (the shared Loudness control), which reveals "Matters until".
    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    expect(Array.from(loud.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Note", "Heads up", "Critical"]);
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Heads up");
    expect(composer.querySelector('input[aria-label="Matters until"]')).toBeTruthy();
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
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
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

  it("offers Matters until for any Heads up, of any category, and writes it as end of day", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "Preference"));
    await typeInto(composer.querySelector("textarea"), "On a trip — no sessions");
    expect(composer.querySelector('input[aria-label="Matters until"]')).toBeNull();

    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    await click(buttonByText(loud, "Heads up"));
    const until = composer.querySelector('input[aria-label="Matters until"]');
    expect(until).toBeTruthy();
    expect(composer.textContent).toContain("After this it stops showing on the briefing.");
    await typeInto(until, "2026-09-20");
    await click(buttonByText(composer, "Save preference"));

    expect(writes[0].data).toMatchObject({ kind: "preference", importance: "elevated" });
    const stored = writes[0].data.effectiveUntil.toDate() as Date;
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([2026, 8, 20, 23]);
  });

  it("keeps the incident's Critical default until the trainer touches loudness", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "Incident"));
    const loud = composer.querySelector('[role="radiogroup"][aria-label="How loud? (optional)"]')!;
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Critical");
    await click(buttonByText(loud, "Note"));
    await click(buttonByText(composer, "Injury"));
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Note");
  });

  it("files a coaching tip with its P", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "Coaching tip"));
    await typeInto(composer.querySelector("textarea"), "Cue the exhale");
    await click(buttonByText(composer.querySelector('[aria-label="Which P"]')!, "Pace"));
    await click(buttonByText(composer, "Save coaching tip"));
    expect(writes[0].data).toMatchObject({ kind: "coaching", category: "Pace", importance: "standard" });
  });

  it("hands FORD / Life to the FORD capture — never the journal", async () => {
    const onOpenFord = vi.fn();
    const host = await mount(<NotesArea onOpenFord={onOpenFord} />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
    await click(buttonByText(composer, "FORD / Life"));

    const capture = composer.querySelector(".ford-capture")!;
    expect(capture).toBeTruthy();
    await typeInto(capture.querySelector("textarea"), "Grandson graduates in May");
    await click(buttonByText(capture, "Remember this"));

    expect(writes.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(writes[0].data).toMatchObject({ clientId: "c1", studioId: "s1", pillar: null });
    expect(writes.some((w) => w.path === "journalEntries")).toBe(false);

    await click(buttonByText(composer, "See everything in Life"));
    expect(onOpenFord).toHaveBeenCalledTimes(1);
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
    expect(cards[1].textContent).toContain("Until Sep 20");
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
