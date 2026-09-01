import { useState, useEffect, useRef } from "react";
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
 */
const ROSTER_DAYS_AHEAD = 8;

/** Hard ceiling on client documents fetched in one pass (~n/10 reads). */
const ROSTER_CLIENT_CAP = 400;

export function useLiveSchedule(activeStudioId: string | null, isReady: boolean) {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [liveRosterClients, setLiveRosterClients] = useState<Client[]>([]);

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

  useEffect(() => {
    if (!isReady) return;

    // A studio switch must not reuse the previous studio's roster key.
    lastFetchedKeyRef.current = "";
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

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const scheduleConstraints: QueryConstraint[] = [
      where("startTime", ">=", Timestamp.fromDate(twentyFourHoursAgo)),
      where("startTime", "<=", Timestamp.fromDate(thirtyDaysAhead)),
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
        latestSchedulesRef.current = activeSchedulesData;
        setSchedules(activeSchedulesData);
        void refreshRoster();
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "schedules");
      },
    );

    return () => {
      cancelled = true;
      clearRetry();
      unsubscribeSchedules();
    };
  }, [activeStudioId, isReady]);

  return { schedules, liveRosterClients };
}
