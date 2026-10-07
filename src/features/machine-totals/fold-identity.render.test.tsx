// @vitest-environment jsdom
/**
 * The client on screen keeps its object when somebody else changes (the
 * Wrap-up round's review, Oct 6 2026). The fix rests on three things holding
 * together, and this file holds all three at once rather than the memo alone:
 *   - useMachineTotals hands back the SAME answer object until a new answer
 *     comes (a redraw, or a metadata-only answer, is not a new answer);
 *   - the roster keeps each unchanged client's object (rosterFromSnapshot,
 *     mergeRoster);
 *   - withMachineTotals reuses its merge while both are the same objects.
 * If any one of them starts handing out fresh objects the session, the
 * Wrap-up and the profile redraw for another client's change again: nothing
 * is lost, but the iPad round's win is quietly undone. The fold below is
 * AppContent's (`clients`, src/AppContent.tsx), with the roster's two steps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  next: null as null | ((s: unknown) => void),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  deleteField: () => ({}),
  serverTimestamp: () => ({}),
  onSnapshot: (_ref: unknown, _opts: unknown, next: (s: unknown) => void) => {
    fake.next = next;
    return () => {};
  },
}));
vi.mock("../../firebase", () => ({ db: {} }));

import { useMachineTotals } from "./useMachineTotals";
import { machineTotalsKnown, withMachineTotals } from "./totals";
import { mergeRoster, rosterFromSnapshot } from "../../lib/studio-roster";

const snap = (data: unknown, fromCache = false, hasPendingWrites = false) => ({
  exists: () => data !== null,
  data: () => data,
  metadata: { fromCache, hasPendingWrites },
});
const docsOf = (rows: Array<{ id: string; firstName: string }>) => rows.map(({ id, ...data }) => ({ id, data: () => data }));

let root: Root | null = null;
let host: HTMLElement | null = null;
let onScreen: Client | null = null;

/** AppContent's fold: the selected client gets its totals, everyone else is the roster's own object. */
function Probe({ id, roster }: { id: string; roster: readonly Client[] }) {
  const read = useMachineTotals(id);
  const clients = mergeRoster(roster, []).map((c) => (c.id === id ? withMachineTotals(c, read) : c));
  onScreen = clients.find((c) => c.id === id) ?? null;
  return null;
}

async function draw(id: string, roster: readonly Client[]) {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(<Probe id={id} roster={roster} />));
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  onScreen = null;
  vi.restoreAllMocks();
});

const TOTALS = { machineStats: { m1: { timesPerformed: 4 } } };

describe("the client on screen, folded the way AppContent folds it", () => {
  it("keeps its object when another client changes, when the screen redraws, and when the server only confirms", async () => {
    const first = rosterFromSnapshot(docsOf([{ id: "fold-a", firstName: "Ann" }, { id: "fold-b", firstName: "Bea" }]), null, new Map(), []);
    await draw("fold-a", first.list);
    await act(async () => fake.next!(snap(TOTALS)));
    const held = onScreen;
    expect(held).not.toBeNull();
    expect(machineTotalsKnown(held!)).toBe(true);

    // Another client's document changed: the roster keeps Ann's object, so the fold keeps hers.
    const bea = rosterFromSnapshot(docsOf([{ id: "fold-a", firstName: "Ann" }, { id: "fold-b", firstName: "Beatrice" }]), new Set(["fold-b"]), first.byId, first.list);
    await draw("fold-a", bea.list);
    expect(onScreen).toBe(held);

    // The screen redrew for its own reasons.
    await draw("fold-a", bea.list);
    expect(onScreen).toBe(held);

    // The server confirmed the same totals (a metadata-only answer): not a new answer.
    await act(async () => fake.next!(snap(TOTALS)));
    expect(onScreen).toBe(held);
  });

  it("is a new object, with its state, when the totals answer anew or the client's own document changes", async () => {
    const first = rosterFromSnapshot(docsOf([{ id: "fold-c", firstName: "Cy" }, { id: "fold-d", firstName: "Di" }]), null, new Map(), []);
    await draw("fold-c", first.list);
    // Before any answer from the server: loading, never known.
    await act(async () => fake.next!(snap(null, true)));
    const loading = onScreen;
    expect(machineTotalsKnown(loading!)).toBe(false);

    await act(async () => fake.next!(snap(TOTALS)));
    const ready = onScreen;
    expect(ready).not.toBe(loading);
    expect(machineTotalsKnown(ready!)).toBe(true);

    await act(async () => fake.next!(snap({ machineStats: { m1: { timesPerformed: 5 } } })));
    const again = onScreen;
    expect(again).not.toBe(ready);
    expect((again as Client & { machineStats: Record<string, { timesPerformed: number }> }).machineStats.m1.timesPerformed).toBe(5);

    const cy = rosterFromSnapshot(docsOf([{ id: "fold-c", firstName: "Cyrus" }, { id: "fold-d", firstName: "Di" }]), new Set(["fold-c"]), first.byId, first.list);
    await draw("fold-c", cy.list);
    expect(onScreen).not.toBe(again);
    expect(onScreen!.firstName).toBe("Cyrus");
    expect(machineTotalsKnown(onScreen!)).toBe(true);
  });
});
