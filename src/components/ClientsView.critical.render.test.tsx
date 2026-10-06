// @vitest-environment jsdom
/**
 * THE CRITICAL TRIANGLE ARRIVES WITH THE CARDS (speed round, Oct 5 2026, R8).
 *
 * The Hub asks for the day's Critical notes by the bookings' own client
 * ids (a booking's clientId is the client's document id), so the read
 * starts with the bookings rather than waiting for the client list, and it
 * is not asked again when the list lands. The real ClientsView, with the
 * reads stood in for.
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

describe("the Critical triangle arrives with the cards (R8)", () => {
  it("asks for the bookings' own clients before the client list is in, and asks again for nothing when it lands", () => {
    props = { ...props, clients: [], rosterLoading: true };
    draw();
    const first = count.criticalAsked[count.criticalAsked.length - 1];
    expect([...first].sort()).toEqual(["belladonna", "estella", "hamfast", "laura", "rose"]);
    props = { ...props, clients: CLIENTS, rosterLoading: false };
    draw();
    expect([...count.criticalAsked[count.criticalAsked.length - 1]].sort()).toEqual([...first].sort());
    // And the card has its triangle on its first draw with a profile.
    expect(cardOf("Laura Grubb")?.querySelector(".hs-tri")?.getAttribute("aria-label")).toBe("Critical: No overhead pressing.");
  });
});
