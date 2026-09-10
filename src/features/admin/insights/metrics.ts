/**
 * WHAT A STUDIO LEADER CAN ACT ON.
 *
 * Round: Insights (Section 6), Sep 2026.
 *
 * WHY THIS IS NOT A DASHBOARD OF TOTALS
 * -------------------------------------
 * The old Insights screen pulled five hundred clients, a thousand sessions and
 * a thousand exercise logs — unscoped, across every studio in the platform —
 * and rendered counts. Counts are the easy half and the useless half: "412
 * sessions" tells a studio leader nothing they cannot feel by standing on the
 * floor, and it tells them nothing to DO.
 *
 * So the output of this module is `observations()` — a ranked list of things
 * that are true and worth knowing, each written as a sentence with the number
 * that supports it. The tiles are there to back the sentences up, not the
 * other way round.
 *
 * WHAT IT REFUSES TO SAY
 * ----------------------
 * Every observation has a minimum sample size, and the thresholds are stated
 * as constants rather than buried in an `if`. A trainer who ran four sessions
 * has not "got a 25% completion problem", they have had a quiet week, and a
 * screen that says otherwise is one a manager stops trusting after the first
 * bad call. `MIN_SESSIONS_FOR_TRAINER_CLAIM` is what stops that.
 *
 * It also does not rank trainers against each other by volume. Sessions per
 * trainer is a rota fact, not a performance fact — the person who worked
 * Tuesday mornings in January is not "underperforming" — so load appears as a
 * distribution and is only remarked on when it is lopsided enough to be a
 * staffing question.
 *
 * SESSIONS ONLY, DELIBERATELY
 * ---------------------------
 * Everything here is computed from `sessions`, which carry `sessionMachineIds`
 * as of Sep 2026. Reading exerciseLogs as well would double the query cost to
 * refine numbers nobody acts on differently.
 */

import type { WorkoutSession } from "../../../types";
import { studioDateKey } from "../../../lib/studio-time";

/* ------------------------------------------------------------------ *
 * THRESHOLDS — stated, not buried
 * ------------------------------------------------------------------ */

/** Below this, a trainer's rates are noise and no claim is made about them. */
export const MIN_SESSIONS_FOR_TRAINER_CLAIM = 8;
/** Below this, the studio as a whole gets no observations either. */
export const MIN_SESSIONS_FOR_STUDIO_CLAIM = 20;
/** A completion rate under this is worth raising. */
export const LOW_COMPLETION_RATE = 0.85;
/** One trainer carrying more than this share of the floor is a rota question. */
export const LOPSIDED_LOAD_SHARE = 0.45;
/** Under this share of sessions carrying a note reads as a habit, not a lapse. */
export const LOW_NOTE_RATE = 0.4;
/** Days within which a returning client counts as retained. */
export const RETURN_WINDOW_DAYS = 45;
/** A session longer than this was almost certainly left running. */
export const IMPLAUSIBLE_SESSION_MINUTES = 180;

const MS_PER_MINUTE = 60_000;

/* ------------------------------------------------------------------ *
 * NORMALISING WHAT FIRESTORE HANDS BACK
 * ------------------------------------------------------------------ */

/** Milliseconds out of whatever shape a timestamp field happens to be in. */
export function millis(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof v === "string") {
    const p = Date.parse(v);
    return Number.isNaN(p) ? null : p;
  }
  return null;
}

/**
 * How long the session actually ran, in minutes, excluding pauses.
 *
 * Null rather than zero when it cannot be known — a session with no end time
 * was never closed out, and averaging a zero into the studio's median would
 * drag it toward a number no session ever took.
 *
 * A result beyond IMPLAUSIBLE_SESSION_MINUTES is also null: those are sessions
 * left running overnight, and they are counted as unclosed rather than as
 * eleven-hour workouts.
 */
export function activeMinutes(s: WorkoutSession): number | null {
  const start = millis(s.startTime) ?? millis(s.clientStartTime);
  const end = millis(s.endTime);
  if (start === null || end === null || end <= start) return null;
  const paused = typeof s.totalPausedMs === "number" ? s.totalPausedMs : 0;
  const mins = (end - start - Math.max(0, paused)) / MS_PER_MINUTE;
  if (mins <= 0 || mins > IMPLAUSIBLE_SESSION_MINUTES) return null;
  return mins;
}

/** The day a session belongs to, as YYYY-MM-DD, or null. */
export function sessionDay(s: WorkoutSession): string | null {
  if (typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.date)) {
    return s.date.slice(0, 10);
  }
  const ms = millis(s.createdAt) ?? millis(s.startTime);
  if (ms === null) return null;
  // The Eastern day, so an evening session counts on the day it happened.
  return studioDateKey(ms);
}

/** Whoever ran it. Falls back to initials when no id was stamped. */
export function trainerKeyOf(s: WorkoutSession): string | null {
  if (s.trainerId) return s.trainerId;
  if (s.trainerInitials) return `initials:${s.trainerInitials}`;
  return null;
}

/** Did anyone write anything down about this session? */
export function hasNote(s: WorkoutSession): boolean {
  return Boolean((s.notes ?? "").trim());
}

/** Was a post-session feel recorded? */
export function hasFeel(s: WorkoutSession): boolean {
  return Boolean(s.clientFeel) || Boolean(s.postFeel);
}

export function machineCount(s: WorkoutSession): number {
  return s.sessionMachineIds?.length ?? 0;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/* ------------------------------------------------------------------ *
 * PER TRAINER
 * ------------------------------------------------------------------ */

export interface TrainerMetrics {
  trainerKey: string;
  label: string;
  sessions: number;
  completed: number;
  /** Started and never closed out. */
  unclosed: number;
  completionRate: number;
  /** Distinct clients seen. */
  clients: number;
  /** Distinct machines used across all their sessions. */
  machineVariety: number;
  medianMachinesPerSession: number | null;
  medianMinutes: number | null;
  noteRate: number;
  feelRate: number;
  /** Sessions that were a client's first. */
  firstSessions: number;
  crossTrainSessions: number;
  /** Share of the studio's sessions in the window. */
  loadShare: number;
  /** True when there are enough sessions to say anything about rates. */
  enoughToJudge: boolean;
}

export interface TrainerNames {
  [trainerKey: string]: string;
}

export function trainerMetrics(
  sessions: WorkoutSession[],
  names: TrainerNames = {},
): TrainerMetrics[] {
  const byTrainer = new Map<string, WorkoutSession[]>();
  for (const s of sessions) {
    const key = trainerKeyOf(s);
    if (!key) continue;
    const list = byTrainer.get(key);
    if (list) list.push(s);
    else byTrainer.set(key, [s]);
  }

  const total = sessions.length;

  const rows = [...byTrainer.entries()].map(([trainerKey, own]) => {
    const completed = own.filter((s) => s.status === "Completed").length;
    const machines = new Set<string>();
    for (const s of own) for (const m of s.sessionMachineIds ?? []) machines.add(m);

    const minutes = own
      .map(activeMinutes)
      .filter((m): m is number => m !== null);
    const perSession = own.map(machineCount).filter((n) => n > 0);

    return {
      trainerKey,
      label:
        names[trainerKey] ??
        (trainerKey.startsWith("initials:")
          ? trainerKey.slice("initials:".length)
          : "Unnamed trainer"),
      sessions: own.length,
      completed,
      unclosed: own.length - completed,
      completionRate: own.length === 0 ? 0 : completed / own.length,
      clients: new Set(own.map((s) => s.clientId).filter(Boolean)).size,
      machineVariety: machines.size,
      medianMachinesPerSession: median(perSession),
      medianMinutes: median(minutes),
      noteRate: own.length === 0 ? 0 : own.filter(hasNote).length / own.length,
      feelRate: own.length === 0 ? 0 : own.filter(hasFeel).length / own.length,
      firstSessions: own.filter((s) => s.sessionNumber === 1).length,
      crossTrainSessions: own.filter((s) => s.isCrossTrain).length,
      loadShare: total === 0 ? 0 : own.length / total,
      enoughToJudge: own.length >= MIN_SESSIONS_FOR_TRAINER_CLAIM,
    };
  });

  return rows.sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ *
 * THE STUDIO
 * ------------------------------------------------------------------ */

export interface StudioSummary {
  sessions: number;
  completed: number;
  unclosed: number;
  completionRate: number;
  clients: number;
  newClients: number;
  crossTrainSessions: number;
  medianMinutes: number | null;
  medianMachinesPerSession: number | null;
  noteRate: number;
  feelRate: number;
  activeTrainers: number;
  /** Sessions per calendar day that had any, busiest first. */
  busiestDays: { day: string; sessions: number }[];
  /** Distinct days with at least one session. */
  activeDays: number;
  enoughToJudge: boolean;
}

export function studioSummary(sessions: WorkoutSession[]): StudioSummary {
  const completed = sessions.filter((s) => s.status === "Completed").length;
  const minutes = sessions.map(activeMinutes).filter((m): m is number => m !== null);
  const perSession = sessions.map(machineCount).filter((n) => n > 0);

  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const day = sessionDay(s);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return {
    sessions: sessions.length,
    completed,
    unclosed: sessions.length - completed,
    completionRate: sessions.length === 0 ? 0 : completed / sessions.length,
    clients: new Set(sessions.map((s) => s.clientId).filter(Boolean)).size,
    newClients: new Set(
      sessions.filter((s) => s.sessionNumber === 1).map((s) => s.clientId).filter(Boolean),
    ).size,
    crossTrainSessions: sessions.filter((s) => s.isCrossTrain).length,
    medianMinutes: median(minutes),
    medianMachinesPerSession: median(perSession),
    noteRate: sessions.length === 0 ? 0 : sessions.filter(hasNote).length / sessions.length,
    feelRate: sessions.length === 0 ? 0 : sessions.filter(hasFeel).length / sessions.length,
    activeTrainers: new Set(sessions.map(trainerKeyOf).filter(Boolean)).size,
    busiestDays: [...byDay.entries()]
      .map(([day, n]) => ({ day, sessions: n }))
      .sort((a, b) => b.sessions - a.sessions || a.day.localeCompare(b.day))
      .slice(0, 5),
    activeDays: byDay.size,
    enoughToJudge: sessions.length >= MIN_SESSIONS_FOR_STUDIO_CLAIM,
  };
}

/**
 * Of the clients seen in the earlier part of the window, how many came back.
 *
 * A retention proxy that needs no extra data: split the window, take everyone
 * who trained in the first half, and ask whether they appear again. It is
 * deliberately NOT attributed to a trainer — a client returns to a studio, and
 * blaming an individual for a churn number they do not control is how a metric
 * turns into a grievance.
 */
export function returnRate(
  sessions: WorkoutSession[],
  windowStartMs: number,
  windowEndMs: number,
): { eligible: number; returned: number; rate: number } | null {
  const midpoint = windowStartMs + (windowEndMs - windowStartMs) / 2;
  const withTime = sessions
    .map((s) => ({ s, at: millis(s.createdAt) ?? millis(s.startTime) }))
    .filter((x): x is { s: WorkoutSession; at: number } => x.at !== null);

  const early = new Set(
    withTime.filter((x) => x.at < midpoint).map((x) => x.s.clientId).filter(Boolean) as string[],
  );
  if (early.size === 0) return null;

  const later = new Set(
    withTime.filter((x) => x.at >= midpoint).map((x) => x.s.clientId).filter(Boolean) as string[],
  );
  let returned = 0;
  for (const id of early) if (later.has(id)) returned += 1;

  return { eligible: early.size, returned, rate: returned / early.size };
}

/* ------------------------------------------------------------------ *
 * THE PART THAT READS LIKE ENGLISH
 * ------------------------------------------------------------------ */

export type ObservationTone = "good" | "watch" | "problem" | "neutral";

export interface Observation {
  id: string;
  tone: ObservationTone;
  /** The finding, as a sentence. */
  text: string;
  /** What a manager would do about it. Omitted when there is nothing to do. */
  action?: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Everything worth saying about this window, most important first.
 *
 * Order is by tone then by size of the effect: a problem outranks a thing to
 * watch, and a bigger gap outranks a smaller one. An empty list means the
 * window is healthy or too small to speak about, and the screen says which.
 */
export function observations(
  summary: StudioSummary,
  trainers: TrainerMetrics[],
  retention: ReturnType<typeof returnRate>,
): Observation[] {
  const out: Observation[] = [];

  if (!summary.enoughToJudge) return out;

  // ── follow-through ───────────────────────────────────────────────
  if (summary.completionRate < LOW_COMPLETION_RATE) {
    out.push({
      id: "studio-completion",
      tone: "problem",
      text: `${summary.unclosed} of ${summary.sessions} sessions were never closed out — ${pct(1 - summary.completionRate)} of the floor.`,
      action:
        "An unclosed session keeps no end time, so it is missing from length and payroll figures as well as the client's history.",
    });
  }

  for (const t of trainers) {
    if (!t.enoughToJudge) continue;
    if (t.completionRate < LOW_COMPLETION_RATE && t.unclosed >= 3) {
      out.push({
        id: `trainer-completion-${t.trainerKey}`,
        tone: "watch",
        text: `${t.label} left ${t.unclosed} of ${t.sessions} sessions open.`,
        action: "Usually a workflow habit rather than a lapse — worth asking how they end a session.",
      });
    }
  }

  // ── load ─────────────────────────────────────────────────────────
  const heaviest = trainers[0];
  if (
    heaviest &&
    trainers.length > 1 &&
    heaviest.loadShare > LOPSIDED_LOAD_SHARE
  ) {
    out.push({
      id: "load-lopsided",
      tone: "watch",
      text: `${heaviest.label} ran ${pct(heaviest.loadShare)} of all sessions — ${heaviest.sessions} of ${summary.sessions}, across ${trainers.length} trainers.`,
      action: "A rota question rather than a performance one, but it is a single point of failure.",
    });
  }

  // ── what gets written down ───────────────────────────────────────
  if (summary.noteRate < LOW_NOTE_RATE) {
    out.push({
      id: "notes-thin",
      tone: "watch",
      text: `Only ${pct(summary.noteRate)} of sessions have a note on them.`,
      action:
        "Notes are what the next trainer reads before a session. Thin notes make every handover a cold start.",
    });
  }

  const silent = trainers.filter((t) => t.enoughToJudge && t.noteRate === 0);
  for (const t of silent) {
    out.push({
      id: `trainer-no-notes-${t.trainerKey}`,
      tone: "watch",
      text: `${t.label} has written no notes at all across ${t.sessions} sessions.`,
    });
  }

  // ── variety ──────────────────────────────────────────────────────
  const narrow = trainers.filter(
    (t) => t.enoughToJudge && t.machineVariety > 0 && t.machineVariety <= 6,
  );
  for (const t of narrow) {
    out.push({
      id: `trainer-narrow-${t.trainerKey}`,
      tone: "neutral",
      text: `${t.label} used ${t.machineVariety} different machines across ${t.sessions} sessions.`,
      action:
        "Could be a specialism, could be a rut. Worth a look at whether their clients are getting full coverage.",
    });
  }

  // ── retention ────────────────────────────────────────────────────
  if (retention && retention.eligible >= 10) {
    if (retention.rate < 0.5) {
      out.push({
        id: "return-low",
        tone: "problem",
        text: `Only ${retention.returned} of ${retention.eligible} clients who trained early in this window came back in it — ${pct(retention.rate)}.`,
        action: "Worth checking against the same window last quarter before reading anything into it.",
      });
    } else if (retention.rate >= 0.8) {
      out.push({
        id: "return-high",
        tone: "good",
        text: `${pct(retention.rate)} of clients who trained early in this window came back in it.`,
      });
    }
  }

  // ── the good news, last, and only when it is real ─────────────────
  if (summary.completionRate >= 0.97 && summary.sessions >= 40) {
    out.push({
      id: "completion-good",
      tone: "good",
      text: `${pct(summary.completionRate)} of sessions were closed out properly.`,
    });
  }

  const rank: Record<ObservationTone, number> = {
    problem: 0,
    watch: 1,
    neutral: 2,
    good: 3,
  };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
