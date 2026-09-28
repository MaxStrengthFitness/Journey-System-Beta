// @vitest-environment jsdom
/**
 * THE WRAP-UP'S "TIMES WITH ROOM" SHEET (Openings round, phase 8), mounted
 * with the real data hook: the times with room in the next 7 days, by day;
 * the times with room most weeks; "With you · Anyone"; the rotation line; the
 * foot; and every state worded for a client to see. It names nobody: no
 * client, no trainer, and never why a time is free.
 *
 * Today is Monday Nov 9 2026, noon Eastern. Sam takes clients Monday 7:00 -
 * 10:00 and Tuesday 10:00 - 12:00, with Ann Regular his Tuesday 10:00
 * regular; Pat takes them Monday 7:00 - 9:00. The summary is the fixture's
 * Sunday run (every Monday Sam 7:00, Sam and Pat 8:00, Sam 9:00; every
 * Tuesday Sam 10:00).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Studio, Trainer } from "../../../types";
import type { StandingWeekDoc } from "../../standing-week/week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  summary: null as unknown,
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  schedule: { entries: [] as unknown[], loading: false, failed: false, fromCache: false },
  lease: undefined as unknown,
  comingRows: [] as unknown[],
  comingFromCache: false,
  queries: [] as { kind: "client" | "coming" }[],
  marks: [] as { id: string; data: Record<string, unknown> }[],
  marksAnswer: "server" as "server" | "fails" | "never" | "cache",
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  type W = { f: string; op: string; v: unknown };
  return {
    ...real,
    doc: ref,
    collection: ref,
    where: (f: string, op: string, v: unknown) => ({ f, op, v }),
    orderBy: () => ({ order: true }),
    query: (c: { path: string }, ...cs: unknown[]) => ({ path: c.path, wheres: cs.filter((x): x is W => !!x && typeof x === "object" && "f" in x) }),
    getDoc: () =>
      Promise.resolve(
        fake.summary === null
          ? { exists: () => false, data: () => undefined, metadata: { fromCache: false } }
          : { exists: () => true, data: () => fake.summary, metadata: { fromCache: false } },
      ),
    // The one listener here: the marks.
    onSnapshot: (_r: unknown, _o: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      if (fake.marksAnswer === "never") return () => {};
      const t = setTimeout(() => {
        if (fake.marksAnswer === "fails") return fail(Object.assign(new Error("denied"), { code: "permission-denied" }));
        next({ docs: fake.marks.map((m) => ({ id: m.id, data: () => m.data })), metadata: { fromCache: fake.marksAnswer === "cache" } });
      }, 0);
      return () => clearTimeout(t);
    },
    getDocs: (q: { wheres: W[] }) => {
      const client = q.wheres.some((w) => w.f === "clientId");
      fake.queries.push({ kind: client ? "client" : "coming" });
      const rows = (client ? [] : fake.comingRows) as { id: string }[];
      return Promise.resolve({ docs: rows.map((r) => ({ id: r.id, data: () => r })), metadata: { fromCache: !client && fake.comingFromCache } });
    },
  };
});
vi.mock("../../standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));
vi.mock("../../admin/changes/useWeekSchedule", () => ({
  useWeekSchedule: (studioId: string | null) => (studioId ? fake.schedule : { entries: [], loading: false, failed: false, fromCache: false }),
}));
vi.mock("../../admin/sync-lease", () => ({ useSyncLease: () => fake.lease }));

/* The sheet is a base-ui dialog, which wants both. */
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import { forgetPersonalMemory } from "../../sign-out/memory";
import { addDays } from "../coverage";
import { booking, monday, sam as samAt, pat as patAt } from "../fixtures";
import { NO_OFFERS, OFFER_FOOT, WRAP_UP_CANT_CHECK, WRAP_UP_CANT_TELL, WRAP_UP_LOOKING } from "../present";
import type { OpeningsMark } from "../marks";
import type { UsualWeek } from "../usual";
import { LEE, MONDAYS, PAT, PAT_WEEK, SAM, SAM_TUESDAYS, WESTLAKE, foldFixture } from "./test-shell";
import { CHECKING_COMING, COMING_CANT_CHECK, DONE, NO_TIMES_NEXT_7, TimesWithRoomSheet, YOU_NO_TIMES_NEXT_7, hasTimesToOffer } from "./TimesWithRoomSheet";
import { useOpeningsData } from "./useOpeningsData";

const ANN_TUESDAY = { id: "r1", weekday: 2, start: "10:00", clientId: "c-ann", clientName: "Ann Regular" };
const samWeek = (): StandingWeekDoc => ({ ...SAM_TUESDAYS, final: { ...SAM_TUESDAYS.final!, regulars: [ANN_TUESDAY] } });
const TODAY_MORNING = new Date("2026-11-09T06:30:00-05:00").getTime();
/** Sam's and Pat's usual Monday bookings on the three coming Mondays. */
const COMING_MONDAYS = ["2026-11-16", "2026-11-23", "2026-11-30"].flatMap((d) => monday(d));

let root: Root;
let host: HTMLDivElement;
let closed = 0;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  forgetPersonalMemory();
  fake.summary = foldFixture();
  fake.weeks = { docs: [samWeek(), PAT_WEEK], loading: false, error: null };
  fake.schedule = { entries: [], loading: false, failed: false, fromCache: false };
  fake.lease = { lastDeepScheduleSyncAt: TODAY_MORNING };
  fake.comingRows = COMING_MONDAYS;
  fake.comingFromCache = false;
  fake.queries.length = 0;
  fake.marks = [];
  fake.marksAnswer = "server";
  closed = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Harness({ viewer, studio, trainers }: { viewer: Trainer; studio: Studio; trainers: Trainer[] }) {
  const data = useOpeningsData({ studio, trainers, authTrainer: viewer });
  return <TimesWithRoomSheet open data={data} onClose={() => (closed += 1)} />;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount({ viewer = SAM, studio = WESTLAKE, trainers = [SAM, PAT, LEE] }: { viewer?: Trainer; studio?: Studio; trainers?: Trainer[] } = {}) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness viewer={viewer} studio={studio} trainers={trainers} />
      </StrictMode>,
    );
  });
  await settle();
  await settle();
}

const sheet = () => document.querySelector("[data-testid='times-with-room']") as HTMLElement;
const part = (id: "times-next" | "times-most") => sheet().querySelector(`[data-testid='${id}']`) as HTMLElement | null;
/** Each group's heading and its chips: "Tue, Nov 10: 10:00 AM (this week only) | 10:30 AM". */
const groups = (id: "times-next" | "times-most") =>
  [...(part(id)?.querySelectorAll("li") ?? [])].map(
    (li) => `${li.querySelector("span")?.textContent}: ${[...li.querySelectorAll("[data-testid='time-chip']")].map((c) => c.textContent).join(" | ")}`,
  );
const button = (label: string) => {
  const b = [...sheet().querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b;
};

describe("times with room", () => {
  it("opens on the trainer's own times: the next 7 days by day, then most weeks, and the foot", async () => {
    await mount();
    expect(sheet().textContent).toContain("Times with room");
    expect(button("With you").getAttribute("aria-pressed")).toBe("true");
    expect(button("Anyone").getAttribute("aria-pressed")).toBe("false");
    // Ann is out on Tuesday: her time has room this week only. Monday's hours have passed.
    expect(groups("times-next")).toEqual(["Tue, Nov 10: 10:00 AM (this week only) | 10:30 AM | 11:00 AM | 11:30 AM"]);
    // Most weeks: Sam is booked at 7:00, 8:00 and 9:00 on the coming Mondays, and Tuesday 10:00 is always full.
    const most = groups("times-most");
    expect(most.find((l) => l.startsWith("Tuesdays"))).toBe("Tuesdays: 10:30 AM | 11:00 AM | 11:30 AM");
    expect(most.find((l) => l.startsWith("Mondays"))).not.toContain("7:00 AM |");
    expect(sheet().querySelector("[data-testid='times-foot']")?.textContent).toBe(OFFER_FOOT);
  });

  it("names nobody and never says why a time is free", async () => {
    fake.schedule.entries = [
      patAt("2026-11-10", "10:30", { id: "cx", clientId: "c-ron", clientName: "Ron Dale", status: "Cancelled", cancelledAt: new Date("2026-11-08T15:00:00Z"), trainerId: "t-sam", trainerName: "Sam Lee" } as never),
    ];
    await mount();
    await act(async () => button("Anyone").click());
    const text = sheet().textContent ?? "";
    for (const name of ["Ann", "Ron", "Sam", "Pat", "Lee", "Regular", "Dale"]) expect(text).not.toContain(name);
    expect(text).not.toMatch(/regular|cancel|isn't booked/i);
  });

  it("Anyone widens it to every trainer's times, still with no names", async () => {
    await mount();
    expect(groups("times-most").find((l) => l.startsWith("Mondays"))).not.toMatch(/^Mondays: 7:00 AM/);
    await act(async () => button("Anyone").click());
    expect(button("Anyone").getAttribute("aria-pressed")).toBe("true");
    // Pat is free at 7:00 on the coming Mondays.
    expect(groups("times-most").find((l) => l.startsWith("Mondays"))).toMatch(/^Mondays: 7:00 AM/);
    expect(sheet().textContent).not.toContain("Pat");
  });

  it("opens on Anyone, with no toggle, for someone with no agreed week here", async () => {
    await mount({ viewer: LEE });
    expect([...sheet().querySelectorAll("button")].map((b) => b.textContent)).toEqual([DONE]);
    expect(groups("times-most").some((l) => l.startsWith("Mondays: 7:00 AM"))).toBe(true);
  });

  it("with the trainer's own times empty while others have some, says so and points to Anyone", async () => {
    // Sam is booked all through his Tuesday; Pat takes clients then too, and has room.
    const patTuesdays: StandingWeekDoc = {
      ...PAT_WEEK,
      final: { hours: [...PAT_WEEK.final!.hours, { weekday: 2, from: "10:00", to: "12:00" }], regulars: [] },
    };
    fake.weeks = { docs: [samWeek(), patTuesdays], loading: false, error: null };
    fake.schedule.entries = ["10:00", "10:30", "11:00", "11:30"].map((t, i) => samAt("2026-11-10", t, { id: `s${i}` }));
    await mount();
    expect(part("times-next")?.textContent).toContain(YOU_NO_TIMES_NEXT_7);
    expect(groups("times-next")).toEqual([]);
    await act(async () => button("Anyone").click());
    expect(groups("times-next")).toEqual(["Tue, Nov 10: 10:00 AM | 10:30 AM | 11:00 AM | 11:30 AM"]);
    expect(sheet().textContent).not.toContain("Pat");
  });

  it("with the trainer's own times empty in BOTH parts while others have some, never says the studio has none", async () => {
    // Pat takes clients Tuesdays too. Sam is booked all through this Tuesday,
    // and at every one of his usual times in the coming weeks.
    const patTuesdays: StandingWeekDoc = {
      ...PAT_WEEK,
      final: { hours: [...PAT_WEEK.final!.hours, { weekday: 2, from: "10:00", to: "12:00" }], regulars: [] },
    };
    fake.weeks = { docs: [samWeek(), patTuesdays], loading: false, error: null };
    fake.schedule.entries = ["10:00", "10:30", "11:00", "11:30"].map((t, i) => samAt("2026-11-10", t, { id: `s${i}` }));
    const SAM_MONDAY = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"];
    const SAM_TUESDAY = ["10:00", "10:30", "11:00", "11:30"];
    fake.comingRows = [
      ...["2026-11-16", "2026-11-23", "2026-11-30"].flatMap((d) => [...SAM_MONDAY.map((t) => samAt(d, t)), patAt(d, "08:00")]),
      ...["2026-11-17", "2026-11-24", "2026-12-01"].flatMap((d) => SAM_TUESDAY.map((t) => samAt(d, t))),
    ];
    await mount();
    expect(button("With you").getAttribute("aria-pressed")).toBe("true");
    expect(sheet().querySelector("[data-testid='times-whole']")).toBeNull();
    expect(sheet().textContent).not.toContain(NO_OFFERS);
    expect(part("times-next")?.textContent).toContain(YOU_NO_TIMES_NEXT_7);
    expect(part("times-most")?.textContent).toContain("You have no usual times with room to offer right now. Anyone shows the rest of the studio.");
    expect(groups("times-next")).toEqual([]);
    expect(groups("times-most")).toEqual([]);

    await act(async () => button("Anyone").click());
    expect(groups("times-next")).toEqual(["Tue, Nov 10: 10:00 AM | 10:30 AM | 11:00 AM | 11:30 AM"]);
    expect(groups("times-most").find((l) => l.startsWith("Mondays"))).toMatch(/^Mondays: 7:00 AM/);
    expect(sheet().textContent).not.toContain("Pat");
  });

  it("with no time with room this week anywhere Journey can see, says so with the front desk, and still lists most weeks", async () => {
    // Lee has no agreed week, so the sheet opens on Anyone. Every agreed
    // hour left this week (Sam's Tuesday) is booked; Pat's Monday is next week.
    fake.schedule.entries = ["10:00", "10:30", "11:00", "11:30"].map((t, i) => samAt("2026-11-10", t, { id: `s${i}` }));
    await mount({ viewer: LEE });
    expect(sheet().querySelector("[data-testid='times-whole']")).toBeNull();
    expect(part("times-next")?.textContent).toContain(NO_TIMES_NEXT_7);
    expect(NO_TIMES_NEXT_7).toContain("The front desk can see every opening in Mindbody.");
    expect(groups("times-next")).toEqual([]);
    expect(groups("times-most").some((l) => l.startsWith("Mondays: 7:00 AM"))).toBe(true);
  });

  it("says which days run on the rotation, in one line each", async () => {
    const tuesdays = MONDAYS.map((m) => samAt(addDays(m, 1), "10:00"));
    const rota = MONDAYS.flatMap((m) => [0, 1, 2].map(() => booking(addDays(m, 5), "09:00", { trainerId: undefined, trainerName: "Westlake Rotation" })));
    fake.summary = foldFixture({ bookings: [...MONDAYS.flatMap(monday), ...tuesdays, ...rota] });
    await mount();
    expect(sheet().querySelector("[data-testid='times-rotation']")?.textContent).toBe("Saturdays run on the rotation. Ask the front desk.");
  });

  it("closes with Done, back to the Wrap-up", async () => {
    await mount();
    await act(async () => button(DONE).click());
    expect(closed).toBe(1);
  });
});

describe("the coming weeks", () => {
  it("says it is checking them while the sync lease is still coming", async () => {
    fake.lease = undefined;
    await mount();
    expect(part("times-most")?.textContent).toContain(CHECKING_COMING);
    expect(fake.queries.filter((q) => q.kind === "coming")).toHaveLength(0);
  });

  it("lists the times but says it can't check the coming weeks when the month wasn't read in full today, and doesn't read them", async () => {
    fake.lease = { lastDeepScheduleSyncAt: new Date("2026-11-07T06:30:00-05:00").getTime() };
    await mount();
    expect(part("times-most")?.textContent).toContain(COMING_CANT_CHECK);
    expect(groups("times-most").some((l) => l.startsWith("Tuesdays"))).toBe(true);
    expect(fake.queries.filter((q) => q.kind === "coming")).toHaveLength(0);
  });

  it("reads the studio's coming weeks once, and never a client's bookings", async () => {
    await mount();
    expect(fake.queries.filter((q) => q.kind === "coming").length).toBeGreaterThan(0);
    expect(fake.queries.some((q) => q.kind === "client")).toBe(false);
  });
});

describe("its states, worded for a client to see", () => {
  it("says it is looking, once, while nothing has come back", async () => {
    fake.schedule = { entries: [], loading: true, failed: false, fromCache: false };
    fake.marksAnswer = "never";
    await mount();
    expect(sheet().querySelector("[data-testid='times-whole']")?.textContent).toBe(WRAP_UP_LOOKING);
    expect(part("times-next")).toBeNull();
    expect(sheet().querySelector("[data-testid='times-foot']")?.textContent).toBe(OFFER_FOOT);
  });

  it("can't check the next 7 days when their read failed, and still lists most weeks", async () => {
    fake.schedule = { entries: [], loading: false, failed: true, fromCache: false };
    await mount();
    expect(part("times-next")?.textContent).toContain(WRAP_UP_CANT_CHECK);
    expect(groups("times-next")).toEqual([]);
    expect(groups("times-most").length).toBeGreaterThan(0);
  });

  it("offline: can't tell, for both, said once, and offers nothing off an unread mark", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fake.schedule = { entries: [], loading: false, failed: false, fromCache: true };
    fake.marksAnswer = "cache";
    await mount();
    expect(sheet().querySelector("[data-testid='times-whole']")?.textContent).toBe(WRAP_UP_CANT_TELL);
    expect(part("times-next")).toBeNull();
    expect(part("times-most")).toBeNull();
    expect(sheet().querySelectorAll("[data-testid='time-chip']")).toHaveLength(0);
    expect(sheet().textContent!.split(WRAP_UP_CANT_TELL)).toHaveLength(2);
    online.mockRestore();
  });

  it("never offers a time someone marked Always full, and nothing for good when the marks were refused", async () => {
    fake.marks = [{ id: "2-1030", data: { weekday: 2, time: "10:30", mark: "full", by: { id: "u1", name: "Jo" } } }];
    await mount();
    expect(groups("times-most").find((l) => l.startsWith("Tuesdays"))).toBe("Tuesdays: 11:00 AM | 11:30 AM");
    expect(sheet().textContent).not.toMatch(/\bJo\b/);

    act(() => root.unmount());
    root = createRoot(host);
    fake.marksAnswer = "fails";
    await mount();
    expect(part("times-most")?.textContent).toContain(WRAP_UP_CANT_CHECK);
    expect(groups("times-most")).toEqual([]);
    expect(groups("times-next").length).toBeGreaterThan(0);
  });

  it("with nothing to offer anywhere, says so in one line: the front desk sees every opening", async () => {
    fake.summary = null;
    fake.weeks = {
      docs: [
        { ...samWeek(), final: null, proposed: samWeek().final },
        { ...PAT_WEEK, final: null, proposed: PAT_WEEK.final },
      ],
      loading: false,
      error: null,
    };
    await mount();
    expect(sheet().querySelector("[data-testid='times-whole']")?.textContent).toBe(NO_OFFERS);
    expect(sheet().querySelector("[data-testid='times-foot']")?.textContent).toBe(OFFER_FOOT);
  });

  it("a studio whose bookings aren't linked can't check the times, and reads no bookings", async () => {
    await mount({ studio: { ...WESTLAKE, mindbodySiteId: "" } as unknown as Studio });
    // Both parts would say it, so it is said once.
    expect(sheet().querySelector("[data-testid='times-whole']")?.textContent).toBe(WRAP_UP_CANT_CHECK);
    expect(part("times-next")).toBeNull();
    expect(sheet().textContent!.split(WRAP_UP_CANT_CHECK)).toHaveLength(2);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("hasTimesToOffer: whether the Wrap-up shows the door at all", () => {
  const time = (key: string, word: string) => [key, { key, word }] as const;
  const usualOf = (entries: (readonly [string, { key: string; word: string }])[]) => ({ times: new Map(entries) }) as unknown as UsualWeek;
  const input = (over: Partial<Parameters<typeof hasTimesToOffer>[0]> = {}): Parameters<typeof hasTimesToOffer>[0] => ({
    connected: true,
    weeks: { docs: [], loading: false, error: null },
    worksHere: () => true,
    usual: null,
    marks: { byTime: new Map(), read: "ready" },
    ...over,
  });
  const mark = (m: "full" | "room") => ({ key: "2-1030", weekday: 2, time: "10:30", mark: m, note: "", by: { id: "u", name: "Jo" }, at: null }) as unknown as OpeningsMark;

  it("is shown for an agreed week of someone who works here", () => {
    expect(hasTimesToOffer(input({ weeks: { docs: [samWeek()], loading: false, error: null } }))).toBe(true);
    expect(hasTimesToOffer(input({ weeks: { docs: [samWeek()], loading: false, error: null }, worksHere: () => false }))).toBe(false);
    expect(hasTimesToOffer(input({ weeks: { docs: [{ ...samWeek(), final: null }], loading: false, error: null } }))).toBe(false);
  });

  it("is shown for a time the summary says usually has room, unless it is marked Always full", () => {
    expect(hasTimesToOffer(input({ usual: usualOf([time("2-1030", "usually-room")]) }))).toBe(true);
    expect(hasTimesToOffer(input({ usual: usualOf([time("2-1030", "usually-full")]) }))).toBe(false);
    expect(hasTimesToOffer(input({ usual: usualOf([time("2-1030", "usually-room")]), marks: { byTime: new Map([["2-1030", mark("full")]]), read: "ready" } }))).toBe(false);
    expect(hasTimesToOffer(input({ usual: usualOf([time("2-1030", "mixed")]), marks: { byTime: new Map([["2-1030", mark("room")]]), read: "ready" } }))).toBe(true);
  });

  it("is never shown where the studio's bookings aren't linked, or before anything is known", () => {
    expect(hasTimesToOffer(input({ connected: false, weeks: { docs: [samWeek()], loading: false, error: null } }))).toBe(false);
    expect(hasTimesToOffer(input())).toBe(false);
  });
});
