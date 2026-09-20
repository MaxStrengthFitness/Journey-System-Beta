/**
 * OPERATIONS → OVERVIEW → CHANGES — the week's cancellations and moves,
 * day by day.
 *
 * Operations overhaul, Sep 2026. A strip of the seven days from today,
 * each with its count; pick a day and read its list. A change is held
 * against THE DAY THE SESSION WAS FOR (so Friday's list fills up across
 * the week and clears once Friday is over), and a cancellation is read as
 * a reschedule when the client holds another booking that week —
 * changes.ts has the rules. Every row opens the client.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleEntry, Studio } from "../../../types";
import { addDays } from "../../client-history/model";
import { AdminButton, AdminEmpty, AdminHeader, AdminNotice, AdminPanel, AdminScreen } from "../primitives";
import { Rows } from "../overview/pieces";
import type { OverviewRow } from "../overview/questions";
import { changeCounts, changesForDay, describeChange } from "./changes";
import { WEEK_DAYS } from "./useWeekSchedule";
import "../overview/overview.css";

export interface ChangesViewProps {
  studio: Studio;
  entries: ScheduleEntry[];
  loading: boolean;
  failed: boolean;
  today: string;
  onBack: () => void;
  onOpenClient?: (clientId: string) => void;
}

const dayLabel = (day: string, today: string) => {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
};
const dateLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
const longLabel = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
};

export function ChangesView({ studio, entries, loading, failed, today, onBack, onOpenClient }: ChangesViewProps) {
  const tz = studio.timezone || undefined;
  const days = useMemo(() => Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i)), [today]);
  const counts = useMemo(() => changeCounts(entries, days, tz), [entries, days, tz]);
  const [selected, setSelected] = useState(today);
  const rows = useMemo(() => changesForDay(entries, selected, tz), [entries, selected, tz]);
  const total = days.reduce((n, d) => n + (counts[d] ?? 0), 0);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CalendarClock className="w-5 h-5" />}
        title={`${studio.name} — Changes`}
        subtitle="Cancellations and moves, held against the day the session was for. A day's list clears when that day ends; a cancellation with another booking the same week reads as a reschedule."
        actions={
          <AdminButton variant="quiet" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" /> Overview
          </AdminButton>
        }
      />

      {failed && <AdminNotice tone="alert">The week's schedule could not be read just now — this list is missing, not empty.</AdminNotice>}

      <div className="adm-ch__strip" role="tablist" aria-label="Days">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={selected === d}
            className={cn("adm-ch__day", selected === d && "adm-ch__day--on", (counts[d] ?? 0) > 0 && "adm-ch__day--has")}
            onClick={() => setSelected(d)}
          >
            <span className="adm-ch__day-label">{dayLabel(d, today)}</span>
            <span className="adm-ch__day-date">{dateLabel(d)}</span>
            <span className="adm-ch__day-count">{loading ? "…" : (counts[d] ?? 0)}</span>
          </button>
        ))}
      </div>

      <AdminPanel
        title={`${longLabel(selected)}${loading ? "" : ` — ${rows.length} change${rows.length === 1 ? "" : "s"}`}`}
        subtitle={
          loading
            ? "Reading the week…"
            : rows.length === 0
              ? "Nothing cancelled or moved for this day."
              : `${rows.filter((r) => r.reading === "cancellation").length} cancelled outright, ${rows.filter((r) => r.reading === "reschedule").length} moved or rebooked the same week.`
        }
        flush
      >
        {rows.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title={loading ? "Reading…" : "No changes for this day."} />
          </div>
        ) : (
          <Rows
            rows={rows.map((c): OverviewRow => {
              const text = describeChange(c, tz);
              return {
                clientId: c.clientId ?? "",
                name: c.clientName,
                sentence: text.sentence,
                proof: `${text.proof}${c.trainerName ? ` Booked with ${c.trainerName}.` : ""}`,
                tone: c.reading === "cancellation" ? "warn" : "info",
                badge: c.reading === "cancellation" ? "Cancelled" : "Moved",
              };
            })}
            total={rows.length}
            onOpenClient={onOpenClient}
            empty=""
          />
        )}
      </AdminPanel>

      <AdminNotice tone="info">
        {total === 0 && !loading ? "No changes recorded this week. " : ""}
        Mindbody does not say why a booking went; the app notices it went. A booking that vanishes from the schedule pull is stamped by the sync as it
        happens, so the list says when it was noticed; a cancellation the webhook delivered shows without a time until it, too, stamps. The calendar hides
        a cancelled row entirely — this list is where it is recorded.
      </AdminNotice>
    </AdminScreen>
  );
}
