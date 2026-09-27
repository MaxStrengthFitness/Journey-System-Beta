/**
 * NEXT 7 DAYS: WHAT OPENED UP (Openings, docs/rounds/2026-09-27-openings.md,
 * "Next 7 days").
 *
 * Today and the six studio days after it, the standing week check's own
 * window, read live the way Team reads it (`useWeekSchedule` with
 * `{ confirmed: true }`: only an answer the server gave is an answer). One
 * line per day and half-hour still ahead, in time order, when any of these
 * is true:
 *
 *   1. A REGULAR WHO ISN'T BOOKED: the check's "open" and "moved" findings
 *      (standing-week/check.ts), the free slots Team showed until now.
 *   2. A CANCELLATION NOBODY BOOKED INTO: a stamped cancellation for that
 *      time, and nothing booked into the TIME since: a booking at that time,
 *      with the same trainer (or, for a booking Journey couldn't place,
 *      anyone), that first appeared around or after the cancellation.
 *      `isRealRebook` is borrowed only for that timing test (the booking
 *      first appeared no more than REBOOK_WINDOW_MS before the cancellation,
 *      or after it, and starts after it); here it is applied to a booking
 *      into the same time and place, never to the client's other bookings,
 *      so it is deliberately NOT Changes' "reschedule". Her own booking elsewhere that
 *      week doesn't take the time back: the time is still open, and "booked
 *      again from" says when she is next in. So the line never says "not
 *      rebooked", which on Changes means she didn't reschedule. Needs no
 *      agreed week, so it works from the first day.
 *   3. A USUALLY-FULL TIME WITH ROOM: the time reads Always or Usually full
 *      (or is marked Always full), and a trainer who usually takes clients
 *      then has nothing booked.
 *
 * Each line gives one reason, the first Journey can prove, in that order. A
 * regular's cancelled booking is both a check finding and a cancellation; it
 * is said once, as the finding: the two are matched by client, day, and time
 * within SLOT_TOLERANCE_MINUTES.
 *
 * ROOM AHEAD comes from the agreed weeks and the days away, so it is only
 * ever "usually takes clients then and has nothing booked" (room.ts). A
 * cancelled booking ahead, late or not, is room like any other.
 *
 * WHEN IT CAN'T TELL. Loading, failed, offline or answered only by this
 * iPad's cache: no lines, and the state says which. Mindbody not linked: no
 * lines. No agreed week yet: cancellations only (`agreedAny`).
 *
 * Client names are carried for the tap that reveals them (`clients`); a
 * line's own sentence never names one (present.ts).
 *
 * PURE MODULE.
 */
import type { ScheduleEntry } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { studioDateKey, toDate, wallClockToInstant, type DateLike } from "../../lib/studio-time";
import { isRealRebook } from "../admin/changes/changes";
import { CHECK_DAYS, SLOT_TOLERANCE_MINUTES, checkWeek, isFreeSlot, type SlotFinding, type WeekCheck } from "../standing-week/check";
import type { ServerRead } from "../standing-week/server-read";
import { minutesOf, type StandingWeekDoc } from "../standing-week/week";
import { weekdayOf } from "../studio-tasks/recurrence";
import { rowsCovered } from "./agreed";
import { addDays } from "./coverage";
import { countsAsFull, type OpeningsMark } from "./marks";
import { atRow, cancellationOf, freeAt, inAhead, wordAt, type PlacedBooking } from "./room";
import { bookingTime, isOpeningsWeekday, rowClock, rowOf, timeKey, type BookingTime, type TimeKey } from "./rows";
import type { UsualTime } from "./usual";
import { placeBooking, type Place, type TrainerRef } from "./whose";

export type NextDaysState = "ready" | "loading" | "failed" | "offline" | "unconnected";

export interface NextDaysInput {
  /** The studio's day, "YYYY-MM-DD". */
  today: string;
  now: Date;
  tz: string;
  days?: number;
  /** Whether the bookings were read (server-read.ts): only "ready" is an answer. */
  read: ServerRead;
  /** The studio's Mindbody is linked (or it is the Demo studio). */
  connected: boolean;
  /** The window's bookings, cancellations included. */
  bookings: readonly ScheduleEntry[];
  /** The studio's standing weeks. */
  docs: readonly StandingWeekDoc[];
  /** The trainers bookings are placed among. */
  trainers: readonly TrainerRef[];
  /** Mindbody staff ids at this studio's site, by trainers/{id} (`staffIdsAt`), for the check. */
  staffIds?: Readonly<Record<string, string>>;
  /** Whether a trainer still works at the studio (who-works-here); left out, everyone with an agreed week does. */
  worksHere?: (trainerId: string) => boolean;
  /** The usual week's words (usual.ts), and the marks. */
  usual?: ReadonlyMap<TimeKey, UsualTime> | null;
  marks?: ReadonlyMap<TimeKey, OpeningsMark> | null;
}

export type LineReason =
  | { kind: "regular-open"; finding: SlotFinding }
  | { kind: "regular-moved"; finding: SlotFinding }
  | { kind: "cancellation"; cancelledOn: string; clientId: string | null; clientName: string; trainerId: string | null }
  | { kind: "usually-full" };

/** Someone a line is about: shown only after a tap. */
export interface LineClient {
  clientId: string | null;
  clientName: string;
  trainerId: string | null;
  reason: "regular-open" | "regular-moved" | "cancellation";
}

export interface NextDaysLine {
  dateKey: string;
  row: number;
  key: TimeKey;
  /** Every reason Journey can prove, the one to say first. */
  reasons: LineReason[];
  usual: UsualTime | null;
  mark: OpeningsMark | null;
  /** Reads, or is marked, full. */
  usuallyFull: boolean;
  /** Everything booked at that half-hour now. */
  bookedNow: number;
  /**
   * Who usually takes clients then and has nothing booked: how many, and by
   * name when the rotation hasn't taken an unnamed place. Null when nobody's
   * agreed week has them in then, or a booking Journey can't place sits there.
   */
  room: { count: number; with: string[] } | null;
  /** The trainers the line concerns (trainers/{id}, sorted), for "With Sam". */
  trainerIds: string[];
  clients: LineClient[];
}

export interface NextDays {
  state: NextDaysState;
  /** At least one standing week is agreed; without one the list is cancellations only. */
  agreedAny: boolean;
  check: WeekCheck | null;
  lines: NextDaysLine[];
}

const REASON_ORDER: Record<LineReason["kind"], number> = { "regular-open": 0, "regular-moved": 0, cancellation: 1, "usually-full": 2 };

interface Row {
  entry: ScheduleEntry;
  time: BookingTime;
  place: Place;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const sameClient = (a: { clientId?: string | null; clientName?: string | null }, b: { clientId?: string | null; clientName?: string | null }) =>
  a.clientId && b.clientId ? a.clientId === b.clientId : norm(a.clientName) !== "" && norm(a.clientName) === norm(b.clientName);

/** The instant a half-hour of a studio day starts. */
export function rowStart(dateKey: string, row: number, tz: string): Date | null {
  return wallClockToInstant(`${dateKey}T${rowClock(row)}:00`, tz);
}

/** The window's bookings placed on their days: live ones, and the cancellations, apart. */
function placeWindow(input: Pick<NextDaysInput, "bookings" | "today" | "tz" | "trainers"> & { days: number }) {
  const last = addDays(input.today, input.days - 1);
  const live = new Map<string, Row[]>();
  const cancelled: Row[] = [];
  for (const entry of input.bookings) {
    if (isStaffBlock(entry)) continue;
    const time = bookingTime(entry, input.tz);
    if (!time || time.dateKey < input.today || time.dateKey > last || !isOpeningsWeekday(time.weekday)) continue;
    const row: Row = { entry, time, place: placeBooking(entry, input.trainers) };
    if (entry.status === "Cancelled") cancelled.push(row);
    else {
      if (!live.has(time.dateKey)) live.set(time.dateKey, []);
      live.get(time.dateKey)!.push(row);
    }
  }
  const placed = (day: string): PlacedBooking[] => (live.get(day) ?? []).map((r) => ({ rows: r.time.rows, place: r.place, cancellation: "none" }));
  return { live, cancelled, placed, last };
}

/** Was a cancelled booking's time taken again: a booking into it, with the same trainer, that came with or after the cancellation? */
function refilled(c: Row, cancelledAt: Date, live: readonly Row[]): boolean {
  return live.some((b) => {
    if (!b.time.rows.some((r) => c.time.rows.includes(r))) return false;
    const samePlace =
      c.place.kind === "unplaced" ||
      (c.place.kind === "rotation" && b.place.kind === "rotation") ||
      (c.place.kind === "trainer" && b.place.kind === "trainer" && b.place.trainerId === c.place.trainerId);
    return samePlace && isRealRebook({ createdAt: b.entry.createdAt, startTime: b.time.startAt }, cancelledAt);
  });
}

export function nextDays(input: NextDaysInput): NextDays {
  const days = input.days ?? CHECK_DAYS;
  const agreedAny = input.docs.some((d) => d.final && d.trainerId);
  if (!input.connected) return { state: "unconnected", agreedAny, check: null, lines: [] };
  if (input.read !== "ready") return { state: input.read, agreedAny, check: null, lines: [] };

  // Only the weeks of people who still work here are checked, as on Team: a
  // week left behind by someone who left would list their old regulars.
  const check = checkWeek({
    docs: input.worksHere ? input.docs.filter((d) => input.worksHere!(d.trainerId)) : [...input.docs],
    bookings: [...input.bookings],
    today: input.today,
    days,
    tz: input.tz,
    read: input.read,
    connected: input.connected,
    staffIds: input.staffIds,
  });
  const { live, cancelled, placed, last } = placeWindow({ ...input, days });
  const ahead = (at: Date | null) => !!at && at.getTime() > input.now.getTime();

  const lines = new Map<string, { dateKey: string; row: number; reasons: LineReason[]; trainerIds: Set<string>; clients: LineClient[] }>();
  const lineAt = (dateKey: string, row: number) => {
    const id = `${dateKey}|${row}`;
    if (!lines.has(id)) lines.set(id, { dateKey, row, reasons: [], trainerIds: new Set(), clients: [] });
    return lines.get(id)!;
  };

  // 1. A regular who isn't booked.
  const freeFindings = check.findings.filter(isFreeSlot);
  for (const f of freeFindings) {
    const minutes = minutesOf(f.start);
    if (minutes === null || !isOpeningsWeekday(weekdayOf(f.dateKey))) continue;
    if (!ahead(wallClockToInstant(`${f.dateKey}T${f.start}:00`, input.tz))) continue;
    const kind = f.kind === "open" ? "regular-open" : "regular-moved";
    const line = lineAt(f.dateKey, rowOf(minutes));
    line.reasons.push({ kind, finding: f });
    line.trainerIds.add(f.trainerId);
    line.clients.push({ clientId: f.clientId || null, clientName: f.clientName, trainerId: f.trainerId, reason: kind });
  }

  // 2. A cancellation nobody booked into.
  for (const c of cancelled) {
    const cancelledAt = toDate(c.entry.cancelledAt as DateLike);
    if (!cancelledAt || cancellationOf(c.entry) === "after-start" || !ahead(c.time.startAt)) continue;
    const saidAsFinding = freeFindings.some(
      (f) => f.dateKey === c.time.dateKey && sameClient(f, c.entry) && Math.abs((minutesOf(f.start) ?? -999) - c.time.startMinutes) <= SLOT_TOLERANCE_MINUTES,
    );
    if (saidAsFinding || refilled(c, cancelledAt, live.get(c.time.dateKey) ?? [])) continue;
    const trainerId = c.place.kind === "trainer" ? c.place.trainerId : null;
    const line = lineAt(c.time.dateKey, rowOf(c.time.startMinutes));
    line.reasons.push({ kind: "cancellation", cancelledOn: studioDateKey(cancelledAt, input.tz) ?? "", clientId: c.entry.clientId || null, clientName: c.entry.clientName || "", trainerId });
    if (trainerId) line.trainerIds.add(trainerId);
    line.clients.push({ clientId: c.entry.clientId || null, clientName: c.entry.clientName || "", trainerId, reason: "cancellation" });
  }

  // 3. A usually-full time with room.
  if (agreedAny && (input.usual || input.marks)) {
    for (let day = input.today; day <= last; day = addDays(day, 1)) {
      const weekday = weekdayOf(day);
      if (!isOpeningsWeekday(weekday)) continue;
      const rows = new Set<number>();
      for (const d of input.docs) if (d.final && d.trainerId) for (const r of rowsCovered(d.final.hours, weekday)) rows.add(r);
      for (const row of rows) {
        const key = timeKey(weekday, row);
        if (!countsAsFull(input.usual?.get(key)?.word, input.marks?.get(key))) continue;
        if (!ahead(rowStart(day, row, input.tz))) continue;
        const inIds = inAhead(input.docs, day, row, input.worksHere);
        const at = atRow(placed(day), row);
        const word = wordAt(at.unplaced === 0, inIds, at);
        if (word !== "room" && word !== "none") continue;
        const line = lineAt(day, row);
        line.reasons.push({ kind: "usually-full" });
        for (const id of freeAt(inIds, at).free) line.trainerIds.add(id);
      }
    }
  }

  const out: NextDaysLine[] = [...lines.values()].map((l) => {
    const weekday = weekdayOf(l.dateKey);
    const key = timeKey(weekday, l.row);
    const usual = input.usual?.get(key) ?? null;
    const mark = input.marks?.get(key) ?? null;
    const at = atRow(placed(l.dateKey), l.row);
    const inIds = inAhead(input.docs, l.dateKey, l.row, input.worksHere);
    const free = freeAt(inIds, at);
    const room = inIds.length > 0 && at.unplaced === 0 ? { count: free.room, with: free.namesKnown ? free.free : [] } : null;
    return {
      dateKey: l.dateKey,
      row: l.row,
      key,
      reasons: [...l.reasons].sort((a, b) => REASON_ORDER[a.kind] - REASON_ORDER[b.kind]),
      usual,
      mark,
      usuallyFull: countsAsFull(usual?.word, mark),
      bookedNow: at.booked,
      room,
      trainerIds: [...l.trainerIds].sort(),
      clients: l.clients,
    };
  });
  out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.row - b.row);
  return { state: "ready", agreedAny, check, lines: out };
}

/** The lines that concern a trainer ("With Sam"), or every line ("Anyone"). */
export function linesFor(lines: readonly NextDaysLine[], trainerId: string | null): NextDaysLine[] {
  if (!trainerId) return [...lines];
  return lines.filter((l) => l.trainerIds.includes(trainerId) || l.room?.with.includes(trainerId));
}

/** A time with room in the next 7 days, for the Wrap-up's "Times with room" (no names, no reasons). */
export interface RoomTime {
  dateKey: string;
  row: number;
  /** Room that exists because a regular is out or a booking was cancelled this week. */
  thisWeekOnly: boolean;
}

/**
 * Every half-hour ahead with room: with the trainer given (who must be free,
 * with no rotation booking there to take their place unseen), or with anyone
 * who usually takes clients then. Empty unless the read is an answer.
 */
export function timesWithRoom(input: NextDaysInput, forTrainer: string | null, lines?: readonly NextDaysLine[]): RoomTime[] {
  if (!input.connected || input.read !== "ready") return [];
  const days = input.days ?? CHECK_DAYS;
  const { placed, last } = placeWindow({ ...input, days });
  const onlyThisWeek = new Set(
    (lines ?? [])
      .filter((l) => l.reasons.some((r) => r.kind !== "usually-full" && (!forTrainer || ("finding" in r ? r.finding.trainerId === forTrainer : r.trainerId === forTrainer))))
      .map((l) => `${l.dateKey}|${l.row}`),
  );
  const out: RoomTime[] = [];
  for (let day = input.today; day <= last; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    if (!isOpeningsWeekday(weekday)) continue;
    const rows = new Set<number>();
    for (const d of input.docs) if (d.final && d.trainerId && (!forTrainer || d.trainerId === forTrainer)) for (const r of rowsCovered(d.final.hours, weekday)) rows.add(r);
    for (const row of [...rows].sort((a, b) => a - b)) {
      if (!(rowStart(day, row, input.tz)!.getTime() > input.now.getTime())) continue;
      const inIds = inAhead(input.docs, day, row, input.worksHere);
      const at = atRow(placed(day), row);
      if (at.unplaced > 0) continue;
      const free = freeAt(inIds, at);
      const hasRoom = forTrainer ? free.free.includes(forTrainer) && at.rotation === 0 : free.room > 0;
      if (hasRoom) out.push({ dateKey: day, row, thisWeekOnly: onlyThisWeek.has(`${day}|${row}`) });
    }
  }
  return out;
}
