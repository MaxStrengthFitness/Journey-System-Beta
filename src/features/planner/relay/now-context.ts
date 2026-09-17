/**
 * NOW CONTEXT — the one part of Relay that knows what time it is.
 *
 * Round: Relay, Sep 2026. The whole method behind the studio board is
 * "strategic autonomy in fragmented downtime": a trainer does the floor's
 * upkeep in the gaps of a tightly controlled appointment schedule. The old
 * Planner never looked at the schedule, so it could not say the one thing a
 * trainer between two sessions wants to know — how long have I got.
 *
 * This module answers it from the schedule rows the Calendar already loads
 * (useLiveSchedule: yesterday, today and tomorrow are live). Pure, so it is
 * tested; the hook around it is a few lines in NowBar.tsx.
 *
 * Times are minutes since the STUDIO's midnight (studio-time.ts), never the
 * device's — an iPad set to a holiday time zone must not move the shift.
 */
import type { ScheduleEntry, Trainer } from "../../../types";
import { studioDateKey, toDate, zonedHM } from "../../../lib/studio-time";

export type ShiftPhase = "opening" | "mid" | "closing" | "closed";

/** The four boundaries of a studio's day, minutes since midnight. */
export interface ShiftHours {
  open: number;
  mid: number;
  closing: number;
  close: number;
}

/** 5:30 → 10:00 opening, 10:00 → 16:00 mid, 16:00 → 20:00 closing. */
export const DEFAULT_SHIFT_HOURS: ShiftHours = {
  open: 5 * 60 + 30,
  mid: 10 * 60,
  closing: 16 * 60,
  close: 20 * 60,
};

/** "HH:MM" → minutes since midnight, or null when it isn't a clock time. */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since midnight → "h:mm AM". */
export function minutesToClock(min: number): string {
  const h24 = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const m = ((min % 60) + 60) % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/**
 * A studio's shift hours, from what a leader set (Standards) or the default.
 * Anything malformed falls back field by field, and the four are forced into
 * order so a typo cannot make "mid" end before it starts.
 */
export function shiftHoursOf(
  raw: Partial<Record<keyof ShiftHours, string | null | undefined>> | null | undefined,
): ShiftHours {
  const open = clockToMinutes(raw?.open) ?? DEFAULT_SHIFT_HOURS.open;
  const mid = Math.max(open, clockToMinutes(raw?.mid) ?? DEFAULT_SHIFT_HOURS.mid);
  const closing = Math.max(mid, clockToMinutes(raw?.closing) ?? DEFAULT_SHIFT_HOURS.closing);
  const close = Math.max(closing, clockToMinutes(raw?.close) ?? DEFAULT_SHIFT_HOURS.close);
  return { open, mid, closing, close };
}

export function phaseAt(nowMin: number, hours: ShiftHours = DEFAULT_SHIFT_HOURS): ShiftPhase {
  if (nowMin < hours.open || nowMin >= hours.close) return "closed";
  if (nowMin < hours.mid) return "opening";
  if (nowMin < hours.closing) return "mid";
  return "closing";
}

export const PHASE_LABEL: Record<ShiftPhase, string> = {
  opening: "Opening",
  mid: "Mid shift",
  closing: "Closing",
  closed: "Closed",
};

/** One of the trainer's sessions today, in studio minutes. */
export interface NowSession {
  id: string;
  clientId: string | null;
  clientName: string;
  startMin: number;
  endMin: number;
  status: ScheduleEntry["status"];
}

export interface NowContext {
  todayKey: string;
  nowMin: number;
  phase: ShiftPhase;
  hours: ShiftHours;
  /** The session under way right now, if any. */
  current: NowSession | null;
  /** The next session to start after now. */
  next: NowSession | null;
  /**
   * Minutes of free floor time from now: until the next session starts, or
   * null when nothing else is booked today. During a session it is the gap
   * AFTER that session (what the trainer will have once it ends).
   */
  gapMinutes: number | null;
  /** The trainer's sessions today, in order. */
  sessions: NowSession[];
  done: number;
  total: number;
}

const DEFAULT_SESSION_MINUTES = 30;

/**
 * Mindbody names a trainer three ways depending on the endpoint, so a row is
 * matched by id first, then by name — the Calendar's rule, kept in step.
 */
export function entryIsTrainers(entry: ScheduleEntry, trainer: Pick<Trainer, "id" | "fullName" | "nickname">): boolean {
  const raw = entry as unknown as Record<string, unknown>;
  const rowId = entry.trainerId || (raw.staffId as string) || (raw.StaffId as string);
  if (rowId) return String(rowId) === String(trainer.id);
  const rowName = String(entry.trainerName || raw.staffName || raw.StaffFirstName || "")
    .trim()
    .toLowerCase();
  if (!rowName || !trainer.fullName) return false;
  const full = trainer.fullName.trim().toLowerCase();
  const first = full.split(" ")[0];
  const nick = trainer.nickname?.trim().toLowerCase();
  return (
    rowName === full ||
    rowName === first ||
    (Boolean(nick) && rowName === nick) ||
    (first.length >= 3 && (rowName.startsWith(first) || first.startsWith(rowName)))
  );
}

function isUnavailability(entry: ScheduleEntry): boolean {
  return /unavailab/i.test(entry.clientName ?? "");
}

/**
 * The trainer's sessions on `todayKey`, as studio minutes. Cancelled rows and
 * unavailability blocks are left out; a row with no end runs 30 minutes.
 */
export function mySessionsToday(
  schedules: ScheduleEntry[],
  trainer: Pick<Trainer, "id" | "fullName" | "nickname"> | null | undefined,
  todayKey: string,
): NowSession[] {
  if (!trainer) return [];
  const out: NowSession[] = [];
  for (const entry of schedules) {
    if (!entry || entry.status === "Cancelled" || isUnavailability(entry)) continue;
    if (!entryIsTrainers(entry, trainer)) continue;
    const start = toDate(entry.startTime);
    if (!start || studioDateKey(start) !== todayKey) continue;
    const hm = zonedHM(start);
    if (!hm) continue;
    const startMin = hm.hour * 60 + hm.minute;
    const end = toDate(entry.endTime);
    const endHm = end ? zonedHM(end) : null;
    const endMin = endHm && studioDateKey(end) === todayKey
      ? Math.max(startMin + 1, endHm.hour * 60 + endHm.minute)
      : startMin + DEFAULT_SESSION_MINUTES;
    out.push({
      id: entry.id ?? `${entry.clientName}-${startMin}`,
      clientId: entry.clientId ?? entry.mindbodyClientId ?? null,
      clientName: entry.clientName ?? "Client",
      startMin,
      endMin,
      status: entry.status,
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

/** Minutes since the studio's midnight for `now`. */
export function studioMinutesNow(now: Date): number {
  const hm = zonedHM(now);
  return hm ? hm.hour * 60 + hm.minute : now.getHours() * 60 + now.getMinutes();
}

export function nowContext(
  sessions: NowSession[],
  nowMin: number,
  todayKey: string,
  hours: ShiftHours = DEFAULT_SHIFT_HOURS,
): NowContext {
  const current = sessions.find((s) => s.startMin <= nowMin && nowMin < s.endMin) ?? null;
  const from = current ? current.endMin : nowMin;
  const next = sessions.find((s) => s.startMin >= from && s !== current) ?? null;
  const gapMinutes = next ? Math.max(0, next.startMin - from) : null;
  const done = sessions.filter((s) => s.endMin <= nowMin || s.status === "Completed").length;
  return {
    todayKey,
    nowMin,
    phase: phaseAt(nowMin, hours),
    hours,
    current,
    next,
    gapMinutes,
    sessions,
    done,
    total: sessions.length,
  };
}

/** "18 min free", "Free until close", "In a session · 12 min left". */
export function gapSentence(ctx: NowContext): string {
  if (ctx.current) {
    const left = Math.max(0, ctx.current.endMin - ctx.nowMin);
    return `With ${ctx.current.clientName} · ${left} min left`;
  }
  if (ctx.gapMinutes === null) {
    if (ctx.phase === "closed") return ctx.total ? "Done for today" : "Studio closed";
    return ctx.total ? "No more sessions today" : "Nothing booked today";
  }
  if (ctx.gapMinutes === 0) return "Next session now";
  if (ctx.gapMinutes >= 90) return `${Math.floor(ctx.gapMinutes / 60)} h ${ctx.gapMinutes % 60} min free`;
  return `${ctx.gapMinutes} min free`;
}

/** How much of the gap has been used, 0..1, for the meter. Full at 60 min. */
export function gapFraction(gapMinutes: number | null): number {
  if (gapMinutes === null) return 1;
  return Math.max(0, Math.min(1, gapMinutes / 60));
}

/**
 * Does a piece of work fit the gap? Duration unknown counts as "fits" only
 * for a long gap — an unknown job in eight minutes is a guess, not a plan.
 */
export function fitsGap(estMinutes: number | null | undefined, gapMinutes: number | null): boolean {
  if (gapMinutes === null) return true;
  if (estMinutes == null) return gapMinutes >= 20;
  return estMinutes <= gapMinutes;
}
