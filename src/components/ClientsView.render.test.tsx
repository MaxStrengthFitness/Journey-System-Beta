// @vitest-environment jsdom
/**
 * THE HUB, MOUNTED (calm Hub round, Sep 28 2026). The screen trainers open
 * sixty times a day had no mounted test; the round rebuilt its grid, its top
 * and its tap, so this proves the whole screen draws and behaves:
 *
 *   - a column per trainer, yours first; a card per booking, whole names,
 *     a consult at its real length, Mindbody's "Unavailable" as staff time;
 *   - the week with each day's count, and the list's own chips;
 *   - a tap opens the peek, which closes on Escape;
 *   - a chip lights its cards and dims the rest;
 *   - Opportunities opens on the same day's entries.
 *
 * The reads are stood in for (the Critical notes, the tasks, the standing
 * weeks, the package table); everything else is the real screen.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-ioreth" } } }));
vi.mock("../hooks/useHubCriticalNotes", () => ({
  useHubCriticalNotes: () => ({ status: "ready", notesFor: () => [] }),
}));
vi.mock("../features/studio-tasks/useStudioTasks", () => ({
  useStudioTasks: () => ({ counts: { total: 3, done: 1, flagged: 0 }, loading: false, rows: [], templates: [], dateKey: "", error: null }),
}));
vi.mock("../features/standing-week/useStandingWeeks", () => ({
  useStandingWeeks: () => ({
    docs: [
      {
        id: "uid-damrod",
        studioId: "westlake",
        trainerUid: "uid-damrod",
        trainerId: "t-damrod",
        trainerName: "Damrod",
        proposed: null,
        final: { hours: [{ weekday: 1, from: "09:00", to: "11:00" }], regulars: [] },
        away: [],
      },
    ],
    loading: false,
    error: null,
  }),
}));
vi.mock("../features/renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../features/renewals/settings");
  const state = { settings: DEFAULT_RENEWAL_SETTINGS, saved: true, ownPackageTable: false, forStudioId: "westlake", loading: false, error: null };
  return { useRenewalSettings: () => state };
});
// The screen's entrance animation is not what is under test.
vi.mock("motion/react", async () => {
  const R = await import("react");
  const strip = ({ initial: _i, animate: _a, exit: _e, layout: _l, transition: _t, ...rest }: Record<string, unknown>) => rest;
  const motion = new Proxy({}, { get: (_t, tag: string) => R.forwardRef((p: Record<string, unknown>, ref) => R.createElement(tag, { ...strip(p), ref })) });
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children) };
});

import { ClientsView } from "./ClientsView";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const at = (hm: string) => new Date(`2026-09-28T${hm}:00-04:00`);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at("09:24")); // Monday, 9:24 AM at the studio
  try {
    window.localStorage.clear();
  } catch {
    // no storage here
  }
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  root = null;
  host = null;
  vi.useRealTimers();
});

const trainer = (id: string, fullName: string) => ({ id, fullName, initials: fullName.slice(0, 2), role: "Trainer", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [] });
const IO = trainer("t-ioreth", "Ioreth");
const BE = trainer("t-beregond", "Beregond");
const DA = trainer("t-damrod", "Damrod");
const TRAINERS = [BE, IO, DA] as any[];

const client = (id: string, firstName: string, lastName: string, sessionCount: number, extra: Record<string, unknown> = {}) => ({
  id,
  firstName,
  lastName,
  sessionCount,
  historyIsComplete: true,
  isActive: true,
  homeStudioId: "westlake",
  isLiabilityReleased: true,
  ...extra,
});
const CLIENTS = [
  client("belladonna", "Belladonna", "Took", 99, { dateOfBirth: "1946-10-01" }),
  client("hamfast", "Hamfast", "Gamgee", 330),
  client("estella", "Estella", "Bolger", 0, { isLiabilityReleased: false }),
  client("targon", "Targon", "Minas", 0, { requiresConsultation: true }),
  client("laura", "Laura", "Grubb", 44),
] as any[];

let seq = 0;
const book = (t: any, clientId: string, hm: string, minutes = 30, over: Record<string, unknown> = {}) => {
  const c = CLIENTS.find((x) => x.id === clientId);
  const start = at(hm);
  return {
    id: `b${++seq}`,
    clientId,
    clientName: c ? `${c.firstName} ${c.lastName}` : clientId,
    trainerId: t.id,
    trainerName: t.fullName,
    studioId: "westlake",
    startTime: start,
    endTime: new Date(start.getTime() + minutes * 60_000),
    status: "Scheduled",
    serviceName: "1:1 Strength Training",
    ...over,
  };
};
const SCHEDULES = [
  book(IO, "hamfast", "09:00"),
  book(IO, "belladonna", "09:30"),
  book(DA, "estella", "09:30"),
  book(DA, "targon", "10:00", 45, { serviceName: "New Client Consultation" }),
  book(BE, "laura", "11:00"),
  { ...book(BE, "", "12:00"), clientId: "", clientName: "Unavailable", serviceName: "" },
  book(IO, "belladonna", "09:30", 30, { startTime: new Date("2026-09-29T13:30:00Z"), endTime: new Date("2026-09-29T14:00:00Z") }),
];
const SESSIONS = [{ id: "s-hamfast", clientId: "hamfast", status: "In-Progress", hostedAtStudioId: "westlake", startTime: at("09:01"), date: at("09:01").toISOString(), createdAt: at("09:01") }] as any[];

function mount() {
  const calls = { selected: [] as string[], views: [] as string[] };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ClientsView
        clients={CLIENTS}
        trainers={TRAINERS}
        sortedTrainers={TRAINERS}
        isAdmin={false}
        activeStudioId="westlake"
        authTrainer={IO as any}
        onSelectClient={(id) => calls.selected.push(id)}
        setView={(v) => calls.views.push(String(v))}
        schedules={SCHEDULES}
        sessions={SESSIONS}
        sessionsKnown
        editingClient={null}
        setEditingClient={() => {}}
        formData={{}}
        setFormData={() => {}}
        onSubmit={() => {}}
        startEdit={() => {}}
        updateSessions={() => {}}
        searchTerm=""
        onSearchTermChange={() => {}}
        cutoverStudios={[{ id: "westlake", journeyCutoverDate: "2026-09-01" }]}
      />,
    );
  });
  return { el: host, calls };
}

const cardOf = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLElement>(".hs-card")].find((c) => c.textContent?.includes(name));

describe("the Hub", () => {
  it("draws a column per trainer, yours first, and a card per booking with whole names", () => {
    const { el } = mount();
    expect([...el.querySelectorAll(".hs-colhead strong")].map((h) => h.textContent)).toEqual(["IorethYou", "Beregond", "Damrod"]);
    expect(cardOf(el, "Belladonna Took")).toBeTruthy();
    expect(cardOf(el, "Hamfast Gamgee")?.dataset.state).toBe("in-session");
    expect(cardOf(el, "Unavailable")?.dataset.kind).toBe("staff");
    // The day's usual service is never repeated on a card.
    expect(el.querySelector(".hs-scroll")?.textContent).not.toContain("1:1 Strength Training");
  });

  it("draws a 45-minute consult at its real length", () => {
    const { el } = mount();
    const slot = cardOf(el, "Targon Minas")!.parentElement as HTMLElement;
    expect(Number(slot.style.height.replace("px", ""))).toBeCloseTo(45 * 2.2 - 2);
    expect(cardOf(el, "Targon Minas")?.textContent).toContain("10:00 – 10:45 AM");
  });

  it("hatches a trainer's hours outside the agreed week", () => {
    const { el } = mount();
    const cols = [...el.querySelectorAll<HTMLElement>(".hs-col")];
    expect(cols[2].querySelectorAll(".hs-off").length).toBeGreaterThan(0);
    expect(cols[0].querySelectorAll(".hs-off")).toHaveLength(0);
  });

  it("shows the week with each day's count, and the list's own chips", () => {
    const { el } = mount();
    const days = [...el.querySelectorAll<HTMLElement>(".hd-day")];
    expect(days[0].textContent).toBe("Mon 285");
    expect(days[0].getAttribute("aria-selected")).toBe("true");
    expect(days[1].textContent).toBe("Tue 291");
    expect([...el.querySelectorAll(".hd-chip")].map((c) => c.textContent)).toEqual(["Celebrate 1", "Welcome 2", "Watch 1"]);
  });

  it("opens a card's peek on a tap, and Escape closes it", () => {
    const { el, calls } = mount();
    act(() => cardOf(el, "Belladonna Took")!.click());
    expect(document.querySelector(".hp-name")?.textContent).toBe("Belladonna Took");
    expect(document.querySelector(".hp-sub")?.textContent).toContain("her 100th session");
    expect(calls.views).toEqual([]);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(".hp")).toBeNull();
  });

  it("starts her session from the peek", () => {
    const { el, calls } = mount();
    act(() => cardOf(el, "Estella Bolger")!.click());
    act(() => [...document.querySelectorAll<HTMLButtonElement>(".hp-btn")].find((b) => b.textContent?.includes("Start session"))!.click());
    expect(calls.selected).toEqual(["estella"]);
    expect(calls.views).toEqual(["workouts"]);
  });

  it("lights a family's cards and dims the rest", () => {
    const { el } = mount();
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".hd-chip")].find((c) => c.textContent?.startsWith("Watch"))!.click());
    expect(el.querySelector(".hd-spot-words")?.textContent).toBe("Showing 1 to watch: 1 waiver to sign on the grid");
    expect(cardOf(el, "Estella Bolger")?.dataset.dim).toBeUndefined();
    expect(cardOf(el, "Belladonna Took")?.dataset.dim).toBe("true");
  });

  it("opens Opportunities on the same day's entries", async () => {
    const { el } = mount();
    await act(async () => {
      [...el.querySelectorAll<HTMLButtonElement>(".hl-btn")].find((b) => b.textContent === "Opportunities")!.click();
    });
    for (let i = 0; i < 50 && !el.querySelector(".ho"); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    expect([...el.querySelectorAll(".ho-row .ho-name")].map((n) => n.textContent)).toEqual(["Hamfast Gamgee", "Belladonna Took", "Estella Bolger", "Targon Minas", "Laura Grubb"]);
    expect(el.querySelector(".hs-scroll")?.hasAttribute("hidden")).toBe(true);
  });
});
