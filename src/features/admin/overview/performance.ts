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

interface SetPoint {
  ms: number;
  day: string;
  weight: number;
  reps: number;
}

/**
 * The drops, grouped by the studio the set was logged at. `clientHomes`
 * fills in the studio for older logs that carry none.
 */
export function performanceDrops(
  logs: PerformanceLogInput[],
  opts: { now: Date; clientHomes?: Map<string, string | null> },
): Record<string, PerformanceRow[]> {
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
    // The studio of the LATEST set wins for the row's home; set below.
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
