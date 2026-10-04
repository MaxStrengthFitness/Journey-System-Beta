/**
 * OPERATIONS → OVERVIEW → CHANGES — the week's cancellations and moves,
 * day by day.
 *
 * Operations overhaul, Sep 2026. A strip of the seven days from today,
 * each with its count; pick a day and read its list. A change is held
 * against THE DAY THE SESSION WAS FOR (so Friday's list fills up across
 * the week and clears once Friday is over), and a cancellation is read as
 * a reschedule only when the client really rebooked: another booking that
 * week which appeared with the cancellation (at most twelve hours before it
 * was stamped, or after) and had not already happened. A booking she held
 * all along is not a rebook — changes.ts has the rules (`isRealRebook`).
 * Every row opens the client.
 *
 * The calm round (Oct 3 2026): each row is one short line (shortChange),
 * when it was noticed is on the row's (i), and how the list works is behind
 * the counts line's (i) rather than two paragraphs on the page.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleEntry, Studio } from "../../../types";
import { addDays } from "../../client-history/model";
import { AdminButton, AdminEmpty, AdminHeader, AdminNotice, AdminPanel, AdminScreen } from "../primitives";
import { ActionRows } from "../overview/pieces";
import { CountsLine } from "../overview/brief-pieces";
import { changeCounts, changesForDay, describeChange, shortChange } from "./changes";
import { WEEK_DAYS } from "./useWeekSchedule";
import "../overview/overview.css";

export interface ChangesViewProps {
  studio: Studio;
  entries: ScheduleEntry[];
  loading: boolean;
  failed: boolean;
  today: string;
  /** The page it was opened from; without one (Week → This week so far) there is no Back. */
  onBack?: () => void;
  /** Where Back goes, in words. */
  backLabel?: string;
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

export function ChangesView({ studio, entries, loading, failed, today, onBack, backLabel = "Overview", onOpenClient }: ChangesViewProps) {
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
        title="Changes"
        actions={
          onBack ? (
            <AdminButton variant="quiet" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" /> {backLabel}
            </AdminButton>
          ) : undefined
        }
      />

      {failed && <AdminNotice tone="alert">The week's schedule could not be read just now — this list is missing, not empty.</AdminNotice>}

      <CountsLine
        pending={loading ? "Reading the week…" : null}
        items={[{ n: failed ? null : total, label: total === 1 ? "change in the next seven days" : "changes in the next seven days" }]}
        rules={[
          "Cancellations and moves, held against the day the session was for. A day's list clears when that day ends.",
          "A cancellation reads as a reschedule only when the client rebooked: another session that week, booked within 12 hours before the cancellation or any time after it, and not already past. A booking they already held doesn't count, and one handed to another trainer at the same time isn't a change.",
          "Mindbody doesn't say why a booking went; Journey notices it went, and says when on the row's (i). The calendar hides a cancelled row; this list is where it is recorded.",
        ]}
      />

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
              : `${rows.filter((r) => r.reading === "cancellation").length} cancelled · ${rows.filter((r) => r.reading === "reschedule").length} moved`
        }
        flush
      >
        {rows.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title={loading ? "Reading…" : "No changes for this day."} />
          </div>
        ) : (
          <ActionRows
            rows={rows.map((c) => ({
              key: c.id,
              clientId: c.clientId,
              name: c.clientName,
              sentence: shortChange(c, today, tz),
              proof: describeChange(c, tz).proof,
              tone: c.reading === "cancellation" ? ("warn" as const) : ("info" as const),
              badge: c.reading === "cancellation" ? "Cancelled" : "Moved",
            }))}
            onOpenClient={onOpenClient}
            empty=""
          />
        )}
      </AdminPanel>

    </AdminScreen>
  );
}
