/**
 * A QUIET FLOOR — the one line the Board says about how busy the floor is
 * (the Relay Board rebuild, Oct 3 2026).
 *
 * The Board used to open on "Right now", one sentence that picked a door for
 * the trainer (Relay room, Sep 28 2026). AJ rebuilt the Board as the studio's
 * day on one board ("No, the board is the plan"), so nothing is picked any
 * more; what stays is the studio's own quiet-floor number (q3, Sep 27 2026:
 * "depends on the studio"), read here to say, beside the part of the day,
 * "Quiet floor right now: a good time for floor work." Never off a list it
 * can't count.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { ScheduleEntry } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { studioDateKey, toDate, zonedHM } from "../../../lib/studio-time";
import { SETTING_BY_KEY } from "../../studio-settings/registry";

/**
 * How many sessions at once still counts as a quiet floor is the STUDIO's
 * number. AJ (q3, Sep 27 2026): "depends on the studio"; approved as a
 * setting on Sep 28 2026 ("all yes, let the admins assign the default within
 * the app"). The Board's host reads `quietFloorSessions` through
 * features/studio-settings (the studio's own, else Max Strength's default,
 * else the app's) and hands it in; this module keeps no number of its own.
 * With none handed in, the registry's app default answers.
 */
const APP_QUIET_FLOOR = SETTING_BY_KEY.quietFloorSessions.appDefault ?? 2;

/** "Starting soon": a session starting within this many minutes counts toward the floor's load. */
export const STARTING_SOON_MINUTES = 20;

export interface FloorLoad {
  /**
   * Whether today's bookings at the studio could be counted at all. The
   * app's schedule gives no "loaded" signal, so a studio with no booking on
   * today's list reads as unknown: Relay never calls a floor quiet off an
   * empty list it cannot tell from a list that has not arrived.
   */
  known: boolean;
  running: number;
  startingSoon: number;
}

const MINUTES_OF_A_BOOKING = 30;

/** Sessions on the studio's floor right now, and starting in the next twenty minutes. */
export function floorLoad(schedules: readonly ScheduleEntry[], todayKey: string, nowMin: number): FloorLoad {
  let seen = 0;
  let running = 0;
  let startingSoon = 0;
  for (const entry of schedules) {
    if (!entry || entry.status === "Cancelled" || isStaffBlock(entry)) continue;
    const start = toDate(entry.startTime);
    if (!start || studioDateKey(start) !== todayKey) continue;
    const hm = zonedHM(start);
    if (!hm) continue;
    seen += 1;
    const startMin = hm.hour * 60 + hm.minute;
    const end = toDate(entry.endTime);
    const endHm = end ? zonedHM(end) : null;
    const endMin = endHm && studioDateKey(end) === todayKey ? Math.max(startMin + 1, endHm.hour * 60 + endHm.minute) : startMin + MINUTES_OF_A_BOOKING;
    if (startMin <= nowMin && nowMin < endMin) running += 1;
    else if (startMin > nowMin && startMin <= nowMin + STARTING_SOON_MINUTES) startingSoon += 1;
  }
  return { known: seen > 0, running, startingSoon };
}

const sessions = (n: number) => (n === 1 ? "1 session" : `${n} sessions`);

/** The floor's load as words: "2 sessions running now, 1 more starting in the next 20 minutes". */
export function loadWords(load: FloorLoad): string {
  const running = load.running === 0 ? "No sessions running now" : `${sessions(load.running)} running now`;
  const soon = load.startingSoon ? `, ${load.startingSoon} more starting in the next ${STARTING_SOON_MINUTES} minutes` : "";
  return `${running}${soon}`;
}

/** Is the floor quiet: the studio's number of sessions (running and starting soon) or fewer? Never off an unknown load. */
export function isQuiet(load: FloorLoad, quietFloorSessions: number = APP_QUIET_FLOOR): boolean {
  return load.known && load.running + load.startingSoon <= quietFloorSessions;
}

/**
 * "Quiet floor right now: a good time for floor work." on a quiet floor, or
 * null: on a busy floor, a list it can't count, or a closed studio.
 */
export function quietLine(load: FloorLoad, quietFloorSessions?: number): string | null {
  if (!isQuiet(load, quietFloorSessions)) return null;
  return `Quiet floor right now (${loadWords(load).charAt(0).toLowerCase()}${loadWords(load).slice(1)}): a good time for floor work.`;
}
