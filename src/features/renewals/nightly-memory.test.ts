/**
 * The nightly job, a studio at a time (job memory, Oct 1 2026). Against a
 * Firestore of plain maps that records every query and honours `==` and `in`
 * (it ignores ranges and order, which the job puts right itself):
 *
 *   - a client's bookings and workouts are read by client, at most thirty a
 *     query, on the (clientId, startTime), (clientId, date DESC) and
 *     (clientId, createdAt DESC) indexes in firestore.indexes.json, and no
 *     query reads the bookings or the workouts of the whole company;
 *   - a cross-training client's visit at another studio is still hers, in
 *     whatever order a read returns her rows;
 *   - the log says the heap's peak after each studio.
 *
 * That the job writes exactly what it wrote before the change was checked
 * against a copy of the old job on generated companies (the round's notes in
 * docs/KNOWN-TRAPS.md, "Jobs read per studio with select").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

vi.mock("../../../server/mindbody-client.ts", () => ({
  mindbodyConfigured: () => false,
  pullClientMaster: vi.fn(),
  pullClientCommercial: vi.fn(),
}));

import { runRenewals } from "../../../server/renewals-job";

type Docs = Record<string, Record<string, unknown>>;
type Query = { path: string; wheres: Array<[string, string, unknown]>; orders: Array<[string, string]>; limit: number | null };

function fakeDb(collections: Record<string, Docs>, opts: { reverse?: boolean } = {}) {
  const store = collections;
  const queries: Query[] = [];
  const split = (path: string) => {
    const at = path.lastIndexOf("/");
    return { col: path.slice(0, at), id: path.slice(at + 1) };
  };
  const ref = (path: string) => ({
    path,
    get: async () => {
      const { col, id } = split(path);
      const data = store[col]?.[id];
      return { exists: !!data, id, data: () => data, get: (f: string) => (data as Record<string, unknown> | undefined)?.[f] };
    },
    set: async (data: Record<string, unknown>) => write(path, data),
    update: async (data: Record<string, unknown>) => write(path, data),
  });
  const write = (path: string, data: Record<string, unknown>) => {
    const { col, id } = split(path);
    store[col] ??= {};
    store[col][id] = { ...(store[col][id] ?? {}), ...data };
  };
  const collection = (path: string) => {
    const build = (q: Query) => {
      const query = {
        where: (f: string, op: string, v: unknown) => build({ ...q, wheres: [...q.wheres, [f, op, v]] }),
        orderBy: (f: string, dir = "asc") => build({ ...q, orders: [...q.orders, [f, dir]] }),
        limit: (n: number) => build({ ...q, limit: n }),
        select: () => query,
        get: async () => {
          queries.push(q);
          let docs = Object.entries(store[path] ?? {}).filter(([, data]) =>
            q.wheres.every(([f, op, v]) => (op === "==" ? data[f] === v : op === "in" ? (v as unknown[]).includes(data[f]) : true)),
          );
          if (opts.reverse) docs = docs.reverse();
          const out = docs.map(([id, data]) => ({ id, ref: ref(`${path}/${id}`), data: () => data, get: (f: string) => data[f] }));
          return { docs: out, size: out.length, empty: out.length === 0 };
        },
      };
      return query;
    };
    return build({ path, wheres: [], orders: [], limit: null });
  };
  const db = {
    collection,
    doc: ref,
    getAll: async (...refs: Array<{ path: string }>) => Promise.all(refs.map((r) => ref(r.path).get())),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => write(r.path, data)),
        update: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => write(r.path, data)),
        delete: (r: { path: string }) => ops.push(() => delete store[split(r.path).col]?.[split(r.path).id]),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db: db as never, store, queries };
}

const NOW = new Date("2026-09-28T06:30:00Z"); // 2:30 AM Eastern, Monday
const eastern = (day: string, hm: string) => Timestamp.fromDate(new Date(`${day}T${hm}:00-04:00`));

function company(clientsAtEdoras: number) {
  const clients: Docs = {};
  for (let i = 0; i < clientsAtEdoras; i += 1) clients[`e${String(i).padStart(3, "0")}`] = { firstName: `E${i}`, lastName: "Rohan", isActive: true, homeStudioId: "edoras" };
  clients.hama = { firstName: "Háma", lastName: "Rohan", isActive: true, homeStudioId: "helms-deep" };
  return {
    studios: {
      edoras: { name: "Edoras", timezone: "America/New_York", journeyCutoverDate: "2026-06-01" },
      "helms-deep": { name: "Helm's Deep", timezone: "America/New_York", journeyCutoverDate: "2026-06-01" },
    },
    machines: {},
    clients,
    schedules: {
      // e000 trains at Edoras, and once at Helm's Deep: the later visit is at the other studio.
      "b-1": { clientId: "e000", studioId: "edoras", startTime: eastern("2026-09-21", "10:00"), endTime: eastern("2026-09-21", "10:30"), status: "Scheduled", trainerId: "t1" },
      "a-2": { clientId: "e000", studioId: "helms-deep", startTime: eastern("2026-09-24", "10:00"), endTime: eastern("2026-09-24", "10:30"), status: "Scheduled", trainerId: "t2" },
      "c-3": { clientId: "hama", studioId: "helms-deep", startTime: eastern("2026-09-22", "09:00"), endTime: eastern("2026-09-22", "09:30"), status: "Scheduled", trainerId: "t2" },
    },
    sessions: {
      s1: { clientId: "e000", status: "Completed", hostedAtStudioId: "edoras", date: "2026-09-21", startTime: "2026-09-21T14:00:00.000Z", createdAt: eastern("2026-09-21", "10:30") },
      s2: { clientId: "e000", status: "Completed", hostedAtStudioId: "helms-deep", date: "2026-09-24", startTime: "2026-09-24T14:00:00.000Z", createdAt: eastern("2026-09-24", "10:30") },
    },
  };
}

describe("the nightly job reads a studio at a time", () => {
  it("reads bookings and workouts thirty clients a query, on indexes that exist, and never the whole company's", async () => {
    const { db, queries } = fakeDb(company(70));
    const lines: string[] = [];
    await runRenewals({ db, now: NOW, noPulls: true, log: (l) => lines.push(l) });

    const shape = (q: Query) => [...q.wheres.map(([f, op]) => `${f} ${op}`), ...q.orders.map(([f, d]) => `order ${f} ${d}`)].join(", ");
    const history = queries.filter((q) => q.path === "schedules" || q.path === "sessions");
    for (const q of history) {
      const ins = q.wheres.find(([f, op]) => f === "clientId" && op === "in");
      if (!ins) {
        // The one query that isn't by client: the studio's earliest booking, one document.
        expect(shape(q)).toBe("studioId ==, order startTime asc");
        expect(q.limit).toBe(1);
        continue;
      }
      expect((ins[2] as string[]).length).toBeLessThanOrEqual(30);
    }
    const shapes = [...new Set(history.map(shape))].sort();
    expect(shapes).toEqual([
      "clientId in, createdAt >=, order createdAt desc",
      "clientId in, date >=, order date desc",
      "clientId in, startTime >=, startTime <=, order startTime asc",
      "studioId ==, order startTime asc",
    ]);
    // 71 clients: Edoras's 70 in three batches and Helm's Deep's one, read for the snapshots, and again for the states.
    const bookingReads = history.filter((q) => shape(q).startsWith("clientId in, startTime"));
    expect(bookingReads.map((q) => (q.wheres[0][2] as string[]).length)).toEqual([30, 30, 10, 1]);

    // Every shape is an index firestore.indexes.json already holds.
    const indexes = (JSON.parse(readFileSync(join(__dirname, "../../../firestore.indexes.json"), "utf8")) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }> }).indexes;
    const has = (group: string, fields: string[]) => indexes.some((i) => i.collectionGroup === group && i.fields.map((f) => `${f.fieldPath} ${f.order}`).join(", ") === fields.join(", "));
    expect(has("schedules", ["clientId ASCENDING", "startTime ASCENDING"])).toBe(true);
    expect(has("sessions", ["clientId ASCENDING", "date DESCENDING"])).toBe(true);
    expect(has("sessions", ["clientId ASCENDING", "createdAt DESCENDING"])).toBe(true);
    expect(has("schedules", ["studioId ASCENDING", "startTime ASCENDING"])).toBe(true);

    // The heap's peak, studio by studio, and for the run.
    expect(lines.filter((l) => /^(Edoras|Helm's Deep): memory peak [\d.]+ MB heap used/.test(l))).toHaveLength(2);
    expect(lines.some((l) => /^Memory: the run's peak was [\d.]+ MB of heap; the instance has 512 MB\.$/.test(l))).toBe(true);
  });

  it("counts a cross-training visit at another studio as hers, whatever order the reads come back in", async () => {
    for (const reverse of [false, true]) {
      const { db, store } = fakeDb(company(3), { reverse });
      await runRenewals({ db, now: NOW, noPulls: true, log: () => {} });
      // Her last visit is Thursday's, at Helm's Deep.
      expect((store.clients.e000.renewal as { lastVisitDate?: string }).lastVisitDate).toBe("2026-09-24");
      expect(store["studios/edoras/clientStates"].e000).toMatchObject({ lastVisit: "2026-09-24" });
    }
  });
});
