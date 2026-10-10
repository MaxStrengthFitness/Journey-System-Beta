// @vitest-environment jsdom
/**
 * The calendar's Refresh, MOUNTED (AJ, Sep 26 2026): it asks Mindbody for
 * the days on screen - the month in Month, the week in Week - and only once
 * that pull has landed does it re-read them. Before, it only re-read what
 * Journey already held, so a booking made in Mindbody for later in the month
 * waited for the next morning's pull.
 */
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarView, type ScheduleWindowControls } from "./CalendarView";
import { visibleRange } from "../features/calendar";
import { studioDateKey } from "../lib/studio-time";

// The Relay layer reads studio tasks from Firestore; not what is tested here.
vi.mock("../features/relay/board/RelayStrip", () => ({ RelayStrip: () => null }));
// The FORD read behind Events (ford-events.test.ts covers what it becomes).
vi.mock("../features/calendar/useCalendarFord", () => ({ useCalendarFord: () => ({ status: "ready", details: [] }) }));

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

function mount(scheduleWindow: ScheduleWindowControls, extra: Partial<ComponentProps<typeof CalendarView>> = {}) {
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
        {...extra}
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
    // The room's one switch (the rooms round, Oct 10 2026; it was .cal-seg__btn).
    const weekButton = [...host!.querySelectorAll<HTMLButtonElement>(".rm-switch__btn")].find(
      (b) => b.textContent === "Week",
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

/* ---------------------------------------------------------------------------
   The rooms round (Oct 10 2026): the Calendar is a room.
   --------------------------------------------------------------------------- */

const todayKey = () => studioDateKey(new Date())!;
const viewButton = (words: string) =>
  [...host!.querySelectorAll<HTMLButtonElement>(".rm-switch__btn")].find((b) => b.textContent === words)!;

describe("CalendarView — the room bar", () => {
  it("says it is the Calendar, with one switch for Month · Week · Day", () => {
    mount(controls());
    const bar = host!.querySelector("header.rm-bar")!;
    expect(bar.getAttribute("data-room")).toBe("calendar");
    expect(bar.querySelector("h1")?.textContent).toBe("Calendar");
    const switches = bar.querySelectorAll('.rm-switch[role="group"]');
    expect(switches).toHaveLength(1);
    expect([...switches[0].querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Month", "true"],
      ["Week", "false"],
      ["Day", "false"],
    ]);
    // The old header's boxes are gone: no second switch, no native select.
    expect(host!.querySelector("select")).toBeNull();
    expect(host!.querySelector(".cal-header")).toBeNull();
  });

  it("offers Today only away from today, and Today comes back to it", () => {
    mount(controls());
    const today = () => [...host!.querySelectorAll<HTMLButtonElement>(".rm-bar button")].find((b) => b.textContent === "Today");
    expect(today()).toBeUndefined();
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')!.click());
    expect(today()).toBeDefined();
    act(() => today()!.click());
    expect(today()).toBeUndefined();
  });

  it("the team picker lists whole names, yours first and marked You, and narrows the bookings", () => {
    const trainers = [
      { id: "t-zed", fullName: "Zed Alvarez-Featherstonehaugh", primaryHomeStudioId: "solon" },
      { id: "t-me", fullName: "Lena Lindqvist", primaryHomeStudioId: "solon" },
      { id: "t-amy", fullName: "Amy Brooks", primaryHomeStudioId: "solon" },
    ] as any[];
    mount(controls(), { trainers, authTrainer: trainers[1] });
    const trigger = host!.querySelector<HTMLButtonElement>(".cal-pick__btn")!;
    expect(trigger.textContent).toBe("Entire team");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger.click());
    const options = [...host!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(["Entire team", "Lena LindqvistYou", "Amy Brooks", "Zed Alvarez-Featherstonehaugh"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    act(() => options[3].click());
    expect(host!.querySelector('[role="listbox"]')).toBeNull();
    expect(host!.querySelector(".cal-pick__btn")!.textContent).toBe("Zed Alvarez-Featherstonehaugh");
  });
});

describe("CalendarView — a day that wasn't read is never an empty day", () => {
  it("says so once, in plum, with Try again, which asks again for the days on screen", () => {
    const retry = vi.fn();
    const win = controls({ dayState: (key) => (key === todayKey() ? "failed" : "ready"), retry });
    mount(win);
    const notice = host!.querySelector(".hs-notice")!;
    expect(notice.textContent).toMatch(/Couldn.t read one of these days. bookings/);
    act(() => notice.querySelector<HTMLButtonElement>(".hs-notice-btn")!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    const { from, to } = visibleRange("month", new Date());
    const forced = forcedReads(win);
    expect(forced).toHaveLength(1);
    expect(forced[0][0].getTime()).toBe(from.getTime());
    expect(forced[0][1].getTime()).toBe(to.getTime());
  });

  it("Month: a read day with nothing booked says —; one not read says nothing; one whose read failed is marked", () => {
    const states: Record<string, "ready" | "loading" | "failed"> = {};
    const win = controls({ dayState: (key) => states[key] ?? "ready" });
    const today = new Date();
    const keyOf = (d: number) => studioDateKey(new Date(today.getFullYear(), today.getMonth(), d, 12))!;
    states[keyOf(10)] = "loading";
    states[keyOf(11)] = "failed";
    mount(win);
    const cellOf = (d: number) =>
      [...host!.querySelectorAll<HTMLButtonElement>(".cal-day:not([data-outside])")].find((c) => c.querySelector(".cal-day__num")?.textContent === String(d))!;
    expect(cellOf(9).querySelector(".cal-day__count")!.textContent).toBe("—");
    expect(cellOf(10).querySelector(".cal-day__count")!.textContent).toBe("");
    expect(cellOf(11).querySelector(".cal-day__unread")).not.toBeNull();
    expect(cellOf(11).getAttribute("aria-label")).toMatch(/couldn't be read/);
    expect(cellOf(11).querySelector(".cal-day__count")!.textContent).not.toContain("—");
  });

  it("Day: says this day couldn't be read", () => {
    mount(controls({ dayState: () => "failed" }));
    act(() => viewButton("Day").click());
    expect(host!.querySelector(".hs-notice")!.textContent).toMatch(/Couldn.t read this day.s bookings/);
  });
});

describe("CalendarView — Month's quiet cells", () => {
  it("marks today with its own attribute and the picked day separately, and draws no trainers' avatars", () => {
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const schedules = [
      { id: "b1", clientId: "c1", clientName: "Ruth Avery", trainerId: "t1", trainerName: "Lena", startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60000).toISOString(), status: "Scheduled", studioId: "solon" },
    ] as any[];
    mount(controls(), { schedules, trainers: [{ id: "t1", fullName: "Lena Lindqvist", primaryHomeStudioId: "solon" }] as any[] });
    const today = host!.querySelector<HTMLButtonElement>('.cal-day[data-today="true"]')!;
    expect(today.getAttribute("data-picked")).toBe("true");
    expect(today.querySelector(".cal-day__count")!.textContent).toBe("1");
    expect(host!.querySelector(".cal-avatar")).toBeNull();
    expect(host!.querySelectorAll('.cal-day[data-today="true"]')).toHaveLength(1);
  });
});
