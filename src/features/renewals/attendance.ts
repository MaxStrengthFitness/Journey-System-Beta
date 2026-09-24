/**
 * RENEWALS — attendance, from the two places the app records it.
 *
 *   schedules  Mindbody bookings, synced per studio. The pull-sync writes a
 *              booking as "Scheduled" or "Cancelled" and never marks it
 *              "Completed", so what happened to one is read through
 *              `lib/booking-state` (AJ, Sep 24 2026): a booking is a visit
 *              when a Journey session was completed for the client that
 *              studio day. A past booking with nothing logged is still read
 *              as a visit BEFORE its studio's `journeyCutoverDate`, or when
 *              none is set — FileMaker holds that record and Journey cannot
 *              see it, so reading it as absence would collapse every
 *              migration client's pace. From the cutover on, Journey IS the
 *              record, and a booking nobody logged is neither a visit nor a
 *              miss: it is on the Overview's chase list, and a session logged
 *              later makes it a visit the next night. (Calling it a no-show
 *              would put a trainer's forgotten log in the watch's
 *              "cancellations or no-shows" sentence.)
 *   sessions   Journey workouts recorded on the iPad. Always a visit.
 *
 * Both become AttendanceRow on the studio's calendar, which is all the engine
 * reads. A day with a booking AND a workout is still one visit day.
 */

import { doseOf, readinessDial } from "../rating/session-reads";
import type { ScheduleEntry, WorkoutSession } from "../../types";
import { studioDateKey, toDate } from "../../lib/studio-time";
import { bookingState, type LoggedSessions } from "../../lib/booking-state";
import { sessionDayKey, type HistorySession } from "../client-history/model";
import type { AttendanceRow, SessionFeelRow } from "./engine";

type ScheduleLike = Pick<ScheduleEntry, "startTime" | "status" | "trainerId"> &
  Partial<Pick<ScheduleEntry, "endTime" | "clientId" | "studioId">>;

/** What Journey holds for this client, to read their bookings against. */
export interface JourneyRecord {
  /** `loggedSessions(...)` over the client's own sessions; null when they could not be read. */
  logged: LoggedSessions | null;
  /** A studio's `journeyCutoverDate` (yyyy-mm-dd), or null when unset or unknown. */
  cutoverOf: (studioId: string | null | undefined) => string | null;
}

export function attendanceFromSchedules(
  rows: ScheduleLike[],
  now: Date,
  tz: string,
  journey?: JourneyRecord,
): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (const r of rows) {
    const start = toDate(r.startTime ?? null);
    if (!start) continue;
    const day = studioDateKey(start, tz);
    if (!day) continue;
    let kind: AttendanceRow["kind"];
    switch (bookingState(r, journey?.logged ?? null, now, tz)) {
      case "cancelled":
        kind = "cancelled";
        break;
      case "no-show":
        kind = "no-show";
        break;
      case "upcoming":
        kind = "booked";
        break;
      case "never-logged": {
        const cutover = journey?.cutoverOf(r.studioId) ?? null;
        // On Journey, with nothing logged: not a visit, not a miss.
        if (cutover && day >= cutover) continue;
        kind = "visit";
        break;
      }
      default:
        // Completed, in its slot, or unknown: a started booking is a visit, as it always was.
        kind = "visit";
    }
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
    // Reporting round (Sep 2026): the Dial is what new sessions carry. The
    // legacy words are read alongside so August and October sit on one axis.
    const dose = doseOf(s as WorkoutSession);
    const energy = readinessDial(check, "energy");
    if (clientFeel || energyLevel || mood || dose !== null || energy !== null) {
      out.push({ day, clientFeel, energyLevel, mood, dose, energy });
    }
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
