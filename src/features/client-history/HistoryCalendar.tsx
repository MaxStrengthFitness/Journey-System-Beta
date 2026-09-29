import { memo, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { DayCellModel, HistorySession, MonthModel, TimelineEvent, YearModel } from "./model";
import { describeRange, perWeekLabel, shortDate } from "./model";
import { bookingLines, type BookingLine } from "./bookings";

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
 *
 * HER BOOKINGS (Sep 26 2026, bookings.ts). A booking still to come is the
 * visit blue as an OUTLINE: the same colour says "a visit", the outline says
 * "not yet". A cancellation or a move is a small quiet glyph in the cell's
 * bottom-left corner (x, and an arrow), diagonally away from the orange event
 * dot, so neither competes with a visit's fill. Every mark is also written
 * under its month, one line each — the marks are for the glance, the words
 * are for reading, and nothing is found only by hovering.
 */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

const CELL_LABEL: Record<DayCellModel["state"], string> = {
  visit: "",
  break: "break",
  away: "away",
  rest: "",
  // "on record": for a client who trained before Journey, the first visit
  // here is not her first visit.
  before: "before the first visit on record",
  future: "",
};

function cellClass(cell: DayCellModel): string {
  return [
    "hist-cell",
    `hist-cell--${cell.state}`,
    cell.sessions.length > 1 ? "hist-cell--double" : "",
    cell.isToday ? "hist-cell--today" : "",
    cell.hasMarker ? "hist-cell--marker" : "",
    // A visit's fill wins over the outline: the day has happened.
    cell.booked && cell.state !== "visit" ? "hist-cell--booked" : "",
    cell.cancelled || cell.moved || cell.didntCome ? "hist-cell--changed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function dayLabel(cell: DayCellModel, monthName: string, year: number, timeZone?: string): string {
  const base = `${monthName} ${cell.day}, ${year}`;
  const bookings = cell.bookings.length
    ? `; ${bookingLines(cell.bookings, year, timeZone).map((l) => l.text).join("; ")}`
    : "";
  if (cell.state === "visit") {
    const who = cell.sessions
      .map((s) => s.trainerName || s.trainerInitials)
      .filter(Boolean)
      .join(", ");
    const n = cell.sessions.length;
    return `${base} — ${n} session${n === 1 ? "" : "s"}${who ? ` with ${who}` : ""}${bookings}`;
  }
  const extra = CELL_LABEL[cell.state];
  return `${extra ? `${base}, ${extra}` : base}${bookings}`;
}

/**
 * The glyph a cancellation or a move draws, in a cell, in the legend and at
 * the head of its line under the month. An SVG rather than a text character,
 * so it is the same crisp shape at every cell size on every iPad.
 */
export function BookingGlyph({ kind, className = "" }: { kind: "cancelled" | "moved" | "didnt-come"; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`hist-glyph ${className}`} aria-hidden focusable="false">
      {kind === "cancelled" ? (
        <path d="M2.2 2.2 7.8 7.8M7.8 2.2 2.2 7.8" />
      ) : kind === "moved" ? (
        <path d="M1.5 5h6.6M5.4 2.3 8.1 5 5.4 7.7" />
      ) : (
        /* Didn't come: an empty ring — the slot was there, nobody filled it. */
        <circle cx="5" cy="5" r="3.2" />
      )}
    </svg>
  );
}

/** The corner mark: a cancellation outranks a move, a move a "didn't come", when a day has more than one (the words name each). */
function CellMark({ cell }: { cell: DayCellModel }) {
  if (!cell.cancelled && !cell.moved && !cell.didntCome) return null;
  return (
    <span className="hist-cell__mark" aria-hidden>
      <BookingGlyph kind={cell.cancelled ? "cancelled" : cell.moved ? "moved" : "didnt-come"} />
    </span>
  );
}

const DayCell = memo(function DayCell({
  cell,
  monthName,
  year,
  timeZone,
  onOpen,
}: {
  cell: DayCellModel;
  monthName: string;
  year: number;
  timeZone?: string;
  onOpen: (sessions: HistorySession[]) => void;
}) {
  if (cell.state === "visit") {
    return (
      <button
        type="button"
        className={cellClass(cell)}
        onClick={() => onOpen(cell.sessions)}
        aria-label={dayLabel(cell, monthName, year, timeZone)}
        aria-current={cell.isToday ? "date" : undefined}
        data-day={cell.key}
      >
        {cell.day}
        <CellMark cell={cell} />
      </button>
    );
  }
  return (
    <span
      className={cellClass(cell)}
      aria-label={dayLabel(cell, monthName, year, timeZone)}
      aria-current={cell.isToday ? "date" : undefined}
      data-day={cell.key}
    >
      {cell.day}
      <CellMark cell={cell} />
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

/** One booking under its month. It wraps rather than cuts: names are never truncated. */
function BookingLineRow({ line }: { line: BookingLine }) {
  return (
    <li className={`hist-month__booking hist-month__booking--${line.kind}`}>
      {line.kind === "booked" ? (
        <i className="hist-glyph hist-glyph--booked" aria-hidden />
      ) : (
        <BookingGlyph kind={line.kind} />
      )}
      <span>{line.text}</span>
    </li>
  );
}

const MAX_EVENT_LINES = 2;

/** "4 booked · 1 cancelled" — for a year that has not started yet. */
function aheadSummary(year: YearModel): string {
  return [
    year.booked ? `${year.booked} booked` : "",
    year.cancelled ? `${year.cancelled} cancelled` : "",
    year.moved ? `${year.moved} moved` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const MonthCard = memo(function MonthCard({
  month,
  timeZone,
  onOpenDay,
  onOpenMonth,
}: {
  month: MonthModel;
  timeZone?: string;
  onOpenDay: (sessions: HistorySession[]) => void;
  onOpenMonth: (monthKey: string) => void;
}) {
  const shownEvents = month.events.slice(0, MAX_EVENT_LINES);
  const more = month.events.length - shownEvents.length;
  const lines = useMemo(() => bookingLines(month.bookings, month.year, timeZone), [month.bookings, month.year, timeZone]);
  // A month still ahead has no sessions to count: say how many she is booked for.
  const aheadBooked = month.ahead && month.sessions === 0 && month.booked > 0;
  return (
    <section
      className={`hist-month ${month.sessions === 0 ? "hist-month--quiet" : ""}`}
      aria-label={`${month.name} ${month.year}: ${
        aheadBooked
          ? `${month.booked} booked`
          : `${month.sessions} session${month.sessions === 1 ? "" : "s"}`
      }`}
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
        <span className={`hist-month__count ${aheadBooked ? "hist-month__count--booked" : ""}`}>
          {aheadBooked ? (
            <>
              <b>{month.booked}</b>
              <span>booked</span>
            </>
          ) : (
            <>
              <b>{month.sessions || "—"}</b>
              {month.sessions > 0 && <span>ses</span>}
            </>
          )}
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
            <DayCell
              key={cell.key}
              cell={cell}
              monthName={month.name}
              year={month.year}
              timeZone={timeZone}
              onOpen={onOpenDay}
            />
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

      {lines.length > 0 && (
        <ul className="hist-month__bookings" aria-label={`${month.name} bookings`}>
          {lines.map((line) => (
            <BookingLineRow key={line.id} line={line} />
          ))}
        </ul>
      )}
    </section>
  );
});

export const YearBlock = memo(function YearBlock({
  year,
  timeZone,
  onOpenDay,
  onOpenMonth,
}: {
  year: YearModel;
  timeZone?: string;
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
          {year.ahead ? (
            // A year drawn only for her bookings has no sessions to average:
            // it says what is in it instead.
            aheadSummary(year)
          ) : (
            <>
              {year.sessions} session{year.sessions === 1 ? "" : "s"} · {perWeekLabel(year.perWeek)} / wk
              {breaks > 0 ? ` · ${breaks} break${breaks === 1 ? "" : "s"}` : ""}
            </>
          )}
        </span>
      </header>
      <div className="hist-months">
        {year.months.map((m) => (
          <MonthCard key={m.key} month={m} timeZone={timeZone} onOpenDay={onOpenDay} onOpenMonth={onOpenMonth} />
        ))}
      </div>
    </section>
  );
});

export interface HistoryCalendarProps {
  years: YearModel[];
  /** The studio's zone, for the times in the booking lines. */
  timeZone?: string;
  onOpenDay: (sessions: HistorySession[]) => void;
  onOpenMonth: (monthKey: string) => void;
}

export function HistoryCalendar({ years, timeZone, onOpenDay, onOpenMonth }: HistoryCalendarProps) {
  return (
    <div className="hist-years">
      {years.map((y) => (
        <YearBlock key={y.year} year={y} timeZone={timeZone} onOpenDay={onOpenDay} onOpenMonth={onOpenMonth} />
      ))}
    </div>
  );
}
