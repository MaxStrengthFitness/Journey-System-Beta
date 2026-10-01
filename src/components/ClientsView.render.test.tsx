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
 *   - Opportunities opens on the same day's entries;
 *   - Get to know (wave 2 hub): the ✎ alone on the card, its words in the
 *     peek and the list, read only for someone who works at the studio.
 *
 * The reads are stood in for (the Critical notes, the tasks, the standing
 * weeks, the package table, the studio's FORD); everything else is the real
 * screen.
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
/* The studio's FORD for Get to know (wave 2 hub): which studio it was asked
   for, and the details each test hands out. `fordFor` is one function, as the
   real hook's is between answers. */
const hub = vi.hoisted(() => {
  const state = {
    fordCalls: [] as Array<string | null | undefined>,
    details: {} as Record<string, unknown[]>,
    fordFor: (id: string) => state.details[id] ?? [],
    /* The nightly marks for All stars (wave 2 hub), the same way. */
    marksCalls: [] as Array<string | null | undefined>,
    stars: {} as Record<string, { clientId: string; weeksIn: number; perWeek: number }>,
    allStarOf: (id: string) => state.stars[id] ?? null,
  };
  return state;
});
vi.mock("../features/hub-opportunities/use-hub-ford", () => ({
  useHubFord: (studioId: string | null | undefined) => {
    hub.fordCalls.push(studioId);
    return studioId ? { status: "ready", fordFor: hub.fordFor } : { status: "off" };
  },
}));
vi.mock("../features/hub-opportunities/use-hub-marks", () => ({
  useHubMarks: (studioId: string | null | undefined) => {
    hub.marksCalls.push(studioId);
    return studioId ? { status: "ready", allStarOf: hub.allStarOf } : { status: "off" };
  },
}));
/* The day's "didn't come" marks (Operations wave 3): which studio and day were asked for, and the marks handed out. */
const marksRead = vi.hoisted(() => ({ calls: [] as Array<[string | null, string, string]>, ids: [] as string[] }));
vi.mock("../features/admin/attention/booking-marks", async () => {
  const { bookingMarks } = await import("../lib/booking-state");
  return {
    useBookingMarks: (studioId: string | null, from: string, to: string) => {
      marksRead.calls.push([studioId, from, to]);
      const rows = marksRead.ids.map((id) => ({ id, noShow: true }));
      return { rows, marks: studioId ? bookingMarks(rows) : null, loading: false, failed: false };
    },
  };
});
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
  hub.fordCalls = [];
  hub.details = {};
  hub.marksCalls = [];
  hub.stars = {};
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

function mount(viewer: any = IO, extra: Record<string, unknown> = {}) {
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
        authTrainer={viewer}
        onSelectClient={(id) => calls.selected.push(id)}
        setView={(v) => calls.views.push(String(v))}
        schedules={SCHEDULES}
        sessions={SESSIONS}
        sessionsKnown
        searchTerm=""
        onSearchTermChange={() => {}}
        cutoverStudios={[{ id: "westlake", journeyCutoverDate: "2026-09-01" }]}
        {...extra}
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

  it("reads your own column in words: the focus column, its head, and its cards", () => {
    const { el } = mount();
    const head = el.querySelector<HTMLElement>('.hs-colhead[data-focus="true"]');
    expect(head?.querySelector("strong")?.textContent).toBe("IorethYou");
    expect(head?.querySelector(".hs-colcount")?.textContent).toBe("2 sessions · 9:00 – 10:00 AM");
    expect(cardOf(el, "Belladonna Took")?.dataset.words).toBe("all");
    // Everyone else's cards keep to the calm Hub's words.
    expect(cardOf(el, "Estella Bolger")?.dataset.words).toBeUndefined();
  });

  it("Focus: Everyone makes every column alike, and the iPad remembers it", () => {
    const { el } = mount();
    const focusBtn = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('[aria-label="Focus"] button')].find((b) => b.textContent === label)!;
    expect(focusBtn("Me").getAttribute("aria-pressed")).toBe("true");
    act(() => focusBtn("Everyone").click());
    expect(el.querySelectorAll('[data-focus="true"]')).toHaveLength(0);
    expect(cardOf(el, "Belladonna Took")?.dataset.words).toBeUndefined();
    expect(el.querySelector(".hs-colhead .hs-colcount")?.textContent).toBe("2 sessions");
    expect(window.localStorage.getItem("journey.hub.focus")).toBe("everyone");
    // The next visit opens on Everyone.
    act(() => root?.unmount());
    host?.remove();
    const again = mount();
    expect(again.el.querySelectorAll('[data-focus="true"]')).toHaveLength(0);
    expect([...again.el.querySelectorAll<HTMLButtonElement>('[aria-label="Focus"] button')].find((b) => b.textContent === "Everyone")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows who is due in the next 30 minutes, across the floor, and a tap opens the peek", () => {
    const { el } = mount();
    const strip = el.querySelector<HTMLElement>('section[aria-label="Next 30 minutes"]');
    expect([...strip!.querySelectorAll(".hn-name")].map((n) => n.textContent)).toEqual(["Hamfast Gamgee", "Belladonna Took", "Estella Bolger"]);
    expect([...strip!.querySelectorAll(".hn-when")].map((w) => w.textContent)).toEqual(["In session", "9:30", "9:30"]);
    expect([...strip!.querySelectorAll(".hn-with")].map((w) => w.textContent)).toEqual(["with you", "with you", "with Damrod"]);
    // The 10:00 consult is past the half hour; Mindbody's "Unavailable" is never on it.
    expect(strip!.textContent).not.toContain("Targon");
    act(() => [...strip!.querySelectorAll<HTMLButtonElement>(".hn-item")].find((b) => b.textContent?.includes("Estella"))!.click());
    expect(document.querySelector(".hp-name")?.textContent).toBe("Estella Bolger");
  });

  it("has no Next 30 minutes on another day", () => {
    const { el } = mount();
    act(() => el.querySelectorAll<HTMLButtonElement>(".hd-day")[1].click());
    expect(el.querySelector('section[aria-label="Next 30 minutes"]')).toBeNull();
  });

  it("opens Opportunities on the same day's entries", async () => {
    const { el } = mount();
    await openOpportunities(el);
    expect([...el.querySelectorAll(".ho-row .ho-name")].map((n) => n.textContent)).toEqual(["Hamfast Gamgee", "Belladonna Took", "Estella Bolger", "Targon Minas", "Laura Grubb"]);
    expect(el.querySelector(".hs-scroll")?.hasAttribute("hidden")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * THE HUB'S DAY (hub fixes, Oct 1 2026): today is the studio's day, and a
 * Hub left open overnight moves to the new today; a day picked on purpose
 * stays picked.
 * ------------------------------------------------------------------ */

describe("the Hub: the day rolls over", () => {
  const wake = () =>
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const selected = (el: HTMLElement) => el.querySelector<HTMLElement>('.hd-day[aria-selected="true"]')?.textContent;

  it("left open overnight on today, shows the new today when the iPad wakes", () => {
    vi.setSystemTime(at("23:50"));
    const { el } = mount();
    expect(selected(el)).toBe("Mon 285");
    expect(el.querySelectorAll(".hd-day")[0].textContent).toBe("Mon 285");
    vi.setSystemTime(new Date("2026-09-29T06:10:00-04:00"));
    wake();
    expect(selected(el)).toBe("Tue 291");
    // The strip starts at the new today.
    expect(el.querySelectorAll(".hd-day")[0].textContent).toBe("Tue 291");
    expect(el.querySelector(".hd-sum-words strong")?.textContent).toContain("Tuesday");
  });

  it("keeps a day the trainer picked on purpose", () => {
    vi.setSystemTime(at("23:50"));
    const { el } = mount();
    act(() => el.querySelectorAll<HTMLButtonElement>(".hd-day")[2].click()); // Wednesday
    expect(selected(el)).toBe("Wed 30");
    vi.setSystemTime(new Date("2026-09-29T06:10:00-04:00"));
    wake();
    expect(selected(el)).toBe("Wed 30");
  });
});

/* ------------------------------------------------------------------ *
 * THE COLUMNS (hub fixes, Oct 1 2026): by trainer id only, and an
 * Unassigned column so nothing counted is drawn nowhere.
 * ------------------------------------------------------------------ */

describe("the Hub: columns by trainer id", () => {
  const CHRIS_A = trainer("t-chris-a", "Chris Took");
  const CHRIS_B = trainer("t-chris-b", "Chris Brandybuck");

  it("never swaps two Chrises: each booking goes to its own trainer id, and both names are whole", () => {
    const schedules = [
      { ...book(CHRIS_A, "hamfast", "09:00"), trainerName: "Chris" },
      { ...book(CHRIS_B, "laura", "09:00"), trainerName: "Chris" },
    ];
    const { el } = mount(IO, { schedules, sortedTrainers: [CHRIS_B, CHRIS_A, IO], trainers: [CHRIS_B, CHRIS_A, IO] });
    const heads = [...el.querySelectorAll(".hs-colhead strong")].map((h) => h.textContent);
    expect(heads).toEqual(["Chris Brandybuck", "Chris Took"]);
    const cols = [...el.querySelectorAll<HTMLElement>(".hs-col")];
    expect(cols[0].textContent).toContain("Laura Grubb");
    expect(cols[1].textContent).toContain("Hamfast Gamgee");
  });

  it("puts a booking with a blank or placeholder trainer in Unassigned, counted and drawn", () => {
    const schedules = [
      ...SCHEDULES,
      { ...book(IO, "laura", "13:00"), trainerId: null, trainerName: "" },
      { ...book(IO, "hamfast", "14:00"), trainerId: null, trainerName: "Samuel Lee" },
      { ...book(IO, "belladonna", "15:00"), trainerId: null, trainerName: "Select a staff member" },
    ];
    const { el } = mount(IO, { schedules });
    const heads = [...el.querySelectorAll(".hs-colhead strong")].map((h) => h.textContent);
    expect(heads[heads.length - 1]).toBe("Unassigned");
    const unassigned = [...el.querySelectorAll<HTMLElement>(".hs-col")].pop()!;
    expect(unassigned.querySelectorAll(".hs-card")).toHaveLength(3);
    expect([...unassigned.querySelectorAll(".hs-card-staff")].map((s) => s.textContent)).toEqual(["Booked with Samuel Lee"]);
    // Counted once each in the day, and the column says how many.
    expect(el.querySelector(".hd-sum-words")?.textContent).toContain("8 sessions");
    expect([...el.querySelectorAll(".hs-colhead")].pop()?.querySelector(".hs-colcount")?.textContent).toBe("3 sessions");
  });

  it("has no Unassigned column when every booking has its trainer", () => {
    const { el } = mount();
    expect([...el.querySelectorAll(".hs-colhead strong")].map((h) => h.textContent)).not.toContain("Unassigned");
  });
});

/* ------------------------------------------------------------------ *
 * A FAILED READ IS UNKNOWN (hub fixes, Oct 1 2026): never a quiet day,
 * never "Not synced yet" on every card.
 * ------------------------------------------------------------------ */

describe("the Hub: a read that failed", () => {
  it("says the bookings couldn't be loaded, in place, with Try again; never 'Nobody is booked'", () => {
    const retries: number[] = [];
    const { el } = mount(IO, {
      schedules: [],
      scheduleDayState: () => "failed",
      onRetrySchedule: () => retries.push(1),
    });
    const notice = el.querySelector<HTMLElement>(".hs-notice");
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.textContent).toContain("Couldn't load today's bookings. Trying again.");
    expect(el.querySelector(".hs-empty")).toBeNull();
    expect(el.textContent).not.toContain("Nobody is booked");
    expect(el.querySelector(".hd-sum-words")?.textContent).toContain("couldn't load the bookings");
    expect(el.querySelector(".hd-sum-words")?.textContent).not.toContain("nothing booked");
    act(() => el.querySelector<HTMLButtonElement>(".hs-notice-btn")!.click());
    expect(retries).toEqual([1]);
  });

  it("says a quiet day is quiet only once it was read", () => {
    const loading = mount(IO, { schedules: [], scheduleDayState: () => "loading" });
    expect(loading.el.querySelector(".hs-empty")?.textContent).toBe("Reading the day\u2019s bookings\u2026");
    expect(loading.el.querySelector(".hs-notice")).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    const read = mount(IO, { schedules: [], scheduleDayState: () => "ready" });
    expect(read.el.querySelector(".hs-empty")?.textContent).toBe("Nobody is booked on this day.");
  });

  it("with the client list unread, says nothing about sync on a card it can't match", () => {
    const stranger = { ...SCHEDULES[0], id: "b-stranger", clientId: "nobody-we-hold", clientName: "Fredegar Bolger" };
    const { el } = mount(IO, { schedules: [...SCHEDULES, stranger], rosterFailed: true });
    const card = cardOf(el, "Fredegar Bolger")!;
    expect(card.dataset.kind).toBe("unknown");
    expect(card.textContent).not.toContain("Not synced");
    expect(el.textContent).not.toContain("Not synced yet");
    expect([...el.querySelectorAll(".hs-notice")].map((n) => n.textContent)).toContain(
      "Couldn't load the studio's client list, so some cards can't open a profile yet. Trying again.",
    );
    // With the list read, the same booking is honestly "Not synced yet".
    act(() => root?.unmount());
    host?.remove();
    const again = mount(IO, { schedules: [...SCHEDULES, stranger] });
    expect(cardOf(again.el, "Fredegar Bolger")?.textContent).toContain("Not synced yet");
  });
});

async function openOpportunities(el: HTMLElement) {
  await act(async () => {
    [...el.querySelectorAll<HTMLButtonElement>(".hl-btn")].find((b) => b.textContent === "Opportunities")!.click();
  });
  for (let i = 0; i < 50 && !el.querySelector(".ho"); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

/* ------------------------------------------------------------------ *
 * GET TO KNOW (wave 2 hub, Sep 28 2026; AJ: "all yes"): the ✎ "Ask about"
 * from the studio's FORD, read once per studio visit. On the card it is the
 * glyph alone; the words are the peek's and the list's.
 * ------------------------------------------------------------------ */

describe("the Hub: Get to know", () => {
  const MATHOM = {
    id: "f-mathom",
    clientId: "laura",
    studioId: "westlake",
    pillar: "occupation",
    body: "Opening her mathom shop in Michel Delving on Thursday",
    subject: "the shop",
    // Thursday, at the studio's midnight (the FORD dialog's way).
    eventDate: new Date("2026-10-01T00:00:00-04:00"),
    recurrence: "none",
    occurredAt: new Date("2026-09-01T14:00:00Z"),
    isArchived: false,
  };
  const SENTENCE = "Ask about: Opening her mathom shop in Michel Delving on Thursday — Thursday, Oct 1 (Occupation, noted Sep 1).";

  it("reads the studio's FORD for someone who works there, and for nobody else", () => {
    mount();
    expect(hub.fordCalls[hub.fordCalls.length - 1]).toBe("westlake");
    act(() => root?.unmount());
    host?.remove();
    mount({ ...trainer("t-grimbold", "Grimbold"), primaryHomeStudioId: "solon" });
    expect(hub.fordCalls[hub.fordCalls.length - 1]).toBeNull();
  });

  it("puts the ✎ alone on her card — FORD's words nowhere on the grid — and lights it from the chips", () => {
    hub.details = { laura: [MATHOM] };
    const { el } = mount();
    const card = cardOf(el, "Laura Grubb")!;
    expect(card.querySelector('.hs-g[data-family="get-to-know"]')?.getAttribute("aria-label")).toBe("Something to ask about");
    expect(el.querySelector(".hs-scroll")?.innerHTML).not.toContain("mathom");
    expect([...el.querySelectorAll(".hd-chip")].map((c) => c.textContent)).toEqual(["Celebrate 1", "Welcome 2", "Watch 1", "Get to know 1"]);
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".hd-chip")].find((c) => c.textContent?.startsWith("Get to know"))!.click());
    expect(el.querySelector(".hd-spot-words")?.textContent).toBe("Showing 1 to ask about on the grid");
    expect(cardOf(el, "Laura Grubb")?.dataset.dim).toBeUndefined();
    expect(cardOf(el, "Belladonna Took")?.dataset.dim).toBe("true");
  });

  it("says what to ask about in the peek and on the Opportunities list", async () => {
    hub.details = { laura: [MATHOM] };
    const { el } = mount();
    act(() => cardOf(el, "Laura Grubb")!.click());
    expect([...document.querySelectorAll(".hp-lines li")].map((l) => l.textContent)).toEqual([SENTENCE]);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await openOpportunities(el);
    const row = el.querySelector<HTMLElement>('.ho-row[data-client-id="laura"]');
    expect([...row!.querySelectorAll(".ho-chip")].map((c) => c.textContent)).toEqual(["Ask: the shop · Thu"]);
  });
});

/* ------------------------------------------------------------------ *
 * ALL STARS (wave 2 hub; AJ's Hub question 6): the nightly renewals job's
 * word, one document read once per studio visit. The iPad counts nothing.
 * ------------------------------------------------------------------ */

describe("the Hub: \"didn't come\" (Operations wave 3)", () => {
  afterEach(() => {
    marksRead.ids = [];
  });

  it("reads the day's marks once, for the day on screen, for someone who works at the studio, and for nobody else", () => {
    mount();
    expect(marksRead.calls[marksRead.calls.length - 1]).toEqual(["westlake", "2026-09-28", "2026-09-28"]);
    act(() => root?.unmount());
    host?.remove();
    mount({ ...trainer("t-grimbold", "Grimbold"), primaryHomeStudioId: "solon" });
    expect(marksRead.calls[marksRead.calls.length - 1][0]).toBeNull();
  });

  it("a marked booking's card says 'Didn't come', never 'Not logged'; an unmarked one still says 'Not logged'", () => {
    vi.setSystemTime(at("12:00")); // every morning slot over
    const bella = SCHEDULES[1].id; // Belladonna, 9:30 with Ioreth, nothing logged
    marksRead.ids = [bella];
    const { el } = mount();
    const marked = cardOf(el, "Belladonna");
    expect(marked?.textContent).toContain("Didn't come");
    expect(marked?.textContent).not.toContain("Not logged");
    const estella = cardOf(el, "Estella");
    expect(estella?.textContent).toContain("Not logged");
    expect(estella?.textContent).not.toContain("Didn't come");
  });
});

describe("the Hub: All stars", () => {
  it("reads the nightly marks for someone who works at the studio, and for nobody else", () => {
    mount();
    expect(hub.marksCalls[hub.marksCalls.length - 1]).toBe("westlake");
    act(() => root?.unmount());
    host?.remove();
    mount({ ...trainer("t-grimbold", "Grimbold"), primaryHomeStudioId: "solon" });
    expect(hub.marksCalls[hub.marksCalls.length - 1]).toBeNull();
  });

  it("says it in the peek and gives her a section on the Sessions sort; nothing on the card", async () => {
    hub.stars = { hamfast: { clientId: "hamfast", weeksIn: 25, perWeek: 2 } };
    const { el } = mount();
    expect(cardOf(el, "Hamfast Gamgee")?.textContent).not.toContain("All star");
    act(() => cardOf(el, "Hamfast Gamgee")!.click());
    expect(document.querySelector(".hp-star")?.textContent).toBe("All star: in 25 of the last 26 weeks, about twice a week.");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await openOpportunities(el);
    await act(async () => {
      [...el.querySelectorAll<HTMLButtonElement>(".ho-seg-btn")].find((b) => b.textContent === "Sessions")!.click();
    });
    const heads = [...el.querySelectorAll(".ho-sechead")].map((h) => h.textContent);
    expect(heads).toContain("All stars (1)");
    expect(el.querySelector('.ho-row[data-client-id="hamfast"] .ho-sentence')?.textContent).toBe("#331 · in 25 of the last 26 weeks");
  });

  it("says nothing when the marks name nobody here", () => {
    const { el } = mount();
    act(() => cardOf(el, "Hamfast Gamgee")!.click());
    expect(document.querySelector(".hp-star")).toBeNull();
  });
});
