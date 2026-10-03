/**
 * TODAY AT A GLANCE — what the greeting says about the studio you're walking
 * into (the front door, Oct 3 2026; AJ: "just something that we can take
 * advantage of the current data we already load").
 *
 * Pure: handed the day's bookings at one studio (the same rows the Hub reads),
 * the signed-in trainer and the studio's trainers, it says how many sessions
 * are booked, how many are yours, and your next one. "Yours" is the Hub's own
 * rule (`columnIdOf`), so the greeting and the Hub's own column never
 * disagree. A staff block ("Unavailable") is never a booking, and a cancelled
 * booking is not one either.
 */
import { isStaffBlock } from "../../lib/booking-state";
import { formatStudioTime, toDate } from "../../lib/studio-time";
import { columnIdOf } from "../hub-schedule/columns";

export interface GlanceBooking {
  clientName?: string | null;
  trainerId?: string | number | null;
  trainerName?: string | null;
  mindbodyStaffId?: string | number | null;
  startTime: unknown;
  status?: string | null;
}

export interface TodayGlance {
  booked: number;
  mine: number;
  /** Your next session from now, or null when you have none left today. */
  next: { at: Date; clientName: string } | null;
  /** True when you had sessions today and all of them have started. */
  allStarted: boolean;
}

/** A session counts as "next" until ten minutes after it began. */
const NEXT_GRACE_MS = 10 * 60 * 1000;

export function todayGlance(
  bookings: readonly GlanceBooking[],
  me: { trainerId: string; trainerIds: ReadonlySet<string>; staffIds: Readonly<Record<string, string>> },
  now: Date,
): TodayGlance {
  const real = bookings.filter((b) => b.status !== "Cancelled" && !isStaffBlock(b));
  const mineRows = real
    .filter((b) => columnIdOf(b as never, me.trainerIds, me.staffIds) === me.trainerId)
    .map((b) => ({ at: toDate(b.startTime as never), clientName: (b.clientName ?? "").trim() }))
    .filter((b): b is { at: Date; clientName: string } => b.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const next = mineRows.find((b) => b.at.getTime() + NEXT_GRACE_MS >= now.getTime()) ?? null;
  return { booked: real.length, mine: mineRows.length, next, allStarted: mineRows.length > 0 && next === null };
}

export interface GlanceLine {
  /** The figure on the left: a time or a count. */
  figure: string;
  words: string;
  /** The one line about you, drawn a step brighter. */
  yours?: boolean;
}

/**
 * The greeting's lines, in order. Each is said only when it is known: a read
 * that failed is left out, never drawn as a zero.
 */
export function glanceLines(glance: TodayGlance | null, openJobs: number | null, tz?: string): GlanceLine[] {
  const lines: GlanceLine[] = [];
  if (glance) {
    if (glance.next) {
      const who = glance.next.clientName || "a client";
      lines.push({
        figure: formatStudioTime(glance.next.at, tz),
        words: glance.mine > 1 ? `Your next client, ${who} · ${glance.mine} yours today` : `Your client today, ${who}`,
        yours: true,
      });
    } else if (glance.allStarted) {
      lines.push({ figure: String(glance.mine), words: glance.mine === 1 ? "session with you today, already started" : "sessions with you today, all started", yours: true });
    } else {
      lines.push({ figure: "0", words: "clients booked with you today", yours: true });
    }
    lines.push({ figure: String(glance.booked), words: glance.booked === 1 ? "session booked at the studio today" : "sessions booked at the studio today" });
  }
  if (openJobs !== null && openJobs > 0) {
    lines.push({ figure: String(openJobs), words: openJobs === 1 ? "team job open on the Board" : "team jobs open on the Board" });
  }
  return lines;
}
