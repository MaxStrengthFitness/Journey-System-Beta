// @vitest-environment jsdom
/**
 * The machine sheet, MOUNTED, for the one sentence it says about a machine
 * the client has nothing recorded on (Sep 24 2026, lib/history-claims.ts).
 * The set-up prompt that said it too had no door and went on Oct 2 2026.
 *
 * Machine history is not coming across from FileMaker, so every machine of
 * a client with twelve years behind her arrives empty. Both screens used to
 * greet that with "First time on this machine". Only a client whose whole
 * story is in Journey (`coverage` complete) may be told so; everyone else
 * reads "Nothing recorded on this machine" - and a caller that passes no
 * coverage at all gets the cautious wording, never the confident one.
 *
 * Firebase and the app contexts are inert stand-ins, as in
 * ClientMachineWindow.render.test.tsx.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [], empty: true }),
    addDoc: async () => ({ id: "x" }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
  };
});
vi.mock("../../hooks/useMachineCatalog", () => ({
  useMachineCatalog: () => ({ catalog: [], byId: {}, loading: false }),
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudio: null, activeStudioId: "westlake" }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));
vi.mock("../../hooks/useClientJournal", () => ({ createJournalEntry: async () => undefined }));

import { MachineSheet } from "./MachineSheet";

const g = globalThis as unknown as Record<string, unknown>;
const hadRO = "ResizeObserver" in g;
beforeAll(() => {
  if (!hadRO) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterAll(() => {
  if (!hadRO) delete g.ResizeObserver;
});
beforeEach(() => {
  document.body.innerHTML = "";
});

const machine = { id: "leg-press", name: "Leg Press", order: 1, settingOptions: ["Seat"] } as unknown as Machine;
const client = { id: "judy", firstName: "Judy", lastName: "Daus", homeStudioId: "westlake" } as unknown as Client;

async function mount(ui: React.ReactNode): Promise<Root> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return root;
}

const sheet = (coverage?: HistoryCoverage) => (
  <MachineSheet
    open
    firstTime
    coverage={coverage}
    machine={machine}
    client={client}
    clientId="judy"
    clientSettings={{}}
    author={null}
    onClose={() => {}}
  />
);


describe("the machine sheet, on a machine with nothing recorded", () => {
  it("tells a client whose whole story is in Journey it is her first time", async () => {
    const root = await mount(sheet("complete"));
    const banner = document.querySelector(".eq-sheet__first");
    expect(banner?.textContent).toContain("First time on this machine");
    expect(banner?.textContent).toContain("Judy has no history here yet.");
    await act(async () => root.unmount());
  });

  it("says nothing is recorded for a migrating client, and keeps the set-up guidance", async () => {
    for (const coverage of ["partial", "unknown", undefined] as const) {
      const root = await mount(sheet(coverage));
      const banner = document.querySelector(".eq-sheet__first");
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute("aria-label")).toBe("Nothing recorded on this machine");
      expect(banner?.textContent).toContain("Nothing recorded on this machine");
      expect(banner?.textContent).toContain("Journey has no sets for Judy on this machine");
      expect(banner?.textContent).toContain("save the settings so the next trainer has them");
      expect(document.body.textContent).not.toMatch(/first time/i);
      await act(async () => root.unmount());
      document.body.innerHTML = "";
    }
  });
});
