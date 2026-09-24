// @vitest-environment jsdom
/**
 * Mounts the post-session screen (reporting round, Sep 2026) against a fake
 * Firestore. It proves what the thirty seconds walking a client out now
 * offers: the dose Dial with the five DOSE words that saves the moment it is
 * tapped, the closing note's Loudness (Note · Heads up · Critical, Note
 * checked) with "Matters until" behind Heads up, the To-file tray showing
 * this session's unfiled notes, and that leaving files the note with its
 * loudness. The renewal dialog and Update Pulse are stubbed — each has its
 * own render test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../features/renewals", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/renewals")>();
  return { ...real, LogConversationDialog: () => null };
});

vi.mock("../features/subjective-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/subjective-report")>();
  return {
    ...real,
    PulseQuickLogDialog: (props: { open: boolean }) => (props.open ? <div data-testid="pulse-stub">Pulse stub</div> : null),
  };
});

vi.mock("../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-jane" } },
}));

const updates: { path: string; data: any }[] = [];

const unfiledDoc = {
  id: "raw",
  data: () => ({
    clientId: "c1",
    studioId: "s1",
    kind: "general",
    category: null,
    body: "Knee clicked on leg press",
    importance: "standard",
    machineId: "m1",
    focusId: null,
    sessionId: "sess1",
    origin: "in_session",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: new Date(2026, 8, 14, 12),
    isArchived: false,
    searchTags: [],
  }),
};

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
    // The journal stream feeds one unfiled note; every other stream is empty.
    onSnapshot: (q: any, next: (snap: any) => void) => {
      const docs = q?.__path === "journalEntries" ? [unfiledDoc] : [];
      next({ docs, size: docs.length, empty: docs.length === 0 });
      return () => {};
    },
    getDocs: async () => ({ docs: [], size: 0 }),
    addDoc: async () => ({ id: "new" }),
    updateDoc: async (ref: any, data: any) => {
      updates.push({ path: ref.__path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { VictoryHUDScreen } from "./VictoryHUDScreen";
import { AppBottomBar } from "./AppBottomBar";
import { DOSE_SCALE } from "../features/rating";
import { UnsavedChangesProvider, useGuardedState } from "../features/unsaved-changes";
import type { Client, View, WorkoutSession } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
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

const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(text));

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Client", sessionCount: 12 } as Client;
const session = { id: "sess1", clientId: "c1", status: "Completed", sessionNumber: 12 } as WorkoutSession;
const trainer = { id: "t-doc", fullName: "Jane Coach", initials: "JC", role: "LifeTransformer" } as any;

function Screen({ onDose = vi.fn(), onLeave = vi.fn() }: { onDose?: (v: any) => void; onLeave?: (c: any) => void }) {
  return (
    <VictoryHUDScreen
      client={client}
      session={session}
      logs={[]}
      lines={[]}
      journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
      schedules={[]}
      authTrainer={trainer}
      onDose={onDose}
      onLeave={onLeave}
      machines={[{ id: "m1", name: "Leg Press" } as any]}
    />
  );
}

describe("the post-session screen mounts", () => {
  it("draws the dose Dial with the five DOSE words and saves the moment Just right is tapped", async () => {
    const onDose = vi.fn();
    const host = await mount(<Screen onDose={onDose} />);
    const dial = host.querySelector('[data-testid="dose-dial"]')!;
    expect(dial).toBeTruthy();
    // Dark whatever the theme: the rating tokens resolve under .dark.
    expect(host.querySelector('[data-testid="dose-card"]')!.className).toContain("dark");
    expect(host.querySelector('[data-testid="dose-card"]')!.getAttribute("data-theme")).toBe("dark");

    const radios = Array.from(dial.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([...DOSE_SCALE.words]);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(dial.textContent).toContain("Not judged");
    expect(host.querySelector('[data-testid="dose-sentence"]')).toBeNull();

    await click(radios[2]);
    expect(onDose).toHaveBeenCalledWith(0);
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector('[data-testid="dose-sentence"]')!.textContent).toBe("Judy left just right.");
    expect(host.querySelector('[data-testid="dose-card"]')!.textContent).toContain("Saved");

    // Tapping it again clears back to "not judged" — and that is a write too.
    await click(radios[2]);
    expect(onDose).toHaveBeenLastCalledWith(null);
    expect(host.querySelector('[data-testid="dose-sentence"]')).toBeNull();
  });

  it("offers the closing note's Loudness with Note checked, and Matters until behind Heads up", async () => {
    const host = await mount(<Screen />);
    const loud = host.querySelector('[role="radiogroup"][aria-label="How loud?"]')!;
    expect(loud).toBeTruthy();
    expect(Array.from(loud.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Note", "Heads up", "Critical"]);
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Note");
    expect(host.querySelector('input[aria-label="Matters until"]')).toBeNull();

    await click(buttonByText(loud, "Heads up"));
    const until = host.querySelector('input[aria-label="Matters until"]') as HTMLInputElement;
    expect(until).toBeTruthy();
    expect(until.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(host.textContent).toContain("Matters until (optional)");
    expect(host.textContent).toContain("After this it stops showing on the briefing.");

    await click(buttonByText(loud, "Note"));
    expect(host.querySelector('input[aria-label="Matters until"]')).toBeNull();
  });

  it("shows this session's unfiled note in the To-file tray and files it with one tap", async () => {
    const host = await mount(<Screen />);
    const tray = host.querySelector('[data-testid="note-sweep"]')!;
    expect(tray).toBeTruthy();
    expect(tray.className).toContain("dark");
    expect(tray.textContent).toContain("To file · 1");
    expect(tray.textContent).toContain("Knee clicked on leg press");
    expect(tray.textContent).toContain("Leg Press");

    await click(buttonByText(tray.querySelector('[data-testid="sweep-raw"]')!, "Injury"));
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("journalEntries/raw");
    expect(updates[0].data).toMatchObject({ kind: "injury", category: null });
    expect(host.querySelector('[data-testid="sweep-raw"]')).toBeNull();
  });

  it("says Update Pulse, never Assessment or priority, and opens the Pulse quick-log", async () => {
    const host = await mount(<Screen />);
    expect(host.textContent).not.toMatch(/assessment/i);
    expect(host.textContent).not.toMatch(/priority/i);
    expect(host.textContent).toContain("How did it land · closing note · Pulse");
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeNull();
    await click(buttonByText(host, "Update Pulse"));
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeTruthy();
  });

  it("leaves with the closing note, its loudness and its until day", async () => {
    const onLeave = vi.fn();
    const host = await mount(<Screen onLeave={onLeave} />);
    const textarea = host.querySelector('textarea[aria-label="Closing note"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Shoulder tender on chest press");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const loud = host.querySelector('[role="radiogroup"][aria-label="How loud?"]')!;
    await click(buttonByText(loud, "Heads up"));
    const until = host.querySelector('input[aria-label="Matters until"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(until, "2099-09-20");
      until.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click(buttonByText(host, "Back to Hub"));
    expect(onLeave).toHaveBeenCalledTimes(1);
    const closing = onLeave.mock.calls[0][0];
    expect(closing).toMatchObject({ noteContent: "Shoulder tender on chest press", importance: "elevated" });
    const stored = closing.effectiveUntil as Date;
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([2099, 8, 20, 23]);
    // Leaving twice does nothing.
    await click(buttonByText(host, "Leaving"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("leaves a plain Note with no until day", async () => {
    const onLeave = vi.fn();
    const host = await mount(<Screen onLeave={onLeave} />);
    await click(buttonByText(host, "Back to Hub"));
    expect(onLeave.mock.calls[0][0]).toEqual({ noteContent: "", importance: "standard", effectiveUntil: null });
  });
});

/*
 * UNSAVED CHANGES (Sep 24 2026). The closing note is filed when the trainer
 * leaves by Back to Hub, but the bottom bar stays live on this screen and
 * used to unmount it with the note unfiled. Mounted with the provider and the
 * real bottom bar, wired the way AppContent wires them: onLeave files, then
 * sets the view through the same guarded setter the bar uses.
 */
describe("the closing note is unsaved work until Back to Hub files it", () => {
  const filed: unknown[] = [];

  function Host() {
    const [view, setView] = useGuardedState<View>("workouts");
    return (
      <div data-testid="app" data-view={view}>
        {view === "workouts" && (
          <Screen
            onLeave={(closing: unknown) => {
              // In the SAME tap, the strictest case: the screen has not
              // re-rendered since Back to Hub was pressed, so only its own
              // release() keeps this from asking about the note it files.
              // (leavePostSession awaits the journal write first, which
              // usually gives React time to re-render — usually.)
              filed.push(closing);
              setView("clients");
            }}
          />
        )}
        <AppBottomBar
          appMode="trainer"
          currentView={view}
          isAdmin={false}
          hasClient
          liveSession={undefined}
          lastLearningView="learning"
          onNavigate={setView}
          onResumeSession={() => setView("workouts")}
        />
      </div>
    );
  }

  const withProvider = (ui: ReactNode) => <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>;
  const viewOf = (host: HTMLElement) => host.querySelector('[data-testid="app"]')!.getAttribute("data-view");
  const hub = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("nav button")).find((b) => b.textContent?.trim() === "Hub");
  const typeNote = async (host: HTMLElement, text: string) => {
    const textarea = host.querySelector('textarea[aria-label="Closing note"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const question = () => document.querySelector('[role="alertdialog"]');

  beforeEach(() => {
    filed.length = 0;
  });

  it("lets the bottom bar straight through while no note is typed", async () => {
    const host = await mount(withProvider(<Host />));
    await click(hub(host));
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
  });

  it("asks before the bottom bar leaves with a typed closing note, and keeps it on Keep editing", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Shoulder tender on chest press");
    await click(hub(host));
    expect(question()!.textContent).toContain(
      "You have unsaved changes to the closing note. Leave without saving?",
    );
    await click(document.querySelector('[data-action="keep-editing"]'));
    expect(viewOf(host)).toBe("workouts");
    expect((host.querySelector('textarea[aria-label="Closing note"]') as HTMLTextAreaElement).value).toBe(
      "Shoulder tender on chest press",
    );
    expect(filed).toHaveLength(0);
  });

  it("files the note by Back to Hub and goes, without asking about the note it is filing", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Shoulder tender on chest press");
    await click(buttonByText(host, "Back to Hub"));
    await settle();
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
    expect(filed).toEqual([
      expect.objectContaining({ noteContent: "Shoulder tender on chest press" }),
    ]);
  });
});
