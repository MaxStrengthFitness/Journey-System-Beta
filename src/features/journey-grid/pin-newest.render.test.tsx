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

  it("does not mistake its own pin's late scroll event for the trainer scrolling back", async () => {
    // Seen on the live app, Sep 26: the pin's scroll event is delivered a
    // frame after the pin, and when the sets land in between, the spot the
    // grid chose reads as "parked short of the newest column". That echo used
    // to switch the pin off, so the widening that followed was ignored.
    const { scroller, timeline } = await mountProfileGrid();
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 0 };
    fakeLayout(scroller, box);
    // The grid pins itself at its first look at the real size.
    await act(async () => {
      for (const o of watching(timeline)) o.callback();
    });
    expect(box.scrollLeft).toBe(379);

    // The sets land and the columns widen before the pin's event arrives...
    box.scrollWidth = 1133;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    // ...and when the widening is noticed, the grid still goes to the newest.
    await act(async () => {
      for (const o of watching(timeline)) o.callback();
    });
    expect(box.scrollLeft).toBe(460);
    await unmount();
  });

  it("re-pins in the same commit as the sets that widen it, with no observer involved", async () => {
    // The live app, Sep 26: no resize observation reported the widening at
    // all, and the browser moved the scroll position itself while laying out
    // the wider columns. The rows arriving is the one moment that is certain.
    RecordingObserver.all = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const sessions = sessionsOf(14);
    const empty: JourneyRow[] = rowsFor(sessions).map((r) => ({ ...r, sets: {} }));
    await act(async () => {
      root!.render(<RecentJourneyView sessions={sessions} rows={empty} layout="page" resetKey="judy" />);
    });
    const scroller = host.querySelector<HTMLElement>(".jg-scroller")!;
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);

    // The sets land; laid out, the columns are wider.
    box.scrollWidth = 1133;
    await act(async () => {
      root!.render(<RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />);
    });
    expect(box.scrollLeft).toBe(460);
    await unmount();
  });

  it("leaves a trainer who has scrolled back into history where they are", async () => {
    const { scroller, timeline } = await mountProfileGrid();
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);

    // Back to the oldest columns, by hand: a finger on the grid, then the scroll.
    box.scrollLeft = 0;
    await act(async () => {
      scroller.dispatchEvent(new Event("touchmove"));
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

describe("JourneyGrid stays on the newest session (Oct 2 2026)", () => {
  it("is not unpinned by an up-and-down scroll while the columns are still widening", async () => {
    const { scroller, timeline } = await mountProfileGrid();
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    // The sets land and the columns widen; before the grid re-pins, a
    // vertical swipe fires a scroll event with scrollLeft unchanged.
    box.scrollWidth = 1133;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    await act(async () => {
      for (const o of watching(timeline)) o.callback();
    });
    expect(box.scrollLeft).toBe(box.scrollWidth - box.clientWidth);
    await unmount();
  });
});

describe("JourneyGrid and a scroll nobody made (Oct 2 2026)", () => {
  it("goes back to the newest column when focus, not the trainer, moves the grid", async () => {
    const { scroller } = await mountProfileGrid();
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    fakeLayout(scroller, box);
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    // The corner's menu closes and focus comes back: the browser nudges the
    // grid a column to the left, with no finger, wheel or key behind it.
    box.scrollLeft = 285;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(box.scrollLeft).toBe(box.scrollWidth - box.clientWidth);
    await unmount();
  });
});

describe("JourneyGrid pins on what it depends on (the iPad round, Oct 6 2026)", () => {
  it("reads no width when a set brings new arrays with the same columns and cells", async () => {
    RecordingObserver.all = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const sessions = sessionsOf(14);
    await act(async () => {
      root!.render(<RecentJourneyView sessions={sessions} rows={rowsFor(sessions)} layout="page" resetKey="judy" />);
    });
    const scroller = host.querySelector<HTMLElement>(".jg-scroller")!;
    let widthReads = 0;
    let leftWrites = 0;
    const box = { scrollWidth: 1052, clientWidth: 673, scrollLeft: 379 };
    Object.defineProperty(scroller, "scrollWidth", {
      configurable: true,
      get: () => {
        widthReads += 1;
        return box.scrollWidth;
      },
    });
    Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => box.clientWidth });
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      get: () => box.scrollLeft,
      set: (v: number) => {
        leftWrites += 1;
        box.scrollLeft = Math.max(0, Math.min(v, box.scrollWidth - box.clientWidth));
      },
    });

    // A set during a session: the listeners answer again with new arrays,
    // and not one column or past cell changed.
    const again = sessions.map((s) => ({ ...s }));
    await act(async () => {
      root!.render(<RecentJourneyView sessions={again} rows={rowsFor(again)} layout="page" resetKey="judy" />);
    });
    expect(widthReads).toBe(0);
    expect(leftWrites).toBe(0);

    // A new column does re-pin.
    const more = sessionsOf(15);
    box.scrollWidth = 1108;
    await act(async () => {
      root!.render(<RecentJourneyView sessions={more} rows={rowsFor(more)} layout="page" resetKey="judy" />);
    });
    expect(widthReads).toBeGreaterThan(0);
    expect(box.scrollLeft).toBe(box.scrollWidth - box.clientWidth);
    await unmount();
  });
});
