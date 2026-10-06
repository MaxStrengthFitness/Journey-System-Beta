/**
 * FETCH THE SESSION'S SCREENS EARLY (new-version round, Sep 26 2026; AJ's
 * call: "Yes, fetch them early").
 *
 * A screen fetched once stays in this page's memory for as long as the page
 * lives, whatever is deployed after it. So once Journey has opened and gone
 * quiet, it fetches the files a session cannot do without, the Active
 * Session and Pulse, one after the other. A deploy later in the day can then
 * never stop a session from opening or Pulse from appearing on this iPad.
 * Since the speed round (Oct 5 2026, R13) it also fetches the client profile,
 * the screen opened most after the Hub, so its first open after a cold start
 * or a deploy no longer waits for its download.
 *
 * WHEN (the speed round, R13): at least WARM_UP_AFTER_MS after the shell is
 * up, so the Hub's own first reads go first, and then only when the browser
 * says it is idle (requestIdleCallback), with IDLE_TIMEOUT_MS as the latest
 * it waits. Each file after the first waits for another idle moment, so a
 * trainer's tap is never queued behind evaluating three screens in a row.
 * Where the browser has no requestIdleCallback (Safari on many iPads), a
 * short timer stands in for it.
 *
 * The files are cached for a year under names unique to their build, so this
 * is one download per new version, not per open. It is skipped while the iPad
 * says it is offline, and a fetch that fails is left alone: the screen will
 * try again when it is opened, and LoadBoundary is there if that fails too.
 *
 * PURE apart from the schedulers it is handed.
 */

/** Long enough for the Hub's own first reads to go first. */
export const WARM_UP_AFTER_MS = 4_000;

/** The longest it waits for an idle moment before it fetches anyway. */
export const IDLE_TIMEOUT_MS = 2_000;

/** Where there is no requestIdleCallback: a short pause instead. */
export const NO_IDLE_PAUSE_MS = 50;

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Run `run` at the browser's next idle moment (at most `timeout` ms away); returns a cancel. */
export function whenIdle(run: () => void, timeout = IDLE_TIMEOUT_MS, host: IdleWindow = globalThis as IdleWindow): () => void {
  if (typeof host.requestIdleCallback === "function") {
    const id = host.requestIdleCallback(run, { timeout });
    return () => host.cancelIdleCallback?.(id);
  }
  const timer = setTimeout(run, NO_IDLE_PAUSE_MS);
  return () => clearTimeout(timer);
}

/** The default start: WARM_UP_AFTER_MS, then the next idle moment. */
function afterQuietThenIdle(run: () => void): () => void {
  let cancelIdle: (() => void) | null = null;
  const timer = setTimeout(() => {
    cancelIdle = whenIdle(run);
  }, WARM_UP_AFTER_MS);
  return () => {
    clearTimeout(timer);
    cancelIdle?.();
  };
}

export function warmUp(
  loaders: ReadonlyArray<() => Promise<unknown>>,
  options: {
    after?: (run: () => void) => () => void;
    online?: () => boolean;
    /** Waited for between one file and the next (default: an idle moment). */
    between?: () => Promise<void>;
  } = {},
): () => void {
  const after = options.after ?? afterQuietThenIdle;
  const online = options.online ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const between = options.between ?? (() => new Promise<void>((resolve) => void whenIdle(resolve)));

  let cancelled = false;
  const cancelTimer = after(() => {
    if (cancelled || !online()) return;
    void (async () => {
      for (let i = 0; i < loaders.length; i++) {
        if (i > 0) await between();
        if (cancelled) return;
        try {
          await loaders[i]();
        } catch {
          /* the screen tries again when it is opened */
        }
      }
    })();
  });
  return () => {
    cancelled = true;
    cancelTimer();
  };
}
