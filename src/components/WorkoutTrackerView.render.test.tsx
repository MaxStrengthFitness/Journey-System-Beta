// @vitest-environment jsdom
/**
 * THE ACTIVE SESSION MOUNTS.
 *
 * Claude Experiment, phase E — Sep 20 2026.
 *
 * Until this file, the Rank 1 screen — the one a trainer holds in one hand on
 * the gym floor — had ZERO mount coverage. `WorkoutTrackerView.tsx` is 3,400
 * lines with 38 useState and 20 useEffect, and its only "coverage" was
 * `features/routine-builder/session-scope.test.ts`, which reads the file as
 * TEXT and asserts on the source string.
 *
 * CLAUDE.md is explicit about why that is not enough: "A green typecheck,
 * suite and build do not mean a screen mounts. Only *.render.test.tsx files
 * mount anything; add one for any component that does work during render or
 * in a layout effect."
 *
 * The pure libraries under this screen are well tested — set-outcome,
 * machine-clock, tracker-screen, live-session. So a green suite proves the
 * RULES are right. It proves nothing about the WIRING, and the wiring is
 * where phases B, C and D of this round found their bugs.
 *
 * What this pins, deliberately narrow so it does not rot on every layout
 * change:
 *
 *   1. It mounts with a live In-Progress session and draws the floor.
 *   2. The machines and the ORDER come from the studio's roster, not the
 *      app-wide list — including a machine the global catalog has never
 *      heard of (phase B).
 *   3. The settings rail shows the STUDIO's dial labels (phase B).
 *   4. A machine with nothing on file shows no invented "G 0" (phase C).
 *   5. Two dials that share a first letter both survive (phase C).
 *   6. An abandoned session is asked about, never adopted (Sep 24 2026):
 *      Start the next morning used to reopen yesterday's session silently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/* ------------------------------------------------------------------ *
 * The fake database
 * ------------------------------------------------------------------ */

vi.mock("../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-coach" } },
  functions: {},
}));

const SESSION_ID = "sess-live";
const CLIENT_ID = "c-judy";
const STUDIO_ID = "solon";

/** The studio's roster: its own leg press, and a machine corporate never had. */
const ROSTER_DOCS = [
  {
    id: "m-leg-press",
    data: () => ({
      source: "catalog",
      basedOn: "m-leg-press",
      status: "active",
      order: 10,
      overrides: {
        name: "Leg Press (Hoist)",
        settingFields: [
          { key: "gap", label: "Gap", type: "text" },
          { key: "seat-angle", label: "Seat Angle", type: "text" },
          { key: "seat-distance", label: "Seat Distance", type: "text" },
        ],
      },
    }),
  },
  {
    id: "sm-solon-rear-delt",
    data: () => ({
      source: "custom",
      status: "active",
      order: 20,
      definition: {
        name: "Rear Delt Hoist",
        settingFields: [{ key: "seat", label: "Seat", type: "text" }],
      },
    }),
  },
];

/** The corporate catalog. Note: no rear delt, and the old leg-press name. */
const CATALOG_DOCS = [
  {
    id: "m-leg-press",
    data: () => ({
      name: "LEG PRESS",
      status: "active",
      defaultOrder: 10,
      settingFields: [{ key: "gap", label: "Gap", type: "text" }],
    }),
  },
];

const SESSION_DOCS = [
  {
    id: SESSION_ID,
    data: () => ({
      clientId: CLIENT_ID,
      status: "In-Progress",
      sessionNumber: 12,
      date: "2026-09-20",
      trainerId: "uid-coach",
      trainerInitials: "JC",
      hostedAtStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"],
      startTime: new Date(2026, 8, 20, 9, 0),
      lastHeartbeatAt: new Date(),
    }),
  },
];

/**
 * Sep 24 2026 — the abandoned session. Yesterday's, never finished: its
 * heartbeat is 22 hours old, which the staleness rule calls abandoned.
 */
const STALE_ID = "sess-yesterday";
const TWENTY_TWO_HOURS_AGO = new Date(Date.now() - 22 * 60 * 60_000);
const STALE_SESSION_DOCS = [
  {
    id: STALE_ID,
    data: () => ({
      clientId: CLIENT_ID,
      status: "In-Progress",
      sessionNumber: 12,
      date: "2026-09-23",
      trainerId: "uid-coach",
      trainerInitials: "JC",
      hostedAtStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      sessionMachineIds: ["m-leg-press"],
      startTime: TWENTY_TWO_HOURS_AGO,
      createdAt: TWENTY_TWO_HOURS_AGO,
      lastHeartbeatAt: TWENTY_TWO_HOURS_AGO,
    }),
  },
];

/** Which sessions the client's stream holds; each test may swap it. */
let sessionDocs: { id: string; data: () => any }[] = SESSION_DOCS;
/** Single documents a direct `getDoc` can find, by path. */
let singleDocs: Record<string, any> = {};

/**
 * The client has values for BOTH seat dials on the leg press. Before phase C
 * these collapsed onto "S" and only one survived. The rear delt has nothing
 * at all, which before phase C rendered as "G 0".
 */
const SETTINGS_DOCS = [
  {
    id: `${CLIENT_ID}_m-leg-press`,
    data: () => ({
      clientId: CLIENT_ID,
      machineId: "m-leg-press",
      settings: { "Seat Angle": "P2", "Seat Distance": "7" },
      currentWeight: 120,
    }),
  },
];

const writes: { path: string; data: any; merge?: boolean }[] = [];
/** Every listener the screen opened, so a test can send it a new snapshot (another iPad's write). */
const snapshotListeners: { path: string; emit: () => void }[] = [];
/** Finish's database, per test (session record, Sep 26 2026): does the commit answer, and what does the server say the session is? */
const finishCtl = { commit: "ok" as "ok" | "hang", serverStatus: undefined as string | undefined };

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");

  const docsFor = (p: string) => {
    if (p === "machines") return CATALOG_DOCS;
    if (p === `studios/${STUDIO_ID}/roster`) return ROSTER_DOCS;
    if (p === "sessions") return sessionDocs;
    if (p === "clientMachineSettings") return SETTINGS_DOCS;
    return [];
  };

  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => ({}),
    onSnapshot: (q: any, next: any) => {
      const cb = typeof next === "function" ? next : next?.next;
      const at = q?.__path ?? "";
      const emit = () => {
        const docs = docsFor(at);
        // Both shapes: the briefing (mounted since the Sep 24 tests) also
        // listens to single documents, which answer exists()/data().
        const single = singleDocs[at];
        cb?.({
          docs,
          size: docs.length,
          empty: docs.length === 0,
          forEach: (f: any) => docs.forEach(f),
          id: String(at).split("/").pop(),
          exists: () => single !== undefined,
          data: () => single,
        });
      };
      emit();
      snapshotListeners.push({ path: at, emit });
      return () => {};
    },
    getDocs: async (q: any) => {
      const docs = docsFor(q?.__path ?? "");
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (f: any) => docs.forEach(f) };
    },
    getDoc: async (ref: any) => {
      const data = singleDocs[ref?.__path ?? ""];
      return data
        ? { exists: () => true, id: String(ref.__path).split("/").pop(), data: () => data }
        : { exists: () => false, data: () => undefined };
    },
    addDoc: async () => ({ id: "new-doc" }),
    setDoc: async (ref: any, data: any, opts?: any) => {
      writes.push({ path: ref.__path, data, merge: !!opts?.merge });
    },
    updateDoc: async (ref: any, data: any) => {
      writes.push({ path: ref.__path, data });
    },
    deleteDoc: async () => {},
    writeBatch: () => ({
      set: (ref: any, data: any, opts?: any) =>
        writes.push({ path: ref.__path, data, merge: !!opts?.merge }),
      update: (ref: any, data: any) => writes.push({ path: ref.__path, data }),
      delete: () => {},
      commit: () => (finishCtl.commit === "hang" ? new Promise<void>(() => {}) : Promise.resolve()),
    }),
    getDocFromServer: async () => ({
      exists: () => finishCtl.serverStatus !== undefined,
      data: () => ({ status: finishCtl.serverStatus }),
    }),
    waitForPendingWrites: () => new Promise<void>(() => {}),
    serverTimestamp: () => ({ __server: true }),
    increment: (n: number) => ({ __inc: n }),
    arrayUnion: (...v: any[]) => ({ __union: v }),
    arrayRemove: (...v: any[]) => ({ __remove: v }),
    Timestamp: real.Timestamp,
  };
});

/** The studio list the context hands out; a test may give the studios cutover days. */
const studioCtx = vi.hoisted(() => ({ studios: undefined as undefined | { id: string; journeyCutoverDate?: string }[] }));

vi.mock("../contexts/ActiveStudioContext", async (importOriginal) => {
  const realMod = await importOriginal<any>();
  return { ...realMod, useActiveStudio: () => ({ activeStudioId: STUDIO_ID, studios: studioCtx.studios }) };
});

import { WorkoutTrackerView } from "./WorkoutTrackerView";
import { ToastProvider } from "../contexts/ToastContext";
import type { Client, Machine, Trainer } from "../types";

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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  writes.length = 0;
  snapshotListeners.length = 0;
  finishCtl.commit = "ok";
  finishCtl.serverStatus = undefined;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  sessionDocs = SESSION_DOCS;
  singleDocs = {};
  localStorage.clear();
  studioCtx.studios = undefined;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const client = {
  id: CLIENT_ID,
  homeStudioId: STUDIO_ID,
  firstName: "Judy",
  lastName: "Client",
  sessionCount: 11,
  gender: "Female",
  age: 62,
} as Client;

const trainer = {
  id: "t-doc",
  authUid: "uid-coach",
  fullName: "Jane Coach",
  initials: "JC",
  role: "LifeTransformer",
  primaryHomeStudioId: STUDIO_ID,
} as unknown as Trainer;

/** The APP-WIDE list — deliberately stale, to prove the floor does not use it. */
const appWideMachines: Machine[] = [
  {
    id: "m-leg-press",
    name: "LEG PRESS",
    order: 10,
    settingOptions: ["Gap"],
    trainerTips: "Belt them in before the handoff.",
  },
];

function Tracker({ who = client }: { who?: Client } = {}) {
  return (
    <WorkoutTrackerView
      clientId={CLIENT_ID}
      clients={[who]}
      machines={appWideMachines}
      trainers={[trainer]}
      user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
      setView={vi.fn()}
      setSelectedClientId={vi.fn()}
      showClientPicker={false}
      setShowClientPicker={vi.fn()}
      onStartNewClientOnboarding={vi.fn()}
      authTrainer={trainer}
      isSyncing={false}
      setIsSyncing={vi.fn()}
      schedules={[]}
      setClientFormData={vi.fn()}
      onOpenInfo={vi.fn()}
    />
  );
}

describe("the Active Session mounts and draws this studio's floor", () => {
  it("mounts with a live In-Progress session without throwing", async () => {
    const host = await mount(<Tracker />);
    // The thing that had never been proven: the Rank 1 screen renders.
    expect(host.textContent).toBeTruthy();
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
  });

  it("shows the STUDIO's name for its own unit, not the catalog's", async () => {
    const host = await mount(<Tracker />);
    const text = host.textContent ?? "";
    // The roster renames it; the app-wide list still says "LEG PRESS".
    expect(text).toContain("Leg Press (Hoist)");
  });

  it("shows a machine the corporate catalog has never heard of", async () => {
    // The studio's own unit. Before phase B the floor read the global list,
    // so a custom machine could never appear during a session.
    const host = await mount(<Tracker />);
    expect(host.textContent ?? "").toContain("Rear Delt Hoist");
  });

  it("keeps both seat dials — neither is lost to a shared first letter", async () => {
    const host = await mount(<Tracker />);
    const text = host.textContent ?? "";
    // Phase C: these used to collapse onto "S" and one value vanished.
    expect(text).toContain("P2");
    expect(text).toContain("7");
  });

  it("does not invent a gap for a machine with nothing on file", async () => {
    const host = await mount(<Tracker />);
    // The rear delt has no client settings and no default. Before phase C
    // every such machine rendered "G 0" — a confident wrong number on the
    // strip the floor doc says is read twice per machine.
    const railText = Array.from(host.querySelectorAll('[class*="setting"], [class*="rail"]'))
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(railText).not.toMatch(/\bG\s*0\b/);
  });
});

describe("an abandoned session is asked about, never adopted (Sep 24 2026)", () => {
  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === label.toLowerCase(),
    );

  it("the reported bug: yesterday's session is not reopened — the question is asked over the briefing", async () => {
    sessionDocs = STALE_SESSION_DOCS;
    const host = await mount(<Tracker />);
    // Not the tracker: that was the bug — today's sets landing in yesterday's session.
    expect(host.querySelector(".jg-sbar")).toBeNull();
    const body = document.body.textContent ?? "";
    expect(body).toContain("has an unfinished session");
    expect(body).toContain("It was never finished.");
    // This trainer's own: resuming is not a take-over, and does not say it is.
    expect(body).not.toContain("makes it yours");
    expect(button("Resume it")).toBeTruthy();
    expect(button("Start a new session")).toBeTruthy();
    // Asking writes nothing.
    expect(writes.filter((w) => w.path === `sessions/${STALE_ID}`)).toEqual([]);
  });

  it("Resume carries on in that session and marks it running again", async () => {
    sessionDocs = STALE_SESSION_DOCS;
    const host = await mount(<Tracker />);
    await act(async () => {
      button("Resume it")!.click();
    });
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const heartbeat = writes.find((w) => w.path === `sessions/${STALE_ID}`);
    expect(heartbeat?.data).toHaveProperty("lastHeartbeatAt");
    // Only the heartbeat: its day, its status and its sets are untouched.
    expect(Object.keys(heartbeat!.data)).toEqual(["lastHeartbeatAt"]);
    expect(localStorage.getItem("max_strength_active_session_id")).toBe(STALE_ID);
  });

  it("Start a new session leaves it exactly as it is and lands on the briefing", async () => {
    sessionDocs = STALE_SESSION_DOCS;
    const host = await mount(<Tracker />);
    await act(async () => {
      button("Start a new session")!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.querySelector(".jg-sbar")).toBeNull();
    expect(button("Resume it")).toBeFalsy();
    expect(writes.filter((w) => w.path === `sessions/${STALE_ID}`)).toEqual([]);
  });

  it("a live session is still adopted without asking", async () => {
    // SESSION_DOCS' heartbeat is now: nothing to ask.
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("has an unfinished session");
  });

  it("the device's remembered session is not adopted for a different client", async () => {
    // The takeover check used to compare against `selectedClient`, which is
    // null on the first render, so it adopted the remembered session for
    // whichever client was opened.
    sessionDocs = [];
    localStorage.setItem("max_strength_active_session_id", "sess-other");
    singleDocs["sessions/sess-other"] = {
      clientId: "c-someone-else",
      status: "In-Progress",
      trainerInitials: "JC",
      lastHeartbeatAt: new Date(),
      createdAt: new Date(),
    };
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-sbar")).toBeNull();
  });

  it("the device's remembered session is not adopted once it is stale", async () => {
    sessionDocs = [];
    localStorage.setItem("max_strength_active_session_id", STALE_ID);
    singleDocs[`sessions/${STALE_ID}`] = STALE_SESSION_DOCS[0].data();
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-sbar")).toBeNull();
  });
});

/*
 * "#12" in the session bar and on today's column is a claim about the client
 * (Sep 24 2026). For a migration client nobody has recorded a total for, the
 * number is only what Journey has seen - so it is printed only through the
 * Hub card's gate, and coverage is judged by the client's HOME studio's
 * cutover, not the iPad's.
 */
describe("the Active Session's session number", () => {
  const barNumber = (host: HTMLElement) => host.querySelector(".jg-sbar__meta b")?.textContent ?? null;
  const liveHead = (host: HTMLElement) => host.querySelector(".jg-head--live .jg-head__n")?.textContent ?? null;

  it("prints no number when nobody knows how much of her story Journey holds", async () => {
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    expect(barNumber(host)).toBeNull();
    expect(host.querySelector(".jg-sbar__meta")?.textContent).not.toContain("#");
    expect(liveHead(host)).toBe("JC");
  });

  it("prints it for a client Mindbody says is genuinely new", async () => {
    const host = await mount(<Tracker who={{ ...client, clientsNumberOfVisitsAtSite: 3 } as Client} />);
    expect(barNumber(host)).toBe("#12");
    expect(liveHead(host)).toBe("#12 · JC");
  });

  it("prints it for a long-standing client once her total is recorded", async () => {
    const recorded = {
      ...client,
      clientsNumberOfVisitsAtSite: 400,
      priorHistory: { sessions: 400, importedCount: 0, through: "2026-09-01", source: "filemaker" },
    } as Client;
    const host = await mount(<Tracker who={recorded} />);
    expect(barNumber(host)).toBe("#12");
  });

  it("judges coverage by the client's HOME studio's cutover, not the iPad's", async () => {
    // The iPad is at Solon, which has no cutover; her home is Westlake, which
    // moved onto Journey before her first session there - so Journey holds her
    // whole story and the number is hers.
    studioCtx.studios = [{ id: STUDIO_ID }, { id: "westlake", journeyCutoverDate: "2026-01-01" }];
    const host = await mount(
      <Tracker who={{ ...client, homeStudioId: "westlake", firstSessionDate: "2026-03-02" } as Client} />,
    );
    expect(barNumber(host)).toBe("#12");

    // The same client read by Solon's (absent) day would have had no number.
    studioCtx.studios = [{ id: STUDIO_ID, journeyCutoverDate: "2026-01-01" }, { id: "westlake" }];
    const other = await mount(
      <Tracker who={{ ...client, homeStudioId: "westlake", firstSessionDate: "2026-03-02" } as Client} />,
    );
    expect(barNumber(other)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Finish (session record, Sep 26 2026)
 * ------------------------------------------------------------------ */

describe("Finish never hangs and never counts a session twice (session record, Sep 26 2026)", () => {
  const finishButton = () =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session");
  const totalsWrites = () => writes.filter((w) => w.path === `clients/${CLIENT_ID}` && w.data?.completedSessions);
  const completedWrites = () => writes.filter((w) => w.path === `sessions/${SESSION_ID}` && w.data?.status === "Completed");
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  async function openEndSession() {
    const host = await mount(<Tracker />);
    const bar = host.querySelector(".jg-sbar__finish") as HTMLButtonElement | null;
    expect(bar).not.toBeNull();
    await act(async () => bar!.click());
    expect(finishButton()).toBeDefined();
    return host;
  }

  it("offline, goes straight to the post-session screen and says the session is saved on this iPad", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    finishCtl.commit = "hang"; // offline, the database never answers
    await openEndSession();
    await act(async () => finishButton()!.click());
    await settle();
    await settle();

    expect(document.body.textContent).toContain("Session complete · saved on this iPad");
    // The writes were made, on the iPad, before anything waited.
    expect(completedWrites()).toHaveLength(1);
    expect(totalsWrites()).toHaveLength(1);
  });

  it("does not finish a session another iPad already finished: no second totals, no second session write", async () => {
    finishCtl.serverStatus = "Completed";
    await openEndSession();
    await act(async () => finishButton()!.click());
    await settle();
    await settle();

    expect(totalsWrites()).toHaveLength(0);
    expect(completedWrites()).toHaveLength(0);
    expect(document.body.textContent).toContain("already finished on another iPad");
    expect(document.body.textContent).toContain("Session complete");
  });

  it("finishes once when Finish session is tapped twice at once", async () => {
    await openEndSession();
    const button = finishButton()!;
    await act(async () => {
      button.click();
      button.click();
    });
    await settle();
    await settle();

    expect(totalsWrites()).toHaveLength(1);
    expect(completedWrites()).toHaveLength(1);
    expect(document.body.textContent).toContain("Session complete · saved");
    expect(document.body.textContent).not.toContain("saved on this iPad");
  });
});

describe("sign-out sends the sets still waiting on the typing timer first (session record, Sep 26 2026)", () => {
  it("writes a typed set the moment sign-out asks, not after the timer", async () => {
    const { sendSetsNow } = await import("../features/session-record/sign-out-check");
    const host = await mount(<Tracker />);
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(reps!, "11");
      reps!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const setWrites = () => writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.reps === "11");
    // Still on the typing timer: nothing written yet.
    expect(setWrites()).toHaveLength(0);
    await act(async () => sendSetsNow());
    expect(setWrites()).toHaveLength(1);
  });
});

describe("the Active Session never draws a blank page (session record, Sep 26 2026)", () => {
  function Bare(props: { clientId: string | null; lookup?: "ready" | "loading" | "failed" | "missing"; setView: any; onRetry?: () => void }) {
    return (
      <WorkoutTrackerView
        clientId={props.clientId}
        clients={[]}
        machines={appWideMachines}
        trainers={[trainer]}
        user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
        setView={props.setView}
        setSelectedClientId={vi.fn()}
        showClientPicker={false}
        setShowClientPicker={vi.fn()}
        onStartNewClientOnboarding={vi.fn()}
        authTrainer={trainer}
        isSyncing={false}
        setIsSyncing={vi.fn()}
        schedules={[]}
        setClientFormData={vi.fn()}
        onOpenInfo={vi.fn()}
        clientLookup={props.lookup}
        onRetryClient={props.onRetry}
      />
    );
  }
  const buttonNamed = (host: HTMLElement, name: string) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === name);

  it("says a client's record couldn't be read, and offers Try again and the Hub", async () => {
    sessionDocs = [];
    const setView = vi.fn();
    const onRetry = vi.fn();
    const host = await mount(<Bare clientId={CLIENT_ID} lookup="failed" setView={setView} onRetry={onRetry} />);
    const panel = host.querySelector('[data-testid="nothing-on-screen"]');
    expect(panel?.getAttribute("data-kind")).toBe("failed");
    expect(panel?.textContent).toContain("Couldn't read this client's record.");
    await act(async () => buttonNamed(host, "Try again")!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => buttonNamed(host, "Back to the Hub")!.click());
    expect(setView).toHaveBeenCalledWith("clients");
  });

  it("says it is opening the record while the client is still loading", async () => {
    sessionDocs = [];
    const host = await mount(<Bare clientId={CLIENT_ID} lookup="loading" setView={vi.fn()} />);
    expect(host.querySelector('[data-testid="nothing-on-screen"]')?.textContent).toContain("Opening the client's record");
  });

  it("with no client and no session, says so and offers a client search", async () => {
    sessionDocs = [];
    const setView = vi.fn();
    const host = await mount(<Bare clientId={null} setView={setView} />);
    const panel = host.querySelector('[data-testid="nothing-on-screen"]');
    expect(panel?.getAttribute("data-kind")).toBe("no-session");
    await act(async () => buttonNamed(host, "Find a client")!.click());
    expect(setView).toHaveBeenCalledWith("client-directory");
  });
});

/* ------------------------------------------------------------------ *
 * Watching another trainer's session (session record, Sep 26 2026)
 * ------------------------------------------------------------------ */

describe("a session another trainer is running opens read-only, and live (session record, Sep 26 2026)", () => {
  /** AJ's session with Judy, running on AJ's iPad. This iPad is Jane's (JC). */
  const ajsSession = (over: Record<string, unknown> = {}) => [
    {
      id: SESSION_ID,
      data: () => ({ ...SESSION_DOCS[0].data(), trainerId: "t-aj", trainerInitials: "AJ", ...over }),
    },
  ];
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  /** Another iPad saved something: every sessions listener gets the new state. */
  const emitSessions = async () => {
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.path === "sessions")) l.emit();
    });
    await settle();
  };
  const watching = (host: HTMLElement) => host.querySelector('[data-testid="watching-session"]');
  const stripTakeOver = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Take over");
  const dialogButton = (action: "leave" | "keep-editing") =>
    document.body.querySelector<HTMLButtonElement>(`[data-testid="leave-confirm"] [data-action="${action}"]`);
  const sessionWrites = () => writes.filter((w) => w.path.startsWith("sessions/") || w.path.startsWith("exerciseLogs/"));

  it("says who is running it, draws the grid, and has no Finish, no Now bar and no button in today's column", async () => {
    sessionDocs = ajsSession();
    const host = await mount(<Tracker />);
    expect(watching(host)).toBeTruthy();
    expect(host.textContent).toContain("AJ is running this session on another iPad.");
    expect(host.textContent).toContain("nothing here changes it");
    expect(host.textContent).toContain("Leg Press (Hoist)");
    expect(host.querySelector(".jg-sbar__finish")).toBeNull();
    expect(host.querySelector(".jg-sbar__trash")).toBeNull();
    expect(host.querySelector('input[aria-label="reps to failure"]')).toBeNull();
    // Today's column reads: its cells are not buttons, and never say "Tap to edit".
    expect(host.querySelectorAll("div.jg-today").length).toBeGreaterThan(0);
    expect(host.querySelectorAll("button.jg-today")).toHaveLength(0);
    expect(host.innerHTML).not.toContain("Tap to edit");
    // Watching writes nothing at all.
    expect(sessionWrites()).toEqual([]);
  });

  it("Take over asks first, and Keep watching changes nothing", async () => {
    sessionDocs = ajsSession();
    const host = await mount(<Tracker />);
    await act(async () => stripTakeOver(host)!.click());
    expect(document.body.textContent).toContain("Take over this session?");
    expect(document.body.textContent).toContain("AJ is running Judy's session on another iPad.");
    await act(async () => dialogButton("keep-editing")!.click());
    expect(watching(host)).toBeTruthy();
    expect(sessionWrites()).toEqual([]);
  });

  it("taking over makes it this iPad's to record: the session gets this trainer, and keeps who started it", async () => {
    sessionDocs = ajsSession();
    const host = await mount(<Tracker />);
    await act(async () => stripTakeOver(host)!.click());
    await act(async () => dialogButton("leave")!.click());
    await settle();

    const takeOver = writes.find((w) => w.path === `sessions/${SESSION_ID}` && w.data?.trainerId);
    expect(takeOver?.data).toMatchObject({
      trainerId: "t-doc",
      trainerName: "Jane Coach",
      trainerInitials: "JC",
      // The fixture predates startedByTrainerId: the trainer replaced is the one who started it.
      startedByTrainerId: "t-aj",
    });
    expect(takeOver?.data).toHaveProperty("lastHeartbeatAt");
    // Recording here now.
    expect(watching(host)).toBeNull();
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(localStorage.getItem("max_strength_active_session_id")).toBe(SESSION_ID);
    // A snapshot that has not caught up with the take-over does not hand it back.
    await emitSessions();
    expect(watching(host)).toBeNull();
  });

  it("a session taken over on another iPad turns this one to watching, and what was typed here is sent first", async () => {
    localStorage.setItem("max_strength_active_session_id", SESSION_ID);
    const host = await mount(<Tracker />);
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(reps!, "11");
      reps!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const typed = () => writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.reps === "11");
    expect(typed()).toHaveLength(0); // still on the typing timer

    sessionDocs = ajsSession();
    await emitSessions();

    expect(typed()).toHaveLength(1);
    expect(watching(host)).toBeTruthy();
    expect(host.textContent).toContain("AJ took over this session on another iPad.");
    expect(host.querySelector(".jg-sbar__finish")).toBeNull();
    // The device no longer points at a session that is not this trainer's.
    expect(localStorage.getItem("max_strength_active_session_id")).toBeNull();
  });

  it("says so when the session being watched is finished, and stops watching", async () => {
    sessionDocs = ajsSession();
    const host = await mount(<Tracker />);
    expect(watching(host)).toBeTruthy();
    sessionDocs = ajsSession({ status: "Completed" });
    await emitSessions();
    expect(watching(host)).toBeNull();
    expect(document.body.textContent).toContain("AJ finished the session.");
    expect(sessionWrites()).toEqual([]);
  });

  it("says so when the session being watched is discarded, or goes quiet for an hour", async () => {
    sessionDocs = ajsSession();
    const host = await mount(<Tracker />);
    sessionDocs = [];
    await emitSessions();
    expect(watching(host)).toBeNull();
    expect(document.body.textContent).toContain("The session was discarded on another iPad.");

    sessionDocs = ajsSession();
    const again = await mount(<Tracker />);
    expect(watching(again)).toBeTruthy();
    sessionDocs = ajsSession({ lastHeartbeatAt: TWENTY_TWO_HOURS_AGO, createdAt: TWENTY_TWO_HOURS_AGO });
    await emitSessions();
    expect(watching(again)).toBeNull();
    expect(document.body.textContent).toContain("Nothing has been saved in this session for over an hour.");
    // Nothing is claimed discarded that was not, and watching wrote nothing.
    expect(sessionWrites()).toEqual([]);
  });

  it("watches a remembered session someone else now runs, and forgets it", async () => {
    sessionDocs = [];
    localStorage.setItem("max_strength_active_session_id", "sess-other");
    singleDocs["sessions/sess-other"] = {
      ...SESSION_DOCS[0].data(),
      trainerId: "t-aj",
      trainerInitials: "AJ",
      createdAt: new Date(),
    };
    const host = await mount(<Tracker />);
    await settle();
    expect(watching(host)).toBeTruthy();
    expect(localStorage.getItem("max_strength_active_session_id")).toBeNull();
  });

  it("resuming another trainer's abandoned session takes it over", async () => {
    sessionDocs = [{ id: STALE_ID, data: () => ({ ...STALE_SESSION_DOCS[0].data(), trainerId: "t-aj", trainerInitials: "AJ" }) }];
    const host = await mount(<Tracker />);
    expect(document.body.textContent).toContain("Resuming it makes it yours to finish.");
    const resume = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Resume it");
    await act(async () => resume!.click());
    const write = writes.find((w) => w.path === `sessions/${STALE_ID}`);
    expect(write?.data).toMatchObject({ trainerId: "t-doc", trainerInitials: "JC", startedByTrainerId: "t-aj" });
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(watching(host)).toBeNull();
  });

  it("an open session: this trainer's own is recorded, another trainer's is watched", async () => {
    function Open() {
      return (
        <WorkoutTrackerView
          clientId={null}
          clients={[]}
          machines={appWideMachines}
          trainers={[trainer]}
          user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
          setView={vi.fn()}
          setSelectedClientId={vi.fn()}
          showClientPicker={false}
          setShowClientPicker={vi.fn()}
          onStartNewClientOnboarding={vi.fn()}
          authTrainer={trainer}
          isSyncing={false}
          setIsSyncing={vi.fn()}
          schedules={[]}
          setClientFormData={vi.fn()}
          onOpenInfo={vi.fn()}
        />
      );
    }
    const open = (trainerId: string, initials: string) => [
      {
        id: "sess-open",
        data: () => ({
          isUnassigned: true,
          status: "In-Progress",
          trainerId,
          trainerInitials: initials,
          hostedAtStudioId: STUDIO_ID,
          sessionMachineIds: ["m-leg-press"],
          startTime: new Date(),
          lastHeartbeatAt: new Date(),
        }),
      },
    ];
    sessionDocs = open("t-aj", "AJ");
    const theirs = await mount(<Open />);
    expect(watching(theirs)).toBeTruthy();
    expect(theirs.textContent).toContain("Open session");
    expect(theirs.textContent).toContain("AJ is running this session");

    sessionDocs = open("t-doc", "JC");
    const mine = await mount(<Open />);
    expect(watching(mine)).toBeNull();
    expect(mine.querySelector(".jg-sbar__finish")).toBeTruthy();
  });
});
