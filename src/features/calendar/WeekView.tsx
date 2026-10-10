import { memo, useMemo, useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import type { DayReadState } from "../../lib/schedule-window";
import { staffLabel } from "../hub-schedule/columns";
import { buildWeekAgenda, buildWeekSummary } from "./selectors";
import { toneClass } from "./trainer-tone";
import { TrainerAvatar } from "./TrainerAvatar";
import type { CalendarSession, DayBar, TrainerCount, TrainerRef, WeekAgendaDay, WeekSummary } from "./types";
import "./calendar.css";

/**
 * WEEK — the week's bookings, day by day (the rooms round, Oct 10 2026; AJ's
 * answer 3b on "Journey Rooms").
 *
 * The Week was a dashboard with no bookings in it: a total, bars, a trainer
 * leaderboard and a heat map. It now answers who is booked when:
 *
 *   1. THE STRIP   the seven days with each day's count, today an orange
 *                  ring, the picked day blue; a tap opens that Day.
 *   2. THE CHARTS  sessions per day, trainer load, when the studio is busy,
 *                  folded under the strip and closed until asked for.
 *   3. THE DAYS    each day's bookings by their start time, every one the
 *                  client's whole name and who it is with; yours on the
 *                  blue cast with "with you" in blue. A tap on a booking
 *                  opens the client; a tap on a day's head opens its Day.
 *                  In the week holding today, the days already over start
 *                  folded to their heads, so the week opens on today.
 *
 * A day whose bookings weren't read says so in place, never "Nobody booked".
 */

/* ---------------- the charts (folded) ---------------- */

function DeltaBadge({ total, previous }: { total: number; previous: number | null }) {
  // Null (not 0) when no prior week is loaded — a fresh page must not claim a
  // 100% collapse just because history has not been fetched.
  if (previous === null) {
    return <span className="cal-total__delta">No prior week loaded</span>;
  }
  const diff = total - previous;
  if (diff === 0) {
    return <span className="cal-total__delta">Level with last week</span>;
  }
  const up = diff > 0;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : null;
  return (
    <span className={`cal-total__delta ${up ? "cal-total__delta--up" : "cal-total__delta--down"}`}>
      {up ? <TrendingUp size={14} strokeWidth={2.6} aria-hidden /> : <TrendingDown size={14} strokeWidth={2.6} aria-hidden />}
      <b>
        {up ? "+" : ""}
        {diff}
      </b>
      {pct !== null && <>({up ? "+" : ""}{pct}%)</>} vs last week
    </span>
  );
}

const DayBarCell = memo(function DayBarCell({
  bar,
  max,
  onSelect,
}: {
  bar: DayBar;
  max: number;
  onSelect: (date: Date) => void;
}) {
  // Bars are scaled against the week's own busiest day, not a fixed ceiling,
  // so a quiet week still has shape instead of seven stubs.
  const pct = max > 0 ? Math.round((bar.count / max) * 100) : 0;
  return (
    <button
      type="button"
      className={`cal-bar ${bar.isToday ? "cal-bar--today" : ""}`}
      onClick={() => onSelect(bar.date)}
      aria-label={`${bar.date.toDateString()}, ${bar.count} sessions. Open day view.`}
    >
      <span className={`cal-bar__count ${bar.count === 0 ? "cal-bar__count--zero" : ""}`}>
        {bar.count || "—"}
      </span>
      <span className="cal-bar__track">
        {bar.count > 0 && (
          <span className="cal-bar__fill" style={{ height: `${Math.max(pct, 4)}%` }} />
        )}
      </span>
      <span className="cal-bar__day">{bar.label}</span>
      <span className="cal-bar__date">{bar.dayOfMonth}</span>
    </button>
  );
});

const BoardRow = memo(function BoardRow({
  entry,
  max,
  total,
}: {
  entry: TrainerCount;
  max: number;
  total: number;
}) {
  const pct = max > 0 ? Math.round((entry.count / max) * 100) : 0;
  const share = total > 0 ? Math.round((entry.count / total) * 100) : 0;
  return (
    <div className={`cal-board__row ${toneClass(entry.trainer.tone)}`}>
      <TrainerAvatar trainer={entry.trainer} size="sm" />
      <div className="cal-board__who">
        <div className="cal-board__name">{entry.trainer.name}</div>
        <div className="cal-board__track">
          <div className="cal-board__fill" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      </div>
      <div className="cal-board__nums">
        <div className="cal-board__count">{entry.count}</div>
        <div className="cal-board__share">{share}%</div>
      </div>
    </div>
  );
});

/** 0–5, so the ramp is a scale rather than a continuous wash. */
function heatStep(intensity: number, count: number): number {
  if (count === 0) return 0;
  if (intensity <= 0.2) return 1;
  if (intensity <= 0.4) return 2;
  if (intensity <= 0.6) return 3;
  if (intensity <= 0.8) return 4;
  return 5;
}

function Heatmap({ summary }: { summary: WeekSummary }) {
  return (
    <div className="cal-heat">
      <div className="cal-heat__corner" />
      {summary.days.map((d) => (
        <div key={d.key} className={`cal-heat__dow ${d.isToday ? "cal-heat__dow--today" : ""}`}>
          {d.label}
        </div>
      ))}
      {summary.bands.map((band, bi) => (
        <BandRow key={band.label} label={band.label} bandIndex={bi} summary={summary} />
      ))}
    </div>
  );
}

const BandRow = memo(function BandRow({
  label,
  bandIndex,
  summary,
}: {
  label: string;
  bandIndex: number;
  summary: WeekSummary;
}) {
  const cells = summary.heat.filter((h) => h.bandIndex === bandIndex);
  return (
    <>
      <div className="cal-heat__band">{label}</div>
      {cells.map((cell) => {
        const day = summary.days[cell.dayIndex];
        const step = heatStep(cell.intensity, cell.count);
        return (
          <div
            key={`${cell.dayIndex}-${cell.bandIndex}`}
            className="cal-heat__cell"
            data-step={step}
            aria-label={`${day.label} ${label}: ${cell.count} session${cell.count === 1 ? "" : "s"}`}
          >
            {cell.count || ""}
          </div>
        );
      })}
    </>
  );
});

/** The week's charts: how many, who carried it, when the studio is busy. */
function WeekCharts({ summary, onSelectDate }: { summary: WeekSummary; onSelectDate: (date: Date) => void }) {
  const maxDay = summary.days.reduce((m, d) => Math.max(m, d.count), 0);
  const maxTrainer = summary.byTrainer[0]?.count ?? 0;
  return (
    <div className="cal-charts">
      <div className="cal-week__top">
        <section className="cal-card cal-total">
          <span className="cal-total__value">{summary.total}</span>
          <span className="cal-total__label">{summary.total === 1 ? "Session" : "Sessions"} this week</span>
          <DeltaBadge total={summary.total} previous={summary.previousTotal} />
          {summary.busiestDay && (
            <span className="cal-card__note cal-total__busiest">
              Busiest: {summary.busiestDay.label} {summary.busiestDay.dayOfMonth} ({summary.busiestDay.count})
            </span>
          )}
        </section>

        <section className="cal-card">
          <header className="cal-card__head">
            <h3 className="cal-card__title">Sessions per day</h3>
          </header>
          <div className="cal-bars">
            {summary.days.map((bar) => (
              <DayBarCell key={bar.key} bar={bar} max={maxDay} onSelect={onSelectDate} />
            ))}
          </div>
        </section>
      </div>

      <div className="cal-week__lower">
        <section className="cal-card">
          <header className="cal-card__head">
            <h3 className="cal-card__title">Trainer load</h3>
            <span className="cal-card__note">{summary.byTrainer.length} active</span>
          </header>
          <div className="cal-card__body">
            {summary.byTrainer.length === 0 ? (
              <div className="cal-empty">
                <span className="cal-empty__title">No sessions</span>
                <span className="cal-empty__hint">Nothing is booked this week for the current filter.</span>
              </div>
            ) : (
              <div className="cal-board">
                {summary.byTrainer.map((entry) => (
                  <BoardRow key={entry.trainer.id} entry={entry} max={maxTrainer} total={summary.total} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="cal-card">
          <header className="cal-card__head">
            <h3 className="cal-card__title">When the studio is busy</h3>
            <span className="cal-legend">
              Quiet
              <span className="cal-legend__swatch" data-step="1" />
              <span className="cal-legend__swatch" data-step="3" />
              <span className="cal-legend__swatch" data-step="5" />
              Peak {summary.peak}
            </span>
          </header>
          <Heatmap summary={summary} />
        </section>
      </div>
    </div>
  );
}

/* ---------------- the bookings ---------------- */

const Booking = memo(function Booking({
  session,
  withWords,
  mine,
  onSelectClient,
}: {
  session: CalendarSession;
  withWords: string;
  mine: boolean;
  onSelectClient?: (clientId: string) => void;
}) {
  const opens = Boolean(session.clientId && onSelectClient);
  return (
    <li>
      <button
        type="button"
        className="cal-wbk"
        data-mine={mine ? "true" : undefined}
        disabled={!opens}
        onClick={() => {
          if (session.clientId && onSelectClient) onSelectClient(session.clientId);
        }}
      >
        <span className="cal-wbk__name">{session.clientName}</span>
        <span className="cal-wbk__with">{withWords}</span>
      </button>
    </li>
  );
});

const WeekDay = memo(function WeekDay({
  day,
  state,
  startFolded,
  withOf,
  selfId,
  onOpenDay,
  onSelectClient,
}: {
  day: WeekAgendaDay;
  state: DayReadState;
  /** A day of this week already over: folded to its head until asked for, so the week opens on today. */
  startFolded: boolean;
  withOf: (s: CalendarSession) => string;
  selfId: string | null;
  onOpenDay: (date: Date) => void;
  onSelectClient?: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(!startFolded);
  const quiet =
    day.count > 0
      ? null
      : state === "failed"
        ? { words: "Couldn’t read this day’s bookings.", unread: true }
        : state === "loading"
          ? { words: "Reading the day’s bookings…", unread: false }
          : { words: "Nobody booked.", unread: false };
  const listId = `cal-wday-${day.key}`;
  return (
    <section
      className="cal-wday"
      data-today={day.isToday ? "true" : undefined}
      data-folded={!quiet && !open ? "true" : undefined}
      aria-label={`${day.weekday} ${day.monthDay}`}
    >
      <header className="cal-wday__head">
        <button type="button" className="cal-wday__open" onClick={() => onOpenDay(day.date)} aria-label={`Open ${day.weekday} ${day.monthDay}`}>
          <span className="cal-wday__name">{day.weekday}</span>
          <span className="cal-wday__date">{day.monthDay}</span>
          {day.isToday && <span className="cal-wday__today">Today</span>}
        </button>
        <span className="cal-wday__count">
          {day.count > 0 ? `${day.count} ${day.count === 1 ? "session" : "sessions"}` : ""}
          {state === "failed" && day.count > 0 && <span className="cal-wday__unread"> · may be missing some</span>}
        </span>
        {!quiet && (
          <button
            type="button"
            className="cal-wday__fold"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`${open ? "Hide" : "Show"} ${day.weekday}’s bookings`}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown size={18} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </header>
      {quiet ? (
        <p className="cal-wday__quiet" data-unread={quiet.unread ? "true" : undefined}>
          {quiet.words}
        </p>
      ) : open ? (
        <ol id={listId} className="cal-wday__slots">
          {day.slots.map((slot) => (
            <li key={slot.min} className="cal-wslot">
              <span className="cal-wslot__time">{slot.label}</span>
              <ul className="cal-wslot__list">
                {slot.items.map((s) => (
                  <Booking key={s.id} session={s} withWords={withOf(s)} mine={!!selfId && s.trainerId === selfId} onSelectClient={onSelectClient} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
});

export interface WeekViewProps {
  anchor: Date;
  /** The week's bookings, already narrowed by the team filter. */
  sessions: CalendarSession[];
  trainerRefs: Map<string, TrainerRef>;
  /** Trainer ids in the studio's order: who comes first in a time slot after you. */
  trainerOrder: ReadonlyArray<string>;
  /** The signed-in trainer: their bookings first and blue. */
  selfId: string | null;
  /** The picked day (blue on the strip). */
  selectedDate: Date;
  /** A day's head or the strip: open that Day. */
  onSelectDate: (date: Date) => void;
  onSelectClient?: (clientId: string) => void;
  /** What is known about a studio day's bookings; absent: read. */
  stateOf?: (dayKey: string) => DayReadState;
}

export function WeekView({ anchor, sessions, trainerRefs, trainerOrder, selfId, selectedDate, onSelectDate, onSelectClient, stateOf }: WeekViewProps) {
  const [chartsOpen, setChartsOpen] = useState(false);

  /* Yours first, then the studio's order, then Unassigned (the Hub's column order). */
  const rankOf = useMemo(() => {
    const order = new Map(trainerOrder.map((id, i) => [id, i + 1] as const));
    return (id: string | null) => (id === null ? 10_000 : selfId && id === selfId ? 0 : order.get(id) ?? 5_000);
  }, [trainerOrder, selfId]);

  const days = useMemo(() => buildWeekAgenda(anchor, sessions, rankOf), [anchor, sessions, rankOf]);
  const summary = useMemo(() => (chartsOpen ? buildWeekSummary(anchor, sessions, trainerRefs) : null), [chartsOpen, anchor, sessions, trainerRefs]);

  /* Who a booking is with, in words: you, the name the trainer goes by (whole
     names when two read alike), or Mindbody's staff name for Unassigned. */
  const withOf = useMemo(() => {
    const shorts = new Map<string, string>();
    const seen = new Map<string, number>();
    for (const ref of trainerRefs.values()) seen.set(ref.shortName.toLowerCase(), (seen.get(ref.shortName.toLowerCase()) ?? 0) + 1);
    for (const ref of trainerRefs.values()) shorts.set(ref.id, (seen.get(ref.shortName.toLowerCase()) ?? 0) > 1 ? ref.name : ref.shortName);
    return (s: CalendarSession) => {
      if (s.trainerId && selfId && s.trainerId === selfId) return "with you";
      if (s.trainerId) return `with ${shorts.get(s.trainerId) ?? s.trainerName ?? "a trainer"}`;
      const staff = staffLabel(s.trainerName);
      return staff ? `with ${staff}` : "Unassigned";
    };
  }, [trainerRefs, selfId]);

  const pickedKey = days.find((d) => d.date.toDateString() === selectedDate.toDateString())?.key ?? null;
  /* The week holding today opens on today: the days already over fold to
     their heads (their counts still said), one tap away. A week in the past
     or ahead opens whole. */
  const todayKey = days.find((d) => d.isToday)?.key ?? "";
  const thisWeek = todayKey !== "";

  return (
    <div className="cal-week">
      {/* The seven days, as the Hub's week strip: today an orange ring, the
          picked day blue; a tap opens that Day. */}
      <div className="cal-wstrip" role="group" aria-label="The week">
        {days.map((d) => {
          const state = stateOf ? stateOf(d.key) : "ready";
          return (
            <button
              key={d.key}
              type="button"
              className="cal-wstrip__day"
              data-today={d.isToday ? "true" : undefined}
              data-picked={d.key === pickedKey ? "true" : undefined}
              aria-current={d.isToday ? "date" : undefined}
              aria-label={`${d.weekday} ${d.monthDay}: ${d.count > 0 ? `${d.count} sessions` : state === "ready" ? "nobody booked" : state === "failed" ? "couldn't read" : "not read yet"}. Open the day.`}
              onClick={() => onSelectDate(d.date)}
            >
              <span className="cal-wstrip__name">
                {d.short} <strong>{d.dayOfMonth}</strong>
              </span>
              <span className="cal-wstrip__count">{d.count > 0 ? d.count : state === "ready" ? "—" : state === "failed" ? "?" : ""}</span>
            </button>
          );
        })}
      </div>

      {/* The charts, folded under the strip and closed until asked for. */}
      <section className="cal-fold" aria-label="The week in charts">
        <button type="button" className="cal-fold__btn" aria-expanded={chartsOpen} onClick={() => setChartsOpen((o) => !o)}>
          <span className="cal-fold__title">The week in charts</span>
          <span className="cal-fold__what">Sessions per day, trainer load, when it's busy</span>
          <ChevronDown size={18} strokeWidth={2.4} aria-hidden className="cal-fold__chev" />
        </button>
        {chartsOpen && summary && <WeekCharts summary={summary} onSelectDate={onSelectDate} />}
      </section>

      {days.map((d) => (
        <WeekDay
          key={d.key}
          day={d}
          state={stateOf ? stateOf(d.key) : "ready"}
          startFolded={thisWeek && d.key < todayKey}
          withOf={withOf}
          selfId={selfId}
          onOpenDay={onSelectDate}
          onSelectClient={onSelectClient}
        />
      ))}
    </div>
  );
}
