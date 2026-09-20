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
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
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
}

export function useWeekSchedule(studioId: string | null, today: string, tz?: string): WeekSchedule {
  const [byStart, setByStart] = useState<{ rows: Map<string, ScheduleEntry>; loading: boolean; failed: boolean }>({ rows: new Map(), loading: true, failed: false });
  const [byMove, setByMove] = useState<{ rows: Map<string, ScheduleEntry>; loading: boolean; failed: boolean }>({ rows: new Map(), loading: true, failed: false });

  useEffect(() => {
    setByStart({ rows: new Map(), loading: Boolean(studioId && today), failed: false });
    setByMove({ rows: new Map(), loading: Boolean(studioId && today), failed: false });
    if (!studioId || !today) return;
    const lastDay = addDays(today, WEEK_DAYS - 1);
    const from = studioDayBoundsForKey(today, tz).start;
    const to = studioDayBoundsForKey(lastDay, tz).end;

    const toMap = (docs: Array<{ id: string; data: () => unknown }>) => {
      const next = new Map<string, ScheduleEntry>();
      docs.forEach((d) => next.set(d.id, { id: d.id, ...(d.data() as Omit<ScheduleEntry, "id">) }));
      return next;
    };

    const unsubStart = onSnapshot(
      query(
        collection(db, "schedules"),
        where("studioId", "==", studioId),
        where("startTime", ">=", Timestamp.fromDate(from)),
        where("startTime", "<=", Timestamp.fromDate(to)),
        orderBy("startTime", "asc"),
      ),
      (snap) => setByStart({ rows: toMap(snap.docs), loading: false, failed: false }),
      (err) => {
        handleFirestoreError(err, OperationType.GET, "schedules");
        setByStart({ rows: new Map(), loading: false, failed: true });
      },
    );
    const unsubMove = onSnapshot(
      query(collection(db, "schedules"), where("studioId", "==", studioId), where("movedFromDay", ">=", today), where("movedFromDay", "<=", lastDay)),
      (snap) => setByMove({ rows: toMap(snap.docs), loading: false, failed: false }),
      (err) => {
        handleFirestoreError(err, OperationType.GET, "schedules");
        setByMove({ rows: new Map(), loading: false, failed: true });
      },
    );
    return () => {
      unsubStart();
      unsubMove();
    };
  }, [studioId, today, tz]);

  const entries = useMemo(() => {
    const merged = new Map(byStart.rows);
    for (const [id, row] of byMove.rows) if (!merged.has(id)) merged.set(id, row);
    return [...merged.values()];
  }, [byStart.rows, byMove.rows]);

  return { entries, loading: byStart.loading || byMove.loading, failed: byStart.failed || byMove.failed };
}
