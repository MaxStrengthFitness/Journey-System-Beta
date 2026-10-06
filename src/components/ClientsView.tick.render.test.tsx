// @vitest-environment jsdom
/**
 * THE HUB, MOUNTED, AS THE CLOCK AND THE FLOOR MOVE (speed round, Oct 5
 * 2026, R6, R7).
 *
 *   - a minute tick that passes no booking's start or end works nothing out
 *     again and draws no card again, though the Now line moves;
 *   - a tick that passes one works the day out again, and draws again only
 *     the cards whose state moved;
 *   - another trainer's heartbeat (one running session's document changes)
 *     works nothing out again and draws only that client's card;
 *   - a render of the screen above with new handlers draws no card.
 *
 * The engine's passes and the cards' draws are counted through the real
 * modules (momentsToday, buildDirectoryRows, cardRestWords), unchanged.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const count = vi.hoisted(() => ({ moments: 0, rows: 0, cards: 0, criticalAsked: [] as string[][] }));

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-ioreth" } } }));
vi.mock("../hooks/useHubCriticalNotes", () => {
  const LAURA = [
    { id: "n1", clientId: "laura", importance: "critical", body: "No overhead pressing.", occurredAt: "2026-09-20T12:00:00Z", effectiveUntil: null, resolvedAt: null, isArchived: false },
  ];
  const notesFor = (id: string | null | undefined) => (id === "laura" ? LAURA : []);
  return {
    useHubCriticalNotes: (ids: readonly (string | null | undefined)[]) => {
      count.criticalAsked.push(ids.filter(Boolean) as string[]);
      return { status: "ready", notesFor };
    },
  };
});
vi.mock("../features/studio-tasks/useStudioTasks", () => {
  const state = { counts: { total: 3, done: 1, flagged: 0 }, loading: false, rows: [], templates: [], dateKey: "", error: null };
  return { useStudioTasks: () => state };
});
vi.mock("../features/standing-week/useStandingWeeks", () => {
  const state = { docs: [], loading: false, error: null };
  return { useStandingWeeks: () => state };
});
vi.mock("../features/hub-opportunities/use-hub-ford", () => {
  const state = { status: "ready", fordFor: () => [] };
  return { useHubFord: () => state };
});
vi.mock("../features/hub-opportunities/use-hub-marks", () => {
  const state = { status: "ready", allStarOf: () => null };
  return { useHubMarks: () => state };
});
vi.mock("../features/admin/attention/booking-marks", async () => {
  const { bookingMarks } = await import("../lib/booking-state");
  const state = { rows: [], marks: bookingMarks([]), loading: false, failed: false };
  return { useBookingMarks: () => state, markNoShow: async () => {}, takeBackNoShow: async () => {} };
});
vi.mock("../features/renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../features/renewals/settings");
  const state = { settings: DEFAULT_RENEWAL_SETTINGS, saved: true, ownPackageTable: false, forStudioId: "westlake", loading: false, error: null };
  return { useRenewalSettings: () => state };
});
vi.mock("motion/react", async () => {
  const R = await import("react");
  const strip = ({ initial: _i, animate: _a, exit: _e, layout: _l, transition: _t, ...rest }: Record<string, unknown>) => rest;
  // One component per tag, as motion's own are: a new one each render would remount the whole screen.
  const made = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!made.has(tag)) made.set(tag, R.forwardRef((p: Record<string, unknown>, ref) => R.createElement(tag, { ...strip(p), ref })));
      return made.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children) };
});
/* The real engine, counted. */
vi.mock("../features/hub-opportunities/moments-today", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/hub-opportunities/moments-today")>();
  return {
    ...real,
    momentsToday: (input: Parameters<typeof real.momentsToday>[0]) => {
      count.moments += 1;
      return real.momentsToday(input);
    },
  };
});
vi.mock("../features/client-directory/row", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/client-directory/row")>();
  return {
    ...real,
    buildDirectoryRows: (...args: Parameters<typeof real.buildDirectoryRows>) => {
      count.rows += 1;
      return real.buildDirectoryRows(...args);
    },
  };
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

import { ClientsView } from "./ClientsView";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const at = (hm: string) => new Date(`2026-09-28T${hm}-04:00`);
const trainer = (id: string, fullName: string) => ({ id, fullName, initials: fullName.slice(0, 2), role: "Trainer", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [] });
const IO = trainer("t-ioreth", "Ioreth");
const BE = trainer("t-beregond", "Beregond");
const TRAINERS = [BE, IO] as any[];
const client = (id: string, firstName: string, lastName: string, sessionCount: number) => ({
  id,
  firstName,
  lastName,
  sessionCount,
  historyIsComplete: true,
  isActive: true,
  homeStudioId: "westlake",
  isLiabilityReleased: true,
});
const CLIENTS = [
  client("hamfast", "Hamfast", "Gamgee", 330),
  client("belladonna", "Belladonna", "Took", 41),
  client("estella", "Estella", "Bolger", 12),
  client("laura", "Laura", "Grubb", 44),
  client("rose", "Rose", "Cotton", 12),
] as any[];
let seq = 0;
const book = (t: any, clientId: string, hm: string) => {
  const start = at(`${hm}:00`);
  const c = CLIENTS.find((x) => x.id === clientId);
  return {
    id: `b${++seq}`,
    clientId,
    clientName: `${c.firstName} ${c.lastName}`,
    trainerId: t.id,
    trainerName: t.fullName,
    studioId: "westlake",
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60_000),
    status: "Scheduled",
    serviceName: "1:1 Strength Training",
  };
};
const SCHEDULES = [book(IO, "hamfast", "09:00"), book(IO, "belladonna", "09:30"), book(BE, "estella", "09:30"), book(BE, "laura", "11:00"), book(IO, "rose", "13:00")];
const running = { id: "s-hamfast", clientId: "hamfast", trainerId: "t-ioreth", status: "In-Progress", hostedAtStudioId: "westlake", startTime: at("09:01:00"), date: at("09:01:00").toISOString(), createdAt: at("09:01:00"), lastHeartbeatAt: at("09:20:00") };
const done = { id: "s-earlier", clientId: "rose", trainerId: "t-ioreth", status: "Completed", hostedAtStudioId: "westlake", startTime: at("07:00:00"), date: at("07:00:00").toISOString(), createdAt: at("07:00:00") };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let props: Record<string, unknown> = {};
const draw = () => act(() => root!.render(<ClientsView {...(props as any)} />));
const reset = () => {
  count.moments = 0;
  count.rows = 0;
  count.cards = 0;
};
const tickTo = (hms: string) => {
  vi.setSystemTime(at(hms));
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
};
const nowPill = () => host!.querySelector(".hs-now-pill")?.textContent;
const cardOf = (name: string) => [...host!.querySelectorAll<HTMLElement>(".hs-card")].find((c) => c.textContent?.includes(name));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at("09:24:00"));
  count.criticalAsked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  props = {
    clients: CLIENTS,
    trainers: TRAINERS,
    sortedTrainers: TRAINERS,
    isAdmin: false,
    activeStudioId: "westlake",
    authTrainer: IO,
    onSelectClient: () => {},
    setView: () => {},
    schedules: SCHEDULES,
    sessions: [running, done],
    sessionsKnown: true,
    searchTerm: "",
    onSearchTermChange: () => {},
    cutoverStudios: [{ id: "westlake", journeyCutoverDate: "2026-09-01" }],
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("the Hub as the clock moves", () => {
  it("a minute that passes no booking's start or end works nothing out and draws no card; the Now line still moves", () => {
    draw();
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("in-session");
    expect(nowPill()).toBe("9:24");
    reset();
    tickTo("09:25:00");
    expect(nowPill()).toBe("9:25");
    expect(count.moments).toBe(0);
    expect(count.rows).toBe(0);
    expect(count.cards).toBe(0);
  });

  it("a minute that passes a booking's end works the day out again, and draws only the cards whose state moved", () => {
    draw();
    tickTo("10:04:00");
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("live");
    reset();
    // Belladonna's and Estella's 9:30s ended at 10:00, and the five minutes' slack has run out.
    tickTo("10:05:30");
    expect(count.moments).toBeGreaterThan(0);
    // The rows are the studio day's: a tick never works them out again.
    expect(count.rows).toBe(0);
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("not-logged");
    expect(cardOf("Estella Bolger")?.dataset.state).toBe("not-logged");
    // Hamfast's, Laura's and Rose's cards are as they were, and were not drawn again.
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("in-session");
    expect(cardOf("Laura Grubb")?.dataset.state).toBe("live");
    expect(count.cards).toBe(2);
  });

  it("the studio's new day works everything out again", () => {
    draw();
    reset();
    tickTo("23:59:30");
    tickTo("23:59:59");
    const before = count.rows;
    vi.setSystemTime(new Date("2026-09-29T00:00:30-04:00"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(count.rows).toBeGreaterThan(before);
  });
});

describe("the Hub as the floor moves", () => {
  it("another trainer's heartbeat works nothing out, and draws only that client's card", () => {
    draw();
    reset();
    props = { ...props, sessions: [{ ...running, lastHeartbeatAt: at("09:24:30") }, done] };
    draw();
    expect(count.moments).toBe(0);
    expect(count.rows).toBe(0);
    expect(count.cards).toBeLessThanOrEqual(1);
  });

  it("a session finishing works the day out again", () => {
    draw();
    reset();
    props = { ...props, sessions: [{ ...running, status: "Completed" }, done] };
    draw();
    expect(count.moments).toBeGreaterThan(0);
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("done");
  });

  it("a render of the screen above with new handlers draws no card", () => {
    draw();
    reset();
    props = { ...props, onSelectClient: () => {}, setView: () => {} };
    draw();
    expect(count.moments).toBe(0);
    expect(count.cards).toBe(0);
  });
});

describe("the Hub before the server has answered (only the cache, or offline)", () => {
  it("a finished session in hand still says Done; a finished slot with nothing in hand says nothing until the server answers", () => {
    props = { ...props, sessions: [{ ...running, status: "Completed" }, done], sessionsKnown: false };
    vi.setSystemTime(at("10:05:30"));
    draw();
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("done");
    // Belladonna's and Estella's 9:30s are over and nothing is in hand: unknown, never "Not logged".
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("past");
    expect(cardOf("Estella Bolger")?.dataset.state).toBe("past");
    expect(cardOf("Belladonna Took")?.textContent).not.toContain("Not logged");
    props = { ...props, sessionsKnown: true };
    draw();
    expect(cardOf("Belladonna Took")?.dataset.state).toBe("not-logged");
    expect(cardOf("Hamfast Gamgee")?.dataset.state).toBe("done");
  });
});
