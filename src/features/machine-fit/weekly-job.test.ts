/**
 * The weekly job, end to end, against a Firestore made of plain maps.
 *
 * The thinking is tested where it lives (trends.test.ts, company.test.ts,
 * kaizen.test.ts, and Openings' fold.test.ts). This is the plumbing: which
 * documents the job writes and deletes, that last week's fit blocks survive a
 * failed fit step, that the Openings step (step 8) writes one document per
 * linked studio in its own batch after everything else and can fail without
 * harming anything, and that nothing `undefined` — which the Admin SDK
 * refuses — reaches a write.
 *
 * The fake ignores `where` and date ranges, so which weeks the Openings step
 * folds is tested in the pure module (openings/fold.test.ts: a Wednesday
 * "now", a Sunday "now" and the Nov 1 clock change, with the studio's time
 * zone passed explicitly). The step itself keeps only the studio's own rows.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOG_FIELDS, runMachineTrends } from "../../../server/machine-trends-job";
import { buildMachineTrends, type TrendClientInput, type TrendLogInput } from "../machine-trends/trends";
import { performanceDrops, type PerformanceLogInput } from "../admin/overview/performance";
import { buildDocument, openingsReport, readOpeningsStudios, readOpeningsTrainers, readStudio } from "../../../server/openings-step";
import { cellFor, readSummary } from "../openings/summary-doc";
import { usualWeek } from "../openings/usual";

type Docs = Record<string, Record<string, unknown>>;

function fakeDb(collections: Record<string, Docs>, opts: { failOn?: string; failCommitOn?: string } = {}) {
  const store: Record<string, Docs> = JSON.parse(JSON.stringify(collections));
  const written: string[] = [];
  const deleted: string[] = [];
  /** Every place a write carried `undefined`: the Admin SDK would refuse it. */
  const undefinedAt: string[] = [];
  /** Every `where` asked, so a test can hold a query to the index it needs (the fake itself ignores them). */
  const queries: { path: string; field: string; op: string; value: unknown }[] = [];
  /** Every read: a collection or query by its path, a document by its own. */
  const reads: string[] = [];

  const snapshot = (path: string) => {
    reads.push(path);
    if (opts.failOn && path.endsWith(opts.failOn)) throw new Error(`cannot read ${path}`);
    const docs = Object.entries(store[path] ?? {}).map(([id, data]) => ({
      id,
      ref: { path: `${path}/${id}` },
      data: () => data,
      get: (field: string) => (data as Record<string, unknown>)[field],
    }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  };

  const docRef = (path: string, id: string) => ({
    path: `${path}/${id}`,
    id,
    collection: (sub: string) => collection(`${path}/${id}/${sub}`),
    get: async () => {
      reads.push(`${path}/${id}`);
      if (opts.failOn && `${path}/${id}`.includes(opts.failOn)) throw new Error(`cannot read ${path}/${id}`);
      const data = store[path]?.[id];
      return { id, exists: data !== undefined, data: () => data };
    },
  });

  const collection = (path: string) => {
    const query = {
      where: (field: string, op: string, value: unknown) => {
        queries.push({ path, field, op, value });
        return query;
      },
      orderBy: () => query,
      select: () => query,
      limit: () => query,
      get: async () => snapshot(path),
      // The Admin SDK's stream, which the job reads the window's sets and the clients through.
      stream: async function* () {
        yield* snapshot(path).docs;
      },
      doc: (id: string) => docRef(path, id),
    };
    return query;
  };

  const assertNoUndefined = (value: unknown, at: string) => {
    if (value === undefined) {
      undefinedAt.push(at);
      throw new Error(`undefined at ${at}`);
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoUndefined(v, `${at}.${k}`);
    }
  };

  const db = {
    collection,
    doc: (path: string) => {
      const at = path.lastIndexOf("/");
      return docRef(path.slice(0, at), path.slice(at + 1));
    },
    // Machine fit reads the clients a studio's rows name by id, with a field mask (ignored here).
    getAll: async (...refs: unknown[]) => Promise.all(refs.filter((r): r is ReturnType<typeof docRef> => typeof (r as { get?: unknown })?.get === "function").map((r) => r.get())),
    batch: () => {
      const ops: Array<() => void> = [];
      const paths: string[] = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          assertNoUndefined(data, ref.path);
          paths.push(ref.path);
          ops.push(() => {
            const at = ref.path.lastIndexOf("/");
            const col = ref.path.slice(0, at);
            (store[col] ??= {})[ref.path.slice(at + 1)] = JSON.parse(JSON.stringify(data));
            written.push(ref.path);
          });
        },
        delete: (ref: { path: string }) => {
          paths.push(ref.path);
          ops.push(() => {
            const at = ref.path.lastIndexOf("/");
            delete store[ref.path.slice(0, at)]?.[ref.path.slice(at + 1)];
            deleted.push(ref.path);
          });
        },
        commit: async () => {
          const failCommitOn = opts.failCommitOn;
          if (failCommitOn && paths.some((p) => p.includes(failCommitOn))) throw new Error("the commit was refused");
          ops.forEach((op) => op());
        },
      };
    },
  };
  return { db: db as never, store, written, deleted, undefinedAt, queries, reads };
}

const NOW = new Date("2026-09-20T07:00:00.000Z");
const T = Date.UTC(2026, 8, 17, 16, 0, 0);

// Eight women of one height: a published cell must describe at least five people.
const clients: Docs = {};
const rows: Record<string, unknown> = {};
for (let i = 0; i < 8; i += 1) {
  clients[`c${i}`] = { isActive: i !== 7, height: "5'4\"", gender: "Female", homeStudioId: "solon" };
  rows[`c${i}`] = { s: { seat: String(6 - Math.floor(i / 3)), gap: "0" }, t: T };
}

const base = (): Record<string, Docs> => ({
  clients,
  exerciseLogs: {
    l1: { clientId: "c0", machineId: "m-leg-press", sessionId: "s1", weight: 100, reps: 8, outcome: "performed" },
  },
  studios: { solon: { name: "Solon" }, westlake: { name: "Westlake" } },
  "studios/solon/machineFit": {
    "m-leg-press": { machineId: "m-leg-press", studioId: "solon", rows },
    "m-abs": { machineId: "m-abs", studioId: "solon", rows },
  },
  machineTrends: {
    _summary: {},
    "m-gone": { machineId: "m-gone", clients: 1 },
    "m-leg-press": { machineId: "m-leg-press", fit: { clients: 99, studios: 1, cells: { "64|f": { "seat=6": 99 } }, builtAt: "last week" } },
  },
  kaizenReports: { _summary: {}, "m-retired": { machineId: "m-retired" } },
});

const quiet = () => undefined;

describe("the weekly job — machine trends plus machine fit", () => {
  it("writes a trend document for a machine with sets, and one for a machine that only has set-ups", async () => {
    const { db, store, deleted } = fakeDb(base());
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });

    const legPress = store.machineTrends["m-leg-press"] as { sets: number; fit: { clients: number; cells: Record<string, unknown> } };
    expect(legPress.sets).toBe(1);
    expect(legPress.fit.clients).toBe(8); // rebuilt, not last week's 99
    expect(legPress.fit.cells["64|f"]).toEqual({ "gap=0;seat=6": 3, "gap=0;seat=5": 3, "gap=0;seat=4": 2 });

    const abs = store.machineTrends["m-abs"] as { sets: number; load: unknown; fit: { clients: number } };
    expect(abs).toMatchObject({ sets: 0, clients: 0, load: null });
    expect(abs.fit.clients).toBe(8);

    expect(deleted).toContain("machineTrends/m-gone");
    const list = store.machineTrends._summary as { machines: Record<string, { fitClients?: number }> };
    expect(Object.keys(list.machines).sort()).toEqual(["m-abs", "m-leg-press"]);
    expect(list.machines["m-abs"].fitClients).toBe(8);
    expect(summary.fit).toEqual({ machines: 2, clients: 16, reports: 2, rowsSkipped: 0 });
  });

  it("uses every client for fit but only active ones for the trends", async () => {
    const { db, store } = fakeDb(base());
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });
    expect(summary.clientsRead).toBe(7);
    expect((store.kaizenReports["m-abs"] as { onFile: number }).onFile).toBe(8);
  });

  it("writes the administrators' reports, retires the ones nobody is set up on, and names nobody", async () => {
    const { db, store, deleted } = fakeDb(base());
    await runMachineTrends({ db, now: NOW, log: quiet });
    expect(Object.keys(store.kaizenReports).sort()).toEqual(["_summary", "m-abs", "m-leg-press"]);
    expect(deleted).toContain("kaizenReports/m-retired");
    const text = JSON.stringify(store.kaizenReports);
    for (const id of Object.keys(clients)) expect(text).not.toContain(`"${id}"`);
    expect((store.kaizenReports._summary as { machines: Record<string, unknown> }).machines["m-abs"]).toMatchObject({ onFile: 8 });
  });

  it("writes the performance watch per studio — a drop with its evidence, no name, and an empty document where there is nothing", async () => {
    const data = base();
    // c1 on the leg press at 100 lb: five earlier sets of ten, then four reps yesterday.
    // Milliseconds, because the fake store is a JSON round-trip and a Timestamp's methods would not survive it.
    const day = (n: number) => NOW.getTime() - n * 86_400_000;
    [30, 26, 22, 18, 14].forEach((n, i) => {
      data.exerciseLogs[`p${i}`] = { clientId: "c1", machineId: "m-leg-press", studioId: "solon", weight: 100, reps: 10, outcome: "performed", createdAt: day(n) };
    });
    data.exerciseLogs.p9 = { clientId: "c1", machineId: "m-leg-press", studioId: "solon", weight: 100, reps: 4, outcome: "performed", createdAt: day(1) };
    const { db, store } = fakeDb(data);
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });
    const solon = store["studios/solon/watch"].performance as { rows: Array<Record<string, unknown>>; clients: number; builtAt: string };
    expect(solon.rows).toHaveLength(1);
    expect(solon.rows[0]).toMatchObject({ clientId: "c1", machineId: "m-leg-press", weight: 100, reps: 4, medianReps: 10, priorSets: 5 });
    expect(solon.clients).toBe(1);
    expect(JSON.stringify(solon)).not.toContain("Female");
    expect(summary.watch).toEqual({ studios: 1, rows: 1 });
  });

  it("writes nothing on a dry run", async () => {
    const { db, written, deleted } = fakeDb(base());
    await runMachineTrends({ db, now: NOW, dryRun: true, log: quiet });
    expect(written).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("keeps last week's fit blocks and leaves the reports alone when the fit step cannot read", async () => {
    const lines: string[] = [];
    const { db, store, deleted } = fakeDb(base(), { failOn: "machineFit" });
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    expect(summary.fit).toBeNull();
    expect(lines.some((l) => l.includes("Machine fit step FAILED"))).toBe(true);
    expect((store.machineTrends["m-leg-press"] as { fit: { clients: number } }).fit.clients).toBe(99);
    expect(store.kaizenReports["m-retired"]).toBeDefined();
    expect(deleted).not.toContain("kaizenReports/m-retired");
    // The trends themselves still went out.
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Step 8: Openings (docs/rounds/2026-09-27-openings.md, the Sunday job's
 * step). NOW is Sunday Sep 20 2026, 3:00 AM Eastern: the window is the eight
 * Monday-to-Saturday weeks Jul 27 - Sep 19, all on summer time.
 * ------------------------------------------------------------------ */

const WINDOW_MONDAYS = ["2026-09-14", "2026-09-07", "2026-08-31", "2026-08-24", "2026-08-17", "2026-08-10", "2026-08-03", "2026-07-27"];
/** The studio's wall clock on a summer day, as an ISO instant (Eastern daylight time is UTC-4). */
const eastern = (day: string, hour: number, minute = 0) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour + 4, minute)).toISOString();
const daysOf = (month: string, last: number) => Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

/** Last Sunday's Westlake summary, marked so a test can tell it was kept. */
const LAST_WEEK = { v: 1, builtAt: "2026-09-13T07:00:00.000Z", tz: "America/New_York", row: 30, since: null, weeks: [], who: {}, agreed: {}, cells: {}, kept: "last week's" };

function withOpenings(): Record<string, Docs> {
  const data = base();
  data.studios = {
    westlake: { name: "Westlake", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyLocationId: 3 },
    solon: { name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957", mindbodyLocationId: 1 },
    // Deliberately without Mindbody, and one whose Site ID is blank: neither gets a document.
    sandbox: { name: "Sandbox", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyMode: "offline" },
    willoughby: { name: "Willoughby", timezone: "America/New_York" },
    "demo-studio": { name: "Demo Studio", timezone: "America/New_York", isDemo: true },
  };
  data.trainers = {
    "t-sam": { fullName: "Sam Lee", primaryHomeStudioId: "westlake", accessibleStudioIds: [], activeGuestStudioIds: [], mindbodyStaffId: "42", mindbody: { staffId: "42", siteId: "29068" } },
    "t-dana": { fullName: "Dana Demo", primaryHomeStudioId: "demo-studio", accessibleStudioIds: ["demo-studio"], activeGuestStudioIds: [], isDemo: true },
  };
  // Sam takes clients Mondays 8:00 - 9:00, agreed on Jul 1.
  data["studios/westlake/standingWeeks"] = {
    "uid-sam": {
      studioId: "westlake",
      trainerUid: "uid-sam",
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      proposed: null,
      final: { hours: [{ weekday: 1, from: "08:00", to: "09:00" }], regulars: [] },
      finalAt: "2026-07-01T14:00:00.000Z",
      away: [],
    },
  };
  // Every day of the window read in full at Westlake; nothing recorded at Solon.
  data["studios/westlake/scheduleCoverage"] = {
    "2026-07": { days: daysOf("2026-07", 31) },
    "2026-08": { days: daysOf("2026-08", 31) },
    "2026-09": { days: daysOf("2026-09", 20) },
  };
  data["studios/westlake/watch"] = { openings: { ...LAST_WEEK } };
  // Someone at home at Westlake, so the performance watch writes Westlake's document too.
  data.clients = { ...clients, w1: { isActive: true, height: "5'10\"", gender: "Male", homeStudioId: "westlake" } };
  data.schedules = {};
  WINDOW_MONDAYS.forEach((day, i) => {
    const slot = { startTime: eastern(day, 8), endTime: eastern(day, 8, 30), status: "Scheduled", serviceName: "Strength 30", source: "MindBody" };
    data.schedules[`w${i}`] = { ...slot, studioId: "westlake", clientId: `wc${i}`, clientName: `Westlake Client ${i}`, trainerId: "t-sam", trainerName: "Sam Lee" };
    data.schedules[`s${i}`] = { ...slot, studioId: "solon", clientId: `sc${i}`, clientName: `Solon Client ${i}`, trainerName: "Somebody" };
    data.schedules[`d${i}`] = { ...slot, studioId: "demo-studio", clientId: `dc${i}`, clientName: `Demo Client ${i}`, trainerId: "t-dana", trainerName: "Dana Demo", isDemo: true };
  });
  // A Mindbody "Unavailable" block in Sam's 8:30 on the newest Monday: never a booking, but it takes Sam out then.
  data.schedules.block = { studioId: "westlake", clientName: "Unavailable", trainerId: "t-sam", trainerName: "Sam Lee", startTime: eastern(WINDOW_MONDAYS[0], 8, 30), endTime: eastern(WINDOW_MONDAYS[0], 9), status: "Scheduled", serviceName: "Unavailable", source: "MindBody" };
  return data;
}

const openingsOf = (store: Record<string, Docs>, studioId: string) => store[`studios/${studioId}/watch`]?.openings as Record<string, unknown> | undefined;

describe("the weekly job — step 8, Openings", () => {
  it("writes one document per linked studio (the Demo studio included), none where Mindbody isn't linked, and only after everything else", async () => {
    const { db, store, written } = fakeDb(withOpenings());
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });
    expect(summary.openings).toEqual({ studios: 3, written: 3, skipped: 0 });

    const westlake = readSummary(openingsOf(store, "westlake"));
    expect(westlake.state).toBe("ok");
    if (westlake.state !== "ok") return;
    expect(westlake.summary.builtAt).toBe(NOW.toISOString());
    expect(westlake.summary.weeks.map((w) => w.m)).toEqual(WINDOW_MONDAYS);
    expect(usualWeek(westlake.summary).weeksCounted).toBe(8);
    // Sam's 8:00 was booked every Monday. At 8:30 nobody was booked; on the newest Monday his Unavailable
    // block took him out (nobody in, so nothing is stored and it reads back "out"), on the others he was in and free.
    expect(westlake.summary.cells["1-0800"]["0"].s).toBe("f");
    expect(westlake.summary.cells["1-0830"]["0"]).toBeUndefined();
    expect(cellFor(westlake.summary, "1-0830", 0)).toMatchObject({ word: "out", booked: 0, inKeys: [] });
    expect(westlake.summary.cells["1-0830"]["1"]).toEqual({ s: "n", i: ["0"] });
    expect(Object.values(westlake.summary.who).map((w) => w.n)).toEqual(["Sam Lee"]);

    // Solon: nothing recorded as read in full, so nothing counts, but the document is there.
    const solon = readSummary(openingsOf(store, "solon"));
    expect(solon.state).toBe("ok");
    if (solon.state === "ok") expect(usualWeek(solon.summary).weeksCounted).toBe(0);

    // The Demo studio: its days holding a demo booking count without the record (the seeder wrote them; this fixture books every Monday), and the realm rule holds both ways.
    const demo = readSummary(openingsOf(store, "demo-studio"));
    expect(demo.state).toBe("ok");
    if (demo.state === "ok") expect(usualWeek(demo.summary).weeksCounted).toBe(8);
    expect(JSON.stringify(openingsOf(store, "demo-studio"))).not.toContain("Sam Lee");
    expect(JSON.stringify(openingsOf(store, "westlake"))).not.toContain("Dana");

    expect(openingsOf(store, "sandbox")).toBeUndefined();
    expect(openingsOf(store, "willoughby")).toBeUndefined();

    // No client names or ids.
    const text = JSON.stringify([openingsOf(store, "westlake"), openingsOf(store, "solon"), openingsOf(store, "demo-studio")]);
    for (const word of ["Client", "wc0", "sc0", "dc0"]) expect(text).not.toContain(word);

    // Its own writes, after the job's main commit.
    const firstOpenings = written.findIndex((p) => p.endsWith("/watch/openings"));
    expect(firstOpenings).toBeGreaterThan(written.indexOf("machineTrends/_summary"));
    expect(firstOpenings).toBeGreaterThan(written.indexOf("studios/westlake/watch/performance"));
  });

  it("reads each studio's bookings by studio and a start-time range over the window, on the studio's own clock", async () => {
    const { db, queries } = fakeDb(withOpenings());
    await runMachineTrends({ db, now: NOW, log: quiet });
    const schedules = queries.filter((q) => q.path === "schedules");
    // Three studios, each exactly (studioId ==, startTime >=, startTime <=): the existing (studioId, startTime) index.
    expect(schedules.map((q) => `${q.field} ${q.op}`)).toEqual(Array.from({ length: 3 }, () => ["studioId ==", "startTime >=", "startTime <="]).flat());
    expect(schedules.filter((q) => q.field === "studioId").map((q) => q.value)).toEqual(["demo-studio", "solon", "westlake"]);
    const range = schedules.filter((q) => q.field === "startTime").map((q) => (q.value as { toDate: () => Date }).toDate().toISOString());
    // From Monday Jul 27's midnight to the last moment of Saturday Sep 19, Eastern.
    expect(range.slice(0, 2)).toEqual(["2026-07-27T04:00:00.000Z", "2026-09-20T03:59:59.999Z"]);
    // Nothing else the step asks is a query: the rest are reads by id or of a small collection.
    expect(queries.every((q) => q.path === "schedules" || q.path === "exerciseLogs")).toBe(true);
  });

  it("lets nothing undefined reach a write, whatever the rows leave out", async () => {
    const data = withOpenings();
    // A booking with no end, no trainer and no service; a week with no name, no agreement day and no days away; a trainer with no name.
    data.schedules.bare = { studioId: "westlake", clientName: "Someone", startTime: eastern(WINDOW_MONDAYS[1], 10), status: "Cancelled" };
    data["studios/westlake/standingWeeks"]["uid-pat"] = { studioId: "westlake", trainerId: "t-pat", final: { hours: [{ weekday: 2, from: "07:00", to: "12:00" }], regulars: [] } };
    data.trainers["t-pat"] = { primaryHomeStudioId: "westlake" };
    const { db, store, undefinedAt } = fakeDb(data);
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });
    expect(undefinedAt).toEqual([]);
    expect(summary.openings).toEqual({ studios: 3, written: 3, skipped: 0 });
    expect(readSummary(openingsOf(store, "westlake")).state).toBe("ok");
  });

  it("skips a studio whose document would be too big, keeps its last week's, and still writes the performance watch and the other studios", async () => {
    const data = withOpenings();
    // A name no document can carry: Sam is named on Westlake's summary, so it would pass the ceiling.
    (data.trainers["t-sam"] as { fullName: string }).fullName = "S".repeat(600 * 1024);
    const lines: string[] = [];
    const { db, store } = fakeDb(data);
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    expect(openingsOf(store, "westlake")).toEqual(LAST_WEEK);
    expect(store["studios/westlake/watch"].performance).toBeDefined();
    expect(readSummary(openingsOf(store, "solon")).state).toBe("ok");
    expect(summary.openings).toEqual({ studios: 3, written: 2, skipped: 1 });
    expect(lines.some((l) => l.includes("Westlake") && l.includes("SKIPPED") && l.includes("ceiling"))).toBe(true);
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
  });

  it("keeps last week's documents, and the trends, when a studio's reads fail", async () => {
    const lines: string[] = [];
    const { db, store } = fakeDb(withOpenings(), { failOn: "standingWeeks" });
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    // Without the standing weeks every agreed week would be closed: the studio is left as it was.
    expect(openingsOf(store, "westlake")).toEqual(LAST_WEEK);
    expect(summary.openings).toEqual({ studios: 3, written: 0, skipped: 3 });
    expect(lines.some((l) => l.includes("Westlake: SKIPPED, a read failed"))).toBe(true);
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
    expect(store["studios/westlake/watch"].performance).toBeDefined();
  });

  it("says the summary couldn't be built, not that a read failed, when the fold throws on a row, and keeps that studio's last week's", async () => {
    const data = withOpenings();
    // A trainer name that isn't text: the reads come back, the fold can't handle the row.
    data.schedules.odd = { studioId: "westlake", clientId: "wo", clientName: "Odd Client", trainerName: 42, startTime: eastern(WINDOW_MONDAYS[2], 11), status: "Scheduled" };
    const lines: string[] = [];
    const { db, store } = fakeDb(data);
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    expect(openingsOf(store, "westlake")).toEqual(LAST_WEEK);
    expect(readSummary(openingsOf(store, "solon")).state).toBe("ok");
    expect(summary.openings).toEqual({ studios: 3, written: 2, skipped: 1 });
    expect(lines.some((l) => l.includes("Westlake: SKIPPED, the summary couldn't be built") && l.includes("last week's is kept"))).toBe(true);
    expect(lines.some((l) => l.includes("a read failed"))).toBe(false);
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
  });

  it("keeps last week's documents, and the trends, when the step fails as a whole", async () => {
    const lines: string[] = [];
    const { db, store } = fakeDb(withOpenings(), { failOn: "trainers" });
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    expect(summary.openings).toBeNull();
    expect(lines.some((l) => l.includes("Openings step FAILED"))).toBe(true);
    expect(openingsOf(store, "westlake")).toEqual(LAST_WEEK);
    expect(openingsOf(store, "solon")).toBeUndefined();
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
    expect(store["studios/westlake/watch"].performance).toBeDefined();
    expect(summary.watch).not.toBeNull();
  });

  it("keeps last week's documents, and the trends, when its own write is refused", async () => {
    const lines: string[] = [];
    const { db, store } = fakeDb(withOpenings(), { failCommitOn: "watch/openings" });
    const summary = await runMachineTrends({ db, now: NOW, log: (l) => lines.push(l) });
    expect(openingsOf(store, "westlake")).toEqual(LAST_WEEK);
    expect(openingsOf(store, "solon")).toBeUndefined();
    expect(summary.openings).toEqual({ studios: 3, written: 0, skipped: 3 });
    expect(lines.some((l) => l.includes("FAILED; last week's is kept"))).toBe(true);
    expect((store.machineTrends["m-leg-press"] as { sets: number }).sets).toBe(1);
    expect(store["studios/westlake/watch"].performance).toBeDefined();
  });

  it("writes nothing on a dry run, and says what it would have written", async () => {
    const { db, written, deleted } = fakeDb(withOpenings());
    const summary = await runMachineTrends({ db, now: NOW, dryRun: true, log: quiet });
    expect(written).toEqual([]);
    expect(deleted).toEqual([]);
    expect(summary.openings).toEqual({ studios: 3, written: 3, skipped: 0 });
  });

  it("makes six reads a studio and two a run, however many bookings there are (the cost check in openings-step.ts)", async () => {
    const data = withOpenings();
    // Two hundred more bookings at Westlake change what the query returns, never how many reads it takes.
    for (let i = 0; i < 200; i += 1) {
      const day = WINDOW_MONDAYS[i % 8];
      data.schedules[`more${i}`] = { studioId: "westlake", clientId: `m${i}`, clientName: `More ${i}`, trainerName: "Somebody Else", startTime: eastern(day, 10 + (i % 8)), status: "Scheduled" };
    }
    const { db, reads } = fakeDb(data);
    await runMachineTrends({ db, now: NOW, log: quiet });
    const openingsReads = reads.filter((p) => p === "trainers" || p === "schedules" || /^studios\/[^/]+\/(standingWeeks$|scheduleCoverage\/|watch\/openings$)/.test(p));
    expect(openingsReads.filter((p) => p === "trainers")).toHaveLength(1);
    expect(openingsReads.filter((p) => p === "schedules")).toHaveLength(3);
    for (const studio of ["demo-studio", "solon", "westlake"]) {
      expect(openingsReads.filter((p) => p.startsWith(`studios/${studio}/`)).sort()).toEqual([
        `studios/${studio}/scheduleCoverage/2026-07`,
        `studios/${studio}/scheduleCoverage/2026-08`,
        `studios/${studio}/scheduleCoverage/2026-09`,
        `studios/${studio}/standingWeeks`,
        `studios/${studio}/watch/openings`,
      ]);
    }
    // Nothing of the unlinked studios is read beyond the studios list itself.
    expect(reads.some((p) => /^studios\/(sandbox|willoughby)\/(standingWeeks|scheduleCoverage|watch)/.test(p))).toBe(false);
  });

  it("asks Mindbody nothing: the step imports nothing of Mindbody's and fetches nothing", () => {
    const source = readFileSync(join(__dirname, "../../../server/openings-step.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*mindbody/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("counts none of a month of the record it can't read, and still writes the studio from the rest", async () => {
    const { db, store } = fakeDb(withOpenings(), { failOn: "scheduleCoverage/2026-08" });
    const summary = await runMachineTrends({ db, now: NOW, log: quiet });
    expect(summary.openings).toEqual({ studios: 3, written: 3, skipped: 0 });
    const westlake = readSummary(openingsOf(store, "westlake"));
    expect(westlake.state).toBe("ok");
    if (westlake.state !== "ok") return;
    // The weeks of Jul 27, Aug 31, Sep 7 and Sep 14 still have a counted day; the four in August don't.
    expect(usualWeek(westlake.summary).weeksCounted).toBe(4);
    expect(westlake.summary.weeks[3].d["1"]).toEqual({ n: 1, x: "r" });
  });
});

describe("the Openings report (scripts/openings-report.ts)", () => {
  it("counts each week's rows, Unavailable blocks, cancellations and webhook rows, from the step's own reads, and writes nothing", async () => {
    const data = withOpenings();
    (data.schedules.w0 as Record<string, unknown>).mindbodyEventAt = "2026-09-10T10:00:00.000Z";
    // Cancelled two hours before Monday Sep 7's 9:00: late.
    data.schedules.late = {
      studioId: "westlake",
      clientId: "wl",
      clientName: "Late Client",
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      startTime: eastern(WINDOW_MONDAYS[1], 9),
      endTime: eastern(WINDOW_MONDAYS[1], 9, 30),
      status: "Cancelled",
      cancelledAt: eastern(WINDOW_MONDAYS[1], 7),
    };
    data.schedules.sunday = { studioId: "westlake", clientName: "Sunday Client", trainerName: "Sam Lee", startTime: eastern("2026-09-13", 9), status: "Scheduled" };
    const { db, written } = fakeDb(data);
    const { linked, unlinked } = await readOpeningsStudios(db, ["westlake", "sandbox"]);
    expect(linked.map((s) => s.id)).toEqual(["westlake"]);
    expect(unlinked.map((s) => s.id)).toEqual(["sandbox"]);
    const read = await readStudio(db, linked[0], await readOpeningsTrainers(db), NOW);
    const report = openingsReport(read, buildDocument(read.input));

    expect(report).toMatchObject({ first: "2026-07-27", last: "2026-09-19", weeksCounted: 8, daysInWindow: 48, daysRecorded: 48, daysCantTell: 0, refused: null, previousState: "ok" });
    expect(report).toMatchObject({ rows: 11, sundayRows: 1, unreadable: 0, unavailable: 1, webhook: 1 });
    expect(report.cancelled).toEqual({ early: 0, late: 1, afterStart: 0, unstamped: 0 });
    expect(report.weeks[0]).toMatchObject({ monday: "2026-09-14", rows: 2, unavailable: 1, webhook: 1 });
    expect(report.weeks[1].cancelled.late).toBe(1);
    // Monday Sep 14 as the summary has it: one live booking (the block isn't one), counted and judged.
    expect(report.weeks[0].days[0]).toEqual({ day: "2026-09-14", weekday: 1, booked: 1, status: "judged", recorded: true });
    expect(report.months).toEqual([
      { month: "2026-07", days: 31 },
      { month: "2026-08", days: 31 },
      { month: "2026-09", days: 20 },
    ]);
    expect(report.recordUsed).toBe(true);
    expect(written).toEqual([]);
  });

  it("says the Demo studio doesn't use the whole-read record, rather than '0 days read in full'", async () => {
    const { db, written } = fakeDb(withOpenings());
    const { linked } = await readOpeningsStudios(db, ["demo-studio"]);
    const read = await readStudio(db, linked[0], await readOpeningsTrainers(db), NOW);
    const report = openingsReport(read, buildDocument(read.input));
    // Nothing pulls Demo's bookings, so there is no record, and the fold doesn't ask it.
    expect(report.recordUsed).toBe(false);
    expect(report.daysRecorded).toBe(0);
    // Every Monday holds a seeded booking and counts, the empty record notwithstanding.
    expect(report.weeks.map((w) => w.days[0].status)).toEqual(Array.from({ length: 8 }, () => "not-agreed"));
    // The seeder's rows carry no webhook stamp.
    expect(report).toMatchObject({ rows: 8, webhook: 0 });
    expect(written).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Job memory (Oct 1 2026): the window's sets are read with only
 * LOG_FIELDS. A field the trends or the watch read but the list leaves out
 * would be silently missing from every set, so this holds that a set cut
 * down to LOG_FIELDS gives the same trends and the same drops as the whole
 * document, with every field either rule reads present and junk beside it.
 * ------------------------------------------------------------------ */

describe("the weekly job reads only the fields it uses", () => {
  it("gives the same trends and drops from sets cut down to LOG_FIELDS as from whole ones", () => {
    const DAY = 86_400_000;
    const whole: Array<TrendLogInput & PerformanceLogInput & Record<string, unknown>> = [];
    for (let i = 0; i < 600; i += 1) {
      whole.push({
        clientId: `c${i % 23}`,
        machineId: `m${i % 4}`,
        sessionId: `s${Math.floor(i / 5)}`,
        studioId: i % 7 === 0 ? null : i % 11 === 0 ? "demo-studio" : "solon",
        homeStudioId: i % 5 === 0 ? "westlake" : null,
        hostedAtStudioId: i % 13 === 0 ? "demo-studio" : null,
        clientHomeStudioId: i % 17 === 0 ? "demo-studio" : null,
        isDemo: i % 19 === 0,
        outcome: i % 9 === 0 ? "practice" : i % 10 === 0 ? null : "performed",
        reps: i % 6 === 0 ? null : i % 29 === 0 ? 3 : 10,
        seconds: i % 6 === 0 ? 40 : null,
        outcomeReps: i % 6 === 0 ? 8 : null,
        outcomeTut: i % 12 === 0 ? 60 : null,
        isTSC: i % 31 === 0,
        isStaticHold: i % 37 === 0,
        weight: i % 8 === 0 ? "100 lb" : 100,
        machineSettings: { Seat: String(3 + (i % 3)), "Chest Pad": i % 2 ? "2.0" : "02" },
        createdAt: NOW.getTime() - (600 - i) * (DAY / 8),
        date: new Date(NOW.getTime() - (600 - i) * (DAY / 8)).toISOString().slice(0, 10),
        // What the job never reads.
        notes: "a long note ".repeat(20),
        trainerName: "Sam Lee",
        repQuality: 2,
      });
    }
    const cut = whole.map((l) => Object.fromEntries(LOG_FIELDS.filter((f) => f in l).map((f) => [f, l[f]])) as TrendLogInput & PerformanceLogInput);
    const clients = new Map<string, TrendClientInput>(Array.from({ length: 23 }, (_, i) => [`c${i}`, { id: `c${i}`, height: "5'8\"", homeStudioId: "solon", isActive: true }]));
    const homes = new Map<string, string | null>(Array.from({ length: 23 }, (_, i) => [`c${i}`, i % 2 ? "solon" : null]));
    expect(JSON.stringify(buildMachineTrends(cut, clients))).toBe(JSON.stringify(buildMachineTrends(whole, clients)));
    const drops = performanceDrops(whole, { now: NOW, clientHomes: homes });
    expect(Object.keys(drops).length).toBeGreaterThan(0);
    expect(JSON.stringify(performanceDrops(cut, { now: NOW, clientHomes: homes }))).toBe(JSON.stringify(drops));
  });

  it("names every field of a set that the trends, the outcome rule, the Demo rule and the watch read", () => {
    // The interfaces' own fields, and the Demo rule's studio fields (demo-mode/is-demo.ts).
    const read = ["clientId", "machineId", "sessionId", "weight", "machineSettings", "studioId", "homeStudioId", "clientHomeStudioId", "hostedAtStudioId", "isDemo", "outcome", "reps", "seconds", "outcomeReps", "outcomeTut", "isTSC", "isStaticHold", "createdAt", "date"];
    expect([...LOG_FIELDS].sort()).toEqual([...read].sort());
  });
});
