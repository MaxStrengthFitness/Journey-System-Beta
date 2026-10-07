import { describe, expect, it } from "vitest";
import {
  isMachineTotalsKey,
  latestMachineDay,
  machineTotalsKnown,
  machineTotalsPath,
  machineTotalsStateOf,
  mergeMachineTotals,
  mergeWriteOf,
  planClientSplit,
  splitMachineTotalsUpdates,
  splitWritesOf,
  whenOf,
  withMachineTotals,
} from "./totals";

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });
const dayOf = (v: unknown) => {
  const ms = whenOf(v);
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10);
};

describe("where the totals live", () => {
  it("is one document beside the client", () => {
    expect(machineTotalsPath("c1")).toEqual(["clients", "c1", "machineTotals", "current"]);
  });

  it("sends the machine maps to the totals document and everything else to the client", () => {
    const { client, totals } = splitMachineTotalsUpdates({
      completedSessions: 1,
      "trainerTally.t1": 1,
      "currentMachineMetrics.m-leg-press": { weight: "100" },
      "machineStats.m-leg-press.timesPerformed": 1,
      machineStatsBackfilledAt: "x",
      lifetimeReps: 9,
      machineStatsNote: "not ours",
    });
    expect(Object.keys(client).sort()).toEqual(["completedSessions", "lifetimeReps", "machineStatsNote", "trainerTally.t1"]);
    expect(Object.keys(totals).sort()).toEqual([
      "currentMachineMetrics.m-leg-press",
      "machineStatsBackfilledAt",
      "machineStats.m-leg-press.timesPerformed",
    ].sort());
    expect(isMachineTotalsKey("machineStats")).toBe(true);
    expect(isMachineTotalsKey("machineStatsX")).toBe(false);
  });

  it("turns a dot-path update into a set with mergeFields that names every path", () => {
    const inc = { __increment: 1 };
    const { data, mergeFields } = mergeWriteOf({
      "machineStats.m-a.timesPerformed": inc,
      "machineStats.m-a.lastWeight": 120,
      "currentMachineMetrics.m-a": { weight: "120", settings: { Seat: "3" } },
    });
    expect(mergeFields).toEqual(["machineStats.m-a.timesPerformed", "machineStats.m-a.lastWeight", "currentMachineMetrics.m-a"]);
    expect(data).toEqual({
      machineStats: { "m-a": { timesPerformed: inc, lastWeight: 120 } },
      currentMachineMetrics: { "m-a": { weight: "120", settings: { Seat: "3" } } },
    });
    // The value object is placed as given, never descended into.
    expect((data.machineStats as any)["m-a"].timesPerformed).toBe(inc);
  });
});

describe("whenOf", () => {
  it("reads every stored date shape, and nothing as null", () => {
    expect(whenOf(ts("2026-10-01T15:00:00Z"))).toBe(Date.parse("2026-10-01T15:00:00Z"));
    expect(whenOf({ seconds: 10, nanoseconds: 5_000_000 })).toBe(10_005);
    expect(whenOf(new Date("2026-10-01T00:00:00Z"))).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(whenOf("2026-10-01")).toBe(Date.parse("2026-10-01T12:00:00.000Z"));
    expect(whenOf(null)).toBeNull();
    expect(whenOf(undefined)).toBeNull();
    expect(whenOf("not a date")).toBeNull();
  });
});

describe("mergeMachineTotals: the one rule", () => {
  it("uses whichever side exists when only one does", () => {
    const metrics = { "m-a": { weight: "100", settings: {}, lastPerformedDate: ts("2026-09-01T14:00:00Z") } };
    expect(mergeMachineTotals({ currentMachineMetrics: metrics }, null).currentMachineMetrics).toBe(metrics);
    expect(mergeMachineTotals(null, { currentMachineMetrics: metrics }).currentMachineMetrics).toBe(metrics);
    expect(mergeMachineTotals({}, {})).toEqual({});
  });

  it("takes the later last set per machine, and the new side on a tie or a date still on its way", () => {
    const old = {
      currentMachineMetrics: {
        "m-a": { weight: "100", settings: {}, lastPerformedDate: ts("2026-09-01T14:00:00Z") },
        "m-b": { weight: "50", settings: {}, lastPerformedDate: ts("2026-09-20T14:00:00Z") },
        "m-c": { weight: "70", settings: {}, lastPerformedDate: ts("2026-09-20T14:00:00Z") },
        "m-d": { weight: "80", settings: {}, lastPerformedDate: ts("2026-09-20T14:00:00Z") },
      },
    };
    const neu = {
      currentMachineMetrics: {
        "m-a": { weight: "110", settings: {}, lastPerformedDate: ts("2026-10-01T14:00:00Z") },
        // An old iPad wrote m-b on the client after this: the old side is later.
        "m-b": { weight: "45", settings: {}, lastPerformedDate: ts("2026-09-10T14:00:00Z") },
        "m-c": { weight: "72", settings: {}, lastPerformedDate: ts("2026-09-20T14:00:00Z") },
        // Finish just wrote it; the server's timestamp hasn't come back yet.
        "m-d": { weight: "82", settings: {}, lastPerformedDate: null },
      },
    };
    const m = mergeMachineTotals(old, neu).currentMachineMetrics!;
    expect(m["m-a"].weight).toBe("110");
    expect(m["m-b"].weight).toBe("50");
    expect(m["m-c"].weight).toBe("72");
    expect(m["m-d"].weight).toBe("82");
  });

  it("adds the two sides' counts, takes the earlier first and the later last", () => {
    const old = {
      machineStats: {
        "m-a": { firstPerformedDate: "2025-01-05", firstWeight: 60, lastPerformedDate: "2026-09-20", lastWeight: 100, timesPerformed: 40 },
        "m-only-old": { timesPerformed: 3, lastPerformedDate: "2026-01-01", lastWeight: 20 },
      },
    };
    const neu = {
      machineStats: {
        // Counted since the split: no first (the old side had one), a later last.
        "m-a": { lastPerformedDate: "2026-10-01", lastWeight: 110, timesPerformed: 2 },
        "m-only-new": { firstPerformedDate: "2026-10-01", firstWeight: 30, lastPerformedDate: "2026-10-01", lastWeight: 30, timesPerformed: 1 },
      },
    };
    const s = mergeMachineTotals(old, neu).machineStats!;
    expect(s["m-a"]).toEqual({ firstPerformedDate: "2025-01-05", firstWeight: 60, lastPerformedDate: "2026-10-01", lastWeight: 110, timesPerformed: 42 });
    expect(s["m-only-old"].timesPerformed).toBe(3);
    expect(s["m-only-new"].timesPerformed).toBe(1);
  });

  it("gives a deleted session's count back across the two sides", () => {
    const s = mergeMachineTotals(
      { machineStats: { "m-a": { timesPerformed: 40, lastPerformedDate: "2026-09-20", lastWeight: 100 } } },
      { machineStats: { "m-a": { timesPerformed: -1 } } },
    ).machineStats!;
    expect(s["m-a"]).toEqual({ timesPerformed: 39, lastPerformedDate: "2026-09-20", lastWeight: 100 });
  });

  it("keeps the old side's last when it is the later one (an old iPad wrote after the split)", () => {
    const s = mergeMachineTotals(
      { machineStats: { "m-a": { timesPerformed: 41, lastPerformedDate: "2026-10-03", lastWeight: 105 } } },
      { machineStats: { "m-a": { timesPerformed: 1, lastPerformedDate: "2026-10-02", lastWeight: 104 } } },
    ).machineStats!;
    expect(s["m-a"]).toEqual({ timesPerformed: 42, lastPerformedDate: "2026-10-03", lastWeight: 105 });
  });

  it("keeps the backfill's marker from either side, the new side first", () => {
    expect(mergeMachineTotals({ machineStatsBackfilledAt: "old" }, {}).machineStatsBackfilledAt).toBe("old");
    expect(mergeMachineTotals({ machineStatsBackfilledAt: "old" }, { machineStatsBackfilledAt: "new" }).machineStatsBackfilledAt).toBe("new");
  });
});

describe("the client on screen", () => {
  const client = {
    id: "c1",
    firstName: "Ada",
    machineStats: { "m-a": { timesPerformed: 4 } },
  };

  it("folds the totals in, keeps the client's other fields, and remembers the state", () => {
    const merged = withMachineTotals(client, { state: "ready", data: { machineStats: { "m-a": { timesPerformed: 1 } } } });
    expect(merged.firstName).toBe("Ada");
    expect(merged.machineStats!["m-a"].timesPerformed).toBe(5);
    expect(machineTotalsStateOf(merged)).toBe("ready");
    expect(machineTotalsKnown(merged)).toBe(true);
    // The object it came from is untouched.
    expect(client.machineStats["m-a"].timesPerformed).toBe(4);
    expect(machineTotalsStateOf(client)).toBe("unmerged");
  });

  it("falls back to the client's own fields while the totals are loading, and says it doesn't know yet", () => {
    const loading = withMachineTotals(client, { state: "loading", data: null });
    expect(loading.machineStats).toBe(client.machineStats);
    expect(machineTotalsKnown(loading)).toBe(false);
    expect(machineTotalsKnown(withMachineTotals(client, { state: "failed", data: null }))).toBe(false);
    expect(machineTotalsKnown(withMachineTotals(client, { state: "missing", data: null }))).toBe(true);
    expect(machineTotalsKnown(null)).toBe(false);
    // A row that never went through the fold: its own fields are its answer.
    expect(machineTotalsKnown(client)).toBe(true);
  });

  it("a document only this iPad has written is not the whole story; a failure that still holds a whole answer is (the review, Oct 6 2026)", () => {
    const partial = withMachineTotals(client, { state: "loading", data: { machineStats: { "m-b": { timesPerformed: 1 } } }, complete: false });
    expect(partial.machineStats!["m-b"].timesPerformed).toBe(1);
    expect(machineTotalsKnown(partial)).toBe(false);
    const heldWhole = withMachineTotals(client, { state: "failed", data: { machineStats: {} }, complete: true });
    expect(machineTotalsStateOf(heldWhole)).toBe("failed");
    expect(machineTotalsKnown(heldWhole)).toBe(true);
    expect(machineTotalsKnown(withMachineTotals(client, { state: "failed", data: { machineStats: {} }, complete: false }))).toBe(false);
  });

  it("the same client with the same answer is the same object; a new answer or a changed client is a new one (the Wrap-up round, Oct 6 2026)", () => {
    const read = { state: "ready" as const, data: { machineStats: { "m-a": { timesPerformed: 1 } } } };
    const first = withMachineTotals(client, read);
    // The roster changed for somebody else: the same client object, the same answer.
    expect(withMachineTotals(client, read)).toBe(first);
    // The totals answered again: a new object, with the new answer and its state.
    const again = { state: "ready" as const, data: { machineStats: { "m-a": { timesPerformed: 2 } } } };
    const second = withMachineTotals(client, again);
    expect(second).not.toBe(first);
    expect(second.machineStats!["m-a"].timesPerformed).toBe(6);
    // The client's own document changed: a new object too.
    const changed = { ...client, firstName: "Adah" };
    const third = withMachineTotals(changed, again);
    expect(third).not.toBe(second);
    expect(third.firstName).toBe("Adah");
    // A loading answer after a ready one is said as loading, never the ready one's state.
    const loading = withMachineTotals(client, { state: "loading", data: null });
    expect(machineTotalsStateOf(loading)).toBe("loading");
    expect(machineTotalsKnown(loading)).toBe(false);
  });
});

describe("planClientSplit: the migration", () => {
  const today = "2026-10-06";
  const legacy = {
    firstName: "Ada",
    lastSessionDate: "2026-09-01",
    currentMachineMetrics: { "m-a": { weight: "100", settings: {}, lastPerformedDate: ts("2026-09-20T14:00:00Z") } },
    machineStats: { "m-a": { firstPerformedDate: "2025-01-05", firstWeight: 60, lastPerformedDate: "2026-09-20", lastWeight: 100, timesPerformed: 40 } },
    machineStatsBackfilledAt: "marker",
  };

  it("moves all three fields, and the client's last session forward to the last machine day", () => {
    const plan = planClientSplit(legacy, null, { dayOf, today });
    expect(plan.done).toBe(false);
    expect(plan.clientDeletes).toEqual(["currentMachineMetrics", "machineStats", "machineStatsBackfilledAt"]);
    expect(plan.totals).toEqual({
      currentMachineMetrics: legacy.currentMachineMetrics,
      machineStats: legacy.machineStats,
      machineStatsBackfilledAt: "marker",
    });
    expect(plan.lastSessionDate).toBe("2026-09-20");
  });

  it("never overwrites what the app already wrote to the totals document", () => {
    const already = {
      currentMachineMetrics: { "m-a": { weight: "110", settings: {}, lastPerformedDate: ts("2026-10-01T14:00:00Z") } },
      machineStats: { "m-a": { lastPerformedDate: "2026-10-01", lastWeight: 110, timesPerformed: 2 } },
    };
    const plan = planClientSplit(legacy, already, { dayOf, today });
    expect(plan.totals.currentMachineMetrics!["m-a"].weight).toBe("110");
    expect(plan.totals.machineStats!["m-a"]).toEqual({
      firstPerformedDate: "2025-01-05",
      firstWeight: 60,
      lastPerformedDate: "2026-10-01",
      lastWeight: 110,
      timesPerformed: 42,
    });
  });

  it("is the same view a reader had before the move, and a no-op the second time", () => {
    const already = { machineStats: { "m-a": { timesPerformed: 2, lastPerformedDate: "2026-10-01", lastWeight: 110 } } };
    const before = mergeMachineTotals(legacy, already);
    const plan = planClientSplit(legacy, already, { dayOf, today });
    // After: the client holds none of the fields, the document holds the plan.
    const after = mergeMachineTotals({ firstName: "Ada" }, plan.totals);
    expect(after).toEqual(before);
    const again = planClientSplit({ firstName: "Ada" }, plan.totals, { dayOf, today });
    expect(again.done).toBe(true);
    expect(again.clientDeletes).toEqual([]);
  });

  it("leaves a later lastSessionDate alone, and never moves it into the future", () => {
    expect(planClientSplit({ ...legacy, lastSessionDate: "2026-10-01" }, null, { dayOf, today }).lastSessionDate).toBeNull();
    const future = { ...legacy, machineStats: { "m-a": { lastPerformedDate: "2026-12-01" } } };
    expect(planClientSplit({ ...future, currentMachineMetrics: undefined }, null, { dayOf, today }).lastSessionDate).toBeNull();
  });

  it("reads a lastSessionDate stored as a Timestamp or a Date as its day, and never moves it back; an unreadable one is left alone", () => {
    expect(planClientSplit({ ...legacy, lastSessionDate: ts("2026-10-01T14:00:00Z") }, null, { dayOf, today }).lastSessionDate).toBeNull();
    expect(planClientSplit({ ...legacy, lastSessionDate: new Date("2026-10-01T14:00:00Z") }, null, { dayOf, today }).lastSessionDate).toBeNull();
    expect(planClientSplit({ ...legacy, lastSessionDate: ts("2026-09-01T14:00:00Z") }, null, { dayOf, today }).lastSessionDate).toBe("2026-09-20");
    expect(planClientSplit({ ...legacy, lastSessionDate: { nonsense: true } }, null, { dayOf, today }).lastSessionDate).toBeNull();
    expect(planClientSplit({ ...legacy, lastSessionDate: undefined }, null, { dayOf, today }).lastSessionDate).toBe("2026-09-20");
  });

  it("reads the last machine day from either map", () => {
    expect(latestMachineDay({ machineStats: { a: { lastPerformedDate: "2026-01-02" } }, currentMachineMetrics: { b: { weight: "1", settings: {}, lastPerformedDate: ts("2026-03-04T15:00:00Z") } } }, dayOf)).toBe("2026-03-04");
    expect(latestMachineDay({}, dayOf)).toBeNull();
  });
});

describe("splitWritesOf: the migration's two writes", () => {
  const ops = { delete: () => "DELETE", serverTimestamp: () => "NOW" };
  it("replaces the merged fields whole on the totals document and deletes them from the client", () => {
    const plan = planClientSplit(
      { lastSessionDate: "2026-09-01", machineStats: { a: { timesPerformed: 3, lastPerformedDate: "2026-09-20" } } },
      { currentMachineMetrics: { b: { weight: "10", settings: {}, lastPerformedDate: null } } },
      { dayOf, today: "2026-10-06" },
    );
    const w = splitWritesOf(plan, ops);
    expect(w.totals).toEqual({
      data: {
        currentMachineMetrics: { b: { weight: "10", settings: {}, lastPerformedDate: null } },
        machineStats: { a: { timesPerformed: 3, lastPerformedDate: "2026-09-20" } },
        updatedAt: "NOW",
      },
      mergeFields: ["currentMachineMetrics", "machineStats", "updatedAt"],
    });
    expect(w.client).toEqual({ machineStats: "DELETE", lastSessionDate: "2026-09-20" });
  });

  it("writes nothing for a client already moved", () => {
    expect(splitWritesOf(planClientSplit({ firstName: "x" }, null, { dayOf, today: "2026-10-06" }), ops)).toEqual({ totals: null, client: null });
  });
});
