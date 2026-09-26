/**
 * The nightly job's sync on first booking (the cost plan, Sep 26 2026, B5),
 * end to end against a Firestore made of plain maps and a Mindbody that
 * answers from memory.
 *
 * Who is synced is tested where it is decided (lib/first-booking-sync.test.ts)
 * and what is written where it is built (lib/mindbody-master-sync.test.ts).
 * This is the plumbing: tonight's candidates reach Mindbody inside the
 * budget, their patch lands, they are not pulled a second time in the same
 * night, a dry run asks Mindbody nothing, and no `undefined` - which the
 * Admin SDK refuses - reaches a write.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

const mb = vi.hoisted(() => ({
  master: vi.fn(),
  commercial: vi.fn(),
}));

vi.mock("../../../server/mindbody-client.ts", () => ({
  mindbodyConfigured: () => true,
  pullClientMaster: mb.master,
  pullClientCommercial: mb.commercial,
}));

import { runRenewals } from "../../../server/renewals-job";

type Docs = Record<string, Record<string, unknown>>;

function fakeDb(collections: Record<string, Docs>) {
  const store: Record<string, Docs> = collections;
  const writes: Array<{ path: string; kind: string; data: Record<string, unknown> }> = [];

  const assertNoUndefined = (value: unknown, at: string) => {
    if (value === undefined) throw new Error(`undefined at ${at}`);
    if (value && typeof value === "object" && !(value instanceof Timestamp)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoUndefined(v, `${at}.${k}`);
    }
  };
  const split = (path: string) => {
    const at = path.lastIndexOf("/");
    return { col: path.slice(0, at), id: path.slice(at + 1) };
  };
  const read = (path: string) => {
    const { col, id } = split(path);
    const data = store[col]?.[id];
    return { exists: !!data, id, data: () => data, get: (f: string) => (data as any)?.[f] };
  };
  const record = (path: string, kind: string, data: Record<string, unknown>) => {
    assertNoUndefined(data, path);
    writes.push({ path, kind, data });
    const { col, id } = split(path);
    store[col] ??= {};
    store[col][id] = { ...(store[col][id] ?? {}), ...data };
  };
  const ref = (path: string) => ({
    path,
    get: async () => read(path),
    set: async (data: Record<string, unknown>) => record(path, "set", data),
    update: async (data: Record<string, unknown>) => record(path, "update", data),
  });
  const collection = (path: string) => {
    const query = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => {
        const docs = Object.entries(store[path] ?? {}).map(([id, data]) => ({
          id,
          data: () => data,
          get: (f: string) => (data as any)[f],
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return query;
  };
  const db = {
    collection,
    doc: ref,
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => read(r.path)),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => record(r.path, "set", data)),
        update: (r: { path: string }, data: Record<string, unknown>) => ops.push(() => record(r.path, "update", data)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db: db as never, store, writes };
}

// Monday Nov 2 2026, 2:30 am Eastern: the night the job runs.
const NOW = new Date(Date.UTC(2026, 10, 2, 7, 30));
const at = (iso: string) => Timestamp.fromDate(new Date(iso));

function world(cutover: string | null = "2026-10-01") {
  const db = fakeDb({
    studios: {
      solon: { name: "Solon", mindbodySiteId: "5746957", timezone: "America/New_York", journeyCutoverDate: "2026-10-01" },
    },
    machines: {},
    schedules: {
      b1: { clientId: "100000001", studioId: "solon", startTime: at("2026-11-02T14:00:00Z"), status: "Scheduled" },
      b2: { clientId: "100000002", studioId: "solon", startTime: at("2026-11-03T14:00:00Z"), status: "Scheduled" },
      b3: { clientId: "100000003", studioId: "solon", startTime: at("2026-11-03T15:00:00Z"), status: "Scheduled" },
      b4: { clientId: "100000004", studioId: "solon", startTime: at("2026-11-03T16:00:00Z"), status: "Cancelled" },
      b5: { clientId: "100000005", studioId: "solon", startTime: at("2026-11-10T16:00:00Z"), status: "Scheduled" },
    },
    sessions: {},
    clients: {
      // Never synced, booked today.
      "100000001": { firstName: "Ana", lastName: "Ruiz", mindbodyClientId: "100000001", homeStudioId: "solon" },
      // Never synced, booked tomorrow.
      "100000002": { firstName: "Bo", lastName: "Lee", mindbodyClientId: "100000002", homeStudioId: "solon" },
      // Synced already: details and packages now arrive when they change.
      "100000003": {
        firstName: "Cy",
        lastName: "Park",
        mindbodyClientId: "100000003",
        homeStudioId: "solon",
        mindbodyMasterSyncedAt: "2026-10-28T10:00:00.000Z",
      },
      // Never synced, but tomorrow's booking was cancelled.
      "100000004": { firstName: "Di", lastName: "Ng", mindbodyClientId: "100000004", homeStudioId: "solon" },
      // Never synced, booked next week: the night before.
      "100000005": { firstName: "Ed", lastName: "Fox", mindbodyClientId: "100000005", homeStudioId: "solon" },
    },
  });
  db.store.studios.solon.journeyCutoverDate = cutover;
  return db;
}

const found = (id: string, visits: number) => ({
  response: {
    found: true,
    mindbodyClientId: id,
    siteId: "5746957",
    demographics: { firstName: "Ana", lastName: "Ruiz", phone: "555-0100" },
    commercial: { contracts: [], memberships: [], services: [], partial: false },
    visits,
    partial: false,
    failed: [],
    fetchedAt: NOW.toISOString(),
  },
  error: "",
  status: 200,
  calls: 5,
});

describe("the nightly job's sync on first booking", () => {
  beforeEach(() => {
    mb.master.mockReset();
    mb.commercial.mockReset();
    mb.master.mockImplementation(async (_site: string, id: string) => found(id, 312));
    mb.commercial.mockImplementation(async () => ({ contracts: [], memberships: null, services: [], calls: 2, error: "" }));
  });

  it("Master-Syncs the never-synced clients booked today or tomorrow, and no one else", async () => {
    const { db, store } = world();
    const summary = await runRenewals({ db, now: NOW, log: () => {} });

    expect(mb.master.mock.calls.map((c) => c[1]).sort()).toEqual(["100000001", "100000002"]);
    expect(summary.firstSyncs).toBe(2);
    expect(store.clients["100000001"].mindbodyMasterSyncedAt).toBe(NOW.toISOString());
    expect(store.clients["100000001"].clientsNumberOfVisitsAtSite).toBe(312);
    expect(store.clients["100000003"].clientsNumberOfVisitsAtSite).toBeUndefined();
  });

  it("does not pull a client a second time the same night", async () => {
    const { db } = world();
    await runRenewals({ db, now: NOW, log: () => {} });
    const commercialFor = mb.commercial.mock.calls.map((c) => c[1]);
    expect(commercialFor).not.toContain("100000001");
    expect(commercialFor).not.toContain("100000002");
  });

  it("keeps to its budget, today's bookings first", async () => {
    const { db } = world();
    const summary = await runRenewals({ db, now: NOW, maxFirstSyncs: 1, log: () => {} });
    expect(mb.master.mock.calls.map((c) => c[1])).toEqual(["100000001"]);
    expect(summary.firstSyncs).toBe(1);
  });

  it("asks Mindbody nothing on a dry run", async () => {
    const { db, writes } = world();
    await runRenewals({ db, now: NOW, dryRun: true, log: () => {} });
    expect(mb.master).not.toHaveBeenCalled();
    expect(writes.filter((w) => w.path.startsWith("clients/"))).toEqual([]);
  });

  it("asks Mindbody nothing about a studio that has not gone live (AJ, Sep 26)", async () => {
    for (const cutover of [null, "2026-11-20"]) {
      mb.master.mockClear();
      mb.commercial.mockClear();
      const { db } = world(cutover);
      const summary = await runRenewals({ db, now: NOW, log: () => {} });
      expect(mb.master).not.toHaveBeenCalled();
      expect(mb.commercial).not.toHaveBeenCalled();
      expect(summary.firstSyncs).toBe(0);
    }
  });

  it("counts a studio going live tomorrow as live, so its first clients are ready", async () => {
    const { db } = world("2026-11-03");
    const summary = await runRenewals({ db, now: NOW, log: () => {} });
    expect(summary.firstSyncs).toBe(2);
  });

  it("pulls first a client whose package Mindbody said changed", async () => {
    const { db, store } = world();
    store.clients["100000003"].mindbodyServicesSyncedAt = at("2026-10-28T10:00:00Z");
    store.clients["100000003"].mindbodyCommercialChangedAt = at("2026-11-01T18:00:00Z");
    await runRenewals({ db, now: NOW, maxPulls: 1, log: () => {} });
    expect(mb.commercial.mock.calls.map((c) => c[1])).toEqual(["100000003"]);
  });

  it("counts a client Mindbody does not know as a failure and writes nothing for them", async () => {
    mb.master.mockImplementation(async (_s: string, id: string) =>
      id === "100000002"
        ? { response: { found: false, mindbodyClientId: id, siteId: "5746957", fetchedAt: "" }, error: "", status: 200, calls: 1 }
        : found(id, 3),
    );
    const { db, store } = world();
    const summary = await runRenewals({ db, now: NOW, log: () => {} });
    expect(summary.firstSyncs).toBe(1);
    expect(summary.firstSyncFailures).toBe(1);
    expect(store.clients["100000002"].mindbodyMasterSyncedAt).toBeUndefined();
  });
});
