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
 *   The calendar shows none of this. A cancelled row is removed from the
 *   calendar entirely (greying it out clutters the calendar); the list is
 *   where it is recorded.
 *
 * WHAT IT REFUSES TO SAY. A cancelled row with no `cancelledAt` (written by
 * the webhook, or before the round) is still a cancellation for its day —
 * the list just cannot say when it was noticed. A row moved twice keeps only
 * its latest origin, so the middle day's list forgets it; that is the price
 * of stamps on the booking rather than a log, and it is rare enough.
 */
import type { ScheduleEntry } from "../../../types";
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

/** The client a row is about — by id when the sync linked one, else by name. */
const clientKey = (e: ScheduleEntry) => (e.clientId ? `id:${e.clientId}` : `name:${(e.clientName ?? "").trim().toLowerCase()}`);

/**
 * The changes for one studio day. `entries` is everything the studio holds
 * for the week around the day — cancelled rows included, and any row whose
 * `movedFromDay` falls in the week — so the same-week inference has what it
 * needs. Rows come back soonest-original-start first.
 */
export function changesForDay(entries: ScheduleEntry[], day: string, tz?: string): ChangeRow[] {
  const weekStart = weekStartOf(day);
  const weekEnd = weekEndOf(day);
  const dayOf = (v: unknown) => studioDateKey(v as Parameters<typeof studioDateKey>[0], tz);

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
      const next = nearestAfter(others, start);
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
        movedTo: next ? { start: toDate(next.startTime) as Date, trainerName: next.trainerName || "", sameBooking: false } : null,
        detectedAt: toDate(e.cancelledAt),
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
  /** "Nothing else booked this week." / "Gone from Mindbody at 7:12 AM." */
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
  return {
    sentence: `Cancelled — ${at}${withTrainer(row.trainerName)}.`,
    proof: `Nothing else booked this week. ${noticed}`,
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
