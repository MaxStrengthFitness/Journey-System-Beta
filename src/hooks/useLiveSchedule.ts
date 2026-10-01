import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import { ScheduleEntry } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { startOfStudioDay, endOfStudioDay } from "../lib/studio-time";
import {
  FETCH_RETRY_MS,
  SCHEDULE_STALE_MS,
  WEEK_AHEAD_DAYS,
  dayKeysBetween,
  dayReadState,
  liveWindow,
  mergeSchedules,
  msUntilNextStudioDay,
  rangeToFetch,
  retryDelayMs,
  type DayReadState,
} from "../lib/schedule-window";

/**
 * The studio's bookings: a small LIVE window plus a FETCHED cache.
 *
 * Round: cost clean-up, Sep 2026. This hook used to keep one `onSnapshot` on
 * every booking from 24 hours ago to 30 days ahead. The pull-sync rewrites
 * `lastSyncAt` on every booking it touches, so each sync billed all of those
 * documents to every open device — and the calendar could never show a week
 * outside that window because the listener was its only source.
 *
 * Now:
 *
 *   LIVE     yesterday · today · tomorrow (`liveWindow`). Still a listener,
 *            because today must be right the moment Mindbody changes and a
 *            listener is the cheapest way to get that. It re-anchors itself
 *            at the studio's midnight for an iPad left open overnight.
 *   FETCHED  everything else, through `ensureRange`. One `getDocs` per range,
 *            cached by document id, with per-day coverage so a range already
 *            read in the last hour costs nothing. The week ahead
 *            (`WEEK_AHEAD_DAYS`) is fetched on mount and again every
 *            `SCHEDULE_STALE_MS` while the tab is visible, which keeps the
 *            Hub's day tabs, the Operations week load and the trainer's
 *            "upcoming" list fresh with no listener. The calendar asks for
 *            whatever range it is showing; `refresh()` forces the week.
 *
 * `schedules` is the MERGE of the two (`mergeSchedules`: live wins by id,
 * cancelled dropped, sorted by start) — the same list every consumer already
 * received, so nothing downstream had to change.
 *
 * CLIENTS ARE NOT HERE ANY MORE (hub sync fixes, Sep 16 2026). This hook used
 * to fetch the client documents its bookings named. That roster dropped
 * re-reads that arrived while one was running (so a studio switch often
 * never loaded the new studio's clients) and never noticed a client document
 * created after its first read. `useStudioRoster` owns the roster now; see
 * `src/lib/studio-roster.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The always-fresh range: start of yesterday to the end of the week ahead. */
function weekAheadRange(): { from: Date; to: Date } {
  return {
    from: new Date(startOfStudioDay().getTime() - DAY_MS),
    to: endOfStudioDay(new Date(Date.now() + WEEK_AHEAD_DAYS * DAY_MS)),
  };
}

export function useLiveSchedule(activeStudioId: string | null, isReady: boolean) {
  /** What the listener currently holds: the three live days. */
  const [liveSchedules, setLiveSchedules] = useState<ScheduleEntry[]>([]);

  /**
   * The fetched cache. Refs rather than state because a range fetch stores
   * hundreds of documents and the only thing that has to re-render is the
   * merged list — `cacheVersion` is bumped once per landed fetch for that.
   */
  const cacheRef = useRef<Map<string, ScheduleEntry>>(new Map());
  /** dayKey → when that day was last fetched (ms). */
  const coverageRef = useRef<Map<string, number>>(new Map());
  /** Ranges being read right now, so two screens asking at once cost one query. */
  const inFlightRangesRef = useRef<Set<string>>(new Set());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const isFetching = fetchCount > 0;

  /**
   * Bumped just after the studio's midnight so the live listener re-anchors
   * on the new today. Without it an iPad left open overnight keeps watching
   * yesterday's three days and this morning's changes never arrive live.
   */
  const [dayTick, setDayTick] = useState(0);

  /*
   * WHAT IS KNOWN (hub fixes, Oct 1 2026). A failed read is unknown, never
   * empty: the Hub drew a quiet day when the listener failed. `liveState` is
   * the listener's (it is opened again on the roster's rhythm after a
   * failure); `failedDaysRef` holds the fetched days whose last read failed,
   * asked for again after FETCH_RETRY_MS. `dayState(key)` is the answer a
   * screen reads (schedule-window.ts, dayReadState).
   */
  const [liveState, setLiveState] = useState<DayReadState>("loading");
  const liveFailuresRef = useRef(0);
  const [liveRetry, setLiveRetry] = useState(0);
  const failedDaysRef = useRef<Map<string, number>>(new Map());
  const [fetchFailedAt, setFetchFailedAt] = useState<number | null>(null);
  const [fetchRetry, setFetchRetry] = useState(0);

  /* ---------------- the merged list ---------------- */

  const schedules = useMemo(
    // cacheVersion is the signal that the ref's contents changed.
    () => mergeSchedules(liveSchedules, [...cacheRef.current.values()]),
    [liveSchedules, cacheVersion],
  );

  /* ---------------- studio switch ---------------- */

  /**
   * Declared FIRST so it runs before the fetch effects below on the same
   * commit: a range read captures the cache map it should land in, and a
   * reset that ran after it would make the very first fetch look stale.
   */
  useEffect(() => {
    if (!isReady) return;
    // A studio switch must not show the previous studio's bookings — neither
    // the fetched ones nor the live days — while the new ones load.
    setLiveSchedules([]);
    cacheRef.current = new Map();
    coverageRef.current = new Map();
    inFlightRangesRef.current = new Set();
    failedDaysRef.current = new Map();
    liveFailuresRef.current = 0;
    setLiveState("loading");
    setFetchFailedAt(null);
    setCacheVersion((v) => v + 1);
  }, [activeStudioId, isReady]);

  /* ---------------- range fetching ---------------- */

  const ensureRange = useCallback(
    async (from: Date, to: Date, force = false): Promise<void> => {
      if (!isReady) return;
      /*
       * No studio means ask for nothing, not ask for everything.
       *
       * The studio constraint below used to be added only `if
       * (studioAtRequest)`, so before a studio was chosen this read every
       * booking at every location in the range -- the whole company's
       * schedule, bounded only by dates. `useSessions` hit the identical bug
       * and its fix is the precedent: the honest behaviour is to wait until
       * we know where we are.
       */
      if (!activeStudioId) return;
      // The listener owns the three live days: they are always fresh, and
      // rangeToFetch trims them off the front of the week-ahead request so
      // an app open does not read them twice.
      const now = Date.now();
      const live = liveWindow(new Date(now));
      for (const key of dayKeysBetween(live.from, live.to)) coverageRef.current.set(key, now);
      const wanted = force
        ? { from: startOfStudioDay(from), to: endOfStudioDay(to) }
        : rangeToFetch(coverageRef.current, from, to, now, SCHEDULE_STALE_MS);
      if (!wanted) return;

      const rangeKey = `${activeStudioId ?? "*"}|${wanted.from.getTime()}|${wanted.to.getTime()}`;
      if (inFlightRangesRef.current.has(rangeKey)) return;
      inFlightRangesRef.current.add(rangeKey);
      setFetchCount((n) => n + 1);

      // The studio at the time of asking. If it changes before the read lands,
      // the result belongs to the old studio and must not enter the new cache.
      const studioAtRequest = activeStudioId;
      const cacheAtRequest = cacheRef.current;

      try {
        const constraints: QueryConstraint[] = [
          where("startTime", ">=", Timestamp.fromDate(wanted.from)),
          where("startTime", "<=", Timestamp.fromDate(wanted.to)),
          orderBy("startTime", "asc"),
        ];
        // STRICT FILTERING BY ACTIVE STUDIO. Unconditional: the guard at the
        // top of this callback already refused the no-studio case.
        constraints.push(where("studioId", "==", studioAtRequest));
        const snap = await getDocs(query(collection(db, "schedules"), ...constraints));

        // A studio switch swaps the cache map; a stale result is dropped.
        if (cacheRef.current !== cacheAtRequest) return;

        const fetchedAt = Date.now();
        for (const doc of snap.docs) {
          cacheRef.current.set(doc.id, { id: doc.id, ...doc.data() } as ScheduleEntry);
        }
        for (const key of dayKeysBetween(wanted.from, wanted.to)) {
          coverageRef.current.set(key, fetchedAt);
          failedDaysRef.current.delete(key);
        }
        if (failedDaysRef.current.size === 0) setFetchFailedAt(null);
        setLastFetchedAt(fetchedAt);
        setCacheVersion((v) => v + 1);
      } catch (error) {
        // The cache is deliberately kept: a failed read means "unknown", never
        // "there are no bookings that week". The days it covered say so
        // (dayState: "failed") until a read of them lands, and they are asked
        // for again shortly (hub fixes, Oct 1 2026).
        if (cacheRef.current === cacheAtRequest) {
          const failedAt = Date.now();
          for (const key of dayKeysBetween(wanted.from, wanted.to)) failedDaysRef.current.set(key, failedAt);
          setFetchFailedAt(failedAt);
          setCacheVersion((v) => v + 1);
        }
        handleFirestoreError(error, OperationType.GET, "schedules");
      } finally {
        inFlightRangesRef.current.delete(rangeKey);
        setFetchCount((n) => Math.max(0, n - 1));
      }
    },
    [activeStudioId, isReady],
  );

  /** The manual Refresh: re-reads the week ahead whether or not it is fresh. */
  const refresh = useCallback((): void => {
    const { from, to } = weekAheadRange();
    void ensureRange(from, to, true);
  }, [ensureRange]);

  /**
   * Keeps the week ahead fresh: once on mount / studio change, then every
   * SCHEDULE_STALE_MS while the tab is visible, and again the moment it
   * becomes visible after being hidden (an iPad woken from sleep). A hidden
   * tab reads nothing — nobody is looking.
   */
  useEffect(() => {
    if (!isReady) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const { from, to } = weekAheadRange();
      void ensureRange(from, to);
    };

    tick();
    // A few seconds past the stale mark, not exactly on it: the read the first
    // tick starts lands a moment AFTER the interval begins counting, so a tick
    // exactly SCHEDULE_STALE_MS later would still find every day fresh and
    // skip — and the week would actually refresh at twice the interval.
    const interval = setInterval(tick, SCHEDULE_STALE_MS + 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    // fetchRetry: a failed week read is asked for again (below).
  }, [ensureRange, isReady, fetchRetry]);

  /** A failed range read is tried again after FETCH_RETRY_MS (the tick above skips a hidden screen). */
  useEffect(() => {
    if (fetchFailedAt === null) return;
    const t = setTimeout(() => setFetchRetry((n) => n + 1), FETCH_RETRY_MS);
    return () => clearTimeout(t);
  }, [fetchFailedAt]);

  /* ---------------- the live window ---------------- */

  useEffect(() => {
    if (!isReady) return;
    // Same rule as ensureRange above: with no studio this listener would
    // stream three days of EVERY location's bookings rather than one
    // studio's. Hold nothing until we know where we are.
    if (!activeStudioId) {
      setLiveSchedules([]);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // The three live days, anchored to the studio's day at the time this
    // effect runs; `dayTick` re-runs it just after the studio's midnight.
    const now = new Date();
    const live = liveWindow(now);

    const scheduleConstraints: QueryConstraint[] = [
      where("startTime", ">=", Timestamp.fromDate(live.from)),
      where("startTime", "<=", Timestamp.fromDate(live.to)),
      orderBy("startTime", "asc"),
    ];

    // STRICT FILTERING BY ACTIVE STUDIO. Unconditional: the guard at the top
    // of this effect already refused the no-studio case.
    scheduleConstraints.push(where("studioId", "==", activeStudioId));

    const unsubscribeSchedules = onSnapshot(
      query(collection(db, "schedules"), ...scheduleConstraints),
      (snap) => {
        if (cancelled) return;
        const schedulesData = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ScheduleEntry[];
        const activeSchedulesData = schedulesData.filter(
          (s) => s.status !== "Cancelled",
        );
        setLiveSchedules(activeSchedulesData);
        liveFailuresRef.current = 0;
        setLiveState("ready");
      },
      (error) => {
        if (cancelled) return;
        // Unknown, never empty: what the listener already delivered is kept,
        // the live days say "failed", and a listener that errored is closed
        // for good, so a new one is opened after a pause (hub fixes, Oct 1
        // 2026). Said once, not on every retry.
        setLiveState("failed");
        if (liveFailuresRef.current === 0) handleFirestoreError(error, OperationType.GET, "schedules");
        else console.warn("useLiveSchedule: the live listener failed again", error);
        const delay = retryDelayMs(liveFailuresRef.current);
        liveFailuresRef.current += 1;
        retryTimer = setTimeout(() => {
          if (!cancelled) setLiveRetry((t) => t + 1);
        }, delay);
      },
    );

    // Re-anchor the window when the studio's day rolls over.
    const dayTimer = setTimeout(() => {
      if (!cancelled) setDayTick((t) => t + 1);
    }, msUntilNextStudioDay(now));

    return () => {
      cancelled = true;
      clearTimeout(dayTimer);
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribeSchedules();
    };
  }, [activeStudioId, isReady, dayTick, liveRetry]);

  /**
   * What is known about one studio day's bookings: "ready", "loading" or
   * "failed" (schedule-window.ts, dayReadState). A screen that would say a
   * day is quiet asks this first.
   */
  const dayState = useCallback(
    (key: string): DayReadState => {
      const live = liveWindow(new Date());
      return dayReadState(key, {
        liveKeys: dayKeysBetween(live.from, live.to),
        liveState,
        failed: failedDaysRef.current,
        covered: coverageRef.current,
      });
    },
    // cacheVersion is the signal that the refs changed.
    [liveState, cacheVersion],
  );

  /** "Try again": opens the live listener again if it failed, and re-reads the week. */
  const retry = useCallback((): void => {
    if (liveState === "failed") {
      liveFailuresRef.current = 0;
      setLiveState("loading");
      setLiveRetry((t) => t + 1);
    }
    const { from, to } = weekAheadRange();
    void ensureRange(from, to, true);
  }, [liveState, ensureRange]);

  return { schedules, ensureRange, refresh, lastFetchedAt, isFetching, dayState, retry };
}
