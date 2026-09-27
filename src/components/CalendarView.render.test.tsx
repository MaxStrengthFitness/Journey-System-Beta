// @vitest-environment jsdom
/**
 * The calendar's Refresh, MOUNTED (AJ, Sep 26 2026): it asks Mindbody for
 * the days on screen - the month in Month, the week in Week - and only once
 * that pull has landed does it re-read them. Before, it only re-read what
 * Journey already held, so a booking made in Mindbody for later in the month
 * waited for the next morning's pull.
 */
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarView, type ScheduleWindowControls } from "./CalendarView";
import { visibleRange } from "../features/calendar";

// The Relay layer reads studio tasks from Firestore; not what is tested here.
vi.mock("../features/relay/board/RelayStrip", () => ({ RelayStrip: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

type Controls = ScheduleWindowControls & { ensureRange: Mock; refresh: Mock };

function controls(over: Partial<ScheduleWindowControls> = {}): Controls {
  return {
    ensureRange: vi.fn(),
    refresh: vi.fn(),
    lastFetchedAt: null,
    isFetching: false,
    ...over,
  } as Controls;
}

function mount(scheduleWindow: ScheduleWindowControls) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <CalendarView
        schedules={[]}
        trainers={[]}
        authTrainer={null}
        isAdmin
        activeStudioId="solon"
        scheduleWindow={scheduleWindow}
      />,
    );
  });
}

const refreshButton = () =>
  host!.querySelector<HTMLButtonElement>('button[aria-label="Refresh the schedule"]')!;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The forced re-reads: the mount's own look at the range is not forced. */
const forcedReads = (win: Controls) => win.ensureRange.mock.calls.filter((c) => c[2] === true);

describe("CalendarView — Refresh asks Mindbody for the days on screen", () => {
  it("pulls the month on screen, and re-reads it only once the pull has landed", async () => {
    const pull = deferred();
    const pullFromMindbody = vi.fn(() => pull.promise);
    const win = controls({ pullFromMindbody });
    mount(win);
    const { from, to } = visibleRange("month", new Date());

    await act(async () => {
      refreshButton().click();
    });
    expect(pullFromMindbody).toHaveBeenCalledTimes(1);
    const [pulledFrom, pulledTo] = pullFromMindbody.mock.calls[0] as unknown as [Date, Date];
    expect(pulledFrom.getTime()).toBe(from.getTime());
    expect(pulledTo.getTime()).toBe(to.getTime());
    // Nothing re-read on top of a write still in flight.
    expect(win.refresh).not.toHaveBeenCalled();
    expect(forcedReads(win)).toHaveLength(0);

    await act(async () => {
      pull.resolve();
      await pull.promise;
    });
    expect(win.refresh).toHaveBeenCalledTimes(1);
    expect(forcedReads(win)).toHaveLength(1);
    expect(forcedReads(win)[0][0].getTime()).toBe(from.getTime());
    expect(forcedReads(win)[0][1].getTime()).toBe(to.getTime());
  });

  it("in Week it pulls the week on screen", async () => {
    const pullFromMindbody = vi.fn(() => Promise.resolve());
    mount(controls({ pullFromMindbody }));
    const weekButton = [...host!.querySelectorAll<HTMLButtonElement>(".cal-seg__btn")].find(
      (b) => b.textContent === "week",
    )!;
    act(() => weekButton.click());

    await act(async () => {
      refreshButton().click();
    });
    const { from, to } = visibleRange("week", new Date());
    const [pulledFrom, pulledTo] = pullFromMindbody.mock.calls[0] as unknown as [Date, Date];
    expect(pulledFrom.getTime()).toBe(from.getTime());
    expect(pulledTo.getTime()).toBe(to.getTime());
  });

  it("a failed pull still re-reads what Journey holds", async () => {
    const win = controls({ pullFromMindbody: vi.fn(() => Promise.reject(new Error("Mindbody is down"))) });
    mount(win);
    await act(async () => {
      refreshButton().click();
    });
    expect(win.refresh).toHaveBeenCalledTimes(1);
    expect(forcedReads(win)).toHaveLength(1);
  });

  it("with no pull to ask (older call sites) it re-reads as it always did", async () => {
    const win = controls();
    mount(win);
    await act(async () => {
      refreshButton().click();
    });
    expect(win.refresh).toHaveBeenCalledTimes(1);
    expect(forcedReads(win)).toHaveLength(1);
  });

  it("says it is updating, and cannot be pressed twice, while a pull runs", () => {
    mount(controls({ pullFromMindbody: vi.fn(() => Promise.resolve()), isFetching: true }));
    expect(refreshButton().disabled).toBe(true);
    expect(host!.querySelector(".cal-refresh__note")?.textContent).toBe("Updating…");
  });
});
