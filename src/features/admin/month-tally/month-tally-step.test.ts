/**
 * The night's month tally (server/month-tally-step.ts, speed round, Oct 5
 * 2026), against a Firestore of plain maps: what it reads, what it writes,
 * that it counts closed days only, and that a failure in it never takes the
 * nightly renewals job down.
 */
import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

vi.mock("../../../../server/mindbody-client.ts", () => ({
  mindbodyConfigured: () => false,
  pullClientMaster: vi.fn(),
  pullClientCommercial: vi.fn(),
}));

import { MONTH_TALLY_FIELDS, runMonthTally } from "../../../../server/month-tally-step";
import { runRenewals } from "../../../../server/renewals-job";
import { decodeMonth, hoursFromNightAndLive, usableHoursDoc, usableSessionsDoc, type HoursMonthDoc } from "./month-tally";
import type { WorkoutSession } from "../../../types";

type Docs = Record<string, Record<string, unknown>>;
type Query = { path: string; wheres: Array<[string, string, unknown]>; orders: Array<[string, string]>; select: string[] | null };

function fakeDb(collections: Record<string, Docs>, opts: { failSessionsByStudio?: boolean } = {}) {
  const store = collections;
  const queries: Query[] = [];
  const writes: string[] = [];
  const split = (path: string) => {
    const at = path.lastIndexOf("/");
    return { col: path.slice(0, at), id: path.slice(at + 1) };
  };
  const write = (path: string, data: Record<string, unknown>, merge: boolean) => {
    const { col, id } = split(path);
    writes.push(path);
    store[col] ??= {};
    store[col][id] = merge ? { ...(store[col][id] ?? {}), ...data } : { ...data };
  };
  const ref = (path: string) => ({
    path,
    get: async () => {
      const { col, id } = split(path);
      const data = store[col]?.[id];
      return { exists: !!data, id, data: () => data, get: (f: string) => (data as Record<string, unknown> | undefined)?.[f] };
    },
    set: async (data: Record<string, unknown>, o?: { merge?: boolean }) => write(path, data, Boolean(o?.merge)),
    update: async (data: Record<string, unknown>) => write(path, data, true),
  });
  const cmp = (a: unknown, b: unknown) => {
    const n = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number));
    return n(a) - n(b);
  };
  const collection = (path: string) => {
    const build = (q: Query) => {
      const query: any = {
        where: (f: string, op: string, v: unknown) => build({ ...q, wheres: [...q.wheres, [f, op, v]] }),
        orderBy: (f: string, dir = "asc") => build({ ...q, orders: [...q.orders, [f, dir]] }),
        limit: () => query,
        select: (...fields: string[]) => build({ ...q, select: fields }),
        get: async () => {
          queries.push(q);
          if (opts.failSessionsByStudio && path === "sessions" && q.wheres.some(([f]) => f === "hostedAtStudioId")) {
            throw new Error("the read was refused");
          }
          const docs = Object.entries(store[path] ?? {}).filter(([, data]) =>
            q.wheres.every(([f, op, v]) =>
              op === "==" ? data[f] === v : op === "in" ? (v as unknown[]).includes(data[f]) : op === ">=" && f === "createdAt" ? cmp(data[f], v) >= 0 : true,
            ),
          );
          const out = docs.map(([id, data]) => {
            const shown = q.select ? Object.fromEntries(Object.entries(data).filter(([k]) => q.select!.includes(k))) : data;
            return { id, ref: ref(`${path}/${id}`), data: () => shown, get: (f: string) => shown[f] };
          });
          return { docs: out, size: out.length, empty: out.length === 0 };
        },
      };
      return query;
    };
    return build({ path, wheres: [], orders: [], select: null });
  };
  const db = {
    collection,
    doc: ref,
    getAll: async (...refs: Array<{ path: string }>) => Promise.all(refs.map((r) => ref(r.path).get())),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>, o?: { merge?: boolean }) => ops.push(() => write(r.path, data, Boolean(o?.merge))),
        update: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => write(r.path, data, true)),
        delete: (r: { path: string }) => ops.push(() => delete store[split(r.path).col]?.[split(r.path).id]),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db: db as never, store, queries, writes };
}

const NOW = new Date("2026-10-05T06:30:00Z"); // 2:30 AM Eastern, Monday Oct 5
const eastern = (day: string, hm: string) => Timestamp.fromDate(new Date(`${day}T${hm}:00-04:00`));
const session = (day: string, hm: string, extra: Record<string, unknown> = {}) => ({
  hostedAtStudioId: "edoras",
  clientId: "eowyn",
  status: "Completed",
  trainerId: "t1",
  date: day,
  createdAt: eastern(day, hm),
  startTime: eastern(day, hm),
  endTime: eastern(day, hm.replace(/:(\d\d)$/, (_, m) => `:${String(Number(m) + 20).padStart(2, "0")}`)),
  notes: "A long note that the tally never needs to keep, only that there was one.",
  ...extra,
});

function company() {
  return {
    studios: { edoras: { name: "Edoras", timezone: "America/New_York", journeyCutoverDate: "2026-06-01" } },
    machines: {},
    clients: { eowyn: { firstName: "Éowyn", lastName: "Rohan", isActive: true, homeStudioId: "edoras" } },
    schedules: {},
    sessions: {
      sep: session("2026-09-30", "10:00"),
      oct: session("2026-10-02", "10:00", { trainerId: "t2" }),
      // Sunday's session, logged at 2:28 am Monday, while the night was about to read.
      lateSunday: session("2026-10-04", "10:00", { createdAt: Timestamp.fromDate(new Date("2026-10-05T06:28:00Z")) }),
      // Elsewhere: never read here.
      away: session("2026-10-02", "11:00", { hostedAtStudioId: "helms-deep" }),
      // Long before the months kept.
      old: session("2026-01-15", "10:00"),
    },
  };
}

describe("the night's month tally", () => {
  it("reads the sessions trained at one studio once, with only the fields it sums, and writes ten documents", async () => {
    const { db, store, queries } = fakeDb(company());
    const lines: string[] = [];
    const result = await runMonthTally({ db, studio: { id: "edoras", name: "Edoras", tz: "America/New_York", today: "2026-10-05" }, now: NOW, dryRun: false, log: (l) => lines.push(l) });

    expect(queries).toHaveLength(1);
    expect(queries[0].wheres.map(([f, op]) => `${f} ${op}`)).toEqual(["hostedAtStudioId ==", "createdAt >="]);
    expect(queries[0].select).toEqual([...MONTH_TALLY_FIELDS]);
    expect(result.monthsWritten).toBe(5);

    const watch = store["studios/edoras/watch"];
    expect(Object.keys(watch).sort()).toEqual([
      "hours-2026-06", "hours-2026-07", "hours-2026-08", "hours-2026-09", "hours-2026-10",
      "sessions-2026-06", "sessions-2026-07", "sessions-2026-08", "sessions-2026-09", "sessions-2026-10",
    ]);
    const oct = watch["hours-2026-10"] as unknown as HoursMonthDoc;
    expect(usableHoursDoc(oct, "2026-10", "2026-10-05")).toBe(true);
    expect(oct.throughDay).toBe("2026-10-04");
    // Closed days only: Oct 2 and Sunday's late log; never another studio's.
    expect(oct.trainers.map((t) => [t.key, Object.values(t.weeks).reduce((a, b) => a + b, 0)]).sort()).toEqual([["t1", 1], ["t2", 1]]);
    // Logged after the live read starts: listed, so the live read leaves it out.
    expect(oct.lateIds).toEqual(["lateSunday"]);
    expect(watch["hours-2026-10"].computedAt).toBeDefined();

    const sep = watch["sessions-2026-09"];
    expect(usableSessionsDoc(sep, "2026-09", "2026-10-05")).toBe(true);
    expect(decodeMonth(sep)).toHaveLength(1);
    expect(JSON.stringify(sep)).not.toContain("long note");
    expect(lines.some((l) => l.startsWith("Edoras: the month tally counted 3 sessions over 5 months, to 2026-10-04"))).toBe(true);
  });

  it("adds today from the live read, and the late Sunday session once", async () => {
    const { db, store } = fakeDb(company());
    await runMonthTally({ db, studio: { id: "edoras", name: "Edoras", tz: "America/New_York", today: "2026-10-05" }, now: NOW, dryRun: false, log: () => {} });
    const doc = store["studios/edoras/watch"]["hours-2026-10"] as unknown as HoursMonthDoc;
    const live = [
      { id: "lateSunday", ...session("2026-10-04", "10:00", { createdAt: Timestamp.fromDate(new Date("2026-10-05T06:28:00Z")) }) },
      { id: "today", ...session("2026-10-05", "09:00") },
    ] as unknown as WorkoutSession[];
    const tally = hoursFromNightAndLive(doc, live, { sessionMinutes: 30, tz: "America/New_York" });
    expect(tally.totals.month.sessions).toBe(3);
  });

  it("writes nothing on a dry run", async () => {
    const { db, writes } = fakeDb(company());
    const result = await runMonthTally({ db, studio: { id: "edoras", name: "Edoras", tz: "America/New_York", today: "2026-10-05" }, now: NOW, dryRun: true, log: () => {} });
    expect(writes).toEqual([]);
    expect(result.monthsWritten).toBe(0);
  });

  it("runs as step 6 of the nightly job, and a failure in it leaves the rest of the night standing", async () => {
    const ok = fakeDb(company());
    const summary = await runRenewals({ db: ok.db, now: NOW, noPulls: true, log: () => {} });
    expect(summary.monthTally).toEqual({ studios: 1, sessionsRead: 3, failures: 0 });
    expect(ok.store["studios/edoras/watch"]["hours-2026-10"]).toBeDefined();

    const bad = fakeDb(company(), { failSessionsByStudio: true });
    const lines: string[] = [];
    const after = await runRenewals({ db: bad.db, now: NOW, noPulls: true, log: (l) => lines.push(l) });
    expect(after.monthTally).toEqual({ studios: 0, sessionsRead: 0, failures: 1 });
    expect(after.studios).toBe(1);
    expect(bad.store.clients.eowyn.renewal).toBeDefined();
    expect(lines.some((l) => l.startsWith("Edoras: the month tally failed"))).toBe(true);
  });
});
