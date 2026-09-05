/**
 * FACTS — one normalised row per completed session.
 *
 * The app stores a session's data across three shapes (the session document,
 * its exercise logs, and any clinical incidents), with a decade of field
 * drift inside each: `weight` is a string, `repQuality` is 1|2|3 or absent
 * (imported charts), sleep is `sleepQuality` or the legacy `sleepHours`,
 * dates are "YYYY-MM-DD" or "M/D/YYYY". This file is the only place that
 * knows all of that. Everything downstream reads `SessionFact` / `SetFact`.
 */

import type { ClinicalIncident, ExerciseLog, WorkoutSession } from "../../types";
import type { EnergyLevel, MoodLevel, PostFeel, SessionFact, SetFact } from "./types";

/* ------------------------------------------------------------------ *
 * Small parsers
 * ------------------------------------------------------------------ */

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** "2026-09-02", "2026-09-02 10:30", "9/2/2026" → "2026-09-02" without a timezone shift. */
export function toIsoDay(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date) return dayFromDate(raw);
  const anyRaw = raw as { toDate?: () => Date; seconds?: number };
  if (typeof anyRaw.toDate === "function") return dayFromDate(anyRaw.toDate());
  if (typeof anyRaw.seconds === "number") return dayFromDate(new Date(anyRaw.seconds * 1000));
  const s = String(raw).trim().replace(" ", "T").split("T")[0];
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = new Date(String(raw));
  return Number.isNaN(t.getTime()) ? "" : dayFromDate(t);
}

function dayFromDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight of an ISO day, in ms. */
export function dayMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}

/** Whole days between two ISO days (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
}

export function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const anyV = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.toDate === "function") return anyV.toDate().getTime();
  if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>();
/** Hour of day (0–23) for an instant, in the studio's time zone. */
export function hourInZone(ms: number, timeZone: string): number | null {
  try {
    let f = hourFormatters.get(timeZone);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone });
      hourFormatters.set(timeZone, f);
    }
    const h = parseInt(f.format(new Date(ms)), 10);
    if (!Number.isFinite(h)) return null;
    return h === 24 ? 0 : h;
  } catch {
    return new Date(ms).getHours();
  }
}

/* ------------------------------------------------------------------ *
 * Subjective normalisation
 * ------------------------------------------------------------------ */

type CheckIn = NonNullable<WorkoutSession["preSessionCheckIn"]> & {
  energyLevel?: EnergyLevel;
  mood?: MoodLevel;
};

function sleepOf(c: CheckIn | undefined): SessionFact["sleep"] {
  if (!c) return null;
  if (c.sleepQuality) return c.sleepQuality;
  // Legacy hours → the same three buckets the picker offers.
  const h = num(c.sleepHours);
  if (h === null) return null;
  if (h < 6) return "poor";
  if (h < 7.5) return "average";
  return "optimal";
}

function stressOf(c: CheckIn | undefined): SessionFact["stress"] {
  const s = num(c?.stressLevel);
  if (s === null) return null;
  const r = Math.min(5, Math.max(1, Math.round(s)));
  return r as 1 | 2 | 3 | 4 | 5;
}

function postFeelOf(v: unknown): PostFeel | null {
  if (v === "Wiped Out" || v === "Good" || v === "Energized") return v;
  return null;
}

/* ------------------------------------------------------------------ *
 * Sets
 * ------------------------------------------------------------------ */

/** Seconds under tension a log recorded, or null when nothing was captured. */
export function tutOf(log: ExerciseLog): number | null {
  const explicit = num(log.totalTimeUnderLoad);
  if (explicit !== null && explicit > 0) return explicit;
  if (log.isTSC || log.isStaticHold) {
    const s = num(log.seconds);
    return s !== null && s > 0 ? s : null;
  }
  const perRep = num(log.averageTimePerRep);
  const reps = num(log.reps);
  if (perRep !== null && perRep > 0 && reps !== null && reps > 0) return perRep * reps;
  const dur = num(log.machineDurationSeconds);
  return dur !== null && dur > 0 ? dur : null;
}

export function toSetFact(log: ExerciseLog, session: { id: string; date: string; dayMs: number }): SetFact | null {
  const weight = num(log.weight ?? log.loadLb);
  const isTSC = !!(log.isTSC || log.isStaticHold);
  const reps = isTSC ? null : num(log.reps ?? log.outcomeReps);
  const seconds = isTSC ? num(log.seconds ?? log.outcomeTut) : null;
  if (weight === null && reps === null && seconds === null) return null;
  const q = log.repQuality;
  return {
    sessionId: session.id,
    date: session.date,
    dayMs: session.dayMs,
    machineId: log.machineId,
    weight,
    reps,
    seconds,
    isTSC,
    quality: q === 1 || q === 2 || q === 3 ? q : null,
    tutSeconds: tutOf(log),
  };
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

export interface BuildFactsOptions {
  /** Studio time zone for the hour-of-day analysis. */
  timeZone?: string;
  /** Include sessions with no logged sets (default false — an empty session is noise, not evidence). */
  includeEmpty?: boolean;
}

export interface FactSet {
  facts: SessionFact[];
  sets: SetFact[];
}

export function buildFacts(
  sessions: WorkoutSession[],
  logs: ExerciseLog[],
  incidents: ClinicalIncident[] = [],
  options: BuildFactsOptions = {},
): FactSet {
  const tz = options.timeZone || "America/New_York";

  const logsBySession = new Map<string, ExerciseLog[]>();
  for (const l of logs) {
    if (!l?.sessionId) continue;
    const list = logsBySession.get(l.sessionId) ?? [];
    list.push(l);
    logsBySession.set(l.sessionId, list);
  }
  const incidentsBySession = new Map<string, number>();
  for (const inc of incidents) {
    if (!inc?.sessionId) continue;
    incidentsBySession.set(inc.sessionId, (incidentsBySession.get(inc.sessionId) ?? 0) + 1);
  }

  const completed = sessions
    .filter((s) => s && s.id && (s.status === undefined || s.status === "Completed"))
    .map((s) => ({ s, date: toIsoDay(s.date) || toIsoDay(s.startTime) || toIsoDay(s.createdAt) }))
    .filter((x) => !!x.date);

  // Oldest → newest, ties by start time then session number.
  completed.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    const sa = toMillis(a.s.startTime) ?? toMillis(a.s.clientStartTime) ?? 0;
    const sb = toMillis(b.s.startTime) ?? toMillis(b.s.clientStartTime) ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.s.sessionNumber ?? 0) - (b.s.sessionNumber ?? 0);
  });

  const facts: SessionFact[] = [];
  const sets: SetFact[] = [];
  let previousDate: string | null = null;

  for (const { s, date } of completed) {
    const id = s.id as string;
    const sessionLogs = logsBySession.get(id) ?? [];
    const dMs = dayMs(date);
    const setFacts = sessionLogs.map((l) => toSetFact(l, { id, date, dayMs: dMs })).filter((x): x is SetFact => !!x);
    if (setFacts.length === 0 && !options.includeEmpty) continue;

    const startMs = toMillis(s.startTime) ?? toMillis(s.clientStartTime);
    const endMs = toMillis(s.endTime);
    const paused = num(s.totalPausedMs) ?? 0;
    const durationMin =
      startMs !== null && endMs !== null && endMs > startMs ? Math.round((endMs - startMs - paused) / 60_000) : null;

    const c = s.preSessionCheckIn as CheckIn | undefined;
    const stiff = (c?.bodyStates ?? []).filter((b) => b.state === "stiff").map((b) => b.region);
    const prime = (c?.bodyStates ?? []).filter((b) => b.state === "prime").map((b) => b.region);
    // Legacy soreness regions count as stiffness.
    for (const r of c?.sorenessRegions ?? []) if (!stiff.includes(r)) stiff.push(r);

    let setsRated = 0;
    let setsMax = 0;
    let setsDone = 0;
    let setsPoor = 0;
    let reps = 0;
    let tonnage = 0;
    let tut = 0;
    let setsWithTut = 0;
    let rpeSum = 0;
    let rpeN = 0;
    let symptomCount = 0;
    const symptomRegions = new Set<string>();
    const machineIds = new Set<string>();

    for (const sf of setFacts) {
      machineIds.add(sf.machineId);
      if (sf.quality) {
        setsRated += 1;
        if (sf.quality === 3) setsMax += 1;
        else if (sf.quality === 2) setsDone += 1;
        else setsPoor += 1;
      }
      if (!sf.isTSC && sf.reps !== null && sf.reps > 0) {
        reps += sf.reps;
        if (sf.weight !== null && sf.weight > 0) tonnage += sf.weight * sf.reps;
      }
      if (sf.tutSeconds !== null) {
        tut += sf.tutSeconds;
        setsWithTut += 1;
      }
    }
    for (const l of sessionLogs) {
      const r = num(l.rpe);
      if (r !== null) {
        rpeSum += r;
        rpeN += 1;
      }
      for (const sym of l.symptoms ?? []) {
        symptomCount += 1;
        if (sym.region) symptomRegions.add(sym.region);
      }
    }

    facts.push({
      id,
      date,
      dayMs: dMs,
      startMs,
      hour: startMs !== null ? hourInZone(startMs, tz) : null,
      dayOfWeek: new Date(dMs).getDay(),
      restDays: previousDate ? daysBetween(previousDate, date) : null,
      durationMin,
      trainerKey: s.trainerId && s.trainerId !== "legacy-trainer" ? s.trainerId : s.trainerInitials ? `initials:${s.trainerInitials.toUpperCase()}` : null,
      trainerInitials: (s.trainerInitials || "—").toUpperCase(),
      isCrossTrain: !!s.isCrossTrain,
      sleep: sleepOf(c),
      stress: stressOf(c),
      energy: c?.energyLevel ?? null,
      mood: c?.mood ?? null,
      hydration: c?.hydration ?? null,
      stiffRegions: stiff,
      primeRegions: prime,
      postFeel: postFeelOf(s.clientFeel),
      postPhysical: num(s.postFeel?.physical),
      postMental: num(s.postFeel?.mental),
      postRpe: num(s.postFeel?.overallRPE),
      sets: setFacts.length,
      setsRated,
      setsMax,
      setsDone,
      setsPoor,
      reps,
      tonnage: Math.round(tonnage),
      tutSeconds: Math.round(tut),
      setsWithTut,
      machineIds: [...machineIds],
      avgRpe: rpeN ? rpeSum / rpeN : null,
      symptomCount,
      symptomRegions: [...symptomRegions],
      incidentCount: incidentsBySession.get(id) ?? 0,
    });
    sets.push(...setFacts);
    previousDate = date;
  }

  return { facts, sets };
}

/** Keep only facts inside an inclusive ISO-day range (`from` null = open start). */
export function factsInRange<T extends { date: string }>(rows: T[], from: string | null, to: string): T[] {
  return rows.filter((r) => (!from || r.date >= from) && r.date <= to);
}
