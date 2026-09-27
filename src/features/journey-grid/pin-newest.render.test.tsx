// @vitest-environment jsdom
/**
 * The grid opens on the NEWEST session and stays there while it fills in
 * (AJ, Sep 26 2026: "It should be scrolled to the most recent day. The
 * trainer should not have to scroll through to get to today").
 *
 * The bug: session columns are `minmax(col, 1fr)` in a max-content grid, so
 * they all widen to the widest cell once a client's sets land. That happens
 * after the grid has pinned itself to the newest column, with the scroller's
 * own box unchanged, so the observer on the scroller never fired and the
 * profile opened a column or two short of the latest session. The grid now
 * watches the timeline's width too.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecentJourneyView } from "./RecentJourneyView";
import type { JourneyRow, JourneySession } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* jsdom has no ResizeObserver and no layout. This one records what each
   observer watches, so a test can fire the one that watches the timeline. */
class RecordingObserver {
  static all: RecordingObserver[] = [];
  targets: Element[] = [];
  constructor(public callback: () => void) {
    RecordingObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
}

const hadRO = "ResizeObserver" in globalThis;
const previousRO = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RecordingObserver;
});
afterAll(() => {
  if (hadRO) (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = previousRO;
  else delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

function sessionsOf(n: number): JourneySession[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 8, 1 + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { id: `s${i + 1}`, sessionNumber: i + 1, date: iso, trainerInitials: "AJ" };
  });
}

function rowsFor(sessions: JourneySession[]): JourneyRow[] {
  return [
    {
      machine: { id: "leg-press", name: "Leg Press", group: "Push" as const },
      sets: Object.fromEntries(
        sessions.map((s, i) => [
          s.id,
          { sessionId: s.id, outcome: "performed" as const, weight: 116 + i, reps: 10, quality: 2 as const },
        ]),
      ),
    },
  ];
}

/** A scroller with a width the test controls, standing in for real layout. */
function fakeLayout(scroller: HTMLElement, box: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(scroller, "scrollWidth", { configurable: true, get: () => box.scrollWidth });
  Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => box.clientWidth });
  Object.defineProperty(scroller, "scrollLeft", {
    configurable: true,
    get: () => box.scrollLeft,
    // A browser clamps to the furthest it can go.
    set: (v: number) => {
      box.scrollLeft = Math.max(0, Math.min(v, box.scrollWidth - box.clientWidth));
    },
  });
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mountProfileGrid() {
  RecordingObserver.all = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const sessions = sessionsOf(14);
  await act(async () => {
    root!.render(<RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />);
  });
  const scroller = host.querySelector<HTMLElement>(".jg-scroller")!;
  const timeline = host.querySelector<HTMLElement>(".jg-grid")!;
  return { scroller, timeline };
}

async function unmount() {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

/** The observers still watching the timeline (StrictMode-safe: disconnected ones hold nothing). */
const watching = (el: Element) => RecordingObserver.all.filter((o) => o.targets.includes(el));

describe("JourneyGrid keeps a freshly opened profile on the newest session", () => {
  it("watches the timeline's own width, not only the scroller's box", async () => {
    const { timeline } = await mountProfileGrid();
    expect(watching(timeline).length).toBeGreaterThan(0);
    await unmount();
  });

  it("re-pins to the newest column when the columns widen after the sets land", async () => {
    const { scroller, timeline } = await mountProfileGrid();
    // Pinned on open: fourteen 56px columns beside the rails, seven showing.
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);

    // The sets arrive and every column widens to its widest cell (~62px).
    box.scrollWidth = 1133;
    await act(async () => {
      for (const o of watching(timeline)) o.callback();
    });
    expect(box.scrollLeft).toBe(box.scrollWidth - box.clientWidth);
    await unmount();
  });

  it("leaves a trainer who has scrolled back into history where they are", async () => {
    const { scroller, timeline } = await mountProfileGrid();
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);

    // Back to the oldest columns, by hand.
    box.scrollLeft = 0;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });

    box.scrollWidth = 1133;
    await act(async () => {
      for (const o of watching(timeline)) o.callback();
    });
    expect(box.scrollLeft).toBe(0);
    await unmount();
  });
});
