/**
 * A per-person request limit for the web service — the pure half of the
 * Gemini routes' guard (server/gemini-routes.ts).
 *
 * Round: Gemini route lock-down (Sep 24 2026). Two limits, both per caller:
 *   - IN FLIGHT: at most `maxInFlight` requests running at once. The importer
 *     sends one page at a time, so one is all it needs; two leaves room for a
 *     second tab. This is the one that protects memory: Render runs the web
 *     service as a single small process, and each request holds its images
 *     until the model answers.
 *   - PER WINDOW: at most `maxPerWindow` requests started in any `windowMs`.
 *     This is the one that protects the Gemini quota.
 *
 * Kept in memory. That is enough because the web service is one process
 * (WEB_CONCURRENCY=1); a restart forgets the counts, which only ever errs
 * toward letting someone in. One entry per person who has called, so the
 * maps stay as small as the staff list.
 */

export interface RequestLimitOptions {
  maxInFlight: number;
  maxPerWindow: number;
  windowMs: number;
}

/**
 * One flat shape rather than a union: this project compiles without
 * strictNullChecks, where `if (!d.ok)` does not narrow a union.
 */
export interface RequestLimitDecision {
  ok: boolean;
  /** Call once the request is over. Safe to call more than once. A no-op when refused. */
  release: () => void;
  /** 0 when allowed; otherwise when to try again, for a Retry-After header. */
  retryAfterSeconds: number;
  /** Empty when allowed; otherwise the sentence the app shows. */
  error: string;
}

export interface RequestLimiter {
  acquire(key: string): RequestLimitDecision;
}

const noop = () => {};

export function createRequestLimiter(
  options: RequestLimitOptions,
  now: () => number = Date.now,
): RequestLimiter {
  const { maxInFlight, maxPerWindow, windowMs } = options;
  const started = new Map<string, number[]>();
  const running = new Map<string, number>();

  return {
    acquire(key: string): RequestLimitDecision {
      const t = now();
      const recent = (started.get(key) ?? []).filter((at) => at > t - windowMs);

      if ((running.get(key) ?? 0) >= maxInFlight) {
        if (recent.length) started.set(key, recent);
        else started.delete(key);
        return {
          ok: false,
          release: noop,
          retryAfterSeconds: 30,
          error: "A chart is already being read for you. Wait for it to finish, then try again.",
        };
      }

      if (recent.length >= maxPerWindow) {
        started.set(key, recent);
        const waitMs = recent[0] + windowMs - t;
        const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
        const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
        return {
          ok: false,
          release: noop,
          retryAfterSeconds,
          error: `That's a lot of chart pages in a short time. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        };
      }

      recent.push(t);
      started.set(key, recent);
      running.set(key, (running.get(key) ?? 0) + 1);

      let released = false;
      return {
        ok: true,
        retryAfterSeconds: 0,
        error: "",
        release: () => {
          if (released) return;
          released = true;
          const left = (running.get(key) ?? 1) - 1;
          if (left > 0) running.set(key, left);
          else running.delete(key);
        },
      };
    },
  };
}
