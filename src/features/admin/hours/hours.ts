/**
 * TRAINING HOURS — the pure half.
 *
 * Round: Operations (Round B of the Operations audit), Sep 2026. AJ, Sep 19:
 * "No payroll on the app for now, but do track training hours per week and
 * month per trainer, and the total, for operations."
 *
 * WHAT AN HOUR IS
 * ---------------
 * A session is a booked slot — "Strength 30" on the Mindbody schedule — and
 * that slot is what the business books, bills and pays by, however the
 * twenty minutes inside it went. So an hour here is SLOTS, not stopwatch:
 * every completed Journey session counts for the studio's session length
 * (`studios/{id}.sessionMinutes`, default 30, set on My Studio → Studio →
 * The studio's day). The measured time on the floor (`activeMinutes`, the
 * same reading Insights uses) is carried alongside as an average, so a
 * leader can see both without one pretending to be the other.
 *
 * Why not the Mindbody schedule? The sync pulls today forward and never goes
 * back, so a past booking stays "Scheduled" whether the client came or not.
 * Journey's completed sessions are the record of what was actually trained.
 *
 * WHICH SESSIONS
 * --------------
 * Completed sessions whose day (`sessionDay`: the `date` field, else the
 * studio's day of the start) falls in the month. In-progress sessions are not
 * hours yet. A session with no trainer on it is counted in `unattributed`
 * and shown as such — a leader should see that the number is short rather
 * than a total that quietly is.
 *
 * WEEKS run Monday to Sunday: a leader reads this on Monday morning about
 * the week that ended yesterday. The Calendar tab draws Sunday-first because
 * that is what a wall calendar does; a pay week is not a wall calendar.
 */
import type { Studio, WorkoutSession } from "../../../types";
import { addDays, daysInMonth, keyOf, parseKey, weekdayOf, type DayKey } from "../../client-history/model";
import { activeMinutes, sessionDay, trainerKeyOf, type TrainerNames } from "../insights/metrics";
import { studioDayBoundsForKey, studioTodayKey } from "../../../lib/studio-time";

export const DEFAULT_SESSION_MINUTES = 30;
export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 120;

/**
 * Sessions logged after the fact land in a later `createdAt` window than the
 * day they belong to. The month's query reaches this many days past the end
 * of the month to catch them; one logged later than that is not counted, and
 * the screen says so.
 */
export const LATE_LOG_GRACE_DAYS = 14;

/** The studio's session length, clamped to something a slot could be. */
export function sessionMinutesOf(studio: Pick<Studio, "sessionMinutes"> | null | undefined): number {
  const raw = studio?.sessionMinutes;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_SESSION_MINUTES;
  return Math.max(MIN_SESSION_MINUTES, Math.min(MAX_SESSION_MINUTES, Math.round(raw)));
}

/* ------------------------------------------------------------------ *
 * Months and weeks
 * ------------------------------------------------------------------ */

export type MonthKey = string; // "2026-09"

export function monthKeyOfToday(now: Date = new Date()): MonthKey {
  return studioTodayKey(now).slice(0, 7);
}

export function monthKeyOf(day: DayKey): MonthKey {
  return day.slice(0, 7);
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + by;
  const year = Math.floor(idx / 12);
  const mon = (idx % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1] ?? month} ${y}`;
}

export function firstDayOf(month: MonthKey): DayKey {
  return `${month}-01`;
}

export function lastDayOf(month: MonthKey): DayKey {
  const [y, m] = month.split("-").map(Number);
  return keyOf(y, m, daysInMonth(y, m));
}

/** The Monday on or before this day. */
export function weekStartOf(day: DayKey): DayKey {
  // weekdayOf: 0 = Sunday … 6 = Saturday. Monday-start: Sunday is 6 days in.
  const offset = (weekdayOf(day) + 6) % 7;
  return addDays(day, -offset);
}

export interface WeekOfMonth {
  /** The week's Monday — the key rows are tallied under. */
  key: DayKey;
  /** First and last day of the week THAT FALL IN THE MONTH. */
  start: DayKey;
  end: DayKey;
  /** "Sep 1–6", "Sep 7–13", "Sep 28–30". */
  label: string;
  /** True when the week is cut by the month's edge on either side. */
  partial: boolean;
}

/** The weeks that touch a month, in order, clipped to the month's days. */
export function weeksOfMonth(month: MonthKey): WeekOfMonth[] {
  const first = firstDayOf(month);
  const last = lastDayOf(month);
  const { month: m } = parseKey(first);
  const short = SHORT_MONTHS[m - 1] ?? month;
  const out: WeekOfMonth[] = [];
  let cursor = weekStartOf(first);
  while (cursor <= last) {
    const weekEnd = addDays(cursor, 6);
    const start = cursor < first ? first : cursor;
    const end = weekEnd > last ? last : weekEnd;
    const a = parseKey(start).day;
    const b = parseKey(end).day;
    out.push({
      key: cursor,
      start,
      end,
      label: a === b ? `${short} ${a}` : `${short} ${a}–${b}`,
      partial: cursor < first || weekEnd > last,
    });
    cursor = addDays(cursor, 7);
  }
  return out;
}

/**
 * The `createdAt` window to ask Firestore for a month's sessions: a day
 * early (a session that started late on the last evening of the previous
 * month is on this month's day only if `date` says so — cheap to include)
 * and LATE_LOG_GRACE_DAYS late for sessions logged after the fact.
 */
export function queryWindowForMonth(month: MonthKey, tz?: string): { startMs: number; endMs: number } {
  const start = studioDayBoundsForKey(addDays(firstDayOf(month), -1), tz).start.getTime();
  const end = studioDayBoundsForKey(addDays(lastDayOf(month), LATE_LOG_GRACE_DAYS), tz).end.getTime();
  return { startMs: start, endMs: end };
}

/* ------------------------------------------------------------------ *
 * The tally
 * ------------------------------------------------------------------ */

export interface HoursCell {
  sessions: number;
  /** Slot minutes: sessions × the studio's session length. */
  minutes: number;
}

export interface TrainerHours {
  trainerKey: string;
  label: string;
  /** Keyed by the week's Monday; a week with nothing has no entry. */
  weeks: Record<DayKey, HoursCell>;
  month: HoursCell;
  /** Measured time on the floor, over the sessions that had a stopwatch. */
  measured: { sessions: number; minutes: number };
}

export interface HoursTally {
  month: MonthKey;
  sessionMinutes: number;
  weeks: WeekOfMonth[];
  rows: TrainerHours[];
  totals: { weeks: Record<DayKey, HoursCell>; month: HoursCell };
  /** Completed sessions in the month with no trainer on the document. */
  unattributed: number;
  /** In-progress sessions in the month — not hours yet. */
  open: number;
}

const EMPTY: HoursCell = { sessions: 0, minutes: 0 };

function bump(cell: HoursCell | undefined, minutes: number): HoursCell {
  const c = cell ?? EMPTY;
  return { sessions: c.sessions + 1, minutes: c.minutes + minutes };
}

export function hoursTally(
  sessions: WorkoutSession[],
  opts: { month: MonthKey; sessionMinutes?: number; names?: TrainerNames },
): HoursTally {
  const month = opts.month;
  const slot = opts.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  const names = opts.names ?? {};
  const weeks = weeksOfMonth(month);
  const first = firstDayOf(month);
  const last = lastDayOf(month);

  const byTrainer = new Map<string, TrainerHours>();
  const weekTotals: Record<DayKey, HoursCell> = {};
  let monthTotal: HoursCell = EMPTY;
  let unattributed = 0;
  let open = 0;

  for (const s of sessions) {
    const day = sessionDay(s);
    if (!day || day < first || day > last) continue;
    if (s.status !== "Completed") {
      open += 1;
      continue;
    }
    const key = trainerKeyOf(s);
    if (!key) {
      unattributed += 1;
      continue;
    }
    const week = weekStartOf(day);
    let row = byTrainer.get(key);
    if (!row) {
      row = {
        trainerKey: key,
        label: names[key] ?? (key.startsWith("initials:") ? key.slice("initials:".length) : "Unnamed trainer"),
        weeks: {},
        month: EMPTY,
        measured: { sessions: 0, minutes: 0 },
      };
      byTrainer.set(key, row);
    }
    row.weeks[week] = bump(row.weeks[week], slot);
    row.month = bump(row.month, slot);
    weekTotals[week] = bump(weekTotals[week], slot);
    monthTotal = bump(monthTotal, slot);
    const measured = activeMinutes(s);
    if (measured !== null) {
      row.measured = { sessions: row.measured.sessions + 1, minutes: row.measured.minutes + measured };
    }
  }

  const rows = [...byTrainer.values()].sort(
    (a, b) => b.month.sessions - a.month.sessions || a.label.localeCompare(b.label),
  );

  return {
    month,
    sessionMinutes: slot,
    weeks,
    rows,
    totals: { weeks: weekTotals, month: monthTotal },
    unattributed,
    open,
  };
}

/** "12 h", "12.5 h", "0 h". One decimal, never a trailing .0. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}

/** "22 min" for the measured average, or null when nothing was measured. */
export function averageMinutes(m: { sessions: number; minutes: number }): number | null {
  return m.sessions === 0 ? null : Math.round(m.minutes / m.sessions);
}

/** Trainer ids and initials to names — the same shape Insights builds. */
export function trainerNames(trainers: { id?: string; initials?: string; fullName: string }[]): TrainerNames {
  const out: TrainerNames = {};
  for (const t of trainers) {
    if (t.id) out[t.id] = t.fullName;
    if (t.initials) out[`initials:${t.initials}`] = t.fullName;
  }
  return out;
}
