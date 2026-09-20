/**
 * THE DEMO WEEK — the bookings that make the Hub worth opening.
 *
 * Round: the demo week, Sep 20 2026. AJ's brief: *"we need a mock hub schedule
 * that has its clients scheduled for that week's sessions … it doesn't have to
 * be real, it just has to be interactable for demo mode so trainers can feel
 * what it would be like to open a client from the hub. We can just have the
 * demo mode replaying the same schedule every week."*
 *
 * Everything else in Demo Mode is HISTORY — sessions that already happened.
 * The Hub is the one screen that reads the FUTURE, out of `schedules`, and
 * until this round the demo studio had nothing there at all: six clients, a
 * full floor, a year of workouts, and an empty grid on the screen a trainer
 * actually opens first. This file is the missing half.
 *
 * ── One week, on repeat ──────────────────────────────────────────────────
 *
 * `DEMO_WEEK` is the pattern: eleven standing appointments, each one a
 * weekday, a wall-clock time, a client and the trainer who takes them. It is
 * laid down again for each of `DEMO_SCHEDULE_WEEKS` weeks from the day the
 * seeder runs, so every day the Hub's carousel can reach has something on it
 * and the same week repeats behind it.
 *
 * ── Why the ids count occurrences rather than naming days ────────────────
 *
 * The seeder has no wipe on purpose (see `seed-write.ts`), so every id it
 * writes has to be an id it will write again next time — otherwise a reset in
 * October leaves September's bookings behind with nobody to delete them, and
 * the demo studio slowly fills with ghosts.
 *
 * A date-based id (`demo-booking-eowyn-2026-09-21`) is exactly that mistake.
 * So a booking is identified by WHICH of that client's upcoming appointments
 * it is — `demo-booking-eowyn-003` — and the run always contains the same
 * number of them, because any 56-day window holds exactly eight of every
 * weekday whatever day it starts on. Every reset rewrites the same ids with
 * new dates, and nothing is ever orphaned.
 *
 * ── The shape of the week ────────────────────────────────────────────────
 *
 * Clients train twice a week (`docs/business/the-floor.md`), so each standing
 * pair is three or four days apart — Mon/Thu, Tue/Fri, Wed/Sat — the way a
 * real package is booked. Mornings carry the retired clients and the evening
 * carries the two who work, which is what a Max Strength floor looks like.
 *
 * EVERY DAY OF THE WEEK CARRIES AT LEAST ONE, Sunday included, and that is
 * the one place the pattern is arranged for the demo rather than for realism.
 * The Hub opens on today. A trainer who opens Demo Mode on a Sunday to an
 * empty grid does not conclude that the studio is closed; they conclude the
 * demo is broken, and that is the exact impression this round exists to
 * prevent.
 *
 * Merry is the exception, and deliberately: he has been away forty-three days
 * (that is what he is in the roster to teach), so he does not have a standing
 * pair. He has ONE appointment, a Sunday make-up with the studio leader — the
 * attendance anomaly and the booking that answers it, on the same screen.
 */

import { addDays, weekdayOf, type DayKey } from "../client-history/model";
import { wallClockToInstant } from "../../lib/studio-time";
import { DEMO_STUDIO_TIMEZONE } from "./constants";
import { DEMO_CLIENTS, DEMO_TRAINERS } from "./roster";

/**
 * How many weeks of the pattern are laid down, counting from the day the
 * seeder runs.
 *
 * Eight is a deliberate middle. One week is what AJ asked for and would leave
 * the Hub empty the following Monday; a year would be ~570 documents of
 * identical appointments for a screen that never reads more than seven days
 * at a time. Eight weeks is eighty-eight documents — seven per cent on top of
 * the seed — and two months before anyone has to press Reset again, which the
 * card on the studio selection screen now says out loud.
 */
export const DEMO_SCHEDULE_WEEKS = 8;

/** 56 days. Any 56-day window holds exactly eight of every weekday. */
export const DEMO_SCHEDULE_DAYS = DEMO_SCHEDULE_WEEKS * 7;

/**
 * A booking is thirty minutes on the grid, matching the demo studio's
 * `sessionMinutes`. The work inside it is twenty; the rest is the set-up and
 * the wrap-up, and the Hub draws the slot, not the stopwatch.
 */
export const DEMO_BOOKING_MINUTES = 30;

/**
 * Mindbody's word for an ordinary session. `isDefaultService` in
 * `lib/hub-markers.ts` recognises this exact string and draws NO chip on the
 * block — which is right, because a service name only earns a chip when it
 * says something the trainer did not already know.
 */
export const DEMO_SERVICE_NAME = "Training Session";

export interface DemoWeekSlot {
  /** 0 = Sunday … 6 = Saturday, as `weekdayOf` reports it. */
  weekday: number;
  /** The studio's own wall clock, `HH:MM`. Converted with the studio's zone. */
  time: string;
  clientKey: string;
  trainerKey: string;
}

/**
 * The standing week. Order matters only in that it fixes which booking gets
 * which occurrence number, so leave existing rows where they are.
 */
export const DEMO_WEEK: DemoWeekSlot[] = [
  /* Sunday — Merry's one session, a make-up with the studio leader. */
  { weekday: 0, time: "09:00", clientKey: "merry", trainerKey: "aragorn" },

  /* Monday morning belongs to the retired clients, two columns deep. */
  { weekday: 1, time: "09:00", clientKey: "eowyn", trainerKey: "aragorn" },
  { weekday: 1, time: "09:30", clientKey: "rosie", trainerKey: "pippin" },

  /* Tuesday — Sam before work, Arwen mid-morning. */
  { weekday: 2, time: "07:00", clientKey: "sam", trainerKey: "gimli" },
  { weekday: 2, time: "10:00", clientKey: "arwen", trainerKey: "aragorn" },

  /* Wednesday */
  { weekday: 3, time: "17:30", clientKey: "frodo", trainerKey: "pippin" },

  /* Thursday — Monday again, which is what a standing pair looks like. */
  { weekday: 4, time: "09:00", clientKey: "eowyn", trainerKey: "aragorn" },
  { weekday: 4, time: "09:30", clientKey: "rosie", trainerKey: "pippin" },

  /* Friday — and Tuesday again. */
  { weekday: 5, time: "07:00", clientKey: "sam", trainerKey: "gimli" },
  { weekday: 5, time: "10:00", clientKey: "arwen", trainerKey: "aragorn" },

  /* Saturday */
  { weekday: 6, time: "08:00", clientKey: "frodo", trainerKey: "pippin" },
];

/**
 * One appointment, placed on a real day. `seed-core.ts` turns these into
 * `schedules` documents; everything about WHEN is decided here.
 */
export interface DemoBooking {
  /** The Firestore document id — derived, and the same on every run. */
  id: string;
  /** The studio's day, `YYYY-MM-DD`. */
  day: DayKey;
  startIso: string;
  endIso: string;
  clientKey: string;
  trainerKey: string;
  /**
   * The one cancellation in the run. A demo studio where nothing ever changes
   * leaves Operations → Overview → Changes permanently empty, which is the
   * screen a studio leader opens on a Monday to find exactly this.
   */
  cancelled: boolean;
}

/**
 * Which of the run's appointments is cancelled: the LAST one on the first day
 * from `today + 2` that has any.
 *
 * Two days out rather than tomorrow so it is a change somebody has time to do
 * something about, and never today, where the Hub would be showing a hole in
 * a grid a trainer is standing in front of. The client it lands on has another
 * booking that week, so `changesForDay` reads it as a RESCHEDULE and the row
 * says where it moved to — which is the more interesting of the two readings
 * and the one that needs a second booking to demonstrate at all.
 */
const CANCEL_FROM_DAY = 2;
const CANCEL_SEARCH_DAYS = 6;

const pad3 = (n: number) => String(n).padStart(3, "0");

/** `demo-booking-eowyn-003` — this client's third appointment in the run. */
export const demoBookingId = (clientKey: string, occurrence: number) =>
  `demo-booking-${clientKey}-${pad3(occurrence)}`;

/**
 * An instant from the studio's wall clock, through the studio's own zone.
 *
 * The session HISTORY sidesteps timezones by only ever using UTC hours 13–21,
 * which are the same Eastern calendar day all year. Bookings cannot: a 7 AM
 * appointment has to read as 7 AM in January and in July, and an hour of
 * seasonal drift on a standing appointment is the kind of small wrongness a
 * trainer notices immediately. `wallClockToInstant` resolves the offset for
 * that actual date, so the demo reads the same in both halves of the year.
 */
function instantAt(day: DayKey, time: string): Date {
  const at = wallClockToInstant(`${day}T${time}:00`, DEMO_STUDIO_TIMEZONE);
  /* Unreachable: `day` is built by addDays and `time` is a literal in the
     table above. Thrown rather than defaulted, because a booking silently
     placed at the epoch would be a very confusing thing to debug. */
  if (!at) throw new Error(`Demo week: could not place ${day} ${time}`);
  return at;
}

/**
 * Every booking the demo studio holds, from `today` forward.
 *
 * Nothing is laid down in the past. The history already covers where these
 * clients have been, and a past booking with no session behind it counts as a
 * visit in `renewals/attendance.ts` — so a seeder that filled last week would
 * be quietly telling the renewals engine that Rosie came in when she did not.
 */
export function buildDemoWeek(today: DayKey): DemoBooking[] {
  const byWeekday = new Map<number, DemoWeekSlot[]>();
  for (const slot of DEMO_WEEK) {
    const list = byWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    byWeekday.set(slot.weekday, list);
  }

  const occurrences = new Map<string, number>();
  const bookings: DemoBooking[] = [];

  for (let offset = 0; offset < DEMO_SCHEDULE_DAYS; offset += 1) {
    const day = addDays(today, offset);
    for (const slot of byWeekday.get(weekdayOf(day)) ?? []) {
      const nth = (occurrences.get(slot.clientKey) ?? 0) + 1;
      occurrences.set(slot.clientKey, nth);
      const start = instantAt(day, slot.time);
      bookings.push({
        id: demoBookingId(slot.clientKey, nth),
        day,
        startIso: start.toISOString(),
        endIso: new Date(
          start.getTime() + DEMO_BOOKING_MINUTES * 60_000,
        ).toISOString(),
        clientKey: slot.clientKey,
        trainerKey: slot.trainerKey,
        cancelled: false,
      });
    }
  }

  markTheCancellation(bookings, today);
  return bookings;
}

function markTheCancellation(bookings: DemoBooking[], today: DayKey): void {
  for (let ahead = CANCEL_FROM_DAY; ahead < CANCEL_FROM_DAY + CANCEL_SEARCH_DAYS; ahead += 1) {
    const day = addDays(today, ahead);
    const onThatDay = bookings.filter((b) => b.day === day);
    if (onThatDay.length === 0) continue;
    onThatDay[onThatDay.length - 1].cancelled = true;
    return;
  }
}

/* ── Lookups, so the seeder never has to hold a second copy ─────────────── */

const CLIENT_BY_KEY = new Map(DEMO_CLIENTS.map((c) => [c.key, c]));
const TRAINER_BY_KEY = new Map(DEMO_TRAINERS.map((t) => [t.key, t]));

export const demoWeekClient = (key: string) => CLIENT_BY_KEY.get(key);
export const demoWeekTrainer = (key: string) => TRAINER_BY_KEY.get(key);

/** The last day the run covers — what the Set up card tells the person. */
export function demoScheduleRunsThrough(today: DayKey): DayKey {
  return addDays(today, DEMO_SCHEDULE_DAYS - 1);
}
