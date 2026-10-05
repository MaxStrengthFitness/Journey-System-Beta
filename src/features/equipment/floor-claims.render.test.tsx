// @vitest-environment jsdom
/**
 * The machine menu, MOUNTED, for the one sentence it says about a machine
 * the client has nothing recorded on (Sep 24 2026, lib/history-claims.ts).
 * It was the machine sheet's banner until the machine menu (Oct 2026); the
 * words now live in the header's Last time line and the set-up guide's part
 * above the dials.
 *
 * Machine history is not coming across from FileMaker, so every machine of
 * a client with twelve years behind her arrives empty. Both screens used to
 * greet that with "First time on this machine". Only a client whose whole
 * story is in Journey (`coverage` complete), with every session read, may be
 * told so; everyone else reads "Nothing recorded on this machine" - and a
 * door that passes no coverage at all gets the cautious wording, never the
 * confident one. A machine a running total knows was done before is never
 * "first time", and the guide stays folded for it.
 *
 * Firebase and the app contexts are inert stand-ins, as in
 * machine-menu/MachineMenu.render.test.tsx.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Machine } from "../../types";
import type { HistoryCoverage } from "../../lib/prior-history";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
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
    // The floor's note on the machine (Oct 3 2026): none here.
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    addDoc: async () => ({ id: "x" }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
  };
});
vi.mock("../../hooks/useMachineCatalog", () => ({
  useMachineCatalog: () => ({ catalog: [], byId: {}, loading: false, failed: false }),
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: null, activeStudioId: "westlake", studios: [] }),
}));
vi.mock("../../hooks/useClientJournal", () => ({ createJournalEntry: async () => undefined }));

import { MachineMenu } from "../machine-menu/MachineMenu";
import type { MachineMenuHost } from "../machine-menu/useMachineMenuData";

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

let mounted: Root[] = [];
afterEach(async () => {
  for (const root of mounted) await act(async () => root.unmount());
  mounted = [];
  document.body.innerHTML = "";
});

const machine = { id: "leg-press", name: "Leg Press", order: 1, settingOptions: ["Seat"] } as unknown as Machine;
const client = { id: "judy", firstName: "Judy", lastName: "Daus", homeStudioId: "westlake" } as unknown as Client;

function host(coverage: HistoryCoverage | undefined, over: Partial<MachineMenuHost> = {}): MachineMenuHost {
  return {
    door: "session",
    clientId: "judy",
    client,
    machines: [machine],
    clientSettings: {},
    author: null,
    activeStudioId: "westlake",
    floorStudio: { id: "westlake", name: null },
    roster: [],
    coverage: coverage ?? "unknown",
    sessions: [],
    logs: [],
    readIds: new Set<string>(),
    historyState: "ready",
    journal: [],
    journalState: "ready",
    ...over,
  };
}

async function mount(h: MachineMenuHost) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <StrictMode>
        <MachineMenu open machineId="leg-press" onClose={() => {}} host={h} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  mounted.push(root);
}

const headerLine = () => document.querySelector("[data-header-line]")?.textContent ?? "";
const first = () => document.querySelector('[data-block="setupFirst"]');

describe("the machine menu, on a machine with nothing recorded", () => {
  it("tells a client whose whole story is in Journey it is the first time, once every session is read", async () => {
    await mount(host("complete"));
    expect(headerLine()).toBe("First time on this machine");
    expect(first()?.getAttribute("aria-label")).toBe("First time on this machine");
    expect(first()?.textContent).toContain("Judy has no history here yet.");
  });

  it("says nothing is recorded for a migrating client, and keeps the set-up guidance", async () => {
    for (const coverage of ["partial", "unknown", undefined] as const) {
      await mount(host(coverage));
      expect(headerLine()).toBe("Nothing recorded on this machine");
      expect(first()).not.toBeNull();
      expect(first()?.getAttribute("aria-label")).toBe("Nothing recorded on this machine");
      expect(first()?.textContent).toContain("Journey has no sets for Judy on this machine");
      expect(first()?.textContent).toContain("save the settings so the next trainer has them");
      expect(document.body.textContent).not.toMatch(/first time/i);
      for (const root of mounted) await act(async () => root.unmount());
      mounted = [];
      document.body.innerHTML = "";
    }
  });

  it("never says first time while older sessions are unread, even for a client whose whole story is in Journey", async () => {
    const older = [{ id: "s-old", date: "2025-01-02", status: "Completed" }] as unknown as MachineMenuHost["sessions"];
    await mount(host("complete", { sessions: older, readIds: new Set<string>() }));
    expect(headerLine()).toBe("Nothing recorded on this machine in the sessions loaded here");
    expect(document.body.textContent).not.toMatch(/first time/i);
  });

  it("never says first time for a machine a running total knows, and leaves the guide folded", async () => {
    const known = {
      ...client,
      machineStats: { "leg-press": { firstPerformedDate: "2026-01-05", lastPerformedDate: "2026-02-02", lastWeight: 92, firstWeight: 80, timesPerformed: 9 } },
    } as unknown as Client;
    await mount(host("complete", { client: known }));
    expect(headerLine()).toContain("Last in Journey");
    expect(headerLine()).toContain("not in the sessions loaded here");
    expect(first()).toBeNull();
    expect(document.body.textContent).not.toMatch(/first time/i);
  });
});
