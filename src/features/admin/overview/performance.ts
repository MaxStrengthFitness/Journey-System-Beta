/**
 * PERFORMANCE DISCREPANCIES — "a client who dropped from ten reps to five".
 *
 * Round: Operations (Round B), Sep 2026. The third of the leader's four
 * Monday questions (ARCHITECTURE §1.5). Pure: the weekly machine-trends job
 * (server/machine-trends-job.ts) runs it over the 90-day window it already
 * reads and writes one small document per studio —
 * studios/{s}/watch/performance — which the Monday page reads. AJ, Sep 19:
 * the Sunday job writes the watch list; nothing is computed on the page.
 *
 * THE RULE, as the audit proposed it and tuned only where the data forces
 * it: on one machine, PERFORMED sets only, at the SAME weight, the client's
 * latest set is down by a third or more against the median of their last
 * five earlier sets at that weight — with at least five earlier sets, so a
 * newcomer's second week is never a "drop". Holds (seconds) are left out:
 * the question is about reps. The latest set has to be recent
 * (RECENT_DAYS) — a fall from two months ago is not Monday's news.
 *
 * WHAT IS WRITTEN. Client id, machine id, the numbers and the day — no
 * name, no clinical detail. The page joins the ids to the roster and the
 * machine list it already holds, so a renamed machine reads right and no
 * body data is copied. The document is the studio's (read by its people
 * under the machineFit rule); a client trained at another studio lands in
 * the studio the set was logged at.
 */
import { isPerformedLog, type OutcomeLog } from "../../../lib/set-outcome.ts";
import { millis } from "../insights/metrics.ts";

/** Earlier performed sets at the same weight needed before a drop is claimed. */
export const MIN_PRIOR_SETS = 5;
/** Down by this share of the median or more. */
export const DROP_FRACTION = 1 / 3;
/** The latest set must be this recent, in days, to be reported. */
export const RECENT_DAYS = 14;
/** The most rows a studio's document carries; the biggest drops first. */
export const MAX_ROWS_PER_STUDIO = 60;
/** Bumped when the rule changes, so a stale document is detectable. */
export const PERFORMANCE_WATCH_VERSION = 1;

export interface PerformanceLogInput extends OutcomeLog {
  clientId?: string | null;
  machineId?: string | null;
  studioId?: string | null;
  homeStudioId?: string | null;
  weight?: string | number | null;
  createdAt?: unknown;
  date?: string | null;
}

export interface PerformanceRow {
  clientId: string;
  machineId: string;
  weight: number;
  /** The latest set's reps. */
  reps: number;
  /** Median reps of the earlier sets at that weight. */
  medianReps: number;
  priorSets: number;
  /** YYYY-MM-DD (UTC day of the set's timestamp, or the log's date). */
  day: string;
  /** 0.4 = down 40%. */
  drop: number;
}

export interface PerformanceWatchDocument {
  version: number;
  studioId: string;
  builtAt: string;
  windowStart: string;
  windowEnd: string;
  rows: PerformanceRow[];
  /** Distinct clients in `rows`. */
  clients: number;
}

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

/**
 * One client on one machine: every usable set's time, weight and reps, in
 * the order they arrived (three plain number lists, not an object a set: the
 * weekly job streams 90 days of every client's sets through this). Only the
 * latest set's day is kept, since it is the only day a row reports.
 */
interface Series {
  studioId: string;
  ms: number[];
  weight: number[];
  reps: number[];
  /** The latest set: the greatest time, and of equal times the last to arrive (a stable sort's last). */
  latest: number;
  latestDay: string;
}

/**
 * The drops, grouped by the studio the set was logged at. `clientHomes`
 * fills in the studio for older logs that carry none.
 *
 * The same as feeding every log to `createPerformanceAccumulator` in order
 * and asking for the result, which is how it is built.
 */
export function performanceDrops(
  logs: PerformanceLogInput[],
  opts: { now: Date; clientHomes?: Map<string, string | null> },
): Record<string, PerformanceRow[]> {
  const acc = createPerformanceAccumulator(opts);
  for (const log of logs) acc.add(log);
  return acc.result();
}

/** The performance watch, one set at a time (see createPerformanceAccumulator). */
export interface PerformanceAccumulator {
  add(log: PerformanceLogInput): void;
  /** The drops of every set added so far, by studio. Ask once, at the end. */
  result(): Record<string, PerformanceRow[]>;
}

/**
 * The streaming form of `performanceDrops` (job memory, Oct 1 2026): the
 * weekly job streams the window's sets through it rather than holding them
 * all. In any order, fed the same sets in the same order, it gives exactly
 * what the version that held every set gave (performance-stream.test.ts):
 * the sets are ordered by time with ties kept in arrival order, the latest
 * set is the last of them, and its studio is the last set's to arrive.
 */
export function createPerformanceAccumulator(opts: { now: Date; clientHomes?: Map<string, string | null> }): PerformanceAccumulator {
  const nowMs = opts.now.getTime();
  const recentSince = nowMs - RECENT_DAYS * 86_400_000;
  const series = new Map<string, Series>();

  const add = (log: PerformanceLogInput): void => {
    if (!log.clientId || !log.machineId) return;
    if (!isPerformedLog(log)) return;
    if (log.isStaticHold || log.isTSC) return;
    const reps = num(log.reps ?? log.outcomeReps);
    const weight = num(log.weight);
    if (reps === null || weight === null || reps < 0) return;
    const ms = millis(log.createdAt) ?? (log.date ? Date.parse(`${log.date.slice(0, 10)}T12:00:00Z`) : NaN);
    if (!Number.isFinite(ms)) return;
    const day = dayOf(log);
    if (!day) return;
    const studioId = log.studioId || log.homeStudioId || opts.clientHomes?.get(log.clientId) || null;
    if (!studioId) return;
    const key = `${log.clientId}|${log.machineId}`;
    let entry = series.get(key);
    if (!entry) {
      entry = { studioId, ms: [], weight: [], reps: [], latest: -1, latestDay: day };
      series.set(key, entry);
    }
    // The studio of the LATEST set to arrive wins for the row's home.
    const at = entry.ms.length;
    entry.ms.push(ms);
    entry.weight.push(weight);
    entry.reps.push(reps);
    if (entry.latest < 0 || ms >= entry.ms[entry.latest]) {
      entry.latest = at;
      entry.latestDay = day;
    }
    entry.studioId = studioId;
  };

  const result = (): Record<string, PerformanceRow[]> => {
    const out: Record<string, PerformanceRow[]> = {};
    for (const [key, entry] of series) {
      const latest = entry.latest;
      if (latest < 0 || entry.ms[latest] < recentSince) continue;
      const latestWeight = entry.weight[latest];
      // Every other set at that weight, by time (ties in arrival order), the last five.
      const near: number[] = [];
      for (let i = 0; i < entry.ms.length; i += 1) {
        if (i !== latest && Math.abs(entry.weight[i] - latestWeight) < 0.5) near.push(i);
      }
      const earlier = near.sort((a, b) => entry.ms[a] - entry.ms[b] || a - b).slice(-MIN_PRIOR_SETS);
      if (earlier.length < MIN_PRIOR_SETS) continue;
      const med = median(earlier.map((i) => entry.reps[i]));
      if (med <= 0) continue;
      const latestReps = entry.reps[latest];
      const drop = (med - latestReps) / med;
      if (drop < DROP_FRACTION) continue;
      const [clientId, machineId] = key.split("|");
      (out[entry.studioId] ??= []).push({
        clientId,
        machineId,
        weight: latestWeight,
        reps: latestReps,
        medianReps: med,
        priorSets: earlier.length,
        day: entry.latestDay,
        drop: Math.round(drop * 100) / 100,
      });
    }
    for (const studioId of Object.keys(out)) {
      out[studioId] = out[studioId].sort((a, b) => b.drop - a.drop || a.day.localeCompare(b.day)).slice(0, MAX_ROWS_PER_STUDIO);
    }
    return out;
  };

  return { add, result };
}

export function performanceWatchDocument(
  studioId: string,
  rows: PerformanceRow[],
  window: { start: string; end: string; builtAt: string },
): PerformanceWatchDocument {
  return {
    version: PERFORMANCE_WATCH_VERSION,
    studioId,
    builtAt: window.builtAt,
    windowStart: window.start,
    windowEnd: window.end,
    rows,
    clients: new Set(rows.map((r) => r.clientId)).size,
  };
}

/** "Down from about 10 reps to 5 at 90 lb". */
export function dropSentence(row: PerformanceRow, machineName: string): string {
  const from = Number.isInteger(row.medianReps) ? String(row.medianReps) : `about ${Math.round(row.medianReps)}`;
  return `${machineName}: down from ${from} reps to ${row.reps} at ${row.weight} lb, over the last ${row.priorSets} sets at that weight.`;
}
