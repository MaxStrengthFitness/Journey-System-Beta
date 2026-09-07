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

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 240;
export const DEFAULT_INTERVAL_MINUTES = 15;

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
