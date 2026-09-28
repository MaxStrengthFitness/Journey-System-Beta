import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { studioDayBoundsForKey } from "../../../lib/studio-time";
import type { ScheduleEntry } from "../../../types";
import { useWeekSchedule } from "../../admin/changes/useWeekSchedule";
import { useSyncLease } from "../../admin/sync-lease";
import { leaseOf } from "../../admin/syncPolicy";
import { isCacheOnly, serverRead, type ServerRead } from "../../standing-week/server-read";
import { useServerWait } from "../../standing-week/useServerWait";
import { BACK_FROM_DAYS, backFrom, backFromRange, clientBatches, monthReadToday, type BackFrom } from "../back-from";
import { addDays } from "../coverage";
import { nextDays, type NextDays, type NextDaysInput, type NextDaysLine } from "../next-days";
import { comingRange, type BookingsRead } from "../offer";
import type { OpeningsData } from "./useOpeningsData";

/**
 * THE LIVE READS OF OPENINGS (phase 5): the next 7 days, "booked again
 * from", whether the month was read in full today, and the coming weeks.
 * Each is made only by a part that shows it, and the Wrap-up's sheet reuses
 * them (ui/README.md).
 *
 *   the next 7 days    `useWeekSchedule(..., { confirmed: true })`, the read
 *                      Team makes: only the server's answer is one. Loading,
 *                      failed, offline, or answered only by this iPad's
 *                      cache, and `nextDays` lists nothing and says it can't
 *                      tell. A studio whose Mindbody isn't linked reads
 *                      nothing at all.
 *   booked again from  ONE read per 30 clients (`clientId in [...]`, the
 *                      existing (clientId, startTime) index) of the clients
 *                      the lines are about, from the day after the earliest
 *                      slot to today + 30. A cache's answer is "can't tell".
 *                      Read again only when the clients or the day change.
 *   the month          the sync lease's `lastDeepScheduleSyncAt` in today's
 *                      pull block (`monthReadToday`): null while the lease
 *                      is still coming.
 *   the coming weeks   days 7 to 27 of the studio's bookings (the existing
 *                      (studioId, startTime) index), read once when A new
 *                      regular time opens, and only when the month was read
 *                      in full today (otherwise they can't be checked, and
 *                      reading them would prove nothing).
 *
 * Nothing here asks Mindbody anything or writes anything.
 */

export interface NextSevenDays {
  /** Whether the week's bookings came back from the server. */
  read: ServerRead;
  /** Everything `nextDays` was given, for the Wrap-up's `timesWithRoom`. */
  input: NextDaysInput;
  next: NextDays;
  /** "Booked again from" for each line about one client, by `lineKey`. */
  backFrom: ReadonlyMap<string, BackFrom>;
  /** The month was read in full today; null until the sync lease is read. */
  monthRead: boolean | null;
}

export const lineKey = (line: Pick<NextDaysLine, "dateKey" | "row">) => `${line.dateKey}|${line.row}`;

/** Whether the month was read in full today, or null while the lease is still coming. */
export function useMonthRead(data: Pick<OpeningsData, "studio" | "studioId" | "connected" | "now" | "tz">, enabled = true): boolean | null {
  const lease = useSyncLease(enabled && data.connected ? data.studioId : null);
  if (!enabled || !data.connected) return false;
  if (lease === undefined) return null;
  return monthReadToday(leaseOf(lease, data.studio).lastDeepScheduleSyncAt, data.now.getTime(), data.tz);
}

export function useNextSevenDays(data: OpeningsData, options: { enabled?: boolean; bookedAgain?: boolean } = {}): NextSevenDays {
  const enabled = options.enabled !== false;
  const reading = enabled && data.connected && data.studioId ? data.studioId : null;
  const schedule = useWeekSchedule(reading, data.today, data.tz, { confirmed: true });
  const wait = useServerWait(Boolean(reading) && (schedule.loading || schedule.fromCache));
  const read = serverRead({ loading: schedule.loading, failed: schedule.failed, fromCache: schedule.fromCache, ...wait });
  const monthRead = useMonthRead(data, enabled);

  const input = useMemo<NextDaysInput>(
    () => ({
      today: data.today,
      now: data.now,
      tz: data.tz,
      read,
      connected: data.connected,
      bookings: schedule.entries,
      docs: data.weeks.docs,
      trainers: data.refs,
      staffIds: data.staffIds,
      worksHere: data.worksHere,
      usual: data.usual?.times ?? null,
      marks: data.marks.byTime,
    }),
    [data.today, data.now, data.tz, read, data.connected, schedule.entries, data.weeks.docs, data.refs, data.staffIds, data.worksHere, data.usual, data.marks.byTime],
  );
  const next = useMemo(() => nextDays(input), [input]);
  const backFromByLine = useBookedAgain(data, next, monthRead, enabled && options.bookedAgain !== false);
  return { read, input, next, backFrom: backFromByLine, monthRead };
}

interface Target {
  key: string;
  slotDay: string;
  clientId: string;
}

/** "Booked again from" for the lines about one client: one read per 30 of them. */
function useBookedAgain(data: OpeningsData, next: NextDays, monthRead: boolean | null, enabled: boolean): ReadonlyMap<string, BackFrom> {
  const targets = useMemo<Target[]>(
    () =>
      next.lines
        .filter((l) => l.clients.length === 1 && l.clients[0].clientId)
        .map((l) => ({ key: lineKey(l), slotDay: l.dateKey, clientId: l.clients[0].clientId as string })),
    [next.lines],
  );
  const batches = useMemo(() => clientBatches(targets.map((t) => t.clientId)), [targets]);
  const from = targets.reduce<string | null>((min, t) => {
    const f = backFromRange(t.slotDay, data.today).from;
    return !min || f < min ? f : min;
  }, null);
  const to = addDays(data.today, BACK_FROM_DAYS);
  const readKey = enabled && data.studioId && from && batches.length > 0 ? `${data.studioId}|${data.tz}|${from}|${to}|${batches.map((b) => b.join(",")).join(";")}` : "";

  const [rows, setRows] = useState<{ key: string; bookings: ScheduleEntry[] | null }>({ key: "", bookings: null });
  useEffect(() => {
    if (!readKey || !from) return;
    let live = true;
    const start = Timestamp.fromDate(studioDayBoundsForKey(from, data.tz).start);
    const end = Timestamp.fromDate(studioDayBoundsForKey(to, data.tz).end);
    Promise.all(
      batches.map((ids) =>
        getDocs(
          query(collection(db, "schedules"), where("clientId", "in", ids), where("startTime", ">=", start), where("startTime", "<=", end), orderBy("startTime", "asc")),
        ),
      ),
    )
      .then((snaps) => {
        if (!live) return;
        // Only the server's answer says when she is next in.
        if (snaps.some(isCacheOnly)) return setRows({ key: readKey, bookings: null });
        setRows({ key: readKey, bookings: snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as ScheduleEntry)) });
      })
      .catch((err) => {
        console.warn("[openings] booked again from couldn't be read:", err);
        if (live) setRows({ key: readKey, bookings: null });
      });
    return () => {
      live = false;
    };
    // The key carries the clients, the days and the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey]);

  return useMemo(() => {
    const out = new Map<string, BackFrom>();
    if (!enabled || !data.studioId) return out;
    const bookings = rows.key === readKey && monthRead !== null ? rows.bookings : null;
    for (const t of targets) {
      out.set(
        t.key,
        backFrom({ slotDay: t.slotDay, today: data.today, studioId: data.studioId, clientId: t.clientId, bookings, monthRead: monthRead === true, tz: data.tz }),
      );
    }
    return out;
  }, [enabled, data.studioId, data.today, data.tz, rows, readKey, targets, monthRead]);
}

/**
 * The coming weeks' bookings (days 7 to 27), for A new regular time: null
 * until asked for (`enabled`), "loading" while the read is out, and only the
 * server's answer is "ready".
 */
export function useComingWeeks(data: Pick<OpeningsData, "studioId" | "today" | "tz" | "connected">, enabled: boolean): BookingsRead | null {
  const readKey = enabled && data.connected && data.studioId ? `${data.studioId}|${data.today}|${data.tz}` : "";
  const [held, setHeld] = useState<{ key: string; value: BookingsRead }>({ key: "", value: { read: "loading", bookings: [] } });

  useEffect(() => {
    if (!readKey || !data.studioId) return;
    let live = true;
    const { from, to } = comingRange(data.today);
    getDocs(
      query(
        collection(db, "schedules"),
        where("studioId", "==", data.studioId),
        where("startTime", ">=", Timestamp.fromDate(studioDayBoundsForKey(from, data.tz).start)),
        where("startTime", "<=", Timestamp.fromDate(studioDayBoundsForKey(to, data.tz).end)),
        orderBy("startTime", "asc"),
      ),
    )
      .then((snap) => {
        if (!live) return;
        if (isCacheOnly(snap)) return setHeld({ key: readKey, value: { read: "offline", bookings: [] } });
        setHeld({ key: readKey, value: { read: "ready", bookings: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ScheduleEntry) } });
      })
      .catch((err) => {
        console.warn("[openings] the coming weeks couldn't be read:", err);
        if (live) setHeld({ key: readKey, value: { read: "failed", bookings: [] } });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey]);

  if (!readKey) return null;
  return held.key === readKey ? held.value : { read: "loading", bookings: [] };
}
