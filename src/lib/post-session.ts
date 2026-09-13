/**
 * THE POST-SESSION READ (tracker round, Sep 2026).
 *
 * The screen after Finish has thirty seconds and one job, in AJ's words:
 * "go over today's session, make sure they're set up for next time, and
 * leave them with a good attitude." Everything here is pure so the
 * sentences can be tested, and so the screen stays a renderer.
 *
 * Every claim names its sample and says "not enough yet" below it (the
 * "sentences, not scores" rule in CLAUDE.md).
 */

import { isPerformedLog, outcomeOf, type SetOutcome } from "./set-outcome";

export interface TodayLog {
  machineId: string;
  weight?: string | number | null;
  loadLb?: string | number | null;
  reps?: string | number | null;
  seconds?: string | number | null;
  isTSC?: boolean;
  isStaticHold?: boolean;
  repQuality?: number | null;
  outcome?: SetOutcome | null;
  skipReason?: string | null;
  side?: "Left" | "Right";
}

/** The last performed set on a machine BEFORE today. */
export interface PriorSet {
  weight: number;
  reps?: number | null;
  seconds?: number | null;
  isTSC?: boolean;
  quality?: number | null;
}

export interface TodayLine {
  machineId: string;
  name: string;
  outcome: SetOutcome;
  weight: number | null;
  count: number | null;
  isTSC: boolean;
  quality: number | null;
  /** Today against the last performed set; null when there is no prior set. */
  loadDelta: number | null;
  countDelta: number | null;
  /** First time this machine was performed. */
  first: boolean;
  skipReason?: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * One line per planned machine, in the order the routine was performed.
 * Torso Rotation's two sides collapse into one line (the left side's
 * numbers, which is what the grid shows too).
 */
export function todayLines(params: {
  order: readonly string[];
  logs: readonly TodayLog[];
  nameOf: (machineId: string) => string;
  priorOf: (machineId: string) => PriorSet | undefined;
}): TodayLine[] {
  const { order, logs, nameOf, priorOf } = params;
  const byMachine = new Map<string, TodayLog>();
  for (const l of logs) {
    if (l.side === "Right" && byMachine.has(l.machineId)) continue;
    if (!byMachine.has(l.machineId) || l.side !== "Right") byMachine.set(l.machineId, l);
  }
  const ids = [...order];
  for (const id of byMachine.keys()) if (!ids.includes(id)) ids.push(id);

  return ids.map((machineId) => {
    const log = byMachine.get(machineId);
    const prior = priorOf(machineId);
    const outcome: SetOutcome = log ? outcomeOf(log) : "not_reached";
    const weight = log ? (num(log.loadLb) ?? num(log.weight)) : null;
    const isTSC = !!(log?.isTSC || log?.isStaticHold);
    const count = log ? (isTSC ? num(log.seconds) : num(log.reps)) : null;
    const performed = !!log && isPerformedLog(log);
    const comparable = performed && prior && !!prior.isTSC === isTSC;
    return {
      machineId,
      name: nameOf(machineId),
      outcome,
      weight,
      count,
      isTSC,
      quality: log?.repQuality ?? null,
      loadDelta: comparable && weight !== null ? weight - prior.weight : null,
      countDelta:
        comparable && count !== null
          ? count - ((isTSC ? prior.seconds : prior.reps) ?? 0)
          : null,
      first: performed && !prior,
      skipReason: log?.skipReason ?? null,
    };
  });
}

/** "6 of 6 machines · 3 max-strength sets · load up on 2". */
export function todayHeadline(lines: readonly TodayLine[]): string {
  const planned = lines.length;
  const performed = lines.filter((l) => l.outcome === "performed");
  const maxSets = performed.filter((l) => l.quality === 3).length;
  const loadUp = performed.filter((l) => (l.loadDelta ?? 0) > 0).length;
  const repsUp = performed.filter((l) => (l.loadDelta ?? 0) === 0 && (l.countDelta ?? 0) > 0).length;
  const firsts = performed.filter((l) => l.first).length;
  const parts: string[] = [];
  parts.push(`${performed.length} of ${planned} machine${planned === 1 ? "" : "s"}`);
  if (maxSets > 0) parts.push(`${maxSets} max-strength set${maxSets === 1 ? "" : "s"}`);
  if (loadUp > 0) parts.push(`load up on ${loadUp}`);
  if (repsUp > 0) parts.push(`more reps on ${repsUp}`);
  if (firsts > 0) parts.push(`${firsts} new machine${firsts === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ *
 * The journey — strength since the first session
 * ------------------------------------------------------------------ */

export interface JourneyRowInput {
  machineId: string;
  name: string;
  /** Movement group or body region, for the "trending well with…" line. */
  group: string;
  /** First recorded load on this machine. */
  startWeight: number | null;
  /** Today's load (or the latest performed load). */
  nowWeight: number | null;
  /** Sessions on this machine, today included. */
  sessions: number;
  startDate?: string | null;
}

export interface JourneyRead {
  /** Whole-percent load change across machines with enough history. */
  pct: number | null;
  machines: number;
  since: string | null;
  /** Groups ranked by gain; the strongest first. */
  byGroup: { group: string; pct: number; machines: number }[];
  /** The one machine with the biggest gain. */
  standout: { name: string; startWeight: number; nowWeight: number; pct: number } | null;
  enough: boolean;
}

/** Minimum history before the screen makes a claim about the journey. */
export const JOURNEY_MIN_MACHINES = 3;
export const JOURNEY_MIN_SESSIONS = 3;

export function strengthJourney(rows: readonly JourneyRowInput[]): JourneyRead {
  const usable = rows.filter(
    (r) =>
      r.startWeight !== null &&
      r.nowWeight !== null &&
      r.startWeight! > 0 &&
      r.sessions >= JOURNEY_MIN_SESSIONS,
  );
  const enough = usable.length >= JOURNEY_MIN_MACHINES;
  const pctOf = (rs: readonly JourneyRowInput[]) => {
    const start = rs.reduce((s, r) => s + (r.startWeight as number), 0);
    const now = rs.reduce((s, r) => s + (r.nowWeight as number), 0);
    return start > 0 ? Math.round(((now - start) / start) * 100) : 0;
  };
  const groups = new Map<string, JourneyRowInput[]>();
  for (const r of usable) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const byGroup = [...groups.entries()]
    .map(([group, rs]) => ({ group, pct: pctOf(rs), machines: rs.length }))
    .filter((g) => g.machines >= 2)
    .sort((a, b) => b.pct - a.pct);
  const standoutRow = usable
    .map((r) => ({
      name: r.name,
      startWeight: r.startWeight as number,
      nowWeight: r.nowWeight as number,
      pct: Math.round((((r.nowWeight as number) - (r.startWeight as number)) / (r.startWeight as number)) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)[0];
  const since = usable
    .map((r) => r.startDate)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;
  return {
    pct: enough ? pctOf(usable) : null,
    machines: usable.length,
    since,
    byGroup: enough ? byGroup : [],
    standout: enough && standoutRow && standoutRow.pct > 0 ? standoutRow : null,
    enough,
  };
}

/** The sentence the trainer reads out. */
export function journeySentence(read: JourneyRead, firstName: string): string {
  if (!read.enough || read.pct === null) {
    return `Not enough history yet to call a trend — ${JOURNEY_MIN_SESSIONS} sessions on ${JOURNEY_MIN_MACHINES} machines is the bar.`;
  }
  const dir = read.pct > 0 ? "up" : read.pct < 0 ? "down" : "level";
  const amount = read.pct === 0 ? "" : ` ${Math.abs(read.pct)}%`;
  const since = read.since ? ` since ${formatShortDay(read.since)}` : "";
  let s = `${firstName}'s working loads are ${dir}${amount}${since} across ${read.machines} machines.`;
  const best = read.byGroup[0];
  if (best && best.pct > 0) s += ` Strongest trend: ${best.group.toLowerCase()}, up ${best.pct}%.`;
  return s;
}

/* ------------------------------------------------------------------ *
 * Next session
 * ------------------------------------------------------------------ */

export interface BookingLike {
  clientId?: string;
  startTime?: unknown;
  status?: string;
}

function toMs(v: unknown): number | null {
  if (!v) return null;
  const t = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const ms = new Date(v as string).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The client's soonest future booking that is still on the books. */
export function nextBookingFor<T extends BookingLike>(
  clientId: string,
  bookings: readonly T[],
  now = Date.now(),
): { at: Date; booking: T } | null {
  let best: { at: Date; booking: T } | null = null;
  for (const b of bookings) {
    if (b.clientId !== clientId) continue;
    if (b.status === "Cancelled" || b.status === "Completed" || b.status === "No-Show") continue;
    const ms = toMs(b.startTime);
    if (ms === null || ms <= now) continue;
    if (!best || ms < best.at.getTime()) best = { at: new Date(ms), booking: b };
  }
  return best;
}

export function formatNextBooking(at: Date, now = new Date()): string {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  const when = at.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${when} · ${time}`;
}

function formatShortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
