/**
 * RIGHT NOW — the one sentence at the top of the Board, and the door it
 * opens. Relay room, Sep 28 2026 (the redesign's phase 2, AJ's pick).
 *
 * AJ's brief: "Trainers should be able to head here and be pointed directly
 * at the work they are looking for … is the studio empty and it's a good
 * time to clean, or are there sessions going on and I'm in the office." That
 * is David Allen's order for choosing what to do: where you are, then how
 * much time you have, and only then what matters most. Relay already knows
 * how busy the floor is (the studio's bookings today) and how long until the
 * trainer's next session, so it can say which door fits, in one sentence
 * with its proof, and open it.
 *
 * In order, the first that applies:
 *
 *   the studio is closed                  → Mine
 *   a teammate needs cover, nobody has it → Help a teammate
 *   something was handed to you by name   → Mine
 *   leadership started an initiative today
 *     that this iPad hasn't opened on yet → From leadership (q4, AJ: "I guess
 *                                           that could just be a 'new tasks'
 *                                           feature but sure")
 *   today's bookings can't be counted     → no door: Relay says so and does
 *                                           not guess
 *   the floor is quiet (sessions running
 *     now and starting in the next 20
 *     minutes are the studio's quiet-
 *     floor number or fewer)              → Floor work
 *   otherwise                             → Desk work
 *
 * With under five minutes free the sentence says so ("Quick ones only") and
 * keeps the floor's door. A tap on another door overrides the pick until the
 * trainer taps "Back to Relay's pick" (the Board holds that choice).
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { ScheduleEntry } from "../../../types";
import { isStaffBlock } from "../../../lib/booking-state";
import { studioDateKey, toDate, zonedHM } from "../../../lib/studio-time";
import { minutesToClock, type NowContext } from "./now-context";
import type { DoorId } from "./doors";
import { SETTING_BY_KEY } from "../../studio-settings/registry";

/**
 * How many sessions at once still counts as a quiet floor is the STUDIO's
 * number. AJ (q3, Sep 27 2026): "depends on the studio"; approved as a
 * setting on Sep 28 2026 ("all yes, let the admins assign the default within
 * the app"). The Board reads `quietFloorSessions` through
 * features/studio-settings (the studio's own, else Max Strength's default,
 * else the app's) and hands it in; this module keeps no number of its own.
 * With none handed in, the registry's app default answers.
 */
const APP_QUIET_FLOOR = SETTING_BY_KEY.quietFloorSessions.appDefault ?? 2;

/** "Starting soon": a session starting within this many minutes counts toward the floor's load. */
export const STARTING_SOON_MINUTES = 20;

/** Under this many minutes free, only quick jobs fit. */
export const QUICK_ONES_MINUTES = 5;

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

export interface RightNowInput {
  now: Pick<NowContext, "phase" | "gapMinutes" | "current" | "next">;
  load: FloorLoad;
  studioName: string;
  /** An open cover ask nobody has taken, from someone else. */
  coverAsk: { who: string; title: string } | null;
  /** Work handed to this trainer by name: who handed it, one entry each. */
  handedFrom: string[];
  /** An initiative posted today that this iPad has not opened on yet. */
  newInitiative: { who: string; title: string } | null;
  /** The studio's quiet-floor number (studio-settings `quietFloorSessions`); the app's default when absent. */
  quietFloorSessions?: number;
}

export interface RightNow {
  /** The door Relay opens on, or null when it will not guess. */
  door: DoorId | null;
  sentence: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function andList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
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

export function rightNow(input: RightNowInput): RightNow {
  const { now, load } = input;

  if (now.phase === "closed") {
    return { door: "mine", sentence: `${input.studioName} is closed now. Your own list is under My work.` };
  }

  if (input.coverAsk) {
    return {
      door: "help",
      sentence: `${firstName(input.coverAsk.who)} needs cover: ${input.coverAsk.title}. Nobody has taken it yet.`,
    };
  }

  if (input.handedFrom.length > 0) {
    const names = andList([...new Set(input.handedFrom.map(firstName))]);
    const n = input.handedFrom.length;
    return { door: "mine", sentence: `${names} handed you ${n === 1 ? "something" : `${n} things`}.` };
  }

  if (input.newInitiative) {
    return {
      door: "lead",
      sentence: `${firstName(input.newInitiative.who)} started an initiative today: ${input.newInitiative.title}.`,
    };
  }

  if (!load.known) {
    return {
      door: null,
      sentence: `Today's list shows no sessions at ${input.studioName} yet, so Relay isn't saying how busy the floor is. Pick a door.`,
    };
  }

  const quiet = isQuiet(load, input.quietFloorSessions);
  const door: DoorId = quiet ? "floor" : "desk";

  if (now.current) {
    return {
      door,
      sentence: `You're with ${now.current.clientName} until ${minutesToClock(now.current.endMin)}. ${loadWords(load)}.`,
    };
  }

  if (now.gapMinutes !== null && now.gapMinutes < QUICK_ONES_MINUTES && now.next) {
    const m = now.gapMinutes;
    return {
      door,
      sentence: `${m === 1 ? "1 minute" : `${m} minutes`} until ${now.next.clientName}. Quick ones only.`,
    };
  }

  const words = loadWords(load);
  return quiet
    ? { door, sentence: `The floor is quiet: ${words.charAt(0).toLowerCase()}${words.slice(1)}. A good time for floor work.` }
    : { door, sentence: `${words}: a good time for desk work.` };
}

/* ------------------------------------------------------------------ *
 * Later today — the trainer's next gaps, and when Closing opens
 * ------------------------------------------------------------------ */

export interface LaterRow {
  key: string;
  /** "3:20 PM" */
  time: string;
  what: string;
  sub: string | null;
}

/** A gap worth naming: this long or longer. */
export const LATER_GAP_MINUTES = 10;

/** A teammate's cover ask needed later today, at its kept time (./cover.ts). */
export interface LaterCover {
  key: string;
  /** Minutes since the studio's midnight. */
  min: number;
  who: string;
  title: string;
}

/**
 * The rest of the trainer's day as a few rows: each free gap of ten minutes
 * or more between their sessions after now, a teammate's cover needed later
 * today at the time it is needed (the second wave, Sep 28 2026: a cover ask
 * keeps its time), and the moment Closing opens (the closing chores). From
 * the trainer's own sessions and the asks on the board; nothing is
 * scheduled, booked or suggested.
 */
export function laterToday(
  now: Pick<NowContext, "nowMin" | "sessions" | "hours" | "phase">,
  max = 4,
  covers: readonly LaterCover[] = [],
): LaterRow[] {
  const out: (LaterRow & { at: number })[] = [];
  const upcoming = now.sessions.filter((s) => s.endMin > now.nowMin).sort((a, b) => a.startMin - b.startMin);
  for (const c of covers) {
    if (c.min <= now.nowMin) continue;
    const busy = now.sessions.some((s) => s.startMin <= c.min && c.min < s.endMin);
    out.push({
      key: `cover-${c.key}`,
      at: c.min,
      time: minutesToClock(c.min),
      what: `${firstName(c.who)} needs cover`,
      sub: `${c.title} · ${busy ? "you have a session then" : "you're free then"}`,
    });
  }
  for (let i = 0; i < upcoming.length - 1; i++) {
    const from = Math.max(upcoming[i].endMin, now.nowMin);
    const to = upcoming[i + 1].startMin;
    const gap = to - from;
    if (gap < LATER_GAP_MINUTES || from <= now.nowMin) continue;
    out.push({
      key: `gap-${from}`,
      at: from,
      time: minutesToClock(from),
      what: `${gap} min free`,
      sub: `until ${upcoming[i + 1].clientName} at ${minutesToClock(to)}`,
    });
  }
  if (now.phase !== "closed" && now.nowMin < now.hours.closing) {
    out.push({
      key: "closing",
      at: now.hours.closing,
      time: minutesToClock(now.hours.closing),
      what: "Closing chores open",
      sub: "the shift's closing list, for everyone on",
    });
  }
  return out
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map(({ at: _at, ...row }) => row);
}
