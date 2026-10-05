// @vitest-environment jsdom
/**
 * THE MACHINE MENU, MOUNTED (phase 6: the frame, the body, the header and
 * the safety strip). It replaces ClientMachineWindow.render.test.tsx.
 *
 * The frame mounts a dialog, a leave scope and the catalog listener; the
 * body builds the timeline model during render and places the blocks in the
 * door's order. Only a mount proves (machine menu design §G):
 *
 *   - both doors' order, with ONLY Notes moving (right under the settings in
 *     a session, after the chart on the profile);
 *   - no gender, no height and no "· None" in the header, and the names in
 *     the classes that wrap (lib/names-wrap.test.ts holds the CSS);
 *   - Close reads "Close Leg Press";
 *   - a watched session reads only;
 *   - Close, Escape and a tap on the backdrop with an unsaved setting ask
 *     "Leave without saving?", and Keep editing keeps the change;
 *   - no catalog listener before the first open, and one the whole time after;
 *   - the profile door asks for the first page when Journey hasn't loaded,
 *     and says it is loading — never the first-time words;
 *   - a Critical note on the machine leads the card, and a journal that
 *     couldn't be read says so.
 *
 * Firebase and the app contexts are inert stand-ins: this is about the card
 * mounting and saying the right thing, not about Firestore.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";

const calls = vi.hoisted(() => ({ catalog: 0, subscribed: 0, unsubscribed: 0 }));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: () => ({}),
    collectionGroup: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], empty: true, metadata: { fromCache: false } }),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    addDoc: async () => ({ id: "x" }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
    writeBatch: () => ({ set: () => {}, update: () => {}, commit: async () => undefined }),
  };
});
vi.mock("../../hooks/useMachineCatalog", async () => {
  const { useEffect } = await import("react");
  return {
    useMachineCatalog: () => {
      calls.catalog += 1;
      // Stands in for the real hook's onSnapshot listener.
      useEffect(() => {
        calls.subscribed += 1;
        return () => {
          calls.unsubscribed += 1;
        };
      }, []);
      return { catalog: [], byId: {}, loading: false, failed: false };
    },
  };
});
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: { id: "westlake", name: "Westlake" }, activeStudioId: "westlake", studios: [{ id: "westlake", name: "Westlake" }] }),
}));
vi.mock("../../hooks/useClientJournal", () => ({ createJournalEntry: async () => "j-new", archiveJournalEntries: async () => undefined }));

import { UnsavedChangesProvider } from "../unsaved-changes";
import { MachineMenu, type MachineMenuProps } from "./MachineMenu";
import type { MachineMenuHost } from "./useMachineMenuData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* jsdom has neither; the chart's measuring and the phone check want them. */
const g = globalThis as unknown as Record<string, unknown>;
const hadRO = "ResizeObserver" in g;
const hadMM = typeof window !== "undefined" && typeof window.matchMedia === "function";
beforeAll(() => {
  if (!hadRO) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!hadMM) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  // A portrait iPad: one column.
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 820 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1180 });
});
afterAll(() => {
  if (!hadRO) delete g.ResizeObserver;
});

const machines = [
  { id: "leg-press", name: "Leg Press", order: 1, settingOptions: ["Seat"] },
  { id: "chest-press", name: "Chest Press", order: 2 },
] as unknown as Machine[];

const client = {
  id: "judy",
  firstName: "Judy",
  lastName: "Daus",
  gender: "Female",
  height: "5'4\"",
  homeStudioId: "westlake",
} as unknown as Client;

const settings = {
  "leg-press": { clientId: "judy", machineId: "leg-press", settings: { Seat: "4" }, currentWeight: "120", startingWeight: 100 },
} as unknown as Record<string, ClientMachineSetting>;

const sessions = [
  { id: "s1", date: "2026-03-02", trainerInitials: "AJ", status: "Completed" },
  { id: "s2", date: "2026-03-09", trainerInitials: "AJ", status: "Completed" },
] as unknown as WorkoutSession[];
const logs = [
  { id: "l1", sessionId: "s1", machineId: "leg-press", weight: "100", reps: "10", outcome: "performed" },
  { id: "l2", sessionId: "s2", machineId: "leg-press", weight: "110", reps: "9", outcome: "performed" },
] as unknown as ExerciseLog[];

const AUTHOR = { id: "uid-sam", fullName: "Sam Reyes", initials: "SR" };

function host(over: Partial<MachineMenuHost> = {}): MachineMenuHost {
  return {
    door: "profile",
    clientId: "judy",
    client,
    machines,
    clientSettings: settings,
    author: AUTHOR,
    activeStudioId: "westlake",
    floorStudio: { id: "westlake", name: "Westlake" },
    roster: [],
    coverage: "partial",
    sessions,
    logs,
    historyState: "ready",
    moreOnServer: false,
    journal: [],
    journalState: "ready",
    ...over,
  };
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(props: MachineMenuProps, wrap = true): Promise<{ render: (p: MachineMenuProps) => Promise<void>; root: Root }> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const tree = (p: MachineMenuProps): ReactNode => (
    <StrictMode>{wrap ? <UnsavedChangesProvider><MachineMenu {...p} /></UnsavedChangesProvider> : <MachineMenu {...p} />}</StrictMode>
  );
  const render = async (p: MachineMenuProps) => {
    await act(async () => root.render(tree(p)));
  };
  await render(props);
  mounted.push({ root, host: el });
  return { render, root };
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  calls.catalog = 0;
  calls.subscribed = 0;
  calls.unsubscribed = 0;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  document.body.innerHTML = "";
});

const card = () => document.querySelector<HTMLElement>(".mm-card");
const blocks = () => [...(card()?.querySelectorAll<HTMLElement>(".mm-scroll [data-block]") ?? [])].map((b) => b.getAttribute("data-block")!);
const buttonNamed = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name) ?? null;
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (action: "keep-editing" | "leave") => document.querySelector<HTMLButtonElement>(`[data-testid="leave-confirm"] [data-action="${action}"]`);

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function key(el: Element | null | undefined, k: string) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
  await settle();
}

describe("the machine menu, opened", () => {
  it("costs nothing until the first open, then keeps one catalog listener across machines", async () => {
    const { render } = await mount({ open: false, machineId: null, onClose: () => {}, host: host() });
    expect(card()).toBeNull();
    expect(calls.catalog).toBe(0);

    await render({ open: true, machineId: "leg-press", onClose: () => {}, host: host() });
    await settle();
    expect(card()).not.toBeNull();
    expect(calls.subscribed - calls.unsubscribed).toBe(1);
    const teardowns = calls.unsubscribed;

    await render({ open: false, machineId: null, onClose: () => {}, host: host() });
    await settle();
    await render({ open: true, machineId: "chest-press", onClose: () => {}, host: host() });
    await settle();
    expect(document.querySelector(".mm-head__machine")?.textContent).toBe("Chest Press");
    expect(calls.subscribed - calls.unsubscribed).toBe(1);
    expect(calls.unsubscribed).toBe(teardowns);
  });

  it("is titled with the machine and the client's display name, and never says gender, height or None", async () => {
    await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host() });
    await settle();
    const dialog = document.querySelector('[role="dialog"]')!;
    const head = document.querySelector(".mm-head")!;
    expect(head.querySelector(".mm-head__machine")?.textContent).toBe("Leg Press");
    expect(head.querySelector(".mm-head__client")?.textContent).toBe("Judy Daus");
    // The dialog is named by its title.
    const labelled = dialog.getAttribute("aria-labelledby");
    expect(labelled && document.getElementById(labelled)?.textContent).toContain("Leg Press");
    expect(head.textContent).not.toMatch(/Female|5'4|None/);
    expect(dialog.textContent).not.toMatch(/Female/);
    // Last time: the newest performed set before today.
    expect(head.querySelector("[data-header-line]")?.textContent).toContain("Last time");
    expect(head.querySelector(".mm-head__num")?.textContent).toBe("110 lb × 9");
  });

  it("closes from Close, labelled with the machine", async () => {
    let closed = 0;
    await mount({ open: true, machineId: "leg-press", onClose: () => (closed += 1), host: host() });
    await settle();
    const close = buttonNamed("Close Leg Press");
    expect(close?.className).toContain("mm-close");
    await click(close);
    expect(closed).toBe(1);
  });

  it("stays shut for a machine the door doesn't know", async () => {
    await mount({ open: true, machineId: "no-such-machine", onClose: () => {}, host: host() });
    await settle();
    expect(card()).toBeNull();
  });
});

describe("the two doors", () => {
  it("differ in one place only: Notes under the settings in a session, after the chart on the profile", async () => {
    const one = await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host({ door: "session", session: { id: "s3", number: 3, day: "2026-10-04" } }) });
    await settle();
    const session = blocks();
    await act(async () => one.root.unmount());
    mounted = mounted.filter((m) => m.root !== one.root);
    document.body.innerHTML = "";

    await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host({ door: "profile" }) });
    await settle();
    const profile = blocks();

    expect(session.slice(0, 3)).toEqual(["settings", "notes", "chart"]);
    expect(profile.slice(0, 3)).toEqual(["settings", "chart", "notes"]);
    const withoutNotes = (order: string[]) => order.filter((b) => b !== "notes");
    expect(withoutNotes(session)).toEqual(withoutNotes(profile));
  });

  it("asks the profile for the first page when Journey hasn't loaded, and says it is loading — never the first-time words", async () => {
    const ensure = vi.fn();
    await mount({
      open: true,
      machineId: "leg-press",
      onClose: () => {},
      host: host({ sessions: [], logs: [], historyState: "loading", ensureHistory: ensure, coverage: "complete" }),
    });
    await settle();
    expect(ensure).toHaveBeenCalled();
    expect(document.querySelector("[data-header-line]")?.textContent).toBe("Last time: loading…");
    expect(document.querySelector(".mm-chart")?.textContent).toContain("Loading Judy's sessions on Leg Press…");
    expect(document.querySelector(".mm-card")?.textContent).not.toMatch(/first time/i);
    expect(document.querySelector('[data-block="setupFirst"]')).toBeNull();
  });
});

describe("a watched session", () => {
  it("reads only: values, the chart and the notes, with no buttons that write", async () => {
    await mount({
      open: true,
      machineId: "leg-press",
      onClose: () => {},
      host: host({ door: "session", watching: "Sam Reyes", session: { id: "s3", number: 3, day: "2026-10-04" } }),
    });
    await settle();
    expect(document.querySelector("[data-header-line]")?.textContent).toContain("Watching Sam's session, read only");
    expect(document.querySelector(".mm-step")).toBeNull();
    expect(document.querySelector(".mm-save")).toBeNull();
    expect(document.querySelector(".mm-cmp__text")).toBeNull();
    expect(document.querySelector(".mm-add")).toBeNull();
    // Close still closes.
    expect(buttonNamed("Close Leg Press")).not.toBeNull();
  });
});

describe("leaving with an unsaved setting", () => {
  async function dirtyCard(onClose: () => void) {
    await mount({ open: true, machineId: "leg-press", onClose, host: host({ door: "session", session: { id: "s3", number: 3, day: "2026-10-04" } }) });
    await settle();
    await click(buttonNamed("Seat up one"));
    expect(document.querySelector('[data-dial="Seat"]')?.getAttribute("data-changed")).toBe("true");
  }

  it("asks on Close; Keep editing keeps the change, Leave closes", async () => {
    let closed = 0;
    await dirtyCard(() => (closed += 1));
    await click(buttonNamed("Close Leg Press"));
    expect(question()?.textContent).toContain("You have unsaved changes to Leg Press settings for Judy. Leave without saving?");
    expect(closed).toBe(0);

    await click(answer("keep-editing"));
    expect(question()).toBeNull();
    expect(closed).toBe(0);
    expect(document.querySelector('[data-dial="Seat"]')?.getAttribute("data-changed")).toBe("true");

    await click(buttonNamed("Close Leg Press"));
    await click(answer("leave"));
    expect(closed).toBe(1);
  });

  it("asks on Escape", async () => {
    let closed = 0;
    await dirtyCard(() => (closed += 1));
    await key(document.querySelector(".mm-close"), "Escape");
    expect(question()?.textContent).toContain("Leave without saving?");
    expect(closed).toBe(0);
    await click(answer("leave"));
    expect(closed).toBe(1);
  });

  it("asks on a tap on the backdrop", async () => {
    let closed = 0;
    await dirtyCard(() => (closed += 1));
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await act(async () => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        backdrop!.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      }
    });
    await settle();
    expect(question()?.textContent).toContain("Leave without saving?");
    expect(closed).toBe(0);
    await click(answer("keep-editing"));
    expect(closed).toBe(0);
  });

  it("closes at once when nothing is changed", async () => {
    let closed = 0;
    await mount({ open: true, machineId: "leg-press", onClose: () => (closed += 1), host: host() });
    await settle();
    await key(document.querySelector(".mm-close"), "Escape");
    expect(question()).toBeNull();
    expect(closed).toBe(1);
  });
});

describe("the safety strip", () => {
  const critical: JournalEntry = {
    id: "c1",
    clientId: "judy",
    studioId: "westlake",
    kind: "coaching",
    category: "Setup",
    importance: "critical",
    machineId: "leg-press",
    body: "Leg Press — Never past 90 degrees at the knee: replacement in May.",
    authorId: "uid-ana",
    authorInitials: "AC",
    authorName: "Ana Cole",
    occurredAt: new Date("2026-09-30T10:00:00-04:00"),
    isArchived: false,
    resolvedAt: null,
    threadId: null,
  } as unknown as JournalEntry;

  it("leads the card with a Critical note on the machine, in whole sentences", async () => {
    await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host({ journal: [critical] }) });
    await settle();
    expect(blocks()[0]).toBe("safety");
    const line = document.querySelector('.mm-safe__line[data-critical="true"]');
    expect(line?.textContent).toContain("Critical: Never past 90 degrees at the knee: replacement in May.");
    expect(line?.textContent).toContain("Ana");
    // The note box's list doesn't say it twice.
    expect(document.querySelector('[data-block="notes"] [data-note="c1"]')).toBeNull();
  });

  it("says Critical notes couldn't be checked when the journal couldn't be read", async () => {
    await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host({ journal: null, journalState: "failed" }) });
    await settle();
    expect(document.querySelector(".mm-safe")?.textContent).toContain("Critical notes couldn't be checked");
  });

  it("is absent when there is nothing to know", async () => {
    await mount({ open: true, machineId: "leg-press", onClose: () => {}, host: host() });
    await settle();
    expect(document.querySelector(".mm-safe")).toBeNull();
  });
});
