/**
 * The nightly and weekly jobs fold each client's machine totals document in
 * beside the clients they read (server/machine-totals-read.ts).
 */
import { describe, expect, it } from "vitest";
import { withMachineTotalsRead } from "../../../server/machine-totals-read";

function fakeDb(docs: Record<string, Record<string, unknown>>, fail = false) {
  const asked: string[][] = [];
  const db = {
    doc: (path: string) => ({ path }),
    getAll: async (...refs: Array<{ path?: string }>) => {
      if (fail) throw new Error("unavailable");
      const paths = refs.filter((r) => typeof r?.path === "string").map((r) => r.path as string);
      asked.push(paths);
      // Answered out of id order on purpose would be wrong: getAll keeps the order asked.
      return paths.map((p) => ({ exists: p in docs, data: () => docs[p] }));
    },
  };
  return { db: db as never, asked };
}

describe("withMachineTotalsRead", () => {
  it("folds each client's totals document in by id, and leaves a client with none as it was", async () => {
    const { db, asked } = fakeDb({
      "clients/a/machineTotals/current": { machineStats: { m1: { timesPerformed: 2, lastPerformedDate: "2026-10-01", lastWeight: 110 } } },
    });
    const clients = [
      { id: "a", machineStats: { m1: { timesPerformed: 40, lastPerformedDate: "2026-09-20", lastWeight: 100 } } },
      { id: "b", machineStats: { m1: { timesPerformed: 7 } } },
    ];
    const out = await withMachineTotalsRead(db, clients);
    expect(asked).toEqual([["clients/a/machineTotals/current", "clients/b/machineTotals/current"]]);
    expect(out[0].machineStats.m1).toEqual({ timesPerformed: 42, lastPerformedDate: "2026-10-01", lastWeight: 110 });
    expect(out[1]).toBe(clients[1]);
  });

  it("asks a hundred at a time, and nothing for no clients", async () => {
    const { db, asked } = fakeDb({});
    await withMachineTotalsRead(db, Array.from({ length: 250 }, (_, i) => ({ id: `c${i}` })));
    expect(asked.map((a) => a.length)).toEqual([100, 100, 50]);
    const none = fakeDb({});
    await withMachineTotalsRead(none.db, []);
    expect(none.asked).toEqual([]);
  });

  it("fails as a failed read, never as no totals", async () => {
    const { db } = fakeDb({}, true);
    await expect(withMachineTotalsRead(db, [{ id: "a" }])).rejects.toThrow("unavailable");
  });
});
