import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Heart } from "lucide-react";
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
import { useRelayMaybe } from "./RelayContext";
import { hasKudosFrom, kudosCount, toggleKudos } from "./kudos";

/**
 * THE NOW BAR — pinned under the masthead on every Relay tab.
 *
 * Round: Relay, Sep 2026. Three things, left to right: where we are in the
 * day (the shift phase), what is next for THIS trainer and how long they have
 * (the gap meter), and what teammates did ("Just now"). Tapping the middle
 * unfolds the day strip: the trainer's sessions as a ribbon with the gaps
 * drawn as empty slots, so at 1:00 you can see that the 2:40 gap is the long
 * one today, and under the ribbon the same sessions as a list with each
 * client's whole name and time (the ribbon has room for a first name only).
 *
 * In portrait (under 900px) the teammates line takes a row of its own under
 * the other two, because it carries the only kudos button in the app: it
 * was hidden there until Sep 27 2026.
 *
 * "Just now" was labelled "Pulse" until Sep 27 2026. Pulse is the living
 * assessment on every other screen, so the word named two things; the code
 * names (pulse.ts, PulseTicker) stay.
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
    now.current ? "rnb__meter--busy" : now.gapMinutes !== null && now.gapMinutes < 10 ? "rnb__meter--tight" : "";

  return (
    <>
      <div className="rnb" role="region" aria-label="Right now">
        <div className="rnb__where">
          <span className={cn("rnb__phase", `rnb__phase--${now.phase}`)}>
            <span className="rnb__phase-dot" aria-hidden />
            {PHASE_LABEL[now.phase]}
          </span>
          {closedRings > 0 && (
            <span className="rnb__rings" aria-label={`${closedRings} of 3 shift rings closed`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("rnb__ring-dot", i < closedRings && "rnb__ring-dot--closed")} />
              ))}
            </span>
          )}
          <div className="rnb__next">
            <span className="rnb__next-label">{now.current ? "Now" : "Next"}</span>
            <span className="rnb__next-who">
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
          className="rnb__gap"
          aria-expanded={open}
          aria-controls="relay-daystrip"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="rnb__gap-line">
            <span>{gapSentence(now)}</span>
            <span className="rnb__gap-sub">
              {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </span>
          </span>
          <span className={cn("rnb__meter", meterClass)} aria-hidden>
            <span className="rnb__meter-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </span>
        </button>

        <div className="rnb__pulse">
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

/* ------------------------------------------------------------------ *
 * Just now: what teammates did (PulseTicker; labelled "Pulse" until
 * Sep 27 2026)
 * ------------------------------------------------------------------ */

const TICK_MS = 6000;

export function PulseTicker({ studioId }: { studioId: string | null }) {
  const events = usePulse(studioId);
  const relay = useRelayMaybe();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (events.length < 2 || paused) return;
    const id = setInterval(() => setI((v) => v + 1), TICK_MS);
    return () => clearInterval(id);
  }, [events.length, paused]);
  const ev: PulseEvent | undefined = events.length ? events[i % events.length] : undefined;
  const me = relay?.uid ? { id: relay.uid, name: relay.authTrainer?.fullName ?? "A trainer" } : null;
  const mine = Boolean(ev && me && ev.whoId === me.id);
  const thanked = hasKudosFrom(ev?.kudos, me?.id ?? null);

  const thank = async () => {
    if (!ev?.target || !me || !studioId) return;
    try {
      await toggleKudos({ studioId, target: ev.target, from: me, to: ev.whoId ? { id: ev.whoId, name: ev.who } : null, on: !thanked, what: ev.what });
    } catch (err) {
      console.warn("[relay] kudos failed:", err);
    }
  };

  return (
    <div className="pt" aria-live="off" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <span className="pt__label">Just now</span>
      {ev ? (
        <>
          <span className="pt__line" key={ev.id}>
            <span className="pt__who">{ev.who}</span> {ev.what}
          </span>
          {ev.target && me && !mine && (
            <button
              type="button"
              className={cn("pt__kudos", thanked && "pt__kudos--on")}
              aria-pressed={thanked}
              aria-label={thanked ? "Take back your kudos" : `Send kudos to ${ev.who}`}
              onClick={() => void thank()}
            >
              <Heart size={13} aria-hidden />
              {kudosCount(ev.kudos) > 0 && <span className="pt__kudos-n">{kudosCount(ev.kudos)}</span>}
            </button>
          )}
          {ev.target && mine && kudosCount(ev.kudos) > 0 && (
            <span className="pt__kudos pt__kudos--mine" aria-label={`${kudosCount(ev.kudos)} kudos for you`}>
              <Heart size={13} aria-hidden /> <span className="pt__kudos-n">{kudosCount(ev.kudos)}</span>
            </span>
          )}
        </>
      ) : (
        <span className="pt__line pt__quiet">Quiet so far today</span>
      )}
    </div>
  );
}
