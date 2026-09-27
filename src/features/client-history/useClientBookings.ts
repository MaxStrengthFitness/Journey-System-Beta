import { useEffect, useState } from "react";
import { Timestamp, collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { ScheduleEntry } from "../../types";
import { isValidTimeZone, studioDayBoundsForKey } from "../../lib/studio-time";
import type { BookingsStatus } from "./bookings";
import type { DayKey } from "./model";

/**
 * HER BOOKINGS, FOR THE CALENDAR (Sep 26 2026).
 *
 * ONE read per opening of the tab: every `schedules` row for this client from
 * `fromDay` on, cancelled rows included (the calendar draws the ones Journey
 * saw happen), with no upper bound, soonest first. The composite index
 * (clientId, startTime) is already there — the renewals' live read and the
 * profile header ask the same shape — and any signed-in trainer may read
 * schedules. About 115 rows a client-year, so a getDocs, not a listener.
 *
 * `fromDay` is the Monday on or before the first day the calendar draws
 * (`bookingsReadFrom`, bookings.ts). A later first day (a session deleted)
 * reuses the answer already held; an earlier one ("Load full history") asks
 * again from there.
 *
 * A FAILED READ IS UNKNOWN, never "no bookings": status "error", no rows, and
 * the legend says so. An answer from the offline cache counts as failed — it
 * may hold a fraction of her bookings, or last week's version of them.
 *
 * ONE CLIENT AT A TIME. The profile does not remount this tab between
 * clients, so what is held names the client it was read for and is never
 * handed to another; a read that lands after the switch is dropped.
 */
export interface ClientBookings {
  status: BookingsStatus;
  /** Soonest first, cancelled rows included. Empty unless `status` is "ready". */
  rows: ScheduleEntry[];
}

interface Held {
  clientId: string;
  from: DayKey;
  status: "loading" | "ready" | "error";
  rows: ScheduleEntry[];
}

const NOTHING: ScheduleEntry[] = [];

export function useClientBookings(
  clientId: string | null | undefined,
  fromDay: DayKey | null,
  enabled = true,
  timeZone?: string,
): ClientBookings {
  const [held, setHeld] = useState<Held | null>(null);
  const mine = held && clientId && held.clientId === clientId ? held : null;
  // The answer already held reaches back at least as far as the calendar draws.
  const covered = Boolean(mine && mine.status === "ready" && fromDay && mine.from <= fromDay);

  useEffect(() => {
    if (!enabled || !clientId || !fromDay || covered) return;
    let live = true;
    setHeld({ clientId, from: fromDay, status: "loading", rows: NOTHING });
    const zone = isValidTimeZone(timeZone) ? timeZone : undefined;
    const { start } = studioDayBoundsForKey(fromDay, zone);
    getDocs(
      query(
        collection(db, "schedules"),
        where("clientId", "==", clientId),
        where("startTime", ">=", Timestamp.fromDate(start)),
        orderBy("startTime", "asc"),
      ),
    )
      .then((snap) => {
        if (!live) return;
        if (snap.metadata.fromCache) {
          setHeld({ clientId, from: fromDay, status: "error", rows: NOTHING });
          return;
        }
        setHeld({
          clientId,
          from: fromDay,
          status: "ready",
          rows: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ScheduleEntry),
        });
      })
      .catch((error) => {
        if (!live) return;
        // Quietly: the calendar's own line says the bookings did not load.
        console.warn("[history] bookings read failed", error);
        setHeld({ clientId, from: fromDay, status: "error", rows: NOTHING });
      });
    return () => {
      live = false;
    };
  }, [enabled, clientId, fromDay, covered, timeZone]);

  // Switched off mid-read (the profile backing off after a quota error): the
  // answer is dropped, so nothing is on its way — idle, not loading.
  if (!mine || (!enabled && mine.status === "loading")) {
    return { status: enabled && clientId && fromDay ? "loading" : "idle", rows: NOTHING };
  }
  return { status: mine.status, rows: mine.status === "ready" ? mine.rows : NOTHING };
}
