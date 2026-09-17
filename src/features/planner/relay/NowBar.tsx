import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ScheduleEntry, Trainer } from "../../../types";
import { studioTodayKey } from "../../../lib/studio-time";
import {
  PHASE_LABEL,
  gapFraction,
  gapSentence,
  minutesToClock,
  mySessionsToday,
  nowContext,
  shiftHoursOf,
  studioMinutesNow,
  type NowContext,
  type ShiftHours,
} from "./now-context";
import { usePulse, type PulseEvent } from "./pulse";

/**
 * THE NOW BAR — pinned under the masthead on every Relay tab.
 *
 * Round: Relay, Sep 2026. Three things, left to right: where we are in the
 * day (the shift phase), what is next for THIS trainer and how long they have
 * (the gap meter), and what teammates did (the Pulse). Tapping the middle
 * unfolds the day strip: the trainer's sessions as a ribbon with the gaps
 * drawn as empty slots, so at 1:00 you can see that the 2:40 gap is the long
 * one today.
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

export interface NowBarProps {
  now: NowContext;
  studioId: string | null;
  /** Rings the shift has closed today (ShiftRings publishes them). */
  closedRings?: number;
}

export function NowBar({ now, studioId, closedRings = 0 }: NowBarProps) {
  const [open, setOpen] = useState(false);
  const fraction = gapFraction(now.gapMinutes);
  const meterClass =
    now.current ? "nb__meter--busy" : now.gapMinutes !== null && now.gapMinutes < 10 ? "nb__meter--tight" : "";

  return (
    <>
      <div className="nb" role="region" aria-label="Right now">
        <div className="nb__where">
          <span className={cn("nb__phase", `nb__phase--${now.phase}`)}>
            <span className="nb__phase-dot" aria-hidden />
            {PHASE_LABEL[now.phase]}
          </span>
          {closedRings > 0 && (
            <span className="nb__rings" aria-label={`${closedRings} of 3 shift rings closed`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("nb__ring-dot", i < closedRings && "nb__ring-dot--closed")} />
              ))}
            </span>
          )}
          <div className="nb__next">
            <span className="nb__next-label">{now.current ? "Now" : "Next"}</span>
            <span className="nb__next-who">
              {now.current
                ? `${now.current.clientName} · until ${minutesToClock(now.current.endMin)}`
                : now.next
                  ? `${now.next.clientName} · ${minutesToClock(now.next.startMin)}`
                  : now.total
                    ? `${now.done} of ${now.total} sessions done`
                    : "No sessions on your schedule"}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="nb__gap"
          aria-expanded={open}
          aria-controls="relay-daystrip"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nb__gap-line">
            <span>{gapSentence(now)}</span>
            <span className="nb__gap-sub">
              {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </span>
          </span>
          <span className={cn("nb__meter", meterClass)} aria-hidden>
            <span className="nb__meter-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        </button>

        <div className="nb__pulse">
          <PulseTicker studioId={studioId} />
        </div>
      </div>
      {open && <DayStrip now={now} />}
    </>
  );
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
        <div className="ds__ribbon" role="img" aria-label={`${now.sessions.length} sessions today`}>
          {now.sessions.map((s) => (
            <span
              key={s.id}
              className={cn(
                "ds__block",
                s.endMin <= now.nowMin && "ds__block--done",
                s === now.current && "ds__block--now",
              )}
              style={{ left: pct(s.startMin), width: `calc(${pct(s.endMin)} - ${pct(s.startMin)})` }}
              title={`${s.clientName} · ${minutesToClock(s.startMin)}`}
            >
              {s.clientName.split(" ")[0]}
            </span>
          ))}
          <span className="ds__now" style={{ left: pct(now.nowMin) }} aria-hidden />
        </div>
      )}
      <div className="ds__hours" aria-hidden>
        <span>{minutesToClock(hours.open)}</span>
        <span>{minutesToClock(hours.mid)}</span>
        <span>{minutesToClock(hours.closing)}</span>
        <span>{minutesToClock(hours.close)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The Pulse ticker
 * ------------------------------------------------------------------ */

const TICK_MS = 6000;

export function PulseTicker({ studioId }: { studioId: string | null }) {
  const events = usePulse(studioId);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (events.length < 2) return;
    const id = setInterval(() => setI((v) => v + 1), TICK_MS);
    return () => clearInterval(id);
  }, [events.length]);
  const ev: PulseEvent | undefined = events.length ? events[i % events.length] : undefined;
  return (
    <div className="pt" aria-live="off">
      <span className="pt__label">Pulse</span>
      {ev ? (
        <span className="pt__line" key={ev.id}>
          <span className="pt__who">{ev.who}</span> {ev.what}
        </span>
      ) : (
        <span className="pt__line pt__quiet">Quiet so far today</span>
      )}
    </div>
  );
}
