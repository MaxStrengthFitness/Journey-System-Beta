// @vitest-environment jsdom
/**
 * The Calendar, MOUNTED.
 *
 * Refresh (AJ, Sep 26 2026): it asks Mindbody for the days on screen - the
 * month in Month, the week in Week - and only once that pull has landed does
 * it re-read them. Before, it only re-read what Journey already held, so a
 * booking made in Mindbody for later in the month waited for the next
 * morning's pull.
 *
 * The room (the rooms round, Oct 10 2026, and its review): the room bar,
 * unknown never empty, Month's quiet cells, the Day as the Hub's grid with
 * the Hub's card states on the days the sessions cover, the Week's bookings.
 *
 * Every case runs on a held clock: Wednesday Oct 14 2026, 9:40 AM at the
 * studio (the suite runs at America/New_York).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarView, stepDate, type ScheduleWindowControls } from "./CalendarView";
import { visibleRange } from "../features/calendar";
import { studioDateKey } from "../lib/studio-time";
import { FETCH_RETRY_MS } from "../lib/schedule-window";

const held = vi.hoisted(() => ({
  standingWeeksAsked: [] as Array<string | null>,
  marks: [] as Array<{ id: string; noShow?: boolean }>,
  marksAsked: [] as Array<[string | null, string, string]>,
  critical: {} as Record<string, unknown[]>,
}));

// The Relay layer reads studio tasks from Firestore; not what is tested here.
vi.mock("../features/relay/board/RelayStrip", () => ({ RelayStrip: () => null }));
// The FORD read behind Events (ford-events.test.ts covers what it becomes).
vi.mock("../features/calendar/useCalendarFord", () => ({ useCalendarFord: () => ({ status: "ready", details: [] }) }));
// The Day's hatching reads the agreed standing weeks (off-hours.test.ts covers them).
vi.mock("../features/standing-week/useStandingWeeks", () => {
  const state = { docs: [], loading: false, error: null };
  return {
    useStandingWeeks: (studioId: string | null) => {
      held.standingWeeksAsked.push(studioId);
      return state;
    },
  };
});
// The Day's "didn't come" marks: the Hub's own listener, read for the day on screen.
vi.mock("../features/admin/attention/booking-marks", async () => {
  const { bookingMarks } = await import("../lib/booking-state");
  return {
    useBookingMarks: (studioId: string | null, from: string, to: string) => {
      held.marksAsked.push([studioId, from, to]);
      return studioId ? { rows: held.marks, marks: bookingMarks(held.marks), loading: false, failed: false } : { rows: [], marks: null, loading: false, failed: false };
    },
  };
});
// The Day's Critical triangle: the Hub's one live read for the day's booked clients.
vi.mock("../hooks/useHubCriticalNotes", () => ({
  useHubCriticalNotes: () => ({ status: "ready", notesFor: (id: string | null | undefined) => (id ? (held.critical[id] as never) ?? [] : null) }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Wednesday Oct 14 2026, 9:40 AM at the studio. */
const NOW = new Date("2026-10-14T13:40:00Z");
// Held while the file is collected too: the describe bodies below build their
// bookings then, before any beforeEach has run.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(NOW);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  held.standingWeeksAsked = [];
  held.marks = [];
  held.marksAsked = [];
  held.critical = {};
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
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
/** A studio day's key from a local date at noon. */
const keyOn = (y: number, m: number, d: number) => studioDateKey(new Date(y, m - 1, d, 12))!;
const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
    act(() => viewButton("Week").click());

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
const navLabel = () => host!.querySelector(".cal-nav__primary")?.textContent;

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

describe("CalendarView — a month steps from its 1st (the review, Oct 10 2026)", () => {
  it("stepDate: Oct 31 and a month on is November, Mar 31 and a month back is February", () => {
    expect(stepDate(new Date(2026, 9, 31, 12), "month", 1).getMonth()).toBe(10);
    expect(stepDate(new Date(2027, 2, 31, 12), "month", -1).getMonth()).toBe(1);
    expect(stepDate(new Date(2026, 0, 31, 12), "month", 1).getMonth()).toBe(1);
    // A week and a day still step by days.
    expect(localYmd(stepDate(new Date(2026, 9, 31, 12), "week", 1))).toBe("2026-11-07");
    expect(localYmd(stepDate(new Date(2026, 9, 31, 12), "day", -1))).toBe("2026-10-30");
  });

  it("mounted on Oct 31, Next month says November", () => {
    vi.setSystemTime(new Date("2026-10-31T13:40:00Z"));
    mount(controls());
    expect(navLabel()).toBe("October");
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')!.click());
    expect(navLabel()).toBe("November");
  });

  it("mounted on Mar 31, Previous month says February", () => {
    vi.setSystemTime(new Date("2027-03-31T13:40:00Z"));
    mount(controls());
    expect(navLabel()).toBe("March");
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!.click());
    expect(navLabel()).toBe("February");
  });
});

describe("CalendarView — a day that wasn't read is never an empty day", () => {
  it("says so once, in plum; Try again reopens the listener for a live day, without re-reading the range", () => {
    const retry = vi.fn();
    const win = controls({ dayState: (key) => (key === todayKey() ? "failed" : "ready"), retry });
    mount(win);
    const notice = host!.querySelector(".hs-notice")!;
    expect(notice.textContent).toMatch(/Couldn.t read one of these days. bookings/);
    act(() => notice.querySelector<HTMLButtonElement>(".hs-notice-btn")!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(forcedReads(win)).toHaveLength(0);
  });

  it("Try again re-reads only the failed span of fetched days, not the whole month", () => {
    const retry = vi.fn();
    const failed = new Set([keyOn(2026, 10, 20), keyOn(2026, 10, 22)]);
    const win = controls({ dayState: (key) => (failed.has(key) ? "failed" : "ready"), retry });
    mount(win);
    expect(host!.querySelector(".hs-notice")!.textContent).toMatch(/Couldn.t read 2 of these days/);
    act(() => host!.querySelector<HTMLButtonElement>(".hs-notice-btn")!.click());
    expect(retry).not.toHaveBeenCalled();
    const forced = forcedReads(win);
    expect(forced).toHaveLength(1);
    expect(localYmd(forced[0][0])).toBe("2026-10-20");
    expect(localYmd(forced[0][1])).toBe("2026-10-22");
  });

  it("asks again for a failed span on an interval while it stays failed and the page is visible, and stops once it is read", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    const failed = new Set([keyOn(2026, 10, 20)]);
    let states = (key: string) => (failed.has(key) ? ("failed" as const) : ("ready" as const));
    const win = controls({ dayState: (key) => states(key) });
    mount(win);
    // Forced: a day read before keeps its stamp, and an unforced ask would skip it.
    const retries = () => win.ensureRange.mock.calls.filter((c) => c[2] === true && localYmd(c[0]) === "2026-10-20" && localYmd(c[1]) === "2026-10-20");
    expect(retries()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(FETCH_RETRY_MS));
    expect(retries()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(FETCH_RETRY_MS));
    expect(retries()).toHaveLength(2);
    // The day is read: a new dayState, and no more asking.
    states = () => "ready";
    act(() => {
      root!.render(<CalendarView schedules={[]} trainers={[]} authTrainer={null} activeStudioId="solon" scheduleWindow={{ ...win, dayState: (key) => states(key) }} />);
    });
    act(() => vi.advanceTimersByTime(FETCH_RETRY_MS * 3));
    expect(retries()).toHaveLength(2);
  });

  it("Month: a read day with nothing booked says —; one not read says nothing; one whose read failed is marked", () => {
    const states: Record<string, "ready" | "loading" | "failed"> = {};
    const win = controls({ dayState: (key) => states[key] ?? "ready" });
    states[keyOn(2026, 10, 10)] = "loading";
    states[keyOn(2026, 10, 11)] = "failed";
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

/* ---------------------------------------------------------------------------
   The Day is the Hub's grid (AJ's 2a).
   --------------------------------------------------------------------------- */

/** A booking today (or `daysFromToday` away) at a studio time, half an hour long. */
function bookingAt(hour: number, minute: number, over: Record<string, unknown>, daysFromToday = 0) {
  const start = new Date();
  start.setDate(start.getDate() + daysFromToday);
  start.setHours(hour, minute, 0, 0);
  return {
    status: "Scheduled",
    studioId: "solon",
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 30 * 60000).toISOString(),
    ...over,
  };
}

const TEAM = [
  { id: "t-chris", fullName: "Christine Avalos", primaryHomeStudioId: "solon" },
  { id: "t-me", fullName: "Lena Lindqvist", primaryHomeStudioId: "solon" },
] as any[];

const heads = () => [...host!.querySelectorAll(".hs-colhead")].map((h) => h.querySelector("strong")?.textContent);
const pickTrainer = (name: string) => {
  act(() => host!.querySelector<HTMLButtonElement>(".cal-pick__btn")!.click());
  const option = [...host!.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((o) => o.textContent?.startsWith(name))!;
  act(() => option.click());
};

describe("CalendarView — Day is the Hub's grid", () => {
  const schedules = [
    bookingAt(9, 0, { id: "b1", clientId: "c1", clientName: "Ruth Avery-Montgomery", trainerId: "t-chris", trainerName: "Christine Avalos" }),
    bookingAt(9, 30, { id: "b2", clientId: "c2", clientName: "Sam Okafor", trainerId: "t-me", trainerName: "Lena Lindqvist" }),
    // Mindbody's first name only, no id: the old matching gave it to Christine.
    bookingAt(10, 0, { id: "b3", clientId: "c3", clientName: "Priya Nair", trainerName: "Chris" }),
  ] as any[];
  const clients = [
    { id: "c1", firstName: "Ruth", lastName: "Avery-Montgomery", homeStudioId: "solon" },
    { id: "c2", firstName: "Sam", lastName: "Okafor", homeStudioId: "solon" },
    { id: "c3", firstName: "Priya", lastName: "Nair", homeStudioId: "solon" },
  ] as any[];

  function openDayView(extra: Partial<ComponentProps<typeof CalendarView>> = {}) {
    mount(controls(), { schedules, trainers: TEAM, authTrainer: TEAM[1], clients, ...extra });
    act(() => viewButton("Day").click());
  }

  it("draws the Hub's grid: your column first under You, then by id, and a name alone goes to Unassigned", () => {
    openDayView();
    expect(host!.querySelector(".hs-scroll")).not.toBeNull();
    expect(host!.querySelector(".cal-lanes__scroller, .cal-lane")).toBeNull();
    expect(heads()).toEqual(["LenaYou", "Unassigned", "Christine"]);
    const unassigned = [...host!.querySelectorAll(".hs-col")][1];
    expect(unassigned.textContent).toContain("Priya Nair");
    expect(unassigned.textContent).toContain("Booked with Chris");
    // Whole names, never cut.
    expect(host!.textContent).toContain("Ruth Avery-Montgomery");
  });

  it("a tap on a booking opens the client, as the Calendar always has, and says nothing about a dialog", () => {
    const onSelectClient = vi.fn();
    const setView = vi.fn();
    openDayView({ onSelectClient, setView });
    const card = [...host!.querySelectorAll<HTMLElement>('.hs-card[data-kind="client"]')].find((c) => c.textContent?.includes("Sam Okafor"))!;
    expect(card.getAttribute("aria-haspopup")).toBeNull();
    act(() => card.click());
    expect(onSelectClient).toHaveBeenCalledWith("c2");
    expect(setView).toHaveBeenCalledWith("profile");
  });

  it("the team filter narrows the Day to that trainer's column, and the rest of the row says so, not 'Nobody else is booked'", () => {
    openDayView();
    pickTrainer("Christine Avalos");
    expect(heads()).toEqual(["Christine"]);
    expect(host!.textContent).not.toContain("Priya Nair");
    expect(host!.querySelector(".hs-rest-head")?.textContent).toBe("Showing Christine’s bookings only");
    expect(host!.textContent).not.toContain("Nobody else is booked");
    // Your own: "your".
    pickTrainer("Lena Lindqvist");
    expect(host!.querySelector(".hs-rest-head")?.textContent).toBe("Showing your bookings only");
  });

  it("reads the agreed standing weeks only for someone who works here, only on the Day", () => {
    mount(controls(), { schedules, trainers: TEAM, authTrainer: TEAM[1], clients });
    expect(held.standingWeeksAsked).not.toContain("solon");
    act(() => viewButton("Day").click());
    expect(held.standingWeeksAsked.at(-1)).toBe("solon");
    act(() => viewButton("Week").click());
    expect(held.standingWeeksAsked.at(-1)).toBe(null);
  });

  it("never reads the standing weeks or the marks for someone who doesn't work at the studio", () => {
    const visitor = { id: "t-visitor", fullName: "Vera Visitor", primaryHomeStudioId: "westlake", role: "Trainer" } as any;
    mount(controls(), { schedules, trainers: [...TEAM, visitor], authTrainer: visitor, clients, sessionsKnown: true });
    act(() => viewButton("Day").click());
    expect(held.standingWeeksAsked).not.toContain("solon");
    expect(held.marksAsked.some(([studio]) => studio === "solon")).toBe(false);
    // The grid is drawn all the same.
    expect(host!.querySelector(".hs-scroll")).not.toBeNull();
  });

  it("says the day's life events folded, and their words on a tap; Month only marks the day", () => {
    const withBirthday = [...clients, { id: "c9", firstName: "Ruth", lastName: "Avery", homeStudioId: "solon", dateOfBirth: "1960-10-14" }];
    mount(controls(), { schedules, trainers: TEAM, authTrainer: TEAM[1], clients: withBirthday });
    // Month: a mark, no words in the cell.
    const cell = host!.querySelector<HTMLElement>('.cal-day[data-today="true"]')!;
    expect(cell.querySelector(".cal-day__life")).not.toBeNull();
    expect(cell.textContent).not.toContain("Ruth Avery");
    expect(cell.getAttribute("aria-label")).toMatch(/Ruth Avery/);
    act(() => viewButton("Day").click());
    const toggle = host!.querySelector<HTMLButtonElement>(".cal-life__toggle")!;
    expect(toggle.textContent).toBe("A life event");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(host!.querySelector(".cal-life__item")).toBeNull();
    act(() => toggle.click());
    expect(host!.querySelector(".cal-life__item")?.textContent).toMatch(/Ruth Avery/);
  });

  it("an empty day says nobody is booked only when it was read; while it is read it says so", () => {
    mount(controls({ dayState: () => "loading" }), { trainers: TEAM, authTrainer: TEAM[1] });
    act(() => viewButton("Day").click());
    expect(host!.querySelector(".hs-empty")?.textContent).toMatch(/Reading the day/);
    act(() => root!.unmount());
    host!.remove();
    mount(controls({ dayState: () => "ready" }), { trainers: TEAM, authTrainer: TEAM[1] });
    act(() => viewButton("Day").click());
    expect(host!.querySelector(".hs-empty")?.textContent).toBe("Nobody is booked on this day.");
  });
});

/* ---------------------------------------------------------------------------
   What a Day card says happened (the review, Oct 10 2026; AJ's Sep 24 rule:
   "a grey card with no word would read as done when it is not").
   --------------------------------------------------------------------------- */

describe("CalendarView — the Day's cards say what the Hub's say, only where the sessions cover the day", () => {
  const at = (h: number, m: number, daysFromToday = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const schedules = [
    bookingAt(8, 0, { id: "d0", clientId: "c0", clientName: "Nora Quill", trainerId: "t-me" }),
    bookingAt(8, 30, { id: "d4", clientId: "c4", clientName: "Ike Marsh", trainerId: "t-me" }),
    bookingAt(9, 0, { id: "d1", clientId: "c1", clientName: "Ruth Avery", trainerId: "t-chris" }),
    bookingAt(9, 30, { id: "d2", clientId: "c2", clientName: "Sam Okafor", trainerId: "t-chris" }),
    bookingAt(11, 0, { id: "d3", clientId: "c3", clientName: "Priya Nair", trainerId: "t-me" }),
    // Yesterday, finished, nothing in the 24-hour stream for it.
    bookingAt(8, 0, { id: "y1", clientId: "c1", clientName: "Ruth Avery", trainerId: "t-chris" }, -1),
  ] as any[];
  const clients = ["c0", "c1", "c2", "c3", "c4"].map((id) => ({ id, firstName: id.toUpperCase(), lastName: "Client", homeStudioId: "solon" })) as any[];
  const sessions = [
    { id: "s1", clientId: "c1", status: "Completed", hostedAtStudioId: "solon", startTime: at(9, 2), date: at(9, 2).toISOString(), createdAt: at(9, 2) },
    { id: "s2", clientId: "c2", status: "In-Progress", hostedAtStudioId: "solon", startTime: at(9, 31), date: at(9, 31).toISOString(), createdAt: at(9, 31), lastHeartbeatAt: at(9, 38) },
  ] as any[];
  const cardOf = (name: string) => [...host!.querySelectorAll<HTMLElement>(".hs-card")].find((c) => c.textContent?.includes(name))!;

  function openDay(extra: Partial<ComponentProps<typeof CalendarView>> = {}) {
    mount(controls(), { schedules, trainers: TEAM, authTrainer: TEAM[1], clients, sessions, sessionsKnown: true, ...extra });
    act(() => viewButton("Day").click());
  }

  it("today, once the stream has answered: done, Not logged, In session, Didn't come, and the Critical triangle", () => {
    held.marks = [{ id: "d4", noShow: true }];
    held.critical = {
      c3: [{ id: "n1", clientId: "c3", importance: "critical", body: "No overhead pressing.", occurredAt: "2026-10-01T12:00:00Z", effectiveUntil: null, resolvedAt: null, isArchived: false }],
    };
    openDay();
    expect(cardOf("C1 Client").getAttribute("data-state")).toBe("done");
    expect(cardOf("C0 Client").getAttribute("data-state")).toBe("not-logged");
    expect(cardOf("C0 Client").textContent).toContain("Not logged");
    expect(cardOf("C2 Client").getAttribute("data-state")).toBe("in-session");
    expect(cardOf("C2 Client").textContent).toContain("In session");
    expect(cardOf("C4 Client").getAttribute("data-state")).toBe("didnt-come");
    expect(cardOf("C3 Client").getAttribute("data-state")).toBe("live");
    expect(cardOf("C3 Client").querySelector(".hs-tri")?.getAttribute("aria-label")).toMatch(/No overhead pressing/);
    // The marks are the Hub's listener, for the day on screen.
    expect(held.marksAsked.at(-1)).toEqual(["solon", todayKey(), todayKey()]);
  });

  it("while the stream hasn't answered, today's cards are unread: no fade, no word, never done", () => {
    openDay({ sessionsKnown: false });
    for (const name of ["C0 Client", "C1 Client", "C4 Client"]) {
      expect(cardOf(name).getAttribute("data-state"), name).toBe("unread");
      expect(cardOf(name).getAttribute("data-recede"), name).toBe("false");
    }
    expect(host!.textContent).not.toContain("Not logged");
  });

  it("a day before today is unread, its finished bookings neither faded nor said", () => {
    openDay();
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Previous day"]')!.click());
    const card = cardOf("C1 Client");
    expect(card.getAttribute("data-state")).toBe("unread");
    expect(card.getAttribute("data-recede")).toBe("false");
    expect(card.textContent).not.toMatch(/Not logged|Late cancel|Left open/);
    // No marks are read for a day whose cards say nothing.
    expect(held.marksAsked.at(-1)?.[0]).toBe(null);
  });
});

/* ---------------------------------------------------------------------------
   The Week shows the bookings, day by day, the charts folded (AJ's 3b).
   --------------------------------------------------------------------------- */

describe("CalendarView — Week is the week's bookings", () => {
  const schedules = [
    bookingAt(9, 0, { id: "w1", clientId: "c1", clientName: "Ruth Avery-Montgomery", trainerId: "t-chris", trainerName: "Christine Avalos" }),
    bookingAt(9, 0, { id: "w2", clientId: "c2", clientName: "Sam Okafor", trainerId: "t-me", trainerName: "Lena Lindqvist" }),
    bookingAt(10, 30, { id: "w3", clientId: "c3", clientName: "Priya Nair", trainerName: "Samuel Lee" }),
    bookingAt(11, 0, { id: "w4", clientName: "Unavailable", trainerId: "t-chris", trainerName: "Christine Avalos" }),
  ] as any[];
  const clients = [{ id: "c1" }, { id: "c2" }, { id: "c3" }] as any[];

  function openWeek(extra: Partial<ComponentProps<typeof CalendarView>> = {}) {
    mount(controls(), { schedules, trainers: TEAM, authTrainer: TEAM[1], clients, rosterStatus: "ready", ...extra });
    act(() => viewButton("Week").click());
  }
  const today = () => host!.querySelector<HTMLElement>('.cal-wday[data-today="true"]')!;

  it("lists today's bookings by their time, whole names and who each is with, yours first and blue", () => {
    openWeek();
    expect(host!.querySelectorAll(".cal-wday")).toHaveLength(7);
    const slots = [...today().querySelectorAll(".cal-wslot")];
    expect(slots.map((s) => s.querySelector(".cal-wslot__time")?.textContent)).toEqual(["9 AM", "10:30 AM"]);
    const nine = [...slots[0].querySelectorAll<HTMLButtonElement>(".cal-wbk")];
    expect(nine.map((b) => [b.querySelector(".cal-wbk__name")?.textContent, b.querySelector(".cal-wbk__with")?.textContent, b.getAttribute("data-mine")])).toEqual([
      ["Sam Okafor", "with you", "true"],
      ["Ruth Avery-Montgomery", "with Christine", null],
    ]);
    // A booking no trainer claims says Mindbody's staff name; "Unavailable" is never a booking.
    expect(slots[1].textContent).toContain("with Samuel Lee");
    expect(today().textContent).not.toContain("Unavailable");
    expect(today().querySelector(".cal-wday__count")?.textContent).toBe("3 sessions");
  });

  it("opens on today: in the week holding today, a day already over is folded to its head, one tap away", () => {
    // Monday Oct 12, two days before the held Wednesday.
    const earlier = bookingAt(9, 0, { id: "w9", clientId: "c1", clientName: "Iris Okonkwo", trainerId: "t-chris", trainerName: "Christine Avalos" }, -2);
    openWeek({ schedules: [...schedules, earlier] });
    const monday = [...host!.querySelectorAll<HTMLElement>(".cal-wday")].find((s) => s.querySelector(".cal-wday__name")?.textContent === "Monday")!;
    expect(monday.querySelector(".cal-wday__count")?.textContent).toBe("1 session");
    expect(monday.getAttribute("data-folded")).toBe("true");
    expect(monday.textContent).not.toContain("Iris Okonkwo");
    const fold = monday.querySelector<HTMLButtonElement>(".cal-wday__fold")!;
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    act(() => fold.click());
    expect(monday.textContent).toContain("Iris Okonkwo");
    // Today is open.
    expect(today().getAttribute("data-folded")).toBeNull();
    expect(today().querySelector(".cal-wbk")).not.toBeNull();
  });

  it("folds the charts under the strip, closed until asked for", () => {
    openWeek();
    const fold = host!.querySelector<HTMLButtonElement>(".cal-fold__btn")!;
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(host!.querySelector(".cal-board, .cal-heat, .cal-bars")).toBeNull();
    act(() => fold.click());
    expect(host!.querySelector(".cal-board")).not.toBeNull();
    expect(host!.querySelector(".cal-heat")).not.toBeNull();
    expect(host!.querySelector(".cal-total__delta")).not.toBeNull();
  });

  it("a tap on a booking opens the client; a tap on a day's head or the strip opens that Day", () => {
    const onSelectClient = vi.fn();
    const setView = vi.fn();
    openWeek({ onSelectClient, setView });
    const ruth = [...host!.querySelectorAll<HTMLButtonElement>(".cal-wbk")].find((b) => b.textContent?.includes("Ruth"))!;
    act(() => ruth.click());
    expect(onSelectClient).toHaveBeenCalledWith("c1");
    expect(setView).toHaveBeenCalledWith("profile");
    act(() => today().querySelector<HTMLButtonElement>(".cal-wday__open")!.click());
    expect(viewButton("Day").getAttribute("aria-pressed")).toBe("true");
    expect(host!.querySelector(".hs-scroll")).not.toBeNull();
    act(() => viewButton("Week").click());
    act(() => host!.querySelector<HTMLButtonElement>('.cal-wstrip__day[data-today="true"]')!.click());
    expect(viewButton("Day").getAttribute("aria-pressed")).toBe("true");
  });

  it("a day not read says so, never Nobody booked; a read empty day says Nobody booked", () => {
    const failedKey = keyOn(2026, 10, 11); // the Sunday of the held week
    mount(controls({ dayState: (key) => (key === failedKey ? "failed" : "ready") }), { trainers: TEAM, authTrainer: TEAM[1] });
    act(() => viewButton("Week").click());
    const quiet = [...host!.querySelectorAll<HTMLElement>(".cal-wday__quiet")];
    expect(quiet.filter((q) => q.textContent === "Nobody booked.")).toHaveLength(6);
    const unread = quiet.filter((q) => q.getAttribute("data-unread") === "true");
    expect(unread).toHaveLength(1);
    expect(unread[0].textContent).toBe("Couldn’t read this day’s bookings.");
    expect(host!.querySelector(".hs-notice")?.textContent).toMatch(/Couldn.t read one of these days/);
  });
});
