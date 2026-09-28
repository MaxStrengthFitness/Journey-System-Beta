/**
 * EIGHT WEEKS OF BOOKINGS FOLDED INTO ONE SMALL DOCUMENT (Openings,
 * docs/rounds/2026-09-27-openings.md, the data, part 2, and the Sunday job's
 * step, part 4).
 *
 * Once a week the Sunday job (server/machine-trends-job.ts) hands this module
 * one studio's last eight weeks of bookings, its whole-read record, its
 * standing weeks, the trainers and last Sunday's summary, and writes back
 * what it returns to `studios/{s}/watch/openings`. The screens then read one
 * document instead of two months of bookings (about 1.4 MB for a busy studio
 * every time someone opened Openings): "keep running totals instead of
 * re-reading history".
 *
 * THE WINDOW is the eight Monday-to-Saturday weeks that have ended by the
 * studio's today, on the studio's own calendar: on a Sunday that includes the
 * week just ended; on a Wednesday it starts with last week. Never "now is
 * Sunday", never UTC days (the machine-trends window counts UTC days and must
 * not be reused), never the zone of the computer running the job.
 *
 * WHY REBUILD ALL EIGHT WEEKS each Sunday rather than add one: a change
 * Mindbody sends later about a past week still reaches the summary, a missed
 * Sunday heals itself the next week, and nothing carried from one run to the
 * next can drift. Only the agreed weeks' history is carried (agreed.ts),
 * because nothing else holds it.
 *
 * THE SIZE CEILING. About 60 to 120 KiB for a busy studio, far under
 * Firestore's 1 MiB; the fold's test holds a busy studio under
 * SIZE_CEILING_BYTES, and the job skips a studio whose document would pass
 * SKIP_ABOVE_BYTES, keeping last week's (`storedBytes` is Firestore's own
 * size arithmetic).
 *
 * PURE MODULE: the Sunday job imports it. The job reads the bookings with
 * `studioId ==` and a `startTime` range from `foldWindow` (the existing
 * (studioId, startTime) index), the record's months by id (`coverageMonths`).
 */
import type { ScheduleEntry } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { studioDateKey, studioDayBoundsForKey, studioTodayKey, toDate } from "../../lib/studio-time";
import type { StandingWeekDoc } from "../standing-week/week";
import { weekdayOf } from "../studio-tasks/recurrence";
import { blocksIn, carryHistory, currentVersions, rowsCovered, versionOn, type AgreedHistory } from "./agreed";
import { addDays, monthOf, type CoverageRecord } from "./coverage";
import { countDays } from "./days";
import { cancellationOf, pastRow, trainersBooked, whyNotJudged, type PlacedBooking, type RoomDay } from "./room";
import { OPENINGS_WEEKDAYS, ROW_MINUTES, bookingTime, timeKey } from "./rows";
import {
  SUMMARY_VERSION,
  cellForWrite,
  historyOf,
  isEmptyCell,
  type CellWeek,
  type OpeningsSummary,
  type SummaryDay,
  type SummaryWeek,
  type SummaryWho,
} from "./summary-doc";
import { placeBooking, type TrainerRef } from "./whose";

/** The weeks folded: the last eight. */
export const WINDOW_WEEKS = 8;

/** A busy studio's summary stays under this (the fold's own test). */
export const SIZE_CEILING_BYTES = 256 * 1024;

/** The job skips a studio whose summary would pass this, and keeps last week's. */
export const SKIP_ABOVE_BYTES = 512 * 1024;

export interface FoldWindow {
  /** The eight Mondays, newest first. */
  mondays: string[];
  /** The oldest Monday and the newest Saturday: the studio days read. */
  first: string;
  last: string;
  /** The instants the job's bookings read spans (the studio's own midnights). */
  start: Date;
  end: Date;
}

/** The eight Monday-to-Saturday weeks that have ended by `today` (the header). */
export function foldWindow(today: string, tz: string): FoldWindow {
  // The latest Saturday before today: yesterday on a Sunday.
  const back = (weekdayOf(today) + 1) % 7 || 7;
  const lastSaturday = addDays(today, -back);
  const newest = addDays(lastSaturday, -5);
  const mondays = Array.from({ length: WINDOW_WEEKS }, (_, k) => addDays(newest, -7 * k));
  const first = mondays[WINDOW_WEEKS - 1];
  return { mondays, first, last: lastSaturday, start: studioDayBoundsForKey(first, tz).start, end: studioDayBoundsForKey(lastSaturday, tz).end };
}

/** The whole-read record's months the window touches (at most three), for the job to read by id. */
export function coverageMonths(window: Pick<FoldWindow, "first" | "last">): string[] {
  const months = new Set<string>();
  for (let day = window.first; day <= window.last; day = addDays(day, 1)) months.add(monthOf(day));
  return [...months].sort();
}

export interface FoldInput {
  studioId: string;
  /** The studio's clock. */
  tz: string;
  /** When the job ran. */
  now: Date;
  /**
   * The Demo studio: its bookings were all written by the seeder, so a day
   * holding a demo booking counts as read, and a day holding none (the weeks
   * before a seed or a Reset) doesn't. A Reset starts the usual week over, so
   * last Sunday's `since` isn't carried either.
   */
  isDemo?: boolean;
  /** The window's bookings, cancellations included. */
  bookings: readonly ScheduleEntry[];
  /** The whole-read record for `coverageMonths` (a month whose read failed maps to null). */
  coverage: CoverageRecord;
  /** The trainers bookings are placed among, with their staff ids at this studio's site. */
  trainers: readonly TrainerRef[];
  /** The studio's standing weeks, as they are now. */
  weeks: readonly StandingWeekDoc[];
  /** Last Sunday's summary, read (summary-doc.ts); null when missing or unreadable. */
  previous: OpeningsSummary | null;
}

interface DayPlan {
  day: string;
  weekIndex: number;
  weekday: number;
  bookings: PlacedBooking[];
}

/** Fold the window into the summary the job writes. */
export function foldSummary(input: FoldInput): OpeningsSummary {
  const { tz } = input;
  const today = studioTodayKey(input.now, tz);
  const window = foldWindow(today, tz);

  const plans = new Map<string, DayPlan>();
  window.mondays.forEach((monday, weekIndex) => {
    for (const weekday of OPENINGS_WEEKDAYS) {
      const day = addDays(monday, weekday - 1);
      plans.set(day, { day, weekIndex, weekday, bookings: [] });
    }
  });

  // Every booking placed on its day: staff blocks are never bookings.
  const bookingNames = new Map<string, string>();
  for (const entry of input.bookings) {
    if (isStaffBlock(entry)) continue;
    const at = bookingTime(entry, tz);
    const plan = at ? plans.get(at.dateKey) : undefined;
    if (!at || !plan) continue;
    const place = placeBooking(entry, input.trainers);
    if (place.kind === "trainer" && entry.trainerName && !bookingNames.has(place.trainerId)) bookingNames.set(place.trainerId, entry.trainerName);
    plan.bookings.push({ rows: at.rows, place, cancellation: cancellationOf(entry) });
  }

  // Which days count: read in full, and open (live bookings only). In Demo
  // Mode, "read in full" is "holds a demo booking" (days.ts).
  const demoDays = input.isDemo === true ? new Set([...plans.values()].filter((p) => p.bookings.length > 0).map((p) => p.day)) : null;
  const counted = countDays(
    [...plans.values()].map((p) => ({ day: p.day, booked: p.bookings.filter((b) => b.cancellation === "none").length })),
    input.coverage,
    demoDays ? { readDay: (day) => demoDays.has(day) } : {},
  );
  const verdictOf = new Map(counted.map((d) => [d.day, d.verdict]));

  // The agreed weeks in force, carried from last Sunday's.
  const previousBuilt = input.previous ? studioDateKey(toDate(input.previous.builtAt), tz) : null;
  const history: AgreedHistory = carryHistory(input.previous ? historyOf(input.previous) : null, currentVersions(input.weeks, today, tz), {
    keepFrom: window.first,
    previousBuilt,
  });

  // The cells, by trainers/{id} for now; short keys once everyone named is known.
  const rawCells = new Map<string, Map<number, { cell: Parameters<typeof cellForWrite>[0]; judged: boolean }>>();
  const weekDays: Record<string, SummaryDay>[] = window.mondays.map(() => ({}));
  const named = new Set<string>(Object.keys(history));

  for (const plan of plans.values()) {
    const verdict = verdictOf.get(plan.day) ?? "unread";
    const live = plan.bookings.filter((b) => b.cancellation === "none").length;
    if (verdict !== "counted") {
      weekDays[plan.weekIndex][String(plan.weekday)] = { n: live, x: verdict === "closed" ? "c" : "r" };
      continue;
    }
    const agreed = new Map<string, ReturnType<typeof blocksIn>>();
    for (const [id, versions] of Object.entries(history)) {
      const v = versionOn(versions, plan.day);
      if (v) agreed.set(id, blocksIn(v));
    }
    const day: RoomDay = { weekday: plan.weekday, bookings: plan.bookings, agreed };
    const why = whyNotJudged(day);
    const judged = why === null;
    weekDays[plan.weekIndex][String(plan.weekday)] = judged ? { n: live, j: 1 } : { n: live, q: why === "unplaced" ? "p" : "a" };

    const rows = new Set<number>();
    for (const b of plan.bookings) for (const r of b.rows) rows.add(r);
    const booked = trainersBooked(day);
    for (const [id, blocks] of agreed) if (booked.has(id)) for (const r of rowsCovered(blocks, plan.weekday)) rows.add(r);

    for (const row of rows) {
      const r = pastRow(day, row, judged);
      // Who was in is known only on a day that can be judged: on any other,
      // a trainer with no agreed week may have been in too.
      const inIds = judged ? r.inIds : [];
      for (const id of inIds) named.add(id);
      const key = timeKey(plan.weekday, row);
      if (!rawCells.has(key)) rawCells.set(key, new Map());
      rawCells.get(key)!.set(plan.weekIndex, {
        judged,
        cell: { word: r.word, booked: r.booked, rotation: r.rotation, cancelled: r.cancelled, late: r.late, inKeys: inIds },
      });
    }
  }

  // Short keys, in name order, for everyone a time or an agreed week names.
  const nameOf = (id: string): string =>
    input.trainers.find((t) => t.id === id)?.name ||
    input.weeks.find((w) => w.trainerId === id)?.trainerName ||
    Object.values(input.previous?.who ?? {}).find((w) => w.id === id)?.n ||
    bookingNames.get(id) ||
    "";
  const ordered = [...named].map((id) => ({ id, n: nameOf(id) })).sort((a, b) => a.n.localeCompare(b.n) || a.id.localeCompare(b.id));
  const keyOf = new Map<string, string>();
  const who: Record<string, SummaryWho> = {};
  ordered.forEach((t, index) => {
    const k = index.toString(36);
    keyOf.set(t.id, k);
    who[k] = { id: t.id, n: t.n };
  });

  const cells: Record<string, Record<string, CellWeek>> = {};
  for (const key of [...rawCells.keys()].sort()) {
    const byWeek: Record<string, CellWeek> = {};
    for (const [weekIndex, { cell, judged }] of [...rawCells.get(key)!.entries()].sort((a, b) => a[0] - b[0])) {
      const stored = cellForWrite({ ...cell, inKeys: cell.inKeys.map((id) => keyOf.get(id)!).filter(Boolean) });
      if (!isEmptyCell(stored, judged)) byWeek[String(weekIndex)] = stored;
    }
    if (Object.keys(byWeek).length > 0) cells[key] = byWeek;
  }

  const agreed: OpeningsSummary["agreed"] = {};
  for (const [id, versions] of Object.entries(history)) agreed[keyOf.get(id)!] = versions;

  const weeks: SummaryWeek[] = window.mondays.map((m, i) => ({ m, d: weekDays[i] }));
  const firstCounted = [...window.mondays].reverse().find((_, i) => {
    const d = weekDays[WINDOW_WEEKS - 1 - i];
    return Object.values(d).some((day) => !day.x);
  });
  // Carried from last Sunday's, except in Demo Mode, where a Reset starts over.
  const previousSince = input.isDemo === true ? null : (input.previous?.since ?? null);
  const since = [previousSince, firstCounted ?? null].filter((d): d is string => !!d).sort()[0] ?? null;

  return {
    v: SUMMARY_VERSION,
    builtAt: input.now.toISOString(),
    tz,
    row: ROW_MINUTES,
    since,
    weeks,
    who,
    agreed,
    cells,
  };
}

/**
 * Roughly the bytes Firestore counts for a stored value: a string is its
 * UTF-8 bytes plus one, a number or a date 8, a boolean or null 1, a map its
 * keys (as strings) and values, a list its values; a document adds 32 and
 * its name, allowed for here at 100.
 */
export function storedBytes(value: unknown, top = true): number {
  const base = top ? 32 + 100 : 0;
  if (value === null || value === undefined) return base + 1;
  if (typeof value === "string") return base + utf8(value) + 1;
  if (typeof value === "number") return base + 8;
  if (typeof value === "boolean") return base + 1;
  if (value instanceof Date) return base + 8;
  if (Array.isArray(value)) return base + value.reduce((n: number, v) => n + storedBytes(v, false), 0);
  if (typeof value === "object") {
    let n = base;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) n += utf8(k) + 1 + storedBytes(v, false);
    return n;
  }
  return base;
}

function utf8(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
