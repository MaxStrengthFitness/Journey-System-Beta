/**
 * CLIENT HISTORY — the pure half.
 *
 * Round: History calendar, Sep 2026.
 *
 * Everything the History tab draws is derived here from plain arrays, with no
 * React and no Firestore, so the rules that matter can be tested with dates a
 * person can read:
 *
 *   - which calendar day a session belongs to (sessionDayKey),
 *   - what counts as a break, and how long it was (findGaps / computeCadence),
 *   - the year → month → day model the calendar renders (buildCalendar),
 *   - the month sections, rows and break dividers the list renders (buildList),
 *   - what one session amounted to, from its sets (summarizeSession).
 *
 * DAYS ARE STRINGS. A day is "YYYY-MM-DD" and all day arithmetic runs on those
 * keys through UTC ordinals, never through local Date objects. Local dates
 * carry the viewer's timezone and a daylight-saving hour, and both have put
 * sessions on the wrong day in this app before (see lib/studio-time.ts).
 */
import type { ClientEvent, ExerciseLog, RepQuality, WorkoutSession } from "../../types";
import { calculateExerciseVolume, parseSessionDate } from "../../lib/utils";
import { studioDateKey, toDate } from "../../lib/studio-time";

/** A session as History reads it. `trainerName` is written by the live flow but not declared. */
export type HistorySession = WorkoutSession & { trainerName?: string };

/* ------------------------------------------------------------------ *
 * Day keys
 * ------------------------------------------------------------------ */

export type DayKey = string;

const DAY_MS = 86_400_000;

export function keyOf(year: number, month: number, day: number): DayKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseKey(key: DayKey): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Whole days since 1970-01-01 — the only arithmetic days ever go through. */
export function keyToOrdinal(key: DayKey): number {
  const { year, month, day } = parseKey(key);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function ordinalToKey(ordinal: number): DayKey {
  const d = new Date(ordinal * DAY_MS);
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** b − a, in calendar days. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return keyToOrdinal(b) - keyToOrdinal(a);
}

export function addDays(key: DayKey, n: number): DayKey {
  return ordinalToKey(keyToOrdinal(key) + n);
}

/** 0 = Sunday, matching the Calendar tab's Sun-first week. */
export function weekdayOf(key: DayKey): number {
  const { year, month, day } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-03" — the bucket a day's month is filed under. */
export function monthKeyOf(key: DayKey): string {
  return key.slice(0, 7);
}

/** The key for "today" in the studio's timezone. */
export function todayKey(now: Date = new Date(), tz?: string): DayKey {
  return studioDateKey(now, tz) ?? keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/* ------------------------------------------------------------------ *
 * Which day a session happened on
 * ------------------------------------------------------------------ */

/** Imported FileMaker / chart sessions: their date is a fact, any time on them is not. */
export function isLegacySession(s: HistorySession): boolean {
  return (
    Boolean(s.legacy_filemaker_id) ||
    s.trainerId === "legacy-trainer" ||
    s.trainerInitials === "Legacy" ||
    s.trainerInitials === "Chart"
  );
}

/**
 * "Log past session" stamps `startTime` as the chosen date at 12:00 UTC. That
 * is a placeholder, not a time anyone trained, so it is never shown as one.
 */
export function isBackfilledSession(s: HistorySession): boolean {
  return typeof s.startTime === "string" && /T12:00:00(\.000)?Z$/.test(s.startTime);
}

/**
 * The instant the session actually started, when the record has one worth
 * trusting: the server's `startTime`, or the tablet's own clock while that is
 * still pending. Legacy imports have neither.
 */
export function sessionStartInstant(s: HistorySession): Date | null {
  if (isLegacySession(s)) return null;
  return toDate(s.startTime ?? null) ?? toDate(s.clientStartTime ?? null);
}

/**
 * The studio day a session belongs to.
 *
 * WHY NOT JUST `session.date`: until Sep 10 2026 the live flow wrote `date`
 * as `new Date().toISOString().split("T")[0]` — the UTC date. Eastern time is
 * four or five hours behind UTC, so a session started at 7:30 PM in January
 * was stored as the NEXT day. New sessions now store the Eastern day
 * (studioTodayKey), but the old ones were not rewritten, so the start instant
 * still wins whenever the record has one, and `date` is the fallback for
 * imported and backfilled sessions, where it is the only thing anyone typed.
 */
export function sessionDayKey(s: HistorySession, tz?: string): DayKey | null {
  const instant = sessionStartInstant(s);
  if (instant) {
    const key = studioDateKey(instant, tz);
    if (key) return key;
  }
  const iso = typeof s.date === "string" ? s.date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) : null;
  if (iso) return keyOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const ms = parseSessionDate(s.date);
  if (ms > 0) {
    const d = new Date(ms);
    return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/** Sort key inside a day: real start time when known, else stable by id. */
function withinDayOrder(s: HistorySession): number {
  return sessionStartInstant(s)?.getTime() ?? 0;
}

export interface VisitDay {
  key: DayKey;
  /** Oldest first. Two sessions on one day happen (a re-start, a double). */
  sessions: HistorySession[];
}

/**
 * The earliest day History will place on the calendar. A backfill typed on a
 * desktop date input as "26" for 2026 is stored as "0026-02-03"; one stray
 * 1900 date would otherwise draw 1,500 empty month cards.
 */
export const EARLIEST_PLACEABLE_DAY: DayKey = "2000-01-01";

/**
 * Group sessions into visit days, oldest first.
 *
 * A session goes into `unplaced` instead when its date cannot be read, is
 * before EARLIEST_PLACEABLE_DAY, or is after `today`. A future-dated session
 * is a typo, not a visit: counted as one it would switch off "no visit in 5
 * weeks" and invent a months-long break up to the typo. The list still shows
 * every unplaced session, last, so nothing silently disappears.
 */
export function toVisitDays(
  sessions: HistorySession[],
  tz?: string,
  today?: DayKey,
): { days: VisitDay[]; undated: HistorySession[] } {
  const byKey = new Map<DayKey, HistorySession[]>();
  const undated: HistorySession[] = [];
  for (const s of sessions) {
    const key = sessionDayKey(s, tz);
    const placeable =
      key !== null &&
      /^\d{4}-\d{2}-\d{2}$/.test(key) &&
      key >= EARLIEST_PLACEABLE_DAY &&
      (today === undefined || key <= today);
    if (!placeable) {
      undated.push(s);
      continue;
    }
    const list = byKey.get(key!) ?? [];
    list.push(s);
    byKey.set(key!, list);
  }
  const days = Array.from(byKey.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, list]) => ({
      key,
      sessions: list.sort((a, b) => withinDayOrder(a) - withinDayOrder(b)),
    }));
  return { days, undated };
}

/* ------------------------------------------------------------------ *
 * Cadence — how often, and where the breaks were
 * ------------------------------------------------------------------ */

/**
 * A BREAK is two weeks or more between visits.
 *
 * The program runs once or twice a week, so a normal gap is 3–7 days. Fourteen
 * catches a once-a-week client missing a week and a twice-a-week client missing
 * four sessions, and it never fires on a normal week. One named constant, so if
 * the studios want 10 or 21 it is a one-line change with tests behind it.
 */
export const BREAK_MIN_GAP_DAYS = 14;

/** "Visits per week" looks back twelve weeks: long enough to be stable, short enough to be current. */
export const RECENT_WINDOW_DAYS = 84;

export interface Gap {
  /** Last visit before the gap. */
  from: DayKey;
  /** The visit that ended it — or today, while it is still going. */
  to: DayKey;
  /** Calendar days from `from` to `to`. Back-to-back days are a gap of 1. */
  days: number;
  ongoing: boolean;
}

export function isBreak(gap: Gap): boolean {
  return gap.days >= BREAK_MIN_GAP_DAYS;
}

/** Every gap between consecutive visit days, oldest first, plus the open gap up to today. */
export function findGaps(days: VisitDay[], today: DayKey): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < days.length; i++) {
    gaps.push({
      from: days[i - 1].key,
      to: days[i].key,
      days: daysBetween(days[i - 1].key, days[i].key),
      ongoing: false,
    });
  }
  const last = days[days.length - 1];
  if (last && last.key < today) {
    gaps.push({ from: last.key, to: today, days: daysBetween(last.key, today), ongoing: true });
  }
  return gaps;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile (0–1) of an already sorted list. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  return sorted[rank - 1];
}

export interface CadenceStats {
  sessions: number;
  visitDays: number;
  first: DayKey | null;
  last: DayKey | null;
  /** Visits a week over the last twelve weeks (or since the first visit, if sooner). */
  perWeekRecent: number | null;
  /** True when the client's whole history fits inside those twelve weeks. */
  recentCoversAll: boolean;
  /** Visits a week from the first visit to the last — how often, while coming. */
  perWeekOverall: number | null;
  /** The middle gap between visits, in days. Median, so one long break cannot drag it. */
  typicalGapDays: number | null;
  /**
   * The middle half of all gaps — 25th to 75th percentile. A Mon/Thu client
   * reads "3–4 days", exactly how a trainer would say it; a wide range such
   * as "2–9 days" IS the inconsistency, stated as a fact rather than a score.
   */
  typicalGapRange: [number, number] | null;
  /** Gaps of two weeks or more, newest first. Includes one still going. */
  breaks: Gap[];
  longestBreak: Gap | null;
  daysSinceLast: number | null;
  /** The client has not been in for two weeks or more, as of today. */
  onBreak: boolean;
}

export function computeCadence(days: VisitDay[], today: DayKey): CadenceStats {
  const sessions = days.reduce((n, d) => n + d.sessions.length, 0);
  const first = days[0]?.key ?? null;
  const last = days[days.length - 1]?.key ?? null;
  const gaps = findGaps(days, today);
  const closed = gaps.filter((g) => !g.ongoing);
  const closedSorted = closed.map((g) => g.days).sort((a, b) => a - b);
  const breaks = gaps.filter(isBreak).reverse();
  const longestBreak = breaks.reduce<Gap | null>(
    (best, g) => (!best || g.days > best.days ? g : best),
    null,
  );

  let perWeekRecent: number | null = null;
  let perWeekOverall: number | null = null;
  let recentCoversAll = false;
  if (first && last) {
    const twelveWeeksAgo = addDays(today, -(RECENT_WINDOW_DAYS - 1));
    recentCoversAll = first >= twelveWeeksAgo;
    const windowStart = recentCoversAll ? first : twelveWeeksAgo;
    const inWindow = days.filter((d) => d.key >= windowStart && d.key <= today).length;
    const windowWeeks = Math.max(1, (daysBetween(windowStart, today) + 1) / 7);
    perWeekRecent = windowStart > today ? 0 : inWindow / windowWeeks;
    const activeWeeks = Math.max(1, (daysBetween(first, last) + 1) / 7);
    perWeekOverall = days.length / activeWeeks;
  }

  const ongoing = gaps.find((g) => g.ongoing);
  return {
    sessions,
    visitDays: days.length,
    first,
    last,
    perWeekRecent,
    recentCoversAll,
    perWeekOverall,
    typicalGapDays: median(closed.map((g) => g.days)),
    typicalGapRange: closedSorted.length
      ? [percentile(closedSorted, 0.25), percentile(closedSorted, 0.75)]
      : null,
    breaks,
    longestBreak,
    daysSinceLast: last ? Math.max(0, daysBetween(last, today)) : null,
    onBreak: Boolean(ongoing && isBreak(ongoing)),
  };
}

/* ------------------------------------------------------------------ *
 * Client events on the timeline
 * ------------------------------------------------------------------ */

/** Event types that mean "not coming in, and that is why". They tint the days they cover. */
export const AWAY_EVENT_TYPES = new Set(["Vacation", "Snowbird", "Medical"]);

export interface TimelineEvent {
  id: string;
  title: string;
  type: string;
  from: DayKey;
  to: DayKey;
  away: boolean;
}

function eventKey(raw: string | undefined): DayKey | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return keyOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const ms = parseSessionDate(raw);
  if (ms <= 0) return null;
  const d = new Date(ms);
  return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function toTimelineEvents(events: ClientEvent[] | undefined): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  (events ?? []).forEach((e, i) => {
    const from = eventKey(e.date);
    if (!from) return;
    const endKey = eventKey(e.endDate);
    const to = endKey && endKey >= from ? endKey : from;
    out.push({
      id: e.id || `event-${i}`,
      title: e.title || e.type || "Event",
      type: e.type || "Other",
      from,
      to,
      away: AWAY_EVENT_TYPES.has(e.type),
    });
  });
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** The away event that best explains a gap: the one overlapping it most. */
export function awayEventFor(gap: Gap, events: TimelineEvent[]): TimelineEvent | null {
  let best: TimelineEvent | null = null;
  let bestOverlap = 0;
  for (const e of events) {
    if (!e.away) continue;
    const start = e.from > gap.from ? e.from : gap.from;
    const end = e.to < gap.to ? e.to : gap.to;
    const overlap = daysBetween(start, end) + 1;
    if (overlap > bestOverlap) {
      best = e;
      bestOverlap = overlap;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The calendar — every month, oldest to newest inside a year
 * ------------------------------------------------------------------ */

export type CellState =
  /** At least one session. */
  | "visit"
  /** Inside a gap of two weeks or more. */
  | "break"
  /** Covered by a vacation / snowbird / medical event and not a visit. */
  | "away"
  /** An ordinary day off between visits. */
  | "rest"
  /** Before the first visit on record. */
  | "before"
  /** After today. */
  | "future";

export interface DayCellModel {
  key: DayKey;
  day: number;
  state: CellState;
  isToday: boolean;
  sessions: HistorySession[];
  /** A non-away client event lands on this day (progress report, alert, …). */
  hasMarker: boolean;
}

export interface MonthModel {
  /** "2026-03" */
  key: string;
  year: number;
  /** 1–12 */
  month: number;
  name: string;
  shortName: string;
  sessions: number;
  visitDays: number;
  /** Always 42 — six weeks, Sunday first — so every card in a row is the same height. */
  cells: (DayCellModel | null)[];
  /** Events touching this month, for the card's footnote. */
  events: TimelineEvent[];
}

export interface YearModel {
  year: number;
  /** Oldest month first, the way a year reads. */
  months: MonthModel[];
  sessions: number;
  perWeek: number | null;
  /** Breaks that overlap this year. */
  breakCount: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export interface BuildCalendarInput {
  days: VisitDay[];
  events: TimelineEvent[];
  cadence: CadenceStats;
  today: DayKey;
}

/**
 * Newest year first; inside a year, January → the latest month, because that
 * is how every calendar a person has ever read runs. The range starts at the
 * first visit on record and ends at today's month — no empty future months, no
 * empty months before the client existed.
 */
export function buildCalendar({ days, events, cadence, today }: BuildCalendarInput): YearModel[] {
  if (!cadence.first) return [];

  const visits = new Map(days.map((d) => [d.key, d]));
  const breaks = cadence.breaks;
  const inBreak = (key: DayKey) => breaks.some((g) => key > g.from && key < g.to) ||
    breaks.some((g) => g.ongoing && key > g.from && key <= g.to);
  const awayOn = (key: DayKey) => events.some((e) => e.away && key >= e.from && key <= e.to);
  const markerOn = (key: DayKey) => events.some((e) => !e.away && key >= e.from && key <= e.to);

  const start = parseKey(cadence.first);
  // A session typed with a future date still gets its month drawn.
  const end = parseKey(cadence.last && cadence.last > today ? cadence.last : today);
  const months: MonthModel[] = [];

  for (let y = start.year, m = start.month; y < end.year || (y === end.year && m <= end.month); ) {
    const firstKey = keyOf(y, m, 1);
    const lead = weekdayOf(firstKey);
    const count = daysInMonth(y, m);
    const lastKey = keyOf(y, m, count);
    const cells: (DayCellModel | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);

    let sessions = 0;
    let visitDays = 0;
    for (let d = 1; d <= count; d++) {
      const key = keyOf(y, m, d);
      const visit = visits.get(key);
      let state: CellState;
      if (visit) {
        state = "visit";
        sessions += visit.sessions.length;
        visitDays += 1;
      } else if (key > today) state = "future";
      else if (key < cadence.first) state = "before";
      else if (awayOn(key)) state = "away";
      else if (inBreak(key)) state = "break";
      else state = "rest";
      cells.push({
        key,
        day: d,
        state,
        isToday: key === today,
        sessions: visit?.sessions ?? [],
        hasMarker: markerOn(key),
      });
    }
    while (cells.length < 42) cells.push(null);

    months.push({
      key: firstKey.slice(0, 7),
      year: y,
      month: m,
      name: monthName(m),
      shortName: monthName(m).slice(0, 3),
      sessions,
      visitDays,
      cells,
      events: events.filter((e) => e.from <= lastKey && e.to >= firstKey),
    });

    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const years = new Map<number, MonthModel[]>();
  for (const month of months) {
    const list = years.get(month.year) ?? [];
    list.push(month);
    years.set(month.year, list);
  }

  return Array.from(years.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => {
      const yearStart = keyOf(year, 1, 1);
      const yearEnd = keyOf(year, 12, 31);
      const spanStart = cadence.first! > yearStart ? cadence.first! : yearStart;
      const spanEnd = today < yearEnd ? today : yearEnd;
      const spanDays = daysBetween(spanStart, spanEnd) + 1;
      const visitDays = list.reduce((n, mo) => n + mo.visitDays, 0);
      return {
        year,
        months: list,
        sessions: list.reduce((n, mo) => n + mo.sessions, 0),
        perWeek: spanDays > 0 ? visitDays / Math.max(1, spanDays / 7) : null,
        breakCount: breaks.filter((g) => g.from <= yearEnd && g.to >= yearStart).length,
      };
    });
}

/* ------------------------------------------------------------------ *
 * The list — newest first, with the breaks written in
 * ------------------------------------------------------------------ */

export interface ListSessionItem {
  kind: "session";
  id: string;
  session: HistorySession;
  dayKey: DayKey | null;
  /** Completed sessions only, counted the way the client experienced them. */
  number: number | null;
  /** Days since the previous visit day. Only on the first session of a day. */
  gapDays: number | null;
}

export interface ListBreakItem {
  kind: "break";
  id: string;
  gap: Gap;
  away: TimelineEvent | null;
}

export type ListItem = ListSessionItem | ListBreakItem;

export interface ListMonth {
  /** "2026-03", or "undated". */
  key: string;
  year: number;
  month: number;
  name: string;
  sessions: number;
  items: ListItem[];
}

export interface BuildListInput {
  days: VisitDay[];
  undated: HistorySession[];
  events: TimelineEvent[];
  cadence: CadenceStats;
  /**
   * The client's own completed-session count, when not every session is
   * loaded. Numbers count down from it, so the oldest LOADED session is not
   * mislabelled "S1" the way the 30-session list used to.
   */
  numberAnchor?: number;
}

export function buildList({ days, undated, events, cadence, numberAnchor }: BuildListInput): {
  ongoing: ListBreakItem | null;
  months: ListMonth[];
} {
  const newestFirst = [...days].reverse();
  const completed = newestFirst.reduce(
    (n, d) => n + d.sessions.filter((s) => s.status === "Completed").length,
    0,
  );
  let next = Math.max(numberAnchor ?? 0, completed);

  const months: ListMonth[] = [];
  const monthFor = (key: string, year: number, month: number, name: string) => {
    let current = months[months.length - 1];
    if (!current || current.key !== key) {
      current = { key, year, month, name, sessions: 0, items: [] };
      months.push(current);
    }
    return current;
  };

  newestFirst.forEach((day, i) => {
    const { year, month } = parseKey(day.key);
    const section = monthFor(monthKeyOf(day.key), year, month, monthName(month));
    const older = newestFirst[i + 1];
    const gapDays = older ? daysBetween(older.key, day.key) : null;

    [...day.sessions].reverse().forEach((session, j) => {
      const isDone = session.status === "Completed";
      section.items.push({
        kind: "session",
        id: session.id || `${day.key}-${j}`,
        session,
        dayKey: day.key,
        number: isDone && next > 0 ? next-- : null,
        gapDays: j === 0 ? gapDays : null,
      });
      section.sessions += 1;
    });

    if (older && gapDays !== null && gapDays >= BREAK_MIN_GAP_DAYS) {
      const gap: Gap = { from: older.key, to: day.key, days: gapDays, ongoing: false };
      section.items.push({ kind: "break", id: `break-${gap.from}`, gap, away: awayEventFor(gap, events) });
    }
  });

  if (undated.length) {
    // No readable date, or one the calendar cannot place (see toVisitDays).
    const section: ListMonth = { key: "undated", year: 0, month: 0, name: "Date needs a look", sessions: 0, items: [] };
    undated.forEach((session, j) => {
      section.items.push({
        kind: "session",
        id: session.id || `undated-${j}`,
        session,
        dayKey: null,
        number: null,
        gapDays: null,
      });
      section.sessions += 1;
    });
    months.push(section);
  }

  const open = cadence.breaks.find((g) => g.ongoing) ?? null;
  return {
    ongoing: open ? { kind: "break", id: "break-ongoing", gap: open, away: awayEventFor(open, events) } : null,
    months,
  };
}

/* ------------------------------------------------------------------ *
 * One session, from its sets
 * ------------------------------------------------------------------ */

export type StripQuality = RepQuality;

export interface SessionSummary {
  /** Distinct machines with a real set on them. */
  machines: number;
  /** One entry per machine, in the order they were done. */
  strip: { machineId: string; quality: StripQuality }[];
  max: number;
  done: number;
  poor: number;
  /** Pounds moved, same formula as the old list and the session pop-up. */
  volume: number;
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * A set is REAL when something was lifted or held. "Log past session" seeds
 * zero-everything placeholder logs for the client's usual machines; counting
 * those would show five machines on a session where nothing was recorded.
 */
export function isPerformed(log: ExerciseLog): boolean {
  return toNum(log.weight) > 0 || toNum(log.reps) > 0 || toNum(log.seconds) > 0;
}

/**
 * The quality a set carries. Exception-only, like the Journey grid: a set
 * with effort and no rating IS a completed set. Out-of-range legacy values
 * fall back to completed rather than inventing a verdict.
 */
export function qualityOf(log: ExerciseLog): StripQuality {
  const q = Number(log.repQuality);
  return q === 1 || q === 3 ? q : 2;
}

function logOrder(log: ExerciseLog, index: number): number {
  if (typeof log.suggestedOrder === "number") return log.suggestedOrder;
  const created = toDate(log.createdAt ?? null)?.getTime();
  return created ?? index;
}

/** One log per machine: Left when a machine was done per side, as the Journey grid does. */
function oneLogPerMachine(logs: ExerciseLog[]): ExerciseLog[] {
  const performed = logs
    .map((log, i) => ({ log, order: logOrder(log, i) }))
    .filter(({ log }) => isPerformed(log))
    .sort((a, b) => a.order - b.order)
    .map(({ log }) => log);
  const byMachine = new Map<string, ExerciseLog>();
  for (const log of performed) {
    const seen = byMachine.get(log.machineId);
    if (!seen || (seen.side === "Right" && log.side !== "Right")) byMachine.set(log.machineId, log);
  }
  return Array.from(byMachine.values());
}

export function summarizeSession(logs: ExerciseLog[]): SessionSummary {
  const perMachine = oneLogPerMachine(logs);
  const strip = perMachine.map((log) => ({ machineId: log.machineId, quality: qualityOf(log) }));
  return {
    machines: strip.length,
    strip,
    max: strip.filter((s) => s.quality === 3).length,
    done: strip.filter((s) => s.quality === 2).length,
    poor: strip.filter((s) => s.quality === 1).length,
    volume: Math.round(
      logs.filter(isPerformed).reduce((sum, log) => sum + calculateExerciseVolume(log), 0),
    ),
  };
}

/**
 * Machines that went UP in weight since the last time the client did them.
 *
 * Sessions are walked oldest → newest. A session whose sets have not been
 * loaded yet BREAKS the chain rather than being skipped: skipping it would
 * compare today with a session two visits back and call a repeat a gain. So
 * near the edge of what is loaded the count can only be low, never wrong.
 */
export function weightUpsBySession(
  sessionIdsOldestFirst: string[],
  logsBySession: ReadonlyMap<string, ExerciseLog[]>,
): Map<string, number> {
  const out = new Map<string, number>();
  let last = new Map<string, number>();
  for (const id of sessionIdsOldestFirst) {
    const logs = logsBySession.get(id);
    if (!logs) {
      last = new Map();
      continue;
    }
    let ups = 0;
    for (const log of oneLogPerMachine(logs)) {
      const w = toNum(log.weight);
      if (w <= 0) continue;
      const prev = last.get(log.machineId);
      if (prev !== undefined && w > prev) ups += 1;
      last.set(log.machineId, w);
    }
    out.set(id, ups);
  }
  return out;
}

/**
 * Volume against the client's previous session ON THE SAME ROUTINE.
 *
 * Most of the roster alternates Routine A and B, which work different
 * machines, so "vs the session before" would compare A with B every time and
 * the arrow would flip on every row. Against the last A (or the last B) the
 * number means something.
 *
 * The routine is identified by `routineKey` — by default the session's
 * `routineId`, which is what the live flow actually writes (`routineName` is
 * only on older and demo documents). Sessions with no routine compare with
 * the previous session of any kind. Returns a whole-number percentage, or
 * nothing when either side's sets are not loaded or the old volume was zero.
 */
export function volumeDeltas(
  sessionsNewestFirst: HistorySession[],
  logsBySession: ReadonlyMap<string, ExerciseLog[]>,
  routineKey: (s: HistorySession) => string | null = defaultRoutineKey,
): Map<string, { pct: number; against: string | null }> {
  const out = new Map<string, { pct: number; against: string | null }>();
  const done = sessionsNewestFirst.filter((s) => s.status === "Completed" && s.id);
  done.forEach((s, i) => {
    const logs = logsBySession.get(s.id!);
    if (!logs) return;
    const routine = routineKey(s);
    const prev = done.slice(i + 1).find((p) => (routine ? routineKey(p) === routine : true));
    if (!prev) return;
    const prevLogs = logsBySession.get(prev.id!);
    if (!prevLogs) return;
    const now = summarizeSession(logs).volume;
    const before = summarizeSession(prevLogs).volume;
    if (before <= 0 || now <= 0) return;
    out.set(s.id!, { pct: Math.round(((now - before) / before) * 100), against: routine });
  });
  return out;
}

export function defaultRoutineKey(s: HistorySession): string | null {
  return s.routineId || s.routineName || null;
}

/**
 * The name of the routine a session followed. The live flow stores only
 * `routineId`, so the id is looked up among the client's routines first;
 * `routineName` covers documents that carry the name themselves.
 */
export function routineNamer(
  routines: { id?: string; name: string }[] | undefined,
): (s: HistorySession) => string | null {
  const byId = new Map<string, string>();
  for (const r of routines ?? []) if (r.id) byId.set(r.id, r.name);
  return (s) => (s.routineId ? byId.get(s.routineId) : undefined) ?? s.routineName ?? null;
}

/** "Routine B" → "B". Anything that is not a lettered routine has no letter. */
export function routineLetter(name: string | undefined | null): string | null {
  if (!name) return null;
  const m = name.trim().match(/^routine\s+([a-z])$/i) ?? name.trim().match(/^([a-z])$/i);
  return m ? m[1].toUpperCase() : null;
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** "3 days", "2 weeks", "5 weeks", "4 months" — the unit a trainer would say out loud. */
export function describeSpan(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 63) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  const months = Math.round(days / 30.44);
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** "3-week", "13-day", "2-month" — for "a 3-week break". */
export function describeSpanAdjective(days: number): string {
  const [n, unit] = describeSpan(days).split(" ");
  return `${n}-${unit.replace(/s$/, "")}`;
}

const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

/** "Mar 4" — or "Mar 4, 2025" when the year is not the one the reader is in. */
export function shortDate(key: DayKey, currentYear?: number): string {
  const { year, month, day } = parseKey(key);
  const base = `${SHORT_MONTHS[month - 1]} ${day}`;
  return currentYear !== undefined && year !== currentYear ? `${base}, ${year}` : base;
}

/**
 * "Dec 20 – Jan 27" with the year added only when it differs from
 * `currentYear`. `compact` writes years as ’24 so a range fits a stat tile.
 */
export function describeRange(
  from: DayKey,
  to: DayKey,
  currentYear?: number,
  compact = false,
): string {
  const a = parseKey(from);
  const b = parseKey(to);
  const withYear = currentYear !== undefined && (a.year !== currentYear || b.year !== currentYear);
  const yr = (y: number) => (compact ? ` ’${String(y).slice(2)}` : `, ${y}`);
  const left = `${SHORT_MONTHS[a.month - 1]} ${a.day}${withYear && a.year !== b.year ? yr(a.year) : ""}`;
  const right = `${SHORT_MONTHS[b.month - 1]} ${b.day}${withYear ? yr(b.year) : ""}`;
  return `${left} – ${right}`;
}

/** 1.8, 2, 0.5 — one decimal, trailing zero dropped. */
export function perWeekLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
