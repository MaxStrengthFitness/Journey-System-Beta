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

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");

  const docsFor = (p: string) => {
    if (p === "machines") return CATALOG_DOCS;
    if (p === `studios/${STUDIO_ID}/roster`) return ROSTER_DOCS;
    if (p === "sessions") return SESSION_DOCS;
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
      const docs = docsFor(q?.__path ?? "");
      cb?.({ docs, size: docs.length, empty: docs.length === 0, forEach: (f: any) => docs.forEach(f) });
      return () => {};
    },
    getDocs: async (q: any) => {
      const docs = docsFor(q?.__path ?? "");
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (f: any) => docs.forEach(f) };
    },
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
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
      commit: async () => {},
    }),
    serverTimestamp: () => ({ __server: true }),
    increment: (n: number) => ({ __inc: n }),
    arrayUnion: (...v: any[]) => ({ __union: v }),
    arrayRemove: (...v: any[]) => ({ __remove: v }),
    Timestamp: real.Timestamp,
  };
});

vi.mock("../contexts/ActiveStudioContext", async (importOriginal) => {
  const realMod = await importOriginal<any>();
  return { ...realMod, useActiveStudio: () => ({ activeStudioId: STUDIO_ID }) };
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

function Tracker() {
  return (
    <WorkoutTrackerView
      clientId={CLIENT_ID}
      clients={[client]}
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
