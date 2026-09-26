/**
 * WHEN TO WAIT, WHEN TO RETRY, AND WHEN TO STOP ASKING.
 *
 * The decision half of the floor under every Mindbody call. The server holds
 * the mutable state and does the sleeping (`server/mindbody-client.ts`); this
 * module decides, and it is pure so the decisions can be tested without a
 * network, a clock or a server.
 *
 * WHY IT EXISTS (Sep 22 2026). `mindbodyGet` did one fetch and, on failure,
 * logged a warning and returned. At a trainer's pace that is survivable. Beta
 * needs about 1,500 calls to onboard one 300-client studio, and there one 429
 * in the middle loses a client's data in silence - the worst shape a failure
 * can have. See docs/rounds/2026-09-22-mindbody-sync-plan.md.
 *
 * Every number here is deliberately conservative, because the repo has never
 * known Mindbody's real rate limit - only the BILLING threshold of 1,000 calls
 * a day. Raise them once somebody reads the developer portal.
 *
 * PURE MODULE - no network, no timers, no Firestore. `now` is always passed in.
 */

/** However long Retry-After asks for, we never wait longer than this. */
export const RETRY_CAP_MS = 10_000;
/** First retry waits about this; it doubles from there, with jitter. */
export const RETRY_BASE_MS = 500;

/**
 * Worth trying again, or a real answer?
 *
 * 429 is the whole point. 408 and 5xx are Mindbody or the network having a
 * moment. Everything else - 400, 401, 403, 404 - will say exactly the same
 * thing next time, and retrying one only spends money and a trainer's patience.
 */
export function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Mindbody's own instruction, in seconds or as an HTTP date.
 *
 * Capped at RETRY_CAP_MS: a header saying "come back in an hour" must not hang
 * a request a trainer is standing over. Null when there is no usable header,
 * and the caller falls back to its own backoff.
 */
export function retryAfterMs(header: string | null | undefined, now: number): number | null {
  if (!header) return null;
  const raw = String(header).trim();
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, RETRY_CAP_MS);
  const when = Date.parse(raw);
  if (!Number.isNaN(when)) return Math.min(Math.max(0, when - now), RETRY_CAP_MS);
  return null;
}

/**
 * Exponential, with FULL JITTER.
 *
 * The jitter is not decoration: the renewals job runs four pulls at once and
 * each pull fires four calls together, so without it sixteen calls would all
 * fail together, all wait exactly 500ms, and all retry together - a small
 * thundering herd aimed at an API that has just told us to slow down.
 *
 * @param attempt 1 for the first retry, 2 for the second, and so on.
 * @param rand    0..1, injected so the test is not random.
 */
export function backoffMs(attempt: number, rand: number): number {
  const n = Math.max(1, Math.trunc(attempt));
  const base = RETRY_BASE_MS * Math.pow(2, n - 1);
  const r = Number.isFinite(rand) ? Math.min(1, Math.max(0, rand)) : 1;
  return Math.min(RETRY_CAP_MS, Math.round(base * (0.5 + r * 0.5)));
}

/* ------------------------------------------------------------------ *
 * The token bucket
 * ------------------------------------------------------------------ */

export interface BucketState {
  /** Whole and fractional permits available. */
  tokens: number;
  /** When `tokens` was last brought up to date. */
  refilledAt: number;
}

export interface BucketLimits {
  /** Steady-state requests a second. */
  perSecond: number;
  /** How many may go at once after a quiet spell. One Master Sync is five. */
  burst: number;
}

export function newBucket(limits: BucketLimits, now: number): BucketState {
  return { tokens: limits.burst, refilledAt: now };
}

/**
 * Try to take one permit.
 *
 * `waitMs` of 0 means go now and `state` has the permit deducted. Anything
 * else is how long to sleep before asking again - the caller loops, because
 * sleeping is not this module's job.
 */
export function takeFromBucket(
  state: BucketState,
  limits: BucketLimits,
  now: number,
): { state: BucketState; waitMs: number } {
  const perSecond = limits.perSecond > 0 ? limits.perSecond : 1;
  const burst = limits.burst > 0 ? limits.burst : 1;
  const elapsed = Math.max(0, now - state.refilledAt);
  const tokens = Math.min(burst, state.tokens + (elapsed / 1000) * perSecond);
  if (tokens >= 1) return { state: { tokens: tokens - 1, refilledAt: now }, waitMs: 0 };
  return {
    state: { tokens, refilledAt: now },
    waitMs: Math.ceil(((1 - tokens) / perSecond) * 1000),
  };
}

/* ------------------------------------------------------------------ *
 * The circuit breaker, one per site
 * ------------------------------------------------------------------ */

export interface BreakerState {
  /** Failures since the last success. */
  fails: number;
  /** While `now` is below this, calls fail fast without being sent. */
  openUntil: number;
}

export interface BreakerLimits {
  /** Consecutive failures before the site goes quiet. */
  fails: number;
  /** How long it stays quiet. */
  cooldownMs: number;
}

export const NEW_BREAKER: BreakerState = { fails: 0, openUntil: 0 };

/** 0 when calls may go. Otherwise the milliseconds left on the cooldown. */
export function breakerPausedMs(state: BreakerState, now: number): number {
  return state.openUntil > now ? state.openUntil - now : 0;
}

/**
 * Fold one result in.
 *
 * A success clears everything: the run of failures is what matters, not the
 * total. Reaching the limit opens the breaker and resets the count, so the one
 * call let through after the cooldown re-opens it on its own if the site is
 * still broken - a half-open probe, without a third state to get wrong.
 */
export function recordResult(
  state: BreakerState,
  ok: boolean,
  limits: BreakerLimits,
  now: number,
): BreakerState {
  if (ok) return { fails: 0, openUntil: 0 };
  const fails = state.fails + 1;
  if (fails >= limits.fails) return { fails: 0, openUntil: now + limits.cooldownMs };
  return { fails, openUntil: state.openUntil };
}

/* ------------------------------------------------------------------ *
 * How long to keep a staff sign-in (the cost plan, Sep 26 2026, A4)
 * ------------------------------------------------------------------ *
 *
 * The server threw its Mindbody token away 55 minutes after issuing it, on
 * the belief that tokens die at 60. Mindbody's own answer to `usertoken/issue`
 * carries an `Expires` time, and its documentation has the token lasting days
 * when unused, so the sign-in was repeated ~17 times a site a day for nothing
 * - and if Mindbody counts a sign-in as a call, those were billed.
 *
 * So the token is kept until a little before the time Mindbody gave, never
 * longer than a day. Nothing here has to be right about the true lifetime:
 * the server also signs in again the moment Mindbody refuses a token (a 401),
 * so a time read too generously costs one refused call, and one read too
 * meanly costs one extra sign-in. An `Expires` Journey cannot read, or one
 * that is already past (a time zone read the wrong way round), falls back to
 * the old 55 minutes.
 */

/** The old rule, kept for an answer with no usable `Expires`. */
export const TOKEN_FALLBACK_MS = 55 * 60_000;
/** However long Mindbody says, a token is signed for afresh at least daily. */
export const TOKEN_MAX_KEEP_MS = 24 * 60 * 60_000;
/** Stop using a token this long before Mindbody says it expires. */
export const TOKEN_SAFETY_MS = 5 * 60_000;

/** The instant to stop using a token issued at `now`. */
export function tokenKeepUntil(expires: unknown, now: number): number {
  const at =
    typeof expires === "string" && expires.trim() !== ""
      ? Date.parse(expires)
      : typeof expires === "number"
        ? expires
        : NaN;
  if (!Number.isFinite(at)) return now + TOKEN_FALLBACK_MS;
  const keep = at - TOKEN_SAFETY_MS;
  if (keep <= now) return now + TOKEN_FALLBACK_MS;
  return Math.min(keep, now + TOKEN_MAX_KEEP_MS);
}
