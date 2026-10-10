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
import { StrictMode, act, useState } from "react";
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
/** Journal entries written during the test (addDoc), served back to every journalEntries listener. */
let journalDocs: { id: string; data: () => any }[] = [];
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

/** Every write, and which batch it went in (0 for a write outside a batch), so a test can say "in the Start batch". */
const writes: { path: string; data: any; merge?: boolean; batch?: number }[] = [];
let batchCount = 0;
/**
 * Every listener the screen opened, so a test can send it a new snapshot
 * (another iPad's write). `live` turns false when the screen unsubscribes,
 * so a test can count the listeners still open (machine menu, Oct 2026).
 */
const snapshotListeners: { path: string; emit: () => void; live: boolean; where?: { field: string; value: unknown }[] }[] = [];
/** Finish's database, per test (session record, Sep 26 2026): does the commit answer, and what does the server say the session is? */
const finishCtl = { commit: "ok" as "ok" | "hang", serverStatus: undefined as string | undefined };
/**
 * The speed round's database (Oct 5 2026, R9): `hang` makes EVERY write's
 * answer never come (offline: the write is on the iPad, the database never
 * answers); `hold` keeps a collection's listeners unanswered until the test
 * calls `release`; `routines` is the client's routines; `deletes` every
 * batch delete.
 */
const netCtl = {
  hang: false,
  hold: new Set<string>(),
  held: {} as Record<string, (() => void)[]>,
  release(path: string) {
    netCtl.hold.delete(path);
    for (const emit of netCtl.held[path] ?? []) emit();
    delete netCtl.held[path];
  },
  routines: [] as { id: string; data: () => any }[],
  /** The session's sets already on record (the Wrap-up's Next time reads what was performed). */
  logs: [] as { id: string; data: () => any }[],
  moreSettings: [] as { id: string; data: () => any }[],
  /** Leave out the client's leg-press settings (a first time on it: no weight on file). */
  noBaseSettings: false,
  /** More machines on the studio's floor. */
  moreRoster: [] as { id: string; data: () => any }[],
  deletes: [] as string[],
  autoId: 0,
  /** Collections whose listeners answer from the iPad's cache (`fromCache: true`). */
  fromCache: new Set<string>(),
  /** Collections whose listeners fail (a refused or broken read). */
  fail: new Set<string>(),
  /** While true, a batch's commit waits for the test to refuse it (`refusals`). */
  refuseLater: false,
  refusals: [] as ((e: unknown) => void)[],
  /** The iPad's own copy can't be read (getDocsFromCache throws). */
  cacheFails: false,
  /** The sessions listeners hold only the sessions their equality clauses name (clientId, isUnassigned, ...). */
  filterSessions: false,
  /** While set, a read of the session's sets (the iPad's copy and the server's) waits on it (Who's this?, Oct 9 2026). */
  readGate: null as Promise<void> | null,
  /** The iPad's copy holds none of the session's sets (they were typed on another iPad). */
  cacheEmpty: false,
  /** How many times the SERVER was asked for a session's sets (`getDocs` on exerciseLogs). */
  serverLogReads: 0,
  /** While set, the SERVER's answer to a read of a client's settings (`getDocs`) waits on it (Assign, Oct 9 2026). */
  settingsServerGate: null as Promise<void> | null,
};
const never = () => new Promise<any>(() => {});

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");

  const docsFor = (p: string) => {
    if (p === "machines") return CATALOG_DOCS;
    if (p === `studios/${STUDIO_ID}/roster`) return [...ROSTER_DOCS, ...netCtl.moreRoster];
    if (p === "sessions") return sessionDocs;
    if (p === "clientMachineSettings") return [...(netCtl.noBaseSettings ? [] : SETTINGS_DOCS), ...netCtl.moreSettings];
    if (p === "journalEntries") return journalDocs;
    if (p === "routines") return netCtl.routines;
    if (p === "exerciseLogs") return netCtl.logs;
    return [];
  };

  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    // doc(collectionRef) makes an id on the iPad, as Firestore does.
    doc: (first: any, ...parts: string[]) => {
      if (first && typeof first.__path === "string" && parts.length === 0) {
        const id = `auto-${++netCtl.autoId}`;
        return { __path: `${first.__path}/${id}`, id };
      }
      const p = path(...parts);
      return { __path: p, id: p.split("/").pop() };
    },
    // The query keeps its where clauses, so a test can ask which studio a listener reads (Oct 9 2026).
    query: (coll: any, ...clauses: any[]) => ({ ...coll, __where: clauses.filter((c) => c && "field" in c) }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => ({}),
    // Both call shapes (KNOWN-TRAPS): (query, next, error) and, since the
    // logs listener asks for metadata changes (machine menu, Oct 2026),
    // (query, options, next, error). Each snapshot is the server's answer.
    onSnapshot: (q: any, a: any, b: any, c: any) => {
      const next = typeof a === "function" || typeof a?.next === "function" ? a : b;
      const cb = typeof next === "function" ? next : next?.next;
      const fail = typeof next === "function" ? (next === a ? b : c) : next?.error;
      const at = q?.__path ?? "";
      if (netCtl.fail.has(at)) {
        fail?.(Object.assign(new Error("refused"), { code: "permission-denied" }));
        return () => {};
      }
      const emit = () => {
        // Opt in: the sessions a query names by equality, as Firestore answers it (Who's this?, Oct 9 2026).
        const docs =
          netCtl.filterSessions && at === 'sessions'
            ? docsFor(at).filter((d: any) =>
                (q?.__where ?? []).every((w: any) => Array.isArray(w.value) || d.data()?.[w.field] === w.value),
              )
            : docsFor(at);
        // Both shapes: the briefing (mounted since the Sep 24 tests) also
        // listens to single documents, which answer exists()/data().
        const single = singleDocs[at];
        cb?.({
          docs,
          size: docs.length,
          empty: docs.length === 0,
          forEach: (f: any) => docs.forEach(f),
          docChanges: () => docs.map((doc: any) => ({ type: "added", doc })),
          metadata: { fromCache: netCtl.fromCache.has(at), hasPendingWrites: false },
          id: String(at).split("/").pop(),
          exists: () => single !== undefined,
          data: () => single,
        });
      };
      if (netCtl.hold.has(at)) (netCtl.held[at] ??= []).push(emit);
      else emit();
      const listener = { path: at, emit, live: true, where: q?.__where };
      snapshotListeners.push(listener);
      return () => {
        listener.live = false;
      };
    },
    getDocs: async (q: any) => {
      if (q?.__path === "exerciseLogs") {
        netCtl.serverLogReads += 1;
        if (netCtl.readGate) await netCtl.readGate;
      }
      if (q?.__path === "clientMachineSettings" && netCtl.settingsServerGate) await netCtl.settingsServerGate;
      const docs = docsFor(q?.__path ?? "");
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (f: any) => docs.forEach(f) };
    },
    // The iPad's own copy (Who's this?, the open session round, Oct 9 2026): what the database holds, at once.
    getDocsFromCache: async (q: any) => {
      if (netCtl.readGate) await netCtl.readGate;
      if (netCtl.cacheFails) throw new Error("the iPad's copy could not be read");
      const docs = netCtl.cacheEmpty ? [] : docsFor(q?.__path ?? "");
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (f: any) => docs.forEach(f) };
    },
    getDoc: async (ref: any) => {
      const data = singleDocs[ref?.__path ?? ""];
      return data
        ? { exists: () => true, id: String(ref.__path).split("/").pop(), data: () => data }
        : { exists: () => false, data: () => undefined };
    },
    // A journal entry lands in the local stream at once, as Firestore's own
    // cache does, and then the write answers with its id.
    addDoc: async (coll: any, data: any) => {
      if (coll?.__path !== "journalEntries") return { id: "new-doc" };
      const id = `j-${journalDocs.length + 1}`;
      journalDocs = [...journalDocs, { id, data: () => data }];
      snapshotListeners.filter((l) => l.path === "journalEntries").forEach((l) => l.emit());
      if (netCtl.hang) return never();
      return { id };
    },
    setDoc: (ref: any, data: any, opts?: any) => {
      writes.push({ path: ref.__path, data, merge: !!opts?.merge });
      return netCtl.hang ? never() : Promise.resolve();
    },
    updateDoc: (ref: any, data: any) => {
      writes.push({ path: ref.__path, data });
      return netCtl.hang ? never() : Promise.resolve();
    },
    deleteDoc: async () => {},
    writeBatch: () => {
      const batch = ++batchCount;
      return {
        set: (ref: any, data: any, opts?: any) =>
          writes.push({ path: ref.__path, data, merge: !!opts?.merge, batch }),
        update: (ref: any, data: any) => writes.push({ path: ref.__path, data, batch }),
        delete: (ref: any) => netCtl.deletes.push(ref.__path),
        commit: () =>
          netCtl.refuseLater
            ? new Promise<void>((_, refuse) => netCtl.refusals.push(refuse))
            : finishCtl.commit === "hang" || netCtl.hang
              ? new Promise<void>(() => {})
              : Promise.resolve(),
      };
    },
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

/* The briefing's plan card reads head office's starting routines and the
   studio's choice (the first-session design round, Oct 8 2026): none in the
   app, so the Academy's eleven, and no choice of the studio's own. */
vi.mock("../features/routine-plan/starting-store", () => ({
  readStartingRoutines: () => Promise.resolve({ routines: [], known: true }),
  readStartingChoice: () => Promise.resolve({ use: null, defaultId: null }),
}));

/** The studio list the context hands out; a test may give the studios cutover days. */
const studioCtx = vi.hoisted(() => ({
  studios: undefined as undefined | { id: string; journeyCutoverDate?: string }[],
  /** The iPad's studio; a test may switch it (the open session round, Oct 9 2026). */
  activeStudioId: undefined as undefined | string,
}));

/*
 * Render counters (speed round, Oct 5 2026; R10). The tracker calls
 * useSendState once per render of its own (the machine menu's call is only
 * while the menu is open), so counting the calls counts the tracker's
 * renders; toJourneyRows is what rebuilds every row of the grid.
 */
const renders = vi.hoisted(() => ({ tracker: 0, rows: 0 }));
vi.mock("../features/session-record/useSendState", async (importOriginal) => {
  const realMod = await importOriginal<typeof import("../features/session-record/useSendState")>();
  return {
    ...realMod,
    useSendState: (...args: Parameters<typeof realMod.useSendState>) => {
      renders.tracker += 1;
      return realMod.useSendState(...args);
    },
  };
});
vi.mock("../features/journey-grid", async (importOriginal) => {
  const realMod = await importOriginal<typeof import("../features/journey-grid")>();
  return {
    ...realMod,
    toJourneyRows: (...args: Parameters<typeof realMod.toJourneyRows>) => {
      renders.rows += 1;
      return realMod.toJourneyRows(...args);
    },
  };
});

/* The session corner's menu (the first-session design round, Oct 8 2026):
   Base UI's menu does not open in jsdom (its positioning never settles), so
   it is drawn as a plain menu that opens on a tap and closes on a pick. The
   corner is the only dropdown in this screen's tree. */
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  const h = React.createElement;
  const Ctx = React.createContext<{ open: boolean; set: (open: boolean) => void }>({ open: false, set: () => {} });
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => {
      const [open, set] = React.useState(false);
      return h(Ctx.Provider, { value: { open, set } }, children);
    },
    DropdownMenuTrigger: ({ children, className, ...rest }: Record<string, any>) => {
      const c = React.useContext(Ctx);
      return h(
        "button",
        { type: "button", className, "aria-label": rest["aria-label"], "data-testid": rest["data-testid"], onClick: () => c.set(!c.open) },
        children,
      );
    },
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
      const c = React.useContext(Ctx);
      return c.open ? h("div", { role: "menu" }, children) : null;
    },
    DropdownMenuItem: ({ children, onClick, disabled, ...rest }: Record<string, any>) => {
      const c = React.useContext(Ctx);
      return h(
        "div",
        {
          role: "menuitem",
          "data-testid": rest["data-testid"],
          "aria-disabled": disabled,
          onClick: () => {
            if (disabled) return;
            onClick?.();
            c.set(false);
          },
        },
        children,
      );
    },
  };
});

vi.mock("../contexts/ActiveStudioContext", async (importOriginal) => {
  const realMod = await importOriginal<any>();
  return { ...realMod, useActiveStudio: () => ({ activeStudioId: studioCtx.activeStudioId ?? STUDIO_ID, studios: studioCtx.studios }) };
});

import { WorkoutTrackerView } from "./WorkoutTrackerView";
import { announceOpenSessionRefused, declinedStaleOpenSessions } from "../features/open-session/start";
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
  netCtl.hang = false;
  netCtl.hold = new Set();
  netCtl.held = {};
  netCtl.routines = [];
  netCtl.logs = [];
  netCtl.moreSettings = [];
  netCtl.noBaseSettings = false;
  netCtl.moreRoster = [];
  netCtl.deletes = [];
  netCtl.fromCache = new Set();
  netCtl.fail = new Set();
  netCtl.refuseLater = false;
  netCtl.refusals = [];
  netCtl.cacheFails = false;
  netCtl.filterSessions = false;
  netCtl.readGate = null;
  netCtl.cacheEmpty = false;
  netCtl.serverLogReads = 0;
  netCtl.settingsServerGate = null;
  setViewSpy.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  sessionDocs = SESSION_DOCS;
  journalDocs = [];
  singleDocs = {};
  localStorage.clear();
  studioCtx.studios = undefined;
  studioCtx.activeStudioId = undefined;
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

/** Where the screen sent the trainer (the Hub is "clients"). */
const setViewSpy = vi.fn();

function Tracker({ who = client }: { who?: Client } = {}) {
  return (
    <WorkoutTrackerView
      clientId={CLIENT_ID}
      clients={[who]}
      machines={appWideMachines}
      trainers={[trainer]}
      user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
      setView={setViewSpy}
      setSelectedClientId={vi.fn()}
      authTrainer={trainer}
      isSyncing={false}
      setIsSyncing={vi.fn()}
      schedules={[]}
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

  it("holds ONE journal listener while a session runs, not three (machine menu design §F 8)", async () => {
    await mount(<Tracker />);
    const open = snapshotListeners.filter((l) => l.live && l.path === "journalEntries");
    expect(open).toHaveLength(1);
  });

  it("keeps the client's listeners open when the studio's client list changes (the iPad round, Oct 6 2026)", async () => {
    // Any client document at the studio changing gives the screen a new
    // `clients` array. It used to close and reopen the sessions, routines and
    // settings listeners every time.
    await mount(<Tracker />);
    const opened = (p: string) => snapshotListeners.filter((l) => l.path === p).length;
    const before = { sessions: opened("sessions"), routines: opened("routines"), settings: opened("clientMachineSettings") };
    expect(before.sessions).toBeGreaterThan(0);
    const { root } = mounted[mounted.length - 1];
    await act(async () => {
      root.render(
        <StrictMode>
          <ToastProvider>
            <Tracker who={{ ...client, lastName: "Changed" } as Client} />
          </ToastProvider>
        </StrictMode>,
      );
    });
    expect({ sessions: opened("sessions"), routines: opened("routines"), settings: opened("clientMachineSettings") }).toEqual(before);
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
    // A cutover is trusted in one direction only: a first session BEFORE it
    // proves she was training there before Journey (the cost plan, A6, Sep 26
    // 2026, took away the other direction). Her Mindbody count says new, so
    // only the cutover can take her number away - and only her HOME's may.
    const who = {
      ...client,
      homeStudioId: "westlake",
      firstSessionDate: "2026-03-02",
      clientsNumberOfVisitsAtSite: 3,
    } as Client;

    // The iPad is at Solon, which moved over later than her first session;
    // her home, Westlake, has no cutover. Judged by her home, the count
    // stands and the number is hers.
    studioCtx.studios = [{ id: STUDIO_ID, journeyCutoverDate: "2026-06-01" }, { id: "westlake" }];
    const host = await mount(<Tracker who={who} />);
    expect(barNumber(host)).toBe("#12");

    // Her HOME moved over after her first session: she predates Journey there,
    // so there is no number, whatever the iPad's studio says.
    studioCtx.studios = [{ id: STUDIO_ID }, { id: "westlake", journeyCutoverDate: "2026-06-01" }];
    const other = await mount(<Tracker who={who} />);
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

  it("asks for a note for the next trainer, and says it reaches the next four briefings (voice-review round; the floor round's F3)", async () => {
    await openEndSession();
    const label = Array.from(document.querySelectorAll("label")).find((l) =>
      l.textContent?.includes("Note for the next trainer"),
    );
    expect(label).toBeDefined();
    const box = document.getElementById(label!.getAttribute("for")!);
    expect(box?.tagName).toBe("TEXTAREA");
    expect(document.getElementById(box!.getAttribute("aria-describedby")!)?.textContent).toBe("On the next four briefings.");
    // "Wrap-up" is the post-session screen's name now, not this box's.
    expect(document.body.textContent).not.toContain("Wrap-up note");
  });

  // The floor round, Oct 9 2026: F3, one line with the client's name in it; F6, the question opens on
  // that line, never on the note box, whose focus raises the iPad's keyboard over Finish session.
  it("asks Finish {name}'s session? and opens on that line, not on the note box", async () => {
    await openEndSession();
    const title = Array.from(document.querySelectorAll("h3")).find((h) => /^Finish .+'s session\?$/.test(h.textContent ?? ""));
    expect(title).toBeDefined();
    await act(async () => {});
    expect(document.activeElement).toBe(title);
    expect(document.activeElement?.id).not.toBe("next-trainer-note");
    expect(document.body.textContent).not.toContain("conclude this");
    expect(document.body.textContent).not.toContain("Abort session");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Scrap session")).toBe(true);
  });

  it("brings the Note for the next trainer back on the Wrap-up to be filed, labelled, and never discarded (AJ, Sep 27 2026)", async () => {
    await openEndSession();
    const box = document.getElementById("next-trainer-note") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "  Knee sore after the move.  ");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => finishButton()!.click());
    await settle();
    await settle();

    // Finish wrote it to the session and to the journal as a Heads up.
    expect(completedWrites()[0].data.notes).toBe("Knee sore after the move.");
    expect(journalDocs).toHaveLength(1);
    expect(journalDocs[0].data()).toMatchObject({
      body: "Knee sore after the move.",
      importance: "elevated",
      kind: "general",
      origin: "post_session",
      sessionId: SESSION_ID,
    });

    // It is back on the Wrap-up, in the To-file tray: said for what it is,
    // fileable, and with no Discard (a discard would take it off the briefing).
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    const card = document.querySelector('[data-testid="sweep-j-1"]')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Note for the next trainer · on the next briefing");
    const buttons = Array.from(card.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(buttons).toContain("Preference");
    expect(buttons.some((t) => t?.includes("Discard"))).toBe(false);
  });

  it("files the Note for the next trainer as it is written when a kind is picked, so it never waits in the tray (Oct 3 2026)", async () => {
    await openEndSession();
    // Nothing typed: no extra row.
    expect(document.querySelector('[data-testid="next-trainer-file-as"]')).toBeNull();
    const box = document.getElementById("next-trainer-note") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Mentioned she may not renew in May.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const row = document.querySelector('[data-testid="next-trainer-file-as"]')!;
    expect(row).toBeTruthy();
    const retention = Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Retention")!;
    await act(async () => retention.click());
    await act(async () => finishButton()!.click());
    await settle();
    await settle();

    expect(journalDocs).toHaveLength(1);
    expect(journalDocs[0].data()).toMatchObject({
      body: "Mentioned she may not renew in May.",
      importance: "elevated",
      kind: "retention",
      category: null,
      origin: "post_session",
    });
    // Filed already, so the Wrap-up's tray has nothing to ask about it.
    expect(document.querySelector('[data-testid="sweep-j-1"]')).toBeNull();
  });

  it("offline, goes straight to the Wrap-up and says the session is saved on this iPad", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    finishCtl.commit = "hang"; // offline, the database never answers
    await openEndSession();
    await act(async () => finishButton()!.click());
    await settle();
    await settle();

    expect(document.body.textContent).toContain("Wrap-up · session saved on this iPad");
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
    expect(document.body.textContent).toContain("Wrap-up · session saved");
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
    expect(document.body.textContent).toContain("Wrap-up · session saved");
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
        authTrainer={trainer}
        isSyncing={false}
        setIsSyncing={vi.fn()}
        schedules={[]}
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

  /* The first-session design round (Oct 8 2026): a walk-in started with
     nothing chosen records an EMPTY list and no routine, and AJ's iPad runs
     it empty. The watching iPad draws the same (watch.ts follows the
     tracker's seeding rule), never every floor machine as today's routine. */
  it("watching a session started with nothing chosen draws no machine, never the whole floor", async () => {
    sessionDocs = ajsSession({ routineId: null, sessionMachineIds: [] });
    const host = await mount(<Tracker />);
    expect(watching(host)).toBeTruthy();
    expect(host.textContent).not.toContain("Leg Press (Hoist)");
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
          authTrainer={trainer}
          isSyncing={false}
          setIsSyncing={vi.fn()}
          schedules={[]}
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

/* ------------------------------------------------------------------ *
 * The open session (the open session round, Oct 9 2026; findings 2 and 6)
 * ------------------------------------------------------------------ */

describe("an open session on the Active Session (the open session round, Oct 9 2026)", () => {
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
        authTrainer={trainer}
        isSyncing={false}
        setIsSyncing={vi.fn()}
        schedules={[]}
      />
    );
  }
  /** An open session of Jane's (JC), started the way Open session starts one now. */
  const openDoc = (id: string, machineIds: string[], minsAgo = 0) => ({
    id,
    data: () => ({
      isUnassigned: true,
      status: "In-Progress",
      trainerId: "t-doc",
      startedByTrainerId: "t-doc",
      trainerInitials: "JC",
      hostedAtStudioId: STUDIO_ID,
      sessionMachineIds: machineIds,
      startTime: new Date(Date.now() - minsAgo * 60_000),
      lastHeartbeatAt: new Date(Date.now() - minsAgo * 60_000),
    }),
  });
  const openSessionListeners = () =>
    snapshotListeners.filter(
      (l) => l.path === "sessions" && (l.where ?? []).some((w) => w.field === "isUnassigned" && w.value === true),
    );
  const studioOf = (l: { where?: { field: string; value: unknown }[] }) =>
    (l.where ?? []).find((w) => w.field === "hostedAtStudioId")?.value;

  it("draws no Notes and no Pulse: both need a client, and were buttons that opened nothing", async () => {
    sessionDocs = [openDoc("sess-open", ["m-leg-press"])];
    const host = await mount(<Open />);
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(host.querySelector('button[aria-label="Session notes"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Open the Pulse"]')).toBeNull();
  });

  it("a client's session still has both", async () => {
    const host = await mount(<Tracker />);
    expect(host.querySelector('button[aria-label="Session notes"]')).toBeTruthy();
    expect(host.querySelector('button[aria-label="Open the Pulse"]')).toBeTruthy();
  });

  it("follows a studio switch: the old studio's query closes and the new studio's opens", async () => {
    sessionDocs = [openDoc("sess-open", ["m-leg-press"])];
    await mount(<Open />);
    const before = openSessionListeners().filter((l) => l.live);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((l) => studioOf(l) === STUDIO_ID)).toBe(true);

    studioCtx.activeStudioId = "westlake";
    const { root } = mounted[mounted.length - 1];
    await act(async () => {
      root.render(
        <StrictMode>
          <ToastProvider>
            <Open />
          </ToastProvider>
        </StrictMode>,
      );
    });
    const live = openSessionListeners().filter((l) => l.live);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((l) => studioOf(l) === "westlake")).toBe(true);
    expect(before.every((l) => !l.live)).toBe(true);
  });

  it("records the open session the device remembers, not an older one of the same trainer's listed first", async () => {
    // An older open session (one machine) and the one just started (two).
    sessionDocs = [openDoc("sess-old", ["m-leg-press"], 20), openDoc("sess-new", ["m-leg-press", "sm-solon-rear-delt"])];
    localStorage.setItem("max_strength_active_session_id", "sess-new");
    const host = await mount(<Open />);
    expect(host.querySelector('[aria-label="0 of 2 machines logged"]')).toBeTruthy();
  });

  it("never takes up an abandoned open session of this trainer's without asking, even remembered (Sep 24 2026)", async () => {
    // Its heartbeat is two hours old: sets typed now would go under its day.
    sessionDocs = [openDoc("sess-abandoned", ["m-leg-press"], 120)];
    localStorage.setItem("max_strength_active_session_id", "sess-abandoned");
    const host = await mount(<Open />);
    expect(host.querySelector('[data-testid="nothing-on-screen"]')?.getAttribute("data-kind")).toBe("no-session");
    expect(host.querySelector(".jg-sbar__finish")).toBeNull();
  });

  it("says it is opening the session until the studio's open sessions answer, never 'No session is open here'", async () => {
    sessionDocs = [openDoc("sess-open", ["m-leg-press"])];
    netCtl.hold.add("sessions");
    const host = await mount(<Open />);
    expect(host.querySelector('[data-testid="nothing-on-screen"]')?.getAttribute("data-kind")).toBe("opening");
    expect(host.textContent).toContain("Opening the session");
    await act(async () => netCtl.release("sessions"));
    expect(host.querySelector('[data-testid="nothing-on-screen"]')).toBeNull();
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * The FileMaker floor (the open session round, Oct 9 2026; AJ's "1b")
 * ------------------------------------------------------------------ */

/**
 * AJ, Oct 9 2026: "i think the open session should honestly feel most like a
 * filemaker session ... you have every machine on the screen and you just
 * fill in the ones you did". An open session, and a client session with no
 * routine, open with the whole floor showing in its walking order, a + on
 * every row; + adds the machine and makes it the one in hand in one tap; it
 * rises into today's numbered group in the order done; and the session
 * records only what was added, never the floor. A session with a routine is
 * as it was: the floor folded under "Not in today's routine".
 */
describe("the FileMaker floor (the open session round, Oct 9 2026)", () => {
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
        authTrainer={trainer}
        isSyncing={false}
        setIsSyncing={vi.fn()}
        schedules={[]}
      />
    );
  }
  const OPEN_ID = "sess-open";
  /** An open session as Open session starts one now: no client, an empty list. */
  const openSession = (machineIds: string[] = []) => [
    {
      id: OPEN_ID,
      data: () => ({
        isUnassigned: true,
        status: "In-Progress",
        trainerId: "t-doc",
        startedByTrainerId: "t-doc",
        trainerInitials: "JC",
        hostedAtStudioId: STUDIO_ID,
        sessionMachineIds: machineIds,
        startTime: new Date(),
        lastHeartbeatAt: new Date(),
      }),
    },
  ];
  /** A third machine on the floor, first in the walking order: Lumbar, which the Academy says never to run straight into the Leg Press. */
  const LUMBAR = {
    id: "m-lumbar",
    data: () => ({ source: "custom", status: "active", order: 5, definition: { name: "Lumbar", settingFields: [] } }),
  };
  const plus = (host: HTMLElement, name: string) =>
    host.querySelector<HTMLButtonElement>(`button.jg-today__add[aria-label="Add ${name} to today's session"]`);
  const pluses = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>("button.jg-today__add")];
  const names = (host: HTMLElement) => [...host.querySelectorAll(".jg-machine__label")].map((n) => n.textContent);
  /** Each numbered row's machine and its circle, top to bottom. */
  const numbered = (host: HTMLElement) =>
    [...host.querySelectorAll(".jg-machine__name")]
      .filter((n) => n.querySelector(".jg-machine__order"))
      .map((n) => `${n.querySelector(".jg-machine__order")!.textContent} ${n.querySelector(".jg-machine__label")!.textContent}`);
  const recordedLists = (sid: string) =>
    writes.filter((w) => w.path === `sessions/${sid}` && Array.isArray(w.data?.sessionMachineIds)).map((w) => w.data.sessionMachineIds);
  const groups = (host: HTMLElement) => [...host.querySelectorAll(".jg-group__label")].map((g) => g.textContent);
  /*
   * One tap, one machine (journey-grid/add-bounce.ts): a second add of
   * another machine inside 400ms is the first tap landing on the row that
   * slid under it, and is let go. A test that adds two machines moves the
   * clock on between them, as a trainer's second tap is.
   */
  const realNow = Date.now;
  let skew = 0;
  beforeEach(() => {
    skew = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
  });
  afterEach(() => {
    vi.mocked(Date.now).mockRestore();
  });
  const later = () => {
    skew += 1_000;
  };

  it("an open session draws every machine on the floor in its walking order, each with the Today column's +", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    expect(names(host)).toEqual(["Lumbar", "Leg Press (Hoist)", "Rear Delt Hoist"]);
    expect(pluses(host).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Add Lumbar to today's session",
      "Add Leg Press (Hoist) to today's session",
      "Add Rear Delt Hoist to today's session",
    ]);
    // No routine to name: the rest of the floor, open, and no label over nothing yet.
    expect(groups(host)).toEqual(["▾ Rest of the floor3"]);
    expect(host.querySelector('[data-testid="session-corner"]')!.textContent).toContain("All machines");
    // The empty Now Bar says where to tap, one line, and keeps Add a machine.
    expect(host.querySelector(".jg-nb__idle")!.textContent).toBe("Tap + on a machine you're doing.");
    expect([...host.querySelectorAll(".jg-nb__addmore")].some((b) => b.textContent?.includes("Add a machine"))).toBe(true);
    // Nothing recorded by opening it.
    expect(recordedLists(OPEN_ID)).toEqual([]);
  });

  it("+ adds the machine and makes it the one in hand in one tap; it rises into today's numbered group in the order done", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Rear Delt Hoist");
    expect(numbered(host)).toEqual(["1 Rear Delt Hoist"]);
    expect(plus(host, "Rear Delt Hoist")).toBeNull();

    later();
    await act(async () => plus(host, "Leg Press (Hoist)")!.click());
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Leg Press (Hoist)");
    // FileMaker's circle: the order done, not the walking order.
    expect(numbered(host)).toEqual(["1 Rear Delt Hoist", "2 Leg Press (Hoist)"]);
    expect(groups(host)).toEqual(["Today2", "▾ Rest of the floor1"]);
    // The rest of the floor stays on screen, in its walking order.
    expect(pluses(host).map((b) => b.getAttribute("aria-label"))).toEqual(["Add Lumbar to today's session"]);
  });

  /* Quick settings (AJ's "2a"): the Now Bar's settings are one button, and
     on a first time it opens the machine card straight on the empty dial,
     on the number pad; Save closes it. A client's session: Set up saves to
     the client. */
  const setupBtn = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-testid="nb-setup"]');
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  const routineLess = () => [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: null, sessionMachineIds: [] }) }];

  it("the Now Bar's Set up opens the card on the first empty dial, and Save closes it, saved to the client", async () => {
    sessionDocs = routineLess();
    netCtl.routines = [];
    const host = await mount(<Tracker />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    const setup = setupBtn(host)!;
    expect(setup.getAttribute("data-kind")).toBe("setup");
    expect(setup.textContent).toBe("Set up· 1 not set");
    await act(async () => setup.click());
    await settle();
    const input = document.querySelector<HTMLInputElement>('.mm-dialog [data-block="settings"] [data-editor="field"] input');
    expect(input).not.toBeNull();
    expect(document.querySelector(".mm-dialog [data-editing] .mm-tile__label")?.textContent).toBe("Seat");
    expect(input!.getAttribute("inputmode")).toBe("decimal");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "12");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...document.querySelectorAll<HTMLButtonElement>(".mm-dialog button")].find((b) => b.textContent === "Save set-up");
    await act(async () => save!.click());
    await settle();
    expect(document.querySelector(".mm-dialog .mm-card")).toBeNull();
    const saved = writes.filter((w) => w.path.startsWith("clientMachineSettings/"));
    expect(saved.map((w) => [w.path, w.data.settings])).toEqual([[`clientMachineSettings/${CLIENT_ID}_sm-solon-rear-delt`, { Seat: "12" }]]);
    // From any other door (the grid's name) the card is the ordinary one: no editor open.
    const nameDoor = [...host.querySelectorAll<HTMLButtonElement>(".jg-machine__btn")].find((b) => b.textContent?.includes("Rear Delt Hoist"));
    await act(async () => nameDoor!.click());
    await settle();
    expect(document.querySelector(".mm-dialog .mm-card")).not.toBeNull();
    expect(document.querySelector(".mm-dialog [data-editor]")).toBeNull();
  });

  /* Changed on purpose (the open session round, Oct 9 2026; AJ's "3a":
     "Settings typed before the client is chosen are kept on the session
     (`sessions/{id}.heldSetup.{machineId}`) and saved to the client at
     Assign"). Until they were held, an open session offered no Set up: its
     settings went to the ghost record nobody reads (finding 4). Now Set up
     is offered, and Save keeps the set-up on the session, never on a
     client. */
  /** The open session as the database holds it: every write to it laid over it, dotted paths and deletes as Firestore applies them. */
  const openSessionWritten = () => [
    {
      id: OPEN_ID,
      data: () => {
        const out: Record<string, any> = { ...openSession()[0].data() };
        for (const w of writes) {
          if (w.path !== `sessions/${OPEN_ID}`) continue;
          for (const [k, v] of Object.entries(w.data ?? {})) {
            if ((v as any)?._methodName === "deleteField") {
              delete out[k];
              continue;
            }
            const [head, ...rest] = k.split(".");
            if (rest.length === 0) out[k] = v;
            else out[head] = { ...(out[head] ?? {}), [rest.join(".")]: v };
          }
        }
        return out;
      },
    },
  ];
  const clientWrites = () =>
    writes.filter((w) => w.path.startsWith("clientMachineSettings/") || /^machines\/[^/]+\/settingHistory\//.test(w.path));

  it("offers Set up in an open session with no client yet, and Save keeps the set-up on the session, never on a client", async () => {
    sessionDocs = openSessionWritten();
    const host = await mount(<Open />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    const setup = setupBtn(host)!;
    // What the session holds is known (it is the session's own record): Set up, and how many dials are empty.
    expect(setup.getAttribute("data-kind")).toBe("setup");
    expect(setup.textContent).toBe("Set up· 1 not set");
    await act(async () => setup.click());
    await settle();
    expect(document.querySelector(".mm-dialog [data-held]")?.textContent).toBe("Kept on this session · saved to the client when you choose them");
    const input = document.querySelector<HTMLInputElement>('.mm-dialog [data-block="settings"] [data-editor="field"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...document.querySelectorAll<HTMLButtonElement>(".mm-dialog button")].find((b) => b.textContent === "Save set-up");
    await act(async () => save!.click());
    await settle();
    // The card closed, and the toast says where the set-up went.
    expect(document.querySelector(".mm-dialog .mm-card")).toBeNull();
    expect(document.body.textContent).toContain("Rear Delt Hoist: set-up kept on this session · saved to the client when you choose them");

    // ONE write, to the session: no client's settings, no history row, no journal copy.
    const kept = writes.filter((w) => w.path === `sessions/${OPEN_ID}` && Object.keys(w.data ?? {}).some((k) => k.startsWith("heldSetup")));
    expect(kept).toHaveLength(1);
    expect(kept[0].batch ?? 0, "its own update, never a batch").toBe(0);
    expect(kept[0].data).toEqual({ "heldSetup.sm-solon-rear-delt": { values: { Seat: "12" }, at: { __server: true }, byUid: "uid-coach" } });
    expect(clientWrites(), "nothing written for a client").toEqual([]);
    expect(journalDocs).toEqual([]);
    expect(writes.some((w) => w.data?.clientId === ""), "no write ever names clientId ''").toBe(false);

    // The Now Bar counts it: the setting itself, nothing left to set.
    expect(setupBtn(host)!.getAttribute("data-kind")).toBe("settings");
    expect(setupBtn(host)!.textContent).toContain("12");
    expect(setupBtn(host)!.textContent).not.toContain("not set");

    // Reopening the card (the grid's name, and again after the database answers) shows what the session keeps.
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "sessions")) l.emit();
    });
    const nameDoor = [...host.querySelectorAll<HTMLButtonElement>(".jg-machine__btn")].find((b) => b.textContent?.includes("Rear Delt Hoist"));
    await act(async () => nameDoor!.click());
    await settle();
    const seat = document.querySelector('.mm-dialog [data-dial="Seat"]');
    expect(seat?.textContent).toContain("12");
    expect(seat?.textContent).not.toContain("Not set");
    expect(document.querySelector('.mm-dialog [data-strip="edit"]')).toBeNull();
  });

  /* The review (Oct 9 2026): only the server's answer says nothing is on
     file. An empty answer from the iPad's cache (a cold cache, offline) is
     not "Set up": a first set-up saved off it would write the client's other
     dials over when it syncs. */
  it("never says Set up off an empty answer from the iPad's cache", async () => {
    sessionDocs = routineLess();
    netCtl.routines = [];
    netCtl.fromCache.add("clientMachineSettings");
    netCtl.noBaseSettings = true;
    const host = await mount(<Tracker />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    const setup = setupBtn(host)!;
    expect(setup.getAttribute("data-kind")).toBe("settings");
    expect(setup.textContent).not.toContain("not set");
  });

  it("records only what was added, in the order done, never the floor, and touches no routine", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    later();
    await act(async () => plus(host, "Leg Press (Hoist)")!.click());
    expect(recordedLists(OPEN_ID)).toEqual([["sm-solon-rear-delt"], ["sm-solon-rear-delt", "m-leg-press"]]);
    expect(writes.filter((w) => w.path.startsWith("routines")), "adding is today only").toEqual([]);
    expect(writes.filter((w) => w.path.startsWith("exerciseLogs")), "an add writes no set").toEqual([]);
  });

  it("a client session with no routine looks the same: the whole floor, a + on every row, and the same empty Now Bar", async () => {
    sessionDocs = [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: null, sessionMachineIds: [] }) }];
    netCtl.routines = [];
    const host = await mount(<Tracker />);
    expect(names(host)).toEqual(["Leg Press (Hoist)", "Rear Delt Hoist"]);
    expect(pluses(host)).toHaveLength(2);
    expect(groups(host)).toEqual(["▾ Rest of the floor2"]);
    expect(host.querySelector(".jg-nb__idle")!.textContent).toBe("Tap + on a machine you're doing.");
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Rear Delt Hoist");
    expect(recordedLists(SESSION_ID).at(-1)).toEqual(["sm-solon-rear-delt"]);
  });

  it("a session with a routine is as it was: the floor folded under 'Not in today's routine', its + one tap away, and + still adds and focuses", async () => {
    sessionDocs = [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: "ra-1", sessionMachineIds: ["m-leg-press"] }) }];
    netCtl.routines = [{ id: "ra-1", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"] }) }];
    const host = await mount(<Tracker />);
    expect(names(host)).toEqual(["Leg Press (Hoist)"]);
    expect(pluses(host)).toHaveLength(0);
    expect(groups(host)).toEqual(["▸ Not in today's routine1"]);
    await act(async () => (host.querySelector('.jg-group[aria-label="Not in today\'s routine"]') as HTMLElement).click());
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Rear Delt Hoist");
    expect(numbered(host)).toEqual(["1 Leg Press (Hoist)", "2 Rear Delt Hoist"]);
    expect(writes.filter((w) => w.path.startsWith("routines"))).toEqual([]);
  });

  /*
   * The order line before this round kept quiet for any session with no
   * routine whose today ran the whole floor (`runsWholeFloor`), because an
   * old Free session ran the floor in its walking order and nobody chose
   * it. On the FileMaker floor the trainer chooses every machine and its
   * place, so the line speaks even when every machine on the floor was
   * added (`ranWholeFloorUnchosen`).
   */
  it("the order line speaks for what was added, even when every machine on the floor was added", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    const line = () => host.querySelector('ul[aria-label="Today\'s order"]');
    await act(async () => plus(host, "Lumbar")!.click());
    expect(line(), "one machine is never an order").toBeNull();
    later();
    await act(async () => plus(host, "Leg Press (Hoist)")!.click());
    expect(line(), "Lumbar straight into the Leg Press is said").not.toBeNull();
    expect(line()!.textContent).toContain("Lumbar directly into Leg Press");
    later();
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    // The whole floor is in today's list now, in the order the trainer chose.
    expect(pluses(host)).toHaveLength(0);
    expect(recordedLists(OPEN_ID).at(-1)).toEqual(["m-lumbar", "m-leg-press", "sm-solon-rear-delt"]);
    expect(line(), "the whole floor, chosen, still says its order").not.toBeNull();
    expect(line()!.textContent).toContain("Lumbar directly into Leg Press");
  });

  it("one tap, one machine: a second tap landing at once on the row that slid under it adds nothing", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    later();
    await act(async () => plus(host, "Leg Press (Hoist)")!.click());
    // The same tap again, before the trainer could have meant it: Lumbar, the row above, slid into that slot.
    await act(async () => plus(host, "Lumbar")!.click());
    expect(recordedLists(OPEN_ID).at(-1)).toEqual(["sm-solon-rear-delt", "m-leg-press"]);
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Leg Press (Hoist)");
    expect(plus(host, "Lumbar"), "Lumbar is still on the floor, one tap away").not.toBeNull();
    // A moment later it is a new tap, and adds.
    later();
    await act(async () => plus(host, "Lumbar")!.click());
    expect(recordedLists(OPEN_ID).at(-1)).toEqual(["sm-solon-rear-delt", "m-leg-press", "m-lumbar"]);
  });

  it("a machine out of service on the roster is on the floor, says so, and has no +", async () => {
    netCtl.moreRoster = [{ id: LUMBAR.id, data: () => ({ ...LUMBAR.data(), status: "maintenance" }) }];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    expect(names(host)).toEqual(["Lumbar", "Leg Press (Hoist)", "Rear Delt Hoist"]);
    expect(plus(host, "Lumbar")).toBeNull();
    expect(pluses(host)).toHaveLength(2);
    const cell = host.querySelector('[aria-label="Lumbar: out of service"]');
    expect(cell?.textContent).toBe("Out of service");
  });

  it("the floor says Today, never routine: the corner, its menu and each idle cell", async () => {
    sessionDocs = openSession();
    const host = await mount(<Open />);
    expect(host.querySelector('[aria-label="Rear Delt Hoist: not added today"]')).not.toBeNull();
    expect(host.querySelector('[aria-label*="not in today\'s routine"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="session-corner"]')!.click());
    const routineItem = host.querySelector('[data-testid="session-corner-routine"]')!;
    expect(routineItem.textContent).toContain("Today");
    expect(routineItem.textContent).not.toContain("routine");
    expect(host.querySelector('[data-testid="session-corner-reorder"]')!.textContent).toBe("Reorder today");
    // Folded from the corner, the corner says Today.
    await act(async () => host.querySelector<HTMLElement>('[data-testid="session-corner-routine"]')!.click());
    expect(host.querySelector(".jg-corner__title")!.textContent).toBe("Today");
    expect(pluses(host)).toHaveLength(0);
  });

  it("for a client, the floor waits until the client's routines are known (a routine may still come)", async () => {
    sessionDocs = [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: null, sessionMachineIds: [] }) }];
    netCtl.routines = [];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    expect(pluses(host)).toHaveLength(0);
    expect(groups(host)).toEqual(["▸ Not in today's routine2"]);
    await act(async () => netCtl.release("routines"));
    expect(groups(host)).toEqual(["▾ Rest of the floor2"]);
    expect(pluses(host)).toHaveLength(2);
  });

  /*
   * The review of this phase (Oct 9 2026): Start pressed before the client's
   * routines answered starts with no routine and an empty list; the render
   * where they arrived had the floor open for a frame, before the follow-up
   * gave the session the client's Routine A and folded it again. The floor
   * waits for the follow-up, and opens only when there is no routine.
   */
  it("started before the routines answer: the floor never opens for a frame over a client who has a Routine A", async () => {
    sessionDocs = [];
    netCtl.routines = [{ id: "r-a", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"] }) }];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    await act(async () => document.querySelector<HTMLButtonElement>(".br__cta")!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    let opened = false;
    const look = (records: MutationRecord[]) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof Element && (n.matches(".jg-today__add") || n.querySelector(".jg-today__add"))) opened = true;
    };
    const watch = new MutationObserver(look);
    watch.observe(host, { subtree: true, childList: true });
    await act(async () => netCtl.release("routines"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    look(watch.takeRecords());
    watch.disconnect();
    expect(opened, "no + drawn while the routine was being decided").toBe(false);
    expect(numbered(host)).toEqual(["1 Leg Press (Hoist)"]);
    expect(groups(host)).toEqual(["▸ Not in today's routine1"]);
  });

  it("started before the routines answer, for a client with none: the floor opens once they do", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    await act(async () => document.querySelector<HTMLButtonElement>(".br__cta")!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    expect(pluses(host)).toHaveLength(0);
    await act(async () => netCtl.release("routines"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(pluses(host)).toHaveLength(2);
    expect(host.querySelector(".jg-nb__idle")!.textContent).toBe("Tap + on a machine you're doing.");
  });

  it("on a phone: today's machines as cards, the rest of the floor as names with a 40px Add, which adds and makes it the card in hand", async () => {
    const realMatchMedia = window.matchMedia;
    const { PHONE_QUERY } = await import("../features/phone/device");
    (window as any).matchMedia = (query: string) => ({
      matches: query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    (globalThis as any).CSS ??= {};
    (globalThis as any).CSS.escape ??= (s: string) => s;
    Element.prototype.scrollIntoView ??= function () {};
    try {
      sessionDocs = openSession();
      const host = await mount(<Open />);
      expect(host.querySelector(".ph-stage")).toBeTruthy();
      expect(host.querySelectorAll(".ph-card")).toHaveLength(0);
      expect(host.querySelector(".ph-stage__empty")!.textContent).toBe("Tap Add on a machine you're doing.");
      expect([...host.querySelectorAll(".ph-floor__name")].map((n) => n.textContent)).toEqual(["Leg Press (Hoist)", "Rear Delt Hoist"]);
      const add = host.querySelector<HTMLButtonElement>('.ph-floor__add[aria-label="Add Rear Delt Hoist to today\'s session"]')!;
      await act(async () => add.click());
      const cards = [...host.querySelectorAll(".ph-card")];
      expect(cards.map((c) => c.querySelector(".ph-card__name")!.textContent)).toEqual(["Rear Delt Hoist"]);
      expect(cards[0].className).toContain("is-in-hand");
      expect([...host.querySelectorAll(".ph-floor__name")].map((n) => n.textContent)).toEqual(["Leg Press (Hoist)"]);
      expect(recordedLists(OPEN_ID)).toEqual([["sm-solon-rear-delt"]]);
    } finally {
      (window as any).matchMedia = realMatchMedia;
    }
  });

  /*
   * START FROM A ROUTINE… (AJ's "1b": "i want to be able to take advantage
   * of our routine builder so we can use it if we wanted too"). The corner's
   * sheet lays a routine on today's list in one tap. The starting routines'
   * read is stubbed with none in the app and no templates, so the sheet
   * offers the Academy's eleven and the built-in templates, as the Edit
   * routine drawer would.
   */
  const startFrom = async (host: HTMLElement) => {
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="session-corner"]')!.click());
    await act(async () => host.querySelector<HTMLElement>('[data-testid="session-corner-start-from"]')!.click());
    await act(async () => {});
  };
  const startRow = (key: string) => document.body.querySelector<HTMLButtonElement>(`[data-testid="start-from-${key}"]`);

  it("Start from a routine… lays a routine in one tap: what was done stays first, its machines in its order, the rest of the floor below, and no routine is written", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    // The Rear Delt first, by +, with a set on it.
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reps, "10");
      reps.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await startFrom(host);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Start from a routine");
    expect(text).toContain("Starting routines");
    expect(text).toContain("Head office's templates");
    // Full Body Foundations: only the Leg Press is on this floor; the rest is named, never dropped.
    const full = startRow("company:global-full-body-foundations")!;
    expect(full.textContent).toContain("Full Body Foundations");
    expect(full.textContent).toContain("Leg Press (Hoist)");
    expect(full.textContent).toContain("Not on this floor: Chest Press, Compound Row");
    writes.length = 0;
    later();
    await act(async () => full.click());
    expect(document.body.textContent, "the sheet closes").not.toContain("Head office's templates");
    expect(recordedLists(OPEN_ID)).toEqual([["sm-solon-rear-delt", "m-leg-press"]]);
    expect(numbered(host)).toEqual(["1 Rear Delt Hoist", "2 Leg Press (Hoist)"]);
    expect(host.querySelector(".jg-nb__name")?.textContent, "the first machine still to do is in hand").toBe("Leg Press (Hoist)");
    // The rest of the floor stays below, each with its +.
    expect(pluses(host).map((b) => b.getAttribute("aria-label"))).toEqual(["Add Lumbar to today's session"]);
    expect(writes.filter((w) => w.path.startsWith("routines")), "today's list only, never a routine").toEqual([]);
  });

  it("Start from a routine… offers the client's own Routine A once the client is known, and lays it as the session's list only", async () => {
    sessionDocs = [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: null, sessionMachineIds: [] }) }];
    netCtl.routines = [{ id: "ra-1", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["sm-solon-rear-delt", "m-leg-press"] }) }];
    const host = await mount(<Tracker />);
    await startFrom(host);
    const a = startRow("client:A")!;
    expect(a.textContent).toContain("Rear Delt Hoist · Leg Press (Hoist)");
    writes.length = 0;
    await act(async () => a.click());
    expect(recordedLists(SESSION_ID).at(-1)).toEqual(["sm-solon-rear-delt", "m-leg-press"]);
    expect(writes.filter((w) => w.path.startsWith("routines"))).toEqual([]);
  });

  /*
   * The phase's review (Oct 9 2026): a lay while Start was still deciding
   * the client's routine was merged by the follow-up, the client's routine
   * ahead of it and the floor folded. Offered once that is decided.
   */
  it("Start from a routine… waits while Start decides the client's routine, and is offered once it has", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    await act(async () => document.querySelector<HTMLButtonElement>(".br__cta")!.click());
    const corner = () => host.querySelector<HTMLButtonElement>('[data-testid="session-corner"]')!;
    const item = () => host.querySelector<HTMLElement>('[data-testid="session-corner-start-from"]')!;
    await act(async () => corner().click());
    expect(item().getAttribute("aria-disabled"), "not while the routine is being decided").toBe("true");
    await act(async () => item().click());
    expect(document.body.textContent).not.toContain("For today only. What's done today stays.");
    await act(async () => corner().click());
    await act(async () => netCtl.release("routines"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => corner().click());
    expect(item().getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => item().click());
    await act(async () => {});
    expect(document.body.textContent).toContain("For today only. What's done today stays.");
  });

  it("a lay drops a machine added by + with no set, keeps the one with a set first, and moves the hand to the first still to do", async () => {
    netCtl.moreRoster = [LUMBAR];
    sessionDocs = openSession();
    const host = await mount(<Open />);
    // The Rear Delt by +, with a set on it; then the Lumbar by +, no set, in hand.
    await act(async () => plus(host, "Rear Delt Hoist")!.click());
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reps, "10");
      reps.dispatchEvent(new Event("input", { bubbles: true }));
    });
    later();
    await act(async () => plus(host, "Lumbar")!.click());
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Lumbar");
    await startFrom(host);
    writes.length = 0;
    later();
    await act(async () => startRow("company:global-full-body-foundations")!.click());
    expect(recordedLists(OPEN_ID)).toEqual([["sm-solon-rear-delt", "m-leg-press"]]);
    expect(numbered(host)).toEqual(["1 Rear Delt Hoist", "2 Leg Press (Hoist)"]);
    expect(host.querySelector(".jg-nb__name")?.textContent, "the hand leaves the Lumbar for the first still to do").toBe("Leg Press (Hoist)");
    // The Lumbar is back on the floor below, its + one tap away.
    expect(pluses(host).map((b) => b.getAttribute("aria-label"))).toEqual(["Add Lumbar to today's session"]);
  });

  it("on a phone, the same sheet opens from the foot", async () => {
    const realMatchMedia = window.matchMedia;
    const { PHONE_QUERY } = await import("../features/phone/device");
    (window as any).matchMedia = (query: string) => ({
      matches: query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
    (globalThis as any).CSS ??= {};
    (globalThis as any).CSS.escape ??= (s: string) => s;
    Element.prototype.scrollIntoView ??= function () {};
    try {
      sessionDocs = openSession();
      const host = await mount(<Open />);
      const door = host.querySelector<HTMLButtonElement>('[data-testid="phone-start-from"]')!;
      expect(door.textContent).toBe("Start from a routine…");
      await act(async () => door.click());
      await act(async () => {});
      await act(async () => startRow("company:global-full-body-foundations")!.click());
      expect(recordedLists(OPEN_ID)).toEqual([["m-leg-press"]]);
      expect([...host.querySelectorAll(".ph-card__name")].map((n) => n.textContent)).toEqual(["Leg Press (Hoist)"]);
    } finally {
      (window as any).matchMedia = realMatchMedia;
    }
  });
});

/*
 * SESSION WRITES NEVER WAIT ON THE NETWORK (speed round, Oct 5 2026; R9).
 * Every test here runs against a database that never answers a write - the
 * iPad offline, or studio Wi-Fi with nothing behind it - and asks that the
 * screen finishes what the trainer did anyway: the write is on the iPad.
 */
describe("session writes never wait on the network (speed round, Oct 5 2026; R9)", () => {
  const ROUTINE_A = {
    id: "r-a",
    data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press", "sm-solon-rear-delt"] }),
  };
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const startButton = () => document.querySelector<HTMLButtonElement>(".br__cta");
  const startedSession = () => writes.find((w) => w.path.startsWith("sessions/auto-") && w.data?.status === "In-Progress");
  const offline = () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    netCtl.hang = true;
  };

  it("Start opens the session at once offline: the session and its prefilled sets in one batch, nothing awaited", async () => {
    sessionDocs = [];
    netCtl.routines = [ROUTINE_A];
    offline();
    const host = await mount(<Tracker />);
    expect(startButton()).toBeTruthy();
    await act(async () => startButton()!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const session = startedSession();
    expect(session?.data).toMatchObject({
      clientId: CLIENT_ID,
      routineId: "r-a",
      sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"],
    });
    const sid = session!.path.split("/")[1];
    const seed = writes.find((w) => w.path === `exerciseLogs/${sid}_m-leg-press`);
    // The prescription, merged, never a count.
    expect(seed?.data.weight).toBe("120");
    expect(seed?.merge).toBe(true);
    expect(seed?.data).not.toHaveProperty("reps");
    // The client has a Routine A: none is made.
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);
  });

  it("routines not read yet: Start makes no second Routine A, and the session takes the client's the moment they are", async () => {
    sessionDocs = [];
    netCtl.routines = [ROUTINE_A];
    netCtl.hold.add("routines");
    offline();
    const host = await mount(<Tracker />);
    await act(async () => startButton()!.click());
    // Started anyway: "known" never holds Start.
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const session = startedSession();
    expect(session?.data.routineId).toBeNull();
    const sid = session!.path.split("/")[1];
    // Nothing guessed while the routines are unknown.
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);
    expect(writes.some((w) => w.path.startsWith(`exerciseLogs/${sid}_`))).toBe(false);

    await act(async () => netCtl.release("routines"));
    await settle();
    const update = writes.find((w) => w.path === `sessions/${sid}` && w.data?.routineId === "r-a");
    expect(update?.data.sessionMachineIds).toEqual(["m-leg-press", "sm-solon-rear-delt"]);
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);
    expect(writes.find((w) => w.path === `exerciseLogs/${sid}_m-leg-press`)?.data.weight).toBe("120");
  });

  it("a set typed while the settings were unread survives the seed that follows (the old offline overwrite)", async () => {
    const { sendSetsNow } = await import("../features/session-record/sign-out-check");
    sessionDocs = [];
    netCtl.routines = [ROUTINE_A];
    netCtl.hold.add("clientMachineSettings");
    netCtl.moreSettings = [
      { id: `${CLIENT_ID}_sm-solon-rear-delt`, data: () => ({ clientId: CLIENT_ID, machineId: "sm-solon-rear-delt", settings: {}, startingWeight: 30 }) },
    ];
    offline();
    const host = await mount(<Tracker />);
    await act(async () => startButton()!.click());
    const sid = startedSession()!.path.split("/")[1];
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(reps!, "11");
      reps!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => sendSetsNow());
    const legPress = () => writes.filter((w) => w.path === `exerciseLogs/${sid}_m-leg-press`);
    expect(legPress().some((w) => w.data?.reps === "11")).toBe(true);
    const before = legPress().length;

    await act(async () => netCtl.release("clientMachineSettings"));
    await settle();
    // The seed came for the machine nobody touched...
    expect(writes.find((w) => w.path === `exerciseLogs/${sid}_sm-solon-rear-delt`)?.data.weight).toBe("30");
    // ...and never over the set typed into: no write to it at all, and never the prescription.
    expect(legPress()).toHaveLength(before);
    expect(legPress().some((w) => w.data?.weight === "120")).toBe(false);
  });

  it("routines the iPad's cache answers EMPTY are not 'none': no Routine A until the server says so", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.fromCache.add("routines");
    offline();
    const host = await mount(<Tracker />);
    await act(async () => startButton()!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const sid = startedSession()!.path.split("/")[1];
    expect(startedSession()!.data.routineId).toBeNull();
    // An empty cache is not the client having no routine: none is made.
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);

    // The server answers: the client had a Routine A all along.
    netCtl.routines = [ROUTINE_A];
    netCtl.fromCache.delete("routines");
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "routines")) l.emit();
    });
    await settle();
    expect(writes.find((w) => w.path === `sessions/${sid}` && w.data?.routineId === "r-a")).toBeTruthy();
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);
  });

  /* The first-session design round (Oct 8 2026, §4.5 and §4.8). A routine
     document is a routine; its plan's changes sit under it. */
  const routineDocs = () => writes.filter((w) => /^routines\/[^/]+$/.test(w.path));
  const planChangeDocs = () => writes.filter((w) => /^routines\/[^/]+\/planChanges\/[^/]+$/.test(w.path));
  /** Starting out at the studio: Journey holds the whole story and it is empty; the intake names a low back. */
  const startingOut = {
    ...client,
    sessionCount: 0,
    historyIsComplete: true,
    medicalHistory: "Sciatica down the left leg",
  } as Client;

  // Changed on purpose (Oct 8 2026). This held that Start made a Routine A
  // for a client with none, from whatever list the briefing had under its
  // "Today only" label. The consult is not Routine A (AJ, Oct 8 2026: "this
  // also counts with the consult visit, sometimes the consult machines will
  // not be the same as their a routine"), so Start makes one only from a
  // starting plan, EMPTY with the plan on it; without a plan, none.
  it("a brand-new client's empty routines, confirmed by the server: with a starting plan, exactly one Routine A WITH its plan", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.fromCache.add("routines");
    const host = await mount(<Tracker who={startingOut} />);
    // Routines not known yet: Journey can't tell, both doors. The trainer picks "Starting out here".
    const doorButton = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Starting out here"));
    expect(doorButton).toBeTruthy();
    await act(async () => doorButton!.click());
    await settle();
    expect(host.querySelector('[data-testid="briefing-plan"]')).toBeTruthy();
    await act(async () => startButton()!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const session = startedSession()!;
    const sid = session.path.split("/")[1];
    // Nothing made while the routines are unknown; the session runs today (the plan's day one).
    expect(routineDocs()).toHaveLength(0);
    expect(session.data.routineId).toBeNull();
    expect(session.data.sessionMachineIds).toEqual(["m-leg-press"]);

    // The server confirms the empty list: a metadata-only answer.
    netCtl.fromCache.delete("routines");
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "routines")) l.emit();
    });
    await settle();
    expect(routineDocs()).toHaveLength(1);
    const [made] = routineDocs();
    expect(made.data).toMatchObject({ clientId: CLIENT_ID, name: "Routine A", machineIds: [] });
    expect(made.data.plan.dayOne).toEqual(["m-leg-press"]);
    expect(made.data.plan.templateId).toBe("academy-low-back");
    const routineId = made.path.split("/")[1];
    expect(planChangeDocs()).toHaveLength(1);
    expect(planChangeDocs()[0].path.startsWith(`routines/${routineId}/planChanges/`)).toBe(true);
    expect(planChangeDocs()[0].data).toMatchObject({ kind: "start", value: "Low back issues", byUid: "uid-coach" });
    // The session names it, in the same batch as the routine and its plan.
    const named = writes.find((w) => w.path === `sessions/${sid}` && w.data?.routineId === routineId)!;
    expect(named).toBeTruthy();
    expect(named.batch).toBe(made.batch);
    expect(planChangeDocs()[0].batch).toBe(made.batch);
  });

  it("a brand-new client's empty routines, confirmed by the server: without a starting plan, no Routine A at all", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.fromCache.add("routines");
    const host = await mount(<Tracker />);
    await act(async () => startButton()!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const sid = startedSession()!.path.split("/")[1];
    expect(startedSession()!.data.sessionMachineIds).toEqual([]);
    netCtl.fromCache.delete("routines");
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "routines")) l.emit();
    });
    await settle();
    // Start never saves today's list as a routine.
    expect(writes.filter((w) => w.path.startsWith("routines/"))).toHaveLength(0);
    expect(writes.some((w) => w.path === `sessions/${sid}` && "routineId" in (w.data ?? {}) && w.data !== startedSession()!.data)).toBe(false);
  });

  it("starting out, routines known: Start's ONE batch holds the session, an EMPTY Routine A with the plan, and its start change", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    offline();
    const host = await mount(<Tracker who={startingOut} />);
    await settle();
    // Known to hold no routine, and a whole, empty story: the plan card, no doors.
    expect(host.querySelector('[data-testid="briefing-plan"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="briefing-plan-doors"]')).toBeNull();
    await act(async () => startButton()!.click());
    // Never awaited: the session is on screen offline.
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const session = startedSession()!;
    expect(routineDocs()).toHaveLength(1);
    const [made] = routineDocs();
    const routineId = made.path.split("/")[1];
    expect(made.data).toMatchObject({ name: "Routine A", machineIds: [], studioId: STUDIO_ID });
    expect(made.data.plan).toMatchObject({ dayOne: ["m-leg-press"], building: true, templateId: "academy-low-back" });
    expect(planChangeDocs()).toHaveLength(1);
    expect(planChangeDocs()[0].data).toMatchObject({ kind: "start", byUid: "uid-coach", byName: "Jane Coach", value: "Low back issues" });
    // The session runs today's machines and names the new routine, all in the Start batch.
    expect(session.data).toMatchObject({ routineId, sessionMachineIds: ["m-leg-press"] });
    expect(made.batch).toBe(session.batch);
    expect(planChangeDocs()[0].batch).toBe(session.batch);
    // Firestore refuses undefined: none anywhere in the batch.
    const json = JSON.stringify([made.data, planChangeDocs()[0].data], (_k, v) => (v === undefined ? "__undefined__" : v));
    expect(json).not.toContain("__undefined__");
  });

  /** Two pulls on the floor: the low back row's Compound Row and the Simple Row its own B takes in its place. */
  const AB_ROSTER = [
    { id: "m-compound-row", data: () => ({ source: "custom", status: "active", order: 30, definition: { name: "Compound Row", settingFields: [] } }) },
    { id: "m-simple-row", data: () => ({ source: "custom", status: "active", order: 40, definition: { name: "Simple Row", settingFields: [] } }) },
  ];

  /*
   * A and B together (the studio setting `newClientsStart`, item 8). AJ, Oct
   * 7 2026: "Some studios may start building an A and B routine immediately
   * for a client. So we need to be able to have that customization." The
   * briefing plans B beside the starting plan, and Start keeps both in its
   * ONE batch: Routine B with its plan and NO machines (the consult is not
   * Routine A, and B is a copy of A), B left off.
   */
  it("starting out at a studio that starts on A and B together: Start's ONE batch holds Routine A and a planned Routine B with no machines", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    singleDocs[`studios/${STUDIO_ID}/config/settings`] = { values: { newClientsStart: 2 } };
    // A compound row and a simple row on the floor, for B's swap: the low back
    // row's own B keeps the Leg Press, and swaps the Compound Row for the
    // Simple Row (b-routine.ts suggestBSwaps; the screens preview, Oct 9 2026).
    netCtl.moreRoster = AB_ROSTER;
    offline();
    const host = await mount(<Tracker who={startingOut} />);
    await settle();
    expect(host.querySelector('[data-testid="briefing-plan"]')?.textContent).toContain("B · planned with A");
    writes.length = 0;
    await act(async () => startButton()!.click());
    const session = startedSession()!;
    const docs = routineDocs();
    expect(docs.map((d) => d.data.name)).toEqual(["Routine A", "Routine B"]);
    const [a, b] = docs;
    expect(a.data.machineIds).toEqual([]);
    // Routine B's machines stay EMPTY until A has machines; its plan holds the swaps.
    expect(b.data).toMatchObject({ name: "Routine B", machineIds: [], studioId: STUDIO_ID });
    expect(b.data.plan.swaps.length).toBeGreaterThan(0);
    expect(b.data.plan.building).toBe(false);
    const bChange = planChangeDocs().find((w) => w.path.startsWith(b.path))!;
    expect(bChange.data).toMatchObject({ kind: "start", value: "B planned", byUid: "uid-coach", byName: "Jane Coach" });
    // All in the Start batch, and B is never switched on by Start.
    for (const w of [a, b, bChange]) expect(w.batch).toBe(session.batch);
    expect(writes.some((w) => w.path === `clients/${CLIENT_ID}` && w.data && "isRoutineBActive" in w.data)).toBe(false);
  });

  /*
   * The review of item 8: the Start path that waits for the client's
   * routines (R9) adds B too once they are known, and it had no test. The
   * routines answer only from the cache at Start; when the server confirms
   * the empty list, Routine A and the planned B go in ONE batch with the
   * session's routine id, Routine B with no machines and B never turned on.
   */
  it("routines unknown at Start, A and B together: once the server confirms them, Routine A and a planned B go in ONE batch with the session's routine", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    netCtl.fromCache.add("routines");
    singleDocs[`studios/${STUDIO_ID}/config/settings`] = { values: { newClientsStart: 2 } };
    netCtl.moreRoster = AB_ROSTER;
    const host = await mount(<Tracker who={startingOut} />);
    // Routines not known yet: Journey can't tell, both doors. The trainer picks "Starting out here".
    const doorButton = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Starting out here"));
    expect(doorButton).toBeTruthy();
    await act(async () => doorButton!.click());
    await settle();
    expect(host.querySelector('[data-testid="briefing-plan"]')?.textContent).toContain("B · planned with A");
    await act(async () => startButton()!.click());
    const session = startedSession()!;
    const sid = session.path.split("/")[1];
    // Nothing made while the routines are unknown.
    expect(routineDocs()).toHaveLength(0);

    // The server confirms the empty list.
    netCtl.fromCache.delete("routines");
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "routines")) l.emit();
    });
    await settle();
    const docs = routineDocs();
    expect(docs.map((d) => d.data.name)).toEqual(["Routine A", "Routine B"]);
    const [a, b] = docs;
    expect(a.data.machineIds).toEqual([]);
    expect(b.data).toMatchObject({ name: "Routine B", machineIds: [], studioId: STUDIO_ID });
    expect(b.data.plan.swaps.length).toBeGreaterThan(0);
    const bChange = planChangeDocs().find((w) => w.path.startsWith(b.path))!;
    expect(bChange.data).toMatchObject({ kind: "start", value: "B planned", byUid: "uid-coach" });
    // ONE batch: the session names Routine A, beside both routines and their changes.
    const routineId = a.path.split("/")[1];
    const named = writes.find((w) => w.path === `sessions/${sid}` && w.data?.routineId === routineId)!;
    expect(named).toBeTruthy();
    for (const w of [a, b, bChange]) expect(w.batch).toBe(named.batch);
    expect(writes.some((w) => w.path === `clients/${CLIENT_ID}` && w.data && "isRoutineBActive" in w.data)).toBe(false);
  });

  /* The old first-time setup (ConsultationSetupWizard) stood in front of the
     briefing for a client flagged for a consultation. It is retired (the
     first-session design round, Oct 8 2026, §4.8): such a client, as Add
     Client makes one, opens the briefing like everyone else, and opening it
     writes nothing to the client. Finish still marks the consultation done. */
  it("a client flagged for a consultation opens the briefing, never the old First-time setup, and nothing is written on opening", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    const prospect = { ...client, sessionCount: 0, requiresConsultation: true, consultationCompleted: false } as Client;
    const host = await mount(<Tracker who={prospect} />);
    await settle();
    expect(startButton()).toBeTruthy();
    expect(host.textContent).not.toContain("First-time setup");
    expect(writes.some((w) => w.path.startsWith("clients/"))).toBe(false);
    // Start is the briefing's, as for any client: the session runs.
    await act(async () => startButton()!.click());
    await settle();
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    expect(startedSession()).toBeTruthy();
  });

  it("no routine and nothing chosen: the session starts empty, never the whole floor, and makes no routine", async () => {
    sessionDocs = [];
    netCtl.routines = [];
    const before = { ...client, sessionCount: 4, historyIsComplete: true } as Client;
    const host = await mount(<Tracker who={before} />);
    await settle();
    // Sessions in Journey but no routine: the door to Programming, and Start as you go.
    expect(host.querySelector('[data-testid="briefing-plan-journey"]')).toBeTruthy();
    await act(async () => startButton()!.click());
    await settle();
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    expect(startedSession()!.data).toMatchObject({ routineId: null, sessionMachineIds: [] });
    expect(writes.some((w) => w.path.startsWith("routines/"))).toBe(false);
    // Neither floor machine is today's: nothing was chosen.
    expect(host.querySelector('input[aria-label="reps to failure"]')).toBeNull();
  });

  it("a settings read that fails still prefills from the last performed weights", async () => {
    sessionDocs = [];
    netCtl.routines = [ROUTINE_A];
    netCtl.fail.add("clientMachineSettings");
    offline();
    const who = { ...client, currentMachineMetrics: { "m-leg-press": { weight: "110", reps: 10 } } } as unknown as Client;
    await mount(<Tracker who={who} />);
    await act(async () => startButton()!.click());
    const sid = startedSession()!.path.split("/")[1];
    expect(writes.find((w) => w.path === `exerciseLogs/${sid}_m-leg-press`)?.data.weight).toBe("110");
  });

  it("a Start refused late keeps the sets typed meanwhile and takes back only the untouched prefills", async () => {
    const { sendSetsNow } = await import("../features/session-record/sign-out-check");
    sessionDocs = [];
    netCtl.routines = [ROUTINE_A];
    netCtl.refuseLater = true;
    const host = await mount(<Tracker />);
    await act(async () => startButton()!.click());
    const sid = startedSession()!.path.split("/")[1];
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(reps!, "11");
      reps!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The database refuses the start batch (the first commit).
    const refuse = netCtl.refusals[0];
    await act(async () => {
      refuse(Object.assign(new Error("refused"), { code: "permission-denied" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => sendSetsNow());
    // The typed set is the only record of what the client lifted: it is sent,
    // and never deleted...
    expect(writes.some((w) => w.path === `exerciseLogs/${sid}_m-leg-press` && w.data?.reps === "11")).toBe(true);
    expect(netCtl.deletes).not.toContain(`exerciseLogs/${sid}_m-leg-press`);
    // ...while an untouched prefill is taken back.
    expect(netCtl.deletes).toContain(`exerciseLogs/${sid}_sm-solon-rear-delt`);
    // The session left the screen, and it was said, with where the sets are.
    expect(host.querySelector(".jg-sbar")).toBeNull();
    expect(document.body.textContent).toContain("The session didn't start");
    expect(document.body.textContent).toContain("The sets typed are kept");
  });

  it("Discard is one batch, and the Hub comes at once offline", async () => {
    offline();
    await mount(<Tracker />);
    const discard = document.querySelector<HTMLButtonElement>('button[aria-label="Discard this session"]');
    expect(discard).not.toBeNull();
    await act(async () => discard!.click());
    const scrap = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Scrap session");
    expect(scrap).toBeDefined();
    await act(async () => scrap!.click());
    expect(setViewSpy).toHaveBeenCalledWith("clients");
    expect(netCtl.deletes).toEqual(
      expect.arrayContaining([
        `sessions/${SESSION_ID}`,
        `exerciseLogs/${SESSION_ID}_m-leg-press`,
        `exerciseLogs/${SESSION_ID}_sm-solon-rear-delt`,
      ]),
    );
    expect(document.body.textContent).not.toContain("Deleting");
  });

  it("Back to Hub from the Wrap-up goes at once, with the profile note issued, offline", async () => {
    offline();
    const host = await mount(<Tracker />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
    await act(async () => finish.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved on this iPad");
    const box = document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Profile note"]');
    expect(box).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box!, "Likes the new seat height.");
      box!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const back = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Back to Hub")!;
    await act(async () => back.click());
    expect(setViewSpy).toHaveBeenCalledWith("clients");
    expect(journalDocs.some((d) => d.data().body === "Likes the new seat height.")).toBe(true);
  });

  it("Finish asks 'finished elsewhere?' when the dialog opens, so the tap makes no second read", async () => {
    let reads = 0;
    Object.defineProperty(finishCtl, "serverStatus", {
      configurable: true,
      get: () => {
        reads += 1;
        return "Completed";
      },
    });
    try {
      const host = await mount(<Tracker />);
      await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
      const afterOpen = reads;
      expect(afterOpen).toBeGreaterThan(0);
      const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
      await act(async () => finish.click());
      await settle();
      await settle();
      expect(reads).toBe(afterOpen);
      expect(document.body.textContent).toContain("already finished on another iPad");
    } finally {
      Object.defineProperty(finishCtl, "serverStatus", { configurable: true, writable: true, value: undefined });
    }
  });

  it("Finish sees a session the live stream already says is Completed, with no server read at all", async () => {
    let reads = 0;
    Object.defineProperty(finishCtl, "serverStatus", {
      configurable: true,
      get: () => {
        reads += 1;
        return undefined;
      },
    });
    try {
      offline(); // no early read: the dialog opens offline
      const host = await mount(<Tracker />);
      await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
      // Another iPad finishes it; the client's sessions stream says so.
      sessionDocs = [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), status: "Completed" }) }];
      const writesBefore = writes.length;
      const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
      await act(async () => {
        snapshotListeners.filter((l) => l.live && l.path === "sessions").forEach((l) => l.emit());
        finish.click();
      });
      await settle();
      await settle();
      expect(reads).toBe(0);
      expect(writes.slice(writesBefore).filter((w) => w.path === `sessions/${SESSION_ID}` && w.data?.status === "Completed")).toHaveLength(0);
    } finally {
      Object.defineProperty(finishCtl, "serverStatus", { configurable: true, writable: true, value: undefined });
    }
  });
});

/*
 * THE SESSION'S NOTES COME FROM THE ONE JOURNAL LISTENER (speed round, Oct 5
 * 2026; R11). The Wrap-up's To-file tray and the session's note sheet each
 * opened a query of their own beside it.
 */
describe("the Wrap-up and the note sheet read this session's notes from the journal stream already open (R11)", () => {
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const journalListeners = () => snapshotListeners.filter((l) => l.live && l.path === "journalEntries");

  it("the Wrap-up's tray shows the session's note with no second journal listener", async () => {
    const host = await mount(<Tracker />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    const box = document.getElementById("next-trainer-note") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Knee sore after the move.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
    await act(async () => finish.click());
    await settle();
    await settle();
    expect(document.querySelector('[data-testid="sweep-j-1"]')).toBeTruthy();
    expect(journalListeners()).toHaveLength(1);
  });

  it("the session's note sheet opens no journal listener of its own", async () => {
    const host = await mount(<Tracker />);
    const before = journalListeners().length;
    const notes = host.querySelector<HTMLButtonElement>('button[aria-label="Session notes"]');
    expect(notes).not.toBeNull();
    await act(async () => notes!.click());
    await settle();
    expect(document.body.textContent).toContain("Session notes");
    expect(journalListeners()).toHaveLength(before);
  });
});

/*
 * THE SESSION SCREEN DOES NOT REDRAW ITSELF FOR A CLOCK OR A KEYSTROKE
 * (speed round, Oct 5 2026; R10). The machine clock ticks inside the Now
 * Bar and the send line keeps its own clock; a keystroke in today's column
 * no longer rebuilds every row of the grid.
 */
describe("the Active Session's own redraws (R10)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not redraw the session screen once a second while a machine is focused; the Now Bar's clock still runs", async () => {
    // The intervals are faked from the start, so the ones the screen opens are the fakes.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const host = await mount(<Tracker />);
    const before = renders.tracker;
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    // Over five seconds the tracker itself drew no more than once (a stray
    // timer of its own), where it used to draw five times.
    expect(renders.tracker - before).toBeLessThanOrEqual(1);
    expect(host.textContent ?? "").toMatch(/On machine \d+s/);
  });

  it("a keystroke in today's column does not rebuild the grid's rows", async () => {
    const host = await mount(<Tracker />);
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const rowsBefore = renders.rows;
    const drawsBefore = renders.tracker;
    for (const v of ["1", "11"]) {
      await act(async () => {
        setter.call(reps!, v);
        reps!.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    // The tracker drew for the keystrokes, and the rows were not rebuilt.
    expect(renders.tracker).toBeGreaterThan(drawsBefore);
    expect(renders.rows).toBe(rowsBefore);
  });
});

/**
 * THE FLOOR ON DAY ONE (the first-session design round, Oct 8 2026, §4.6):
 * the plan's next machine is the first one of Routine A's plan TODAY's
 * session doesn't have (Routine A itself is empty on day one: the consult is
 * not Routine A), offered on the last machine and on an empty Now Bar.
 * Adding it is today only, through the one recorder: the session document,
 * never the routine. The Wrap-up decides what Routine A keeps.
 */
describe("the floor on day one: the plan's next machine (Oct 8 2026)", () => {
  const PLANNED = {
    id: "ra-1",
    data: () => ({
      clientId: CLIENT_ID,
      name: "Routine A",
      machineIds: [],
      plan: { purpose: "", intended: ["m-leg-press", "sm-solon-rear-delt"], dayOne: ["m-leg-press"], building: true, madeByUid: "uid-coach" },
    }),
  };
  const runningDayOne = (machines: string[]) => [
    { id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: "ra-1", sessionMachineIds: machines }) },
  ];

  it("on the last machine, offers the plan's next one, and Add puts it in TODAY's order only", async () => {
    sessionDocs = runningDayOne(["m-leg-press"]);
    netCtl.routines = [PLANNED];
    const host = await mount(<Tracker />);
    const offer = host.querySelector<HTMLButtonElement>(".jg-nb__next--plan");
    expect(offer, "the plan's next machine on the last machine").not.toBeNull();
    expect(offer!.textContent).toContain("Next in the plan");
    expect(offer!.textContent).toContain("Rear Delt Hoist");
    expect(host.textContent ?? "").toContain("Add another machine");
    writes.length = 0;
    await act(async () => offer!.click());
    const recorded = writes.filter((w) => w.path === `sessions/${SESSION_ID}` && w.data.sessionMachineIds);
    expect(recorded.at(-1)?.data.sessionMachineIds).toEqual(["m-leg-press", "sm-solon-rear-delt"]);
    expect(writes.filter((w) => w.path.startsWith("routines")), "adding is today only: the routine is untouched").toEqual([]);
    // It is the machine in hand now, and the last: nothing further in the plan.
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Rear Delt Hoist");
    expect(host.querySelector(".jg-nb__next--plan")).toBeNull();
  });

  it("an empty Now Bar says so and offers Add a machine and the plan's next one", async () => {
    sessionDocs = runningDayOne([]);
    netCtl.routines = [PLANNED];
    const host = await mount(<Tracker />);
    expect(host.textContent ?? "").toContain("Nothing in today's order yet.");
    const add = [...host.querySelectorAll<HTMLButtonElement>(".jg-nb__addmore")].find((b) => b.textContent?.includes("Add a machine"));
    expect(add).toBeTruthy();
    const offer = host.querySelector<HTMLButtonElement>(".jg-nb__next--plan");
    expect(offer!.textContent).toContain("Leg Press (Hoist)");
    writes.length = 0;
    await act(async () => offer!.click());
    const recorded = writes.filter((w) => w.path === `sessions/${SESSION_ID}` && w.data.sessionMachineIds);
    expect(recorded.at(-1)?.data.sessionMachineIds).toEqual(["m-leg-press"]);
    expect(writes.filter((w) => w.path.startsWith("routines"))).toEqual([]);
  });

  it("without a plan on Routine A, the last machine's slot is as it was", async () => {
    sessionDocs = runningDayOne(["m-leg-press"]);
    netCtl.routines = [{ id: "ra-1", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"] }) }];
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-nb__next--plan")).toBeNull();
    expect(host.textContent ?? "").toContain("Last in today's order");
  });
});

/**
 * THE FLOOR ON DAY ONE, MOUNTED IN THE TRACKER (the reviews of Oct 9 2026):
 * what the Now Bar's own test can't see, because it is the tracker's gate.
 *   - The Academy's starting range shows only with no weight on file, and
 *     only once the settings ARRIVED (a read not answered, or failed, is
 *     unknown, never "no weight"); the weight cell stays blank.
 *   - The corner's "The plan" opens the plan's sheet; a swap there issues
 *     the plan's ONE batch without waiting for it, records today's order on
 *     the session document, and the machine in hand follows the swap.
 *   - Until today's list is seeded the empty bar offers nothing to add.
 */
describe("the floor on day one, the tracker's own gates (Oct 9 2026)", () => {
  const planned = (extra: Record<string, unknown> = {}) => ({
    id: "ra-1",
    data: () => ({
      clientId: CLIENT_ID,
      name: "Routine A",
      machineIds: [],
      plan: { purpose: "", intended: ["m-leg-press", "sm-solon-rear-delt"], dayOne: ["m-leg-press"], building: true, madeByUid: "uid-coach", ...extra },
    }),
  });
  const running = (machines: string[] | undefined) => [
    { id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), routineId: "ra-1", sessionMachineIds: machines }) },
  ];
  const weightCell = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!;
  const range = (host: HTMLElement) => host.querySelector('[data-testid="nb-range"]');
  const ask = (host: HTMLElement) => host.querySelector('[data-testid="nb-range-ask"]');

  it("shows the plan's column as a range on a first time on a machine, beside a blank weight", async () => {
    sessionDocs = running(["m-leg-press"]);
    netCtl.routines = [planned({ startingColumn: "female-novice" })];
    netCtl.noBaseSettings = true;
    const host = await mount(<Tracker />);
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Leg Press (Hoist)");
    expect(range(host)?.textContent).toBe("Academy's starting range: 60–100 lb (a reference, not a rule)");
    expect(weightCell(host).value, "the app never suggests a weight").toBe("");
  });

  it("with no column picked, asks quietly; with a weight on file (the client's settings), says nothing and the weight is the one on file", async () => {
    sessionDocs = running(["m-leg-press"]);
    netCtl.routines = [planned()];
    netCtl.noBaseSettings = true;
    const first = await mount(<Tracker />);
    expect(ask(first)).not.toBeNull();
    expect(range(first)).toBeNull();
    for (const m of mounted) {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
    mounted = [];

    netCtl.noBaseSettings = false;
    const host = await mount(<Tracker />);
    expect(range(host)).toBeNull();
    expect(ask(host)).toBeNull();
    expect(weightCell(host).value).toBe("120");
  });

  /*
   * Add Client's walk-in (AJ's door two: "a client walked in ... run a
   * session right then and there on a consult") has no Mindbody count, so
   * its coverage is unknown; with no Journey session it is a whole story all
   * the same (the whole-branch review, Oct 9 2026: it never saw "First time
   * on this machine", nor the Academy's range without a plan).
   */
  it("Add Client's walk-in is a whole story: 'First time on this machine' and the range offer, with no plan", async () => {
    sessionDocs = running(["m-leg-press"]);
    netCtl.routines = [{ id: "ra-1", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"] }) }];
    netCtl.noBaseSettings = true;
    const walkIn = { ...client, sessionCount: 0, provisional: true, provisionalReason: "New client, not in Mindbody yet" } as Client;
    const host = await mount(<Tracker who={walkIn} />);
    expect(host.textContent ?? "").toContain("First time on this machine");
    expect(ask(host), "the Academy's range is offered").not.toBeNull();
    for (const m of mounted) {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
    mounted = [];
    // A client Journey can't call new says neither.
    const unknown = await mount(<Tracker />);
    expect(unknown.textContent ?? "").not.toContain("First time on this machine");
    expect(ask(unknown)).toBeNull();
  });

  it("says nothing until the settings arrive, and nothing at all when their read failed", async () => {
    sessionDocs = running(["m-leg-press"]);
    netCtl.routines = [planned({ startingColumn: "female-novice" })];
    netCtl.noBaseSettings = true;
    netCtl.hold.add("clientMachineSettings");
    const host = await mount(<Tracker />);
    expect(range(host), "the settings haven't answered: unknown, never 'no weight'").toBeNull();
    await act(async () => netCtl.release("clientMachineSettings"));
    expect(range(host)).not.toBeNull();
    for (const m of mounted) {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
    mounted = [];

    netCtl.fail.add("clientMachineSettings");
    const failed = await mount(<Tracker />);
    expect(range(failed), "a failed read is unknown").toBeNull();
    expect(ask(failed)).toBeNull();
  });

  it("the corner's plan opens the plan's sheet; a swap writes the plan and today's order without waiting, and the machine in hand follows it", async () => {
    sessionDocs = running(["m-leg-press"]);
    netCtl.routines = [planned()];
    netCtl.moreRoster = [
      {
        id: "m-leg-curl",
        data: () => ({ source: "custom", status: "active", order: 15, definition: { name: "Leg Curl (Hoist)", settingFields: [] } }),
      },
    ];
    netCtl.hang = true; // offline: nothing ever answers
    const host = await mount(<Tracker />);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="session-corner"]')!.click());
    const item = host.querySelector<HTMLElement>('[data-testid="session-corner-plan"]');
    expect(item?.textContent).toContain("The plan · 1 of 2");
    await act(async () => item!.click());
    const body = document.body;
    expect(body.textContent).toContain("Routine A · the plan");
    const tapWords = async (words: string) => {
      const b = [...body.querySelectorAll<HTMLElement>("button")].find(
        (x) => (x.getAttribute("aria-label") || x.textContent || "").trim() === words,
      );
      if (!b) throw new Error(`no button ${words}`);
      await act(async () => b.click());
      await act(async () => {});
    };
    await tapWords("Change Leg Press (Hoist) in the plan");
    await tapWords("Leg Curl (Hoist)");
    writes.length = 0;
    await tapWords("Save change");

    const plan = writes.filter((w) => w.path === "routines/ra-1");
    expect(plan, "the plan's one batch").toHaveLength(1);
    expect(plan[0].batch).toBeGreaterThan(0);
    expect(plan[0].data.plan.intended[0]).toBe("m-leg-curl");
    const recorded = writes.filter((w) => w.path === `sessions/${SESSION_ID}` && w.data.sessionMachineIds);
    expect(recorded.at(-1)?.data.sessionMachineIds, "today's order, on the session").toEqual(["m-leg-curl"]);
    expect(host.querySelector(".jg-nb__name")?.textContent, "the machine in hand follows the swap").toBe("Leg Curl (Hoist)");
    expect(body.textContent).toContain("Leg Curl (Hoist) instead of Leg Press (Hoist)");
  });

  /*
   * The consult on slow Wi-Fi (the whole-branch review, Oct 9 2026): Start
   * pressed before the client's routines answered never marked today's list
   * as on screen, so the Now Bar offered no Add for the whole session (and
   * forever offline). The list Start began with is on screen at once, and
   * what the trainer adds while the routines load is kept beside the
   * routine's machines when they come (`followUpList`).
   */
  it("started before the routines answer: Add is offered at once, and what was added stays beside the routine's machines", async () => {
    sessionDocs = [];
    netCtl.routines = [
      { id: "r-a", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"] }) },
    ];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    await act(async () => document.querySelector<HTMLButtonElement>(".br__cta")!.click());
    expect(host.querySelector(".jg-sbar")).toBeTruthy();
    const started = writes.find((w) => w.path.startsWith("sessions/auto-") && w.data?.status === "In-Progress")!;
    const sid = started.path.split("/")[1];
    expect(started.data.routineId).toBeNull();
    // Nothing in today's order yet, and Add a machine is there, not held.
    expect(host.textContent ?? "").toContain("Nothing in today's order yet.");
    const add = [...host.querySelectorAll<HTMLButtonElement>(".jg-nb__addmore")].find((b) => b.textContent?.includes("Add a machine"));
    expect(add, "Add a machine while the routines load").toBeTruthy();
    expect(add!.disabled).toBe(false);

    // The trainer adds the rear delt from the floor while the routines load.
    await act(async () => add!.click());
    const tap = document.body.querySelector<HTMLButtonElement>('[aria-label="Add Rear Delt Hoist to today\'s routine"]');
    expect(tap, "the floor to add from").not.toBeNull();
    await act(async () => tap!.click());
    const recorded = writes.filter((w) => w.path === `sessions/${sid}` && Array.isArray(w.data?.sessionMachineIds) && !("routineId" in w.data));
    expect(recorded.at(-1)?.data.sessionMachineIds).toEqual(["sm-solon-rear-delt"]);

    await act(async () => netCtl.release("routines"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const named = writes.filter((w) => w.path === `sessions/${sid}` && w.data?.routineId === "r-a");
    expect(named, "the session names the routine once it is known").toHaveLength(1);
    // The routine's machine first, and the one the trainer added is kept after it, never dropped.
    expect(named[0].data.sessionMachineIds).toEqual(["m-leg-press", "sm-solon-rear-delt"]);
    // Today's list is on screen: the last machine offers Add another machine, enabled.
    const another = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Add another machine"));
    expect(another, "Add another machine on the last machine").toBeTruthy();
    expect(another!.disabled).toBe(false);
  });

  it("until today's list is read, the empty bar offers nothing to add (an add would be recorded as the whole list)", async () => {
    // An older session with no list on record: today's list comes from the routine.
    sessionDocs = running(undefined);
    netCtl.routines = [planned()];
    netCtl.hold.add("routines");
    const host = await mount(<Tracker />);
    expect(host.textContent ?? "").not.toContain("Nothing in today's order yet.");
    expect(host.querySelector(".jg-nb__addmore")).toBeNull();
    expect(host.querySelector(".jg-nb__next--plan")).toBeNull();
    await act(async () => netCtl.release("routines"));
    // The routine answered: today is the plan's day one.
    expect(host.querySelector(".jg-nb__name")?.textContent).toBe("Leg Press (Hoist)");
  });
});

/**
 * THE WRAP-UP'S NEXT TIME, FROM FINISH TO THE ROUTINE (the first-session
 * design round, Oct 8 2026, §4.7). Finish freezes the session's routine,
 * its plan and today's performed machines; the Wrap-up offers the machines
 * the routine lacks; Back to Hub writes the ticked ones ONCE, through
 * routine-plan/store.ts, in one batch, never waited on. AJ, Oct 8 2026
 * ("3a"): "this also counts with the consult visit, sometimes the consult
 * machines will not be the same as their a routine".
 */
describe("the Wrap-up's Next time, from Finish to the routine (Oct 8 2026)", () => {
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  const performed = (machineId: string) => ({
    id: `${SESSION_ID}_${machineId}`,
    data: () => ({ sessionId: SESSION_ID, clientId: CLIENT_ID, machineId, weight: "100", reps: "10", studioId: STUDIO_ID }),
  });
  const running = (extra: Record<string, unknown>) => [{ id: SESSION_ID, data: () => ({ ...SESSION_DOCS[0].data(), ...extra }) }];
  const consultA = {
    id: "ra-1",
    data: () => ({
      clientId: CLIENT_ID,
      name: "Routine A",
      machineIds: [],
      plan: { purpose: "", intended: ["m-leg-press", "sm-solon-rear-delt"], dayOne: ["m-leg-press"], building: true, madeByUid: "uid-coach" },
    }),
  };
  const finishToWrapUp = async () => {
    const host = await mount(<Tracker />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
    await act(async () => finish.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    return host;
  };
  const card = () => document.querySelector('[data-testid="next-time"]');
  const tickFor = (name: string) =>
    Array.from(card()!.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')).find((t) => t.textContent?.includes(name))!;
  const backToHub = async () => {
    const back = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Back to Hub")!;
    await act(async () => back.click());
    await settle();
  };
  const routineWrites = () => writes.filter((w) => w.path.startsWith("routines"));

  it("the consult: today's machines offered unticked; the ticked one starts Routine A, with its plan change, in one batch on Back to Hub", async () => {
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"] });
    netCtl.routines = [consultA];
    netCtl.logs = [performed("m-leg-press"), performed("sm-solon-rear-delt")];
    netCtl.hang = false;
    await finishToWrapUp();
    expect(card()!.textContent).toContain("Tick the ones that start Routine A.");
    expect(tickFor("Leg Press (Hoist)").getAttribute("aria-checked")).toBe("false");
    expect(tickFor("Leg Press (Hoist)").textContent).toContain("Day one");
    expect(tickFor("Rear Delt Hoist").textContent).toContain("Next in the plan");

    writes.length = 0;
    await act(async () => tickFor("Leg Press (Hoist)").click());
    expect(routineWrites(), "a tick writes nothing").toEqual([]);
    await backToHub();
    expect(setViewSpy).toHaveBeenCalledWith("clients");
    const out = routineWrites();
    expect(out.map((w) => w.path.replace(/auto-\d+/, "*"))).toEqual(["routines/ra-1", "routines/ra-1/planChanges/*"]);
    expect(out[0].batch).toBeGreaterThan(0);
    expect(out[1].batch).toBe(out[0].batch);
    expect(out[0].data.machineIds).toEqual(["m-leg-press"]);
    expect(out[0].data.plan.dayOne).toEqual(["m-leg-press"]);
    expect(out[1].data).toEqual({ kind: "add", machineIds: ["m-leg-press"], value: "routine", byUid: "uid-coach", byName: "Jane Coach", at: { __server: true } });
  });

  it("nothing ticked writes nothing: Routine A stays empty", async () => {
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"] });
    netCtl.routines = [consultA];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    expect(card()).not.toBeNull();
    writes.length = 0;
    await backToHub();
    expect(routineWrites()).toEqual([]);
  });

  it("a session built on the fly for a client with no Routine A: the ticks make Routine A, with no plan", async () => {
    sessionDocs = running({ routineId: null, sessionMachineIds: ["m-leg-press"] });
    netCtl.routines = [];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    expect(card()!.textContent).toContain("Tick the ones that start Routine A.");
    writes.length = 0;
    await act(async () => tickFor("Leg Press (Hoist)").click());
    await backToHub();
    const out = routineWrites();
    expect(out).toHaveLength(1);
    expect(out[0].path).toMatch(/^routines\/auto-\d+$/);
    expect(out[0].data).toEqual({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["m-leg-press"], createdAt: { __server: true }, studioId: STUDIO_ID });
    // With its "created" record in the same batch, as the Edit routine drawer writes one.
    const record = writes.find((w) => w.path.startsWith("routineAdjustments/"))!;
    expect(record.batch).toBe(out[0].batch);
    expect(record.data).toMatchObject({
      clientId: CLIENT_ID,
      routineId: out[0].path.split("/")[1],
      previousMachineIds: [],
      newMachineIds: ["m-leg-press"],
      changeType: "created",
    });
  });

  // B, molded in (Round 2 of the design round): "When A changes during B's
  // build-out, the machines B hasn't swapped yet follow A (they are A's),
  // and B's own swaps stay" (the research, §5.3; the critic's #25: nothing
  // wrote it). The Wrap-up's ticks into Routine A take Routine B along, in
  // the same batch.
  it("ticks into Routine A take Routine B with them in the same batch: B's swap kept, its unswapped places following A", async () => {
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"] });
    netCtl.routines = [
      {
        id: "ra-1",
        data: () => ({
          clientId: CLIENT_ID,
          name: "Routine A",
          machineIds: ["m-leg-press"],
          plan: { purpose: "", intended: ["m-leg-press", "sm-solon-rear-delt"], building: true, madeByUid: "uid-coach" },
        }),
      },
      {
        id: "rb-1",
        data: () => ({
          clientId: CLIENT_ID,
          name: "Routine B",
          machineIds: ["m-ext"],
          plan: { purpose: "Variety", purposeKinds: ["variety"], intended: ["m-ext"], swaps: [{ replaces: "m-leg-press", with: "m-ext" }], building: false, madeByUid: "uid-coach" },
        }),
      },
    ];
    netCtl.logs = [performed("m-leg-press"), performed("sm-solon-rear-delt")];
    await finishToWrapUp();
    // Being built, with machines in Routine A: today's new machine starts ticked.
    expect(tickFor("Rear Delt Hoist").getAttribute("aria-checked")).toBe("true");
    writes.length = 0;
    await backToHub();
    const out = routineWrites();
    expect(out.map((w) => w.path.replace(/auto-\d+/, "*"))).toEqual(["routines/ra-1", "routines/ra-1/planChanges/*", "routines/rb-1"]);
    expect(new Set(out.map((w) => w.batch)).size).toBe(1);
    expect(out[0].data.machineIds).toEqual(["m-leg-press", "sm-solon-rear-delt"]);
    expect(out[2].data).toEqual({ machineIds: ["m-ext", "sm-solon-rear-delt"], "plan.intended": ["m-ext", "sm-solon-rear-delt"] });
  });

  /*
   * A and B together (the studio setting `newClientsStart`, item 8). AJ, Oct
   * 7 2026: "Some studios may start building an A and B routine immediately
   * for a client", and B "starts out as the A routine with just one machine
   * different". Routine B was planned with the starting lineup and kept with
   * no machines; the consult's Wrap-up, whose ticks START Routine A, starts B
   * as A with its first swap and turns B on, in the same batch.
   */
  it("the consult's ticks that start Routine A start a planned B too: A with one swap, and B on, in ONE batch", async () => {
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press"] });
    netCtl.routines = [
      {
        id: "ra-1",
        data: () => ({
          clientId: CLIENT_ID,
          name: "Routine A",
          machineIds: [],
          plan: { purpose: "", intended: ["m-leg-press"], dayOne: ["m-leg-press"], building: true, madeByUid: "uid-coach" },
        }),
      },
      {
        id: "rb-1",
        data: () => ({
          clientId: CLIENT_ID,
          name: "Routine B",
          machineIds: [],
          plan: {
            purpose: "Variety: the same regions, different machines",
            purposeKinds: ["variety"],
            intended: ["sm-solon-rear-delt"],
            swaps: [{ replaces: "m-leg-press", with: "sm-solon-rear-delt" }],
            building: false,
            madeByUid: "uid-coach",
          },
        }),
      },
    ];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    expect(card()!.textContent).toContain("Tick the ones that start Routine A.");
    expect(card()!.textContent).not.toContain("Routine B starts too");
    await act(async () => tickFor("Leg Press (Hoist)").click());
    // Said live as the ticks change.
    expect(card()!.textContent).toContain("Routine B starts too: Rear Delt Hoist for Leg Press (Hoist). A and B alternate from the next visit.");
    writes.length = 0;
    await backToHub();
    const out = routineWrites();
    expect(out.map((w) => w.path.replace(/auto-\d+/, "*"))).toEqual([
      "routines/ra-1",
      "routines/ra-1/planChanges/*",
      "routines/rb-1",
      "routines/rb-1/planChanges/*",
    ]);
    // ONE batch: A's ticks and B started, together or not at all.
    expect(new Set(out.map((w) => w.batch)).size).toBe(1);
    // Changed on purpose (the whole-branch review, Oct 9 2026): B on rode in
    // that batch, so a client the rules refuse an update to threw away the
    // ticks that start Routine A. B goes on by its own write, once the batch
    // has landed (a batch refused leaves B off).
    const bOn = writes.filter((w) => w.path === `clients/${CLIENT_ID}` && w.data && "isRoutineBActive" in w.data);
    expect(bOn).toHaveLength(1);
    expect(bOn[0].data).toEqual({ isRoutineBActive: true });
    expect(bOn[0].batch, "its own write, never in the batch").toBeUndefined();
    expect(writes.indexOf(bOn[0])).toBeGreaterThan(writes.indexOf(out[out.length - 1]));
    expect(out[0].data.machineIds).toEqual(["m-leg-press"]);
    // B starts as A with one machine different.
    expect(out[2].data.machineIds).toEqual(["sm-solon-rear-delt"]);
    expect(out[2].data.plan.swaps).toEqual([{ replaces: "m-leg-press", with: "sm-solon-rear-delt" }]);
    expect(out[3].data).toEqual({
      kind: "start",
      machineIds: ["m-leg-press", "sm-solon-rear-delt"],
      value: "B",
      byUid: "uid-coach",
      byName: "Jane Coach",
      at: { __server: true },
    });
  });

  it("a session another iPad already finished has no Next time: that iPad writes its own", async () => {
    // The review (Oct 9 2026): both iPads wrote, two "add" entries on the
    // plan or two Routine As; pain notes already skip this case.
    finishCtl.serverStatus = "Completed";
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"] });
    netCtl.routines = [consultA];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    expect(document.body.textContent).toContain("already finished on another iPad");
    expect(card()).toBeNull();
    writes.length = 0;
    await backToHub();
    expect(routineWrites()).toEqual([]);
  });

  it("a machine the plan let go during the session (its set already logged) is never offered back", async () => {
    // Routine A has the Rear Delt and is being built; Leg Press is next on the road.
    const built = (intended: string[]) => ({
      id: "ra-1",
      data: () => ({
        clientId: CLIENT_ID,
        name: "Routine A",
        machineIds: ["sm-solon-rear-delt"],
        plan: { purpose: "", intended, building: true, madeByUid: "uid-coach" },
      }),
    });
    const both = () => {
      sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["sm-solon-rear-delt", "m-leg-press"] });
      netCtl.logs = [performed("sm-solon-rear-delt"), performed("m-leg-press")];
    };

    // Nothing changed: Leg Press joins, ticked while Routine A is being built.
    both();
    netCtl.routines = [built(["sm-solon-rear-delt", "m-leg-press"])];
    await finishToWrapUp();
    expect(tickFor("Leg Press (Hoist)").getAttribute("aria-checked")).toBe("true");
    for (const m of mounted) {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
    mounted = [];

    // Re-planned mid-session after Leg Press's set ("Today's set stays. The
    // plan changes from next session."): it is not offered back.
    both();
    netCtl.routines = [built(["sm-solon-rear-delt", "m-leg-press"])];
    const host = await mount(<Tracker />);
    netCtl.routines = [built(["sm-solon-rear-delt"])];
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "routines")) l.emit();
    });
    await settle();
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
    await act(async () => finish.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    expect(card()).toBeNull();
    writes.length = 0;
    await backToHub();
    expect(routineWrites()).toEqual([]);
  });

  it("a session started here as Routine A for a client with no routine has Next time, even over the whole floor", async () => {
    // The review (Oct 9 2026): how this iPad started the session wins over
    // the whole-floor guess, which is only for a session resumed after a
    // reload. (The briefing offers no Free start today, so a Free session
    // reaches the Wrap-up only that way: the test above.)
    sessionDocs = [];
    netCtl.routines = [];
    const before = { ...client, sessionCount: 4, historyIsComplete: true } as Client;
    const host = await mount(<Tracker who={before} />);
    await settle();
    await act(async () => document.querySelector<HTMLButtonElement>(".br__cta")!.click());
    await settle();
    const started = writes.find((w) => w.path.startsWith("sessions/auto-") && w.data?.status === "In-Progress")!;
    const sid = started.path.split("/")[1];
    expect(started.data.routineId).toBeNull();
    // The trainer ran both machines on the floor as they went.
    sessionDocs = [{ id: sid, data: () => ({ ...SESSION_DOCS[0].data(), routineId: null, sessionMachineIds: ["m-leg-press", "sm-solon-rear-delt"] }) }];
    netCtl.logs = ["m-leg-press", "sm-solon-rear-delt"].map((machineId) => ({
      id: `${sid}_${machineId}`,
      data: () => ({ sessionId: sid, clientId: CLIENT_ID, machineId, weight: "100", reps: "10", studioId: STUDIO_ID }),
    }));
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && (x.path === "sessions" || x.path === "exerciseLogs"))) l.emit();
    });
    await settle();
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    const finish = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Finish session")!;
    await act(async () => finish.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    expect(card()!.textContent).toContain("Tick the ones that start Routine A.");
    expect(tickFor("Leg Press (Hoist)").getAttribute("aria-checked")).toBe("false");
    expect(tickFor("Rear Delt Hoist")).toBeTruthy();
  });

  it("a refusal is said in a toast, and the Hub came at once", async () => {
    sessionDocs = running({ routineId: "ra-1", sessionMachineIds: ["m-leg-press"] });
    netCtl.routines = [consultA];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    await act(async () => tickFor("Leg Press (Hoist)").click());
    netCtl.refuseLater = true;
    await backToHub();
    expect(setViewSpy).toHaveBeenCalledWith("clients");
    await act(async () => {
      for (const refuse of netCtl.refusals) refuse(new Error("permission-denied"));
    });
    await settle();
    expect(document.body.textContent).toContain("Next time didn't save. Add the machines to Routine A on Programming.");
  });

  /*
   * Changed on purpose in the open session round (Oct 9 2026). This test
   * read a session with no routine whose RECORDED list was the whole floor
   * as Free. Since AJ's "1b" ("i think the open session should honestly feel
   * most like a filemaker session ... but also i want to be able to take
   * advantage of our routine builder so we can use it if we wanted too"),
   * the floor is a view and a session records only what was added: a
   * recorded list is what the trainer chose, however much of the floor, and
   * has Next time (the test after this one). A true old Free session is one
   * with no list of its own that ran the whole floor, as here.
   */
  it("no Next time for an old Free session (no routine, no list of its own, the whole floor), nor when the client has a Routine A it didn't run", async () => {
    sessionDocs = running({ routineId: null, sessionMachineIds: undefined });
    netCtl.routines = [];
    netCtl.logs = [performed("m-leg-press")];
    await finishToWrapUp();
    expect(card()).toBeNull();
    for (const m of mounted) {
      await act(async () => m.root.unmount());
      m.host.remove();
    }
    mounted = [];

    sessionDocs = running({ routineId: null, sessionMachineIds: ["m-leg-press"] });
    netCtl.routines = [{ id: "ra-1", data: () => ({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["sm-solon-rear-delt"] }) }];
    await finishToWrapUp();
    expect(card()).toBeNull();
  });

  /*
   * The FileMaker floor's bridge to the routine builder (the open session
   * round, Oct 9 2026; AJ's "1b"): a client session with no routine records
   * only what was added with +, so the Wrap-up's Next time can start Routine
   * A from it, even when every machine on the floor was added. This one is
   * resumed (no record on this iPad of how it started), the case the old
   * whole-floor guess read as Free. An open session reads the same once
   * Who's this? has given it a client: its Finish is the ordinary one (the
   * Who's this? describe below, "at Finish: Choose the client ... Next time").
   */
  it("a client session with no routine, resumed, whose list is what was added: Next time starts Routine A from it, even over the whole floor", async () => {
    // No routine; added with + in the order done: the floor's two, the second first.
    sessionDocs = running({ isUnassigned: false, sessionMachineIds: ["sm-solon-rear-delt", "m-leg-press"] });
    netCtl.routines = [];
    netCtl.logs = [performed("sm-solon-rear-delt"), performed("m-leg-press")];
    await finishToWrapUp();
    expect(card(), "Next time is offered").not.toBeNull();
    expect(card()!.textContent).toContain("Tick the ones that start Routine A.");
    expect(tickFor("Rear Delt Hoist").getAttribute("aria-checked")).toBe("false");
    expect(tickFor("Leg Press (Hoist)").getAttribute("aria-checked")).toBe("false");
    writes.length = 0;
    await act(async () => tickFor("Rear Delt Hoist").click());
    await backToHub();
    const out = routineWrites();
    expect(out).toHaveLength(1);
    expect(out[0].data).toMatchObject({ clientId: CLIENT_ID, name: "Routine A", machineIds: ["sm-solon-rear-delt"] });
  });
});

/* ------------------------------------------------------------------ *
 * Who's this? (the open session round, Oct 9 2026; finding 3)
 * ------------------------------------------------------------------ */

/**
 * AJ's picks "1b 2a 3a" (docs/rounds/2026-10-09-open-session.md §3): "Who's
 * this? in the session bar assigns the client at any time, or still at
 * Finish. After that it is an ordinary client session: the client's
 * settings, history, the Wrap-up and Next time." Assign used to await every
 * step, write the sets one at a time (refused by the rules), mark the session
 * Completed and open the profile, so Finish never ran, and New client left
 * the session behind.
 */
/** A write's field set to deleteField(): the set lets go of what it held. */
const lettingGo = (v: unknown) => !!v && typeof v === "object" && (v as { _methodName?: string })._methodName === "deleteField";

describe("Who's this? gives an open session its client (the open session round, Oct 9 2026)", () => {
  const OPEN_ID = "sess-open";
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  /** The open session as the database holds it: Open session's fields, with every write to it since laid over them. */
  const openSessionAsWritten = () => {
    const now = new Date();
    const out: Record<string, unknown> = {
      isUnassigned: true,
      status: "In-Progress",
      sessionType: "Standard",
      sessionNumber: 0,
      trainerId: "t-doc",
      startedByTrainerId: "t-doc",
      trainerInitials: "JC",
      hostedAtStudioId: STUDIO_ID,
      clientHomeStudioId: null,
      sessionMachineIds: ["m-leg-press"],
      startTime: now,
      lastHeartbeatAt: now,
      createdAt: now,
    };
    for (const w of writes) {
      if (w.path !== `sessions/${OPEN_ID}`) continue;
      for (const [k, v] of Object.entries(w.data ?? {})) {
        if (v && typeof v === "object" && "__server" in (v as object)) continue;
        // A delete, and a dotted path (a set-up held on the session), as Firestore applies them.
        if ((v as { _methodName?: string } | null)?._methodName === "deleteField") {
          delete out[k];
          continue;
        }
        const [head, ...rest] = k.split(".");
        if (rest.length > 0) out[head] = { ...((out[head] as object) ?? {}), [rest.join(".")]: v };
        else out[k] = v;
      }
    }
    return out;
  };
  /** A set on the open session, typed before anyone knew who it was: no client. */
  const openSet = (machineId: string) => ({
    id: `${OPEN_ID}_${machineId}`,
    data: () => ({ sessionId: OPEN_ID, machineId, weight: "100", reps: "10", studioId: STUDIO_ID }),
  });
  /** What AppContent does with the client on screen: the tracker sets it, and it comes back as the clientId. */
  const chosen: (string | null)[] = [];
  /** Which of AppContent's setters each change came through: the one that asks first, or the raw one. */
  const via: ("asks" | "now")[] = [];
  function Floor({ people = [client], onStart }: { people?: Client[]; onStart?: () => void }) {
    const [cid, setCid] = useState<string | null>(null);
    return (
      <WorkoutTrackerView
        onStartOpenSession={onStart}
        clientId={cid}
        clients={people}
        machines={appWideMachines}
        trainers={[trainer]}
        user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
        setView={setViewSpy}
        setSelectedClientId={(id) => {
          chosen.push(id);
          via.push("asks");
          setCid(id);
        }}
        setSelectedClientIdNow={(id) => {
          chosen.push(id);
          via.push("now");
          setCid(id);
        }}
        authTrainer={trainer}
        isSyncing={false}
        setIsSyncing={vi.fn()}
        schedules={[]}
      />
    );
  }
  beforeEach(() => {
    chosen.length = 0;
    via.length = 0;
    // The client's sessions stream holds this session once the batch has given it the client, not before.
    netCtl.filterSessions = true;
    sessionDocs = [{ id: OPEN_ID, data: openSessionAsWritten }];
    netCtl.logs = [openSet("m-leg-press"), openSet("sm-solon-rear-delt")];
  });

  const barName = (host: HTMLElement) => host.querySelector(".jg-sbar__name")?.textContent;
  const whoButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>("button.jg-sbar__btn--who");
  const button = (text: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text);
  const pick = async (name: string) => {
    const row = Array.from(document.querySelectorAll('[data-testid="client-picker-name"]')).find((n) => n.textContent === name);
    expect(row, `${name} in the picker`).toBeTruthy();
    await act(async () => (row!.closest("button") as HTMLButtonElement).click());
    await settle();
    await settle();
    // The iPad's copy has the batch now: the client's sessions stream says so, as Firestore's own cache does.
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "sessions")) l.emit();
    });
    await settle();
  };
  const sessionAssignWrite = () =>
    writes.find((w) => w.path === `sessions/${OPEN_ID}` && w.data?.isUnassigned === false && (w.batch ?? 0) > 0);
  const type = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  /** Taps a name in the picker and nothing more: the reads may still be out. */
  const tapName = async (name: string) => {
    const row = Array.from(document.querySelectorAll('[data-testid="client-picker-name"]')).find((n) => n.textContent === name);
    expect(row, `${name} in the picker`).toBeTruthy();
    await act(async () => (row!.closest("button") as HTMLButtonElement).click());
  };
  const gate = () => {
    let open!: () => void;
    netCtl.readGate = new Promise<void>((r) => (open = r));
    return async () => {
      await act(async () => {
        open();
        await new Promise((r) => setTimeout(r, 0));
      });
      await settle();
    };
  };
  /** The new client Add client wrote: its id is made on the iPad. */
  const madeClient = (first: string) => writes.find((w) => /^clients\/auto-\d+$/.test(w.path) && w.data?.firstName === first);
  const addClient = async (first: string, last: string) => {
    expect(document.body.textContent).toContain("Add a client");
    await type(document.querySelector<HTMLInputElement>('input[placeholder="First"]')!, first);
    await type(document.querySelector<HTMLInputElement>('input[placeholder="Last"]')!, last);
    await act(async () => button("Create temporary profile")!.click());
    await settle();
    await settle();
  };

  it("an open session says so, and its bar has Who's this? in place of Notes and Pulse", async () => {
    const host = await mount(<Floor />);
    expect(barName(host)).toBe("Open session");
    expect(whoButton(host)).toBeTruthy();
    expect(whoButton(host)!.textContent).toContain("Who's this?");
    expect(host.querySelector('button[aria-label="Session notes"]')).toBeNull();
  });

  it("mid-session: the session carries on as the client's, at once and offline, with the client's listeners open", async () => {
    netCtl.hang = true; // offline: no write ever answers
    const host = await mount(<Floor />);
    const openListeners = snapshotListeners.filter(
      (l) => l.path === "sessions" && (l.where ?? []).some((w) => w.field === "isUnassigned"),
    );
    expect(openListeners.length).toBeGreaterThan(0);
    await act(async () => whoButton(host)!.click());
    expect(document.body.textContent).toContain("Choose the client. The session carries on as theirs.");
    await pick("Judy Client");

    // The same session, now the client's: no new session, nothing finished, no profile.
    expect(chosen).toEqual([CLIENT_ID]);
    expect(barName(host)).toBe("Judy Client");
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(whoButton(host)).toBeNull();
    expect(host.querySelector('button[aria-label="Session notes"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="nothing-on-screen"]')).toBeNull();
    expect(writes.filter((w) => w.path.startsWith("sessions/auto-"))).toEqual([]);
    expect(writes.some((w) => w.data?.status === "Completed")).toBe(false);
    expect(setViewSpy).not.toHaveBeenCalledWith("profile");
    // The open sessions' listener closed; the client's settings and routines opened.
    expect(openListeners.every((l) => !l.live)).toBe(true);
    for (const coll of ["clientMachineSettings", "routines"]) {
      const live = snapshotListeners.filter((l) => l.live && l.path === coll);
      expect(live.length, coll).toBeGreaterThan(0);
      expect(live.every((l) => (l.where ?? []).some((w) => w.field === "clientId" && w.value === CLIENT_ID)), coll).toBe(true);
    }
    // Today's list is the session's still: the machine added stays added.
    expect(host.querySelector('[aria-label$="machines logged"]')?.getAttribute("aria-label")).toMatch(/of 1 machines logged$/);
  });

  it("is ONE batch: the session gets the client's fields as Start writes them, and every set of the session gets the client", async () => {
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");

    const session = sessionAssignWrite()!;
    expect(session, "the session's write").toBeTruthy();
    expect(session.data).toMatchObject({
      clientId: CLIENT_ID,
      isUnassigned: false,
      clientName: "Judy Client",
      homeStudioId: STUDIO_ID,
      clientHomeStudioId: STUDIO_ID,
      isCrossTrain: false,
      // Her count is 11: this is her twelfth, numbered as Start numbers it.
      sessionNumber: 12,
      mindbodyClientId: null,
    });
    expect(session.data.status, "still running").toBeUndefined();
    const sets = writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.clientId === CLIENT_ID);
    expect(sets.map((w) => w.path).sort()).toEqual([`exerciseLogs/${OPEN_ID}_m-leg-press`, `exerciseLogs/${OPEN_ID}_sm-solon-rear-delt`]);
    for (const w of sets) {
      expect(w.batch, `${w.path} in the session's batch`).toBe(session.batch);
      expect(w.merge, `${w.path} merged: its numbers untouched`).toBe(true);
      expect(w.data).toEqual({
        sessionId: OPEN_ID,
        machineId: w.path.endsWith("m-leg-press") ? "m-leg-press" : "sm-solon-rear-delt",
        clientId: CLIENT_ID,
        homeStudioId: STUDIO_ID,
        clientHomeStudioId: STUDIO_ID,
      });
    }
    // Never one set at a time outside the batch.
    expect(writes.filter((w) => w.path.startsWith("exerciseLogs/") && !w.batch && w.data?.clientId)).toEqual([]);
    // The iPad's copy holds every set (its sets listener had the server's answer): the server isn't asked.
    expect(netCtl.serverLogReads).toBe(0);
    // Her twelfth session: her first Journey day is not hers to mark again.
    expect(writes.some((w) => w.path === `clients/${CLIENT_ID}` && w.data && "firstSessionDate" in w.data)).toBe(false);
    // Asked about at the tap, the client on screen changes without asking again.
    expect(via).toEqual(["now"]);
  });

  it("a late answer from the open sessions' listener, the session gone from it, never takes the session off the screen", async () => {
    const host = await mount(<Floor />);
    const openListeners = snapshotListeners.filter(
      (l) => l.path === "sessions" && (l.where ?? []).some((w) => w.field === "isUnassigned"),
    );
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    // Firestore may answer a listener once more as it closes: the session has left the open ones.
    await act(async () => {
      for (const l of openListeners) l.emit();
    });
    await settle();
    expect(barName(host)).toBe("Judy Client");
    // The session itself, not just the client's name: its progress and its clock are still drawn.
    expect(host.querySelector('[aria-label$="machines logged"]')).toBeTruthy();
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(host.querySelector('[data-testid="nothing-on-screen"]')).toBeNull();
  });

  it("gives it to one client only, when two are tapped at once as the picker closes", async () => {
    const other = { ...client, id: "c-sam", firstName: "Sam", lastName: "Other", sessionCount: 2 } as Client;
    const host = await mount(<Floor people={[client, other]} />);
    await act(async () => whoButton(host)!.click());
    const rows = Array.from(document.querySelectorAll('[data-testid="client-picker-name"]')).map((n) => n.closest("button") as HTMLButtonElement);
    await act(async () => {
      rows[0].click();
      rows[1].click();
    });
    await settle();
    await settle();
    const assigns = writes.filter((w) => w.path === `sessions/${OPEN_ID}` && w.data?.isUnassigned === false);
    expect(assigns).toHaveLength(1);
    expect(chosen).toHaveLength(1);
  });

  it("a set still on the typing timer is sent first, with no client, then named in the batch", async () => {
    netCtl.logs = []; // nothing on record yet: the set typed is on this iPad only
    const host = await mount(<Floor />);
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]');
    expect(reps).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reps!, "11");
      reps!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const legPress = `exerciseLogs/${OPEN_ID}_m-leg-press`;
    expect(writes.filter((w) => w.path === legPress), "still on the typing timer").toHaveLength(0);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    const sent = writes.findIndex((w) => w.path === legPress && w.data?.reps === "11");
    const named = writes.findIndex((w) => w.path === legPress && w.data?.clientId === CLIENT_ID);
    expect(sent, "sent").toBeGreaterThanOrEqual(0);
    expect(writes[sent].data.clientId, "sent before anyone knew who it was").toBeUndefined();
    expect(named, "named in the batch").toBeGreaterThan(sent);
    expect(writes[named].batch).toBe(sessionAssignWrite()!.batch);
  });

  it("with the iPad's copy unreadable, still names every set the screen holds", async () => {
    netCtl.cacheFails = true;
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    const session = sessionAssignWrite()!;
    expect(session).toBeTruthy();
    const sets = writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.clientId === CLIENT_ID && w.batch === session.batch);
    expect(sets).toHaveLength(2);
  });

  it("at Finish: Choose the client, then the End session question comes back as the client's, and its Finish runs the Wrap-up with Next time", async () => {
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("Who is this session for?");
    await act(async () => button("Choose the client")!.click());
    expect(document.body.textContent).toContain("Choose the client, then finish their session.");
    await pick("Judy Client");

    // The question is back, now the client's: the note for the next trainer and Finish session.
    expect(document.body.textContent).toContain("Note for the next trainer");
    expect(document.body.textContent).not.toContain("Who is this session for?");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();

    expect(document.body.textContent).toContain("Wrap-up · session saved");
    expect(setViewSpy).not.toHaveBeenCalledWith("profile");
    const finished = writes.find((w) => w.path === `sessions/${OPEN_ID}` && w.data?.status === "Completed")!;
    expect(finished.data.clientId).toBe(CLIENT_ID);
    expect(writes.some((w) => w.path === `clients/${CLIENT_ID}` && w.data?.completedSessions)).toBe(true);
    // Next time: the open session's machine, offered to start Routine A.
    const card = document.querySelector('[data-testid="next-time"]');
    expect(card, "Next time").not.toBeNull();
    expect(card!.textContent).toContain("Tick the ones that start Routine A.");
    expect(card!.textContent).toContain("Leg Press (Hoist)");
  });

  it("a refused batch is said in a toast, and the session is open again on screen, never a blank one", async () => {
    netCtl.refuseLater = true;
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    expect(barName(host)).toBe("Judy Client");
    const session = sessionAssignWrite()!;
    // The database refuses it: its writes never landed.
    for (let i = writes.length - 1; i >= 0; i--) if (writes[i].batch === session.batch) writes.splice(i, 1);
    await act(async () => {
      for (const refuse of netCtl.refusals.splice(0)) refuse(new Error("permission-denied"));
    });
    await settle();
    await settle();
    expect(document.body.textContent).toContain(
      "The session didn't go onto Judy's record, so it is still open. Check the connection, then press Who's this? again.",
    );
    expect(chosen).toEqual([CLIENT_ID, null]);
    expect(barName(host)).toBe("Open session");
    expect(whoButton(host)).toBeTruthy();
    expect(host.querySelector('[data-testid="nothing-on-screen"]')).toBeNull();
  });

  it("New client from Finish adds the person and gives them this session, which is never left behind", async () => {
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("New client")!.click());
    await addClient("Ana", "Walkin");

    // The new client was written (its id made on the iPad), and the session given to them.
    const made = madeClient("Ana")!;
    expect(made, "the new client's write").toBeTruthy();
    const newId = made.path.split("/")[1];
    expect(chosen).toEqual([newId]);
    expect(sessionAssignWrite()!.data).toMatchObject({ clientId: newId, clientName: "Ana Walkin", sessionNumber: 1, clientHomeStudioId: STUDIO_ID });
    expect(writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.clientId === newId)).toHaveLength(2);
    // Her first session: her first Journey day is marked, as a client Start marks it, in its own write.
    const firstDay = writes.find((w) => w.path === `clients/${newId}` && w.data?.firstSessionDate);
    expect(firstDay, "her first Journey day").toBeTruthy();
    expect(firstDay!.batch ?? 0).toBe(0);
    // Still the session, now hers, before the studio's client list has her; the question is back as hers.
    expect(barName(host)).toBe("Ana Walkin");
    expect(document.body.textContent).not.toContain("Add a client");
    expect(button("Finish session")).toBeTruthy();
    expect(setViewSpy).not.toHaveBeenCalledWith("clients");
  });

  it("New client from Who's this? mid-session, offline: the session carries on as the new client's, in the same tap", async () => {
    netCtl.hang = true; // offline: the new client's write never answers, and nothing waits for it
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await act(async () => button("New client")!.click());
    await addClient("Ana", "Walkin");
    const newId = madeClient("Ana")!.path.split("/")[1];
    expect(chosen).toEqual([newId]);
    expect(sessionAssignWrite()!.data.clientId).toBe(newId);
    expect(barName(host)).toBe("Ana Walkin");
    expect(host.querySelector(".jg-sbar__finish")).toBeTruthy();
    expect(button("Finish session")).toBeUndefined();
  });

  /* The review's findings (Oct 9 2026). */
  it("a set typed while the reads are out is in the batch: the sets are gathered when it is built, never at the tap", async () => {
    netCtl.logs = []; // nothing on record yet
    const open = gate();
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await tapName("Judy Client");
    expect(sessionAssignWrite(), "not built yet: the reads are out").toBeUndefined();
    // The screen did not wait: the session is hers, and a set is typed on it.
    expect(barName(host)).toBe("Judy Client");
    const reps = host.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    await type(reps, "12");
    await open();
    const legPress = `exerciseLogs/${OPEN_ID}_m-leg-press`;
    const sent = writes.findIndex((w) => w.path === legPress && w.data?.reps === "12");
    const named = writes.findIndex((w) => w.path === legPress && w.data?.clientId === CLIENT_ID && w.batch === sessionAssignWrite()!.batch);
    expect(sent, "sent first, with no client").toBeGreaterThanOrEqual(0);
    expect(writes[sent].data.clientId).toBeUndefined();
    expect(named, "named in the batch").toBeGreaterThan(sent);
  });

  it("when the iPad's copy may not hold every set (its sets listener hasn't had the server's answer), the server's list is read and every set named", async () => {
    netCtl.hold.add("exerciseLogs"); // the sets listener never answers
    netCtl.cacheEmpty = true; // typed on another iPad: this one's copy has none
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    expect(netCtl.serverLogReads).toBe(1);
    const session = sessionAssignWrite()!;
    const sets = writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.data?.clientId === CLIENT_ID && w.batch === session.batch);
    expect(sets.map((w) => w.path).sort()).toEqual([`exerciseLogs/${OPEN_ID}_m-leg-press`, `exerciseLogs/${OPEN_ID}_sm-solon-rear-delt`]);
  });

  it("Finish tapped while the reads are out: the assign is issued first, with what is known, and Finish never waits", async () => {
    const open = gate();
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await tapName("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    const assign = sessionAssignWrite()!;
    const finished = writes.find((w) => w.path === `sessions/${OPEN_ID}` && w.data?.status === "Completed")!;
    expect(assign, "the assign").toBeTruthy();
    expect(assign.batch!).toBeLessThan(finished.batch!);
    // The sets the screen held were named in it.
    expect(writes.filter((w) => w.path.startsWith("exerciseLogs/") && w.batch === assign.batch && w.data?.clientId === CLIENT_ID)).toHaveLength(2);
    await open(); // the reads answer late: nothing is issued twice
    expect(writes.filter((w) => w.path === `sessions/${OPEN_ID}` && w.data?.clientId === CLIENT_ID && w.data?.status !== "Completed")).toHaveLength(1);
    // Finish closes the session too, so it is the assign if the assign was refused (the whole-branch review, Oct 9 2026).
    expect(finished.data.isUnassigned).toBe(false);
  });

  it("Finish straight after Who's this?, before the client's settings answer: her saved settings and starting weight are left alone", async () => {
    netCtl.hold.add("clientMachineSettings");
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await pick("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    const setting = writes.find((w) => w.path === `clientMachineSettings/${CLIENT_ID}_m-leg-press`)!;
    expect(setting, "today's weight is still written").toBeTruthy();
    expect(setting.data.currentWeight).toBe(100);
    for (const kept of ["settings", "startingWeight", "startingWeightDate"]) expect(setting.data, kept).not.toHaveProperty(kept);
  });

  it("the same when the iPad's cache answers her settings empty: empty from the cache is not 'nothing on file'", async () => {
    netCtl.fromCache.add("clientMachineSettings");
    netCtl.noBaseSettings = true; // this iPad never read them
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await pick("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    const setting = writes.find((w) => w.path === `clientMachineSettings/${CLIENT_ID}_m-leg-press`)!;
    expect(setting.data).not.toHaveProperty("settings");
    expect(setting.data).not.toHaveProperty("startingWeight");
  });

  it("a refused batch sends the session's sets again letting go of the client, and takes the client back without asking", async () => {
    netCtl.refuseLater = true;
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    const session = sessionAssignWrite()!;
    for (let i = writes.length - 1; i >= 0; i--) if (writes[i].batch === session.batch) writes.splice(i, 1);
    const before = writes.length;
    await act(async () => {
      for (const refuse of netCtl.refusals.splice(0)) refuse(new Error("permission-denied"));
    });
    await settle();
    const resent = writes.slice(before).filter((w) => w.path.startsWith("exerciseLogs/"));
    expect(resent.map((w) => w.path).sort()).toEqual([`exerciseLogs/${OPEN_ID}_m-leg-press`, `exerciseLogs/${OPEN_ID}_sm-solon-rear-delt`]);
    for (const w of resent) {
      expect(w.merge).toBe(true);
      // Let go of, not just left out (the whole-branch review, Oct 9 2026): a set typed after the tap landed with it.
      expect(lettingGo(w.data.clientId), w.path).toBe(true);
      expect(w.data.weight).toBe("100");
      expect(w.data.reps).toBe("10");
    }
    expect(barName(host)).toBe("Open session");
    // Never through the setter that asks: there is nothing left behind to ask about.
    expect(via).toEqual(["now", "now"]);
  });

  it("a refusal that lands after the trainer left the screen is said, and changes nothing on the screen they are on now", async () => {
    netCtl.refuseLater = true;
    function Away() {
      const [here, setHere] = useState(true);
      return (
        <>
          <button type="button" data-testid="leave" onClick={() => setHere(false)}>
            Leave
          </button>
          {here && <Floor />}
        </>
      );
    }
    const host = await mount(<Away />);
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    await act(async () => (host.querySelector('[data-testid="leave"]') as HTMLButtonElement).click());
    const before = writes.length;
    await act(async () => {
      for (const refuse of netCtl.refusals.splice(0)) refuse(new Error("permission-denied"));
    });
    await settle();
    expect(document.body.textContent).toContain("so it is still open");
    // The client chosen stays chosen: nothing reaches for the screen the trainer is on now.
    expect(chosen).toEqual([CLIENT_ID]);
    // The sets are still sent again, letting go of the client.
    const resent = writes.slice(before).filter((w) => w.path.startsWith("exerciseLogs/"));
    expect(resent.length).toBeGreaterThan(0);
    for (const w of resent) expect(lettingGo(w.data.clientId), w.path).toBe(true);
  });

  it("a refusal that lands after Finish ran says nothing about Who's this?: Finish's own batch names the client", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    netCtl.refuseLater = true;
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await pick("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    // The assign's batch is refused, late.
    await act(async () => {
      netCtl.refusals[0](new Error("permission-denied"));
    });
    await settle();
    expect(document.body.textContent).not.toContain("press Who's this? again");
    expect(document.body.textContent).toContain("Wrap-up · session saved");
  });
  /* SETTINGS HELD ON THE SESSION (the open session round, Oct 9 2026; AJ's
     "3a": "Settings typed before the client is chosen are kept on the
     session ... and saved to the client at Assign"). */
  const openCard = async (host: HTMLElement, machine: string) => {
    const door = [...host.querySelectorAll<HTMLButtonElement>(".jg-machine__btn")].find((b) => b.textContent?.includes(machine));
    expect(door, `${machine}'s name`).toBeTruthy();
    await act(async () => door!.click());
    await settle();
  };
  /** Sets one empty dial in the open card and saves: Save closes the card, from every door (AJ's "1a", Oct 10 2026). */
  const keepDial = async (label: string, value: string) => {
    const empty = document.querySelector<HTMLButtonElement>(`.mm-dialog button[aria-label="${label}: not set. Set it"]`);
    expect(empty, `${label} is not set`).toBeTruthy();
    await act(async () => empty!.click());
    await type(document.querySelector<HTMLInputElement>('.mm-dialog [data-editor="field"] input')!, value);
    const save = [...document.querySelectorAll<HTMLButtonElement>(".mm-dialog button")].find((b) => /^Save /.test(b.textContent ?? ""));
    await act(async () => save!.click());
    await settle();
  };
  const heldWrites = () => writes.filter((w) => w.path === `sessions/${OPEN_ID}` && Object.keys(w.data ?? {}).some((k) => k.startsWith("heldSetup.")));
  const isDelete = (v: unknown) => (v as { _methodName?: string } | null)?._methodName === "deleteField";

  it("Who's this? saves the set-up held on the session to the client in the assign's batch, over what the client has, and clears it", async () => {
    const host = await mount(<Floor />);
    await openCard(host, "Leg Press (Hoist)");
    expect(document.querySelector(".mm-dialog [data-held]")).toBeTruthy();
    await keepDial("Seat Distance", "9");
    expect(heldWrites().map((w) => w.data)).toEqual([
      { "heldSetup.m-leg-press": { values: { "Seat Distance": "9" }, at: { __server: true }, byUid: "uid-coach" } },
    ]);
    expect(writes.filter((w) => w.path.startsWith("clientMachineSettings/")), "nothing for a client yet").toEqual([]);

    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");

    const session = sessionAssignWrite()!;
    expect(isDelete(session.data.heldSetup), "heldSetup cleared in the session's own write").toBe(true);
    const setting = writes.find((w) => w.path === `clientMachineSettings/${CLIENT_ID}_m-leg-press` && w.batch === session.batch)!;
    expect(setting, "the client's settings, in the same batch").toBeTruthy();
    expect(setting.merge).toBe(true);
    // Only the dial the session held: Seat Angle P2, which the client already has, is the database's to keep.
    expect(setting.data).toMatchObject({ clientId: CLIENT_ID, machineId: "m-leg-press", settings: { "Seat Distance": "9" }, updatedBy: "uid-coach" });
    expect(Object.keys(setting.data.settings)).toEqual(["Seat Distance"]);
    const history = writes.find((w) => /^machines\/m-leg-press\/settingHistory\//.test(w.path))!;
    expect(history.batch).toBe(session.batch);
    expect(history.data).toMatchObject({ clientId: CLIENT_ID, trainerId: "uid-coach", changeType: "SETTINGS", oldValue: "Seat Distance: 7", newValue: "Seat Distance: 9" });
    // Its journal copy is the client's, at this session's link, filed once the batch has committed.
    const copy = journalDocs.map((d) => d.data()).find((d) => d.machineId === "m-leg-press");
    expect(copy).toMatchObject({ clientId: CLIENT_ID, sessionId: OPEN_ID, origin: "in_session" });
    // The server said what the client had: her machine-fit row, whole, after the commit and outside the batch.
    const fit = writes.find((w) => w.path === `studios/${STUDIO_ID}/machineFit/m-leg-press`);
    expect(fit, "the client's machine-fit row").toBeTruthy();
    expect(fit!.batch ?? 0).toBe(0);
    // No write ever names clientId "": never the ghost `_{machineId}`.
    expect(writes.some((w) => w.data?.clientId === "")).toBe(false);
    expect(writes.some((w) => /^clientMachineSettings\/_/.test(w.path))).toBe(false);
  });

  it("a set-up kept while Who's this?'s reads are out goes to the client in the same batch", async () => {
    const open = gate();
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await tapName("Judy Client");
    expect(sessionAssignWrite(), "not built yet").toBeUndefined();
    // The session is the client's on screen; the client is not chosen yet: the card still keeps it on the session.
    await openCard(host, "Rear Delt Hoist");
    await keepDial("Seat", "12");
    expect(heldWrites()).toHaveLength(1);
    await open();
    const session = sessionAssignWrite()!;
    expect(isDelete(session.data.heldSetup)).toBe(true);
    const setting = writes.find((w) => w.path === `clientMachineSettings/${CLIENT_ID}_sm-solon-rear-delt`)!;
    expect(setting?.batch).toBe(session.batch);
    expect(setting.data.settings).toEqual({ Seat: "12" });
    expect(writes.some((w) => w.data?.clientId === "")).toBe(false);
    /* The review (Oct 9 2026): nothing was held at the tap, so the client's
       settings were never read. Her settings may hold more: no first set-up
       is claimed, and no machine-fit row replaces hers with only this dial. */
    const history = writes.find((w) => /^machines\/sm-solon-rear-delt\/settingHistory\//.test(w.path))!;
    expect(history.data).toMatchObject({ changeType: "SETTINGS", reason: "Settings update" });
    expect(writes.some((w) => /\/machineFit\//.test(w.path)), "no fit row off settings never read").toBe(false);
  });

  it("a refused assign leaves the set-up on the session, and the card still shows it", async () => {
    netCtl.refuseLater = true;
    const host = await mount(<Floor />);
    await openCard(host, "Leg Press (Hoist)");
    await keepDial("Seat Distance", "9");
    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    const session = sessionAssignWrite()!;
    for (let i = writes.length - 1; i >= 0; i--) if (writes[i].batch === session.batch) writes.splice(i, 1);
    await act(async () => {
      for (const refuse of netCtl.refusals.splice(0)) refuse(new Error("permission-denied"));
    });
    await settle();
    expect(barName(host)).toBe("Open session");
    // Nothing reached the client (the review: nor her journal, nor the studio's fit rows), and the session still holds the set-up.
    expect(writes.filter((w) => w.path.startsWith("clientMachineSettings/"))).toEqual([]);
    expect(journalDocs.map((d) => d.data()).filter((d) => d.machineId === "m-leg-press"), "no journal copy").toEqual([]);
    expect(writes.filter((w) => /\/machineFit\//.test(w.path)), "no fit row").toEqual([]);
    expect(openSessionAsWritten().heldSetup).toMatchObject({ "m-leg-press": { values: { "Seat Distance": "9" } } });
    await act(async () => {
      for (const l of snapshotListeners.filter((x) => x.live && x.path === "sessions")) l.emit();
    });
    await settle();
    // Save closed the card: opened again, it shows what the session still holds.
    expect(document.querySelector(".mm-dialog .mm-card")).toBeNull();
    await openCard(host, "Leg Press (Hoist)");
    const dial = document.querySelector('.mm-dialog [data-dial="Seat Distance"]');
    expect(dial?.textContent).toContain("9");
  });

  /* The review (Oct 9 2026). */
  const plusFor = (host: HTMLElement, name: string) =>
    host.querySelector<HTMLButtonElement>(`button.jg-today__add[aria-label="Add ${name} to today's session"]`);
  const setupButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-testid="nb-setup"]');

  it("Finish before the server answers the client's settings: the held set-up is moved, but no first set-up is claimed and no fit row written", async () => {
    netCtl.settingsServerGate = new Promise<void>(() => {}); // the server never answers in time
    const host = await mount(<Floor />);
    await openCard(host, "Rear Delt Hoist");
    await keepDial("Seat", "12");
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await tapName("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    const session = sessionAssignWrite()!;
    expect(isDelete(session.data.heldSetup)).toBe(true);
    const setting = writes.find((w) => w.path === `clientMachineSettings/${CLIENT_ID}_sm-solon-rear-delt` && w.batch === session.batch)!;
    expect(setting, "moved in the assign's batch").toBeTruthy();
    expect(setting.merge).toBe(true);
    expect(setting.data.settings).toEqual({ Seat: "12" });
    const history = writes.find((w) => /^machines\/sm-solon-rear-delt\/settingHistory\//.test(w.path))!;
    expect(history.data.changeType, "never a first set-up off a read the server didn't answer").toBe("SETTINGS");
    expect(writes.some((w) => /\/machineFit\//.test(w.path))).toBe(false);
    expect(writes.some((w) => w.data?.clientId === "")).toBe(false);
  });

  it("the toast's Undo after Who's this? takes nothing back: no set-up is kept on a session that has its client, and the toast says where it is", async () => {
    const host = await mount(<Floor />);
    await act(async () => plusFor(host, "Rear Delt Hoist")!.click());
    await act(async () => setupButton(host)!.click());
    await settle();
    await type(document.querySelector<HTMLInputElement>('.mm-dialog [data-block="settings"] [data-editor="field"] input')!, "12");
    const save = [...document.querySelectorAll<HTMLButtonElement>(".mm-dialog button")].find((b) => b.textContent === "Save set-up");
    await act(async () => save!.click());
    await settle();
    expect(heldWrites()).toHaveLength(1);
    const undo = [...document.querySelectorAll<HTMLButtonElement>("[data-toast-action]")].find((b) =>
      b.closest("[role]")?.textContent?.includes("kept on this session") ?? b.parentElement?.textContent?.includes("kept on this session"),
    );
    expect(undo, "the toast's Undo").toBeTruthy();

    await act(async () => whoButton(host)!.click());
    await pick("Judy Client");
    const session = sessionAssignWrite()!;
    expect(isDelete(session.data.heldSetup)).toBe(true);
    const settingWrites = () => writes.filter((w) => w.path.startsWith("clientMachineSettings/"));
    const before = settingWrites().length;

    await act(async () => undo!.click());
    await settle();
    await settle();
    expect(heldWrites(), "nothing kept on the session once it has its client").toHaveLength(1);
    expect(settingWrites(), "and nothing written to the client's settings").toHaveLength(before);
    expect(document.body.textContent).toContain("Rear Delt Hoist: already saved to Judy · change it on the machine's card");
  });

  /* The strip's Undo across Assign (a card that stays open as the session
     gets its client) is held in DialTiles.render.test.tsx: here the card
     draws again as the client's, and the strip goes with it. */

  it("a note about the client before Who's this? writes nothing and says to choose who this is", async () => {
    const host = await mount(<Floor />);
    await openCard(host, "Leg Press (Hoist)");
    const box = document.querySelector<HTMLTextAreaElement>(".mm-dialog .mm-cmp__text");
    expect(box, "the note box").toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Knee tracks in");
      box!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const add = [...document.querySelectorAll<HTMLButtonElement>(".mm-dialog button")].find((b) => b.textContent?.trim() === "Add note");
    expect(add, "Add note").toBeTruthy();
    await act(async () => add!.click());
    await settle();
    expect(document.querySelector(".mm-dialog")?.textContent).toContain("Choose who this is first (Who's this?) · your words stay here");
    expect(journalDocs).toEqual([]);
    expect(writes.some((w) => /^clientMachineSettings\/_/.test(w.path))).toBe(false);
  });

  /* THE WHOLE-BRANCH REVIEW (Oct 9 2026). */
  it("Discard while Who's this?'s reads are out: nothing is given to anyone afterwards", async () => {
    const open = gate();
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await tapName("Judy Client");
    const discard = document.querySelector<HTMLButtonElement>('button[aria-label="Discard this session"]');
    expect(discard, "Discard").toBeTruthy();
    await act(async () => discard!.click());
    await act(async () => button("Scrap session")!.click());
    expect(netCtl.deletes).toContain(`sessions/${OPEN_ID}`);
    await open(); // the reads answer after the Discard
    expect(sessionAssignWrite(), "no assign after the Discard").toBeUndefined();
    expect(writes.some((w) => w.path === `clients/${CLIENT_ID}`)).toBe(false);
    // Discard goes back to the Hub with no client; the client was never put on screen.
    expect(chosen, "the client on screen was never switched to Judy").not.toContain(CLIENT_ID);
    expect(localStorage.getItem("max_strength_active_session_id")).not.toBe(OPEN_ID);
  });

  it("a refused assign marks no first Journey day: the mark goes only once the batch has landed", async () => {
    netCtl.refuseLater = true;
    const host = await mount(<Floor />);
    await act(async () => whoButton(host)!.click());
    await act(async () => button("New client")!.click());
    await addClient("Ana", "Walkin");
    const newId = madeClient("Ana")!.path.split("/")[1];
    expect(writes.some((w) => w.path === `clients/${newId}` && w.data?.firstSessionDate), "not before the answer").toBe(false);
    await act(async () => {
      for (const refuse of netCtl.refusals.splice(0)) refuse(new Error("permission-denied"));
    });
    await settle();
    expect(writes.some((w) => w.path === `clients/${newId}` && w.data?.firstSessionDate), "not after a refusal").toBe(false);
  });

  it("Finish before the client's routines answer still gets Next time: worked out on the Wrap-up once they do", async () => {
    netCtl.hold.add("routines");
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Choose the client")!.click());
    await pick("Judy Client");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain("Wrap-up · session saved");
    expect(document.querySelector('[data-testid="next-time"]'), "never a guess before the routines answer").toBeNull();
    await act(async () => netCtl.release("routines"));
    await settle();
    const card = document.querySelector('[data-testid="next-time"]');
    expect(card, "Next time, once they answered").not.toBeNull();
    expect(card!.textContent).toContain("Tick the ones that start Routine A.");
  });

  it("a client added here for the session: their empty routines from the iPad's copy are the answer, so Next time comes offline", async () => {
    netCtl.fromCache.add("routines");
    const host = await mount(<Floor />);
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("New client")!.click());
    await addClient("Ana", "Walkin");
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    const card = document.querySelector('[data-testid="next-time"]');
    expect(card, "Next time for a walk-in").not.toBeNull();
    expect(card!.textContent).toContain("Tick the ones that start Routine A.");
    // And their first time on each machine is their starting weight: nothing is on file for them anywhere.
    const newId = madeClient("Ana")!.path.split("/")[1];
    const setting = writes.find((w) => w.path === `clientMachineSettings/${newId}_m-leg-press`)!;
    expect(setting.data.startingWeight).toBe(100);
  });

  it("the last client's settings never go to the next: one chosen a moment before Finish gets none of them", async () => {
    const ana = { id: "c-ana", homeStudioId: STUDIO_ID, firstName: "Ana", lastName: "Other", sessionCount: 3 } as Client;
    function JudyThenOpen() {
      const [cid, setCid] = useState<string | null>(CLIENT_ID);
      return (
        <>
          <button type="button" data-testid="to-open" onClick={() => setCid(null)}>
            Open
          </button>
          <WorkoutTrackerView
            clientId={cid}
            clients={[client, ana]}
            machines={appWideMachines}
            trainers={[trainer]}
            user={{ uid: "uid-coach", email: "coach@maxstrengthfitness.com" } as any}
            setView={setViewSpy}
            setSelectedClientId={(id) => setCid(id)}
            setSelectedClientIdNow={(id) => setCid(id)}
            authTrainer={trainer}
            isSyncing={false}
            setIsSyncing={vi.fn()}
            schedules={[]}
          />
        </>
      );
    }
    // Judy's briefing first: her settings (Seat Angle P2, Seat Distance 7) are read.
    const host = await mount(<JudyThenOpen />);
    await act(async () => (host.querySelector('[data-testid="to-open"]') as HTMLButtonElement).click());
    await settle();
    // The open session is nobody's: the bar never says the last client's name, and draws no Notes or Pulse for them.
    expect(barName(host)).toBe("Open session");
    expect(whoButton(host)).toBeTruthy();
    expect(host.querySelector('button[aria-label="Session notes"]')).toBeNull();
    // Ana's settings never answer before Finish.
    netCtl.hold.add("clientMachineSettings");
    await act(async () => whoButton(host)!.click());
    await pick("Ana Other");
    await act(async () => (host.querySelector(".jg-sbar__finish") as HTMLButtonElement).click());
    await act(async () => button("Finish session")!.click());
    await settle();
    await settle();
    const setting = writes.find((w) => w.path === "clientMachineSettings/c-ana_m-leg-press")!;
    expect(setting, "today's weight for Ana").toBeTruthy();
    expect(setting.data).not.toHaveProperty("settings");
    expect(setting.data).not.toHaveProperty("startingWeight");
  });

  it("a read of the studio's open sessions that failed says so, with Try again, never 'No session is open here'", async () => {
    netCtl.fail.add("sessions");
    const host = await mount(<Floor />);
    const nothing = host.querySelector('[data-testid="nothing-on-screen"]');
    expect(nothing?.getAttribute("data-kind")).toBe("open-failed");
    expect(host.textContent).toContain("Couldn't read this studio's open sessions.");
    expect(host.textContent).not.toContain("No session is open here");
    netCtl.fail.delete("sessions");
    await act(async () => button("Try again")!.click());
    await settle();
    expect(barName(host)).toBe("Open session");
  });

  it("an abandoned open session of the trainer's is asked about: carry on with it, Who's this? still there", async () => {
    const hourAndAHalf = new Date(Date.now() - 90 * 60_000);
    sessionDocs = [{ id: OPEN_ID, data: () => ({ ...openSessionAsWritten(), lastHeartbeatAt: hourAndAHalf, createdAt: hourAndAHalf, startTime: hourAndAHalf }) }];
    const host = await mount(<Floor />);
    expect(document.body.textContent).toContain("Your open session was never finished");
    expect(barName(host)).toBeUndefined();
    await act(async () => button("Resume it")!.click());
    await settle();
    expect(barName(host)).toBe("Open session");
    expect(whoButton(host)).toBeTruthy();
    expect(writes.some((w) => w.path === `sessions/${OPEN_ID}` && w.data?.lastHeartbeatAt)).toBe(true);
    expect(localStorage.getItem("max_strength_active_session_id")).toBe(OPEN_ID);
  });

  it("...or left as it is, and a new open session started", async () => {
    const hourAndAHalf = new Date(Date.now() - 90 * 60_000);
    sessionDocs = [{ id: OPEN_ID, data: () => ({ ...openSessionAsWritten(), lastHeartbeatAt: hourAndAHalf, createdAt: hourAndAHalf, startTime: hourAndAHalf }) }];
    const start = vi.fn();
    await mount(<Floor onStart={start} />);
    await act(async () => button("Start a new session")!.click());
    expect(start).toHaveBeenCalledTimes(1);
    expect(declinedStaleOpenSessions().has(OPEN_ID)).toBe(true);
    expect(document.body.textContent).not.toContain("Your open session was never finished");
    expect(writes.some((w) => w.path === `sessions/${OPEN_ID}`), "the old one is left exactly as it is").toBe(false);
  });

  it("a Start the database refused is said here when this screen holds it: the sets typed are kept", async () => {
    const host = await mount(<Floor />);
    expect(barName(host)).toBe("Open session");
    let said = false;
    await act(async () => {
      said = announceOpenSessionRefused(OPEN_ID);
    });
    expect(said).toBe(true);
    expect(document.body.textContent).toContain("The open session didn't start, so it isn't on the record. The sets typed are kept: tell a leader.");
    expect(barName(host)).toBeUndefined();
  });
});
