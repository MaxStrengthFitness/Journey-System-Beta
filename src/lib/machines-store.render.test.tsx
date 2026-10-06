// @vitest-environment jsdom
/**
 * ONE READ OF `machines` FOR THE WHOLE APP (the speed round, Oct 5 2026, R16).
 *
 * useMachines (ordered in its query) and useMachineCatalog (unordered) were
 * two live reads of the same documents. They share one unordered listener
 * now; useMachines keeps its old query's meaning in memory (only documents
 * that have `order`, sorted by it), and a failed read is never an empty
 * catalog.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./firestore-errors", () => ({ OperationType: { GET: "get" }, handleFirestoreError: () => {} }));

const opened: { next: (s: unknown) => void; fail: (e: unknown) => void; stopped: boolean }[] = [];
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (_target: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
    const l = { next, fail, stopped: false };
    opened.push(l);
    return () => {
      l.stopped = true;
    };
  },
}));

import { useMachineCatalog } from "../hooks/useMachineCatalog";
import { machinesFromDocs, useMachines } from "../hooks/useMachines";
import { openMachinesListeners } from "./machines-store";
import { forgetPersonalMemory } from "../features/sign-out/memory";
import type { Machine } from "../types";

const DEFAULTS: Machine[] = [{ id: "leg-press", name: "Leg Press", order: 2 } as unknown as Machine];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  opened.length = 0;
});

let catalogSeen: ReturnType<typeof useMachineCatalog> | null = null;
let machinesSeen: Machine[] = [];
function Both() {
  catalogSeen = useMachineCatalog();
  machinesSeen = useMachines(true, DEFAULTS).machines;
  useMachineCatalog();
  return null;
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Both />));
}

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });

describe("the machines store", () => {
  it("opens one listener however many ask, and closes it when the last one leaves", async () => {
    await mount();
    expect(opened).toHaveLength(1);
    expect(openMachinesListeners()).toBe(1);
    act(() => root!.unmount());
    root = null;
    expect(opened[0].stopped).toBe(true);
    expect(openMachinesListeners()).toBe(0);
  });

  it("gives the catalog every document, and useMachines only those with an order", async () => {
    await mount();
    await act(async () =>
      opened[0].next(
        snap([
          { id: "leg-press", data: { name: "Leg Press", order: 2 } },
          { id: "chest-press", data: { name: "Chest Press", order: 1 } },
          { id: "new-one", data: { name: "No order yet" } },
        ]),
      ),
    );
    expect(catalogSeen!.catalog.map((c) => c.id).sort()).toEqual(["chest-press", "leg-press", "new-one"]);
    expect(Object.keys(catalogSeen!.byId).sort()).toEqual(["chest-press", "leg-press", "new-one"]);
    expect(machinesSeen.map((m) => m.id)).toEqual(["chest-press", "leg-press"]);
  });

  it("keeps byId the same object between renders of the same answer", async () => {
    await mount();
    await act(async () => opened[0].next(snap([{ id: "a", data: { order: 1 } }])));
    const first = catalogSeen!.byId;
    await act(async () => root!.render(<Both />));
    expect(catalogSeen!.byId).toBe(first);
  });

  it("a failed read is failed, never an empty catalog", async () => {
    await mount();
    await act(async () => opened[0].next(snap([{ id: "a", data: { order: 1 } }])));
    await act(async () => opened[0].fail(new Error("offline")));
    expect(catalogSeen!.failed).toBe(true);
    expect(catalogSeen!.catalog.map((c) => c.id)).toEqual(["a"]);
  });

  it("a read that failed is let go, and the next screen that asks opens a fresh one for everyone", async () => {
    await mount();
    await act(async () => opened[0].next(snap([{ id: "a", data: { order: 1 } }])));
    await act(async () => opened[0].fail(new Error("permission-denied")));
    expect(opened[0].stopped).toBe(true);
    expect(openMachinesListeners()).toBe(0);
    expect(catalogSeen!.failed).toBe(true);

    // Another screen asks: one fresh read opens.
    let later: ReturnType<typeof useMachineCatalog> | null = null;
    function Later() {
      later = useMachineCatalog();
      return null;
    }
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    const root2 = createRoot(host2);
    try {
      await act(async () => root2.render(<Later />));
      expect(opened).toHaveLength(2);
      expect(later!.catalog.map((c) => c.id)).toEqual(["a"]);

      // Its answer reaches the screens that were already listening too.
      await act(async () => opened[1].next(snap([{ id: "a", data: { order: 1 } }, { id: "b", data: { order: 5 } }])));
      expect(catalogSeen!.failed).toBe(false);
      expect(machinesSeen.map((m) => m.id)).toContain("b");
      expect(later!.catalog.map((c) => c.id).sort()).toEqual(["a", "b"]);
    } finally {
      act(() => root2.unmount());
      host2.remove();
    }
  });

  it("a sign-out closes the read", async () => {
    await mount();
    forgetPersonalMemory();
    expect(opened[0].stopped).toBe(true);
    expect(openMachinesListeners()).toBe(0);
  });

  it("machinesFromDocs is the old ordered query, in memory", () => {
    const out = machinesFromDocs(
      [
        { id: "x", data: { order: 5 } },
        { id: "y", data: { name: "no order" } },
      ],
      DEFAULTS,
    );
    expect(out.map((m) => m.id)).toEqual(["leg-press", "x"]);
  });
});
