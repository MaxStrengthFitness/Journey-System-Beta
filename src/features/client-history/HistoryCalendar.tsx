import { memo } from "react";
import { ChevronRight } from "lucide-react";
import type { DayCellModel, HistorySession, MonthModel, TimelineEvent, YearModel } from "./model";
import { describeRange, perWeekLabel, shortDate } from "./model";

/**
 * HISTORY — every month at once.
 *
 * The old view was one month with arrows. To see when a client took a break
 * you had to page back through months one at a time and remember what you
 * had seen. Here every month since the first visit is on the page, three to
 * a row in portrait, and the shape of someone's attendance is one glance:
 * solid blue runs are consistency, hatched runs are breaks, sand is "away,
 * and we knew about it".
 *
 * Each month is the Calendar tab's month grid in miniature — same hairlines,
 * same Sunday-first week, same header style — so it reads as the calendar,
 * not as a new kind of chart. Details stay in the List view: tapping a month's
 * name opens that month there, and tapping a visit opens the session.
 */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

const CELL_LABEL: Record<DayCellModel["state"], string> = {
  visit: "",
  break: "break",
  away: "away",
  rest: "",
  before: "before first visit",
  future: "",
};

function cellClass(cell: DayCellModel): string {
  return [
    "hist-cell",
    `hist-cell--${cell.state}`,
    cell.sessions.length > 1 ? "hist-cell--double" : "",
    cell.isToday ? "hist-cell--today" : "",
    cell.hasMarker ? "hist-cell--marker" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function dayLabel(cell: DayCellModel, monthName: string, year: number): string {
  const base = `${monthName} ${cell.day}, ${year}`;
  if (cell.state === "visit") {
    const who = cell.sessions
      .map((s) => s.trainerName || s.trainerInitials)
      .filter(Boolean)
      .join(", ");
    const n = cell.sessions.length;
    return `${base} — ${n} session${n === 1 ? "" : "s"}${who ? ` with ${who}` : ""}`;
  }
  const extra = CELL_LABEL[cell.state];
  return extra ? `${base}, ${extra}` : base;
}

const DayCell = memo(function DayCell({
  cell,
  monthName,
  year,
  onOpen,
}: {
  cell: DayCellModel;
  monthName: string;
  year: number;
  onOpen: (sessions: HistorySession[]) => void;
}) {
  if (cell.state === "visit") {
    return (
      <button
        type="button"
        className={cellClass(cell)}
        onClick={() => onOpen(cell.sessions)}
        aria-label={dayLabel(cell, monthName, year)}
        aria-current={cell.isToday ? "date" : undefined}
      >
        {cell.day}
      </button>
    );
  }
  return (
    <span
      className={cellClass(cell)}
      aria-label={dayLabel(cell, monthName, year)}
      aria-current={cell.isToday ? "date" : undefined}
    >
      {cell.day}
    </span>
  );
});

const EventLine = memo(function EventLine({ event, year }: { event: TimelineEvent; year: number }) {
  const when = event.from === event.to ? shortDate(event.from, year) : describeRange(event.from, event.to, year);
  return (
    <span className={`hist-month__event ${event.away ? "hist-month__event--away" : ""}`} title={`${event.title} · ${when}`}>
      <i aria-hidden />
      <span>
        {event.title} · {when}
      </span>
    </span>
  );
});

const MAX_EVENT_LINES = 2;

export const MonthCard = memo(function MonthCard({
  month,
  onOpenDay,
  onOpenMonth,
}: {
  month: MonthModel;
  onOpenDay: (sessions: HistorySession[]) => void;
  onOpenMonth: (monthKey: string) => void;
}) {
  const shownEvents = month.events.slice(0, MAX_EVENT_LINES);
  const more = month.events.length - shownEvents.length;
  return (
    <section
      className={`hist-month ${month.sessions === 0 ? "hist-month--quiet" : ""}`}
      aria-label={`${month.name} ${month.year}: ${month.sessions} session${month.sessions === 1 ? "" : "s"}`}
    >
      <header className="hist-month__head">
        <button
          type="button"
          className="hist-month__name"
          onClick={() => onOpenMonth(month.key)}
          title={`Open ${month.name} in the list`}
        >
          {month.shortName}
          <ChevronRight size={13} strokeWidth={3} aria-hidden />
        </button>
        <span className="hist-month__count">
          <b>{month.sessions || "—"}</b>
          {month.sessions > 0 && <span>ses</span>}
        </span>
      </header>

      <div className="hist-dow" aria-hidden>
        {DOW.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="hist-grid">
        {month.cells.map((cell, i) =>
          cell ? (
            <DayCell key={cell.key} cell={cell} monthName={month.name} year={month.year} onOpen={onOpenDay} />
          ) : (
            <span key={`blank-${i}`} className="hist-cell hist-cell--blank" aria-hidden />
          ),
        )}
      </div>

      {shownEvents.length > 0 && (
        <div className="hist-month__events">
          {shownEvents.map((e) => (
            <EventLine key={e.id} event={e} year={month.year} />
          ))}
          {more > 0 && <span className="hist-month__event">+{more} more</span>}
        </div>
      )}
    </section>
  );
});

export const YearBlock = memo(function YearBlock({
  year,
  onOpenDay,
  onOpenMonth,
}: {
  year: YearModel;
  onOpenDay: (sessions: HistorySession[]) => void;
  onOpenMonth: (monthKey: string) => void;
}) {
  const breaks = year.breakCount;
  return (
    <section className="hist-year" aria-label={String(year.year)}>
      <header className="hist-year__head">
        <span className="hist-year__num">{year.year}</span>
        <span className="hist-rule" aria-hidden />
        <span className="hist-year__meta">
          {year.sessions} session{year.sessions === 1 ? "" : "s"} · {perWeekLabel(year.perWeek)} / wk
          {breaks > 0 ? ` · ${breaks} break${breaks === 1 ? "" : "s"}` : ""}
        </span>
      </header>
      <div className="hist-months">
        {year.months.map((m) => (
          <MonthCard key={m.key} month={m} onOpenDay={onOpenDay} onOpenMonth={onOpenMonth} />
        ))}
      </div>
    </section>
  );
});

export interface HistoryCalendarProps {
  years: YearModel[];
  onOpenDay: (sessions: HistorySession[]) => void;
  onOpenMonth: (monthKey: string) => void;
}

export function HistoryCalendar({ years, onOpenDay, onOpenMonth }: HistoryCalendarProps) {
  return (
    <div className="hist-years">
      {years.map((y) => (
        <YearBlock key={y.year} year={y} onOpenDay={onOpenDay} onOpenMonth={onOpenMonth} />
      ))}
    </div>
  );
}
