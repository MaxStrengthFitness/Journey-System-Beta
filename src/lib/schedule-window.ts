/**
 * The schedule window — which bookings the app holds LIVE and which it FETCHES.
 *
 * Round: cost clean-up, Sep 2026.
 *
 * `useLiveSchedule` used to open one Firestore listener on every booking from
 * 24 hours ago to 30 days ahead. The pull-sync rewrites `lastSyncAt` on every
 * booking it touches, so each sync billed every one of those documents to
 * every open iPad — for a schedule that mostly nobody was looking at. And the
 * calendar could never show anything outside that window, because the
 * listener was the only source of bookings.
 *
 * The split now is:
 *
 *   LIVE     yesterday · today · tomorrow. One listener, three studio days.
 *            Today has to be right the moment Mindbody changes, and a listener
 *            is the cheapest way to get that. Yesterday because a session that
 *            ran late last night still has to resolve on the Hub this morning.
 *   FETCHED  everything else, on demand and cached by day. The rest of the
 *            week is refreshed every hour while the screen is visible,
 *            and any range the calendar navigates to is fetched once and then
 *            re-fetched only when it goes stale or the user taps Refresh.
 *
 * Everything here is pure so the rules can be tested without Firestore; the
 * hook does the reading and the wiring.
 */

import type { ScheduleEntry } from "../types";
import {
  endOfStudioDay,
  startOfStudioDay,
  studioDateKey,
  studioDayBoundsForKey,
  toDate,
} from "./studio-time";

/**
 * A fetched day older than this is re-read on the next visible tick.
 *
 * An hour since the cost plan (Sep 26 2026, D2). The fetched days are day 2
 * onward - today and tomorrow are the live listener - and since the month is
 * pulled from Mindbody once each morning, those days only change in
 * Firestore at that pull, by webhook, or on a Refresh. Re-reading them every
 * fifteen minutes on every iPad read the same unchanged rows four times an
 * hour. Refresh and waking the iPad still re-read at once.
 */
export const SCHEDULE_STALE_MS = 60 * 60_000;

/**
 * How far ahead the always-fetched window reaches, in studio days.
 *
 * This is the roster's old `ROSTER_DAYS_AHEAD`: the Hub's day tabs span the
 * current week, the Operations week load reads the same span, and the
 * trainer's "upcoming" list expects it — so this range is kept fresh on a
 * timer even when the calendar is closed.
 */
export const WEEK_AHEAD_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads a booking's start as a Date. `startTime` arrives as a Firestore
 * Timestamp from a live snapshot, but as a Date or an ISO string from older
 * writes and the sync — `toDate` in studio-time already knows every shape.
 */
export function scheduleStart(entry: ScheduleEntry): Date | null {
  return toDate(entry.startTime);
}

/**
 * Merges the live window with the fetched cache into the ONE list every
 * consumer already reads.
 *
 * Live wins on a shared id: the listener is the newer source for any booking
 * both hold. Cancelled bookings are dropped here, as the listener used to do,
 * so no consumer has to remember to. Sorted by start so the calendar and the
 * Hub see the same order the old single query returned.
 */
export function mergeSchedules(
  live: ScheduleEntry[],
  ranged: ScheduleEntry[],
): ScheduleEntry[] {
  const byId = new Map<string, ScheduleEntry>();
  const noId: ScheduleEntry[] = [];

  // Ranged first, then live, so a live copy overwrites a fetched one.
  for (const entry of ranged) {
    if (entry.status === "Cancelled") continue;
    if (entry.id) byId.set(entry.id, entry);
    else noId.push(entry);
  }
  for (const entry of live) {
    if (entry.status === "Cancelled") continue;
    if (entry.id) byId.set(entry.id, entry);
    else noId.push(entry);
  }

  const out = [...byId.values(), ...noId];
  out.sort((a, b) => {
    const ta = scheduleStart(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const tb = scheduleStart(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return out;
}

/** Every studio day key from `from` to `to`, inclusive, in order. */
export function dayKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const lastKey = studioDateKey(to);
  if (!lastKey) return keys;
  // Step from studio noon to studio noon: a whole day at a time, but starting
  // mid-day so a DST change (23- or 25-hour day) can never skip or repeat one.
  let cursor = startOfStudioDay(from).getTime() + 12 * 60 * 60 * 1000;
  let guard = 0;
  while (guard < 400) {
    const key = studioDateKey(new Date(cursor));
    if (!key) break;
    keys.push(key);
    if (key === lastKey) break;
    // Past the end without ever matching it means `to` was before `from`.
    if (key > lastKey) return [];
    cursor += DAY_MS;
    guard += 1;
  }
  return keys;
}

/**
 * Decides whether a requested range needs a read, and which part of it.
 *
 * `coverage` is dayKey → the time that day was last fetched. When every day
 * in the range was fetched within `staleMs`, nothing is read. Otherwise the
 * range comes back TRIMMED to the first and last day that actually needs
 * reading: a fresh day in the middle is not worth stitching two queries
 * around (a range is one query either way), but fresh days at the EDGES cost
 * nothing to leave out — and the three live days sit at the front of every
 * week-ahead request, so trimming them is what keeps the week fetch from
 * re-reading what the listener already holds.
 */
export function rangeToFetch(
  coverage: Map<string, number>,
  from: Date,
  to: Date,
  now: number,
  staleMs: number,
): { from: Date; to: Date } | null {
  const keys = dayKeysBetween(from, to);
  if (keys.length === 0) return null;
  const freshAfter = now - staleMs;
  const isFresh = (key: string) => {
    const fetchedAt = coverage.get(key);
    return fetchedAt !== undefined && fetchedAt >= freshAfter;
  };
  const stale = keys.filter((key) => !isFresh(key));
  if (stale.length === 0) return null;
  return {
    from: studioDayBoundsForKey(stale[0]).start,
    to: studioDayBoundsForKey(stale[stale.length - 1]).end,
  };
}

/**
 * The three studio days the listener watches: start of yesterday through the
 * end of tomorrow. Anchored to the studio's day, not the viewer's, so a device
 * opened from another timezone still watches the studio's today.
 */
export function liveWindow(now: Date): { from: Date; to: Date } {
  const todayStart = startOfStudioDay(now);
  // Noon-based hops so a DST day cannot land the anchor on the wrong date.
  const yesterday = new Date(todayStart.getTime() - 12 * 60 * 60 * 1000);
  const tomorrow = new Date(todayStart.getTime() + 36 * 60 * 60 * 1000);
  return { from: startOfStudioDay(yesterday), to: endOfStudioDay(tomorrow) };
}

/**
 * Milliseconds until just after the studio's day rolls over — the moment the
 * live window has to move along by a day for an iPad that was left open.
 * The extra second keeps the timer from firing a hair before midnight and
 * re-anchoring on the day that is about to end.
 */
export function msUntilNextStudioDay(now: Date): number {
  return Math.max(1000, endOfStudioDay(now).getTime() + 1000 - now.getTime());
}

/**
 * The caption under the calendar's Refresh control. Plain words, rounded
 * down, so "Updated 3 min ago" reads as a fact rather than a countdown.
 */
export function freshnessLabel(
  lastFetchedAt: number | null,
  now: number,
): string {
  if (lastFetchedAt === null) return "Not loaded yet";
  const ageMs = Math.max(0, now - lastFetchedAt);
  if (ageMs < 60_000) return "Updated just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} h ago`;
}
