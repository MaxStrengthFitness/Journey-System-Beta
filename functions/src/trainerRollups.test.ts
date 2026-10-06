import { describe, it, expect } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  applyCount,
  applyUncount,
  seedFromLegacy,
  planRollup,
  tallyWindows,
  sessionInstantMs,
  foldBackfillPage,
  foldWindowRow,
  readWindowRows,
  WINDOW_FIELDS,
  type WindowReader,
  type WindowRow,
  type BackfillTotals,
  type SessionLike,
} from "./trainerRollups";

describe("planRollup", () => {
  it("counts a session the first time it completes", () => {
    expect(planRollup({ status: "In-Progress" }, { status: "Completed" })).toEqual({ kind: "count" });
  });

  it("does not count the same completion twice", () => {
    // Cloud Functions deliver at least once, so this is the case that keeps
    // a retry from inflating a trainer's career total.
    const after: SessionLike = { status: "Completed", rollupCounted: true, rollupTrainerId: "t1" };
    expect(planRollup(after, after)).toEqual({ kind: "none", reason: "already counted" });
  });

  it("ignores a session that is still in progress", () => {
    expect(planRollup(undefined, { status: "In-Progress" })).toEqual({
      kind: "none",
      reason: "not completed",
    });
  });

  it("reverses the count when a completed session is reopened", () => {
    const before: SessionLike = { status: "Completed", rollupCounted: true, rollupTrainerId: "t1" };
    const after: SessionLike = { status: "In-Progress", rollupCounted: true, rollupTrainerId: "t1" };
    expect(planRollup(before, after)).toEqual({ kind: "uncount", trainerId: "t1" });
  });

  it("reverses the count when a counted session is deleted", () => {
    const before: SessionLike = { status: "Completed", rollupCounted: true, rollupTrainerId: "t7" };
    expect(planRollup(before, undefined)).toEqual({ kind: "uncount", trainerId: "t7" });
  });

  it("does nothing when an uncounted session is deleted", () => {
    // Discarding an in-progress session is routine; it must not move a total.
    expect(planRollup({ status: "In-Progress" }, undefined)).toEqual({
      kind: "none",
      reason: "deleted; never counted",
    });
  });

  it("does not reverse a counted session with no recorded trainer", () => {
    const before: SessionLike = { status: "Completed", rollupCounted: true };
    expect(planRollup(before, undefined).kind).toBe("none");
  });
});

describe("tallyWindows", () => {
  const now = Date.UTC(2026, 8, 6);
  const daysAgo = (n: number) => now - n * 86_400_000;

  it("splits 30-day and 90-day counts", () => {
    const rows = [
      { atMs: daysAgo(1), clientId: "c1" },
      { atMs: daysAgo(29), clientId: "c2" },
      { atMs: daysAgo(45), clientId: "c1" },
      { atMs: daysAgo(120), clientId: "c9" },
    ];
    const t = tallyWindows(rows, now);
    expect(t.sessions30d).toBe(2);
    expect(t.sessions90d).toBe(3);
  });

  it("counts distinct clients, not sessions", () => {
    const rows = [
      { atMs: daysAgo(1), clientId: "c1" },
      { atMs: daysAgo(2), clientId: "c1" },
      { atMs: daysAgo(3), clientId: "c2" },
    ];
    expect(tallyWindows(rows, now).clients90d).toBe(2);
  });

  it("ignores sessions with no client when counting clients", () => {
    const rows = [{ atMs: daysAgo(1) }, { atMs: daysAgo(2), clientId: "c1" }];
    expect(tallyWindows(rows, now).clients90d).toBe(1);
  });

  it("averages over the window, not over all time", () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ atMs: daysAgo(i % 90) }));
    // 130 sessions across ~12.86 weeks
    expect(tallyWindows(rows, now).avgPerWeek).toBeCloseTo(10.1, 1);
  });

  it("returns zeroes for a trainer with nothing in the window", () => {
    expect(tallyWindows([], now)).toEqual({
      sessions30d: 0,
      sessions90d: 0,
      clients90d: 0,
      avgPerWeek: 0,
    });
  });
});

describe("foldWindowRow (R23)", () => {
  const at = { toMillis: () => 1_000 };

  it("adds a completed session to its trainer, rollup trainer first", () => {
    const byTrainer = new Map<string, WindowRow[]>();
    foldWindowRow(byTrainer, { status: "Completed", rollupTrainerId: "r", trainerId: "t", createdAt: at, clientId: "c1" });
    foldWindowRow(byTrainer, { status: "Completed", startedByTrainerId: "s", createdAt: at });
    expect(byTrainer.get("r")).toEqual([{ atMs: 1_000, clientId: "c1" }]);
    expect(byTrainer.get("s")).toEqual([{ atMs: 1_000, clientId: undefined }]);
    expect(byTrainer.has("t")).toBe(false);
  });

  it("leaves out anything not Completed, with no trainer, or with no instant", () => {
    const byTrainer = new Map<string, WindowRow[]>();
    foldWindowRow(byTrainer, { status: "In-Progress", trainerId: "t", createdAt: at });
    foldWindowRow(byTrainer, { status: "Completed", createdAt: at });
    foldWindowRow(byTrainer, { status: "Completed", trainerId: "t" });
    expect(byTrainer.size).toBe(0);
  });
});

describe("readWindowRows (R23)", () => {
  /** A sessions collection that records the query asked of it and streams its rows. */
  function fakeReader(rows: SessionLike[]) {
    const asked: {
      wheres: unknown[][];
      orderBy?: unknown[];
      select?: string[];
      streamed: boolean;
      got: boolean;
    } = {
      wheres: [],
      streamed: false,
      got: false,
    };
    const query: any = {
      where: (...args: unknown[]) => {
        asked.wheres.push(args);
        return query;
      },
      orderBy: (...args: unknown[]) => {
        asked.orderBy = args;
        return query;
      },
      select: (...fields: string[]) => {
        asked.select = fields;
        return query;
      },
      get: async () => {
        asked.got = true;
        throw new Error("readWindowRows must stream, not get()");
      },
      stream: () => {
        asked.streamed = true;
        return (async function* () {
          for (const r of rows) yield { data: () => r };
        })();
      },
    };
    const reader = {
      collection: (name: string) => {
        expect(name).toBe("sessions");
        return query;
      },
    } as unknown as WindowReader;
    return { reader, asked };
  }

  it("asks only for Completed sessions in the window, on the (status, createdAt) index", async () => {
    const { reader, asked } = fakeReader([]);
    const cutoff = Timestamp.fromMillis(5);
    await readWindowRows(reader, cutoff);
    expect(asked.wheres).toEqual([
      ["status", "==", "Completed"],
      ["createdAt", ">=", cutoff],
    ]);
    // Ordered newest first, so the query is the (status ASC, createdAt DESC)
    // index exactly rather than a shape the planner might scan for.
    expect(asked.orderBy).toEqual(["createdAt", "desc"]);
  });

  it("streams a projection rather than holding whole documents", async () => {
    const { reader, asked } = fakeReader([]);
    await readWindowRows(reader, Timestamp.fromMillis(5));
    expect(asked.streamed).toBe(true);
    expect(asked.got).toBe(false);
    expect(asked.select).toEqual([...WINDOW_FIELDS]);
  });

  it("folds each streamed session by trainer and counts what it read", async () => {
    const at = { toMillis: () => 2_000 };
    const { reader } = fakeReader([
      { status: "Completed", trainerId: "t1", clientId: "c1", createdAt: at },
      { status: "Completed", trainerId: "t1", clientId: "c2", createdAt: at },
      { status: "Completed", trainerId: "t2", createdAt: at },
      { status: "Completed", createdAt: at },
    ]);
    const { byTrainer, read } = await readWindowRows(reader, Timestamp.fromMillis(5));
    expect(read).toBe(4);
    expect(byTrainer.get("t1")).toHaveLength(2);
    expect(byTrainer.get("t2")).toHaveLength(1);
    expect(byTrainer.size).toBe(2);
  });
});

describe("sessionInstantMs", () => {
  it("prefers createdAt", () => {
    const ms = Date.UTC(2026, 0, 2);
    expect(sessionInstantMs({ createdAt: { toMillis: () => ms }, date: "2020-01-01" })).toBe(ms);
  });

  it("falls back to the date string for imported rows", () => {
    expect(sessionInstantMs({ date: "2026-03-04" })).toBe(Date.parse("2026-03-04"));
  });

  it("returns null when neither is usable", () => {
    expect(sessionInstantMs({ date: "not a date" })).toBeNull();
    expect(sessionInstantMs({})).toBeNull();
  });
});

describe("foldBackfillPage", () => {
  const index = new Map([["AJ", "trainer-aj"]]);

  it("credits explicit ids and skips incomplete sessions", () => {
    const totals = new Map<string, BackfillTotals>();
    const res = foldBackfillPage(
      totals,
      [
        { status: "Completed", trainerId: "t1", date: "2026-01-05" },
        { status: "Completed", trainerId: "t1", date: "2026-02-05" },
        { status: "In-Progress", trainerId: "t1" },
      ],
      index,
    );
    expect(res.counted).toBe(2);
    expect(totals.get("t1")?.sessionsCoached).toBe(2);
    expect(totals.get("t1")?.firstSessionAtMs).toBe(Date.parse("2026-01-05"));
    expect(totals.get("t1")?.lastSessionAtMs).toBe(Date.parse("2026-02-05"));
  });

  it("resolves legacy rows by initials", () => {
    const totals = new Map<string, BackfillTotals>();
    foldBackfillPage(totals, [{ status: "Completed", trainerInitials: "aj" }], index);
    expect(totals.get("trainer-aj")?.sessionsCoached).toBe(1);
  });

  it("reports rows it cannot credit instead of guessing", () => {
    const totals = new Map<string, BackfillTotals>();
    const res = foldBackfillPage(totals, [{ status: "Completed", trainerInitials: "ZZ" }], index);
    expect(res.unresolved).toBe(1);
    expect(totals.size).toBe(0);
  });

  it("accumulates across pages", () => {
    const totals = new Map<string, BackfillTotals>();
    foldBackfillPage(totals, [{ status: "Completed", trainerId: "t1" }], index);
    foldBackfillPage(totals, [{ status: "Completed", trainerId: "t1" }], index);
    expect(totals.get("t1")?.sessionsCoached).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* The counters' own document (the cost plan, Sep 26 2026, D3c)        */
/* ------------------------------------------------------------------ */

describe("seedFromLegacy", () => {
  it("carries the old map over, field by field, with nothing undefined", () => {
    expect(
      seedFromLegacy({ sessionsCoached: 412, lastSessionAt: "T", avgPerWeek: 9.5, stray: 1, firstSessionAt: undefined }),
    ).toEqual({ sessionsCoached: 412, lastSessionAt: "T", avgPerWeek: 9.5 });
  });

  it("is empty when there was no old map", () => {
    expect(seedFromLegacy(undefined)).toEqual({});
    expect(seedFromLegacy("nonsense")).toEqual({});
  });
});

/** A Firestore of plain maps, enough for the two counting transactions. */
function fakeFirestore(seed: Record<string, Record<string, unknown>>) {
  const store: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(seed));
  const one = FieldValue.increment(1);
  const stamp = FieldValue.serverTimestamp();
  const resolve = (prev: unknown, value: any) => {
    if (value && typeof value.isEqual === "function" && value.isEqual(one)) return Number(prev ?? 0) + 1;
    if (value && typeof value.isEqual === "function" && value.isEqual(stamp)) return "SERVER_TIME";
    if (value && typeof value.isEqual === "function" && value.isEqual(FieldValue.delete())) return undefined;
    return value;
  };
  const write = (path: string, data: Record<string, unknown>, merge: boolean) => {
    const next: Record<string, unknown> = merge ? { ...(store[path] ?? {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      const r = resolve(next[k], v);
      if (r === undefined) delete next[k];
      else next[k] = r;
    }
    store[path] = next;
  };
  const ref = (path: string): any => ({
    path,
    collection: (c: string) => ({ doc: (id: string) => ref(`${path}/${c}/${id}`) }),
  });
  const firestore: any = {
    doc: (path: string) => ref(path),
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (r: any) => ({ exists: !!store[r.path], data: () => store[r.path] }),
        set: (r: any, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          writes.push(() => write(r.path, data, !!opts?.merge)),
        update: (r: any, data: Record<string, unknown>) => writes.push(() => write(r.path, data, true)),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
  return { firestore, store };
}

describe("counting into the counters' own document", () => {
  it("carries the old total over on a trainer's first count, so it never starts again from zero", async () => {
    const { firestore, store } = fakeFirestore({
      "trainers/t1": { name: "Ana", rollups: { sessionsCoached: 412, avgPerWeek: 9.5 } },
      "sessions/s1": { status: "Completed", trainerId: "t1" },
    });
    const out = await applyCount(firestore, "sessions/s1", "t1");
    expect(out.applied).toBe(true);
    expect(store["trainers/t1/stats/rollups"]).toMatchObject({ sessionsCoached: 413, avgPerWeek: 9.5 });
    // The trainer document every iPad watches is not written.
    expect(store["trainers/t1"]).toEqual({ name: "Ana", rollups: { sessionsCoached: 412, avgPerWeek: 9.5 } });
    expect(store["sessions/s1"]).toMatchObject({ rollupCounted: true, rollupTrainerId: "t1" });
  });

  it("adds to the counters document once it exists", async () => {
    const { firestore, store } = fakeFirestore({
      "trainers/t1": { rollups: { sessionsCoached: 412 } },
      "trainers/t1/stats/rollups": { sessionsCoached: 500 },
      "sessions/s1": { status: "Completed", trainerId: "t1" },
    });
    await applyCount(firestore, "sessions/s1", "t1");
    expect(store["trainers/t1/stats/rollups"].sessionsCoached).toBe(501);
  });

  it("counts a brand-new trainer from one", async () => {
    const { firestore, store } = fakeFirestore({
      "trainers/t2": { name: "New" },
      "sessions/s2": { status: "Completed", trainerId: "t2" },
    });
    await applyCount(firestore, "sessions/s2", "t2");
    expect(store["trainers/t2/stats/rollups"].sessionsCoached).toBe(1);
  });

  it("takes one back from the carried-over total, and never below zero", async () => {
    const { firestore, store } = fakeFirestore({
      "trainers/t1": { rollups: { sessionsCoached: 412 } },
      "sessions/s1": { status: "In-Progress", rollupCounted: true, rollupTrainerId: "t1" },
    });
    await applyUncount(firestore, "t1", "sessions/s1");
    expect(store["trainers/t1/stats/rollups"].sessionsCoached).toBe(411);
    expect(store["sessions/s1"].rollupCounted).toBe(false);

    const empty = fakeFirestore({ "trainers/t3": {} });
    await applyUncount(empty.firestore, "t3", null);
    expect(empty.store["trainers/t3/stats/rollups"].sessionsCoached).toBe(0);
  });
});
