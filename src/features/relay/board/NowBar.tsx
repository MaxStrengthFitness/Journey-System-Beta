import { useEffect, useMemo, useState } from "react";
import { cn } from "../../../lib/utils";
import type { ScheduleEntry, Trainer } from "../../../types";
import { studioTodayKey } from "../../../lib/studio-time";
import {
  minutesToClock,
  mySessionsToday,
  nowContext,
  shiftHoursOf,
  studioMinutesNow,
  type NowContext,
  type ShiftHours,
} from "./now-context";

/**
 * THE CLOCK AND THE DAY STRIP — what was the Now Bar.
 *
 * Round: Relay, Sep 2026. The Now Bar sat under the masthead on every Relay
 * tab: the shift phase, what is next for THIS trainer and how long they have
 * (the gap meter), and a ticker of what teammates did.
 *
 * THE ONE HEADER (Relay room, Sep 28 2026, the redesign's phase 1) took it
 * apart. The shift, the minutes free and the next session are in My Studio's
 * header (my-studio/StudioHeader), and a tap there still unfolds the day
 * strip below it: the trainer's sessions as a ribbon with the gaps drawn as
 * empty slots, so at 1:00 you can see that the 2:40 gap is the long one
 * today, and under the ribbon the same sessions as a list with each client's
 * whole name and time (the ribbon has room for a first name only). The
 * teammates' ticker ("Just now", labelled "Pulse" until Sep 27 2026) is a
 * still list on the Floor (JustNow.tsx), with the kudos hearts.
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

/* ------------------------------------------------------------------ *
 * The day strip
 * ------------------------------------------------------------------ */

export function DayStrip({ now }: { now: NowContext }) {
  const hours: ShiftHours = now.hours;
  const span = Math.max(60, hours.close - hours.open);
  const pct = (min: number) => `${Math.max(0, Math.min(100, ((min - hours.open) / span) * 100))}%`;
  return (
    <div className="ds" id="relay-daystrip">
      {now.sessions.length === 0 ? (
        <p className="ds__empty">Nothing on your schedule today. The whole day is a gap.</p>
      ) : (
        <div className="ds__ribbon" aria-hidden>
          {now.sessions.map((s) => (
            <span
              key={s.id}
              className={cn(
                "ds__block",
                s.endMin <= now.nowMin && "ds__block--done",
                s === now.current && "ds__block--now",
              )}
              style={{ left: pct(s.startMin), width: `calc(${pct(s.endMin)} - ${pct(s.startMin)})` }}
            >
              {s.clientName.split(" ")[0]}
            </span>
          ))}
          <span className="ds__now" style={{ left: pct(now.nowMin) }} />
        </div>
      )}
      <div className="ds__hours" aria-hidden>
        <span>{minutesToClock(hours.open)}</span>
        <span>{minutesToClock(hours.mid)}</span>
        <span>{minutesToClock(hours.closing)}</span>
        <span>{minutesToClock(hours.close)}</span>
      </div>
      {/* The ribbon has room for a first name; the list says who and when in
          full. Until Sep 27 2026 the whole name and the time were only in a
          hover tooltip, which an iPad cannot show. A past session is dimmed,
          never called done: a booking is done when Journey logged it
          (lib/booking-state), and the strip does not know that. */}
      {now.sessions.length > 0 && (
        <ol className="ds__list" aria-label={`Your sessions today, ${now.sessions.length}`}>
          {now.sessions.map((s) => (
            <li
              key={s.id}
              className={cn(
                "ds__item",
                s.endMin <= now.nowMin && "ds__item--past",
                s === now.current && "ds__item--now",
              )}
            >
              <span className="ds__time">
                {minutesToClock(s.startMin)} to {minutesToClock(s.endMin)}
              </span>
              <span className="ds__name">{s.clientName}</span>
              {s === now.current && <span className="ds__tag">Now</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
