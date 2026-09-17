import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { Bell, ChevronRight, Zap } from "lucide-react";
import { auth } from "../../../firebase";
import { calendarLabelKey, studioDateKey } from "../../../lib/studio-time";
import { cn } from "../../../lib/utils";
import { templatesRef } from "../../studio-tasks/mutations";
import type { TaskTemplate } from "../../studio-tasks/types";
import { useStudioRequests } from "../../studio-tasks/useStudioRequests";
import { clockLabel } from "../../studio-tasks/task-wizard";
import { dayWords } from "../jobs/jobs";
import { useTeamJobs } from "../jobs/useTeamJobs";
import { requestPlanner } from "../intent";
import { usePersonalTemplates } from "../reminders/useReminderBell";
import { byDay, relayCalendarItems, type RelayCalendarItem } from "./calendar-items";
// The --st-* tokens live with the studio tasks; the calendar may open first.
import "../../studio-tasks/studio-tasks.css";
import "../reminders/reminders.css";
import "./relay-strip.css";

/**
 * THE RELAY LAYER ON THE CALENDAR — grows out of the reminders strip.
 *
 * Round: Relay, Sep 2026. The reminders strip showed a trainer's own timed
 * tasks for the days on screen. This shows everything Relay puts on a day
 * (calendar-items.ts, tested): reminders and personal tasks in the mine
 * colour, studio tasks with a set time, team jobs and initiatives on their
 * due day, hand-offs in the mine colour when they are yours. Grouped by
 * day; a tap opens Relay where the item lives. The Calendar's sessions are
 * untouched and it is not redesigned.
 *
 * Reads: the trainer's personal templates (as before), the studio's
 * templates, its team jobs and its open requests — the same listeners
 * Relay uses, mounted only while the Calendar is.
 */
function useStudioTemplates(studioId: string | null): TaskTemplate[] {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  useEffect(() => {
    if (!studioId) {
      setTemplates([]);
      return;
    }
    return onSnapshot(
      templatesRef(studioId),
      (snap) => setTemplates(snap.docs.map((d) => ({ ...(d.data() as object), id: d.id, studioId }) as TaskTemplate)),
      (err) => {
        console.warn("[relay] studio templates read failed:", err);
        setTemplates([]);
      },
    );
  }, [studioId]);
  return templates;
}

const MAX_SHOWN = 24;

export function RelayStrip({
  studioId,
  trainerId,
  from,
  to,
  onOpenPlanner,
}: {
  studioId: string | null;
  trainerId: string | null;
  from: Date;
  to: Date;
  onOpenPlanner?: () => void;
}) {
  const uid = auth.currentUser?.uid ?? null;
  const { templates: personal } = usePersonalTemplates(uid);
  const studio = useStudioTemplates(studioId);
  const jobs = useTeamJobs(studioId);
  const { open: requests } = useStudioRequests(studioId);
  const fromKey = calendarLabelKey(from);
  const toKey = calendarLabelKey(to);
  const todayKey = studioDateKey(new Date()) ?? fromKey;
  const [filter, setFilter] = useState<"all" | "mine">("all");

  const items = useMemo(
    () => relayCalendarItems({ templates: [...personal, ...studio], jobs: jobs.jobs, requests, fromKey, toKey, uid, trainerId }),
    [personal, studio, jobs.jobs, requests, fromKey, toKey, uid, trainerId],
  );
  const shown = filter === "mine" ? items.filter((i) => i.origin === "mine") : items;
  if (items.length === 0) return null;

  const open = (it: RelayCalendarItem) => {
    if (!onOpenPlanner) return;
    if (it.open.kind === "open-floor") {
      requestPlanner({ kind: "open-tab", tab: "floor" });
    } else {
      requestPlanner(it.open);
    }
    onOpenPlanner();
  };

  const days = byDay(shown.slice(0, MAX_SHOWN));

  return (
    <section className="rs rls" aria-label="Relay on these days">
      <span className="rs__label">
        <Zap size={14} aria-hidden />
        Relay
      </span>
      <div className="rls__filter" role="group" aria-label="Whose">
        <button type="button" className="rls__chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          All
        </button>
        <button type="button" className="rls__chip rls__chip--mine" aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>
          Mine
        </button>
      </div>
      <ul className="rls__days">
        {days.map((d) => (
          <li key={d.dateKey} className="rls__day">
            <span className="rls__dayname">{dayWords(d.dateKey, todayKey)}</span>
            <ul className="rs__list">
              {d.items.map((it) => (
                <li key={it.key}>
                  <button type="button" className={cn("rs__item", `rls__item--${it.origin}`)} onClick={() => open(it)} disabled={!onOpenPlanner}>
                    {it.time && <span className="rs__when">{clockLabel(it.time)}</span>}
                    <span className="rs__title">{it.title}</span>
                    {it.sub && <span className="rls__sub">{it.sub}</span>}
                    {it.reminds && <Bell size={12} aria-label="Reminder set" />}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {shown.length > MAX_SHOWN && <span className="rs__more">+{shown.length - MAX_SHOWN} more</span>}
      {onOpenPlanner && <ChevronRight size={14} aria-hidden className="rs__chev" />}
    </section>
  );
}
