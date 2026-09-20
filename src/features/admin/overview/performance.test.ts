import { describe, expect, it } from "vitest";
import { DROP_FRACTION, MIN_PRIOR_SETS, dropSentence, performanceDrops, performanceWatchDocument, type PerformanceLogInput } from "./performance";

const NOW = new Date("2026-09-20T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** One performed set: `n` days ago. */
const set = (clientId: string, reps: number, daysAgo: number, extra: Partial<PerformanceLogInput> = {}): PerformanceLogInput => ({
  clientId,
  machineId: "m-leg-press",
  studioId: "solon",
  weight: 90,
  reps,
  outcome: "performed",
  createdAt: day(daysAgo),
  ...extra,
});

/** Five earlier sets of ten reps, then the latest. */
const history = (clientId: string, latestReps: number, latestDaysAgo = 1) => [
  set(clientId, 10, 30),
  set(clientId, 10, 26),
  set(clientId, 11, 22),
  set(clientId, 10, 18),
  set(clientId, 9, 14),
  set(clientId, latestReps, latestDaysAgo),
];

describe("performanceDrops — down by a third at the same weight", () => {
  it("flags ten reps to five, with the evidence, under the studio the set was logged at", () => {
    const drops = performanceDrops(history("c1", 5), { now: NOW });
    expect(drops.solon).toHaveLength(1);
    expect(drops.solon[0]).toMatchObject({ clientId: "c1", machineId: "m-leg-press", weight: 90, reps: 5, medianReps: 10, priorSets: 5, drop: 0.5 });
    expect(drops.solon[0].day).toBe("2026-09-19");
  });

  it("does not flag a normal dip, and does flag exactly a third", () => {
    expect(performanceDrops(history("c1", 8), { now: NOW })).toEqual({});
    // A third of ten is 3.33; 6 reps is a drop of 0.4, 7 reps is 0.3.
    expect(performanceDrops(history("c1", 7), { now: NOW })).toEqual({});
    expect(performanceDrops(history("c1", 6), { now: NOW }).solon).toHaveLength(1);
    expect(DROP_FRACTION).toBeCloseTo(1 / 3);
  });

  it("needs five earlier sets at the same weight — a newcomer, or a client who just went up in weight, is never a drop", () => {
    const newcomer = history("c1", 5).slice(2);
    expect(performanceDrops(newcomer, { now: NOW })).toEqual({});
    const wentUp = [...history("c1", 10, 3), set("c1", 4, 1, { weight: 100 })];
    expect(performanceDrops(wentUp, { now: NOW })).toEqual({});
    expect(MIN_PRIOR_SETS).toBe(5);
  });

  it("ignores skipped and practice sets, holds, and a drop that is not recent", () => {
    const withSkips = [...history("c1", 5), set("c1", 0, 0.5, { outcome: "skipped" })];
    // The skipped set is not the latest performed one; the drop still stands.
    expect(performanceDrops(withSkips, { now: NOW }).solon).toHaveLength(1);
    const practice = history("c1", 5).map((s, i, all) => (i === all.length - 1 ? { ...s, outcome: "practice" as const } : s));
    expect(performanceDrops(practice, { now: NOW })).toEqual({});
    const hold = history("c1", 5).map((s, i, all) => (i === all.length - 1 ? { ...s, isStaticHold: true } : s));
    expect(performanceDrops(hold, { now: NOW })).toEqual({});
    const old = history("c1", 5, 20).map((s) => ({ ...s, createdAt: day(20 + 30) }));
    expect(performanceDrops(old, { now: NOW })).toEqual({});
  });

  it("falls back to the client's home studio for a log with no studio, and puts the biggest drop first", () => {
    const logs = [
      ...history("c1", 6).map((s) => ({ ...s, studioId: null })),
      ...history("c2", 3).map((s) => ({ ...s, studioId: null })),
    ];
    const homes = new Map([
      ["c1", "westlake"],
      ["c2", "westlake"],
    ]);
    const drops = performanceDrops(logs, { now: NOW, clientHomes: homes });
    expect(Object.keys(drops)).toEqual(["westlake"]);
    expect(drops.westlake.map((r) => r.clientId)).toEqual(["c2", "c1"]);
  });

  it("builds the studio's document and a sentence a leader can read", () => {
    const rows = performanceDrops(history("c1", 5), { now: NOW }).solon;
    const doc = performanceWatchDocument("solon", rows, { start: "2026-06-22", end: "2026-09-20", builtAt: NOW.toISOString() });
    expect(doc).toMatchObject({ version: 1, studioId: "solon", clients: 1, windowStart: "2026-06-22" });
    expect(dropSentence(rows[0], "Leg Press")).toBe("Leg Press: down from 10 reps to 5 at 90 lb, over the last 5 sets at that weight.");
  });
});
