/**
 * FETCH THE SESSION'S SCREENS EARLY (new-version round, Sep 26 2026; AJ's
 * call: "Yes, fetch them early").
 *
 * A screen fetched once stays in this page's memory for as long as the page
 * lives, whatever is deployed after it. So once Journey has opened and gone
 * quiet, it fetches the two files a session cannot do without, the Active
 * Session and Pulse, one after the other. A deploy later in the day can then
 * never stop a session from opening or Pulse from appearing on this iPad.
 *
 * The files are cached for a year under names unique to their build, so this
 * is one download per new version, not per open. It is skipped while the iPad
 * says it is offline, and a fetch that fails is left alone: the screen will
 * try again when it is opened, and LoadBoundary is there if that fails too.
 *
 * PURE apart from the scheduler it is handed.
 */

/** Long enough for the Hub's own first reads to go first. */
export const WARM_UP_AFTER_MS = 4_000;

export function warmUp(
  loaders: ReadonlyArray<() => Promise<unknown>>,
  options: {
    after?: (run: () => void) => () => void;
    online?: () => boolean;
  } = {},
): () => void {
  const after =
    options.after ??
    ((run: () => void) => {
      const timer = setTimeout(run, WARM_UP_AFTER_MS);
      return () => clearTimeout(timer);
    });
  const online = options.online ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);

  let cancelled = false;
  const cancelTimer = after(() => {
    if (cancelled || !online()) return;
    void (async () => {
      for (const load of loaders) {
        if (cancelled) return;
        try {
          await load();
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
