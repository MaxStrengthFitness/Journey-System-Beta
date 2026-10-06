/**
 * scripts/split-client-metrics.ts against a fake database: what it would
 * move, what it moves, that every client reads the same before and after
 * (the app's merge over the client and the totals document), that a second
 * run moves nothing, and that the result is exactly the shape the perf lab's
 * `seed.ts --split` writes (planClientSplit over the client alone).
 */
import { describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { runClientSplit, splitSummaryLines } from "../../../scripts/lib/split-client-metrics-core";
import { mergeMachineTotals, planClientSplit } from "./totals";
import { studioDateKey } from "../../lib/studio-time";

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
      const next = { ...store[r.path] };
      for (const [k, v] of Object.entries(data)) {
        if (isDelete(v)) delete next[k];
        else next[k] = v;
      }
      store[r.path] = next;
      writes.push({ op: "update", path: r.path });
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
    // A seeded client, as the app wrote her before the split.
    "clients/c1": {
      firstName: "Ada",
      homeStudioId: "lakeside",
      lastSessionDate: "2026-10-01",
      lifetimeReps: 900,
      currentMachineMetrics: { "m-a": { weight: "100", settings: { Seat: "3" }, lastPerformedDate: ts("2026-10-01T14:00:00Z") } },
      machineStats: { "m-a": { firstPerformedDate: "2025-01-05", firstWeight: 60, lastPerformedDate: "2026-10-01", lastWeight: 100, timesPerformed: 40 } },
      machineStatsBackfilledAt: "marker",
    },
    // The new version already finished a session for her: the totals document exists.
    "clients/c2": {
      firstName: "Bo",
      homeStudioId: "lakeside",
      machineStats: { "m-a": { timesPerformed: 10, lastPerformedDate: "2026-09-01", lastWeight: 50 } },
    },
    "clients/c2/machineTotals/current": {
      machineStats: { "m-a": { timesPerformed: 1, lastPerformedDate: "2026-10-05", lastWeight: 55 } },
    },
    // A brand-new client: nothing to move.
    "clients/c3": { firstName: "Cy", homeStudioId: "lakeside" },
    // Another studio's client.
    "clients/c4": { firstName: "Di", homeStudioId: "other", machineStats: { "m-b": { timesPerformed: 2 } } },
  };
}

const readerView = (store: Store, id: string) => mergeMachineTotals(store[`clients/${id}`], store[`clients/${id}/machineTotals/current`] ?? null);

describe("runClientSplit", () => {
  it("dry run: says what would move and writes nothing", async () => {
    const store = studio();
    const before = JSON.stringify(store);
    const { db, writes } = fakeDb(store);
    const s = await runClientSplit({ db, commit: false, now: NOW, log: () => {} });
    expect(writes).toEqual([]);
    expect(JSON.stringify(store)).toBe(before);
    expect(s).toMatchObject({ scanned: 4, toMove: 3, moved: 0, hadTotalsDoc: 1, failed: 0 });
    expect(s.bytesMoved).toBeGreaterThan(0);
    expect(splitSummaryLines(s, false)[0]).toMatch(/^Would move: 3 of 4 clients/);
  });

  it("commit: moves the maps, keeps what every screen reads, and a second run moves nothing", async () => {
    const store = studio();
    const before = ["c1", "c2", "c3", "c4"].map((id) => readerView(store, id));
    const { db } = fakeDb(store);
    const s = await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    expect(s).toMatchObject({ toMove: 3, moved: 3, failed: 0 });

    for (const id of ["c1", "c2", "c4"]) {
      const client = store[`clients/${id}`];
      expect(client).not.toHaveProperty("currentMachineMetrics");
      expect(client).not.toHaveProperty("machineStats");
      expect(client).not.toHaveProperty("machineStatsBackfilledAt");
    }
    expect(store["clients/c1"].lifetimeReps).toBe(900);
    expect(store["clients/c1"].firstName).toBe("Ada");
    // The reader's view is unchanged (updatedAt aside, which no reader reads).
    expect(["c1", "c2", "c3", "c4"].map((id) => readerView(store, id))).toEqual(before);
    // c2: the app's newer session kept, the counts added.
    expect(store["clients/c2/machineTotals/current"].machineStats).toEqual({
      "m-a": { timesPerformed: 11, lastPerformedDate: "2026-10-05", lastWeight: 55 },
    });
    // c3 had nothing and got no document.
    expect(store).not.toHaveProperty("clients/c3/machineTotals/current");

    const again = await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    expect(again).toMatchObject({ toMove: 0, moved: 0 });
  });

  it("records what each moved client held before, after each committed transaction, and nothing on a dry run", async () => {
    const store = studio();
    const pre = JSON.parse(JSON.stringify(store["clients/c1"]));
    const { db } = fakeDb(store);
    const dry: unknown[] = [];
    await runClientSplit({ db, commit: false, now: NOW, log: () => {}, record: (r) => dry.push(...r) });
    expect(dry).toEqual([]);
    const moved: Array<{ clientId: string; client: Record<string, unknown>; totals: unknown }> = [];
    await runClientSplit({ db, commit: true, now: NOW, log: () => {}, record: (r) => moved.push(...r) });
    expect(moved.map((m) => m.clientId).sort()).toEqual(["c1", "c2", "c4"]);
    const c1 = moved.find((m) => m.clientId === "c1")!;
    expect(JSON.parse(JSON.stringify(c1.client.machineStats))).toEqual(pre.machineStats);
    expect(c1.client).not.toHaveProperty("firstName");
  });

  it("is the shape the lab's seed --split writes", async () => {
    const store = studio();
    const pre = { ...store["clients/c1"] };
    const { db } = fakeDb(store);
    await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    const seeded = planClientSplit(pre, null, { dayOf: (v) => studioDateKey(v as never, "America/New_York"), today: "2026-10-06" });
    const { updatedAt, ...moved } = store["clients/c1/machineTotals/current"];
    expect(updatedAt).toBe("SERVER_TIME");
    expect(moved).toEqual(seeded.totals);
  });

  it("one studio at a time, and stops at --limit", async () => {
    const store = studio();
    const { db } = fakeDb(store);
    const s = await runClientSplit({ db, commit: true, studioId: "other", now: NOW, log: () => {} });
    expect(s).toMatchObject({ scanned: 1, moved: 1 });
    expect(store["clients/c1"]).toHaveProperty("machineStats");
    const limited = await runClientSplit({ db, commit: true, limit: 1, now: NOW, log: () => {} });
    expect(limited.moved).toBe(1);
    expect(store["clients/c2"]).toHaveProperty("machineStats");
  });

  it("moves lastSessionDate forward to the last machine day, never back", async () => {
    const store = studio();
    store["clients/c1"].lastSessionDate = "2026-09-01";
    store["clients/c2"].lastSessionDate = "2026-10-03";
    const { db } = fakeDb(store);
    const s = await runClientSplit({ db, commit: true, now: NOW, log: () => {} });
    expect(store["clients/c1"].lastSessionDate).toBe("2026-10-01");
    expect(store["clients/c2"].lastSessionDate).toBe("2026-10-03");
    expect(s.lastSessionMoved).toBeGreaterThanOrEqual(1);
  });

  it("leaves every client as it was when a transaction fails, and says so", async () => {
    const store = studio();
    const before = JSON.stringify(store);
    const { db } = fakeDb(store, { failCommit: true });
    const lines: string[] = [];
    const s = await runClientSplit({ db, commit: true, now: NOW, log: (l) => lines.push(l) });
    expect(s.failed).toBe(3);
    expect(s.moved).toBe(0);
    expect(JSON.stringify(store)).toBe(before);
    expect(lines.join("\n")).toMatch(/Run again/);
  });
});
