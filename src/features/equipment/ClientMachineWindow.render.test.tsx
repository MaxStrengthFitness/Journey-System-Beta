// @vitest-environment jsdom
/**
 * The one machine window, MOUNTED (see
 * src/features/client-profile/profile-nav.render.test.tsx for why these
 * exist). It builds its machine during render, mounts a dialog, a chart and a
 * Firestore listener — none of which a unit test would ever run.
 *
 * Firebase and the app contexts are replaced with inert stand-ins: this test
 * is about the window mounting, opening, closing and saying the right thing,
 * not about Firestore.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, Trainer, WorkoutSession } from "../../types";

const calls = vi.hoisted(() => ({ catalog: 0, subscribed: 0, unsubscribed: 0, statsOptions: [] as unknown[] }));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], empty: true }),
    addDoc: async () => ({ id: "x" }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
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
      return { catalog: [], byId: {}, loading: false };
    },
  };
});
vi.mock("../../ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: null, activeStudioId: "westlake" }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));
vi.mock("../../hooks/useClientJournal", () => ({ createJournalEntry: async () => undefined }));
vi.mock("./useMachineStats", () => ({
  useMachineStats: (_client: unknown, options: unknown) => {
    calls.statsOptions.push(options);
    return { stats: null, backfilling: false };
  },
}));

import { ClientMachineWindow, type ClientMachineWindowProps } from "./ClientMachineWindow";

/* jsdom has neither; recharts' ResponsiveContainer and the dialog want them. */
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
});
afterAll(() => {
  if (!hadRO) delete g.ResizeObserver;
});
beforeEach(() => {
  calls.catalog = 0;
  calls.subscribed = 0;
  calls.unsubscribed = 0;
  calls.statsOptions = [];
  document.body.innerHTML = "";
});

const machines = [
  { id: "leg-press", name: "Leg Press", order: 1, settingOptions: ["Seat"] },
  { id: "chest-press", name: "Chest Press", order: 2 },
] as unknown as Machine[];

const client = { id: "judy", firstName: "Judy", lastName: "Daus", gender: "Female", height: "5'4\"" } as unknown as Client;
const trainer = { id: "t1", fullName: "AJ Jurgens", initials: "AJ" } as unknown as Trainer;
const settings = {
  "leg-press": { clientId: "judy", machineId: "leg-press", settings: { Seat: "4" }, currentWeight: "120" },
} as unknown as Record<string, ClientMachineSetting>;

const sessions = [
  { id: "s1", date: "2026-03-02" },
  { id: "s2", date: "2026-03-09" },
] as WorkoutSession[];
const logs = [
  { sessionId: "s1", machineId: "leg-press", weight: "100", reps: "10" },
  { sessionId: "s2", machineId: "leg-press", weight: "110", reps: "9" },
] as ExerciseLog[];

function props(over: Partial<ClientMachineWindowProps> = {}): ClientMachineWindowProps {
  return {
    open: true,
    onClose: () => {},
    clientId: "judy",
    client,
    machineId: "leg-press",
    machines,
    clientSettings: settings,
    allLogs: logs,
    sessions,
    authTrainer: trainer,
    activeStudioId: "westlake",
    ...over,
  };
}

async function mount(p: ClientMachineWindowProps): Promise<{ root: Root; render: (p: ClientMachineWindowProps) => Promise<void> }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = async (next: ClientMachineWindowProps) => {
    await act(async () => {
      root.render(
        <StrictMode>
          <ClientMachineWindow {...next} />
        </StrictMode>,
      );
    });
  };
  await render(p);
  return { root, render };
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe("ClientMachineWindow", () => {
  it("costs nothing while it has never been opened", async () => {
    const { root } = await mount(props({ open: false }));
    expect(document.querySelector(".eq-window")).toBeNull();
    // No catalog listener before the first tap.
    expect(calls.catalog).toBe(0);
    await act(async () => root.unmount());
  });

  it("opens on the tapped machine, titled with its name, for this client", async () => {
    const { root } = await mount(props());
    const win = document.querySelector(".eq-window");
    expect(win).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Leg Press");
    expect(win?.querySelector(".eq-sheet__name")?.textContent).toBe("Leg Press");
    expect(win?.querySelector(".eq-sheet__who")?.textContent).toContain("Judy Daus");
    // The same pane All Machines draws.
    expect(win?.querySelector(".eq-detail")).not.toBeNull();
    for (const card of ["Prescription", "History", "Load progression", "Machine settings"]) {
      expect(win?.textContent).toContain(card);
    }
    await act(async () => root.unmount());
  });

  it("keeps the old pop-up's trend: the Load progression card, from performed sets", async () => {
    const { root } = await mount(props());
    const card = document.querySelector('[aria-label="Load progression"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Up 10 lb, 100 → 110 lb across the 2 sessions loaded here");
    await act(async () => root.unmount());
  });

  it("says there is not enough data under two sessions, and draws no chart", async () => {
    const { root } = await mount(props({ allLogs: logs.slice(0, 1) }));
    const card = document.querySelector('[aria-label="Load progression"]');
    expect(card?.textContent).toContain("Not enough sessions yet");
    expect(card?.querySelector(".eq-prog__chart")).toBeNull();
    await act(async () => root.unmount());
  });

  it("never starts the one-time history backfill (the Equipment tab owns it)", async () => {
    const { root } = await mount(props());
    expect(calls.statsOptions.length).toBeGreaterThan(0);
    for (const o of calls.statsOptions) expect(o).toEqual({ enabled: false });
    await act(async () => root.unmount());
  });

  it("closes from its 40px close button", async () => {
    let closed = 0;
    const { root } = await mount(props({ onClose: () => (closed += 1) }));
    const btn = document.querySelector<HTMLButtonElement>('.eq-window button[aria-label="Close Leg Press"]');
    expect(btn).not.toBeNull();
    expect(btn?.className).toContain("eq-sheet__close");
    await act(async () => {
      btn!.click();
    });
    expect(closed).toBe(1);
    await act(async () => root.unmount());
  });

  it("goes away when closed, and reopens on another machine without re-subscribing", async () => {
    const { root, render } = await mount(props());
    const live = () => calls.subscribed - calls.unsubscribed;
    expect(live()).toBe(1);
    const teardownsAfterOpen = calls.unsubscribed;

    await render(props({ open: false, machineId: null }));
    await tick();
    expect(document.querySelector(".eq-window")).toBeNull();

    await render(props({ machineId: "chest-press" }));
    await tick();
    expect(document.querySelector(".eq-window .eq-sheet__name")?.textContent).toBe("Chest Press");
    // One catalog listener the whole time: never torn down between opens.
    expect(live()).toBe(1);
    expect(calls.unsubscribed).toBe(teardownsAfterOpen);

    await act(async () => root.unmount());
    expect(live()).toBe(0);
  });

  it("stays shut for a machine the profile does not know", async () => {
    const { root } = await mount(props({ machineId: "no-such-machine" }));
    expect(document.querySelector(".eq-window")).toBeNull();
    await act(async () => root.unmount());
  });
});
