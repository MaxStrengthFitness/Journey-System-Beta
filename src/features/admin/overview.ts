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

import type { ScheduleEntry, WorkoutSession } from "../../types";
import { studioDateKey, toDate } from "../../lib/studio-time";

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
  completed: number;
  /** Scheduled, and the start time has not arrived. */
  upcoming: number;
  /** Scheduled, started, and not yet marked done. */
  inProgress: number;
  cancelled: number;
  noShow: number;
  /**
   * Still "Scheduled" although the slot has finished. Nobody marked these
   * anything — not completed, not a no-show. This is the number that quietly
   * rots a retention report, and no screen in the app surfaced it before.
   */
  unresolved: number;
  /** cancelled + noShow. The retention headline. */
  missed: number;
  /**
   * Completed as a share of everything that was supposed to happen
   * (completed + noShow + unresolved). Null before anything has resolved,
   * because 0 of 0 is not 0% — it is "the day has not started".
   */
  showRate: number | null;
}

const MINUTE = 60_000;

export function summariseFloor(
  entries: ScheduleEntry[],
  now: Date,
): FloorSummary {
  let completed = 0;
  let upcoming = 0;
  let inProgress = 0;
  let cancelled = 0;
  let noShow = 0;
  let unresolved = 0;
  const clientKeys = new Set<string>();

  for (const e of entries) {
    // Cancellations still count a person as "booked" — the slot was taken —
    // but not as a body on the floor, so they are excluded from the client
    // set only when nothing else brings that client in.
    if (e.status !== "Cancelled") {
      clientKeys.add(e.clientId || e.mindbodyClientId || e.clientName || "?");
    }

    switch (e.status) {
      case "Completed":
        completed += 1;
        break;
      case "Cancelled":
        cancelled += 1;
        break;
      case "No-Show":
        noShow += 1;
        break;
      default: {
        const start = toDate(e.startTime);
        const end = toDate(e.endTime);
        if (!start) {
          upcoming += 1;
          break;
        }
        if (start > now) {
          upcoming += 1;
        } else if (end && end.getTime() + 5 * MINUTE < now.getTime()) {
          // Five minutes of slack: a session that ran two minutes over is not
          // an operational problem, and flagging it as one teaches people to
          // ignore the flag.
          unresolved += 1;
        } else {
          inProgress += 1;
        }
      }
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
    missed: cancelled + noShow,
    showRate: resolved === 0 ? null : completed / resolved,
  };
}

/* ==================================================================== *
 * Who is on the floor
 * ==================================================================== */

export interface TrainerLane {
  trainerId: string | null;
  trainerName: string;
  total: number;
  completed: number;
  remaining: number;
  noShow: number;
  cancelled: number;
  /** The client they are with right now, if the schedule says so. */
  nowWith: string | null;
  /** Start of their next appointment after `now`. */
  nextAt: Date | null;
  /** Their first and last appointment today — the shift, as booked. */
  firstAt: Date | null;
  lastAt: Date | null;
  /** True when a session document for them is open right now. */
  live: boolean;
}

/**
 * One lane per trainer with something on the books today, ordered by when
 * their day starts. A trainer with only cancellations still gets a lane —
 * "Marina's four bookings all cancelled" is exactly the thing a studio leader
 * needs to see, and dropping the lane hides it.
 */
export function trainerLanes(
  entries: ScheduleEntry[],
  now: Date,
  liveSessions: WorkoutSession[] = [],
): TrainerLane[] {
  const byTrainer = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const key = e.trainerId || `name:${e.trainerName || "Unassigned"}`;
    const list = byTrainer.get(key);
    if (list) list.push(e);
    else byTrainer.set(key, [e]);
  }

  const liveTrainerIds = new Set(
    liveSessions
      .filter((s) => s.status === "In-Progress" && s.trainerId)
      .map((s) => s.trainerId as string),
  );

  const lanes: TrainerLane[] = [];
  for (const [key, list] of byTrainer) {
    const sorted = [...list].sort(
      (a, b) =>
        (toDate(a.startTime)?.getTime() ?? 0) -
        (toDate(b.startTime)?.getTime() ?? 0),
    );
    const trainerId = key.startsWith("name:") ? null : key;

    let completed = 0;
    let noShow = 0;
    let cancelled = 0;
    let nowWith: string | null = null;
    let nextAt: Date | null = null;

    for (const e of sorted) {
      if (e.status === "Completed") completed += 1;
      else if (e.status === "No-Show") noShow += 1;
      else if (e.status === "Cancelled") cancelled += 1;

      if (e.status === "Scheduled") {
        const start = toDate(e.startTime);
        const end = toDate(e.endTime);
        if (start && end && start <= now && now < end && !nowWith) {
          nowWith = e.clientName || "Client";
        }
        if (start && start > now && (!nextAt || start < nextAt)) {
          nextAt = start;
        }
      }
    }

    const active = sorted.filter((e) => e.status !== "Cancelled");
    lanes.push({
      trainerId,
      trainerName: sorted[0]?.trainerName || "Unassigned",
      total: active.length,
      completed,
      remaining: active.length - completed - noShow,
      noShow,
      cancelled,
      nowWith,
      nextAt,
      firstAt: toDate(active[0]?.startTime) ?? null,
      lastAt: toDate(active[active.length - 1]?.startTime) ?? null,
      live: trainerId ? liveTrainerIds.has(trainerId) : false,
    });
  }

  return lanes.sort((a, b) => {
    // Anyone mid-session floats to the top; after that, the day's order.
    if (a.live !== b.live) return a.live ? -1 : 1;
    const at = a.firstAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.firstAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.trainerName.localeCompare(b.trainerName);
  });
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
 * until someone marks them. Cancellations last — most came with notice.
 */
export function attentionItems(
  entries: ScheduleEntry[],
  now: Date,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const e of entries) {
    let kind: AttentionKind | null = null;
    if (e.status === "No-Show") kind = "no-show";
    else if (e.status === "Cancelled") kind = "cancelled";
    else if (e.status === "Scheduled") {
      const end = toDate(e.endTime);
      if (end && end.getTime() + 5 * MINUTE < now.getTime()) kind = "unresolved";
    }
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

/* ==================================================================== *
 * Week shape, for context under today
 * ==================================================================== */

export interface DayLoad {
  dayKey: string;
  booked: number;
  completed: number;
  missed: number;
}

/**
 * Appointment counts per studio-local day across whatever range the schedule
 * hook has loaded. Today alone has no shape to it; a leader wants to know
 * whether today is heavy or light before deciding to send someone home.
 */
export function loadByDay(entries: ScheduleEntry[]): DayLoad[] {
  const byDay = new Map<string, DayLoad>();
  for (const e of entries) {
    const key = studioDateKey(toDate(e.startTime));
    if (!key) continue;
    const row =
      byDay.get(key) ?? { dayKey: key, booked: 0, completed: 0, missed: 0 };
    row.booked += 1;
    if (e.status === "Completed") row.completed += 1;
    if (e.status === "No-Show" || e.status === "Cancelled") row.missed += 1;
    byDay.set(key, row);
  }
  return [...byDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}
