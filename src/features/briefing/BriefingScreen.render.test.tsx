// @vitest-environment jsdom
/**
 * Mounts the pre-session briefing against a fake Firestore.
 *
 * The screen does real work during render — it derives "Before you start"
 * from the journal, the last session and the Hub markers, and its check-in
 * is four Dials whose untouched state must never be written. A typecheck
 * and the pure tests cannot prove any of that; a mount can.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-aj" } },
}));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
}));

const writes: { path: string; data: any }[] = [];

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
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    addDoc: async (ref: any, data: any) => {
      writes.push({ path: ref.__path, data });
      return { id: `new-${writes.length}` };
    },
    updateDoc: async () => {},
    setDoc: async () => {},
    serverTimestamp: () => ({ __server: true }),
  };
});

// The theme comes from the app shell; the briefing only reads it.
vi.mock("../../components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

// The Routine Builder is its own feature with its own render tests; here it
// is a stub so the briefing's own work is what is under test.
vi.mock("../routine-builder", () => ({
  RoutineBuilder: (p: any) => <div data-testid="routine-builder" data-count={p.machineIds?.length ?? 0} />,
}));

// The journal hook is live Firestore; the briefing reads three of its lists.
const journalMock = vi.hoisted(() => ({
  criticalEntries: [] as any[],
  headsUpEntries: [] as any[],
}));
vi.mock("../../hooks/useClientJournal", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../hooks/useClientJournal")>();
  return {
    ...real,
    useClientJournal: () => ({
      entries: [...journalMock.criticalEntries, ...journalMock.headsUpEntries],
      focuses: [],
      criticalEntries: journalMock.criticalEntries,
      headsUpEntries: journalMock.headsUpEntries,
      isLoading: false,
      needsIndex: false,
      capped: false,
    }),
  };
});

import { BriefingScreen } from "./BriefingScreen";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Machine, Routine, Trainer, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

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

const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(text));

beforeEach(() => {
  writes.length = 0;
  journalMock.criticalEntries = [];
  journalMock.headsUpEntries = [];
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

/* ---------------------------------------------------------------- */

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Daus", sessionCount: 12 } as Client;
const trainer = { id: "t-aj", fullName: "AJ Jurgens", initials: "AJ", role: "LifeTransformer" } as unknown as Trainer;
const machines: Machine[] = [
  { id: "m1", name: "Leg Press" } as Machine,
  { id: "m2", name: "Chest Press" } as Machine,
  { id: "m3", name: "Pulldown" } as Machine,
];
const routines: Routine[] = [
  { id: "rA", clientId: "c1", name: "Routine A", machineIds: ["m1", "m2"] } as Routine,
  { id: "rB", clientId: "c1", name: "Routine B", machineIds: ["m3"] } as Routine,
];

const DAY = 86_400_000;
const dayKey = (offsetDays: number) => studioTodayKey(new Date(Date.now() + offsetDays * DAY));

function session(over: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: "s-x",
    clientId: "c1",
    status: "Completed",
    hostedAtStudioId: "s1",
    clientHomeStudioId: "s1",
    isCrossTrain: false,
    sessionNumber: 12,
    trainerInitials: "AJ",
    sessionType: "Standard",
    date: dayKey(-4),
    ...over,
  } as WorkoutSession;
}

const lastSession = session({
  id: "s-last",
  routineId: "rB",
  date: dayKey(-2),
  endTime: new Date(Date.now() - 2 * DAY),
  preSessionCheckIn: {
    bodyStates: [
      { region: "Lower Back", state: "stiff", dial: -1, until: dayKey(2) },
      { region: "Neck", state: "stiff", dial: -1, until: dayKey(-1) },
    ],
  },
});
const sessions: WorkoutSession[] = [
  lastSession,
  session({ id: "s-a", routineId: "rA", date: "2026-08-30" }),
];

function entry(over: Partial<JournalEntry>): JournalEntry {
  return {
    id: "e1",
    clientId: "c1",
    studioId: "s1",
    kind: "general",
    category: null,
    body: "note",
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-aj",
    authorInitials: "AJ",
    authorName: "AJ Jurgens",
    occurredAt: new Date(Date.now() - DAY),
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

function Screen({ onStart = () => {}, last = lastSession as WorkoutSession | null }: { onStart?: (...a: any[]) => void; last?: WorkoutSession | null }) {
  return (
    <BriefingScreen
      authTrainer={trainer}
      client={client}
      targetRoutine={routines[0]}
      lastSession={last}
      sessions={sessions}
      onStart={onStart}
      onClose={() => {}}
      machines={machines}
      routines={routines}
      trainers={[trainer]}
    />
  );
}

/* ---------------------------------------------------------------- */

describe("the pre-session briefing mounts", () => {
  it("draws four Dials in order — sleep, energy, recovery, stress — and no pill words", async () => {
    const host = await mount(<Screen />);
    const dials = Array.from(host.querySelectorAll('[data-testid="briefing-dials"] [data-scale]'));
    expect(dials.map((d) => d.getAttribute("data-scale"))).toEqual(["sleep", "energy", "recovery", "stress"]);
    // Each is the five-segment bar, untouched.
    for (const d of dials) {
      expect(d.querySelectorAll('[role="radio"]')).toHaveLength(5);
      expect(d.querySelector('[role="radio"][aria-checked="true"]')).toBeNull();
    }
    const text = host.textContent ?? "";
    expect(text).not.toContain("Optimal");
    expect(text).not.toContain("Neutral");
    expect(text).not.toContain("Stress level (1-5)");
    expect(text).not.toContain("Mood");
    expect(text).toContain("On the way in");
    expect(buttonByText(host, "Update Pulse")).toBeTruthy();
    expect(buttonByText(host, "Assessment")).toBeUndefined();
  });

  it("START passes only the dials that were tapped, and nothing when none were", async () => {
    const onStart = vi.fn();
    const host = await mount(<Screen onStart={onStart} />);

    await click(buttonByText(host, "Start session"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const untouched = onStart.mock.calls[0][3];
    expect(untouched).toEqual({});
    expect("readiness" in untouched).toBe(false);
    expect("sleepQuality" in untouched).toBe(false);

    // Tap "A bit short" on Sleep (position -1), then START.
    const sleep = host.querySelector('[data-testid="briefing-dials"] [data-scale="sleep"]')!;
    await click(sleep.querySelector('[data-pos="-1"]'));
    expect(sleep.querySelector('[role="radio"][aria-checked="true"]')!.getAttribute("data-pos")).toBe("-1");
    expect(sleep.textContent).toContain("A bit short");

    await click(buttonByText(host, "Start session"));
    const checkIn = onStart.mock.calls[1][3];
    expect(checkIn.readiness).toEqual({ sleep: -1 });
    expect(Object.keys(checkIn.readiness)).toEqual(["sleep"]);
    expect(checkIn.sleepQuality).toBeUndefined();
    expect(checkIn.stressLevel).toBeUndefined();
    expect(checkIn.energyLevel).toBeUndefined();
    expect(checkIn.mood).toBeUndefined();
  });

  it("carries a body region from the last session while its until day has not passed", async () => {
    const host = await mount(<Screen />);
    const before = host.querySelector('[aria-label="Before you start"]')!;
    const carried = before.querySelector('[data-testid="briefing-carried"]')!;
    expect(carried).toBeTruthy();
    const rows = Array.from(carried.querySelectorAll(".br__carried-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Lower Back");
    expect(rows[0].textContent).toContain("Stiff");
    expect(rows[0].textContent).toContain("until");
    expect(rows[0].getAttribute("data-tone")).toBe("warn");
    // The Neck's until day was yesterday: gone.
    expect(carried.textContent).not.toContain("Neck");
    // Counted in the heading.
    expect(before.textContent).toContain("Before you start · 1");
  });

  it("says 'clear to go' when there is nothing, and counts heads ups when there are", async () => {
    const host = await mount(<Screen last={null} />);
    expect(host.querySelector('[aria-label="Before you start"]')!.textContent).toContain("Nothing flagged — clear to go.");
    await act(async () => {
      for (const m of mounted) m.root.unmount();
    });
    mounted = [];

    journalMock.headsUpEntries = [entry({ id: "hu", importance: "elevated", body: "Right shoulder twinge since Tuesday" })];
    journalMock.criticalEntries = [entry({ id: "cr", importance: "critical", body: "No overhead pressing" })];
    const host2 = await mount(<Screen last={null} />);
    const before = host2.querySelector('[aria-label="Before you start"]')!;
    expect(before.textContent).toContain("Before you start · 2");
    const headsUp = before.querySelector('[data-testid="briefing-headsup"]')!;
    expect(headsUp.textContent).toContain("Heads up");
    expect(headsUp.textContent).toContain("Right shoulder twinge");
    // Critical is drawn first, heads up after.
    const critical = before.querySelector(".br__critical")!;
    expect(critical.compareDocumentPosition(headsUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("each routine button says when THAT routine last ran", async () => {
    const host = await mount(<Screen />);
    const a = buttonByText(host, "Routine A")!;
    const b = buttonByText(host, "Routine B")!;
    expect(a.textContent).toContain("Last run Aug 30");
    expect(a.textContent).toContain("2 machines");
    expect(b.textContent).toContain("Last run");
    expect(b.textContent).not.toContain("Aug 30");
    expect(b.textContent).toContain("1 machines");
  });

  it("the FORD cue is a button that opens the capture with its pillar chosen, and files under the client", async () => {
    const host = await mount(<Screen />);
    const cue = host.querySelector('[data-testid="ford-briefing-cue"]')!;
    const row = cue.querySelector("button.ford-upnext__row")!;
    expect(row).toBeTruthy();
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(cue.querySelector(".ford-capture")).toBeNull();

    await click(row);
    const capture = cue.querySelector(".ford-capture")!;
    expect(capture).toBeTruthy();
    // The cue's pillar is pre-selected.
    const on = capture.querySelector('.ford-letter[aria-pressed="true"]');
    expect(on).toBeTruthy();

    await typeInto(capture.querySelector("textarea"), "Grandson graduates in May");
    await click(buttonByText(capture, "Remember this"));
    expect(writes.map((w) => w.path)).toEqual(["clients/c1/ford"]);
    expect(writes[0].data).toMatchObject({ clientId: "c1", studioId: "s1", origin: "briefing", authorId: "uid-aj" });
    expect(writes[0].data.pillar).not.toBeNull();
  });

  it("a body region is rated on the Dial and can carry a matters-until day", async () => {
    const onStart = vi.fn();
    const host = await mount(<Screen onStart={onStart} />);
    await click(buttonByText(host, "Tag Body Region"));
    const dialog = document.querySelector('[role="dialog"][aria-label="Body region picker"]')!;
    expect(dialog).toBeTruthy();
    await click(buttonByText(dialog, "Lower Back"));

    const region = dialog.querySelector('[data-scale="region"]')!;
    expect(region).toBeTruthy();
    expect(dialog.querySelector('[data-testid="body-until"]')).toBeNull();
    // Save is disabled until something is tapped.
    expect((buttonByText(dialog, "Tap how it is today") as HTMLButtonElement).disabled).toBe(true);

    await click(region.querySelector('[data-pos="-1"]'));
    const until = dialog.querySelector('[data-testid="body-until"]')!;
    expect(until).toBeTruthy();
    expect(until.textContent).toContain("Keeps showing on the briefing until then");
    await typeInto(until.querySelector("input"), dayKey(3));
    await click(buttonByText(dialog, "Save · Stiff"));

    // The chip reads the Dial's word and the until day.
    expect(host.textContent).toContain("Lower Back");
    expect(host.textContent).toContain("Stiff");

    await click(buttonByText(host, "Start session"));
    const checkIn = onStart.mock.calls[0][3];
    expect(checkIn.bodyStates).toEqual([{ region: "Lower Back", state: "stiff", dial: -1, until: dayKey(3) }]);
    expect("until" in checkIn.bodyStates[0]).toBe(true);
  });

  it("a region above the centre never writes an until key", async () => {
    const onStart = vi.fn();
    const host = await mount(<Screen onStart={onStart} />);
    await click(buttonByText(host, "Tag Body Region"));
    const dialog = document.querySelector('[role="dialog"][aria-label="Body region picker"]')!;
    await click(buttonByText(dialog, "Hips"));
    await click(dialog.querySelector('[data-scale="region"] [data-pos="1"]'));
    expect(dialog.querySelector('[data-testid="body-until"]')).toBeNull();
    await click(buttonByText(dialog, "Save · Better"));
    await click(buttonByText(host, "Start session"));
    const tag = onStart.mock.calls[0][3].bodyStates[0];
    expect(tag).toEqual({ region: "Hips", state: "prime", dial: 1 });
    expect("until" in tag).toBe(false);
  });
});
