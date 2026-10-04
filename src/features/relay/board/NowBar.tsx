import { useEffect, useMemo, useState } from "react";
import type { ScheduleEntry, Trainer } from "../../../types";
import { studioTodayKey } from "../../../lib/studio-time";
import {
  mySessionsToday,
  nowContext,
  shiftHoursOf,
  studioMinutesNow,
  type NowContext,
} from "./now-context";

/**
 * THE CLOCK — what was the Now Bar.
 *
 * Round: Relay, Sep 2026. The Now Bar sat under the masthead on every Relay
 * tab: the shift phase, what is next for THIS trainer and how long they have
 * (the gap meter), and a ticker of what teammates did.
 *
 * THE ONE HEADER (Relay room, Sep 28 2026, the redesign's phase 1) took it
 * apart, and the Relay Board rebuild (Oct 3 2026) took the rest: the time
 * button and the day strip it unfolded went with the calm header (AJ:
 * "Drop both"; "I need cover" is a tile in Ask). The clock stays: the Board
 * reads the shift phase from it, and the Ask sheet its next sessions. The
 * teammates' ticker ("Just now", labelled "Pulse" until Sep 27 2026) is a
 * still list on the Board (JustNow.tsx), with the kudos hearts.
 *
 * It reads the schedule rows the Calendar already loads and ticks once a
 * minute. Nothing here fetches.
 */

/** The clock, recomputed each minute from the rows AppContent already holds. */
export function useNowContext(
  schedules: ScheduleEntry[],
  trainer: Trainer | null | undefined,
  hoursRaw: Parameters<typeof shiftHoursOf>[0],
): NowContext {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const hours = useMemo(() => shiftHoursOf(hoursRaw), [hoursRaw]);
  return useMemo(() => {
    const now = new Date(tick);
    const todayKey = studioTodayKey(now);
    const mine = mySessionsToday(schedules, trainer, todayKey);
    return nowContext(mine, studioMinutesNow(now), todayKey, hours);
  }, [schedules, trainer, hours, tick]);
}
