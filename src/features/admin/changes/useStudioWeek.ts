/**
 * THE WEEK, AS THE SERVER ANSWERED IT — the week's schedule read the way
 * Operations may say things from it.
 *
 * Openings round, Sep 27 2026, then lifted out of the Overview for the
 * redesign's Operations room (Sep 28 2026), so Today, Week and anything
 * else that counts the week's bookings read them ONE way.
 *
 * `useWeekSchedule` with `{ confirmed: true }` (today and six days,
 * cancellations included, moves joined), held to the server: an answer only
 * this iPad's cache gave is no week, so nothing is said from it. While it
 * waits the week is "loading"; once the iPad is offline, or the server has
 * not answered in SERVER_WAIT_MS, it is a week that could not be read, said,
 * never counted as zero (standing-week/server-read.ts).
 *
 * `readAt` is when the server's answer last arrived, for the freshness line
 * ("Schedule read 7:45 AM"). It is the listener's own moment, never a guess.
 */
import { useEffect, useMemo, useState } from "react";
import type { ScheduleEntry } from "../../../types";
import { serverRead, type ServerRead } from "../../standing-week/server-read";
import { useServerWait } from "../../standing-week/useServerWait";
import { useWeekSchedule } from "./useWeekSchedule";

export interface StudioWeek {
  /** The week's rows once the server answered; none while it hasn't. */
  entries: ScheduleEntry[];
  loading: boolean;
  /** Could not be read (failed, offline, or the server never answered). */
  failed: boolean;
  /** The server-read state behind loading and failed. */
  read: ServerRead;
  /** Epoch ms the server's latest answer arrived, or null before one has. */
  readAt: number | null;
}

const NO_ENTRIES: ScheduleEntry[] = [];

export function useStudioWeek(studioId: string | null, today: string, tz?: string): StudioWeek {
  const live = useWeekSchedule(studioId, today, tz, { confirmed: true });
  const wait = useServerWait(live.loading || live.fromCache);
  const read = serverRead({ loading: live.loading, failed: live.failed, fromCache: live.fromCache, ...wait });
  const [readAt, setReadAt] = useState<number | null>(null);
  useEffect(() => {
    if (read === "ready") setReadAt(Date.now());
  }, [read, live.entries]);
  return useMemo(
    () => ({
      entries: read === "ready" ? live.entries : NO_ENTRIES,
      loading: read === "loading",
      failed: read === "failed" || read === "offline",
      read,
      readAt: read === "ready" ? readAt : null,
    }),
    [read, live.entries, readAt],
  );
}
