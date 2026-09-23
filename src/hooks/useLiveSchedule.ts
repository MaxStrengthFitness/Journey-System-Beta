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
  SCHEDULE_STALE_MS,
  WEEK_AHEAD_DAYS,
  dayKeysBetween,
  liveWindow,
  mergeSchedules,
  msUntilNextStudioDay,
  rangeToFetch,
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
 *            read in the last 15 minutes costs nothing. The week ahead
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
        }
        setLastFetchedAt(fetchedAt);
        setCacheVersion((v) => v + 1);
      } catch (error) {
        // The cache is deliberately kept: a failed read means "unknown", never
        // "there are no bookings that week".
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
    // skip — and the week would actually refresh every 30 minutes.
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
  }, [ensureRange, isReady]);

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
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "schedules");
      },
    );

    // Re-anchor the window when the studio's day rolls over.
    const dayTimer = setTimeout(() => {
      if (!cancelled) setDayTick((t) => t + 1);
    }, msUntilNextStudioDay(now));

    return () => {
      cancelled = true;
      clearTimeout(dayTimer);
      unsubscribeSchedules();
    };
  }, [activeStudioId, isReady, dayTick]);

  return { schedules, ensureRange, refresh, lastFetchedAt, isFetching };
}
