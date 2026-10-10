import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CalendarEvent } from "./types";
import "./calendar.css";

/**
 * THE DAY'S LIFE EVENTS (the rooms round, Oct 10 2026).
 *
 * Month marks a day that has a client's life event (a birthday, a dated FORD
 * detail) with a small dot, and its words moved here: one quiet line over
 * the Day's grid saying how many, folded, and on a tap each event whole
 * ("Susan Evans · Plays pickleball three mornings a week."), a tap on one
 * opening the client. Folded because a client's home life stays off a
 * screen a client can see until a trainer asks for it (the Hub's Get to know
 * rule: never on the grid), and because the grid keeps the room.
 */

/** "yyyy-mm-dd" of a Date the calendar built at local noon. */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The events that fall on a day (an event with a window covers each of its days). */
export function eventsOnDay(events: ReadonlyArray<CalendarEvent>, date: Date): CalendarEvent[] {
  const key = localKey(date);
  return events.filter((e) => {
    if (!e.date) return false;
    const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    return localKey(e.date) <= key && key <= localKey(last);
  });
}

function DayLifeView({ events, onOpenClient }: { events: ReadonlyArray<CalendarEvent>; onOpenClient?: (clientId: string) => void }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <section className="cal-life" aria-label="Life events on this day">
      <button type="button" className="cal-life__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="cal-life__dot" aria-hidden="true" />
        {events.length === 1 ? "A life event" : `${events.length} life events`}
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden className="cal-life__chev" />
      </button>
      {open && (
        <ul className="cal-life__list">
          {events.map((e) => (
            <li key={e.id}>
              {e.clientId && onOpenClient ? (
                <button type="button" className="cal-life__item" onClick={() => onOpenClient(String(e.clientId))}>
                  {e.title}
                </button>
              ) : (
                <span className="cal-life__item" data-still="true">
                  {e.title}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const DayLife = memo(DayLifeView);
