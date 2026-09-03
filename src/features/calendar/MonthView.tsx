import { memo, useMemo } from "react";
import { buildMonthCells } from "./selectors";
import { TrainerCountChip } from "./TrainerAvatar";
import type { CalendarEvent, CalendarSession, DayCell, TrainerRef } from "./types";

/**
 * MONTH — volume at a glance.
 *
 * The old cell spelled out full trainer names on separate lines. On a
 * mid-week day with five trainers that wrapped into six lines of text, blew
 * the cell's height out, and dragged the whole row with it — which is why the
 * grid looked ragged and why counting anything took real effort.
 *
 * A day is now one big number plus a row of initial-avatars carrying their own
 * count badge. Nothing in the cell can wrap, so every cell is the same height
 * and the month reads as a shape: heavy days are heavy numbers.
 *
 * Avatars cap at four with a "+n" — past four, the exact roster is a question
 * for the Day view, and the month should still be scannable.
 */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_AVATARS = 4;

const DayBox = memo(function DayBox({
  cell,
  selected,
  onSelect,
}: {
  cell: DayCell;
  selected: boolean;
  onSelect: (date: Date) => void;
}) {
  const shown = cell.byTrainer.slice(0, MAX_AVATARS);
  const overflow = cell.byTrainer.length - shown.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(cell.date)}
      aria-current={cell.isToday ? "date" : undefined}
      aria-label={`${cell.date.toDateString()}, ${cell.total} sessions`}
      className={[
        "cal-day",
        cell.inCurrentMonth ? "" : "cal-day--outside",
        cell.isToday ? "cal-day--today" : "",
        selected ? "cal-day--selected" : "",
        cell.total === 0 ? "cal-day--quiet" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="cal-day__top">
        <span className="cal-day__num">{cell.dayOfMonth}</span>
        <span className="cal-day__total">
          <b>{cell.total || "—"}</b>
          {cell.total > 0 && <span>ses</span>}
        </span>
      </span>

      {cell.events.length > 0 && (
        <span className="cal-day__events">
          {cell.events.slice(0, 2).map((e: CalendarEvent) => (
            <span
              key={e.id}
              className={`cal-day__event ${e.priority === "High" ? "cal-day__event--high" : ""}`}
            >
              <i aria-hidden />
              {e.title}
            </span>
          ))}
        </span>
      )}

      {shown.length > 0 && (
        <span className="cal-day__who">
          {shown.map((tc) => (
            <TrainerCountChip
              key={tc.trainer.id}
              trainer={tc.trainer}
              count={tc.count}
              size="sm"
            />
          ))}
          {overflow > 0 && <span className="cal-day__more">+{overflow}</span>}
        </span>
      )}
    </button>
  );
});

export interface MonthViewProps {
  anchor: Date;
  sessions: CalendarSession[];
  events: CalendarEvent[];
  trainerRefs: Map<string, TrainerRef>;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

export function MonthView({
  anchor,
  sessions,
  events,
  trainerRefs,
  selectedDate,
  onSelectDate,
}: MonthViewProps) {
  const cells = useMemo(
    () => buildMonthCells(anchor, sessions, events, trainerRefs),
    [anchor, sessions, events, trainerRefs],
  );

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
          selected={selectedTime === cell.date.toDateString()}
          onSelect={onSelectDate}
        />
      ))}
    </div>
  );
}
