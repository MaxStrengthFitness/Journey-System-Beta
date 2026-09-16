import { Bell, CalendarClock, ChevronRight } from "lucide-react";
import { auth } from "../../../firebase";
import { calendarLabelKey, studioDateKey } from "../../../lib/studio-time";
import { addDays } from "../../studio-tasks/recurrence";
import { clockLabel } from "../../studio-tasks/task-wizard";
import { dayWords } from "../jobs/jobs";
import { requestPlanner } from "../intent";
import { upcomingTimed } from "./reminders";
import { usePersonalTemplates } from "./useReminderBell";
// The --st-* tokens live with the studio tasks; the calendar may open first.
import "../../studio-tasks/studio-tasks.css";
import "./reminders.css";

/**
 * YOUR REMINDERS, ON THE CALENDAR.
 *
 * Round: Planner rework, Sep 2026 — "personal reminders linked to the
 * calendar". The calendar draws the studio's bookings; this strip sits under
 * its header and lists the signed-in trainer's own timed tasks for the days
 * on screen. Only they see it (their private list is the only read). Tapping
 * one opens My tasks in the Planner.
 */
export function ReminderStrip({
  from,
  to,
  onOpenPlanner,
}: {
  /** The first and last day on screen, as the calendar builds them (local noon). */
  from: Date;
  to: Date;
  onOpenPlanner?: () => void;
}) {
  const uid = auth.currentUser?.uid ?? null;
  const { templates } = usePersonalTemplates(uid);
  const fromKey = calendarLabelKey(from);
  const toKey = calendarLabelKey(to);
  const todayKey = studioDateKey(new Date()) ?? fromKey;

  let days = 1;
  while (addDays(fromKey, days) <= toKey && days < 60) days += 1;
  const items = upcomingTimed(templates, fromKey, days);
  if (items.length === 0) return null;

  const open = () => {
    if (!onOpenPlanner) return;
    requestPlanner({ kind: "open-tab", tab: "mine" });
    onOpenPlanner();
  };

  return (
    <section className="rs" aria-label="Your reminders">
      <span className="rs__label">
        <CalendarClock size={14} aria-hidden />
        Yours
      </span>
      <ul className="rs__list">
        {items.slice(0, 20).map((u) => (
          <li key={u.key}>
            <button type="button" className="rs__item" onClick={open} disabled={!onOpenPlanner}>
              <span className="rs__when">
                {dayWords(u.dateKey, todayKey)} · {clockLabel(u.time)}
              </span>
              <span className="rs__title">{u.template.title}</span>
              {u.reminds && <Bell size={12} aria-label="Reminder set" />}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 20 && <span className="rs__more">+{items.length - 20} more</span>}
      {onOpenPlanner && <ChevronRight size={14} aria-hidden className="rs__chev" />}
    </section>
  );
}
