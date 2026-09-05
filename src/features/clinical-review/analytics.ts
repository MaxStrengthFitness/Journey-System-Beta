/**
 * ANALYTICS — pure functions over SessionFact / SetFact.
 *
 * Design rules that keep these honest for a trainer reading them on a gym
 * floor:
 *
 *  1. OUTCOMES ARE DETRENDED WHERE THE DATA TRENDS. A client's tonnage rises
 *     as they progress, so "poor sleep → lower tonnage" would otherwise just
 *     mean "the poor-sleep sessions happened early". Tonnage / reps / TUT are
 *     therefore compared as an INDEX against the client's own trailing
 *     baseline (mean of the previous N sessions). Rates (poor / max share) are
 *     already stationary and are used as-is.
 *
 *  2. EVERY NUMBER CARRIES ITS n. A level with two sessions is shown but
 *     labelled "insufficient"; three to five is "early"; six or more is
 *     "solid". Insights are only generated from early/solid levels and only
 *     when the effect clears a size threshold (see insights.ts).
 *
 *  3. NOTHING HERE FABRICATES DATA. If time under tension was never captured
 *     the TUT panel says so (see `Summary.tutCoverage`) instead of estimating.
 */

import type { RepQuality } from "../../types";
import type {
  Confidence,
  Correlation,
  DimensionKey,
  HeatCell,
  HeatRow,
  Heatmap,
  LevelStat,
  MachinePlateau,
  OutcomeKey,
  PlateauStatus,
  SessionFact,
  SetFact,
  Summary,
  WeekBucket,
} from "./types";
import { ENERGY_ORDER, MOOD_ORDER, POST_FEEL_ORDER, SLEEP_ORDER } from "./types";
import { dayMs, daysBetween } from "./facts";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function confidenceFor(n: number): Confidence {
  if (n >= 6) return "solid";
  if (n >= 3) return "early";
  return "insufficient";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}
export function shortDateYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** ISO Monday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const d = new Date(dayMs(iso));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

export function summarize(facts: SessionFact[]): Summary {
  const sessions = facts.length;
  let tonnage = 0;
  let reps = 0;
  let tut = 0;
  let sets = 0;
  let setsWithTut = 0;
  let setsRated = 0;
  let setsMax = 0;
  let setsDone = 0;
  let setsPoor = 0;
  let withCheckIn = 0;
  const rests: number[] = [];
  for (const f of facts) {
    tonnage += f.tonnage;
    reps += f.reps;
    tut += f.tutSeconds;
    sets += f.sets;
    setsWithTut += f.setsWithTut;
    setsRated += f.setsRated;
    setsMax += f.setsMax;
    setsDone += f.setsDone;
    setsPoor += f.setsPoor;
    if (f.sleep || f.stress || f.energy || f.mood || f.stiffRegions.length || f.primeRegions.length) withCheckIn += 1;
    if (f.restDays !== null && f.restDays > 0) rests.push(f.restDays);
  }
  const first = facts[0]?.date ?? null;
  const last = facts[facts.length - 1]?.date ?? null;
  const spanDays = first && last ? Math.max(1, daysBetween(first, last) + 1) : 1;
  return {
    sessions,
    tonnage,
    reps,
    tutSeconds: tut,
    setsRated,
    setsMax,
    setsDone,
    setsPoor,
    maxRate: setsRated ? setsMax / setsRated : null,
    poorRate: setsRated ? setsPoor / setsRated : null,
    tutCoverage: sets ? setsWithTut / sets : 0,
    checkInCoverage: sessions ? withCheckIn / sessions : 0,
    sessionsPerWeek: sessions >= 2 ? sessions / (spanDays / 7) : null,
    medianRestDays: median(rests),
    longestGapDays: rests.length ? Math.max(...rests) : null,
    firstDate: first,
    lastDate: last,
    spanDays,
  };
}

/* ------------------------------------------------------------------ *
 * Baseline indexes (detrending)
 * ------------------------------------------------------------------ */

export interface IndexedFact extends SessionFact {
  /** tonnage vs trailing mean, as a % (0 = on baseline, +8 = 8% above). Null for the first sessions. */
  tonnageIndex: number | null;
  repsIndex: number | null;
  tutIndex: number | null;
}

/**
 * Compare each session with the mean of the previous `window` sessions that
 * had the same measure. The first `minPrior` sessions have no baseline and
 * get null — they are still counted for rates.
 */
export function withBaselines(facts: SessionFact[], window = 5, minPrior = 3): IndexedFact[] {
  const out: IndexedFact[] = [];
  const idx = (value: number, history: number[]): number | null => {
    if (value <= 0 || history.length < minPrior) return null;
    const base = mean(history.slice(-window));
    if (!base || base <= 0) return null;
    const pct = ((value - base) / base) * 100;
    // A session more than 2.5× or less than a fifth of its own baseline is a
    // logging artefact (a half-finished session, a machine logged twice),
    // not a training fact. Drop it from the index rather than let it steer.
    return pct > 150 || pct < -80 ? null : pct;
  };
  const tonHist: number[] = [];
  const repHist: number[] = [];
  const tutHist: number[] = [];
  for (const f of facts) {
    out.push({
      ...f,
      tonnageIndex: idx(f.tonnage, tonHist),
      repsIndex: idx(f.reps, repHist),
      tutIndex: idx(f.tutSeconds, tutHist),
    });
    if (f.tonnage > 0) tonHist.push(f.tonnage);
    if (f.reps > 0) repHist.push(f.reps);
    if (f.tutSeconds > 0) tutHist.push(f.tutSeconds);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Dimensions & outcomes
 * ------------------------------------------------------------------ */

export interface DimensionSpec {
  key: DimensionKey;
  label: string;
  /** Ordered level ids; levels not listed are appended in first-seen order. */
  order: string[];
  labels: Record<string, string>;
  levelOf: (f: SessionFact) => string | null;
}

export const REST_BUCKETS = ["1", "2", "3-4", "5-7", "8-14", "15+"] as const;
export function restBucket(days: number | null): string | null {
  if (days === null || days <= 0) return null;
  if (days === 1) return "1";
  if (days === 2) return "2";
  if (days <= 4) return "3-4";
  if (days <= 7) return "5-7";
  if (days <= 14) return "8-14";
  return "15+";
}

export const TIME_BUCKETS = ["morning", "midday", "afternoon", "evening"] as const;
export function timeBucket(hour: number | null): string | null {
  if (hour === null) return null;
  if (hour < 11) return "morning";
  if (hour < 14) return "midday";
  if (hour < 17) return "afternoon";
  return "evening";
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DIMENSIONS: DimensionSpec[] = [
  {
    key: "sleep",
    label: "Sleep",
    order: SLEEP_ORDER,
    labels: { poor: "Poor", average: "Average", optimal: "Optimal" },
    levelOf: (f) => f.sleep,
  },
  {
    key: "stress",
    label: "Stress",
    order: ["low", "moderate", "high"],
    labels: { low: "Low (1–2)", moderate: "Moderate (3)", high: "High (4–5)" },
    levelOf: (f) => (f.stress === null ? null : f.stress <= 2 ? "low" : f.stress === 3 ? "moderate" : "high"),
  },
  {
    key: "energy",
    label: "Energy",
    order: ENERGY_ORDER,
    labels: { low: "Low", normal: "Normal", high: "High" },
    levelOf: (f) => f.energy,
  },
  {
    key: "mood",
    label: "Mood",
    order: MOOD_ORDER,
    labels: { low: "Low", neutral: "Neutral", good: "Good" },
    levelOf: (f) => f.mood,
  },
  {
    key: "stiffness",
    label: "Body state",
    order: ["prime", "none", "stiff"],
    labels: { prime: "Felt prime", none: "Nothing flagged", stiff: "Stiff somewhere" },
    levelOf: (f) =>
      f.stiffRegions.length ? "stiff" : f.primeRegions.length ? "prime" : f.sleep || f.stress || f.energy || f.mood ? "none" : null,
  },
  {
    key: "postFeel",
    label: "Felt after",
    order: POST_FEEL_ORDER,
    labels: { "Wiped Out": "Wiped out", Good: "Good", Energized: "Energized" },
    levelOf: (f) => f.postFeel,
  },
  {
    key: "restGap",
    label: "Days since last session",
    order: [...REST_BUCKETS],
    labels: { "1": "1 day", "2": "2 days", "3-4": "3–4 days", "5-7": "5–7 days", "8-14": "8–14 days", "15+": "15+ days" },
    levelOf: (f) => restBucket(f.restDays),
  },
  {
    key: "timeOfDay",
    label: "Time of day",
    order: [...TIME_BUCKETS],
    labels: { morning: "Morning (before 11)", midday: "Midday (11–2)", afternoon: "Afternoon (2–5)", evening: "Evening (after 5)" },
    levelOf: (f) => timeBucket(f.hour),
  },
  {
    key: "dayOfWeek",
    label: "Day of week",
    order: ["1", "2", "3", "4", "5", "6", "0"],
    labels: Object.fromEntries(DOW.map((d, i) => [String(i), d])),
    levelOf: (f) => String(f.dayOfWeek),
  },
  {
    key: "trainer",
    label: "Trainer",
    order: [],
    labels: {},
    levelOf: (f) => f.trainerInitials || null,
  },
  {
    key: "crossTrain",
    label: "Studio",
    order: ["home", "cross"],
    labels: { home: "Home studio", cross: "Cross-train visit" },
    levelOf: (f) => (f.isCrossTrain ? "cross" : "home"),
  },
];

export const DIMENSION_BY_KEY: Record<DimensionKey, DimensionSpec> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d]),
) as Record<DimensionKey, DimensionSpec>;

export interface OutcomeSpec {
  key: OutcomeKey;
  label: string;
  /** "pp" = percentage points (rates), "%" = index vs baseline, "" = raw. */
  unit: "pp" | "%" | "";
  /** Higher is better for the client? */
  higherIsBetter: boolean;
  /** Minimum |delta| for an insight to be worth a sentence. */
  meaningfulDelta: number;
  valueOf: (f: IndexedFact) => number | null;
}

export const OUTCOMES: OutcomeSpec[] = [
  {
    key: "poorRate",
    label: "Poor-quality sets",
    unit: "pp",
    higherIsBetter: false,
    meaningfulDelta: 6,
    valueOf: (f) => (f.setsRated ? (f.setsPoor / f.setsRated) * 100 : null),
  },
  {
    key: "maxRate",
    label: "Max-strength sets",
    unit: "pp",
    higherIsBetter: true,
    meaningfulDelta: 6,
    valueOf: (f) => (f.setsRated ? (f.setsMax / f.setsRated) * 100 : null),
  },
  {
    key: "tonnageIndex",
    label: "Tonnage vs baseline",
    unit: "%",
    higherIsBetter: true,
    meaningfulDelta: 5,
    valueOf: (f) => f.tonnageIndex,
  },
  {
    key: "repsIndex",
    label: "Total reps vs baseline",
    unit: "%",
    higherIsBetter: true,
    meaningfulDelta: 5,
    valueOf: (f) => f.repsIndex,
  },
  {
    key: "tutIndex",
    label: "Time under tension vs baseline",
    unit: "%",
    higherIsBetter: true,
    meaningfulDelta: 5,
    valueOf: (f) => f.tutIndex,
  },
  {
    key: "avgRpe",
    label: "Average RPE",
    unit: "",
    higherIsBetter: false,
    meaningfulDelta: 0.8,
    valueOf: (f) => f.avgRpe,
  },
];

export const OUTCOME_BY_KEY: Record<OutcomeKey, OutcomeSpec> = Object.fromEntries(
  OUTCOMES.map((o) => [o.key, o]),
) as Record<OutcomeKey, OutcomeSpec>;

/* ------------------------------------------------------------------ *
 * Correlation — grouped means with n
 * ------------------------------------------------------------------ */

export function correlate(facts: IndexedFact[], dimension: DimensionSpec, outcome: OutcomeSpec): Correlation {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const f of facts) {
    const level = dimension.levelOf(f);
    const value = outcome.valueOf(f);
    if (level === null || value === null) continue;
    const list = groups.get(level) ?? [];
    list.push(value);
    groups.set(level, list);
    all.push(value);
  }
  const overall = mean(all);
  const seen = [...groups.keys()];
  const ordered = [...dimension.order.filter((l) => groups.has(l)), ...seen.filter((l) => !dimension.order.includes(l))];
  const levels: LevelStat[] = ordered.map((level) => {
    const xs = groups.get(level) ?? [];
    const m = mean(xs);
    return {
      level,
      label: dimension.labels[level] ?? level,
      n: xs.length,
      mean: m,
      delta: m !== null && overall !== null ? m - overall : null,
      confidence: confidenceFor(xs.length),
    };
  });
  const usable = levels.filter((l) => l.confidence !== "insufficient" && l.delta !== null);
  const standout = usable.length
    ? usable.reduce((best, l) => (Math.abs(l.delta!) > Math.abs(best.delta!) ? l : best), usable[0])
    : null;
  const means = usable.map((l) => l.mean!).filter((x) => x !== null);
  return {
    dimension: dimension.key,
    dimensionLabel: dimension.label,
    outcome: outcome.key,
    outcomeLabel: outcome.label,
    n: all.length,
    overallMean: overall,
    levels,
    standout,
    spread: means.length >= 2 ? Math.max(...means) - Math.min(...means) : null,
  };
}

/** Every dimension × outcome that has at least one usable level. */
export function correlationMatrix(facts: IndexedFact[]): Correlation[] {
  const out: Correlation[] = [];
  for (const d of DIMENSIONS) {
    for (const o of OUTCOMES) {
      const c = correlate(facts, d, o);
      if (c.levels.length >= 2 && c.n >= 3) out.push(c);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Weekly trend
 * ------------------------------------------------------------------ */

export function weeklyTrend(facts: SessionFact[]): WeekBucket[] {
  if (!facts.length) return [];
  const byWeek = new Map<string, WeekBucket>();
  for (const f of facts) {
    const ws = weekStartOf(f.date);
    const b =
      byWeek.get(ws) ??
      ({
        weekStart: ws,
        label: shortDate(ws),
        sessions: 0,
        tonnage: 0,
        reps: 0,
        tutSeconds: 0,
        setsWithTut: 0,
        sets: 0,
        setsRated: 0,
        setsMax: 0,
        setsDone: 0,
        setsPoor: 0,
      } satisfies WeekBucket);
    b.sessions += 1;
    b.tonnage += f.tonnage;
    b.reps += f.reps;
    b.tutSeconds += f.tutSeconds;
    b.setsWithTut += f.setsWithTut;
    b.sets += f.sets;
    b.setsRated += f.setsRated;
    b.setsMax += f.setsMax;
    b.setsDone += f.setsDone;
    b.setsPoor += f.setsPoor;
    byWeek.set(ws, b);
  }
  // Fill empty weeks so a fortnight off shows as a gap, not a seam.
  const keys = [...byWeek.keys()].sort();
  const out: WeekBucket[] = [];
  let cursor = keys[0];
  const last = keys[keys.length - 1];
  while (cursor <= last) {
    out.push(
      byWeek.get(cursor) ?? {
        weekStart: cursor,
        label: shortDate(cursor),
        sessions: 0,
        tonnage: 0,
        reps: 0,
        tutSeconds: 0,
        setsWithTut: 0,
        sets: 0,
        setsRated: 0,
        setsMax: 0,
        setsDone: 0,
        setsPoor: 0,
      },
    );
    const d = new Date(dayMs(cursor));
    d.setDate(d.getDate() + 7);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return out;
}

/**
 * Monthly buckets for long ranges — the same shape as `weeklyTrend`, so the
 * charts do not care which one they get. Above ~26 weeks a weekly bar is a
 * few pixels wide and reads as texture, not data.
 */
export function monthlyTrend(facts: SessionFact[]): WeekBucket[] {
  if (!facts.length) return [];
  const byMonth = new Map<string, WeekBucket>();
  const label = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  };
  for (const f of facts) {
    const k = monthKeyOf(f.date);
    const b =
      byMonth.get(k) ??
      ({ weekStart: `${k}-01`, label: label(k), sessions: 0, tonnage: 0, reps: 0, tutSeconds: 0, setsWithTut: 0, sets: 0, setsRated: 0, setsMax: 0, setsDone: 0, setsPoor: 0 } satisfies WeekBucket);
    b.sessions += 1;
    b.tonnage += f.tonnage;
    b.reps += f.reps;
    b.tutSeconds += f.tutSeconds;
    b.setsWithTut += f.setsWithTut;
    b.sets += f.sets;
    b.setsRated += f.setsRated;
    b.setsMax += f.setsMax;
    b.setsDone += f.setsDone;
    b.setsPoor += f.setsPoor;
    byMonth.set(k, b);
  }
  const keys = [...byMonth.keys()].sort();
  const out: WeekBucket[] = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push(byMonth.get(k) ?? { weekStart: `${k}-01`, label: label(k), sessions: 0, tonnage: 0, reps: 0, tutSeconds: 0, setsWithTut: 0, sets: 0, setsRated: 0, setsMax: 0, setsDone: 0, setsPoor: 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Form-breakdown heatmap
 * ------------------------------------------------------------------ */

export interface HeatmapOptions {
  /** "week" for ranges up to ~3 months, "month" beyond. */
  period: "week" | "month";
  machineName: (id: string) => string;
  machineGroup: (id: string) => string;
  /** Rows need at least this many rated sets to appear (default 3). */
  minRated?: number;
}

function periodKey(iso: string, period: "week" | "month"): string {
  return period === "week" ? weekStartOf(iso) : monthKeyOf(iso);
}
function periodLabel(key: string, period: "week" | "month"): string {
  if (period === "week") return shortDate(key);
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

const emptyCell = (): HeatCell => ({ poor: 0, rated: 0, rate: null });
const finalize = (c: HeatCell): HeatCell => ({ ...c, rate: c.rated ? c.poor / c.rated : null });

export function formHeatmap(sets: SetFact[], options: HeatmapOptions): Heatmap {
  const minRated = options.minRated ?? 3;
  const rated = sets.filter((s) => s.quality !== null);
  if (!rated.length) return { columns: [], rows: [], groups: [], maxRate: 0 };

  const keys = [...new Set(rated.map((s) => periodKey(s.date, options.period)))].sort();
  const colIndex = new Map(keys.map((k, i) => [k, i]));
  const columns = keys.map((k) => ({ key: k, label: periodLabel(k, options.period) }));

  const rowMap = new Map<string, HeatRow>();
  const groupMap = new Map<string, HeatRow>();
  const bump = (row: HeatRow, col: number, poor: boolean) => {
    row.cells[col].rated += 1;
    row.total.rated += 1;
    if (poor) {
      row.cells[col].poor += 1;
      row.total.poor += 1;
    }
  };
  for (const s of rated) {
    const col = colIndex.get(periodKey(s.date, options.period))!;
    const poor = s.quality === 1;
    let row = rowMap.get(s.machineId);
    if (!row) {
      row = {
        machineId: s.machineId,
        machineName: options.machineName(s.machineId),
        group: options.machineGroup(s.machineId),
        cells: keys.map(emptyCell),
        total: emptyCell(),
      };
      rowMap.set(s.machineId, row);
    }
    bump(row, col, poor);
    let g = groupMap.get(row.group);
    if (!g) {
      g = { machineId: `group:${row.group}`, machineName: row.group, group: row.group, cells: keys.map(emptyCell), total: emptyCell() };
      groupMap.set(row.group, g);
    }
    bump(g, col, poor);
  }

  const rows = [...rowMap.values()]
    .filter((r) => r.total.rated >= minRated)
    .map((r) => ({ ...r, cells: r.cells.map(finalize), total: finalize(r.total) }))
    // Worst first — the machines that need the conversation float to the top.
    .sort((a, b) => (b.total.rate ?? 0) - (a.total.rate ?? 0) || b.total.rated - a.total.rated);
  const groups = [...groupMap.values()]
    .map((r) => ({ ...r, cells: r.cells.map(finalize), total: finalize(r.total) }))
    .sort((a, b) => (b.total.rate ?? 0) - (a.total.rate ?? 0));
  const maxRate = Math.max(0, ...rows.flatMap((r) => r.cells.map((c) => c.rate ?? 0)));
  return { columns, rows, groups, maxRate };
}

/* ------------------------------------------------------------------ *
 * Plateau identification
 * ------------------------------------------------------------------ */

export interface PlateauOptions {
  machineName: (id: string) => string;
  machineGroup: (id: string) => string;
  /** Sessions on a machine needed before a verdict (default 4). */
  minSessions?: number;
  /** Consecutive same-load sessions with no outcome gain that count as a stall (default 5). */
  stallSessions?: number;
}

/**
 * One row per machine that appears in the range. Verdict rules, in order:
 *   insufficient  fewer than `minSessions` sessions on the machine
 *   regressing    load down vs the first session in range, or the outcome at
 *                 the current load down since it was first lifted
 *   progressing   load up, OR the outcome at the current load up
 *   plateau       otherwise — same load, outcome flat, for the whole range
 *
 * "Outcome" is reps for a normal set and SECONDS for a timed static
 * contraction (a TSC progresses by holding longer, not by more reps). The
 * gain that counts as progress is +2 reps or +10 seconds.
 */
export function detectPlateaus(sets: SetFact[], options: PlateauOptions): MachinePlateau[] {
  const minSessions = options.minSessions ?? 4;
  const stallSessions = options.stallSessions ?? 5;
  const outcomeOf = (s: SetFact): number | null => (s.isTSC ? s.seconds : s.reps);
  const gainFor = (s: SetFact): number => (s.isTSC ? 10 : 2);
  const byMachine = new Map<string, SetFact[]>();
  for (const s of sets) {
    const list = byMachine.get(s.machineId) ?? [];
    list.push(s);
    byMachine.set(s.machineId, list);
  }
  const out: MachinePlateau[] = [];
  for (const [machineId, list] of byMachine) {
    // One point per session (first set of the session wins).
    const perSession = new Map<string, SetFact>();
    for (const s of [...list].sort((a, b) => a.dayMs - b.dayMs)) if (!perSession.has(s.sessionId)) perSession.set(s.sessionId, s);
    const series = [...perSession.values()].sort((a, b) => a.dayMs - b.dayMs);
    const weighted = series.filter((s) => s.weight !== null && s.weight > 0);
    const first = weighted[0] ?? null;
    const last = weighted[weighted.length - 1] ?? null;
    const best = weighted.reduce<number | null>((m, s) => (m === null || (s.weight ?? 0) > m ? s.weight : m), null);
    const rated = list.filter((s) => s.quality !== null);
    const poor = rated.filter((s) => s.quality === 1).length;

    let sessionsAtCurrent = 0;
    let repsAtCurrentFirst: number | null = null;
    let repsAtCurrentLast: number | null = null;
    if (last) {
      for (let i = weighted.length - 1; i >= 0; i--) {
        if (weighted[i].weight !== last.weight) break;
        sessionsAtCurrent += 1;
        const o = outcomeOf(weighted[i]);
        if (o !== null) {
          repsAtCurrentFirst = o;
          if (repsAtCurrentLast === null) repsAtCurrentLast = o;
        }
      }
    }

    let status: PlateauStatus;
    const gain = last ? gainFor(last) : 2;
    const weightChangePct = first && last && first.weight ? ((last.weight! - first.weight) / first.weight) * 100 : null;
    const outcomeUp = repsAtCurrentFirst !== null && repsAtCurrentLast !== null && repsAtCurrentLast >= repsAtCurrentFirst + gain;
    const outcomeDown = repsAtCurrentFirst !== null && repsAtCurrentLast !== null && repsAtCurrentLast <= repsAtCurrentFirst - gain;
    const stalled = sessionsAtCurrent >= stallSessions && !outcomeUp;
    if (series.length < minSessions || !first || !last) status = "insufficient";
    else if ((weightChangePct !== null && weightChangePct < 0) || outcomeDown) status = "regressing";
    else if ((weightChangePct !== null && weightChangePct > 0) || outcomeUp) status = "progressing";
    else status = "plateau";

    out.push({
      machineId,
      machineName: options.machineName(machineId),
      group: options.machineGroup(machineId),
      status,
      sessions: series.length,
      firstDate: series[0]?.date ?? null,
      lastDate: series[series.length - 1]?.date ?? null,
      firstWeight: first?.weight ?? null,
      lastWeight: last?.weight ?? null,
      bestWeight: best,
      weightChangePct,
      repsAtCurrentFirst,
      repsAtCurrentLast,
      sessionsAtCurrentWeight: sessionsAtCurrent,
      stalled,
      isTSC: !!last?.isTSC,
      poorRate: rated.length ? poor / rated.length : null,
      series: series.map((s) => ({ date: s.date, weight: s.weight, reps: outcomeOf(s), quality: s.quality })),
    });
  }
  const rank: Record<PlateauStatus, number> = { plateau: 0, regressing: 1, progressing: 2, insufficient: 3 };
  const bucket = (p: MachinePlateau) => (p.status === "plateau" || p.status === "regressing" ? rank[p.status] : p.stalled ? 1.5 : rank[p.status]);
  return out.sort((a, b) => bucket(a) - bucket(b) || b.sessionsAtCurrentWeight - a.sessionsAtCurrentWeight || b.sessions - a.sessions);
}

/* ------------------------------------------------------------------ *
 * Rep quality helpers shared by the UI
 * ------------------------------------------------------------------ */

export const QUALITY_NAME: Record<RepQuality, string> = { 1: "Poor quality", 2: "Completed", 3: "Max strength" };

/** Compact number: 1284 → "1.3K", 111050 → "111K", 2129 → "2.1K". */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function pct(x: number | null, digits = 0): string {
  return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function signed(x: number, digits = 0, unit = ""): string {
  const v = x.toFixed(digits);
  return `${x > 0 ? "+" : ""}${v}${unit}`;
}
