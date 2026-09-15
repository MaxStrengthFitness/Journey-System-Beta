// @vitest-environment jsdom
/**
 * Mounts `useLiveSchedule` against a fake Firestore.
 *
 * The hook does all of its work in effects — a listener, a cached range
 * fetch, a timer — and the order those effects run in is load-bearing: the
 * cache reset on a studio switch has to run BEFORE the first range fetch, or
 * that fetch lands in a map the hook has already thrown away and the Hub's
 * other day tabs sit empty for fifteen minutes. Nothing but a mount checks
 * that, which is why this test exists (see the note in CLAUDE.md about the
 * four-tab profile).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setActiveTimeZone } from "../lib/studio-time";

vi.mock("../firebase", () => ({ db: { __fake: true }, auth: {} }));
vi.mock("../lib/firestore-errors", () => ({
  OperationType: { GET: "get" },
  handleFirestoreError: vi.fn(),
}));

type FakeDoc = {
  id: string;
  studioId: string;
  clientId?: string;
  startTime: { toDate: () => Date };
  status: string;
  clientName: string;
};

/** The "database": every booking the fake knows about. */
let store: FakeDoc[] = [];
/** The live listener's handler, so a test can push a snapshot. */
let liveHandler: ((snap: { docs: any[] }) => void) | null = null;
let liveQuery: any = null;
const getDocsCalls: any[] = [];
const unsubscribe = vi.fn();

function constraintsOf(q: any) {
  const out: { from?: Date; to?: Date; studioId?: string; collection: string } = {
    collection: q.__collection,
  };
  for (const c of q.constraints) {
    if (c.type !== "where") continue;
    if (c.field === "startTime" && c.op === ">=") out.from = c.value.__date;
    if (c.field === "startTime" && c.op === "<=") out.to = c.value.__date;
    if (c.field === "studioId") out.studioId = c.value;
  }
  return out;
}

function matching(q: any) {
  const c = constraintsOf(q);
  return store.filter((d) => {
    const t = d.startTime.toDate();
    if (c.from && t < c.from) return false;
    if (c.to && t > c.to) return false;
    if (c.studioId && d.studioId !== c.studioId) return false;
    return true;
  });
}

const asSnap = (docs: FakeDoc[]) => ({
  docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
});

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
  query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
  where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
  orderBy: (field: string, dir: string) => ({ type: "orderBy", field, dir }),
  Timestamp: { fromDate: (d: Date) => ({ __date: d }) },
  onSnapshot: (q: any, next: any) => {
    liveQuery = q;
    liveHandler = next;
    // The real SDK delivers the first snapshot asynchronously.
    setTimeout(() => next(asSnap(matching(q))), 0);
    return unsubscribe;
  },
  getDocs: async (q: any) => {
    getDocsCalls.push(q);
    await new Promise((r) => setTimeout(r, 0));
    if (q.__collection === "clients") return { docs: [] };
    return asSnap(matching(q));
  },
}));

import { useLiveSchedule } from "./useLiveSchedule";

const ET = "America/New_York";
/** Noon Eastern on Tue Sep 15 2026. */
const NOW = new Date("2026-09-15T16:00:00Z");

function booking(id: string, iso: string, studioId = "westlake", extra: Partial<FakeDoc> = {}): FakeDoc {
  return {
    id,
    studioId,
    clientId: `c-${id}`,
    startTime: { toDate: () => new Date(iso) },
    status: "Scheduled",
    clientName: `Client ${id}`,
    ...extra,
  };
}

let latest: ReturnType<typeof useLiveSchedule> | null = null;

function Probe({ studioId }: { studioId: string | null }) {
  latest = useLiveSchedule(studioId, true);
  return <span data-testid="ids">{latest.schedules.map((s) => s.id).join(",")}</span>;
}

async function mount(ui: React.ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

/** Let every pending timer of 0ms and every awaited promise settle. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });

const idsOn = (host: HTMLElement) =>
  (host.querySelector("[data-testid=ids]")?.textContent ?? "").split(",").filter(Boolean);

const scheduleReads = () => getDocsCalls.filter((q) => q.__collection === "schedules");

beforeEach(() => {
  setActiveTimeZone(ET);
  vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  store = [];
  liveHandler = null;
  liveQuery = null;
  getDocsCalls.length = 0;
  unsubscribe.mockClear();
  latest = null;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useLiveSchedule mounts with a live window and a fetched week", () => {
  it("listens on yesterday..tomorrow only, and fetches the week ahead once on mount", async () => {
    const { root } = await mount(<Probe studioId="westlake" />);
    await settle();

    // The live query is the three studio days, filtered to the studio.
    const live = constraintsOf(liveQuery);
    expect(live.from?.toISOString()).toBe("2026-09-14T04:00:00.000Z");
    expect(live.to?.toISOString()).toBe("2026-09-17T03:59:59.999Z");
    expect(live.studioId).toBe("westlake");

    // Exactly one week-ahead read, and it starts the day AFTER the live
    // window: yesterday, today and tomorrow are the listener's, so the week
    // fetch is trimmed to +2 .. +8 days and an app open never reads the
    // live days twice.
    // (StrictMode mounts twice; the first mount's read is cancelled by the
    // cache swap, and the in-flight guard keeps the second from doubling.)
    const reads = scheduleReads().map(constraintsOf);
    expect(reads.length).toBeGreaterThanOrEqual(1);
    const week = reads[reads.length - 1];
    expect(week.from?.toISOString()).toBe("2026-09-17T04:00:00.000Z");
    expect(week.to?.toISOString()).toBe("2026-09-24T03:59:59.999Z");
    expect(week.studioId).toBe("westlake");

    await act(async () => root.unmount());
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("merges the live days with the fetched week, live winning by id, cancelled dropped", async () => {
    store = [
      booking("today", "2026-09-15T18:00:00Z"),
      booking("friday", "2026-09-18T14:00:00Z"),
      booking("gone", "2026-09-18T15:00:00Z", "westlake", { status: "Cancelled" }),
      booking("elsewhere", "2026-09-18T15:00:00Z", "solon"),
    ];
    const { host } = await mount(<Probe studioId="westlake" />);
    await settle();

    // The week fetch is not thrown away by the mount-time cache reset: the
    // Friday booking is here although it is outside the live window.
    expect(idsOn(host)).toEqual(["today", "friday"]);

    // A live snapshot with a newer copy of today's booking replaces the
    // fetched one; the fetched Friday survives.
    await act(async () => {
      liveHandler!(asSnap([booking("today", "2026-09-15T18:00:00Z", "westlake", { clientName: "Renamed" })]));
    });
    expect(idsOn(host)).toEqual(["today", "friday"]);
    expect(latest!.schedules.find((s) => s.id === "today")?.clientName).toBe("Renamed");
  });

  it("does not re-read a fresh range, and refresh() forces the week again", async () => {
    store = [booking("friday", "2026-09-18T14:00:00Z")];
    await mount(<Probe studioId="westlake" />);
    await settle();
    const before = scheduleReads().length;

    // Asking for a range inside the freshly fetched week costs nothing.
    // (Not awaited inside act: the fake read waits on a fake timer, and only
    // settle() advances those.)
    await act(async () => {
      void latest!.ensureRange(new Date("2026-09-16T16:00:00Z"), new Date("2026-09-18T16:00:00Z"));
    });
    await settle();
    expect(scheduleReads().length).toBe(before);

    // A range outside it is one new read, bounded to whole studio days.
    await act(async () => {
      void latest!.ensureRange(new Date("2026-10-05T16:00:00Z"), new Date("2026-10-07T16:00:00Z"));
    });
    await settle();
    expect(scheduleReads().length).toBe(before + 1);
    const october = constraintsOf(scheduleReads()[before]);
    expect(october.from?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(october.to?.toISOString()).toBe("2026-10-08T03:59:59.999Z");

    // Refresh re-reads the week whether or not it is fresh.
    await act(async () => {
      latest!.refresh();
    });
    await settle();
    expect(scheduleReads().length).toBe(before + 2);
    expect(latest!.lastFetchedAt).not.toBeNull();
    expect(latest!.isFetching).toBe(false);
  });

  it("re-anchors the live window just after the studio's midnight, and keeps the week fresh on a timer", async () => {
    await mount(<Probe studioId="westlake" />);
    await settle();
    const readsAtMount = scheduleReads().length;
    expect(constraintsOf(liveQuery).from?.toISOString()).toBe("2026-09-14T04:00:00.000Z");

    // Noon to 00:00:01 Eastern: the listener moves along one day.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000 + 2000);
    });
    expect(constraintsOf(liveQuery).from?.toISOString()).toBe("2026-09-15T04:00:00.000Z");
    expect(constraintsOf(liveQuery).to?.toISOString()).toBe("2026-09-18T03:59:59.999Z");

    // Twelve hours of 15-minute ticks re-read the week, and nothing else
    // fires in a loop: about one read per stale period, not per snapshot.
    const later = scheduleReads().length - readsAtMount;
    expect(later).toBeGreaterThanOrEqual(40);
    expect(later).toBeLessThanOrEqual(50);
  });

  it("clears the fetched cache on a studio switch", async () => {
    store = [booking("wl-fri", "2026-09-18T14:00:00Z", "westlake"), booking("so-fri", "2026-09-18T14:00:00Z", "solon")];
    const { host, root } = await mount(<Probe studioId="westlake" />);
    await settle();
    expect(idsOn(host)).toEqual(["wl-fri"]);

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe studioId="solon" />
        </StrictMode>,
      );
    });
    await settle();
    expect(idsOn(host)).toEqual(["so-fri"]);
    expect(constraintsOf(liveQuery).studioId).toBe("solon");
  });
});
