/**
 * ACCOLADES — phase 2 of the progress report ("positivity padding").
 *
 * The owner's audit asks for EXACTLY three data-backed milestones between the
 * gratitude and the honest part: a big strength gain on a machine, an
 * unbroken run of top-quality sets, or a time-under-tension milestone. Before
 * this round the report picked three machines BY NAME ("leg press", "row",
 * "chest"), dropped any with no data, padded with one shared blank object and
 * printed the blanks — "MOVEMENT SLOT +0% — INCREASE FROM UNDEFINED TO
 * UNDEFINED" on a real client's card.
 *
 * Three rules now:
 *   1. A slot with no real data is never drawn (`slotCard` returns null).
 *   2. Every accolade has a NAMED minimum sample, below which the editor says
 *      "not enough data yet" and the card is not printed.
 *   3. The draft (`draftAccolades`) is computed from what the report page has
 *      already loaded — one read of the client's sessions and logs — never
 *      from a query per machine.
 *
 * Pure: no Firestore, no React. Everything here is unit-tested.
 */
import type { ExerciseLog, ProgressReport, WorkoutSession } from "../../types";
import { isPerformedLog } from "../../lib/set-outcome";
import { tutOf } from "../clinical-review/facts";

export type HighlightSlot = ProgressReport["highlights"][number];
export type SlotMetric = NonNullable<HighlightSlot["metricType"]>;

/* ------------------------------------------------------------------ *
 * Named minimums
 * ------------------------------------------------------------------ */

/** A report carries exactly this many accolade slots. */
export const MAX_ACCOLADES = 3;

/** Strength gain: performed, weighted sessions on the machine in the window. */
export const STRENGTH_MIN_SESSIONS = 3;
/** A gain of this many percent counts as one "notable" unit when ranking. */
export const STRENGTH_NOTABLE_PCT = 10;

/** Quality reps: sets with a quality rating in the window before we say anything. */
export const QUALITY_MIN_RATED_SETS = 10;
/** Quality reps: shortest run of top-quality sets worth calling a streak. */
export const QUALITY_MIN_STREAK = 5;
/** Quality reps: with no streak, this many top-quality sets is still an accolade. */
export const QUALITY_MIN_TOP_SETS = 10;
/** A run this long counts as one notable unit when ranking. */
export const QUALITY_NOTABLE_STREAK = 10;
/** This many top-quality sets counts as one notable unit when ranking. */
export const QUALITY_NOTABLE_TOP_SETS = 30;

/** Time under tension: sessions on the machine with a MEASURED time. */
export const TUT_MIN_SESSIONS = 3;
/** Time under tension: the smallest per-set improvement worth printing. */
export const TUT_MIN_GAIN_SECONDS = 5;
/** An improvement of this many percent counts as one notable unit. */
export const TUT_NOTABLE_PCT = 10;

/** Consistency: the studio's standard — two sessions a week. */
export const CONSISTENCY_TARGET_PER_WEEK = 2;
/** Consistency: the window must be at least this many weeks long… */
export const CONSISTENCY_MIN_WEEKS = 4;
/** …and hold at least this many sessions… */
export const CONSISTENCY_MIN_SESSIONS = 8;
/** …and reach this share of the target before it is an accolade. */
export const CONSISTENCY_MIN_SHARE = 0.75;

/* ------------------------------------------------------------------ *
 * Titles
 * ------------------------------------------------------------------ */

/** Each card is titled by what KIND of win it is. */
export const METRIC_TITLES: Record<SlotMetric, string> = {
  strength_gain: "Strength gain",
  consistent_quality: "Quality reps",
  time_under_tension: "Time under tension",
  consistency: "Consistency",
  total_volume: "Volume",
  custom: "Trainer highlight",
};

/** The picker's order. */
export const METRIC_CHOICES: SlotMetric[] = [
  "strength_gain",
  "consistent_quality",
  "time_under_tension",
  "consistency",
  "total_volume",
  "custom",
];

/** Kinds that need a machine picked before they mean anything. */
export const MACHINE_METRICS: ReadonlySet<SlotMetric> = new Set<SlotMetric>([
  "strength_gain",
  "time_under_tension",
  "total_volume",
]);

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/** One machine's window numbers, as the report page already holds them. */
export interface AccoladeMachine {
  machineId: string;
  label: string;
  startWeight: number;
  currentWeight: number;
  percentageIncrease: number;
  sessionCount: number;
}

/** One performed set in the window. */
export interface AccoladeSet {
  machineId: string;
  sessionId: string;
  /** Position in the client's history: session order, then write time. */
  seq: number;
  quality: 1 | 2 | 3 | null;
  /** Measured seconds under tension, never the machine clock. */
  tutSeconds: number | null;
  weight: number | null;
}

export interface DraftAccoladesInput {
  machines: AccoladeMachine[];
  sets: AccoladeSet[];
  /** Completed sessions in the window. */
  sessionsInWindow: number;
  /** YYYY-MM-DD; blank when unknown. */
  windowStart: string;
  /** YYYY-MM-DD — the report date. */
  windowEnd: string;
}

export type AccoladeKind =
  | "strength_gain"
  | "quality_reps"
  | "time_under_tension"
  | "consistency";

export interface AccoladeCandidate {
  /** metricType + machine — two candidates with one key are the same accolade. */
  key: string;
  kind: AccoladeKind;
  machineId: string | null;
  label: string;
  /**
   * How impressive, in "notable units": the measure divided by the bar for
   * its kind (10 % for strength and time, a run of 10 or 30 top sets for
   * quality, the full target for consistency). Comparable across kinds.
   */
  score: number;
  /** Ready to store on the report. `suggested` is true. */
  slot: HighlightSlot;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A printable string, or "" for blank / "undefined" / "NaN" garbage. */
export function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s || /\b(undefined|null|NaN)\b/.test(s)) return "";
  return s;
}

const hasMachine = (slot: HighlightSlot) =>
  !!slot.machineId && slot.machineId !== "none" && slot.machineId !== "all";

const lbs = (n: number) => `${fmtNum(n)} lbs`;

function fmtNum(n: number): string {
  return Math.round(n * 10) % 10 === 0
    ? Math.round(n).toLocaleString("en-US")
    : (Math.round(n * 10) / 10).toLocaleString("en-US");
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function slotKey(slot: HighlightSlot): string {
  const metric = slot.metricType ?? "strength_gain";
  return `${metric}:${hasMachine(slot) ? slot.machineId : "all"}`;
}

/* ------------------------------------------------------------------ *
 * History → sets
 * ------------------------------------------------------------------ */

/**
 * Seconds under tension that were MEASURED — the explicit total, a hold's
 * seconds or per-rep time × reps. `tutOf` falls back to the machine clock,
 * which includes setup and walking over; that is not tension, so it never
 * backs an accolade.
 */
export function measuredTut(log: ExerciseLog): number | null {
  return tutOf({ ...log, machineDurationSeconds: undefined });
}

const millisOf = (v: any): number =>
  typeof v?.toMillis === "function" ? v.toMillis() : 0;

/**
 * The performed sets in the window, in the order they happened. Built from
 * the same history the attendance tiles count, so no extra read.
 */
export function accoladeSetsFrom(
  sessions: WorkoutSession[],
  logs: ExerciseLog[],
  windowStart?: string,
): AccoladeSet[] {
  const inWindow = sessions
    .filter((s) => !!s.id && (!windowStart || (typeof s.date === "string" && s.date >= windowStart)))
    .sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        (a.sessionNumber || 0) - (b.sessionNumber || 0),
    );
  const order = new Map<string, number>();
  inWindow.forEach((s, i) => order.set(s.id!, i));

  return logs
    .filter((l) => !!l.machineId && order.has(l.sessionId) && isPerformedLog(l))
    .map((l) => ({ l, o: order.get(l.sessionId)!, t: millisOf(l.createdAt) }))
    .sort((a, b) => a.o - b.o || a.t - b.t)
    .map(({ l }, i) => {
      const q = l.repQuality;
      const w = num(l.weight);
      return {
        machineId: l.machineId,
        sessionId: l.sessionId,
        seq: i,
        quality: q === 1 || q === 2 || q === 3 ? q : null,
        tutSeconds: measuredTut(l),
        weight: w !== null && w > 0 ? w : null,
      };
    });
}

/* ------------------------------------------------------------------ *
 * The four kinds
 * ------------------------------------------------------------------ */

function strengthSlot(m: AccoladeMachine): HighlightSlot {
  return {
    machineId: m.machineId,
    label: m.label,
    metricType: "strength_gain",
    headline: `+${m.percentageIncrease}%`,
    detail: `From ${lbs(m.startWeight)} to ${lbs(m.currentWeight)} over ${plural(m.sessionCount, "session")}`,
    startValue: lbs(m.startWeight),
    currentValue: lbs(m.currentWeight),
    percentageIncrease: m.percentageIncrease,
    sessionCount: m.sessionCount,
  };
}

/** Why a machine's strength gain can't be printed, or null when it can. */
export function strengthShortfall(m: AccoladeMachine): string | null {
  if (!(m.startWeight > 0)) return `No weighted sets on ${m.label} in this window.`;
  if (m.sessionCount < STRENGTH_MIN_SESSIONS) {
    return `Not enough data yet — a strength gain needs ${STRENGTH_MIN_SESSIONS} sessions on ${m.label} in this window (it has ${m.sessionCount}).`;
  }
  if (!(m.percentageIncrease > 0) || !(m.currentWeight > m.startWeight)) {
    return `No gain on ${m.label} in this window (${lbs(m.startWeight)} to ${lbs(m.currentWeight)}) — pick another accolade.`;
  }
  return null;
}

export function strengthCandidates(machines: AccoladeMachine[]): AccoladeCandidate[] {
  return machines
    .filter((m) => clean(m.label) && strengthShortfall(m) === null)
    .map((m) => ({
      key: `strength_gain:${m.machineId}`,
      kind: "strength_gain" as const,
      machineId: m.machineId,
      label: m.label,
      score: m.percentageIncrease / STRENGTH_NOTABLE_PCT,
      slot: { ...strengthSlot(m), suggested: true },
    }));
}

export interface QualityFacts {
  /** Performed sets with a quality rating. */
  rated: number;
  /** Of those, rated top quality (3). */
  top: number;
  /** Longest run of top-quality sets; unrated sets neither break nor extend it. */
  longestStreak: number;
}

export function qualityFacts(sets: AccoladeSet[]): QualityFacts {
  let rated = 0;
  let top = 0;
  let run = 0;
  let longestStreak = 0;
  [...sets]
    .sort((a, b) => a.seq - b.seq)
    .forEach((s) => {
      if (s.quality === null) return;
      rated++;
      if (s.quality === 3) {
        top++;
        run++;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
    });
  return { rated, top, longestStreak };
}

export function qualityShortfall(f: QualityFacts): string | null {
  if (f.rated < QUALITY_MIN_RATED_SETS) {
    return `Not enough data yet — quality reps need ${QUALITY_MIN_RATED_SETS} rated sets in this window (it has ${f.rated}).`;
  }
  if (f.longestStreak < QUALITY_MIN_STREAK && f.top < QUALITY_MIN_TOP_SETS) {
    return `Not enough top-quality sets yet — needs a run of ${QUALITY_MIN_STREAK} or ${QUALITY_MIN_TOP_SETS} in total (best run ${f.longestStreak}, ${f.top} in total).`;
  }
  return null;
}

export function qualityCandidate(sets: AccoladeSet[]): AccoladeCandidate | null {
  const f = qualityFacts(sets);
  if (qualityShortfall(f) !== null) return null;
  const share = `${f.top} of ${f.rated} rated sets at top quality`;
  const streak = f.longestStreak >= QUALITY_MIN_STREAK;
  const slot: HighlightSlot = {
    label: "All machines",
    metricType: "consistent_quality",
    headline: streak ? `${f.longestStreak} in a row` : `${f.top} top-quality sets`,
    detail: streak
      ? `${f.longestStreak} top-quality sets without a break · ${share}`
      : share,
    perfectSets: f.top,
    suggested: true,
  };
  return {
    key: "consistent_quality:all",
    kind: "quality_reps",
    machineId: null,
    label: "All machines",
    score: streak
      ? Math.max(f.longestStreak / QUALITY_NOTABLE_STREAK, f.top / QUALITY_NOTABLE_TOP_SETS)
      : f.top / QUALITY_NOTABLE_TOP_SETS,
    slot,
  };
}

export interface TutFacts {
  machineId: string;
  sessions: number;
  startSeconds: number;
  currentSeconds: number;
  gainSeconds: number;
  pct: number;
  /** False when the load dropped between the first and last session. */
  loadHeld: boolean;
}

/** Per machine: the first and latest session's average measured time per set. */
export function tutFacts(sets: AccoladeSet[]): TutFacts[] {
  const byMachine = new Map<string, Map<string, { seq: number; tut: number[]; weight: number | null }>>();
  for (const s of sets) {
    if (s.tutSeconds === null || !(s.tutSeconds > 0)) continue;
    let sessions = byMachine.get(s.machineId);
    if (!sessions) byMachine.set(s.machineId, (sessions = new Map()));
    const cur = sessions.get(s.sessionId);
    if (cur) {
      cur.tut.push(s.tutSeconds);
      cur.seq = Math.min(cur.seq, s.seq);
      if (s.weight !== null) cur.weight = Math.max(cur.weight ?? 0, s.weight);
    } else {
      sessions.set(s.sessionId, { seq: s.seq, tut: [s.tutSeconds], weight: s.weight });
    }
  }
  const out: TutFacts[] = [];
  byMachine.forEach((sessions, machineId) => {
    const list = [...sessions.values()].sort((a, b) => a.seq - b.seq);
    if (list.length === 0) return;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = list[0];
    const last = list[list.length - 1];
    const startSeconds = Math.round(avg(first.tut));
    const currentSeconds = Math.round(avg(last.tut));
    const gainSeconds = currentSeconds - startSeconds;
    out.push({
      machineId,
      sessions: list.length,
      startSeconds,
      currentSeconds,
      gainSeconds,
      pct: startSeconds > 0 ? Math.round((gainSeconds / startSeconds) * 100) : 0,
      loadHeld:
        first.weight === null || last.weight === null || last.weight >= first.weight,
    });
  });
  return out;
}

export function tutShortfall(f: TutFacts | undefined, label: string): string | null {
  if (!f) return `No measured time under tension on ${label} in this window.`;
  if (f.sessions < TUT_MIN_SESSIONS) {
    return `Not enough data yet — time under tension needs ${TUT_MIN_SESSIONS} timed sessions on ${label} (it has ${f.sessions}).`;
  }
  if (!f.loadHeld) {
    return `The load on ${label} went down, so more time under tension isn't a win here.`;
  }
  if (f.gainSeconds < TUT_MIN_GAIN_SECONDS) {
    return `No time-under-tension gain of ${TUT_MIN_GAIN_SECONDS} s or more on ${label} in this window.`;
  }
  return null;
}

function tutSlot(f: TutFacts, label: string): HighlightSlot {
  return {
    machineId: f.machineId,
    label,
    metricType: "time_under_tension",
    headline: `+${f.gainSeconds} s`,
    detail: `From ${f.startSeconds} s to ${f.currentSeconds} s under tension per set over ${plural(f.sessions, "session")}`,
    sessionCount: f.sessions,
  };
}

export function tutCandidates(
  sets: AccoladeSet[],
  labels: ReadonlyMap<string, string>,
): AccoladeCandidate[] {
  return tutFacts(sets)
    .filter((f) => clean(labels.get(f.machineId)) && tutShortfall(f, "") === null)
    .map((f) => {
      const label = labels.get(f.machineId)!;
      return {
        key: `time_under_tension:${f.machineId}`,
        kind: "time_under_tension" as const,
        machineId: f.machineId,
        label,
        score: f.pct / TUT_NOTABLE_PCT,
        slot: { ...tutSlot(f, label), suggested: true },
      };
    });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD strings, or null. Zone-free (both read as UTC days). */
export function daysBetween(from: string, to: string): number | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

export interface ConsistencyFacts {
  sessions: number;
  weeks: number;
  perWeek: number;
  /** perWeek ÷ the twice-a-week target. */
  share: number;
}

export function consistencyFacts(
  input: Pick<DraftAccoladesInput, "sessionsInWindow" | "windowStart" | "windowEnd">,
): ConsistencyFacts | null {
  const days = daysBetween(input.windowStart, input.windowEnd);
  if (days === null || days <= 0) return null;
  const weeks = days / 7;
  const perWeek = input.sessionsInWindow / weeks;
  return {
    sessions: input.sessionsInWindow,
    weeks,
    perWeek,
    share: perWeek / CONSISTENCY_TARGET_PER_WEEK,
  };
}

export function consistencyShortfall(f: ConsistencyFacts | null): string | null {
  if (!f) return "Not enough data yet — the report window has no start date.";
  if (f.weeks < CONSISTENCY_MIN_WEEKS) {
    return `Not enough data yet — consistency needs a window of ${CONSISTENCY_MIN_WEEKS} weeks or more.`;
  }
  if (f.sessions < CONSISTENCY_MIN_SESSIONS) {
    return `Not enough data yet — consistency needs ${CONSISTENCY_MIN_SESSIONS} sessions in the window (it has ${f.sessions}).`;
  }
  if (f.share < CONSISTENCY_MIN_SHARE) {
    return `${fmtNum(f.perWeek)} sessions a week is under ${Math.round(CONSISTENCY_MIN_SHARE * 100)} % of the twice-a-week target — celebrate the showing up in step 1 instead.`;
  }
  return null;
}

export function consistencyCandidate(
  input: Pick<DraftAccoladesInput, "sessionsInWindow" | "windowStart" | "windowEnd">,
): AccoladeCandidate | null {
  const f = consistencyFacts(input);
  if (!f || consistencyShortfall(f) !== null) return null;
  const weeks = Math.round(f.weeks);
  return {
    key: "consistency:all",
    kind: "consistency",
    machineId: null,
    label: "Every session",
    score: Math.min(f.share, 1.5),
    slot: {
      label: "Every session",
      metricType: "consistency",
      headline: `${(Math.round(f.perWeek * 10) / 10).toFixed(1)} a week`,
      detail: `${plural(f.sessions, "session")} in ${plural(weeks, "week")} · the target is ${CONSISTENCY_TARGET_PER_WEEK} a week`,
      sessionCount: f.sessions,
      suggested: true,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Ranking and the draft
 * ------------------------------------------------------------------ */

const KIND_ORDER: AccoladeKind[] = [
  "strength_gain",
  "quality_reps",
  "time_under_tension",
  "consistency",
];

const byRank = (a: AccoladeCandidate, b: AccoladeCandidate) =>
  b.score - a.score ||
  KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
  a.label.localeCompare(b.label);

/** Every accolade the data supports, most impressive first. */
export function accoladeCandidates(input: DraftAccoladesInput): AccoladeCandidate[] {
  const labels = new Map(input.machines.map((m) => [m.machineId, m.label]));
  const out: AccoladeCandidate[] = [
    ...strengthCandidates(input.machines),
    ...tutCandidates(input.sets, labels),
  ];
  const q = qualityCandidate(input.sets);
  if (q) out.push(q);
  const c = consistencyCandidate(input);
  if (c) out.push(c);
  return out.sort(byRank);
}

export interface DraftOptions {
  /** How many to return (default MAX_ACCOLADES). */
  max?: number;
  /** Accolades already on the report — never suggested twice. */
  excludeKeys?: Iterable<string>;
  /** Machines already on the report — other machines are preferred. */
  usedMachineIds?: Iterable<string>;
}

/**
 * Up to three distinct accolades, most impressive first.
 *
 * 1. The best of each MILESTONE kind the audit names (strength gain, quality
 *    reps, time under tension) — the kind with the most impressive win goes
 *    first — each on a machine not already used where one exists. Three
 *    different kinds of win read better than three leg-press numbers.
 * 2. Then the next-best milestones, new machines first, then any left.
 * 3. Consistency only fills what is still empty: phase 1 of the report
 *    already thanks the client for showing up.
 * The result is sorted by score, so the biggest win is card one.
 */
export function draftAccolades(
  input: DraftAccoladesInput,
  opts: DraftOptions = {},
): AccoladeCandidate[] {
  const max = Math.max(0, Math.min(MAX_ACCOLADES, opts.max ?? MAX_ACCOLADES));
  const excluded = new Set(opts.excludeKeys ?? []);
  const used = new Set(opts.usedMachineIds ?? []);
  const ranked = accoladeCandidates(input).filter((c) => !excluded.has(c.key));
  const milestones = ranked.filter((c) => c.kind !== "consistency");

  const picked: AccoladeCandidate[] = [];
  const has = (c: AccoladeCandidate) => picked.some((p) => p.key === c.key);
  const fresh = (c: AccoladeCandidate) => !c.machineId || !used.has(c.machineId);
  const take = (c: AccoladeCandidate) => {
    if (picked.length >= max || has(c)) return;
    picked.push(c);
    if (c.machineId) used.add(c.machineId);
  };

  // The kind with the most impressive top candidate chooses its machine first.
  const kindsByBest = KIND_ORDER.filter((k) => k !== "consistency")
    .map((kind) => milestones.find((c) => c.kind === kind))
    .filter((c): c is AccoladeCandidate => !!c)
    .sort(byRank)
    .map((c) => c.kind);
  for (const kind of kindsByBest) {
    const ofKind = milestones.filter((c) => c.kind === kind);
    take(ofKind.find(fresh) ?? ofKind[0]);
  }
  for (const c of milestones) if (fresh(c)) take(c);
  for (const c of milestones) take(c);
  for (const c of ranked) if (c.kind === "consistency") take(c);

  return picked.sort(byRank);
}

/* ------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------ */

/** A fresh, empty slot — a NEW object every call, never shared. */
export function emptySlot(): HighlightSlot {
  return { label: "" };
}

/** Exactly MAX_ACCOLADES slots, each its own object. */
export function padSlots(slots: readonly HighlightSlot[] | null | undefined): HighlightSlot[] {
  const out = (slots ?? []).slice(0, MAX_ACCOLADES).map((s) => ({ ...s }));
  while (out.length < MAX_ACCOLADES) out.push(emptySlot());
  return out;
}

export interface SlotCard {
  title: string;
  label: string;
  hero: string;
  context: string;
  tone: "gain" | "quality" | "plain";
}

const toneOf = (m: SlotMetric): SlotCard["tone"] =>
  m === "strength_gain" || m === "custom"
    ? "gain"
    : m === "consistent_quality"
      ? "quality"
      : "plain";

/**
 * What the client's card shows for a slot — or null, and nothing is drawn.
 *
 * A slot chosen since the accolades round carries its own headline. A slot
 * saved before it is drawn from its numbers only when they are real: a
 * machine, a label, and a positive figure. Blank slots, "+0 %" and
 * "undefined" never reach paper.
 */
export function slotCard(slot: HighlightSlot | null | undefined): SlotCard | null {
  if (!slot) return null;
  const metric: SlotMetric = slot.metricType ?? "strength_gain";
  const title = METRIC_TITLES[metric] ?? "Accolade";
  const tone = toneOf(metric);
  const label = clean(slot.label);

  if (metric === "custom") {
    const text = clean(slot.headline) || clean(slot.customText);
    if (!text) return null;
    return { title, label, hero: text, context: clean(slot.detail) || "Trainer highlight", tone };
  }

  const headline = clean(slot.headline);
  if (headline) {
    return { title, label, hero: headline, context: clean(slot.detail), tone };
  }

  // Saved before the accolades round: only real numbers on a real machine.
  if (!hasMachine(slot) || !label) return null;
  switch (metric) {
    case "strength_gain": {
      const pct = num(slot.percentageIncrease);
      const from = clean(slot.startValue);
      const to = clean(slot.currentValue);
      if (pct === null || pct <= 0 || !from || !to) return null;
      return { title, label, hero: `+${pct}%`, context: `From ${from} to ${to}`, tone };
    }
    case "total_volume": {
      const v = num(slot.totalVolume);
      if (v === null || v <= 0) return null;
      return { title, label, hero: `${fmtNum(v)} lbs`, context: "Total weight moved this period", tone };
    }
    case "consistent_quality": {
      const n = num(slot.perfectSets);
      if (n === null || n <= 0) return null;
      return { title, label, hero: `${n} top-quality sets`, context: "Flawless form", tone };
    }
    case "time_under_tension": {
      const t = num(slot.timeUnderTension);
      if (t === null || t <= 0) return null;
      return { title, label, hero: `${fmtNum(t)} s under load`, context: "Total time spent under tension", tone };
    }
    default:
      return null;
  }
}

/** The cards a report prints, in slot order, blanks dropped. */
export function reportCards(slots: readonly HighlightSlot[] | null | undefined): SlotCard[] {
  return (slots ?? []).map(slotCard).filter((c): c is SlotCard => c !== null);
}

/* ------------------------------------------------------------------ *
 * The editor: build a slot from the trainer's choice
 * ------------------------------------------------------------------ */

/** A machine's window numbers as the page holds them (machineStatsFrom). */
export interface MachineStatsLike {
  startWeight: number;
  currentWeight: number;
  percentageIncrease: number;
  totalVolume?: number;
  perfectSets?: number;
  timeUnderTension?: number;
  sessionCount?: number;
}

export interface SlotContext {
  /** machineId → window numbers. */
  stats: Record<string, MachineStatsLike | undefined>;
  /** machineId → display name. */
  labels: ReadonlyMap<string, string>;
  sets: AccoladeSet[];
  sessionsInWindow: number;
  windowStart: string;
  windowEnd: string;
}

export interface SlotChoice {
  metricType?: SlotMetric | "";
  machineId?: string;
  customText?: string;
}

export interface SlotBuild {
  slot: HighlightSlot;
  /** What the editor says when this choice can't print. */
  note: string | null;
}

/** The input `draftAccolades` wants, from the same context the editor uses. */
export function draftInputFrom(ctx: SlotContext): DraftAccoladesInput {
  const machines: AccoladeMachine[] = [];
  for (const [machineId, s] of Object.entries(ctx.stats)) {
    const label = ctx.labels.get(machineId);
    if (!s || !clean(label)) continue;
    machines.push({
      machineId,
      label: label!,
      startWeight: s.startWeight,
      currentWeight: s.currentWeight,
      percentageIncrease: s.percentageIncrease,
      sessionCount: s.sessionCount ?? 0,
    });
  }
  return {
    machines,
    sets: ctx.sets,
    sessionsInWindow: ctx.sessionsInWindow,
    windowStart: ctx.windowStart,
    windowEnd: ctx.windowEnd,
  };
}

/**
 * The trainer picked a kind (and a machine, or typed a highlight). Rebuild
 * the slot from the data the page already holds. Never carries old numbers
 * over: a choice with no data is an empty card plus a sentence saying why.
 * The result is always a trainer's slot (`suggested` is off).
 */
export function buildSlot(choice: SlotChoice, ctx: SlotContext): SlotBuild {
  const metric = choice.metricType || undefined;
  if (!metric) return { slot: emptySlot(), note: null };

  if (metric === "custom") {
    const text = choice.customText ?? "";
    return {
      slot: {
        label: "",
        metricType: "custom",
        customText: text,
        headline: text.trim(),
        detail: "Trainer highlight",
      },
      note: text.trim() ? null : "Write the highlight — an empty card is never printed.",
    };
  }

  if (metric === "consistency") {
    const f = consistencyFacts(ctx);
    const c = consistencyCandidate(ctx);
    return c
      ? { slot: { ...c.slot, suggested: false }, note: null }
      : { slot: { label: "", metricType: "consistency" }, note: consistencyShortfall(f) };
  }

  const machineId =
    choice.machineId && choice.machineId !== "none" && choice.machineId !== "all"
      ? choice.machineId
      : undefined;

  if (metric === "consistent_quality" && !machineId) {
    const f = qualityFacts(ctx.sets);
    const c = qualityCandidate(ctx.sets);
    return c
      ? { slot: { ...c.slot, suggested: false }, note: null }
      : { slot: { label: "All machines", metricType: "consistent_quality" }, note: qualityShortfall(f) };
  }

  if (!machineId) {
    return { slot: { label: "", metricType: metric }, note: "Choose a machine." };
  }

  const label = clean(ctx.labels.get(machineId)) || "this machine";
  const bare: HighlightSlot = { label, machineId, metricType: metric };
  const s = ctx.stats[machineId];

  if (metric === "time_under_tension") {
    const f = tutFacts(ctx.sets).find((x) => x.machineId === machineId);
    const short = tutShortfall(f, label);
    if (f && short === null) return { slot: tutSlot(f, label), note: null };
    return { slot: bare, note: short };
  }

  if (!s) {
    return { slot: bare, note: `No performed sets on ${label} in this window.` };
  }
  const sessions = s.sessionCount ?? 0;

  switch (metric) {
    case "strength_gain": {
      const m: AccoladeMachine = {
        machineId,
        label,
        startWeight: s.startWeight,
        currentWeight: s.currentWeight,
        percentageIncrease: s.percentageIncrease,
        sessionCount: sessions,
      };
      const short = strengthShortfall(m);
      return short === null ? { slot: strengthSlot(m), note: null } : { slot: bare, note: short };
    }
    case "total_volume": {
      const v = s.totalVolume ?? 0;
      if (!(v > 0)) return { slot: bare, note: `No volume recorded on ${label} in this window.` };
      return {
        slot: {
          ...bare,
          headline: `${fmtNum(v)} lbs moved`,
          detail: `Total weight moved on ${label} over ${plural(sessions, "session")}`,
          totalVolume: v,
          sessionCount: sessions,
        },
        note: null,
      };
    }
    case "consistent_quality": {
      const n = s.perfectSets ?? 0;
      if (!(n > 0)) return { slot: bare, note: `No top-quality sets on ${label} in this window.` };
      return {
        slot: {
          ...bare,
          headline: `${plural(n, "top-quality set")}`,
          detail: `On ${label} over ${plural(sessions, "session")}`,
          perfectSets: n,
          sessionCount: sessions,
        },
        note: null,
      };
    }
    default:
      return { slot: bare, note: null };
  }
}

/** The choice a stored slot represents. */
export function choiceOf(slot: HighlightSlot): SlotChoice {
  return {
    metricType: slot.metricType ?? (hasMachine(slot) ? "strength_gain" : ""),
    machineId: hasMachine(slot) ? slot.machineId : undefined,
    customText: slot.customText,
  };
}

/**
 * True when the slot holds nothing the trainer chose: drafted and untouched,
 * or blank. Open slots are what a (re)draft may fill.
 */
export function isOpenSlot(slot: HighlightSlot): boolean {
  if (slot.suggested) return true;
  const m = slot.metricType;
  if (m === "custom" || m === "consistency") return false;
  if (m === "consistent_quality" && !hasMachine(slot)) return false;
  if (slotCard(slot)) return false;
  return !hasMachine(slot);
}

/**
 * The report window changed. Every slot the trainer chose is rebuilt from
 * the new numbers (the same choice; its card empties if the new window has
 * no data for it); drafted and blank slots are re-drafted around them.
 */
export function refreshSlots(
  slots: readonly HighlightSlot[] | null | undefined,
  ctx: SlotContext,
): HighlightSlot[] {
  const padded = padSlots(slots);
  const kept = padded.map((s) => {
    if (isOpenSlot(s)) return null;
    if (s.metricType === "custom") return { ...s };
    return buildSlot(choiceOf(s), ctx).slot;
  });
  const keptSlots = kept.filter((s): s is HighlightSlot => s !== null);
  const fill = draftAccolades(draftInputFrom(ctx), {
    max: MAX_ACCOLADES - keptSlots.length,
    excludeKeys: keptSlots.map(slotKey),
    usedMachineIds: keptSlots.filter(hasMachine).map((s) => s.machineId!),
  });
  let next = 0;
  return kept.map((s) => s ?? (fill[next] ? { ...fill[next++].slot } : emptySlot()));
}

/** The first draft for a brand-new report: the best three, then blanks. */
export function draftSlots(ctx: SlotContext): HighlightSlot[] {
  return padSlots(draftAccolades(draftInputFrom(ctx)).map((c) => ({ ...c.slot })));
}
