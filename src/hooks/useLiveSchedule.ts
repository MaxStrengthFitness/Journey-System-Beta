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
import { Client, ScheduleEntry } from "../types";
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
 */

/** Pause client fetching for this long after Firestore reports a quota error. */
const QUOTA_COOLDOWN_MS = 30_000;

/**
 * How far ahead the client roster reaches, in studio days.
 *
 * The hub's day tabs span the current week and the grid renders whichever tab
 * is selected — but this hook used to fetch client documents for TODAY only, so
 * every block on any other day had no client in the array and rendered
 * "Not synced" whether or not its document existed. AppContent builds its whole
 * `clients` list out of this roster, so the gap affected the entire app.
 *
 * Since the cost clean-up this is the same number as `WEEK_AHEAD_DAYS`: the
 * roster reaches exactly as far as the bookings the hook keeps fresh.
 */
const ROSTER_DAYS_AHEAD = WEEK_AHEAD_DAYS;

/** Hard ceiling on client documents fetched in one pass (~n/10 reads). */
const ROSTER_CLIENT_CAP = 400;

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
  const [liveRosterClients, setLiveRosterClients] = useState<Client[]>([]);

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

  /**
   * The client-id set we last fetched for. Schedule snapshots fire on every
   * write — and a 432-appointment sync produces a great many — but the roster
   * only changes when the SET of client ids changes. Without this, each
   * snapshot fired ceil(n/10) `in` queries and the browser quota was gone in
   * seconds.
   */
  const lastFetchedKeyRef = useRef<string>("");
  const quotaCooldownUntilRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  /** Latest schedules, so a retry timer can work without a new snapshot. */
  const latestSchedulesRef = useRef<ScheduleEntry[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The roster refresher for the current studio, so the effect that watches
   * the merged list can call it without being the effect that defines it.
   */
  const refreshRosterRef = useRef<() => Promise<void>>(async () => {});

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
    // A studio switch must not reuse the previous studio's roster key — nor
    // its fetched bookings, which carry the old studio's id.
    lastFetchedKeyRef.current = "";
    cacheRef.current = new Map();
    coverageRef.current = new Map();
    inFlightRangesRef.current = new Set();
    setCacheVersion((v) => v + 1);
  }, [activeStudioId, isReady]);

  /* ---------------- range fetching ---------------- */

  const ensureRange = useCallback(
    async (from: Date, to: Date, force = false): Promise<void> => {
      if (!isReady) return;
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
        // STRICT FILTERING BY ACTIVE STUDIO
        if (studioAtRequest) {
          constraints.push(where("studioId", "==", studioAtRequest));
        }
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

    let cancelled = false;

    const clearRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const scheduleRetry = (delayMs: number) => {
      clearRetry();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!cancelled) void refreshRoster();
      }, Math.max(500, delayMs));
    };

    /**
     * Fetches the client documents referenced by the currently loaded
     * schedules. Reads from a ref rather than closure state so that a retry
     * after a quota cooldown does not need a fresh snapshot to fire — writes
     * may well have stopped, and the grid would otherwise sit on an empty
     * roster indefinitely.
     *
     * The ref holds the MERGED list (live + fetched), so a block on any day
     * tab, not just the three live days, finds its client.
     */
    const refreshRoster = async () => {
      if (cancelled || inFlightRef.current) return;

      // The window covers yesterday through the end of the visible week, so
      // switching day tabs does not strand every block as "Not synced".
      const rosterStart = new Date(
        startOfStudioDay().getTime() - 24 * 60 * 60 * 1000,
      );
      const rosterEnd = endOfStudioDay(
        new Date(Date.now() + ROSTER_DAYS_AHEAD * 24 * 60 * 60 * 1000),
      );

      const rosterSchedules = latestSchedulesRef.current.filter((s) => {
        if (!s.startTime) return false;
        // Handle both Firestore Timestamp and JS Date/ISO string
        const d = s.startTime.toDate
          ? s.startTime.toDate()
          : new Date(s.startTime);
        return d >= rosterStart && d <= rosterEnd;
      });

      const allClientIds = Array.from(
        new Set(rosterSchedules.map((s) => s.clientId).filter(Boolean)),
      ) as string[];

      if (allClientIds.length === 0) {
        lastFetchedKeyRef.current = "";
        setLiveRosterClients([]);
        return;
      }

      // Capped so an unexpectedly large window cannot fire hundreds of reads.
      const clientIds = allClientIds.slice(0, ROSTER_CLIENT_CAP);
      if (allClientIds.length > ROSTER_CLIENT_CAP) {
        console.warn(
          `useLiveSchedule: ${allClientIds.length} clients in the roster window; fetching the first ${ROSTER_CLIENT_CAP}.`,
        );
      }

      // Same roster as last time? Nothing to re-read.
      const key = clientIds.slice().sort().join(",");
      if (key === lastFetchedKeyRef.current) return;

      if (Date.now() < quotaCooldownUntilRef.current) {
        // Still cooling off. Keep whatever roster we have rather than clearing
        // it — a stale name beats an empty grid — and come back on a timer.
        scheduleRetry(quotaCooldownUntilRef.current - Date.now() + 500);
        return;
      }

      inFlightRef.current = true;
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < clientIds.length; i += 10)
          chunks.push(clientIds.slice(i, i + 10));

        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(collection(db, "clients"), where("__name__", "in", chunk)),
            ),
          ),
        );
        if (cancelled) return;

        const fetchedClients = snapshots.flatMap((snap) =>
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Client),
        );

        lastFetchedKeyRef.current = key;
        setLiveRosterClients(fetchedClients);

        // NOTE: a "self-heal" step used to live here. It wrote
        // `clientId: null` onto any schedule whose client was not in
        // `fetchedClients`, so that a fuzzy auto-linker could re-resolve it.
        //
        // It was removed (Aug 2026) for three reasons:
        //   1. There is no fuzzy auto-linker any more. Under strict mode a
        //      schedule's clientId IS `clients/{mindbodyClientId}` — the only
        //      valid value — so there is nothing to re-resolve it to.
        //   2. It wrote from inside the snapshot handler, and each write
        //      re-triggered that listener: a write -> snapshot -> write loop
        //      that burned quota continuously.
        //   3. Worst of all, when the fetch above failed or came back short
        //      (exactly what happens under a 429), every schedule looked
        //      invalid and it erased perfectly good clientIds — turning a
        //      transient read failure into permanent data loss.
        //
        // A schedule pointing at a client document that does not exist yet is
        // now simply shown as "Not synced" until the next sync creates it.
      } catch (error: any) {
        const code = error?.code || "";
        if (
          code === "resource-exhausted" ||
          String(error?.message || "").includes("Quota exceeded")
        ) {
          quotaCooldownUntilRef.current = Date.now() + QUOTA_COOLDOWN_MS;
          console.warn(
            `useLiveSchedule: Firestore quota exceeded; pausing roster reads for ${
              QUOTA_COOLDOWN_MS / 1000
            }s. The grid keeps the roster it already has.`,
          );
          scheduleRetry(QUOTA_COOLDOWN_MS + 500);
        } else {
          handleFirestoreError(error, OperationType.GET, "clients");
        }
        // Deliberately NOT clearing liveRosterClients: a failed read must
        // never be allowed to look like "these clients do not exist".
      } finally {
        inFlightRef.current = false;
      }
    };

    refreshRosterRef.current = refreshRoster;

    // The three live days, anchored to the studio's day at the time this
    // effect runs; `dayTick` re-runs it just after the studio's midnight.
    const now = new Date();
    const live = liveWindow(now);

    const scheduleConstraints: QueryConstraint[] = [
      where("startTime", ">=", Timestamp.fromDate(live.from)),
      where("startTime", "<=", Timestamp.fromDate(live.to)),
      orderBy("startTime", "asc"),
    ];

    // STRICT FILTERING BY ACTIVE STUDIO
    if (activeStudioId) {
      scheduleConstraints.push(where("studioId", "==", activeStudioId));
    }

    const unsubscribeSchedules = onSnapshot(
      query(collection(db, "schedules"), ...scheduleConstraints),
      (snap) => {
        const schedulesData = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ScheduleEntry[];
        const activeSchedulesData = schedulesData.filter(
          (s) => s.status !== "Cancelled",
        );
        // The merged-list effect below updates latestSchedulesRef and calls
        // refreshRoster once this state lands.
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
      clearRetry();
      clearTimeout(dayTimer);
      unsubscribeSchedules();
      refreshRosterRef.current = async () => {};
    };
  }, [activeStudioId, isReady, dayTick]);

  /**
   * The roster follows the MERGED list: it must run after either the live
   * snapshot or a range fetch lands, and this one effect sees both. The
   * refresher it calls belongs to the current studio's listener effect, so a
   * cancelled effect's roster read is never triggered from here.
   */
  useEffect(() => {
    latestSchedulesRef.current = schedules;
    void refreshRosterRef.current();
  }, [schedules]);

  return { schedules, liveRosterClients, ensureRange, refresh, lastFetchedAt, isFetching };
}
