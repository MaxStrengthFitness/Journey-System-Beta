/**
 * THE WEEK — last week's review, this week so far and the week ahead, as
 * facts per day and a bottom line. Pure: review.test.ts
 * (TZ=America/New_York).
 *
 * The redesign's Operations room, phase 5 (Sep 28 2026; research-operations
 * §6.3, the Monday review in the SITREP's order: bottom line, what happened,
 * clients, renewals, team, trust). AJ asked for "a command center … for that
 * day and week": Today answers the day, this answers the week.
 *
 * THE RULES IT KEEPS:
 *
 *   - Done means logged (AJ, Sep 24 2026): a booking happened when Journey
 *     logged a session for that client that studio day (lib/booking-state).
 *     A booking nobody logged is "not logged in Journey", never "didn't
 *     happen" — before a studio's cutover its trainers may still be on
 *     FileMaker. A read of the sessions that failed makes those UNKNOWN.
 *   - A cancellation less than a day before its start is late (Openings'
 *     own rule, openings/room.ts `cancellationOf`), and one with no stamp
 *     is said to have none.
 *   - A Mindbody "Unavailable" block is never a booking (isStaffBlock).
 *   - The trust line says how many days with bookings were read IN FULL
 *     (the whole-read record, openings/coverage.ts); a month whose record
 *     couldn't be read is "can't tell", never "not read".
 */
import type { ScheduleEntry } from "../../../types";
import { bookingState, isStaffBlock, type LoggedSessions } from "../../../lib/booking-state";
import { studioDateKey, toDate } from "../../../lib/studio-time";
import { addDays, weekdayOf } from "../../client-history/model";
import { cancellationOf } from "../../openings/room";
import { wasReadInFull, type CoverageRecord } from "../../openings/coverage";
import type { OutcomeTally } from "../../renewals/rates";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Monday of the week the day is in (weeks run Monday to Sunday, as Hours counts them). */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** The seven studio days from a Monday. */
export function weekFrom(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface DayFacts {
  day: string;
  /** "Mon". */
  label: string;
  /** Live bookings (not cancelled, not a staff block). */
  booked: number;
  /** Logged as done in Journey. Null when the sessions couldn't be read. */
  done: number | null;
  /** Finished with nothing logged. Null when unknown. */
  notLogged: number | null;
  /** Still to come (or on the floor). */
  toCome: number;
  cancelled: number;
  late: number;
  /** Cancelled with no stamp saying when. */
  unstamped: number;
}

/** One studio day's facts from the week's bookings and what Journey logged. */
export function dayFacts(entries: readonly ScheduleEntry[], day: string, logged: LoggedSessions | null, now: Date, tz?: string): DayFacts {
  const f: DayFacts = { day, label: WEEKDAY[weekdayOf(day)], booked: 0, done: logged ? 0 : null, notLogged: logged ? 0 : null, toCome: 0, cancelled: 0, late: 0, unstamped: 0 };
  for (const b of entries) {
    if (isStaffBlock(b) || studioDateKey(b.startTime, tz) !== day) continue;
    if (b.status === "Cancelled") {
      f.cancelled += 1;
      const c = cancellationOf(b as ScheduleEntry & { cancelledAt?: unknown });
      if (c === "late") f.late += 1;
      else if (c === "unstamped") f.unstamped += 1;
      continue;
    }
    f.booked += 1;
    const state = bookingState(b, logged, now, tz);
    if (state === "completed") f.done = (f.done ?? 0) + 1;
    else if (state === "never-logged") f.notLogged = (f.notLogged ?? 0) + 1;
    else if (state === "upcoming" || state === "in-progress") f.toCome += 1;
  }
  return f;
}

export interface WeekTotals {
  booked: number;
  done: number | null;
  notLogged: number | null;
  toCome: number;
  cancelled: number;
  late: number;
  unstamped: number;
}

export function totals(days: readonly DayFacts[]): WeekTotals {
  const t: WeekTotals = { booked: 0, done: 0, notLogged: 0, toCome: 0, cancelled: 0, late: 0, unstamped: 0 };
  for (const d of days) {
    t.booked += d.booked;
    t.toCome += d.toCome;
    t.cancelled += d.cancelled;
    t.late += d.late;
    t.unstamped += d.unstamped;
    t.done = t.done === null || d.done === null ? null : t.done + d.done;
    t.notLogged = t.notLogged === null || d.notLogged === null ? null : t.notLogged + d.notLogged;
  }
  return t;
}

/** How many of the days with bookings were read in full: null when no month could be told. */
export function readInFull(days: readonly DayFacts[], record: CoverageRecord | null): { read: number; of: number; unknown: number } | null {
  if (!record) return null;
  let read = 0;
  let of = 0;
  let unknown = 0;
  for (const d of days) {
    if (d.booked + d.cancelled === 0) continue;
    of += 1;
    const whole = wasReadInFull(d.day, record);
    if (whole === null) unknown += 1;
    else if (whole) read += 1;
  }
  return { read, of, unknown };
}

export function busiestDay(days: readonly DayFacts[]): DayFacts | null {
  let best: DayFacts | null = null;
  for (const d of days) if (d.booked > 0 && (!best || d.booked > best.booked)) best = d;
  return best;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface ReviewExtras {
  /** Clients who crossed a line during the week (the Journey's derived `since`). */
  crossed: number;
  /** Clients who booked again after a gap. */
  back: number;
  /** The week's renewal outcomes; null while unread or failed. */
  renewals: OutcomeTally | null;
  coverage: { read: number; of: number; unknown: number } | null;
  renewalUnknown: number;
}

/**
 * The Monday review's bottom line, from the week's facts. Rules, never typed:
 * "{done} of {booked} booked sessions were logged as done", the late
 * cancellations, who crossed a line and who came back, the renewals decided,
 * and whatever couldn't be read named at the end.
 */
export function reviewLine(t: WeekTotals, x: ReviewExtras): string {
  const parts: string[] = [];
  if (t.booked === 0) parts.push("Nothing was booked.");
  else if (t.done === null) parts.push(`${plural(t.booked, "session was", "sessions were")} booked; what was logged couldn't be read.`);
  else parts.push(`${t.done} of ${plural(t.booked, "booked session was", "booked sessions were")} logged as done in Journey${t.notLogged ? `, and ${t.notLogged} ${t.notLogged === 1 ? "has" : "have"} no workout logged` : ""}.`);
  if (t.late > 0) parts.push(`${plural(t.late, "cancellation came", "cancellations came")} less than a day before the session.`);
  parts.push(`${plural(x.crossed, "client", "clients")} crossed a line and started slipping; ${plural(x.back, "client", "clients")} booked again after a gap.`);
  if (x.renewals === null) parts.push("The week's renewal outcomes couldn't be read.");
  else if (x.renewals.total === 0) parts.push("No renewals were decided.");
  else parts.push(`${plural(x.renewals.total, "renewal was", "renewals were")} decided${x.renewals.upgraded > 0 ? `, ${x.renewals.upgraded} up to a longer package` : ""}.`);
  if (x.coverage === null) parts.push("Whether every day's bookings were read in full can't be told.");
  else if (x.coverage.of > 0 && x.coverage.read < x.coverage.of) {
    parts.push(`Bookings were read in full on ${x.coverage.read} of ${plural(x.coverage.of, "day", "days")} with bookings${x.coverage.unknown ? ` (${x.coverage.unknown} can't be told)` : ""}, so the counts may be short.`);
  }
  if (x.renewalUnknown > 0) parts.push(`Renewal timing is unknown for ${plural(x.renewalUnknown, "client", "clients")}.`);
  return parts.join(" ");
}

export interface TrainerWeek {
  /** The trainer's id when Journey knows them, else their name in lower case. */
  key: string;
  trainerId: string | null;
  name: string;
  /** Live bookings over the days asked about. */
  booked: number;
  /** Finished with nothing logged in Journey. Null when what was logged couldn't be read. */
  notLogged: number | null;
  /** The ones not logged yet, earliest first. */
  missing: Array<{ clientId: string | null; clientName: string; day: string; startMs: number }>;
}

interface TrainerLike {
  id?: string;
  authUid?: string | null;
  fullName: string;
}

/**
 * Each trainer's bookings over the studio days `from`..`to`, in name order:
 * facts, never a ranking (Week → Last week's team line and Team → This week
 * read the same numbers). Only the days asked about count — the week read
 * also carries bookings moved AWAY from it, whose start is elsewhere — and a
 * studio rotation or a staff block is nobody's session. "Not logged" is
 * done-means-logged's own "never-logged": a slot that is over with no
 * Journey session for that client that day.
 */
export function teamWeek(
  entries: readonly ScheduleEntry[],
  logged: LoggedSessions | null,
  from: string,
  to: string,
  trainers: readonly TrainerLike[],
  now: Date,
  tz?: string,
): TrainerWeek[] {
  const out = new Map<string, TrainerWeek>();
  for (const b of entries) {
    if (b.status === "Cancelled" || isStaffBlock(b)) continue;
    const day = studioDateKey(b.startTime, tz);
    if (!day || day < from || day > to) continue;
    const known = b.trainerId ? trainers.find((t) => t.id === b.trainerId || (t.authUid && t.authUid === b.trainerId)) : undefined;
    const name = (known?.fullName ?? b.trainerName ?? "").trim();
    if (!name || / rotation$/i.test(name)) continue;
    const key = known?.id ?? name.toLowerCase();
    const row = out.get(key) ?? { key, trainerId: known?.id ?? null, name, booked: 0, notLogged: logged ? 0 : null, missing: [] };
    row.booked += 1;
    if (logged && bookingState(b, logged, now, tz) === "never-logged") {
      row.notLogged = (row.notLogged ?? 0) + 1;
      row.missing.push({ clientId: b.clientId ?? null, clientName: (b.clientName ?? "").trim() || "A client", day, startMs: toDate(b.startTime)?.getTime() ?? 0 });
    }
    out.set(key, row);
  }
  for (const row of out.values()) row.missing.sort((a, b) => a.startMs - b.startMs);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "Mon 54 of 56 logged · 2 not logged · 1 late cancel" — one day's line. */
export function dayLine(d: DayFacts): string {
  if (d.booked === 0 && d.cancelled === 0) return "nothing booked";
  const bits = [d.done === null ? `${d.booked} booked` : d.toCome > 0 ? `${d.booked} booked, ${d.toCome} to come` : `${d.done} of ${d.booked} logged`];
  if (d.notLogged) bits.push(`${d.notLogged} not logged`);
  if (d.late) bits.push(`${d.late} late cancel${d.late === 1 ? "" : "s"}`);
  return bits.join(" · ");
}
