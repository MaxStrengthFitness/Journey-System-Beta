/**
 * Admin Overview — what is happening on the floor, as pure functions.
 *
 * The screen this feeds replaces a landing page that showed three numbers:
 * total network sessions this month, total cross-trains, and a per-studio card
 * headed "Strict Demographic Adherence". None of them told anyone whether the
 * studio was running today, two of them were wrong (see the location-id note
 * in phase 4), and the third read like a compliance report.
 *
 * What a studio leader opening the app actually needs is the same thing a
 * trainer needs, one level up: who is on the floor, how heavy today is, what
 * has fallen over, and what still has to get done.
 *
 * Pure and separately tested because this is arithmetic about someone's day,
 * and arithmetic about someone's day is worth being sure of.
 */

import type { ScheduleEntry } from "../../../types";
import { studioDateKey, toDate } from "../../../lib/studio-time";
import { bookingState, type LoggedSessions } from "../../../lib/booking-state";

/* ==================================================================== *
 * Day filtering
 * ==================================================================== */

/**
 * The entries belonging to one studio-local day.
 *
 * Studio-local, not UTC: an 8pm Eastern appointment is tomorrow in UTC, and a
 * board that quietly drops the last two hours of every evening would be worse
 * than no board.
 */
export function entriesForDay(
  entries: ScheduleEntry[],
  dayKey: string,
): ScheduleEntry[] {
  return entries.filter((e) => studioDateKey(toDate(e.startTime)) === dayKey);
}

/* ==================================================================== *
 * Floor summary
 * ==================================================================== */

export interface FloorSummary {
  /** Appointments on the books today, cancellations included. */
  booked: number;
  /** Distinct people — a client booked twice is still one person. */
  clients: number;
  /**
   * Done: a Journey session was completed for the client that day (AJ, Sep
   * 24 2026 — the booking itself never says so), or Mindbody was marked.
   */
  completed: number;
  /** Scheduled, and the start time has not arrived. */
  upcoming: number;
  /** Scheduled, started, and not yet marked done. */
  inProgress: number;
  cancelled: number;
  noShow: number;
  /**
   * Past its slot and nothing says it happened — no Journey session for that
   * client that day, no mark in Mindbody. This is the number that quietly
   * rots a retention report, and no screen in the app surfaced it before.
   */
  unresolved: number;
  /**
   * Past its slot, and Journey's sessions could not be read — neither done
   * nor never logged. Counted so a screen can say the number is missing.
   */
  unknown: number;
  /** cancelled + noShow. The retention headline. */
  missed: number;
  /**
   * Completed as a share of everything that was supposed to happen
   * (completed + noShow + unresolved). Null before anything has resolved,
   * because 0 of 0 is not 0% — it is "the day has not started" — and null
   * while any slot is unknown, because a rate over part of the day is a
   * confident wrong number.
   */
  showRate: number | null;
}

/**
 * The day's shape. `logged` is `loggedSessions(...)` over the studio's
 * Journey sessions for the day (`lib/booking-state`); `null` when they could
 * not be read, which leaves finished slots unknown rather than unlogged.
 */
export function summariseFloor(
  entries: ScheduleEntry[],
  now: Date,
  logged: LoggedSessions | null,
  tz?: string,
): FloorSummary {
  let completed = 0;
  let upcoming = 0;
  let inProgress = 0;
  let cancelled = 0;
  let noShow = 0;
  let unresolved = 0;
  let unknown = 0;
  const clientKeys = new Set<string>();

  for (const e of entries) {
    // Cancellations still count a person as "booked" — the slot was taken —
    // but not as a body on the floor, so they are excluded from the client
    // set only when nothing else brings that client in.
    if (e.status !== "Cancelled") {
      clientKeys.add(e.clientId || e.mindbodyClientId || e.clientName || "?");
    }

    switch (bookingState(e, logged, now, tz)) {
      case "completed":
        completed += 1;
        break;
      case "cancelled":
        cancelled += 1;
        break;
      case "no-show":
        noShow += 1;
        break;
      case "upcoming":
        upcoming += 1;
        break;
      case "in-progress":
        inProgress += 1;
        break;
      case "never-logged":
        unresolved += 1;
        break;
      case "unknown":
        unknown += 1;
        break;
    }
  }

  const resolved = completed + noShow + unresolved;
  return {
    booked: entries.length,
    clients: clientKeys.size,
    completed,
    upcoming,
    inProgress,
    cancelled,
    noShow,
    unresolved,
    unknown,
    missed: cancelled + noShow,
    showRate: resolved === 0 || unknown > 0 ? null : completed / resolved,
  };
}

/* ==================================================================== *
 * What fell over
 * ==================================================================== */

export type AttentionKind = "no-show" | "cancelled" | "unresolved";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  clientId?: string;
  clientName: string;
  trainerName: string;
  at: Date | null;
}

const ATTENTION_ORDER: Record<AttentionKind, number> = {
  "no-show": 0,
  unresolved: 1,
  cancelled: 2,
};

/**
 * The retention tracker's rows, worst first.
 *
 * No-shows lead because they are the only one of the three where a person
 * decided not to come and said nothing. Unresolved slots come next: they are
 * a staff problem, not a client one, but they corrupt every number below them
 * until someone logs them. Cancellations last — most came with notice. A slot
 * whose sessions could not be read is not a row: nobody knows it needs one.
 */
export function attentionItems(
  entries: ScheduleEntry[],
  now: Date,
  logged: LoggedSessions | null,
  tz?: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const e of entries) {
    const state = bookingState(e, logged, now, tz);
    const kind: AttentionKind | null =
      state === "no-show" ? "no-show" : state === "cancelled" ? "cancelled" : state === "never-logged" ? "unresolved" : null;
    if (!kind) continue;
    items.push({
      id: e.id || `${e.clientName}-${String(e.startTime)}`,
      kind,
      clientId: e.clientId,
      clientName: e.clientName || "Client",
      trainerName: e.trainerName || "Unassigned",
      at: toDate(e.startTime),
    });
  }

  return items.sort((a, b) => {
    if (a.kind !== b.kind) return ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind];
    return (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0);
  });
}
