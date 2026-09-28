/**
 * CHANGES — cancellations and moves, day by day. The pure half.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): Mindbody is not believed to
 * send a cancellation status, but every appointment pulls into the schedule,
 * so the app detects a removal itself. The sync (`lib/mindbody-api-sync.ts`,
 * `changeStamps`) now writes WHEN a booking went and where a moved booking
 * came from. This module turns those rows into the day's list.
 *
 * THE RULES, in AJ's words:
 *
 *   Day-bucketing — a cancellation is held against THE DAY THE SESSION WAS
 *   FOR, not the day it was cancelled. A Wednesday cancellation of Friday's
 *   session waits in Friday's list, and Friday's list fills up across the
 *   week. A moved booking belongs to the day it LEFT.
 *
 *   Cancellation vs reschedule — inferred, not reported: if the client has
 *   another session scheduled within the same week (Monday to Sunday of the
 *   day the session was for), it is a reschedule, and the list says where it
 *   moved to; if not, it is a cancellation. "This works because clients
 *   always do one or two sessions per week."
 *
 *   Only a REAL rebook (AJ, Sep 26 2026: "100% run it"). For a client who
 *   trains twice a week the other booking that week is nearly always her
 *   standing one, booked all along, and the list read nearly every
 *   cancellation as a reschedule. Now the other booking counts only when it
 *   appeared with the cancellation — its `createdAt` at most
 *   `REBOOK_WINDOW_MS` before the cancellation was stamped (the front desk
 *   often books the new slot first) — and had not already happened
 *   (`isRealRebook`). Otherwise it is a cancellation, and the proof names the
 *   booking she already held (`alsoBooked`). A cancellation with no stamp
 *   cannot be matched to a rebook, so it reads as a cancellation.
 *
 *   The calendar shows none of this. A cancelled row is removed from the
 *   calendar entirely (greying it out clutters the calendar); the list is
 *   where it is recorded.
 *
 * A MINDBODY "UNAVAILABLE" BLOCK (a row whose client name says
 * "Unavailable") is a trainer's time blocked off, not a booking
 * (lib/booking-state.ts, isStaffBlock; the Openings round, Sep 27 2026): it
 * never shows in the list, and never reads as a client's other booking.
 *
 * WHAT IT REFUSES TO SAY. A cancelled row with no `cancelledAt` (written
 * before the round) is still a cancellation for its day —
 * the list just cannot say when it was noticed. A row moved twice keeps only
 * its latest origin, so the middle day's list forgets it; that is the price
 * of stamps on the booking rather than a log, and it is rare enough.
 */
import type { ScheduleEntry } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { formatStudioDate, formatStudioTime, studioDateKey, toDate } from "../../../lib/studio-time";
import { addDays, weekdayOf } from "../../client-history/model";

export type ChangeKind = "cancelled" | "moved";
export type ChangeReading = "reschedule" | "cancellation";

export interface ChangeDestination {
  start: Date;
  trainerName: string;
  /** True when Mindbody moved the same booking; false when the client simply holds another booking that week. */
  sameBooking: boolean;
}

export interface ChangeRow {
  /** The schedule document id. */
  id: string;
  kind: ChangeKind;
  clientId: string | null;
  clientName: string;
  trainerId: string | null;
  trainerName: string;
  /** The studio day the session was for — the bucket. */
  forDay: string;
  /** The start the session had before the change. */
  originalStart: Date;
  reading: ChangeReading;
  movedTo: ChangeDestination | null;
  /**
   * A cancellation that is NOT a reschedule, while she still holds another
   * booking that week: that booking (her standing one), for the proof. Null
   * otherwise.
   */
  alsoBooked: ChangeDestination | null;
  /** When the change was noticed; null when the row carries no stamp. */
  detectedAt: Date | null;
  source: "mindbody" | "sweep" | "unknown";
}

/** Monday of the week the day is in (weeks run Monday to Sunday, as Hours counts them). */
export function weekStartOf(day: string): string {
  // weekdayOf: 0 = Sunday … 6 = Saturday.
  const weekday = weekdayOf(day);
  return addDays(day, -((weekday + 6) % 7));
}

export function weekEndOf(day: string): string {
  return addDays(weekStartOf(day), 6);
}

const isLive = (e: ScheduleEntry) => e.status === "Scheduled" || e.status === "Completed";

/**
 * How long before the cancellation another booking may have first appeared
 * and still be its rebook. The front desk often books the new slot first and
 * cancels the old one after, and the thirty-minute pull can see the two on
 * different runs; a booking Journey saw days before is her standing one.
 */
export const REBOOK_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * A REAL rebook of a cancellation stamped at `cancelledAt` (AJ, Sep 26 2026):
 * the other booking first appeared around or after it (`createdAt`, when
 * Journey first wrote the row, at most REBOOK_WINDOW_MS before) and had not
 * already started by then — nobody rebooks into the past. With no stamp, or
 * no `createdAt`, nothing is claimed.
 */
export function isRealRebook(
  other: Pick<ScheduleEntry, "createdAt" | "startTime"> | undefined,
  cancelledAt: Date | null,
): boolean {
  if (!other || !cancelledAt) return false;
  const created = toDate(other.createdAt ?? null);
  const start = toDate(other.startTime);
  if (!created || !start) return false;
  return created.getTime() >= cancelledAt.getTime() - REBOOK_WINDOW_MS && start.getTime() > cancelledAt.getTime();
}

const destinationOf = (e: ScheduleEntry): ChangeDestination => ({
  start: toDate(e.startTime) as Date,
  trainerName: e.trainerName || "",
  sameBooking: false,
});

/** The client a row is about — by id when the sync linked one, else by name. */
const clientKey = (e: ScheduleEntry) => (e.clientId ? `id:${e.clientId}` : `name:${(e.clientName ?? "").trim().toLowerCase()}`);

/**
 * The changes for one studio day. `entries` is everything the studio holds
 * for the week around the day — cancelled rows included, and any row whose
 * `movedFromDay` falls in the week — so the same-week inference has what it
 * needs. Rows come back soonest-original-start first.
 */
export function changesForDay(all: ScheduleEntry[], day: string, tz?: string): ChangeRow[] {
  const weekStart = weekStartOf(day);
  const weekEnd = weekEndOf(day);
  const dayOf = (v: unknown) => studioDateKey(v as Parameters<typeof studioDateKey>[0], tz);
  // A Mindbody "Unavailable" block is a trainer's time blocked off, not a
  // booking: it is never a change, and never a client's other booking.
  const entries = all.filter((e) => !isStaffBlock(e));

  // Every live booking in the week, by client, for the inference.
  const liveByClient = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    if (!isLive(e)) continue;
    const d = dayOf(e.startTime);
    if (!d || d < weekStart || d > weekEnd) continue;
    const key = clientKey(e);
    const list = liveByClient.get(key) ?? [];
    list.push(e);
    liveByClient.set(key, list);
  }

  const rows: ChangeRow[] = [];

  for (const e of entries) {
    const id = e.id ?? e.mindbodyAppointmentId ?? "";
    // 1. Cancelled, and the session was for this day.
    if (e.status === "Cancelled") {
      const start = toDate(e.startTime);
      if (!start || dayOf(start) !== day) continue;
      const others = (liveByClient.get(clientKey(e)) ?? []).filter((o) => (o.id ?? o.mindbodyAppointmentId) !== id);
      const detectedAt = toDate(e.cancelledAt);
      // A reschedule only when she rebooked: see isRealRebook.
      const next = nearestAfter(
        others.filter((o) => isRealRebook(o, detectedAt)),
        start,
      );
      const held = next ? null : nearestAfter(others, start);
      rows.push({
        id,
        kind: "cancelled",
        clientId: e.clientId ?? null,
        clientName: e.clientName || "A client",
        trainerId: e.trainerId ?? null,
        trainerName: e.trainerName || "",
        forDay: day,
        originalStart: start,
        reading: next ? "reschedule" : "cancellation",
        movedTo: next ? destinationOf(next) : null,
        alsoBooked: held ? destinationOf(held) : null,
        detectedAt,
        source: e.cancelSource === "mindbody" || e.cancelSource === "sweep" ? e.cancelSource : "unknown",
      });
      continue;
    }
    // 2. Moved away from this day (the booking itself now sits elsewhere).
    if (e.movedFromDay === day) {
      const from = toDate(e.movedFromStart);
      const to = toDate(e.startTime);
      if (!from || !to) continue;
      rows.push({
        id,
        kind: "moved",
        clientId: e.clientId ?? null,
        clientName: e.clientName || "A client",
        trainerId: e.trainerId ?? null,
        trainerName: e.trainerName || "",
        forDay: day,
        originalStart: from,
        reading: "reschedule",
        movedTo: { start: to, trainerName: e.trainerName || "", sameBooking: true },
        alsoBooked: null,
        detectedAt: toDate(e.movedAt),
        source: "mindbody",
      });
    }
  }

  rows.sort((a, b) => a.originalStart.getTime() - b.originalStart.getTime() || a.clientName.localeCompare(b.clientName));
  return rows;
}

/** The booking after `start` if there is one, else the nearest before it. */
function nearestAfter(candidates: ScheduleEntry[], start: Date): ScheduleEntry | null {
  let best: ScheduleEntry | null = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const t = toDate(c.startTime)?.getTime();
    if (t === undefined) continue;
    const delta = t - start.getTime();
    // Prefer a later booking; a booking earlier in the week ranks behind any later one.
    const score = delta >= 0 ? delta : 1e13 - delta;
    if (score < bestDelta) {
      bestDelta = score;
      best = c;
    }
  }
  return best;
}

/** How many changes each day carries, for a strip of days. */
export function changeCounts(entries: ScheduleEntry[], days: string[], tz?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of days) out[day] = changesForDay(entries, day, tz).length;
  return out;
}

/* ------------------------------------------------------------------ *
 * The sentences
 * ------------------------------------------------------------------ */

export interface ChangeText {
  /** "Cancelled — 9:00 AM with Tom." / "Moved — was 9:00 AM with Tom, now Thu 2:00 PM with Sara." */
  sentence: string;
  /** "Nothing else booked this week." / "Already booked Thu 3:00 PM this week, so not a rebook." / "Gone from Mindbody at 7:12 AM." */
  proof: string;
}

const withTrainer = (name: string) => (name ? ` with ${name}` : "");

export function describeChange(row: ChangeRow, tz?: string): ChangeText {
  const at = formatStudioTime(row.originalStart, tz);
  const noticed = row.detectedAt
    ? row.source === "sweep"
      ? `Gone from Mindbody by ${formatStudioTime(row.detectedAt, tz)}${sameDay(row.detectedAt, row.originalStart, tz) ? "" : ` on ${formatStudioDate(row.detectedAt, { weekday: "short", month: "short", day: "numeric" }, tz)}`}.`
      : `Mindbody reported it at ${formatStudioTime(row.detectedAt, tz)}${sameDay(row.detectedAt, row.originalStart, tz) ? "" : ` on ${formatStudioDate(row.detectedAt, { weekday: "short", month: "short", day: "numeric" }, tz)}`}.`
    : "When it changed was not recorded.";

  if (row.kind === "moved" && row.movedTo) {
    return {
      sentence: `Moved — was ${at}${withTrainer(row.trainerName)}, now ${whenLabel(row.movedTo.start, row.originalStart, tz)}${withTrainer(row.movedTo.trainerName)}.`,
      proof: noticed,
    };
  }
  if (row.reading === "reschedule" && row.movedTo) {
    return {
      sentence: `Cancelled ${at}${withTrainer(row.trainerName)} — but booked ${whenLabel(row.movedTo.start, row.originalStart, tz)}${withTrainer(row.movedTo.trainerName)}, so read it as a reschedule.`,
      proof: noticed,
    };
  }
  // Her standing booking is named, so "cancelled" is not read as "gone for
  // the week" when she is still coming on Thursday.
  const week = row.alsoBooked
    ? `Already booked ${whenLabel(row.alsoBooked.start, row.originalStart, tz)} this week, so not a rebook.`
    : "Nothing else booked this week.";
  return {
    sentence: `Cancelled — ${at}${withTrainer(row.trainerName)}.`,
    proof: `${week} ${noticed}`,
  };
}

function sameDay(a: Date, b: Date, tz?: string): boolean {
  return studioDateKey(a, tz) === studioDateKey(b, tz);
}

/** "2:00 PM" on the same day, else "Thu 2:00 PM". */
function whenLabel(when: Date, relativeTo: Date, tz?: string): string {
  const time = formatStudioTime(when, tz);
  return sameDay(when, relativeTo, tz) ? time : `${formatStudioDate(when, { weekday: "short" }, tz)} ${time}`;
}
