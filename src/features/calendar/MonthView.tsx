import { memo, useMemo } from "react";
import type { DayReadState } from "../../lib/schedule-window";
import { formatDateWords } from "../../lib/studio-time";
import { buildMonthCells } from "./selectors";
import type { CalendarEvent, CalendarSession, DayCell } from "./types";
import "./calendar.css";

/**
 * MONTH — one panel, quiet cells (the rooms round, Oct 10 2026).
 *
 * A day says three things and no more: its number, how many are booked, and
 * a small mark when a client has a life event that day (a birthday, a dated
 * FORD detail). The words of the events are on the Day view and in the
 * cell's label, never sentences in the cell: the month read as a wall of
 * text (AJ's photos, "Journey Rooms"). The trainers' avatar rows left too;
 * who carries the week is the Week's folded charts.
 *
 * Today is an orange ring on the day's number, the picked day blue, and on
 * a day that is both, the blue with an orange underline outside it (the
 * Hub's `.hd-day` rule): orange is now, blue is what you chose.
 *
 * A day whose bookings weren't read is never drawn as an empty day: it shows
 * no count while it is read, and a plum mark when the read failed
 * (`stateOf`, the schedule window's dayState). Only a day that was read and
 * has nothing booked says "—".
 */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One options object, so its formatter is built once (the iPad round's Intl trap). */
const LABEL_DAY: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

/**
 * The words a screen reader hears for a day, the events' words included.
 * Under the team filter an empty day names whose bookings these are
 * (`filterName`, "you" for your own; the review, Oct 10 2026).
 */
export function dayLabel(cell: DayCell, state: DayReadState, filterName: string | null = null): string {
  const date = formatDateWords(cell.date, LABEL_DAY);
  const booked =
    state === "failed" && cell.total === 0
      ? "bookings couldn't be read"
      : state === "loading" && cell.total === 0
        ? "bookings not read yet"
        : cell.total === 0 && filterName
          ? `nobody is booked with ${filterName}`
          : `${cell.total} ${cell.total === 1 ? "session" : "sessions"}${filterName ? ` with ${filterName}` : ""}${state === "failed" ? ", may be missing some" : ""}`;
  const life =
    cell.events.length === 0
      ? ""
      : `. ${cell.events.length === 1 ? "A life event" : `${cell.events.length} life events`}: ${cell.events.map((e) => e.title).join("; ")}`;
  return `${date}, ${booked}${life}`;
}

const DayBox = memo(function DayBox({
  cell,
  picked,
  state,
  filterName,
  onSelect,
}: {
  cell: DayCell;
  picked: boolean;
  state: DayReadState;
  filterName: string | null;
  onSelect: (date: Date) => void;
}) {
  /* A read empty day: "—", or "0" under the team filter, where the page names the trainer and "—" would read as nobody at all. */
  const count = cell.total > 0 ? String(cell.total) : state === "ready" ? (filterName ? "0" : "—") : "";
  return (
    <button
      type="button"
      onClick={() => onSelect(cell.date)}
      aria-current={cell.isToday ? "date" : undefined}
      aria-label={dayLabel(cell, state, filterName)}
      className="cal-day"
      data-outside={cell.inCurrentMonth ? undefined : "true"}
      data-today={cell.isToday ? "true" : undefined}
      data-picked={picked ? "true" : undefined}
      data-state={state}
      data-empty={cell.total === 0 ? "true" : undefined}
    >
      <span className="cal-day__head">
        <span className="cal-day__num">{cell.dayOfMonth}</span>
        {cell.events.length > 0 && <span className="cal-day__life" aria-hidden="true" />}
      </span>
      <span className="cal-day__count" aria-hidden="true">
        {state === "failed" && <span className="cal-day__unread">?</span>}
        {count}
      </span>
    </button>
  );
});

export interface MonthViewProps {
  anchor: Date;
  sessions: CalendarSession[];
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  /** What is known about a studio day's bookings; absent: read. */
  stateOf?: (dayKey: string) => DayReadState;
  /** The team filter's trainer ("you" for your own), or null for the entire team. */
  filterName?: string | null;
}

export function MonthView({ anchor, sessions, events, selectedDate, onSelectDate, stateOf, filterName = null }: MonthViewProps) {
  const cells = useMemo(() => buildMonthCells(anchor, sessions, events), [anchor, sessions, events]);

  const selectedTime = selectedDate ? selectedDate.toDateString() : null;

  return (
    <div className="cal-month" role="grid" aria-label="Month">
      {DOW.map((d) => (
        <div key={d} className="cal-month__dow" role="columnheader">
          {d}
        </div>
      ))}
      {cells.map((cell) => (
        <DayBox
          key={`${cell.key}-${cell.dayOfMonth}`}
          cell={cell}
          picked={selectedTime === cell.date.toDateString()}
          state={stateOf ? stateOf(cell.key) : "ready"}
          filterName={filterName}
          onSelect={onSelectDate}
        />
      ))}
    </div>
  );
}
