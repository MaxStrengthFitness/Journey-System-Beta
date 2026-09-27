/**
 * THE WEEK'S SCHEDULE — today and the six days after it, cancellations
 * included, plus anything that was moved AWAY from one of those days.
 *
 * Operations overhaul, Sep 2026. The app's live schedule (hooks/
 * useLiveSchedule) drops cancelled rows before anyone sees them, which is
 * right for the calendar and wrong for the Changes list — so the Overview
 * reads its own window, live (a cancellation should appear on the desk the
 * minute the sync notices it). Two streams:
 *
 *   1. studioId + startTime in [start of today, end of today + 6] — the
 *      index the live schedule already uses;
 *   2. studioId + movedFromDay in [today, today + 6] — a booking moved out
 *      of the week to next month still belongs to the day it left (one new
 *      index, added with this round).
 *
 * Merged by document id. About a week of bookings per studio: small.
 *
 * WAITING FOR THE SERVER (an opt-in; standing week, voice review follow-up,
 * Sep 27 2026). Firestore here keeps a persistent local cache
 * (src/firebase.ts), so with no connection, or before the server has
 * answered, a listener is handed what this iPad last saw. By default that
 * snapshot is reported as a finished read, as the Overview has always read
 * it. `{ confirmed: true }` listens with `includeMetadataChanges` and says
 * `fromCache` while the latest answer of either stream came only from the
 * cache, so a caller that must never call a day "open" off a stale or empty
 * cache (My Studio -> Team's week check) can wait. Without
 * includeMetadataChanges a listener is never told when the server merely
 * CONFIRMS the rows the cache already held, so waiting for that would wait
 * forever: the option is what makes the wait end.
 *
 * NEVER A STALE FRAME. Each stream's state is stamped with the read it
 * belongs to (the studio, the day, the zone, the option). The render in which
 * any of them changes still holds the old state, since the effect that starts
 * the new read runs after it; the stamp no longer matches, so that render
 * reports "loading" with no rows. Before this, the first render after the week
 * check started reading (the studio arriving, or the studio's midnight) held
 * the idle state, "read, nothing booked", and painted every agreed slot as
 * open for a frame.
 */
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { studioDayBoundsForKey } from "../../../lib/studio-time";
import type { ScheduleEntry } from "../../../types";
import { addDays } from "../../client-history/model";

export const WEEK_DAYS = 7;

export interface WeekSchedule {
  entries: ScheduleEntry[];
  loading: boolean;
  failed: boolean;
  /**
   * Only with `{ confirmed: true }`: the latest answer of either stream came
   * from this iPad's cache alone, not yet confirmed by the server. Without
   * the option it is always false, as the Overview has always read it.
   */
  fromCache: boolean;
}

export interface WeekScheduleOptions {
  /** Listen for the server's confirmation and report `fromCache` (see the header). */
  confirmed?: boolean;
}

interface Stream {
  /** The read this state belongs to (readKey); "" for no read at all. */
  key: string;
  rows: Map<string, ScheduleEntry>;
  loading: boolean;
  failed: boolean;
  fromCache: boolean;
}

const NO_ENTRIES: ScheduleEntry[] = [];

/** Which read a stream's state belongs to; "" when there is nothing to read. */
function readKey(studioId: string | null, today: string, tz: string | undefined, confirmed: boolean): string {
  return studioId && today ? `${studioId}|${today}|${tz ?? ""}|${confirmed ? 1 : 0}` : "";
}

const fresh = (key: string): Stream => ({ key, rows: new Map(), loading: Boolean(key), failed: false, fromCache: false });

export function useWeekSchedule(studioId: string | null, today: string, tz?: string, options?: WeekScheduleOptions): WeekSchedule {
  const confirmed = options?.confirmed === true;
  const key = readKey(studioId, today, tz, confirmed);
  const [byStart, setByStart] = useState<Stream>(() => fresh(key));
  const [byMove, setByMove] = useState<Stream>(() => fresh(key));

  useEffect(() => {
    setByStart(fresh(key));
    setByMove(fresh(key));
    if (!studioId || !today) return;
    const lastDay = addDays(today, WEEK_DAYS - 1);
    const from = studioDayBoundsForKey(today, tz).start;
    const to = studioDayBoundsForKey(lastDay, tz).end;

    const toMap = (docs: Array<{ id: string; data: () => unknown }>) => {
      const next = new Map<string, ScheduleEntry>();
      docs.forEach((d) => next.set(d.id, { id: d.id, ...(d.data() as Omit<ScheduleEntry, "id">) }));
      return next;
    };
    type Snap = QuerySnapshot<DocumentData>;
    // Only the opt-in reads the cache flag: the Overview's read is as it was.
    const cacheOnly = (snap: Snap) => confirmed && snap.metadata?.fromCache === true;
    const listen = (q: Query<DocumentData>, set: (s: Stream) => void) => {
      const next = (snap: Snap) => set({ key, rows: toMap(snap.docs), loading: false, failed: false, fromCache: cacheOnly(snap) });
      const fail = (err: FirestoreError) => {
        handleFirestoreError(err, OperationType.GET, "schedules");
        set({ key, rows: new Map(), loading: false, failed: true, fromCache: false });
      };
      return confirmed ? onSnapshot(q, { includeMetadataChanges: true }, next, fail) : onSnapshot(q, next, fail);
    };

    const unsubStart = listen(
      query(
        collection(db, "schedules"),
        where("studioId", "==", studioId),
        where("startTime", ">=", Timestamp.fromDate(from)),
        where("startTime", "<=", Timestamp.fromDate(to)),
        orderBy("startTime", "asc"),
      ),
      setByStart,
    );
    const unsubMove = listen(
      query(collection(db, "schedules"), where("studioId", "==", studioId), where("movedFromDay", ">=", today), where("movedFromDay", "<=", lastDay)),
      setByMove,
    );
    return () => {
      unsubStart();
      unsubMove();
    };
  }, [key, studioId, today, tz, confirmed]);

  const entries = useMemo(() => {
    const merged = new Map(byStart.rows);
    for (const [id, row] of byMove.rows) if (!merged.has(id)) merged.set(id, row);
    return [...merged.values()];
  }, [byStart.rows, byMove.rows]);

  // State from an earlier read (the effect for this one hasn't run yet) is
  // reported as this read loading, never as its answer.
  const stale = byStart.key !== key || byMove.key !== key;
  return {
    entries: stale ? NO_ENTRIES : entries,
    loading: stale ? Boolean(key) : byStart.loading || byMove.loading,
    failed: !stale && (byStart.failed || byMove.failed),
    fromCache: !stale && (byStart.fromCache || byMove.fromCache),
  };
}
