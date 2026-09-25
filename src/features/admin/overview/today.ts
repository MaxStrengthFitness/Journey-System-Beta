/**
 * TODAY — the numbers the Overview leads with. Pure.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): lead with how many sessions
 * the studio is booked for today, percent completed so far, percent
 * skipped / cancelled / no-showed / otherwise not completed — and how many
 * were never logged into the system, "the actionable number, the one
 * someone has to chase".
 *
 * Built on `floor.ts` (summariseFloor, attentionItems), which already knew
 * the day's shape; this file only decides what the strip says and lists
 * the sessions to chase. A "never logged" session is a booking whose slot
 * finished (five minutes of slack) with nothing to say it happened. It is
 * the number that quietly rots a retention report.
 *
 * DONE MEANS LOGGED IN JOURNEY (AJ, Sep 24 2026). Mindbody bookings never
 * come back "Completed" — the sync writes Scheduled or Cancelled and nothing
 * else — so a booking is done when a Journey session was completed for that
 * client on that studio day (`lib/booking-state`). The caller reads the
 * day's sessions once, for the studio, and passes `loggedSessions(...)`; a
 * read that failed passes null, and every finished slot is then UNKNOWN —
 * counted in `unknown`, never in never logged.
 */
import type { ScheduleEntry } from "../../../types";
import { formatStudioTime } from "../../../lib/studio-time";
import type { LoggedSessions } from "../../../lib/booking-state";
import { attentionItems, summariseFloor, type FloorSummary } from "./floor";

export interface TodayNumbers {
  /** Live bookings — the day's appointments less the cancelled ones. */
  booked: number;
  cancelled: number;
  done: number;
  /** done / booked, or null before anything is booked. */
  donePct: number | null;
  /** cancelled + no-shows + never logged, against everything the day had booked (cancellations included). */
  notCompleted: number;
  notCompletedPct: number | null;
  noShow: number;
  neverLogged: number;
  /** Finished slots whose logging could not be read: Done, Not completed and Never logged are then missing, not zero. */
  unknown: number;
  onTheFloor: number;
  stillToCome: number;
  clients: number;
}

export function todayNumbers(dayEntries: ScheduleEntry[], now: Date, logged: LoggedSessions | null, tz?: string): TodayNumbers {
  const f: FloorSummary = summariseFloor(dayEntries, now, logged, tz);
  const booked = f.booked - f.cancelled;
  const notCompleted = f.cancelled + f.noShow + f.unresolved;
  return {
    booked,
    cancelled: f.cancelled,
    done: f.completed,
    donePct: booked > 0 ? f.completed / booked : null,
    notCompleted,
    notCompletedPct: f.booked > 0 ? notCompleted / f.booked : null,
    noShow: f.noShow,
    neverLogged: f.unresolved,
    unknown: f.unknown,
    onTheFloor: f.inProgress,
    stillToCome: f.upcoming,
    clients: f.clients,
  };
}

export interface ChaseRow {
  id: string;
  clientId: string | null;
  clientName: string;
  trainerName: string;
  /** "9:00 AM" */
  at: string;
  atMs: number;
}

/** The sessions nobody logged, earliest first — the list a leader takes to the floor. */
export function chaseList(dayEntries: ScheduleEntry[], now: Date, logged: LoggedSessions | null, tz?: string): ChaseRow[] {
  return attentionItems(dayEntries, now, logged, tz)
    .filter((i) => i.kind === "unresolved")
    .map((i) => ({
      id: i.id,
      clientId: i.clientId ?? null,
      clientName: i.clientName,
      trainerName: i.trainerName,
      at: i.at ? formatStudioTime(i.at, tz) : "--",
      atMs: i.at?.getTime() ?? 0,
    }))
    .sort((a, b) => a.atMs - b.atMs);
}

export const pct = (v: number | null): string => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** "15 of 24 done" style foot lines share one helper so the strip reads the same on every tile. */
export function todayFoot(n: TodayNumbers): { done: string; notCompleted: string; neverLogged: string; floor: string } {
  const floor = n.stillToCome > 0 ? `${n.stillToCome} still to come` : n.booked === 0 ? "nothing booked today" : "nothing still to come";
  if (n.unknown > 0) {
    // Journey's sessions could not be read: what was done is not known, so neither is what was missed.
    const missing = "missing, not zero — Journey's sessions could not be read";
    return { done: missing, notCompleted: missing, neverLogged: missing, floor };
  }
  return {
    done: n.booked === 0 ? "nothing booked" : `${pct(n.donePct)} of ${n.booked} booked`,
    notCompleted:
      n.notCompleted === 0
        ? "nothing missed"
        : [n.cancelled > 0 ? `${n.cancelled} cancelled` : null, n.noShow > 0 ? `${n.noShow} no-show${n.noShow === 1 ? "" : "s"}` : null, n.neverLogged > 0 ? `${n.neverLogged} never logged` : null]
            .filter(Boolean)
            .join(" · "),
    neverLogged: n.neverLogged === 0 ? "every finished slot is logged" : "past their slot, nothing logged — chase these",
    floor,
  };
}
