/**
 * MY PROFILE → YOUR WEEK — the pure half (Openings round, phase 11, Sep 27
 * 2026).
 *
 * AJ: "this isn't like an hour tracker, but it kind of can be used as one
 * because I want to be able to see how many clients I've taken. But I also
 * want to see ... how many hours I was at the studio almost."
 *
 * THE SAME NUMBERS HOURS SHOWS, BY CONSTRUCTION
 * ---------------------------------------------
 * Operations → Team → Hours already counts a trainer's sessions. Your
 * week is that count for one person, two weeks, at the studio the iPad is
 * in, so it reuses Hours' rules rather than restating them:
 *
 *   - which sessions: completed ones (an open session is not hours yet);
 *   - whose: the session's `trainerId` (`trainerKeyOf`, Hours' row key);
 *   - which day: `sessionDay` (the `date` field, else the studio's day of
 *     the start);
 *   - which week: Monday to Sunday (`weekStartOf`);
 *   - session time: sessions × the studio's session length
 *     (`sessionMinutesOf`, My Studio → Studio → The studio's day).
 *
 * The read is Hours' read too (`fetchSessionsInRange`, the studio's sessions
 * since the Monday before last), filtered to the trainer in memory.
 *
 * FIRST SESSION TO LAST
 * ---------------------
 * For each day, from the start of the first session to the end of the last,
 * split wherever two sessions are more than SPAN_BREAK_MINUTES apart, so a
 * trainer who takes three clients, has a break and takes three more does not
 * read as "at the studio" through the break. Only sessions with real clock
 * times count, so it leaves out:
 *
 *   - past sessions logged by hand (their start is a noon placeholder,
 *     `isBackfilledSession`);
 *   - imported sessions (`isLegacySession`: their date is a fact, any time
 *     on them is not);
 *   - sessions still open (no end);
 *   - any session longer than MAX_SPAN_SESSION_MINUTES (left running).
 *
 * It is NOT a timesheet: Journey doesn't know when anyone arrived or left,
 * and the card says so. AJ, Sep 19: "No payroll on the app for now."
 *
 * PURE MODULE — no React, no Firestore. Days are yyyy-mm-dd keys; clock
 * times are read in the studio's zone (`zonedHM`), never the viewer's.
 */
import type { WorkoutSession } from "../../types";
import { addDays, isBackfilledSession, isLegacySession, parseKey, sessionStartInstant, weekdayOf, type DayKey } from "../client-history/model";
import { IMPLAUSIBLE_SESSION_MINUTES, sessionDay, trainerKeyOf } from "../admin/insights/metrics";
import { formatHours, SHORT_MONTHS, weekStartOf } from "../admin/hours/hours";
import { studioDayBoundsForKey, toDate, zonedHM } from "../../lib/studio-time";

/** Two sessions further apart than this start a new part of the day. AJ's to change. */
export const SPAN_BREAK_MINUTES = 90;

/** A session longer than this was left running, and says nothing about the day. */
export const MAX_SPAN_SESSION_MINUTES = IMPLAUSIBLE_SESSION_MINUTES;

const MINUTE_MS = 60_000;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------------ *
 * The two weeks
 * ------------------------------------------------------------------ */

export interface WeekWindow {
  /** The Monday. */
  from: DayKey;
  /** The Sunday, or today for this week. */
  to: DayKey;
}

export interface YourWeekWindows {
  thisWeek: WeekWindow;
  lastWeek: WeekWindow;
}

/** This week (Monday to today) and last week (Monday to Sunday), as Hours draws them. */
export function yourWeekWindows(today: DayKey): YourWeekWindows {
  const monday = weekStartOf(today);
  const lastMonday = addDays(monday, -7);
  return {
    thisWeek: { from: monday, to: today },
    lastWeek: { from: lastMonday, to: addDays(monday, -1) },
  };
}

/**
 * The `createdAt` window to ask for: from the day before last Monday (as
 * Hours reaches a day early, for a session whose `date` is a day later than
 * its stamp), with no end — a session logged a minute ago counts this week.
 */
export function yourWeekQueryStart(today: DayKey, tz?: string): number {
  const lastMonday = yourWeekWindows(today).lastWeek.from;
  return studioDayBoundsForKey(addDays(lastMonday, -1), tz).start.getTime();
}

/* ------------------------------------------------------------------ *
 * Which sessions
 * ------------------------------------------------------------------ */

/** Hours' rule: completed, and the trainer on the document is this one. */
export function isYourSession(s: WorkoutSession, trainerId: string): boolean {
  return s.status === "Completed" && trainerKeyOf(s) === trainerId;
}

/** The session's start and end on the clock, or null when it has no real ones. */
export function clockTimesOf(s: WorkoutSession): { startMs: number; endMs: number } | null {
  if (s.status !== "Completed") return null;
  if (isLegacySession(s) || isBackfilledSession(s)) return null;
  const start = sessionStartInstant(s);
  const end = toDate(s.endTime ?? null);
  if (!start || !end) return null;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(endMs > startMs)) return null;
  if (endMs - startMs > MAX_SPAN_SESSION_MINUTES * MINUTE_MS) return null;
  return { startMs, endMs };
}

/* ------------------------------------------------------------------ *
 * First session to last
 * ------------------------------------------------------------------ */

export interface SpanPart {
  startMs: number;
  endMs: number;
  sessions: number;
}

export interface SpanDay {
  day: DayKey;
  parts: SpanPart[];
  /** Sessions with real clock times that day. */
  sessions: number;
  /** The parts, added up. */
  minutes: number;
}

/** One day's sessions split into parts at every break over SPAN_BREAK_MINUTES. */
export function spanParts(times: ReadonlyArray<{ startMs: number; endMs: number }>): SpanPart[] {
  const sorted = [...times].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const parts: SpanPart[] = [];
  for (const t of sorted) {
    const current = parts[parts.length - 1];
    if (current && t.startMs - current.endMs <= SPAN_BREAK_MINUTES * MINUTE_MS) {
      current.endMs = Math.max(current.endMs, t.endMs);
      current.sessions += 1;
    } else {
      parts.push({ startMs: t.startMs, endMs: t.endMs, sessions: 1 });
    }
  }
  return parts;
}

function partsMinutes(parts: readonly SpanPart[]): number {
  return Math.round(parts.reduce((sum, p) => sum + (p.endMs - p.startMs), 0) / MINUTE_MS);
}

/* ------------------------------------------------------------------ *
 * One week
 * ------------------------------------------------------------------ */

export interface WeekSummary extends WeekWindow {
  sessions: number;
  /** Distinct clients. */
  clients: number;
  /** The studio's session length the time was worked out with. */
  sessionMinutes: number;
  /** sessions × sessionMinutes. */
  slotMinutes: number;
  /** First session to last, by day, Monday first. */
  days: SpanDay[];
  /** All the days' parts, added up. */
  spanMinutes: number;
  /** Completed sessions with no real clock times, left out of the span. */
  leftOut: number;
}

export function summarizeWeek(
  sessions: readonly WorkoutSession[],
  opts: { window: WeekWindow; trainerId: string; sessionMinutes: number },
): WeekSummary {
  const { window, trainerId, sessionMinutes } = opts;
  const clients = new Set<string>();
  const byDay = new Map<DayKey, { startMs: number; endMs: number }[]>();
  let count = 0;
  let leftOut = 0;

  for (const s of sessions) {
    if (!isYourSession(s, trainerId)) continue;
    const day = sessionDay(s);
    if (!day || day < window.from || day > window.to) continue;
    count += 1;
    if (s.clientId) clients.add(s.clientId);
    const times = clockTimesOf(s);
    if (!times) {
      leftOut += 1;
      continue;
    }
    const list = byDay.get(day) ?? [];
    list.push(times);
    byDay.set(day, list);
  }

  const days: SpanDay[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, times]) => {
      const parts = spanParts(times);
      return { day, parts, sessions: times.length, minutes: partsMinutes(parts) };
    });

  return {
    ...window,
    sessions: count,
    clients: clients.size,
    sessionMinutes,
    slotMinutes: count * sessionMinutes,
    days,
    spanMinutes: days.reduce((sum, d) => sum + d.minutes, 0),
    leftOut,
  };
}

export interface YourWeek {
  thisWeek: WeekSummary;
  lastWeek: WeekSummary;
}

/** Both weeks from one read of the studio's sessions. */
export function yourWeek(
  sessions: readonly WorkoutSession[],
  opts: { today: DayKey; trainerId: string; sessionMinutes: number },
): YourWeek {
  const windows = yourWeekWindows(opts.today);
  const base = { trainerId: opts.trainerId, sessionMinutes: opts.sessionMinutes };
  return {
    thisWeek: summarizeWeek(sessions, { ...base, window: windows.thisWeek }),
    lastWeek: summarizeWeek(sessions, { ...base, window: windows.lastWeek }),
  };
}

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

/** "Mon, Sep 28". */
export function dayLabel(day: DayKey): string {
  const { month, day: d } = parseKey(day);
  return `${WEEKDAY_SHORT[weekdayOf(day)]}, ${SHORT_MONTHS[month - 1] ?? ""} ${d}`;
}

/** "Sep 21–27", "Sep 28–Oct 4", or "Sep 28" for a one-day week (a Monday today). */
export function rangeLabel(w: WeekWindow): string {
  const a = parseKey(w.from);
  const b = parseKey(w.to);
  const am = SHORT_MONTHS[a.month - 1] ?? "";
  const bm = SHORT_MONTHS[b.month - 1] ?? "";
  if (w.from === w.to) return `${am} ${a.day}`;
  return a.month === b.month ? `${am} ${a.day}–${b.day}` : `${am} ${a.day}–${bm} ${b.day}`;
}

/** "24 h 10 min", "3 h", "45 min". */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

function clock(ms: number, tz?: string): { text: string; meridiem: "AM" | "PM" } {
  const hm = zonedHM(new Date(ms), tz) ?? { hour: 0, minute: 0 };
  const meridiem = hm.hour < 12 ? "AM" : "PM";
  const h12 = hm.hour % 12 === 0 ? 12 : hm.hour % 12;
  return { text: `${h12}:${String(hm.minute).padStart(2, "0")}`, meridiem };
}

/** "6:58 to 9:34 AM", "11:30 AM to 1:15 PM". Always AM or PM: a studio day runs 5:30 AM to 8 PM. */
export function partLabel(part: Pick<SpanPart, "startMs" | "endMs">, tz?: string): string {
  const a = clock(part.startMs, tz);
  const b = clock(part.endMs, tz);
  return a.meridiem === b.meridiem ? `${a.text} to ${b.text} ${b.meridiem}` : `${a.text} ${a.meridiem} to ${b.text} ${b.meridiem}`;
}

function joinParts(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Mon, Sep 28: 6:58 to 9:34 AM, and 4:02 to 7:10 PM (9 sessions)." */
export function spanDaySentence(day: SpanDay, tz?: string): string {
  return `${dayLabel(day.day)}: ${joinParts(day.parts.map((p) => partLabel(p, tz)))} (${plural(day.sessions, "session")}).`;
}

/** "24 h 10 min over 4 days". */
export function spanTotalSentence(week: Pick<WeekSummary, "spanMinutes" | "days">): string {
  return `${durationLabel(week.spanMinutes)} over ${plural(week.days.length, "day")}`;
}

/** "9 h (18 sessions × 30 min)". */
export function sessionTimeSentence(week: Pick<WeekSummary, "sessions" | "slotMinutes" | "sessionMinutes">): string {
  return `${formatHours(week.slotMinutes)} (${plural(week.sessions, "session")} × ${week.sessionMinutes} min)`;
}

/** Said under the span when some sessions had no real clock times. Null when none. */
export function leftOutSentence(n: number): string | null {
  if (!(n > 0)) return null;
  return `Leaves out ${plural(n, "session")} without real clock times: logged by hand, imported, or left running.`;
}

/** The card's title. */
export function yourWeekTitle(studioName: string): string {
  return `Your week at ${studioName}`;
}

/** What the card counts, always on it. */
export function whatItCounts(studioName: string): string {
  return `Counts sessions logged in Journey at ${studioName}. First session to last isn't a timesheet: Journey doesn't know when you arrived or left.`;
}

/** On a tap: why Coaching load and Your week can differ. */
export const COACHING_LOAD_DIFFERS =
  "Coaching load above counts the nightly totals, which also count sessions you started for someone else and your practice in Demo Mode, so the two can differ.";

/**
 * While the studio has no cutover date, or the weeks shown began before it,
 * sessions logged in FileMaker aren't here. Null once both weeks are after it.
 */
export function cutoverLine(studioName: string, cutover: string | null | undefined, today: DayKey): string | null {
  const lastMonday = yourWeekWindows(today).lastWeek.from;
  const day = typeof cutover === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cutover) ? cutover : null;
  if (day && day <= lastMonday) return null;
  return `${studioName} is still moving off FileMaker. Sessions logged there aren't counted.`;
}

/** The week's line when the server answered and nothing is logged with you. */
export function emptyWeekSentence(which: "this" | "last", studioName: string): string {
  return `No sessions with you logged in Journey at ${studioName} ${which === "this" ? "so far this week" : "last week"}.`;
}

/** The read's own states — "can't read", never zero. */
export const READING = "Reading the sessions…";
export const CANT_READ = "Can't read the sessions just now.";
export const TOO_MANY = "Too many sessions to count here.";
