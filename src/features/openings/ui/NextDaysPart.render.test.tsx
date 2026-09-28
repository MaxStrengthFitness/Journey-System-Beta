// @vitest-environment jsdom
/**
 * MY STUDIO → OPENINGS → NEXT 7 DAYS and A NEW REGULAR TIME (Openings round,
 * phase 5), mounted: what opened up this week, read live and only from the
 * server's answer; "booked again from" from one batched read; client names
 * only after a tap; whose times; and the times to offer for good, each
 * ending "Check it in Mindbody". Then every way the week's read can't be
 * trusted (still loading, failed, a cache-only answer, offline), a studio
 * whose Mindbody isn't linked, and a studio with no week agreed.
 *
 * Today is Monday Nov 9 2026, noon Eastern. Sam takes clients Monday 7:00 -
 * 10:00 and Tuesday 10:00 - 12:00, with Judy his Tuesday 10:00 regular; Pat
 * takes them Monday 7:00 - 9:00. The summary is the fixture's Sunday run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ScheduleEntry, Studio, Trainer } from "../../../types";
import type { StandingWeekDoc } from "../../standing-week/week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  summary: null as unknown,
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  schedule: { entries: [] as unknown[], loading: false, failed: false, fromCache: false },
  scheduleAsked: [] as (string | null)[],
  lease: undefined as unknown,
  clientRows: [] as unknown[],
  clientFromCache: false,
  comingRows: [] as unknown[],
  queries: [] as { kind: "client" | "coming"; wheres: { f: string; op: string; v: unknown }[] }[],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-pat" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  type W = { f: string; op: string; v: unknown };
  const snap = (rows: unknown[], fromCache = false) => ({
    docs: (rows as { id: string }[]).map((r) => ({ id: r.id, data: () => r })),
    metadata: { fromCache },
  });
  return {
    ...real,
    doc: ref,
    collection: ref,
    where: (f: string, op: string, v: unknown) => ({ f, op, v }),
    orderBy: () => ({ order: true }),
    query: (c: { path: string }, ...cs: unknown[]) => ({ path: c.path, wheres: cs.filter((x): x is W => !!x && typeof x === "object" && "f" in x) }),
    getDoc: () => Promise.resolve({ exists: () => true, data: () => fake.summary, metadata: { fromCache: false } }),
    onSnapshot: (_r: unknown, _o: unknown, next: (s: unknown) => void) => {
      const t = setTimeout(() => next({ docs: [], metadata: { fromCache: false } }), 0);
      return () => clearTimeout(t);
    },
    getDocs: (q: { wheres: W[] }) => {
      const client = q.wheres.some((w) => w.f === "clientId");
      fake.queries.push({ kind: client ? "client" : "coming", wheres: q.wheres });
      return Promise.resolve(client ? snap(fake.clientRows, fake.clientFromCache) : snap(fake.comingRows));
    },
  };
});
vi.mock("../../standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));
vi.mock("../../admin/changes/useWeekSchedule", () => ({
  useWeekSchedule: (studioId: string | null) => {
    fake.scheduleAsked.push(studioId);
    return studioId ? fake.schedule : { entries: [], loading: false, failed: false, fromCache: false };
  },
}));
vi.mock("../../admin/sync-lease", () => ({ useSyncLease: () => fake.lease }));

import { forgetPersonalMemory } from "../../sign-out/memory";
import { OFFER_FOOT } from "../present";
import { OpeningsSection } from "./OpeningsSection";
import { rememberOpeningsPart } from "./part-memory";
import { LEE, PAT, PAT_WEEK, SAM, SAM_TUESDAYS, Shell, WESTLAKE, foldFixture } from "./test-shell";
import { pat as patAt, sam as samAt } from "../fixtures";

const JUDY_TUESDAY = { id: "r1", weekday: 2, start: "10:00", clientId: "c-judy", clientName: "Judy Smith" };
const samWeek = (): StandingWeekDoc => ({ ...SAM_TUESDAYS, final: { ...SAM_TUESDAYS.final!, regulars: [JUDY_TUESDAY] } });
const TODAY_MORNING = new Date("2026-11-09T06:30:00-05:00").getTime();

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  forgetPersonalMemory();
  fake.summary = foldFixture();
  fake.weeks = { docs: [samWeek(), PAT_WEEK], loading: false, error: null };
  fake.schedule = { entries: [], loading: false, failed: false, fromCache: false };
  fake.scheduleAsked.length = 0;
  fake.lease = { lastDeepScheduleSyncAt: TODAY_MORNING };
  fake.clientRows = [];
  fake.clientFromCache = false;
  fake.comingRows = [];
  fake.queries.length = 0;
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

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount(part: "next" | "offer", { viewer = LEE, studio = WESTLAKE, trainers = [SAM, PAT, LEE] }: { viewer?: Trainer; studio?: Studio; trainers?: Trainer[] } = {}) {
  rememberOpeningsPart(part);
  await act(async () => {
    root.render(
      <StrictMode>
        <Shell>
          <OpeningsSection studio={studio} authTrainer={viewer} trainers={trainers} />
        </Shell>
      </StrictMode>,
    );
  });
  await settle();
  await settle();
}

const text = () => host.textContent ?? "";
const lineTexts = () => [...host.querySelectorAll(".op-line > .op-line__text")].map((l) => l.textContent);
const button = (label: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`No button "${label}" in: ${[...host.querySelectorAll("button")].map((x) => x.textContent).join(" | ")}`);
  return b;
};

/** Pat's 8:00 cancelled on Sunday, more than a day ahead: a cancellation nobody has booked into. */
const patCancelled = () =>
  patAt("2026-11-11", "09:00", { id: "cx", clientId: "c-ron", clientName: "Ron Dale", status: "Cancelled", cancelledAt: new Date("2026-11-08T15:00:00Z") } as Partial<ScheduleEntry>);

describe("next 7 days", () => {
  it("lists a regular who isn't booked, naming no client until the line is tapped", async () => {
    fake.clientRows = [samAt("2026-11-17", "10:00", { id: "judy-next", clientId: "c-judy", clientName: "Judy Smith" })];
    await mount("next");
    expect(lineTexts()).toEqual(["Tue, Nov 10 · 10:00 AM · always full · room with Sam. A regular isn't booked for it; booked again from Tue, Nov 17."]);
    expect(text()).not.toContain("Judy");
    await act(async () => (host.querySelector(".op-line") as HTMLButtonElement).click());
    const detail = host.querySelector("[data-testid='line-detail']")!;
    expect(detail.textContent).toContain("Judy Smith, Sam's regular, isn't booked for it.");
    expect(detail.textContent).toContain("Check it in Mindbody before you promise it.");
    expect(host.querySelector(".op-line")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("reads 'booked again from' once, for the clients the lines are about, from the day after the slot", async () => {
    await mount("next");
    // One read, of the one client (StrictMode runs the effect twice in a test; the app once).
    const reads = fake.queries.filter((q) => q.kind === "client");
    expect(new Set(reads.map((q) => JSON.stringify(q.wheres))).size).toBe(1);
    expect(reads[0].wheres.find((w) => w.f === "clientId")).toMatchObject({ op: "in", v: ["c-judy"] });
    // From the day after the slot (Tue Nov 10), in the studio's own midnight.
    expect((reads[0].wheres.find((w) => w.f === "startTime" && w.op === ">=")?.v as { toDate: () => Date }).toDate().toISOString()).toBe("2026-11-11T05:00:00.000Z");
    // Nothing found and the month was read in full today: named through its last day.
    expect(lineTexts()[0]).toContain("not booked again through Wed, Dec 9");
  });

  it("says it can't tell when the next booking comes only from this iPad's cache", async () => {
    fake.clientFromCache = true;
    await mount("next");
    expect(lineTexts()[0]).toContain("can't tell yet when they're next booked");
  });

  it("says 'you' to the trainer whose room it is, and starts them on their own times", async () => {
    await mount("next", { viewer: SAM });
    expect(host.querySelector(".op-chip[aria-pressed='true']")?.textContent).toBe("With you");
    expect(lineTexts()[0]).toContain("room with you");
  });

  it("narrows to a trainer, and to anyone, with the chips", async () => {
    fake.schedule.entries = [patCancelled()];
    await mount("next", { viewer: SAM });
    expect(lineTexts()).toHaveLength(1);
    await act(async () => button("Anyone").click());
    expect(lineTexts()).toHaveLength(2);
    expect(lineTexts()[1]).toContain("A cancellation on Nov 8, and nobody has booked into it since");
    await act(async () => button("With Pat").click());
    expect(lineTexts()).toHaveLength(1);
    expect(lineTexts()[0]).toContain("Wed, Nov 11 · 9:00 AM");
    // No count beside any name.
    expect([...host.querySelectorAll(".op-chip")].map((c) => c.textContent)).toEqual(["With you", "Anyone", "With Pat"]);
  });

  it("with no week agreed, lists cancellations only, and says so", async () => {
    fake.weeks = { docs: [{ ...samWeek(), final: null, proposed: samWeek().final }], loading: false, error: null };
    fake.schedule.entries = [patCancelled()];
    await mount("next");
    expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe("No standing week is agreed yet, so this lists cancellations only.");
    expect(lineTexts()).toHaveLength(1);
    expect(lineTexts()[0]).toContain("A cancellation on Nov 8");
    expect(text()).not.toContain("Ron");
  });

  it("isn't linked to Mindbody: says so, and reads no bookings", async () => {
    await mount("next", { studio: { ...WESTLAKE, mindbodySiteId: "" } as unknown as Studio });
    expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe("Westlake's bookings aren't linked to Journey, so Openings can't read them.");
    expect(fake.scheduleAsked.every((s) => s === null)).toBe(true);
    expect(lineTexts()).toEqual([]);
  });

  describe("never says a slot is open off a read it can't trust", () => {
    const CANT_TELL = "Can't tell yet. The next 7 days' bookings haven't come back from the server.";

    it("while the read is out", async () => {
      fake.schedule = { entries: [], loading: true, failed: false, fromCache: false };
      await mount("next");
      expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe(CANT_TELL);
      expect(lineTexts()).toEqual([]);
    });

    it("when the read failed", async () => {
      fake.schedule = { entries: [], loading: false, failed: true, fromCache: false };
      await mount("next");
      expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe(CANT_TELL);
      expect(lineTexts()).toEqual([]);
    });

    it("when only this iPad's cache answered, even with rows in it", async () => {
      fake.schedule = { entries: [patCancelled()], loading: false, failed: false, fromCache: true };
      await mount("next");
      expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe(CANT_TELL);
      expect(lineTexts()).toEqual([]);
    });

    it("when the iPad is offline", async () => {
      const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      fake.schedule = { entries: [], loading: false, failed: false, fromCache: true };
      await mount("next");
      expect(host.querySelector("[data-testid='next-state']")?.textContent).toBe(CANT_TELL);
      online.mockRestore();
    });

    it("when the standing weeks can't be read", async () => {
      fake.weeks = { docs: [], loading: false, error: "Couldn't load the standing weeks. Check the connection." };
      await mount("next");
      expect(text()).toContain("Couldn't load the standing weeks. Check the connection.");
      expect(text()).not.toContain("No standing week is agreed yet");
    });
  });
});

describe("a new regular time", () => {
  it("offers the times that usually have room and are free on the coming weeks, each ending 'check it in Mindbody'", async () => {
    await mount("offer");
    expect(text()).toContain("Safe to show a client");
    const offers = [...host.querySelectorAll(".op-offer")].map((o) => o.textContent);
    expect(offers.some((o) => o?.startsWith("Tuesday 10:30 AM · usually has room: room in 8 of the last 8 Tuesdays, and nobody booked in 8 of them, and free on the next 3 Tuesdays on file."))).toBe(true);
    expect(offers.find((o) => o?.startsWith("Tuesday 10:30 AM"))).toContain("This Tuesday, Nov 10: room.");
    expect(offers.find((o) => o?.startsWith("Tuesday 10:30 AM"))).toContain("With Sam");
    // Always full is never offered.
    expect(offers.some((o) => o?.startsWith("Monday 8:00 AM"))).toBe(false);
    expect(host.querySelector("[data-testid='offer-foot']")?.textContent).toBe(OFFER_FOOT);
    // The coming weeks were read for the studio, days 7 to 27 (Nov 16 - Dec 6).
    const coming = fake.queries.filter((q) => q.kind === "coming");
    expect(new Set(coming.map((q) => JSON.stringify(q.wheres))).size).toBe(1);
    expect(coming[0].wheres.find((w) => w.f === "studioId")?.v).toBe("westlake");
    expect((coming[0].wheres.find((w) => w.f === "startTime" && w.op === ">=")?.v as { toDate: () => Date }).toDate().toISOString()).toBe("2026-11-16T05:00:00.000Z");
    expect(fake.queries.some((q) => q.kind === "client")).toBe(false);
  });

  it("leaves out a time booked on one of the coming weeks", async () => {
    fake.comingRows = [samAt("2026-11-24", "10:30", { id: "later" })];
    await mount("offer");
    const offers = [...host.querySelectorAll(".op-offer")].map((o) => o.textContent);
    expect(offers.some((o) => o?.startsWith("Tuesday 10:30 AM"))).toBe(false);
    expect(offers.some((o) => o?.startsWith("Tuesday 11:00 AM"))).toBe(true);
  });

  it("can't check the coming weeks when the month wasn't read in full today, and doesn't read them", async () => {
    fake.lease = { lastDeepScheduleSyncAt: new Date("2026-11-07T06:30:00-05:00").getTime() };
    await mount("offer");
    expect(text()).toContain("Tuesday 10:30 AM · usually has room: room in 8 of the last 8 Tuesdays, and nobody booked in 8 of them. Can't check the coming Tuesdays yet.");
    expect(fake.queries.filter((q) => q.kind === "coming")).toHaveLength(0);
  });

  it("says the times are being checked while the sync lease is still coming", async () => {
    fake.lease = undefined;
    await mount("offer");
    expect(text()).toContain("Checking the coming weeks…");
  });

  it("with the chips on a trainer with no room to offer, says there is none, and still ends 'check it in Mindbody'", async () => {
    await mount("offer", { viewer: SAM });
    await act(async () => button("With Pat").click());
    // Pat is in on Monday mornings only, and every usually-room Monday time is offered with him too.
    expect([...host.querySelectorAll(".op-offer")].every((o) => o.textContent?.includes("With Pat"))).toBe(true);
    expect(host.querySelector("[data-testid='offer-foot']")?.textContent).toBe(OFFER_FOOT);
  });

  it("isn't linked to Mindbody: says so", async () => {
    await mount("offer", { studio: { ...WESTLAKE, mindbodySiteId: "" } as unknown as Studio });
    expect(text()).toContain("Westlake's bookings aren't linked to Journey, so Openings can't read them.");
    expect(host.querySelectorAll(".op-offer")).toHaveLength(0);
  });
});

