import React, { useMemo, useState } from "react";
import { Calendar as CalendarIcon, Users } from "lucide-react";
import { ScheduleEntry, Trainer } from "../types";
import { studioDateKey } from "../lib/studio-time";
import {
  DateNavigator,
  DayView,
  MonthView,
  WeekView,
  toTrainerRef,
  weekDays,
  type CalendarEvent,
  type CalendarSession,
  type TrainerRef,
} from "../features/calendar";

/**
 * CALENDAR — shell.
 *
 * Round: Calendar redesign, Sep 2026.
 *
 * This file used to be 1,630 lines: three inline renderers, a hard-coded
 * colour array, and the Mindbody trainer-matching heuristics all in one scope.
 * The rendering now lives in src/features/calendar/ and this keeps only the
 * two jobs that genuinely belong to a container:
 *
 *   1. RESOLVE. Turn ScheduleEntry — whose trainer may be identified by id, by
 *      `trainerName`, or by a Mindbody spelling of a first name — into the
 *      view model the views consume. That fuzzy matching is a real liability
 *      and it stays in exactly one place.
 *   2. FILTER. Trainer selection and the sessions/events toggle.
 *
 * The views are pure: give them sessions and they draw.
 */

type ViewMode = "month" | "week" | "day";
type FilterMode = "all" | "sessions" | "events";

const MS_PER_MIN = 60000;

function safeToDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * "2026-09-08" must not become Sep 7 for anyone west of the studio.
 * Parsed at local noon, which no timezone offset can push across a day line.
 */
function parseDayString(value: any): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }
  return safeToDate(value);
}

export function CalendarView({
  schedules,
  trainers,
  authTrainer,
  isAdmin,
  activeStudioId,
  onSelectClient,
  setView,
  clients,
}: {
  schedules: ScheduleEntry[];
  trainers: Trainer[];
  authTrainer: Trainer | null;
  isAdmin: boolean;
  activeStudioId?: string;
  onSelectClient?: (id: string) => void;
  onStartNewClientOnboarding?: (name: string) => void;
  setView?: (view: any) => void;
  clients?: any[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(
    isAdmin ? "all" : authTrainer?.id || "all",
  );

  /* ---------------- trainers ---------------- */

  const visibleTrainers = useMemo(() => {
    return trainers.filter((t) => {
      if (t.isVisibleOnCalendar === false) return false;

      const isAssigned =
        !activeStudioId ||
        t.primaryHomeStudioId === activeStudioId ||
        t.accessibleStudioIds?.includes(activeStudioId) ||
        t.activeGuestStudioIds?.includes(activeStudioId);
      if (isAssigned) return true;

      // A guest trainer with sessions in this studio still belongs on its
      // calendar even when no assignment field says so.
      return schedules.some((s) => {
        if (s.status === "Cancelled") return false;
        if (activeStudioId && s.studioId && s.studioId !== activeStudioId) return false;
        if (s.trainerId && t.id && String(s.trainerId) === String(t.id)) return true;
        return Boolean(
          s.trainerName &&
            t.fullName &&
            s.trainerName.toLowerCase() === t.fullName.toLowerCase(),
        );
      });
    });
  }, [trainers, activeStudioId, schedules]);

  /**
   * Mindbody names a trainer three different ways depending on the endpoint,
   * so this tries id, then full name, then first name, then a prefix match.
   * Unchanged from the previous implementation on purpose — it is load-bearing
   * for real studio data and this round is a UI round.
   */
  const resolveTrainerId = React.useCallback(
    (s: any): string | null => {
      if (!s) return null;
      const sId = s.trainerId || s.staffId || s.StaffId;
      if (sId) {
        const found = trainers.find((t) => String(t.id) === String(sId));
        if (found) return found.id ?? null;
      }
      const sName = (s.trainerName || s.staffName || s.StaffFirstName || "")
        .trim()
        .toLowerCase();
      if (sName) {
        const found = trainers.find((t) => {
          if (!t.fullName) return false;
          const tFull = t.fullName.trim().toLowerCase();
          const tFirst = ((t as any).firstName || t.fullName).split(" ")[0].trim().toLowerCase();
          return (
            sName === tFull ||
            sName === tFirst ||
            sName.startsWith(tFirst) ||
            tFirst.startsWith(sName)
          );
        });
        if (found) return found.id ?? null;
      }
      return null;
    },
    [trainers],
  );

  const trainerRefs = useMemo(() => {
    const map = new Map<string, TrainerRef>();
    for (const t of visibleTrainers) {
      const ref = toTrainerRef(t);
      map.set(ref.id, ref);
    }
    return map;
  }, [visibleTrainers]);

  /* ---------------- sessions ---------------- */

  const sessions = useMemo<CalendarSession[]>(() => {
    const out: CalendarSession[] = [];
    schedules.forEach((s: any, i) => {
      if (s.status === "Cancelled") return;

      const trainerId = resolveTrainerId(s);
      if (selectedTrainerId !== "all" && trainerId !== selectedTrainerId) return;

      const start = safeToDate(s.startTime || s.StartDateTime || s.date || s.start);
      if (!start) return;
      const end =
        safeToDate(s.endTime || s.EndDateTime || s.endDate) ||
        new Date(start.getTime() + 30 * MS_PER_MIN);

      const isUnavailability = Boolean(
        s.clientName && String(s.clientName).toLowerCase().includes("unavailab"),
      );

      out.push({
        id: String(s.id || s.mindbodyAppointmentId || `${start.getTime()}-${i}`),
        clientId: s.clientId,
        clientName: s.clientName || "Unknown",
        trainerId,
        trainerName: s.trainerName || "",
        start,
        end,
        durationMin: Math.max(
          10,
          Math.round((end.getTime() - start.getTime()) / MS_PER_MIN) || 30,
        ),
        serviceName: s.serviceName,
        isUnavailability,
      });
    });
    return out;
  }, [schedules, resolveTrainerId, selectedTrainerId]);

  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    (clients || []).forEach((c) => {
      if (!Array.isArray(c?.events)) return;
      c.events.forEach((e: any, i: number) => {
        const date = parseDayString(e.date);
        if (!date) return;
        out.push({
          id: String(e.id || `${c.id}-${i}`),
          title: e.title || e.type || "Event",
          clientId: c.id,
          clientName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
          date,
          endDate: parseDayString(e.endDate) || undefined,
          priority: e.priority,
          type: e.type,
        });
      });
    });
    return out;
  }, [clients]);

  const shownSessions = filterMode === "events" ? [] : sessions;
  const shownEvents = filterMode === "sessions" ? [] : events;

  /* ---------------- navigation ---------------- */

  const step = (direction: 1 | -1) => {
    setSelectedDate((cur) => {
      const next = new Date(cur);
      if (viewMode === "month") next.setMonth(cur.getMonth() + direction);
      else if (viewMode === "week") next.setDate(cur.getDate() + 7 * direction);
      else next.setDate(cur.getDate() + direction);
      return next;
    });
  };

  const navLabels = useMemo(() => {
    if (viewMode === "month") {
      return {
        primary: selectedDate.toLocaleDateString(undefined, { month: "long" }),
        secondary: String(selectedDate.getFullYear()),
      };
    }
    if (viewMode === "week") {
      const days = weekDays(selectedDate);
      const a = days[0];
      const b = days[6];
      const sameMonth = a.getMonth() === b.getMonth();
      return {
        primary: sameMonth
          ? `${a.toLocaleDateString(undefined, { month: "short" })} ${a.getDate()}–${b.getDate()}`
          : `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        secondary: String(b.getFullYear()),
      };
    }
    return {
      primary: selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      secondary: selectedDate.toLocaleDateString(undefined, { weekday: "long" }),
    };
  }, [viewMode, selectedDate]);

  /**
   * A schedule's clientId already IS clients/{mindbodyClientId} under strict
   * mode, so a name match can only disagree with it. A block that does not
   * resolve simply does not navigate — it never writes a link as a side effect
   * of a tap, which is what the previous version did.
   */
  const openClient = (clientId: string) => {
    if (!onSelectClient || !setView) return;
    const target = String(clientId).trim();
    const match = (clients || []).find((c) => c?.id && String(c.id).trim() === target);
    if (!match?.id) return;
    onSelectClient(match.id);
    setView("profile");
  };

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setViewMode("day");
  };

  const todayKey = studioDateKey(new Date());
  const viewingToday = studioDateKey(selectedDate) === todayKey;

  return (
    <div className="cal cal-shell">
      <header className="cal-header">
        <div className="cal-header__title">
          <span className="cal-header__icon">
            <CalendarIcon size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <h2 className="cal-header__name">
              {viewMode === "month" ? "Month" : viewMode === "week" ? "Week" : "Day"}
            </h2>
            <div className="cal-header__sub">
              {viewingToday ? "Today" : "Schedule overview"}
            </div>
          </div>
        </div>

        <DateNavigator
          primary={navLabels.primary}
          secondary={navLabels.secondary}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setSelectedDate(new Date())}
          prevLabel={`Previous ${viewMode}`}
          nextLabel={`Next ${viewMode}`}
        />

        <div className="cal-seg" role="group" aria-label="View">
          {(["month", "week", "day"] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className="cal-seg__btn"
              aria-pressed={viewMode === m}
              onClick={() => setViewMode(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {viewMode === "month" && (
          <div className="cal-seg" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["sessions", "Sessions"],
                ["events", "Events"],
              ] as [FilterMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="cal-seg__btn"
                aria-pressed={filterMode === mode}
                onClick={() => setFilterMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <label className="cal-picker">
          <Users size={15} strokeWidth={2.4} aria-hidden />
          <span className="sr-only">Filter by trainer</span>
          <select
            value={selectedTrainerId}
            onChange={(e) => setSelectedTrainerId(e.target.value)}
            disabled={!isAdmin && !!authTrainer?.id}
          >
            <option value="all">Entire team</option>
            {visibleTrainers
              .filter((t) => isAdmin || t.id === authTrainer?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
          </select>
        </label>
      </header>

      {viewMode === "month" && (
        <MonthView
          anchor={selectedDate}
          sessions={shownSessions}
          events={shownEvents}
          trainerRefs={trainerRefs}
          selectedDate={selectedDate}
          onSelectDate={openDay}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          anchor={selectedDate}
          sessions={sessions}
          trainerRefs={trainerRefs}
          onSelectDate={openDay}
        />
      )}

      {viewMode === "day" && (
        <DayView
          date={selectedDate}
          sessions={sessions}
          trainerRefs={trainerRefs}
          onSelectClient={openClient}
        />
      )}
    </div>
  );
}
