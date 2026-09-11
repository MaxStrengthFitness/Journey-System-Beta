/**
 * RENEWALS — attendance, from the two places the app records it.
 *
 *   schedules  Mindbody bookings, synced per studio. The pull-sync writes a
 *              booking as "Scheduled" or "Cancelled" and never marks it
 *              "Completed", so a past booking that was not cancelled (or
 *              marked a no-show) is read as a visit.
 *   sessions   Journey workouts recorded on the iPad. Always a visit.
 *
 * Both become AttendanceRow on the studio's calendar, which is all the engine
 * reads. A day with a booking AND a workout is still one visit day.
 */

import type { ScheduleEntry, WorkoutSession } from "../../types";
import { studioDateKey, toDate } from "../../lib/studio-time";
import { sessionDayKey, type HistorySession } from "../client-history/model";
import type { AttendanceRow, SessionFeelRow } from "./engine";

type ScheduleLike = Pick<ScheduleEntry, "startTime" | "status" | "trainerId">;

export function attendanceFromSchedules(
  rows: ScheduleLike[],
  now: Date,
  tz: string,
): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (const r of rows) {
    const start = toDate(r.startTime ?? null);
    if (!start) continue;
    const day = studioDateKey(start, tz);
    if (!day) continue;
    const kind: AttendanceRow["kind"] =
      r.status === "Cancelled"
        ? "cancelled"
        : r.status === "No-Show"
          ? "no-show"
          : start.getTime() <= now.getTime()
            ? "visit"
            : "booked";
    out.push({ day, kind, trainerId: r.trainerId ?? null });
  }
  return out;
}

export function attendanceFromSessions(
  sessions: Array<WorkoutSession | HistorySession>,
  tz: string,
  today: string,
): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (const s of sessions) {
    const day = sessionDayKey(s as HistorySession, tz);
    if (!day || day > today) continue;
    out.push({ day, kind: "visit", trainerId: s.trainerId ?? null });
  }
  return out;
}

export function feelFromSessions(
  sessions: Array<WorkoutSession | HistorySession>,
  tz: string,
): SessionFeelRow[] {
  const out: SessionFeelRow[] = [];
  for (const s of sessions) {
    const day = sessionDayKey(s as HistorySession, tz);
    if (!day) continue;
    const check = s.preSessionCheckIn;
    const clientFeel = typeof s.clientFeel === "string" ? s.clientFeel : null;
    const energyLevel = check?.energyLevel ?? null;
    const mood = check?.mood ?? null;
    if (clientFeel || energyLevel || mood) out.push({ day, clientFeel, energyLevel, mood });
  }
  return out;
}

/**
 * The first day a studio's bookings reached Journey — before it, attendance
 * is unknown rather than zero. The earliest booking on record for the studio,
 * as long as there is one.
 */
export function attendanceSinceOf(earliestBooking: unknown, tz: string): string | null {
  const d = toDate((earliestBooking ?? null) as any);
  return d ? studioDateKey(d, tz) : null;
}
