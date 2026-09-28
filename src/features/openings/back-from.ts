/**
 * "BOOKED AGAIN FROM": WHEN SHE IS NEXT IN (Openings,
 * docs/rounds/2026-09-27-openings.md, "Booked again from").
 *
 * For every line of the next 7 days that concerns a client, one read of
 * those clients' bookings from the day after the slot to today +
 * BACK_FROM_DAYS at most (`clientId in [...]`, CLIENTS_PER_READ at once, on
 * the existing (clientId, startTime) index). Only this studio's rows count,
 * and cancelled ones don't.
 *
 *   booked-again   her next booking is found, and every day before it was
 *                  read: it falls inside the next 7 days (read, and answered
 *                  by the server), or the month was read in full today
 *   next-on-file   her next booking is found, but the days before it weren't
 *                  all read, so an earlier one could be missing
 *   none-30        nothing found after the slot, and the month was read in
 *                  full today: "not booked again through" today + 30
 *   none-7         nothing found after the slot, otherwise: "not booked
 *                  again through" the last day of the next 7
 *   cant-tell      the read hasn't come back from the server, or the slot
 *                  is the window's last day and the month wasn't read, so no
 *                  day after it was read at all
 *
 * EVERY ANSWER IS ABOUT THE DAYS AFTER THE SLOT. The read starts the day
 * after it, so a booking between today and the slot is never seen: a
 * twice-a-week regular booked Monday whose Thursday is open is not "not
 * booked in the next 7 days". So a "none" names the day it reaches ("not
 * booked again through Fri, Nov 13"), never "the next 7 / 30 days", which
 * would be counted from today.
 *
 * "The month was read in full today" is the sync lease's
 * `lastDeepScheduleSyncAt` falling in today's pull block: the auto-sync's
 * own test (`wantsDeepPull`). Journey holds bookings 30 days ahead only after
 * that morning pull.
 *
 * It is what a trainer needs to say AJ's "you can take that slot for the
 * week, but he'll probably be back in two weeks". The sentence never names
 * the client (present.ts).
 *
 * PURE MODULE.
 */
import type { ScheduleEntry } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { studioDateKey, toDate, type DateLike } from "../../lib/studio-time";
import { wantsDeepPull } from "../admin/syncPolicy";
import { CHECK_DAYS } from "../standing-week/check";
import { addDays } from "./coverage";

/** How far ahead "booked again from" looks. */
export const BACK_FROM_DAYS = 30;
/** Clients in one `in` read. */
export const CLIENTS_PER_READ = 30;

export type BackFrom =
  | { kind: "booked-again"; day: string }
  | { kind: "next-on-file"; day: string }
  | { kind: "none-30"; through: string }
  | { kind: "none-7"; through: string }
  | { kind: "cant-tell" };

/** The days to read for a slot: from the day after it to today + BACK_FROM_DAYS. */
export function backFromRange(slotDay: string, today: string): { from: string; to: string } {
  return { from: addDays(slotDay, 1), to: addDays(today, BACK_FROM_DAYS) };
}

/** The clients to read, each once, in reads of CLIENTS_PER_READ. */
export function clientBatches(clientIds: readonly (string | null | undefined)[]): string[][] {
  const ids = [...new Set(clientIds.filter((id): id is string => typeof id === "string" && id !== ""))].sort();
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CLIENTS_PER_READ) out.push(ids.slice(i, i + CLIENTS_PER_READ));
  return out;
}

/** Was the month read in full today: the lease's last whole-month pull falls in today's pull block. */
export function monthReadToday(lastDeepAt: number | null | undefined, now: number, tz: string): boolean {
  return typeof lastDeepAt === "number" && Number.isFinite(lastDeepAt) && !wantsDeepPull(lastDeepAt, now, tz);
}

export interface BackFromInput {
  /** The line's day. */
  slotDay: string;
  today: string;
  studioId: string;
  clientId: string;
  /** The clients' bookings read for the range; null while the read hasn't come back from the server. */
  bookings: readonly ScheduleEntry[] | null;
  monthRead: boolean;
  tz: string;
  /** The next 7 days' window (CHECK_DAYS). */
  days?: number;
}

export function backFrom(input: BackFromInput): BackFrom {
  if (!input.bookings) return { kind: "cant-tell" };
  const { from, to } = backFromRange(input.slotDay, input.today);
  let next: string | null = null;
  for (const b of input.bookings) {
    if (b.clientId !== input.clientId || b.studioId !== input.studioId || b.status === "Cancelled" || isStaffBlock(b)) continue;
    const day = studioDateKey(toDate(b.startTime as DateLike), input.tz);
    if (!day || day < from || day > to) continue;
    if (!next || day < next) next = day;
  }
  const weekEnd = addDays(input.today, (input.days ?? CHECK_DAYS) - 1);
  if (next) return next <= weekEnd || input.monthRead ? { kind: "booked-again", day: next } : { kind: "next-on-file", day: next };
  if (input.monthRead) return { kind: "none-30", through: to };
  // The slot is the window's last day: no day after it was read.
  if (from > weekEnd) return { kind: "cant-tell" };
  return { kind: "none-7", through: weekEnd };
}
