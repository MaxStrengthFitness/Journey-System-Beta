import { memo, useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { buildWeekSummary } from "./selectors";
import { toneClass } from "./trainer-tone";
import { TrainerAvatar } from "./TrainerAvatar";
import type { CalendarSession, DayBar, TrainerCount, TrainerRef, WeekSummary } from "./types";

/**
 * WEEK — a dashboard, not a grid.
 *
 * The old week was a seven-column time grid holding the same session blocks as
 * every other view. It was mostly whitespace, it answered no question the Day
 * view didn't answer better, and the one thing a manager actually opens a week
 * for — how much work is this week, and who is carrying it — was not on screen
 * at all.
 *
 * Three questions, three blocks:
 *   1. HOW MUCH   total, and whether that is up or down on last week
 *   2. WHEN       a bar per day, and a coarse capacity heatmap
 *   3. WHO        a trainer leaderboard, sorted by volume
 *
 * The heatmap is four time BANDS rather than 28 half-hour rows on purpose: a
 * 40-session week spread over 28 rows is a field of 0s and 1s that shows
 * nothing. Four bands put enough sessions in each cell for the differences to
 * be real, and the whole thing fits without scrolling.
 */

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
      {up ? <TrendingUp size={13} strokeWidth={2.6} aria-hidden /> : <TrendingDown size={13} strokeWidth={2.6} aria-hidden />}
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
      <div style={{ textAlign: "right" }}>
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
        <div
          key={d.key}
          className={`cal-heat__dow ${d.isToday ? "cal-heat__dow--today" : ""}`}
        >
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
            title={`${day.label} ${label}: ${cell.count} session${cell.count === 1 ? "" : "s"}`}
          >
            {cell.count || ""}
          </div>
        );
      })}
    </>
  );
});

export interface WeekViewProps {
  anchor: Date;
  sessions: CalendarSession[];
  trainerRefs: Map<string, TrainerRef>;
  onSelectDate: (date: Date) => void;
}

export function WeekView({ anchor, sessions, trainerRefs, onSelectDate }: WeekViewProps) {
  const summary = useMemo(
    () => buildWeekSummary(anchor, sessions, trainerRefs),
    [anchor, sessions, trainerRefs],
  );

  const maxDay = useMemo(
    () => summary.days.reduce((m, d) => Math.max(m, d.count), 0),
    [summary.days],
  );
  const maxTrainer = summary.byTrainer[0]?.count ?? 0;

  return (
    <div className="cal-week">
      <div className="cal-week__top">
        <section className="cal-card cal-total">
          <span className="cal-total__value">{summary.total}</span>
          <span className="cal-total__label">
            {summary.total === 1 ? "Session" : "Sessions"} this week
          </span>
          <DeltaBadge total={summary.total} previous={summary.previousTotal} />
          {summary.busiestDay && (
            <span className="cal-card__note" style={{ marginTop: 8 }}>
              Busiest: {summary.busiestDay.label} {summary.busiestDay.dayOfMonth} (
              {summary.busiestDay.count})
            </span>
          )}
        </section>

        <section className="cal-card">
          <header className="cal-card__head">
            <h3 className="cal-card__title">Sessions per day</h3>
            <span className="cal-card__note">Tap a day to open it</span>
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
                <span className="cal-empty__hint">
                  Nothing is booked this week for the current filter.
                </span>
              </div>
            ) : (
              <div className="cal-board">
                {summary.byTrainer.map((entry) => (
                  <BoardRow
                    key={entry.trainer.id}
                    entry={entry}
                    max={maxTrainer}
                    total={summary.total}
                  />
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
              <span className="cal-legend__swatch" style={{ background: "var(--cal-heat-1)" }} />
              <span className="cal-legend__swatch" style={{ background: "var(--cal-heat-3)" }} />
              <span className="cal-legend__swatch" style={{ background: "var(--cal-heat-5)" }} />
              Peak {summary.peak}
            </span>
          </header>
          <Heatmap summary={summary} />
        </section>
      </div>
    </div>
  );
}
