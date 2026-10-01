/**
 * THE NIGHTLY JOB'S JOURNEY STEP (server/journey-step.ts, wave 2, Sep 28
 * 2026), against a Firestore made of plain maps: what it writes, in what
 * order, what it leaves alone, and that one studio's failure never stops
 * another's. Then the whole nightly job once, with a leader's "didn't come"
 * mark in it. The rules it applies are tested in nightly.test.ts; this is the
 * plumbing. TZ=America/New_York.
 */
import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

vi.mock("../../../../server/mindbody-client.ts", () => ({
  mindbodyConfigured: () => false,
  pullClientMaster: vi.fn(),
  pullClientCommercial: vi.fn(),
}));

import { runJourneyStep, type JourneyStepStudio } from "../../../../server/journey-step";
import { runRenewals } from "../../../../server/renewals-job";
import type { Client, ScheduleEntry } from "../../../types";
import type { RenewalSnapshot } from "../../renewals/types";
import { addDays } from "../../client-history/model";

type Docs = Record<string, Record<string, unknown>>;

/** A Firestore of maps: every write recorded in order, and chosen reads made to fail. */
function fakeDb(collections: Record<string, Docs>, fail: { reads?: string[] } = {}) {
  const store: Record<string, Docs> = collections;
  const writes: Array<{ path: string; kind: "set" | "update" | "delete"; data?: Record<string, unknown> }> = [];
  const split = (path: string) => {
    const at = path.lastIndexOf("/");
    return { col: path.slice(0, at), id: path.slice(at + 1) };
  };
  const failing = (path: string) => {
    if (fail.reads?.includes(path)) throw new Error(`read refused: ${path}`);
  };
  const assertNoUndefined = (value: unknown, at: string) => {
    if (value === undefined) throw new Error(`undefined at ${at}`);
    if (value && typeof value === "object" && !(value instanceof Timestamp) && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoUndefined(v, `${at}.${k}`);
    }
  };
  const ref = (path: string) => ({
    path,
    get: async () => {
      failing(path);
      const { col, id } = split(path);
      const data = store[col]?.[id];
      return { exists: !!data, id, data: () => data, get: (f: string) => (data as Record<string, unknown> | undefined)?.[f] };
    },
    set: async (data: Record<string, unknown>) => record(path, "set", data),
    update: async (data: Record<string, unknown>) => record(path, "update", data),
  });
  const record = (path: string, kind: "set" | "update" | "delete", data?: Record<string, unknown>) => {
    if (data) assertNoUndefined(data, path);
    writes.push({ path, kind, data });
    const { col, id } = split(path);
    store[col] ??= {};
    if (kind === "delete") delete store[col][id];
    else store[col][id] = kind === "set" ? { ...data } : { ...(store[col][id] ?? {}), ...data };
  };
  const collection = (path: string) => {
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      select: () => query,
      get: async () => {
        failing(path);
        const docs = Object.entries(store[path] ?? {}).map(([id, data]) => ({ id, ref: ref(`${path}/${id}`), data: () => data, get: (f: string) => (data as Record<string, unknown>)[f] }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return query;
  };
  const db = {
    collection,
    doc: ref,
    getAll: async (...refs: Array<{ path: string }>) => Promise.all(refs.map((r) => ref(r.path).get())),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => record(r.path, "set", data)),
        update: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => record(r.path, "update", data)),
        delete: (r: { path: string }) => ops.push(() => record(r.path, "delete")),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db: db as never, store, writes };
}

const TODAY = "2026-09-28";
const NOW = new Date("2026-09-28T06:30:00Z"); // 2:30 AM Eastern, Monday
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const snap = (extra: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({ version: 1, situation: "on-track", pacePerWeek: 2, proof: { weeksObserved: 12, weeksAttended: 12 }, flags: [], lastVisitDate: "2026-09-24", nextBookingDate: null, primaryTrainerId: null, ...extra }) as unknown as RenewalSnapshot;

const client = (id: string, first: string, extra: Record<string, unknown> = {}) => ({ id, firstName: first, lastName: "Rohan", isActive: true, homeStudioId: "edoras", ...extra }) as unknown as Client;

/** Mondays and Thursdays for `weeks` weeks before `upTo` (a Monday). */
const twiceAWeek = (weeks: number, upTo = TODAY) => {
  const out: string[] = [];
  for (let w = 1; w <= weeks; w++) out.push(addDays(upTo, -7 * w), addDays(upTo, -7 * w + 3));
  return out.sort();
};

const studio = (over: Partial<JourneyStepStudio> = {}): JourneyStepStudio => ({
  id: "edoras",
  name: "Edoras",
  tz: "America/New_York",
  today: TODAY,
  live: true,
  breakDays: 14,
  nameIndex: null,
  clients: [client("eowyn", "Éowyn"), client("eomer", "Éomer", { historyIsComplete: true })],
  snapshots: new Map([
    ["eowyn", snap()],
    ["eomer", snap()],
  ]),
  ...over,
});

const sessionsFor = (clientId: string, days: string[], studioId = "edoras") =>
  Object.fromEntries(days.map((d, i) => [`${clientId}-${i}`, { clientId, status: "Completed", hostedAtStudioId: studioId, date: d, startTime: eastern(d, "09:00") }]));

const world = (extra: Record<string, Docs> = {}, fail: { reads?: string[] } = {}) =>
  fakeDb(
    {
      sessions: { ...sessionsFor("eomer", twiceAWeek(26)), ...sessionsFor("eowyn", twiceAWeek(4)) },
      ...extra,
    },
    fail,
  );

const run = (db: never, over: Partial<Parameters<typeof runJourneyStep>[0]> = {}) =>
  runJourneyStep({
    db,
    studios: [studio()],
    allStudios: [{ id: "edoras", name: "Edoras", journeyCutoverDate: "2026-06-01" }],
    bookingsByClient: new Map<string, ScheduleEntry[]>(),
    visitDaysOf: (_s, c) => (c.id === "eowyn" ? twiceAWeek(12) : twiceAWeek(12)),
    now: NOW,
    log: () => {},
    ...over,
  });

describe("the nightly job's Journey step", () => {
  it("writes each active client's state, All stars, and the summary last", async () => {
    const { db, store, writes } = world();
    const summary = await run(db);
    expect(summary).toMatchObject({ studios: 1, skipped: 0, statesWritten: 2, statesRemoved: 0, allStars: 1 });
    expect(Object.keys(store["studios/edoras/clientStates"]).sort()).toEqual(["eomer", "eowyn"]);
    expect(store["studios/edoras/clientStates"].eowyn).toMatchObject({ state: "steady", since: TODAY, was: null, usualGapDays: 3.5 });
    expect(store["studios/edoras/clientStates"].eowyn.computedAt).toBeDefined();
    // Éomer: every week of the 26, and Journey holds his whole story. Éowyn's record is four weeks long.
    expect(store["studios/edoras/watch"].hubMarks).toMatchObject({ allStars: [{ clientId: "eomer", weeksWithVisit: 26, perWeek: 2 }] });
    expect(Object.keys(store["studios/edoras/watch"].hubMarks).sort()).toEqual(["allStars", "computedAt"]);
    expect(store["studios/edoras/watch"].journey).toMatchObject({ v: 1, asOf: TODAY, clients: 2, breakDays: 14, counts: { steady: 2 } });
    expect(writes.at(-1)?.path).toBe("studios/edoras/watch/journey");
  });

  it("writes again only what changed, and removes a client who is no longer active here", async () => {
    const { db, store, writes } = world();
    await run(db);
    const before = writes.length;
    // The next night: nothing changed for Éomer; Éowyn left.
    const second = await run(db, { studios: [studio({ clients: [client("eowyn", "Éowyn", { isActive: false }), client("eomer", "Éomer", { historyIsComplete: true })] })] });
    expect(second).toMatchObject({ statesWritten: 0, statesRemoved: 1 });
    const tonight = writes.slice(before).map((w) => `${w.kind} ${w.path}`);
    expect(tonight).toEqual(["delete studios/edoras/clientStates/eowyn", "set studios/edoras/watch/hubMarks", "set studios/edoras/watch/journey"]);
    expect(store["studios/edoras/clientStates"].eowyn).toBeUndefined();
  });

  it("reads each line from the studio's own settings, then Max Strength's, then the app's", async () => {
    const { db, store } = world({
      system: { studioDefaults: { values: { lapsedDays: 30, driftMultiple: 2.5 } } },
      "studios/edoras/config": { settings: { values: { lapsedDays: 60 } } },
    });
    await run(db);
    expect(store["studios/edoras/watch"].journey.lines).toEqual({ driftMultiple: 2.5, driftMinDays: 7, lapsedDays: 60, inactiveDays: 90, newMax: 10, settlingMax: 24 });
  });

  it("writes nothing on a dry run, and says what it would have", async () => {
    const { db, writes } = world();
    const lines: string[] = [];
    const summary = await run(db, { dryRun: true, log: (l) => lines.push(l) });
    expect(writes).toEqual([]);
    expect(summary.statesWritten).toBe(2);
    expect(lines.join("\n")).toContain("Edoras: 2 client states (2 would change, 0 would be removed)");
  });

  it("writes nothing for a studio that hasn't gone live", async () => {
    const { db, writes } = world();
    const lines: string[] = [];
    const summary = await run(db, { studios: [studio({ live: false })], log: (l) => lines.push(l) });
    expect(summary.studios).toBe(0);
    expect(writes).toEqual([]);
    expect(lines.join("\n")).toContain("no studio has gone live yet");
  });

  it("skips a studio whose reads fail, and goes on with the next", async () => {
    const { db, store } = world({ "studios/rohan-west/clientStates": {} }, { reads: ["studios/edoras/config/settings"] });
    const west = studio({ id: "rohan-west", name: "Rohan West", clients: [client("hama", "Háma", { homeStudioId: "rohan-west" })], snapshots: new Map([["hama", snap()]]) });
    const lines: string[] = [];
    const summary = await run(db, { studios: [studio(), west], allStudios: [{ id: "edoras", journeyCutoverDate: "2026-06-01" }, { id: "rohan-west", journeyCutoverDate: "2026-06-01" }], log: (l) => lines.push(l) });
    expect(summary).toMatchObject({ studios: 1, skipped: 1 });
    expect(store["studios/edoras/watch"]).toBeUndefined();
    expect(store["studios/rohan-west/watch"].journey).toMatchObject({ clients: 1 });
    expect(lines.join("\n")).toContain("Edoras: client states skipped tonight");
  });

  it("writes a leader's mark as a manual Inactive, never touching the mark (Oct 1 2026)", async () => {
    const mark = { clientId: "eowyn", reason: "health", note: "Knee surgery", day: "2026-09-26", markedBy: { id: "uid-l", name: "Glorfindel" }, markedAt: new Date() };
    const { db, store, writes } = world({ "studios/edoras/inactiveMarks": { eowyn: mark } });
    const lines: string[] = [];
    await run(db, { log: (l) => lines.push(l) });
    expect(store["studios/edoras/clientStates"].eowyn).toMatchObject({ state: "inactive", inactiveKind: "manual", crossed: "marked", since: "2026-09-26" });
    expect(store["studios/edoras/clientStates"].eomer).toMatchObject({ state: "steady", inactiveKind: null });
    expect(store["studios/edoras/watch"].journey.counts).toMatchObject({ inactive: 1, steady: 1 });
    expect(writes.some((w) => w.path.includes("inactiveMarks"))).toBe(false);
    expect(lines.join("\n")).toContain("1 inactive (1 marked by a leader)");
  });

  it("skips a studio whose marks can't be read, rather than dropping a leader's Inactive", async () => {
    const { db, store } = world({}, { reads: ["studios/edoras/inactiveMarks"] });
    const summary = await run(db);
    expect(summary).toMatchObject({ studios: 0, skipped: 1 });
    expect(store["studios/edoras/clientStates"]).toBeUndefined();
  });

  it("leaves All stars as they were when the sessions can't be read, and still writes the states", async () => {
    const { db, store } = world({ "studios/edoras/watch": { hubMarks: { allStars: [{ clientId: "eomer", weeksWithVisit: 25, perWeek: 2 }], computedAt: "last night" } } }, { reads: ["sessions"] });
    const summary = await run(db);
    expect(summary.statesWritten).toBe(2);
    expect(store["studios/edoras/watch"].hubMarks).toEqual({ allStars: [{ clientId: "eomer", weeksWithVisit: 25, perWeek: 2 }], computedAt: "last night" });
  });
});

describe("the whole nightly job, with the Journey step", () => {
  it("counts a booking a leader marked \"didn't come\" as no visit, then writes the states after the snapshots", async () => {
    // Edoras moved onto Journey on the 26th: a booking before it with nothing logged is still a visit (FileMaker
    // holds that record) — unless a leader marked it "didn't come".
    const { db, store, writes } = fakeDb({
      studios: { edoras: { name: "Edoras", timezone: "America/New_York", journeyCutoverDate: "2026-09-26" } },
      machines: {},
      schedules: {
        "b-mon": { clientId: "eowyn", studioId: "edoras", startTime: Timestamp.fromDate(eastern("2026-09-21", "10:00")), endTime: Timestamp.fromDate(eastern("2026-09-21", "10:30")), status: "Scheduled", trainerId: "t1" },
        "b-thu": { clientId: "eowyn", studioId: "edoras", startTime: Timestamp.fromDate(eastern("2026-09-24", "10:00")), endTime: Timestamp.fromDate(eastern("2026-09-24", "10:30")), status: "Scheduled", trainerId: "t1" },
      },
      sessions: {},
      clients: { eowyn: { firstName: "Éowyn", lastName: "Rohan", isActive: true, homeStudioId: "edoras", mindbodyClientId: "eowyn" } },
      "studios/edoras/bookingMarks": { "b-thu": { noShow: true, clientId: "eowyn", day: "2026-09-24", markedBy: { id: "lead", name: "Glorfindel" }, markedAt: new Date() } },
    });
    const summary = await runRenewals({ db, now: NOW, noPulls: true, log: () => {} });
    // Thursday was marked: her last visit is Monday.
    expect((store.clients.eowyn.renewal as { lastVisitDate?: string }).lastVisitDate).toBe("2026-09-21");
    expect(store["studios/edoras/clientStates"].eowyn).toMatchObject({ lastVisit: "2026-09-21" });
    expect(summary.journey).toMatchObject({ studios: 1, statesWritten: 1 });
    const order = writes.map((w) => w.path);
    expect(order.indexOf("clients/eowyn")).toBeLessThan(order.indexOf("studios/edoras/clientStates/eowyn"));
    expect(order.at(-1)).toBe("studios/edoras/watch/journey");
  });
});
