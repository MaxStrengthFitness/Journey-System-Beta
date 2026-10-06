import { useEffect, useState } from "react";

/**
 * THE DAY'S BOOKINGS BEFORE THE CLIENT LIST (the iPad round, Oct 6 2026).
 *
 * The perf lab found the Hub's day waiting behind the studio roster on every
 * open: the roster listener and the day's bookings share one stream, and the
 * roster was 300 client documents the Firestore SDK took seconds to take in on
 * a 10th-gen iPad or a mini (and more on an older one), so the Hub's day was
 * first drawn 5.5 to 7 s after the trainer record was ready.
 *
 * This holds the roster listener until the Hub's day has answered (ready or
 * failed, from the cache or the server), or `maxWaitMs` has passed, whichever
 * is first. Once open for a studio it stays open: a day rolling over or a
 * listener retrying never closes it. A new studio waits again.
 *
 * Nothing is hidden by the wait: the roster says "loading" meanwhile, and the
 * Hub's cards already say a client's facts are loading rather than missing.
 */
export const ROSTER_HEAD_START_MS = 3000;

/**
 * Whether the roster may start without waiting on the day (the review, Oct 6
 * 2026): the head start is for the Hub drawing its day. On any other screen
 * (a resumed session, the Directory) the roster is what the screen needs, and
 * offline the day's bookings may never leave "loading" while the iPad's cache
 * could answer the roster at once. So it waits only on the Hub, online, while
 * the day is still loading.
 */
export function rosterNeedNotWait(opts: { onHub: boolean; online: boolean; dayLoading: boolean }): boolean {
  return !opts.onHub || !opts.online || !opts.dayLoading;
}

export function useRosterHeadStart(
  studioId: string | null | undefined,
  dayAnswered: boolean,
  maxWaitMs: number = ROSTER_HEAD_START_MS,
): boolean {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = !!studioId && (openFor === studioId || dayAnswered);

  useEffect(() => {
    if (!studioId || openFor === studioId) return;
    if (dayAnswered) {
      setOpenFor(studioId);
      return;
    }
    const t = setTimeout(() => setOpenFor(studioId), maxWaitMs);
    return () => clearTimeout(t);
  }, [studioId, dayAnswered, openFor, maxWaitMs]);

  return open;
}
