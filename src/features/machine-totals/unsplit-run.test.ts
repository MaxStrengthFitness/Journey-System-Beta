/**
 * scripts/unsplit-client-metrics.ts (the way back from the roster split)
 * against a fake database: a split and then an unsplit leave every client
 * reading exactly as before, the totals documents are gone, a session the
 * app wrote after the split is counted ONCE (the copy back and the delete
 * are one transaction), a second run copies nothing, a dry run writes
 * nothing, and a failed transaction leaves everything as it was.
 */
import { describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { runClientSplit } from "../../../scripts/lib/split-client-metrics-core";
import { runClientUnsplit, unsplitSummaryLines } from "../../../scripts/lib/unsplit-client-metrics-core";
import { mergeMachineTotals } from "./totals";

type Store = Record<string, Record<string, unknown>>;

const isDelete = (v: unknown) => v instanceof Object && (v as { isEqual?: (o: unknown) => boolean }).isEqual?.(FieldValue.delete()) === true;
const isServerTime = (v: unknown) => v instanceof Object && (v as { isEqual?: (o: unknown) => boolean }).isEqual?.(FieldValue.serverTimestamp()) === true;

function fakeDb(store: Store, opts: { failCommit?: boolean } = {}) {
  const writes: Array<{ op: string; path: string }> = [];
  const read = (path: string) => ({ id: path.split("/").pop()!, exists: path in store, data: () => store[path], get: (f: string) => store[path]?.[f] });
  const ref = (path: string) => ({ path });
  const collection = (path: string) => {
    const filters: Array<[string, unknown]> = [];
    const q = {
      where: (field: string, _op: string, value: unknown) => {
        filters.push([field, value]);
        return q;
      },
      select: () => q,
      doc: (id: string) => ref(`${path}/${id}`),
      get: async () => ({ docs: matching().map((p) => read(p)) }),
      stream: async function* () {
        for (const p of matching()) yield read(p);
      },
    };
    const matching = () =>
      Object.keys(store)
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/"))
        .filter((p) => filters.every(([f, v]) => store[p][f] === v))
        .sort();
    return q;
  };
  const apply = {
    set: (r: { path: string }, data: Record<string, unknown>, o: { mergeFields: string[] }) => {
      const next = { ...(store[r.path] ?? {}) };
      for (const f of o.mergeFields) next[f] = isServerTime(data[f]) ? "SERVER_TIME" : data[f];
      store[r.path] = next;
      writes.push({ op: "set", path: r.path });
    },
    update: (r: { path: string }, data: Record<string, unknown>) => {
      if (!(r.path in store)) throw new Error(`update of a missing document ${r.path}`);
      const next = { ...store[r.path] };
      for (const [k, v] of Object.entries(data)) {
        if (isDelete(v)) delete next[k];
        else next[k] = v;
      }
      store[r.path] = next;
      writes.push({ op: "update", path: r.path });
    },
    delete: (r: { path: string }) => {
      delete store[r.path];
      writes.push({ op: "delete", path: r.path });
    },
  };
  const db = {
    collection,
    doc: ref,
    getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => read(r.path)),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const queued: Array<() => void> = [];
      await fn({
        getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => read(r.path)),
        set: (r: { path: string }, d: Record<string, unknown>, o: { mergeFields: string[] }) => queued.push(() => apply.set(r, d, o)),
        update: (r: { path: string }, d: Record<string, unknown>) => queued.push(() => apply.update(r, d)),
        delete: (r: { path: string }) => queued.push(() => apply.delete(r)),
      });
      if (opts.failCommit) throw new Error("aborted");
      queued.forEach((q) => q());
    },
  };
  return { db: db as never, writes };
}

const ts = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
const NOW = new Date("2026-10-06T13:40:00Z");

function studio(): Store {
  return {
    "studios/lakeside": { timezone: "America/New_York" },
    "studios/other": {},
    "clients/c1": {
      firstName: "Ada",
      homeStudioId: "lakeside",
      lastSessionDate: "2026-10-01",
      lifetimeReps: 900,
      currentMachineMetrics: { "m-a": { weight: "100", settings: { Seat: "3" }, lastPerformedDate: ts("2026-10-01T14:00:00Z") } },
      machineStats: { "m-a": { firstPerformedDate: "2025-01-05", firstWeight: 60, lastPerformedDate: "2026-10-01", lastWeight: 100, timesPerformed: 40 } },
      machineStatsBackfilledAt: "marker",
    },
    "clients/c2": {
      firstName: "Bo",
      homeStudioId: "lakeside",
      machineStats: { "m-a": { timesPerformed: 10, lastPerformedDate: "2026-09-01", lastWeight: 50 } },
    },
    "clients/c3": { firstName: "Cy", homeStudioId: "lakeside" },
    "clients/c4": { firstName: "Di", homeStudioId: "other", machineStats: { "m-b": { timesPerformed: 2 } } },
  };
}

const readerView = (store: Store, id: string) => mergeMachineTotals(store[`clients/${id}`], store[`clients/${id}/machineTotals/current`] ?? null);
const totalsDocs = (store: Store) => Object.keys(store).filter((p) => p.endsWith("/machineTotals/current"));

describe("runClientUnsplit", () => {
  it("after a split, copies every client's maps back, deletes the totals documents, and every reader sees the same", async () => {
    const store = studio();
    const { db } = fakeDb(store);
    await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    const split = ["c1", "c2", "c3", "c4"].map((id) => readerView(store, id));
    expect(totalsDocs(store).length).toBe(3);

    const s = await runClientUnsplit({ db, commit: true, log: () => {} });
    expect(s).toMatchObject({ scanned: 4, toCopy: 3, copied: 3, failed: 0 });
    expect(totalsDocs(store)).toEqual([]);
    expect(["c1", "c2", "c3", "c4"].map((id) => readerView(store, id))).toEqual(split);
    // The maps are on the client again, as a build from before the split reads them.
    expect(store["clients/c1"].machineStats).toEqual(studio()["clients/c1"].machineStats);
    expect(store["clients/c1"].machineStatsBackfilledAt).toBe("marker");
    expect(store["clients/c1"].lifetimeReps).toBe(900);
    expect(store["clients/c3"]).not.toHaveProperty("machineStats");

    const again = await runClientUnsplit({ db, commit: true, log: () => {} });
    expect(again).toMatchObject({ toCopy: 0, copied: 0 });
  });

  it("counts a session the app wrote after the split once, not twice", async () => {
    const store = studio();
    const { db } = fakeDb(store);
    await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    // After the split (10 moved): the new app finished one more (11), and an
    // old iPad wrote one onto the emptied client field (1): 12 in all.
    store["clients/c2"].machineStats = { "m-a": { timesPerformed: 1, lastPerformedDate: "2026-10-06", lastWeight: 60 } };
    const doc = store["clients/c2/machineTotals/current"] as { machineStats: Record<string, { timesPerformed: number }> };
    doc.machineStats["m-a"].timesPerformed += 1;
    const before = readerView(store, "c2");

    await runClientUnsplit({ db, commit: true, log: () => {} });
    expect(store).not.toHaveProperty("clients/c2/machineTotals/current");
    expect(readerView(store, "c2")).toEqual(before);
    expect((store["clients/c2"].machineStats as Record<string, { timesPerformed: number; lastWeight: number }>)["m-a"]).toMatchObject({
      timesPerformed: 12,
      lastWeight: 60,
    });
  });

  it("dry run: says what it would copy back and writes nothing", async () => {
    const store = studio();
    const { db, writes } = fakeDb(store);
    await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    const after = JSON.stringify(store);
    const count = writes.length;
    const recorded: unknown[] = [];
    const s = await runClientUnsplit({ db, commit: false, log: () => {}, record: (r) => recorded.push(...r) });
    expect(writes.length).toBe(count);
    expect(JSON.stringify(store)).toBe(after);
    expect(recorded).toEqual([]);
    expect(s).toMatchObject({ toCopy: 3, copied: 0 });
    expect(unsplitSummaryLines(s, false)[0]).toMatch(/^Would copy back: 3 of 4 clients/);
  });

  it("records what each client held before, one studio at a time, and stops at --limit", async () => {
    const store = studio();
    const { db } = fakeDb(store);
    await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    const recorded: Array<{ clientId: string; totals: Record<string, unknown> }> = [];
    const one = await runClientUnsplit({ db, commit: true, studioId: "other", log: () => {}, record: (r) => recorded.push(...r) });
    expect(one).toMatchObject({ scanned: 1, copied: 1 });
    expect(recorded.map((r) => r.clientId)).toEqual(["c4"]);
    expect(recorded[0].totals).toHaveProperty("machineStats");
    expect(store).toHaveProperty("clients/c1/machineTotals/current");
    const limited = await runClientUnsplit({ db, commit: true, limit: 1, log: () => {} });
    expect(limited.copied).toBe(1);
    expect(totalsDocs(store).length).toBe(1);
  });

  it("leaves every client as it was when a transaction fails, and says so", async () => {
    const store = studio();
    await runClientSplit({ db: fakeDb(store).db, commit: true, now: NOW, log: () => {} });
    const before = JSON.stringify(store);
    const { db } = fakeDb(store, { failCommit: true });
    const lines: string[] = [];
    const s = await runClientUnsplit({ db, commit: true, log: (l) => lines.push(l) });
    expect(s.failed).toBe(4);
    expect(s.copied).toBe(0);
    expect(JSON.stringify(store)).toBe(before);
    expect(lines.join("\n")).toMatch(/Run again/);
  });
});
