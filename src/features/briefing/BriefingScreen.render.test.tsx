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
const sets: { path: string; data: any }[] = [];

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
    // FORD answers with nothing on file, so the cue asks its question: since
    // the client codex round (phase 1) the cue waits for FORD to answer
    // rather than guessing while it loads. Every other stream stays silent.
    onSnapshot: (q: any, next?: unknown) => {
      if (typeof q?.__path === "string" && q.__path.endsWith("/ford") && typeof next === "function") {
        next({ docs: [], size: 0, empty: true });
      }
      return () => {};
    },
    getDocs: async () => ({ docs: [], size: 0 }),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    addDoc: async (ref: any, data: any) => {
      writes.push({ path: ref.__path, data });
      return { id: `new-${writes.length}` };
    },
    updateDoc: async () => {},
    setDoc: async (ref: any, data: any) => {
      sets.push({ path: ref.__path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

// The theme comes from the app shell; the briefing only reads it.
vi.mock("../../components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

/* The starting routines' two reads (the plan card's, the first-session
   design round, Oct 8 2026): none in the app, so the Academy's eleven,
   unless a test holds them. Counted, so a client with a routine is seen to
   read nothing. */
const startingReads = vi.hoisted(() => {
  const answered = {
    routines: () => Promise.resolve({ routines: [] as unknown[], known: true }),
    choice: () => Promise.resolve({ use: null as string[] | null, defaultId: null as string | null }),
  };
  return { answered, now: { ...answered }, count: 0 };
});
vi.mock("../routine-plan/starting-store", () => ({
  readStartingRoutines: () => {
    startingReads.count += 1;
    return startingReads.now.routines();
  },
  readStartingChoice: () => startingReads.now.choice(),
}));

// Programming's door: where the briefing sends a client who trained here before Journey.
const opened = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../client-profile/profile-nav", async (importOriginal) => {
  const real = await importOriginal<typeof import("../client-profile/profile-nav")>();
  return { ...real, openProfileAt: (...args: unknown[]) => opened.calls.push(args) };
});

/* The plan card's sheets are base-ui dialogs, which want both. */
{
  const g = globalThis as unknown as Record<string, unknown>;
  if (!("PointerEvent" in g)) g.PointerEvent = MouseEvent;
  if (!("ResizeObserver" in g)) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

// The Routine Builder is its own feature with its own render tests; here it
// is a stub so the briefing's own work is what is under test.
vi.mock("../routine-builder", () => ({
  RoutineBuilder: (p: any) => (
    <div data-testid="routine-builder" data-count={p.machineIds?.length ?? 0} data-established={String(!!p.established)} />
  ),
}));

// The journal hook is live Firestore; the briefing reads three of its lists.
const journalMock = vi.hoisted(() => ({
  criticalEntries: [] as any[],
  headsUpEntries: [] as any[],
  threads: undefined as any[] | undefined,
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
      threads: journalMock.threads,
      isLoading: false,
      needsIndex: false,
      capped: false,
    }),
  };
});

import { BriefingScreen } from "./BriefingScreen";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Machine, Routine, Trainer, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads } from "../client-notes/threads";
import { ACADEMY_MOVEMENT_NAME } from "../catalog/names";

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
  journalMock.threads = undefined;
  sets.length = 0;
  startingReads.now = { ...startingReads.answered };
  startingReads.count = 0;
  opened.calls.length = 0;
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

  it("offers 'File it as' under the arrival note only once something is typed, and passes the pick to Start (Oct 3 2026)", async () => {
    const onStart = vi.fn();
    const host = await mount(<Screen onStart={onStart} />);
    // Nothing typed: no extra row, so the start is never slower.
    expect(host.querySelector('[data-testid="arrival-file-as"]')).toBeNull();
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][4]).toBeNull();

    // The note is one tap away on the way in (the Stack, Oct 3 2026).
    await click(buttonByText(host, "Note"));
    const box = host.querySelector(".br__textarea");
    await typeInto(box, "Knee a bit sore from gardening");
    const row = host.querySelector('[data-testid="arrival-file-as"]')!;
    expect(row).toBeTruthy();
    expect(Array.from(row.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Coaching & equipment",
      "Health",
      "Incident",
      "Retention",
      "Preference",
    ]);
    await click(buttonByText(row, "Health"));
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[1][2]).toBe("Knee a bit sore from gardening");
    expect(onStart.mock.calls[1][4]).toBe("health");

    // A second tap takes it back: the note waits in the To-file tray as before.
    await click(buttonByText(row, "Health"));
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[2][4]).toBeNull();
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
    // Safety only (the Stack, Oct 3 2026): the critical note is counted here,
    // the heads up is news and sits under Since last time.
    expect(before.textContent).toContain("Before you start · 1");
    const since = host2.querySelector('[aria-label="Since last time"]')!;
    expect(since.textContent).toContain("Since last time · 1");
    const headsUp = since.querySelector('[data-testid="briefing-headsup"]')!;
    expect(headsUp.textContent).toContain("Heads up");
    expect(headsUp.textContent).toContain("Right shoulder twinge");
    // Critical is drawn first, heads up after.
    const critical = before.querySelector(".br__critical")!;
    expect(critical.compareDocumentPosition(headsUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reads a note out as its thread, and hushing one is a private write", async () => {
    // The note says "no overhead"; what the trainer walking in has NOT read
    // is the MRI. That is the whole reason the briefing shows threads.
    const root = entry({ id: "cr", importance: "critical", body: "No overhead pressing" });
    const update = {
      ...entry({ id: "u1", importance: "standard", body: "MRI on the 31st" }),
      threadId: "cr",
      occurredAt: new Date("2026-09-10T16:00:00Z"),
      updatedAt: new Date("2026-09-10T16:00:00Z"),
    };
    journalMock.criticalEntries = [root];
    journalMock.threads = assembleThreads([root, update as JournalEntry]);

    const host = await mount(<Screen last={null} />);
    const foot = host.querySelector('[data-testid="notefoot-cr"]')!;
    expect(foot.textContent).toContain("MRI on the 31st");
    expect(foot.textContent).toContain("1 update");

    await click(buttonByText(foot, "No need to remind me"));
    // Per trainer and private: their own document, keyed by the Auth uid.
    expect(sets.map((w) => w.path)).toEqual(["noteDismissals/uid-aj"]);
    expect(Object.keys(sets[0].data.threads)).toEqual(["cr"]);
  });

  it("folds her standing health context under the news, never counted, a tap from read (Oct 3 2026)", async () => {
    const knee = entry({ id: "knee", kind: "injury", importance: "standard", body: "Osteoarthritis in the left knee." });
    const bp = entry({ id: "bp", kind: "injury", category: "Medication", importance: "standard", body: "On blood pressure tablets." });
    const cue = entry({ id: "cue", kind: "coaching", importance: "standard", body: "Count her in." });
    journalMock.threads = assembleThreads([knee, bp, cue]);

    const host = await mount(<Screen last={null} />);
    const line = host.querySelector('[data-testid="briefing-standing"]')!;
    expect(line).toBeTruthy();
    expect(line.textContent).toContain("Show standing health context · 2");
    expect(line.textContent).toContain("Known, not news.");
    // Folded: the words are a tap away, and "Before you start" doesn't count them.
    expect(host.textContent).not.toContain("Osteoarthritis in the left knee.");
    expect(host.textContent).not.toContain("Before you start ·");

    await click(buttonByText(line, "Show standing health context"));
    expect(host.textContent).toContain("Osteoarthritis in the left knee.");
    expect(host.textContent).toContain("On blood pressure tablets.");
    // Coaching is not health context.
    expect(host.textContent).not.toContain("Count her in.");
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
    await click(buttonByText(host, "Sore spot"));
    await click(buttonByText(host, "Tag body region"));
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
    await click(buttonByText(host, "Sore spot"));
    await click(buttonByText(host, "Tag body region"));
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

/*
 * Auto-renewal (Sep 25 2026): the briefing reads the client's renewal with
 * her auto-renewal mark applied (renewals/auto-renew.ts, renewalOf). A
 * trainer's "not on auto-renewal" turns the line's "auto-renews" into
 * "billing ends", and the before-the-charge warning stops counting toward
 * "Before you start" — at once, not after tonight's run.
 */
describe("the briefing's renewal line follows the auto-renewal mark", () => {
  const warning = {
    version: 2,
    cycleKey: "9001",
    clientContractId: "9001",
    situation: "will-bank",
    paymentMode: "monthly",
    chargeDate: "2099-10-20",
    chargeDateSource: "mindbody",
    bankedAtCharge: 16,
    sessionsLeft: 30,
    chargeWarning: true,
    conversationDue: false,
    renewalOnBooks: null,
    autoRenews: true,
    autoRenewsFrom: "studio",
    autoRenewsInherited: { renews: true, from: "studio" },
    flags: [],
    dataGaps: [],
  } as any;

  const renewalScreen = (who: Partial<Client>) => (
    <BriefingScreen
      authTrainer={trainer}
      client={{ ...client, renewal: warning, ...who } as Client}
      targetRoutine={routines[0]}
      lastSession={null}
      sessions={sessions}
      onStart={() => {}}
      onClose={() => {}}
      machines={machines}
      routines={routines}
      trainers={[trainer]}
    />
  );
  const before = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Before you start"]')!;
  /** Admin lines live in the quiet footer since the Stack (Oct 3 2026). */
  const also = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Also today"]')!;

  it("warns before the charge while the package renews", async () => {
    const host = await mount(renewalScreen({}));
    expect(also(host).querySelector(".br__quote")?.textContent).toBe("30 left · auto-renews Oct 20, 2099");
    // A charge coming is not a safety matter: the band still says clear.
    expect(before(host).textContent).toContain("Nothing flagged — clear to go.");
  });

  it("stops the warning once a trainer marked her not on auto-renewal for this contract", async () => {
    const autoRenewMark = { renews: false, contractId: "9001", setAt: "2026-09-25T14:00:00.000Z", setById: "uid-aj" };
    const host = await mount(renewalScreen({ autoRenewMark }));
    // Sessions still bank when billing ends, so the line stays — in the right words.
    expect(also(host).querySelector(".br__quote")?.textContent).toBe("30 left · billing ends Oct 20, 2099");
    expect(also(host).textContent).not.toContain("auto-renews");
    // No charge is coming, so nothing flags "Before you start".
    expect(before(host).textContent).toContain("Nothing flagged — clear to go.");
  });
});

/* ---------------------------------------------------------------- */

describe("Due an InBody (FileMaker parity, Oct 1 2026)", () => {
  /** n Completed sessions, one a day, from two days ago backwards: all after a scan 400 days ago. */
  const after = (n: number) => Array.from({ length: n }, (_, i) => session({ id: `s-${i}`, date: dayKey(-(i + 2)) }));
  const scanned = (over: Partial<Client> = {}) =>
    ({
      ...client,
      gender: "Female",
      inbodySummary: { scanCount: 1, firstTestedAt: dayKey(-400), latestTestedAt: dayKey(-400) },
      ...over,
    }) as Client;

  function DueScreen({
    who,
    list,
    coverage = "complete",
    onStart = () => {},
  }: {
    who: Client;
    list: WorkoutSession[];
    coverage?: "complete" | "partial";
    onStart?: (...a: any[]) => void;
  }) {
    return (
      <BriefingScreen
        authTrainer={trainer}
        client={who}
        coverage={coverage}
        targetRoutine={routines[0]}
        lastSession={null}
        sessions={list}
        sessionsAreAll
        onStart={onStart}
        onClose={() => {}}
        machines={machines}
        routines={routines}
        trainers={[trainer]}
      />
    );
  }

  it("says one quiet line in the footer once she is due, and Start still starts", async () => {
    const onStart = vi.fn();
    const host = await mount(<DueScreen who={scanned()} list={after(51)} onStart={onStart} />);
    const line = host.querySelector('[data-testid="briefing-inbody"]');
    expect(line?.textContent).toBe("Due an InBody: 51 sessions since the last scan");
    expect(host.querySelector('[aria-label="Also today"]')?.contains(line!)).toBe(true);
    expect(host.querySelector('[aria-label="Before you start"]')?.contains(line!)).toBe(false);
    // Information, never a gate.
    expect(line!.querySelector("button")).toBeNull();
    await click(buttonByText(host, "Start session"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("says nothing before she is due, when it is off for her, or with no scan in Journey for a migrating client", async () => {
    const early = await mount(<DueScreen who={scanned()} list={after(10)} />);
    expect(early.querySelector('[data-testid="briefing-inbody"]')).toBeNull();

    const off = await mount(<DueScreen who={scanned({ inbodyEvery: "never" })} list={after(80)} />);
    expect(off.querySelector('[data-testid="briefing-inbody"]')).toBeNull();

    const migrating = await mount(<DueScreen who={{ ...client, gender: "Female" } as Client} list={after(80)} coverage="partial" />);
    expect(migrating.querySelector('[data-testid="briefing-inbody"]')).toBeNull();
  });

  it("follows her own number before the studio's", async () => {
    const host = await mount(<DueScreen who={scanned({ inbodyEvery: 12 })} list={after(13)} />);
    expect(host.querySelector('[data-testid="briefing-inbody"]')?.textContent).toBe("Due an InBody: 13 sessions since the last scan");
  });
});

describe("her total while it is Mindbody's guess (Atlas answers, Oct 2 2026)", () => {
  function Screen({ who, coverage }: { who: Client; coverage: "complete" | "partial" }) {
    return (
      <BriefingScreen
        authTrainer={trainer}
        client={who}
        coverage={coverage}
        targetRoutine={routines[0]}
        lastSession={null}
        sessions={[]}
        onStart={() => {}}
        onClose={() => {}}
        machines={machines}
        routines={routines}
        trainers={[trainer]}
      />
    );
  }

  it("says the session number from Mindbody and that it is not yet confirmed, with no milestone off it", async () => {
    const host = await mount(
      <Screen who={{ ...client, sessionCount: 6, clientsNumberOfVisitsAtSite: 299, firstSessionDate: "2026-09-20" } as Client} coverage="partial" />,
    );
    expect(host.querySelector('[data-testid="briefing-session-guess"]')?.textContent).toBe(
      "This is session #300 · from Mindbody, not yet confirmed.",
    );
    expect(host.textContent).not.toContain("Session 300");
  });

  it("says nothing extra once the total is whole or confirmed", async () => {
    const host = await mount(<Screen who={{ ...client, sessionCount: 6 } as Client} coverage="complete" />);
    expect(host.querySelector('[data-testid="briefing-session-guess"]')).toBeNull();
  });
});

/* ---------------------------------------------------------------- */

describe("the Stack (AJ's walk, Oct 3 2026)", () => {
  const flagged = { ...client, clinicalFlags: ["gen-shoulder"] } as Client;
  function Flagged() {
    return (
      <BriefingScreen
        authTrainer={trainer}
        client={flagged}
        targetRoutine={routines[0]}
        lastSession={null}
        sessions={sessions}
        onStart={() => {}}
        onClose={() => {}}
        machines={machines}
        routines={routines}
        trainers={[trainer]}
      />
    );
  }

  it("leads with safety: the figure lit where her limit is, and what to do said, not behind a tap", async () => {
    const host = await mount(<Flagged />);
    const band = host.querySelector('[aria-label="Before you start"]')!;
    expect(band.textContent).toContain("Before you start · 1");
    const fig = band.querySelector('[data-testid="briefing-figure"]')!;
    expect(fig.getAttribute("aria-label")).toBe("The client's limits: Shoulder");
    expect(fig.querySelectorAll("svg").length).toBeGreaterThan(0);
    // The instruction itself is on the page, as a sentence.
    expect(band.querySelectorAll(".br-safe__do").length).toBeGreaterThan(0);
    // Safety comes before the routine and the capture on the page.
    const routine = host.querySelector('[aria-label="Today\'s routine"]')!;
    expect(band.compareDocumentPosition(routine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no figure and says clear to go when nothing is flagged", async () => {
    const host = await mount(<Screen last={null} />);
    expect(host.querySelector('[data-testid="briefing-figure"]')).toBeNull();
    expect(host.querySelector(".br-safe--clear")).toBeTruthy();
  });

  it("reads the routine as one line, and opens the builder only on Edit", async () => {
    const host = await mount(<Screen />);
    const line = host.querySelector('[data-testid="briefing-routine-line"]')!;
    expect(line.textContent).toContain("Routine A · 2 machines");
    expect(line.textContent).toContain("Leg Press · Chest Press");
    expect(host.querySelector('[data-testid="routine-builder"]')).toBeNull();
    await click(line);
    expect(host.querySelector('[data-testid="routine-builder"]')?.getAttribute("data-count")).toBe("2");
  });

  it("offers every capture a tap away, with Dials open and the rest folded", async () => {
    const host = await mount(<Screen />);
    const chips = host.querySelector('[aria-label="What to fill in"]')!;
    const words = Array.from(chips.querySelectorAll("button")).map((b) => b.textContent);
    expect(words.slice(0, 4)).toEqual(["Dials", "Sore spot", "Note", "Update Pulse"]);
    // In her own pronoun (this client has none on file).
    expect(words[4]).toBe("Hand over the iPad");
    expect(host.querySelector('[data-testid="briefing-dials"]')).toBeTruthy();
    expect(host.querySelector(".br__textarea")).toBeNull();
    expect(host.querySelector('[data-testid="briefing-sore"]')).toBeNull();
  });

  it("a tap on the body opens the rating for that region and writes nothing until it is rated", async () => {
    const onStart = vi.fn();
    const host = await mount(<Screen onStart={onStart} />);
    await click(buttonByText(host, "Sore spot"));
    const knee = host.querySelector('[data-testid="briefing-sore"] [id^="knees"], [data-testid="briefing-sore"] path[id*="knee"]');
    if (knee) {
      await act(async () => {
        knee.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await settle();
    }
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][3]?.bodyStates).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- */

describe("how the client starts (the first-session design round, Oct 8 2026)", () => {
  /* A floor of catalog machines, named as the Academy names them. */
  const FLOOR_IDS = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-pulldown", "m-hip-abd", "m-dip", "m-ext"];
  const floor: Machine[] = FLOOR_IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
  const nameOfId = (id: string) => ACADEMY_MOVEMENT_NAME[id] ?? id;
  /* Starting out at the studio: Journey holds the whole story, and it is empty. */
  const fresh = {
    id: "c-new",
    homeStudioId: "s1",
    firstName: "Dana",
    lastName: "Reyes",
    sessionCount: 0,
    historyIsComplete: true,
    medicalHistory: "Sciatica down the left leg",
  } as Client;

  function Fresh({
    who = fresh,
    known = true,
    rs = [] as Routine[],
    coverage = "complete" as "complete" | "partial" | "unknown",
    onStart = (() => {}) as (...a: any[]) => void,
    onClose = () => {},
  }: {
    who?: Client;
    known?: boolean;
    rs?: Routine[];
    coverage?: "complete" | "partial" | "unknown";
    onStart?: (...a: any[]) => void;
    onClose?: () => void;
  }) {
    return (
      <BriefingScreen
        authTrainer={trainer}
        client={who}
        coverage={coverage}
        studioId="s1"
        studioName="Westlake"
        targetRoutine={null}
        lastSession={null}
        sessions={[]}
        routinesKnown={known}
        onStart={onStart}
        onClose={onClose}
        machines={floor}
        routines={rs}
        trainers={[trainer]}
      />
    );
  }
  const section = (host: HTMLElement) => host.querySelector('[aria-label="Today\'s routine"]')!;
  const todayNames = (host: HTMLElement) =>
    Array.from(section(host).querySelectorAll('.rpl-road__stop[data-kind="in"] .rpl-road__name')).map((n) => n.textContent);

  it("starting out: the plan card replaces the A and B buttons, today being the starting routine's day one", async () => {
    const host = await mount(<Fresh />);
    const card = section(host).querySelector('[data-testid="briefing-plan"]')!;
    expect(card).toBeTruthy();
    expect(section(host).querySelector(".br__routines")).toBeNull();
    expect(card.textContent).toContain("Dana's starting lineup");
    expect(card.textContent).toContain("Low back issues");
    expect(card.textContent).toContain("Next stop");
    expect(todayNames(host).length).toBeGreaterThan(0);
    // Read for this card (StrictMode mounts the effect twice in development).
    expect(startingReads.count).toBeGreaterThan(0);
  });

  it("Start hands the plan up with today's machines, and the briefing writes nothing", async () => {
    const onStart = vi.fn();
    const host = await mount(<Fresh onStart={onStart} />);
    const today = todayNames(host);
    await click(buttonByText(host, "Start session"));
    expect(onStart).toHaveBeenCalledTimes(1);
    const [type, custom, , , , startPlan] = onStart.mock.calls[0];
    expect(type).toBe("A");
    // Today unchanged: no list "adjusted for today", the plan carries it.
    expect(custom).toBeUndefined();
    expect(startPlan.name).toBe("Routine A");
    expect(startPlan.machineIds.map(nameOfId)).toEqual(today);
    // Day one is on the plan; Routine A is the tracker's to make, EMPTY.
    expect(startPlan.plan.dayOne).toEqual(startPlan.machineIds);
    expect(startPlan.plan.madeByUid).toBe("uid-aj");
    expect(startPlan.startingRoutineName).toBe("Low back issues");
    // The briefing hands its sequence upward and writes nothing (session-scope.test.ts).
    expect(writes).toEqual([]);
    expect(sets).toEqual([]);
  });

  it("Change today goes up as today's list, and the plan Start keeps takes it as day one", async () => {
    const onStart = vi.fn();
    const host = await mount(<Fresh onStart={onStart} />);
    const before = todayNames(host);
    await click(buttonByText(host, "Change today"));
    const firstTick = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="checkbox"][aria-checked="true"]'))[0];
    await click(firstTick);
    await click(buttonByText(document.body, "Done"));
    expect(todayNames(host)).toEqual(before.slice(1));
    await click(buttonByText(host, "Start session"));
    const [, custom, , , , startPlan] = onStart.mock.calls[0];
    expect(custom.map(nameOfId)).toEqual(before.slice(1));
    expect(startPlan.machineIds).toEqual(custom);
    /* AJ's "3a" (Oct 8 2026): the plan keeps "the first visit's machines" as
       its day one, so a machine taken out at the consult doesn't come back
       when the next visit runs day one again. */
    expect(startPlan.plan.dayOne.map(nameOfId)).toEqual(before.slice(1));
  });

  it("keeps the briefing's safety line on the plan card: today's machines against the client's limits", async () => {
    const host = await mount(<Fresh who={{ ...fresh, clinicalFlags: ["gen-low-back"] } as Client} />);
    const card = section(host).querySelector('[data-testid="briefing-plan"]')!;
    const line = card.querySelector('[data-testid="briefing-plan-limits"]');
    expect(line?.textContent).toContain("Mind the limits on");
    expect(line?.textContent).toContain(nameOfId("m-lumbar"));
    // Only today's machines: one later on the road is not named.
    expect(line?.textContent).not.toContain(nameOfId("m-pulldown"));
  });

  it("says nothing about limits when today touches none", async () => {
    const host = await mount(<Fresh />);
    expect(section(host).querySelector('[data-testid="briefing-plan-limits"]')).toBeNull();
  });

  it("reads either spelling of a routine's name: an older seeder's 'A' is the client's routine, never 'no routine'", async () => {
    const a = { id: "rA", clientId: "c-new", name: "A", machineIds: ["m-leg-press", "m-lumbar"] } as unknown as Routine;
    const host = await mount(<Fresh rs={[a]} coverage="partial" />);
    expect(section(host).querySelector('[data-testid="briefing-plan-journey"]')).toBeNull();
    expect(host.querySelector('[data-testid="briefing-routine-line"]')!.textContent).toContain("Routine A · 2 machines");
  });

  it("never holds Start: while the starting routines are read, Start opens an empty session with no plan", async () => {
    startingReads.now.routines = () => new Promise(() => {});
    const onStart = vi.fn();
    const host = await mount(<Fresh onStart={onStart} />);
    expect(section(host).textContent).toContain("Reading the starting routines…");
    const start = buttonByText(host, "Start session") as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    await click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0][1]).toBeUndefined();
    expect(onStart.mock.calls[0][5]).toBeNull();
  });

  it("never decides 'new' off a read that hasn't answered: routines not known, or no session count, is both doors", async () => {
    const host = await mount(<Fresh known={false} />);
    expect(section(host).querySelector('[data-testid="briefing-plan-doors"]')).toBeTruthy();
    expect(section(host).textContent).toContain("How does Dana start?");
    expect(section(host).querySelector('[data-testid="briefing-plan"]')).toBeNull();
    // Nothing is read for a card that isn't drawn.
    expect(startingReads.count).toBe(0);
    await act(async () => {
      for (const m of mounted) m.root.unmount();
    });
    mounted = [];
    const { sessionCount: _count, ...uncounted } = fresh;
    const host2 = await mount(<Fresh who={uncounted as Client} />);
    expect(section(host2).querySelector('[data-testid="briefing-plan-doors"]')).toBeTruthy();
  });

  it("Add Client's walk-in (a temporary profile, no count of its own) is starting out: the plan card", async () => {
    const walkIn = {
      id: "c-walk",
      homeStudioId: "s1",
      firstName: "Lee",
      lastName: "Park",
      provisional: true,
      provisionalReason: "New client, not in Mindbody yet",
    } as unknown as Client;
    const host = await mount(<Fresh who={walkIn} coverage="unknown" />);
    expect(section(host).querySelector('[data-testid="briefing-plan"]')?.textContent).toContain("Lee's starting lineup");
  });

  it("can't tell: Start with no door picked opens an empty session; Starting out here draws the card and Start keeps its plan", async () => {
    const onStart = vi.fn();
    const host = await mount(<Fresh known={false} onStart={onStart} />);
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][1]).toBeUndefined();
    expect(onStart.mock.calls[0][5]).toBeNull();

    await click(buttonByText(section(host), "Starting out here"));
    expect(section(host).querySelector('[data-testid="briefing-plan"]')).toBeTruthy();
    expect(buttonByText(section(host), "Both ways to start")).toBeTruthy();
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[1][5]?.plan.templateId).toBe("academy-low-back");

    await click(buttonByText(section(host), "Both ways to start"));
    expect(section(host).querySelector('[data-testid="briefing-plan-doors"]')).toBeTruthy();
  });

  it("trained here before Journey: one line, a door to Programming, and Start opens an empty session", async () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    const before = { ...fresh, historyIsComplete: false, sessionCount: 0 } as Client;
    const host = await mount(<Fresh who={before} coverage="partial" onStart={onStart} onClose={onClose} />);
    const door = section(host).querySelector('[data-testid="briefing-plan-journey"]')!;
    expect(door.textContent).toContain("Dana has a routine from before Journey.");
    expect(door.textContent).toContain("Or start and add machines as you go.");
    expect(startingReads.count).toBe(0);

    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][0]).toBe("A");
    expect(onStart.mock.calls[0][1]).toBeUndefined();
    expect(onStart.mock.calls[0][5]).toBeNull();

    await click(buttonByText(door, "Enter the routine on Programming"));
    expect(opened.calls).toEqual([["c-new", { tab: "programming", view: "routine-a" }]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* The always-on rule: a screen holding typing registers with the leave
     gate, and its own ways out ask BEFORE anything moves. */
  describe("the leave gate", () => {
    const before = { ...fresh, historyIsComplete: false, sessionCount: 0 } as Client;
    const dialog = () => document.body.querySelector('[role="alertdialog"]');
    const typeNote = async (host: HTMLElement) => {
      await click(buttonByText(host, "Note"));
      await typeInto(host.querySelector(".br__textarea"), "Late from work, left knee stiff");
    };

    it("Enter the routine on Programming asks first when a note is typed, and sets nothing before the answer", async () => {
      const onClose = vi.fn();
      const host = await mount(
        <UnsavedChangesProvider>
          <Fresh who={before} coverage="partial" onClose={onClose} />
        </UnsavedChangesProvider>,
      );
      await typeNote(host);
      await click(buttonByText(section(host), "Enter the routine on Programming"));
      expect(dialog()?.textContent).toContain("the briefing");
      expect(opened.calls).toEqual([]);
      expect(onClose).not.toHaveBeenCalled();
      await click(buttonByText(dialog()!, "Keep editing"));
      expect((host.querySelector(".br__textarea") as HTMLTextAreaElement).value).toBe("Late from work, left knee stiff");
      expect(onClose).not.toHaveBeenCalled();

      await click(buttonByText(section(host), "Enter the routine on Programming"));
      await click(buttonByText(dialog()!, "Leave"));
      expect(opened.calls).toEqual([["c-new", { tab: "programming", view: "routine-a" }]]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("the close button asks before the briefing moves when a note is typed", async () => {
      const onClose = vi.fn();
      const host = await mount(
        <UnsavedChangesProvider>
          <Fresh onClose={onClose} />
        </UnsavedChangesProvider>,
      );
      await typeNote(host);
      await click(host.querySelector('[aria-label="Close briefing"]'));
      expect(dialog()?.textContent).toContain("the briefing");
      expect(onClose).not.toHaveBeenCalled();
      await click(buttonByText(dialog()!, "Leave"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Change today on the plan card counts as unsaved too", async () => {
      const onClose = vi.fn();
      const host = await mount(
        <UnsavedChangesProvider>
          <Fresh onClose={onClose} />
        </UnsavedChangesProvider>,
      );
      await click(buttonByText(host, "Change today"));
      const firstTick = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="checkbox"][aria-checked="true"]'))[0];
      await click(firstTick);
      await click(buttonByText(document.body, "Done"));
      await click(host.querySelector('[aria-label="Close briefing"]'));
      expect(dialog()?.textContent).toContain("the briefing");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("with nothing typed or changed, the doors go at once", async () => {
      const onClose = vi.fn();
      const host = await mount(
        <UnsavedChangesProvider>
          <Fresh who={before} coverage="partial" onClose={onClose} />
        </UnsavedChangesProvider>,
      );
      await click(buttonByText(section(host), "Enter the routine on Programming"));
      expect(dialog()).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Start never asks: it is not a navigation", async () => {
      const onStart = vi.fn();
      const host = await mount(
        <UnsavedChangesProvider>
          <Fresh onStart={onStart} />
        </UnsavedChangesProvider>,
      );
      await typeNote(host);
      await click(buttonByText(host, "Start session"));
      expect(dialog()).toBeNull();
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });

  it("a plan kept with Routine A still empty: the card runs day one, and Start hands up no second plan", async () => {
    const plan = {
      purpose: "Learning the protocol: the starting routine",
      intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"],
      dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
      building: true,
      templateId: "academy-low-back",
      madeByUid: "uid-sam",
    };
    const kept = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: [], plan } as unknown as Routine;
    const onStart = vi.fn();
    const host = await mount(<Fresh rs={[kept]} onStart={onStart} />);
    expect(section(host).textContent).toContain("Routine A's plan");
    expect(todayNames(host)).toEqual(["m-leg-press", "m-compound-row", "m-lumbar"].map(nameOfId));
    expect(startingReads.count).toBe(0);
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][0]).toBe("A");
    // The routine's own today (todayFor) is the session's: nothing adjusted, no plan to keep.
    expect(onStart.mock.calls[0][1]).toBeUndefined();
    expect(onStart.mock.calls[0][5]).toBeNull();
  });

  it("a plan in progress: the routine line as before, with the Road and how far along under it", async () => {
    const plan = {
      purpose: "The core",
      intended: ["m-leg-press", "m-compound-row", "m-lumbar"],
      building: true,
      madeByUid: "uid-sam",
    };
    const a = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press"], plan } as unknown as Routine;
    const onStart = vi.fn();
    const host = await mount(<Fresh rs={[a]} onStart={onStart} />);
    expect(host.querySelector('[data-testid="briefing-routine-line"]')!.textContent).toContain("Routine A · 1 machine");
    const road = host.querySelector('[data-testid="briefing-plan-road"]')!;
    expect(road.textContent).toContain(`1 of 3 · next: ${nameOfId("m-compound-row")}`);
    expect(road.textContent).toContain("Next stop");
    expect(startingReads.count).toBe(0);
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][5]).toBeUndefined();
  });

  /* A weak area (Round 2 of the design round, item 7): the plan's focus is
     said on the glance line, so the next trainer sees it before Start. */
  it("a plan in progress with a weak area: 'Focus: Delts' on the Road's line", async () => {
    const plan = {
      purpose: "The core",
      intended: ["m-leg-press", "m-compound-row", "m-lumbar"],
      building: true,
      focus: ["delts"],
      madeByUid: "uid-sam",
    };
    const a = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press"], plan } as unknown as Routine;
    const host = await mount(<Fresh rs={[a]} onStart={vi.fn()} />);
    const road = host.querySelector('[data-testid="briefing-plan-road"]')!;
    expect(road.textContent).toContain(`1 of 3 · next: ${nameOfId("m-compound-row")} · Focus: Delts`);
  });

  /* B, molded in (Round 2 of the design round, item 6): a client on Routine
     B sees the Road for B as the glance, "B · 1 of 2 swaps", and nothing
     else on the briefing changes. */
  it("a session on Routine B with its plan: the Road for B, the swaps still to come, and how far B is", async () => {
    const a = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"] } as unknown as Routine;
    const bPlan = {
      purpose: "Variety: the same regions, different machines",
      purposeKinds: ["variety"],
      intended: ["m-ext", "m-pulldown", "m-lumbar"],
      swaps: [
        { replaces: "m-leg-press", with: "m-ext" },
        { replaces: "m-compound-row", with: "m-pulldown" },
      ],
      building: false,
      madeByUid: "uid-sam",
    };
    const b = { id: "rB", clientId: "c-new", name: "Routine B", machineIds: ["m-ext", "m-compound-row", "m-lumbar"], plan: bPlan } as unknown as Routine;
    const onStart = vi.fn();
    const host = await mount(
      <BriefingScreen
        authTrainer={trainer}
        client={{ ...fresh, sessionCount: 12, isRoutineBActive: true } as Client}
        coverage="complete"
        studioId="s1"
        studioName="Westlake"
        targetRoutine={b}
        lastSession={null}
        sessions={[]}
        routinesKnown
        onStart={onStart}
        onClose={() => {}}
        machines={floor}
        routines={[a, b]}
        trainers={[trainer]}
      />,
    );
    expect(host.querySelector('[data-testid="briefing-routine-line"]')!.textContent).toContain("Routine B · 3 machines");
    const road = host.querySelector('[data-testid="briefing-b-road"]')!;
    expect(road.textContent).toContain(`B · 1 of 2 swaps · next: ${nameOfId("m-pulldown")} for ${nameOfId("m-compound-row")}`);
    expect(road.textContent).toContain("Swaps to come");
    expect(road.textContent).toContain("Next stop");
    expect(Array.from(road.querySelectorAll('.rpl-road__stop[data-kind="in"] .rpl-road__name')).map((n) => n.textContent)).toEqual(
      ["m-ext", "m-compound-row", "m-lumbar"].map(nameOfId),
    );
    // A's Road is not drawn over a session on B.
    expect(host.querySelector('[data-testid="briefing-plan-road"]')).toBeNull();
    await click(buttonByText(host, "Start session"));
    expect(onStart.mock.calls[0][0]).toBe("B");
  });

  /* A weak area (Round 2 of the design round, item 7): the focus kept on
     Routine A's plan reaches a session on B too, and an addition for B
     alone is on B's Road, so the next trainer sees both before Start. */
  describe("a weak area on a session on Routine B", () => {
    const aPlan = { purpose: "The core", intended: ["m-leg-press", "m-compound-row", "m-lumbar"], building: false, focus: ["delts"], madeByUid: "uid-sam" };
    const a = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"], plan: aPlan } as unknown as Routine;
    const briefing = (b: Routine) => (
      <BriefingScreen
        authTrainer={trainer}
        client={{ ...fresh, sessionCount: 12, isRoutineBActive: true } as Client}
        coverage="complete"
        studioId="s1"
        studioName="Westlake"
        targetRoutine={b}
        lastSession={null}
        sessions={[]}
        routinesKnown
        onStart={vi.fn()}
        onClose={() => {}}
        machines={floor}
        routines={[a, b]}
        trainers={[trainer]}
      />
    );

    it("with B's plan: 'Focus: Delts' on B's Road line, and B's own on deck on the Road", async () => {
      const bPlan = {
        purpose: "Variety: the same regions, different machines",
        purposeKinds: ["variety"],
        intended: ["m-ext", "m-pulldown", "m-lumbar", "m-lateral-raise"],
        swaps: [
          { replaces: "m-leg-press", with: "m-ext" },
          { replaces: "m-compound-row", with: "m-pulldown" },
        ],
        building: false,
        madeByUid: "uid-sam",
      };
      const b = { id: "rB", clientId: "c-new", name: "Routine B", machineIds: ["m-ext", "m-compound-row", "m-lumbar"], plan: bPlan } as unknown as Routine;
      const host = await mount(briefing(b));
      const road = host.querySelector('[data-testid="briefing-b-road"]')!;
      expect(road.textContent).toContain(`B · 1 of 2 swaps · next: ${nameOfId("m-pulldown")} for ${nameOfId("m-compound-row")} · Focus: Delts`);
      expect(road.textContent).toContain("On deck in B");
      expect(road.textContent).toContain(nameOfId("m-lateral-raise"));
    });

    it("with a Routine B of its own (no Road): 'Focus: Delts' on the routine line", async () => {
      const b = { id: "rB", clientId: "c-new", name: "Routine B", machineIds: ["m-ext", "m-pulldown", "m-lumbar"] } as unknown as Routine;
      const host = await mount(briefing(b));
      expect(host.querySelector('[data-testid="briefing-b-road"]')).toBeNull();
      expect(host.querySelector('[data-testid="briefing-routine-line"]')!.textContent).toMatch(/Routine B · 3 machines.* · Focus: Delts/);
    });
  });

  /* The builder's "thin" advice ("Most established clients run at least
     6") was gated on the intro-session flag, which nothing set, so every
     client was "established". It is the Academy's learning curve now ("after
     the initial 'learning curve' period of around 4 to 6 workouts"): six
     sessions, or trained here before Journey, never while Routine A is
     being built, and the routine drawer asks the same rule (the
     first-session design round, Oct 8 2026, §4.8). */
  describe("calls a short routine thin only past the learning curve", () => {
    const plan = { purpose: "The core", intended: ["m-leg-press", "m-compound-row", "m-lumbar"], building: true, madeByUid: "uid-sam" };
    const building = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press"], plan } as unknown as Routine;
    const settled = { ...building, plan: { ...plan, building: false } } as unknown as Routine;
    const handBuilt = { id: "rA", clientId: "c-new", name: "Routine A", machineIds: ["m-leg-press", "m-lumbar", "m-dip"] } as unknown as Routine;
    const establishedOf = async (el: React.ReactElement) => {
      const host = await mount(el);
      await click(host.querySelector('[data-testid="briefing-routine-line"]')!);
      return host.querySelector('[data-testid="routine-builder"]')!.getAttribute("data-established");
    };

    it("never while Routine A is being built", async () => {
      expect(await establishedOf(<Fresh who={{ ...fresh, sessionCount: 9 } as Client} rs={[building]} />)).toBe("false");
    });

    it("not a client starting out, with a routine or a settled plan, however it was made", async () => {
      // Whole story in Journey, no session yet: a routine made on Programming
      // before the first visit, or a plan whose switch is off.
      expect(await establishedOf(<Fresh rs={[settled]} />)).toBe("false");
      expect(await establishedOf(<Fresh rs={[handBuilt]} />)).toBe("false");
      // Two sessions in: still inside the curve.
      expect(await establishedOf(<Fresh who={{ ...fresh, sessionCount: 2 } as Client} rs={[handBuilt]} />)).toBe("false");
    });

    it("six sessions in, or trained here before Journey", async () => {
      expect(await establishedOf(<Fresh who={{ ...fresh, sessionCount: 6 } as Client} rs={[settled]} />)).toBe("true");
      expect(
        await establishedOf(<Fresh who={{ ...fresh, sessionCount: 1, historyIsComplete: false } as Client} coverage="partial" rs={[handBuilt]} />),
      ).toBe("true");
    });

    it("claims nothing when Journey can't tell (the routines not read yet)", async () => {
      expect(await establishedOf(<Fresh who={{ ...fresh, sessionCount: 9 } as Client} rs={[settled]} known={false} />)).toBe("false");
    });
  });
});
