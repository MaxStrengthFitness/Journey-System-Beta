/**
 * When should this device pull the Mindbody schedule?
 *
 * WHY THIS IS A MODULE AND NOT AN INTERVAL
 *
 * `Studio.autoSyncEnabled` and `Studio.syncIntervalMinutes` have been
 * settable from Integrations since the round that added them, and nothing has
 * ever read them — there is no scheduler. Every sync in the app today is a
 * human pressing Refresh.
 *
 * The naive fix (setInterval every 15 minutes) is worse than nothing at this
 * network's size. A sync WRITES: 432 appointments in a busy pull. Run it per
 * device and a studio with six iPads on the floor does the same write six
 * times over. Sixty studios, several devices each, four times an hour, around
 * the clock — that is the shape of the Aug 30 quota storm, rebuilt on purpose.
 *
 * So the policy is:
 *
 *   1. The lease is SHARED, not per-device. `lastSyncAt` lives on the studio
 *      document, so all six iPads see the same clock and only one of them
 *      does the work. The caller claims it in a transaction; this module only
 *      decides whether a claim is worth attempting.
 *   2. A hidden tab never syncs. An iPad left on the counter overnight would
 *      otherwise run 96 syncs before anyone came back, and nobody is looking
 *      at the result.
 *   3. Failures back off exponentially. A studio with a wrong Site ID must not
 *      retry every fifteen minutes forever; it should fail four times, go
 *      quiet, and wait for someone to fix the configuration.
 *   4. Nothing is attempted when the studio is not configured for it, because
 *      the request cannot succeed and the error only trains people to ignore
 *      errors.
 *
 * Pure so the decision table is testable without a browser, a clock, or
 * Firestore.
 */

import { studioDateKey, zonedHM } from "../../lib/studio-time";
import { shiftHoursOf } from "../relay/board/now-context";

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 240;
/**
 * Thirty minutes since the cost plan (AJ, Sep 26 2026): a change to today or
 * tomorrow has to reach the iPads within about half an hour, and the webhook
 * brings most of them in seconds, so the pull is the guarantee rather than
 * the messenger. A studio's own `syncIntervalMinutes` still wins.
 */
export const DEFAULT_INTERVAL_MINUTES = 30;

/** Stop backing off here. Four hours is "someone has to look at this". */
export const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000;

/** Failures beyond this add no further delay. */
const MAX_BACKOFF_DOUBLINGS = 4;

export interface SyncContext {
  now: number;
  /** Studio.autoSyncEnabled — defaults to on. */
  enabled: boolean;
  /** Studio.syncIntervalMinutes. */
  intervalMinutes?: number | null;
  /**
   * Studio.lastScheduleSyncAt — shared by every device at this studio.
   * Null means it has never synced.
   */
  lastSyncAt?: number | null;
  /** Studio.scheduleSyncFailures — consecutive, reset on success. */
  failures?: number | null;
  /** A sync started by this device is still running. */
  inFlight: boolean;
  /** The tab is on screen. */
  visible: boolean;
  online: boolean;
  /**
   * The studio is inside its pull hours (see `withinPullHours`). Optional so
   * a caller that does not know the studio's day keeps today's behaviour.
   */
  withinPullHours?: boolean;
  /**
   * Site id present, and a location id too when the site is shared with
   * another studio. Exactly the check the manual Refresh button makes before
   * it will run.
   */
  configured: boolean;
}

export type SkipReason =
  | "disabled"
  | "not-configured"
  | "offline"
  | "hidden"
  | "in-flight"
  | "after-hours"
  | "not-due";

export type SyncVerdict =
  | { run: true; reason: "never-synced" | "due" }
  | { run: false; reason: SkipReason; retryInMs: number | null };

/**
 * Keeps a hand-typed interval inside something survivable. One minute would
 * be a self-inflicted denial of service; a day is not a sync.
 */
export function normaliseInterval(minutes?: number | null): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return Math.min(
    MAX_INTERVAL_MINUTES,
    Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)),
  );
}

/** The gap to wait before the next attempt, failures included. */
export function intervalWithBackoff(
  intervalMinutes?: number | null,
  failures?: number | null,
): number {
  const base = normaliseInterval(intervalMinutes) * 60_000;
  const n = Math.max(0, Math.min(MAX_BACKOFF_DOUBLINGS, failures ?? 0));
  return Math.min(MAX_BACKOFF_MS, base * 2 ** n);
}

/** When the next sync becomes due. Null when it has never run. */
export function nextDueAt(ctx: SyncContext): number | null {
  if (ctx.lastSyncAt == null) return null;
  return ctx.lastSyncAt + intervalWithBackoff(ctx.intervalMinutes, ctx.failures);
}

export function decideSync(ctx: SyncContext): SyncVerdict {
  // Order matters: the reasons a sync will never succeed come before the
  // reasons it is merely not due, so the caller can stop polling entirely
  // rather than waking up every minute to be told the same thing.
  if (!ctx.enabled) return { run: false, reason: "disabled", retryInMs: null };
  if (!ctx.configured)
    return { run: false, reason: "not-configured", retryInMs: null };
  if (ctx.inFlight)
    return { run: false, reason: "in-flight", retryInMs: null };
  if (!ctx.online) return { run: false, reason: "offline", retryInMs: null };

  // Hidden is deliberately AFTER the permanent reasons and before the clock:
  // a tab that comes back after four hours should sync immediately, so the
  // caller re-runs this on visibilitychange rather than waiting for a timer.
  if (!ctx.visible) return { run: false, reason: "hidden", retryInMs: null };

  // A front-desk computer left showing Journey overnight used to pull every
  // fifteen minutes until morning, for a schedule nobody was reading. The
  // Refresh button is never gated by this; only the background pull is.
  if (ctx.withinPullHours === false)
    return { run: false, reason: "after-hours", retryInMs: null };

  const due = nextDueAt(ctx);
  if (due == null) return { run: true, reason: "never-synced" };
  if (ctx.now >= due) return { run: true, reason: "due" };

  return { run: false, reason: "not-due", retryInMs: due - ctx.now };
}

/**
 * Did another device already do this? Called inside the claim transaction
 * with whatever the studio document says right now, which may be newer than
 * what the local snapshot said when decideSync last ran.
 */
export function claimIsStillDue(
  freshLastSyncAt: number | null | undefined,
  ctx: Pick<SyncContext, "now" | "intervalMinutes" | "failures">,
): boolean {
  if (freshLastSyncAt == null) return true;
  return (
    ctx.now >=
    freshLastSyncAt + intervalWithBackoff(ctx.intervalMinutes, ctx.failures)
  );
}

/* ------------------------------------------------------------------ *
 * THE LEAN PULL (Sep 25 2026)
 *
 * Every background pull used to ask Mindbody for the next 31 days and look
 * up every client in them again, fifteen minutes after the last one asked
 * the same thing. At ~12 calls a pull and ~50 pulls a day that was ~600
 * Mindbody calls a studio a day, nine tenths of Journey's running cost at 50
 * studios (the Atlas, Sep 25). AJ's brief: far cheaper, without a trainer
 * missing a same-day cancellation, and Refresh always there to be sure.
 *
 * So the interval pull now asks only for today and tomorrow — the days the
 * Hub watches live — and the whole month is asked for once a day, at the
 * first pull of the studio's day (the cost plan, Sep 26: AJ ranked days 3–30
 * as "once each morning"; it was four times a day, at the first pull after
 * each of 0:00, 10:00, 14:00 and 18:00). Which one a pull is follows from one
 * field every iPad
 * shares, `Studio.lastDeepScheduleSyncAt`: when the last whole-month pull
 * that SUCCEEDED was claimed. A pull whose last good month pull fell in an
 * earlier block of the studio's day reaches the whole month.
 *
 * Why its own field and not the lease (the review of phase 1, Sep 25): the
 * lease is stamped at every claim, so a pull that finished just past 10:00,
 * or a month pull cut off by a closed tab, made the block look done when it
 * was not, and the month waited four more hours.
 * ------------------------------------------------------------------ */

/**
 * Studio-local hours at which the next pull reaches the whole month: only the
 * day's first pull, before the studio opens (block 0 starts at midnight and
 * the pull hours an hour before opening). A booking made for two or more days
 * out therefore shows at once by the webhook, the next morning without it,
 * or at once on Refresh for anything in the next week; today and tomorrow
 * are pulled every interval. Adding an hour here adds a month pull a day.
 */
export const DEEP_PULL_HOURS: readonly number[] = [0];

/** Which block of the studio's day an instant falls in, as "YYYY-MM-DD#n". */
export function deepPullBlock(ms: number, timeZone: string): string | null {
  const day = studioDateKey(new Date(ms), timeZone);
  const hm = zonedHM(new Date(ms), timeZone);
  if (!day || !hm) return null;
  let block = 0;
  DEEP_PULL_HOURS.forEach((h, i) => {
    if (hm.hour >= h) block = i;
  });
  return `${day}#${block}`;
}

/**
 * Should the pull about to run reach the whole month?
 *
 * Yes when no whole-month pull has ever succeeded, or when the last one that
 * did was claimed in an earlier block of the studio's day. A failed or
 * unfinished month pull never stamps `lastDeepAt`, so the next pull simply
 * tries again (after the usual backoff); a failed NEAR pull does not turn
 * into a month pull, which would only add load while Mindbody is refusing.
 */
export function wantsDeepPull(
  lastDeepAt: number | null | undefined,
  now: number,
  timeZone: string,
): boolean {
  if (lastDeepAt == null) return true;
  const was = deepPullBlock(lastDeepAt, timeZone);
  const is = deepPullBlock(now, timeZone);
  if (!was || !is) return true;
  return was !== is;
}

/**
 * Is this the day's FIRST whole-month pull? That one looks every client up
 * with Mindbody, which is what keeps names and blank contact fields current;
 * the later month pulls of the day skip clients Journey already names, as
 * the near pulls do. A name changed in Mindbody therefore reaches a booking
 * by the next morning, sooner through the webhook's client.updated or a
 * Master Sync on the profile.
 */
export function isFirstDeepOfDay(
  lastDeepAt: number | null | undefined,
  now: number,
  timeZone: string,
): boolean {
  if (lastDeepAt == null) return true;
  const was = studioDateKey(new Date(lastDeepAt), timeZone);
  const is = studioDateKey(new Date(now), timeZone);
  return !was || !is || was !== is;
}

/** How far before opening and after closing the background pull still runs. */
export const PULL_HOURS_MARGIN_MINUTES = 60;

/**
 * Is the studio inside its pull hours: from an hour before it opens to an hour
 * after it closes, by the shift hours a leader set (Team → Standards), or
 * 5:30 am to 8 pm when none are set. Refresh ignores this; it is only the
 * background pull that stops.
 */
export function withinPullHours(
  now: number,
  timeZone: string,
  shiftHours?: Parameters<typeof shiftHoursOf>[0],
): boolean {
  const hm = zonedHM(new Date(now), timeZone);
  if (!hm) return true;
  const hours = shiftHoursOf(shiftHours);
  const nowMin = hm.hour * 60 + hm.minute;
  return (
    nowMin >= hours.open - PULL_HOURS_MARGIN_MINUTES &&
    nowMin <= hours.close + PULL_HOURS_MARGIN_MINUTES
  );
}
