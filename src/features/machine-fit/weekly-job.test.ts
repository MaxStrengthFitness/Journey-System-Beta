/**
 * The weekly job, end to end, against a Firestore made of plain maps.
 *
 * The thinking is tested where it lives (trends.test.ts, company.test.ts,
 * kaizen.test.ts). This is the plumbing: which documents the job writes and
 * deletes, that last week's fit blocks survive a failed fit step, and that
 * nothing `undefined` — which the Admin SDK refuses — reaches a write.
 */

import { describe, expect, it } from "vitest";
import { runMachineTrends } from "../../../server/machine-trends-job";

type Docs = Record<string, Record<string, unknown>>;

function fakeDb(collections: Record<string, Docs>, opts: { failOn?: string } = {}) {
  const store: Record<string, Docs> = JSON.parse(JSON.stringify(collections));
  const written: string[] = [];
  const deleted: string[] = [];

  const snapshot = (path: string) => {
    if (opts.failOn && path.endsWith(opts.failOn)) throw new Error(`cannot read ${path}`);
    const docs = Object.entries(store[path] ?? {}).map(([id, data]) => ({
      id,
      ref: { path: `${path}/${id}` },
      data: () => data,
      get: (field: string) => (data as Record<string, unknown>)[field],
    }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  };

  const collection = (path: string) => {
    const query = {
      where: () => query,
      orderBy: () => query,
      select: () => query,
      limit: () => query,
      get: async () => snapshot(path),
      doc: (id: string) => ({
        path: `${path}/${id}`,
        collection: (sub: string) => collection(`${path}/${id}/${sub}`),
      }),
    };
    return query;
  };

  const assertNoUndefined = (value: unknown, at: string) => {
    if (value === undefined) throw new Error(`undefined at ${at}`);
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoUndefined(v, `${at}.${k}`);
    }
  };

  const db = {
    collection,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          assertNoUndefined(data, ref.path);
          ops.push(() => {
            const at = ref.path.lastIndexOf("/");
            const col = ref.path.slice(0, at);
            (store[col] ??= {})[ref.path.slice(at + 1)] = data;
            written.push(ref.path);
          });
        },
        delete: (ref: { path: string }) => {
          ops.push(() => {
            const at = ref.path.lastIndexOf("/");
            delete store[ref.path.slice(0, at)]?.[ref.path.slice(at + 1)];
            deleted.push(ref.path);
          });
        },
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db: db as never, store, written, deleted };
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
