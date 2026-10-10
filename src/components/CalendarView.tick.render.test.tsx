// @vitest-environment jsdom
/**
 * THE CALENDAR, MOUNTED, AS THE CLOCK AND THE FLOOR MOVE (the rooms round's
 * review, Oct 10 2026; the Hub's own test is ClientsView.tick.render.test.tsx).
 *
 * The Calendar ticks every 30 seconds (the "Updated 3 min ago" caption has to
 * age), and the session stream changes with every heartbeat of a running
 * session. Neither may draw the Day's cards again:
 *
 *   - a 30-second tick that passes no booking's end draws no card; one that
 *     does draws only the card whose state moved;
 *   - a heartbeat of a session whose client isn't booked that day draws no
 *     card, and one of a booked client's draws at most that card;
 *   - a render of the screen above with new handlers draws no card;
 *   - the Week's doors (open a client, open a day, the day states) keep their
 *     identity across all of it, so its memoised days and bookings hold.
 *
 * A card's draw is counted through the real module (cardRestWords is asked
 * once by every client card a HubCard draws).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const count = vi.hoisted(() => ({ cards: 0, weekProps: [] as Array<Record<string, unknown>> }));

vi.mock("../features/relay/board/RelayStrip", () => ({ RelayStrip: () => null }));
vi.mock("../features/calendar/useCalendarFord", () => {
  const state = { status: "ready", details: [] };
  return { useCalendarFord: () => state };
});
vi.mock("../features/standing-week/useStandingWeeks", () => {
  const state = { docs: [], loading: false, error: null };
  return { useStandingWeeks: () => state };
});
vi.mock("../features/admin/attention/booking-marks", async () => {
  const { bookingMarks } = await import("../lib/booking-state");
  const state = { rows: [], marks: bookingMarks([]), loading: false, failed: false };
  return { useBookingMarks: () => state, markNoShow: async () => {}, takeBackNoShow: async () => {} };
});
vi.mock("../hooks/useHubCriticalNotes", () => {
  const LAURA = [
    { id: "n1", clientId: "laura", importance: "critical", body: "No overhead pressing.", occurredAt: "2026-09-20T12:00:00Z", effectiveUntil: null, resolvedAt: null, isArchived: false },
  ];
  const state = { status: "ready", notesFor: (id: string | null | undefined) => (id === "laura" ? LAURA : []) };
  return { useHubCriticalNotes: () => state };
});
/* A card's draw: cardRestWords is asked once by every client card it draws. */
vi.mock("../features/hub-schedule/card-marks", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/hub-schedule/card-marks")>();
  return {
    ...real,
    cardRestWords: (...args: Parameters<typeof real.cardRestWords>) => {
      count.cards += 1;
      return real.cardRestWords(...args);
    },
  };
});
/* The Week, unchanged, with the props it was handed recorded. */
vi.mock("../features/calendar/WeekView", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/calendar/WeekView")>();
  return {
    ...real,
    WeekView: (props: Parameters<typeof real.WeekView>[0]) => {
      count.weekProps.push(props as unknown as Record<string, unknown>);
      return real.WeekView(props);
    },
  };
});

import { CalendarView } from "./CalendarView";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** Wednesday Oct 14 2026 at the studio. */
const at = (hm: string) => new Date(`2026-10-14T${hm}-04:00`);
const trainer = (id: string, fullName: string) => ({ id, fullName, initials: fullName.slice(0, 2), role: "Trainer", primaryHomeStudioId: "solon", accessibleStudioIds: [], activeGuestStudioIds: [] });
const IO = trainer("t-ioreth", "Ioreth");
const BE = trainer("t-beregond", "Beregond");
const TRAINERS = [BE, IO] as any[];
const client = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName, isActive: true, homeStudioId: "solon", isLiabilityReleased: true });
const CLIENTS = [
  client("hamfast", "Hamfast", "Gamgee"),
  client("belladonna", "Belladonna", "Took"),
  client("estella", "Estella", "Bolger"),
  client("laura", "Laura", "Grubb"),
  client("rose", "Rose", "Cotton"),
] as any[];
let seq = 0;
const book = (t: any, clientId: string, hm: string, minutes = 30) => {
  const start = at(`${hm}:00`);
  const c = CLIENTS.find((x) => x.id === clientId);
  return {
    id: `b${++seq}`,
    clientId,
    clientName: `${c.firstName} ${c.lastName}`,
    trainerId: t.id,
    trainerName: t.fullName,
    studioId: "solon",
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60_000),
    status: "Scheduled",
    serviceName: "1:1 Strength Training",
  };
};
const SCHEDULES = [
  book(IO, "rose", "08:00"),
  book(BE, "estella", "08:30"),
  book(IO, "hamfast", "09:30"),
  // 9:10 to 9:40: live through the five minutes' slack, "Not logged" from 9:45.
  book(BE, "belladonna", "09:10"),
  book(BE, "laura", "11:00"),
];
const running = { id: "s-hamfast", clientId: "hamfast", trainerId: "t-ioreth", status: "In-Progress", hostedAtStudioId: "solon", startTime: at("09:31:00"), date: at("09:31:00").toISOString(), createdAt: at("09:31:00"), lastHeartbeatAt: at("09:39:00") };
const done = { id: "s-rose", clientId: "rose", trainerId: "t-ioreth", status: "Completed", hostedAtStudioId: "solon", startTime: at("08:01:00"), date: at("08:01:00").toISOString(), createdAt: at("08:01:00") };
/** Someone not booked today, running a session at the studio. */
const elsewhere = { id: "s-other", clientId: "not-today", trainerId: "t-ioreth", status: "In-Progress", hostedAtStudioId: "solon", startTime: at("09:35:00"), date: at("09:35:00").toISOString(), createdAt: at("09:35:00"), lastHeartbeatAt: at("09:39:00") };

const scheduleWindow = { ensureRange: () => {}, refresh: () => {}, lastFetchedAt: null, isFetching: false, dayState: () => "ready" as const };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let props: Record<string, unknown> = {};
const draw = () => act(() => root!.render(<CalendarView {...(props as any)} />));
const cardOf = (name: string) => [...host!.querySelectorAll<HTMLElement>(".hs-card")].find((c) => c.textContent?.includes(name));
const switchTo = (words: string) =>
  act(() => [...host!.querySelectorAll<HTMLButtonElement>(".rm-switch__btn")].find((b) => b.textContent === words)!.click());
const tick = (times = 1) => act(() => vi.advanceTimersByTime(30_000 * times));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(at("09:40:00"));
  count.cards = 0;
  count.weekProps = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  props = {
    schedules: SCHEDULES,
    trainers: TRAINERS,
    authTrainer: IO,
    isAdmin: false,
    activeStudioId: "solon",
    clients: CLIENTS,
    rosterStatus: "ready",
    sessions: [running, done, elsewhere],
    sessionsKnown: true,
    onSelectClient: () => {},
    setView: () => {},
    scheduleWindow,
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("the Calendar's Day as the clock moves", () => {
  it("a 30-second tick that passes no booking's end draws no card", () => {
    draw();
    switchTo("Day");
    expect(cardOf("Rose Cotton")?.dataset.state).toBe("done");
    expect(cardOf("Estella Bolger")?.dataset.state).toBe("not-logged");
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("in-session");
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("live");
    count.cards = 0;
    tick();
    expect(count.cards).toBe(0);
  });

  it("ticks that pass a booking's end draw only the card whose state moved", () => {
    draw();
    switchTo("Day");
    count.cards = 0;
    // 9:40 to 9:46 in twelve ticks: Belladonna's 9:10 ran out of slack at 9:45.
    tick(12);
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("not-logged");
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("in-session");
    expect(count.cards).toBe(1);
  });
});

describe("the Calendar's Day as the floor moves", () => {
  it("a heartbeat of someone not booked today draws no card", () => {
    draw();
    switchTo("Day");
    count.cards = 0;
    props = { ...props, sessions: [running, done, { ...elsewhere, lastHeartbeatAt: at("09:39:45") }] };
    draw();
    expect(count.cards).toBe(0);
  });

  it("a booked client's own heartbeat draws at most that card", () => {
    draw();
    switchTo("Day");
    count.cards = 0;
    props = { ...props, sessions: [{ ...running, lastHeartbeatAt: at("09:39:45") }, done, elsewhere] };
    draw();
    expect(count.cards).toBeLessThanOrEqual(1);
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("in-session");
  });

  it("a render of the screen above with new handlers draws no card", () => {
    draw();
    switchTo("Day");
    count.cards = 0;
    props = { ...props, onSelectClient: () => {}, setView: () => {} };
    draw();
    expect(count.cards).toBe(0);
  });

  it("the doors keep working with the newest handlers", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const setView = vi.fn();
    props = { ...props, onSelectClient: first, setView };
    draw();
    switchTo("Day");
    props = { ...props, onSelectClient: latest };
    draw();
    act(() => cardOf("Laura Grubb")!.click());
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("laura");
    expect(setView).toHaveBeenCalledWith("profile");
  });
});

describe("the Calendar's Week keeps its doors", () => {
  it("across a tick, a heartbeat and new handlers from above, the Week is handed the same doors and day states", () => {
    draw();
    switchTo("Week");
    const first = count.weekProps.at(-1)!;
    tick();
    props = { ...props, sessions: [{ ...running, lastHeartbeatAt: at("09:40:15") }, done, elsewhere], onSelectClient: () => {}, setView: () => {} };
    draw();
    const last = count.weekProps.at(-1)!;
    expect(count.weekProps.length).toBeGreaterThan(1);
    for (const key of ["onSelectClient", "onSelectDate", "stateOf", "priorStateOf", "profileOf", "sessions", "trainerRefs"]) {
      expect(last[key], key).toBe(first[key]);
    }
  });
});
