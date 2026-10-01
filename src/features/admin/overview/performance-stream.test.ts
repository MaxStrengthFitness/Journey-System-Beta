/**
 * The streaming performance watch (job memory, Oct 1 2026) against the
 * version that held every set. `referenceDrops` below is `performanceDrops`
 * exactly as it was before the accumulator, kept verbatim so the two can be
 * compared on the same input: thousands of sets at a handful of weights
 * (equal times included, which a stable sort keeps in arrival order),
 * Timestamps, millisecond numbers and date-only rows, holds, practice sets,
 * and studios that change between sets. Fed in arrival order and in a shuffled
 * order, whole and a page at a time.
 */
import { describe, expect, it } from "vitest";
import {
  DROP_FRACTION,
  MAX_ROWS_PER_STUDIO,
  MIN_PRIOR_SETS,
  RECENT_DAYS,
  createPerformanceAccumulator,
  performanceDrops,
  type PerformanceLogInput,
  type PerformanceRow,
} from "./performance";
import { isPerformedLog } from "../../../lib/set-outcome";
import { millis } from "../insights/metrics";

/* ---------------- the version that held every set, verbatim ---------------- */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const dayOf = (log: PerformanceLogInput): string | null => {
  const ms = millis(log.createdAt);
  if (ms !== null) return new Date(ms).toISOString().slice(0, 10);
  if (typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(log.date)) return log.date.slice(0, 10);
  return null;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

interface SetPoint {
  ms: number;
  day: string;
  weight: number;
  reps: number;
}

function referenceDrops(logs: PerformanceLogInput[], opts: { now: Date; clientHomes?: Map<string, string | null> }): Record<string, PerformanceRow[]> {
  const nowMs = opts.now.getTime();
  const recentSince = nowMs - RECENT_DAYS * 86_400_000;
  const series = new Map<string, { studioId: string; points: SetPoint[] }>();

  for (const log of logs) {
    if (!log.clientId || !log.machineId) continue;
    if (!isPerformedLog(log)) continue;
    if (log.isStaticHold || log.isTSC) continue;
    const reps = num(log.reps ?? log.outcomeReps);
    const weight = num(log.weight);
    if (reps === null || weight === null || reps < 0) continue;
    const ms = millis(log.createdAt) ?? (log.date ? Date.parse(`${log.date.slice(0, 10)}T12:00:00Z`) : NaN);
    if (!Number.isFinite(ms)) continue;
    const day = dayOf(log);
    if (!day) continue;
    const studioId = log.studioId || log.homeStudioId || opts.clientHomes?.get(log.clientId) || null;
    if (!studioId) continue;
    const key = `${log.clientId}|${log.machineId}`;
    let entry = series.get(key);
    if (!entry) {
      entry = { studioId, points: [] };
      series.set(key, entry);
    }
    entry.points.push({ ms, day, weight, reps });
    entry.studioId = studioId;
  }

  const out: Record<string, PerformanceRow[]> = {};
  for (const [key, entry] of series) {
    const points = entry.points.sort((a, b) => a.ms - b.ms);
    const latest = points[points.length - 1];
    if (!latest || latest.ms < recentSince) continue;
    const earlier = points.slice(0, -1).filter((p) => Math.abs(p.weight - latest.weight) < 0.5).slice(-MIN_PRIOR_SETS);
    if (earlier.length < MIN_PRIOR_SETS) continue;
    const med = median(earlier.map((p) => p.reps));
    if (med <= 0) continue;
    const drop = (med - latest.reps) / med;
    if (drop < DROP_FRACTION) continue;
    const [clientId, machineId] = key.split("|");
    (out[entry.studioId] ??= []).push({
      clientId,
      machineId,
      weight: latest.weight,
      reps: latest.reps,
      medianReps: med,
      priorSets: earlier.length,
      day: latest.day,
      drop: Math.round(drop * 100) / 100,
    });
  }
  for (const studioId of Object.keys(out)) {
    out[studioId] = out[studioId].sort((a, b) => b.drop - a.drop || a.day.localeCompare(b.day)).slice(0, MAX_ROWS_PER_STUDIO);
  }
  return out;
}

/* ---------------- a seeded world ---------------- */

function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  return { next, pick, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

const NOW = new Date("2026-09-20T07:00:00.000Z");
const DAY = 86_400_000;

function world(seed: number, sets: number) {
  const r = seeded(seed);
  const logs: PerformanceLogInput[] = [];
  // Times on a coarse grid, so many sets share a moment.
  const at = () => NOW.getTime() - r.int(0, 60) * DAY / 2;
  for (let i = 0; i < sets; i += 1) {
    const ms = at();
    const when = r.next();
    logs.push({
      clientId: r.next() < 0.02 ? null : `c${r.int(0, 25)}`,
      machineId: r.pick(["m1", "m2", "m3"]),
      studioId: r.pick(["solon", "westlake", null, ""]),
      homeStudioId: r.next() < 0.3 ? r.pick(["solon", "willoughby"]) : null,
      weight: r.pick([100, 100, 100.2, 100.6, 110, "100", "100 lb", null]),
      reps: r.pick([10, 10, 9, 10, 4, 5, 6, "8", null, -1, 0]),
      outcomeReps: r.next() < 0.1 ? r.int(1, 12) : null,
      outcome: r.pick(["performed", "performed", "performed", "practice", null] as const),
      isStaticHold: r.next() < 0.03 ? true : null,
      isTSC: r.next() < 0.02 ? true : null,
      createdAt: when < 0.5 ? ms : when < 0.8 ? { toMillis: () => ms } : when < 0.9 ? new Date(ms).toISOString() : null,
      date: r.next() < 0.5 ? new Date(ms).toISOString().slice(0, 10) : r.pick([null, "garbage", "2026-02-30"]),
    });
  }
  const homes = new Map<string, string | null>(Array.from({ length: 26 }, (_, i) => [`c${i}`, r.pick(["solon", "westlake", null])] as [string, string | null]));
  return { logs, homes };
}

const shuffled = <T,>(list: readonly T[], seed: number): T[] => {
  const r = seeded(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

describe("the streaming performance watch gives exactly what the version that held every set gave", () => {
  for (const seed of [3, 11, 99, 2026, 31337]) {
    it(`seed ${seed}: in order and shuffled, whole and a page at a time`, () => {
      const { logs, homes } = world(seed, 3000);
      for (const input of [logs, shuffled(logs, seed + 1)]) {
        const reference = referenceDrops(input, { now: NOW, clientHomes: homes });
        expect(JSON.stringify(performanceDrops(input, { now: NOW, clientHomes: homes }))).toBe(JSON.stringify(reference));
        const acc = createPerformanceAccumulator({ now: NOW, clientHomes: homes });
        for (let i = 0; i < input.length; i += 113) for (const log of input.slice(i, i + 113)) acc.add(log);
        expect(JSON.stringify(acc.result())).toBe(JSON.stringify(reference));
      }
    });
  }

  it("finds drops in the seeded world, so the comparison is not of two empty answers", () => {
    const rows = Object.values(referenceDrops(world(2026, 3000).logs, { now: NOW, clientHomes: world(2026, 3000).homes })).flat();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("takes the last of equal times as the latest set, and its studio from the last set to arrive", () => {
    const t = NOW.getTime() - DAY;
    const set = (reps: number, studioId: string, ms = t - 10 * DAY): PerformanceLogInput => ({ clientId: "c1", machineId: "m1", studioId, weight: 100, reps, outcome: "performed", createdAt: ms });
    const logs = [set(10, "a"), set(10, "a"), set(10, "a"), set(10, "a"), set(10, "a"), set(4, "b", t), set(10, "c", t), set(3, "d", t - 20 * DAY)];
    const reference = referenceDrops(logs, { now: NOW });
    expect(performanceDrops(logs, { now: NOW })).toEqual(reference);
  });
});
