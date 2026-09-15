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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

    await click(buttonByText(composer, "Injury"));
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
    // The box is cleared for the next one.
    expect((composer.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  });

  it("files a coaching tip with its P", async () => {
    const host = await mount(<NotesArea />);
    const composer = host.querySelector('[data-testid="note-composer"]')!;
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
});
