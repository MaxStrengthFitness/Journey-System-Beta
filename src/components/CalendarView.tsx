import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, RefreshCw, Users } from "lucide-react";
import { ScheduleEntry, Trainer } from "../types";
import { studioDateKey } from "../lib/studio-time";
import { freshnessLabel } from "../lib/schedule-window";
import { LoadingMark } from "./LoadingMark";
import { RelayStrip } from "../features/relay/board/RelayStrip";
import {
  DateNavigator,
  DayView,
  MonthView,
  WeekView,
  toTrainerRef,
  visibleRange,
  weekDays,
  type CalendarEvent,
  type CalendarSession,
  type TrainerRef,
} from "../features/calendar";
import { fordCalendarEvents, type CalendarClient } from "../features/calendar/ford-events";
import { useCalendarFord } from "../features/calendar/useCalendarFord";

/** The local calendar day of a Date the calendar built at local noon. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

/**
 * The schedule window (cost clean-up round, Sep 2026). Only today and its
 * neighbours are live; everything else the calendar shows is fetched on
 * demand by `useLiveSchedule`. The calendar tells the hook which range is on
 * screen and offers a manual re-read. Optional so the component still renders
 * from a plain `schedules` list (tests, older call sites).
 */
export interface ScheduleWindowControls {
  ensureRange(from: Date, to: Date, force?: boolean): void;
  refresh(): void;
  /**
   * Asks Mindbody for the days on screen and resolves when that is written
   * (AJ, Sep 26 2026). Optional: without it Refresh re-reads only what
   * Journey already holds, which cannot show a change Mindbody has not
   * sent yet.
   */
  pullFromMindbody?(from: Date, to: Date): Promise<void>;
  lastFetchedAt: number | null;
  isFetching: boolean;
}

const MS_PER_MIN = 60000;

/** How often the "Updated N min ago" caption re-reads the clock. */
const FRESHNESS_TICK_MS = 30_000;

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
  activeStudioId,
  onSelectClient,
  setView,
  clients,
  scheduleWindow,
}: {
  schedules: ScheduleEntry[];
  trainers: Trainer[];
  authTrainer: Trainer | null;
  /** No longer narrows anything: everyone sees the whole team (Oct 2 2026). Kept for the call site. */
  isAdmin?: boolean;
  activeStudioId?: string;
  onSelectClient?: (id: string) => void;
  onStartNewClientOnboarding?: (name: string) => void;
  setView?: (view: any) => void;
  clients?: any[];
  scheduleWindow?: ScheduleWindowControls;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  // Everyone sees the whole team (the Atlas answers, Oct 2 2026): the
  // calendar opens on the entire team and anyone may pick any trainer.
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("all");

  /* ---------------- the schedule window ---------------- */

  /**
   * Ask the hook for whatever is on screen. The prop object is rebuilt on
   * every AppContent render, so the effect keys on the (stable) callback, not
   * the object — otherwise it would fire every render. A range already read
   * in the last hour costs nothing; see `rangeToFetch`.
   */
  const ensureRange = scheduleWindow?.ensureRange;
  useEffect(() => {
    if (!ensureRange) return;
    const { from, to } = visibleRange(viewMode, selectedDate);
    ensureRange(from, to);
  }, [ensureRange, viewMode, selectedDate]);

  /**
   * Refresh asks Mindbody for the days on screen - the month in Month, the
   * week in Week, the day in Day - and then re-reads BOTH the week the rest
   * of the app keeps fresh and the range on screen, forced. Re-reading alone
   * only showed what Journey already held: a booking made in Mindbody for
   * later this month waited for the next morning's pull (AJ, Sep 26 2026).
   * Only the week would leave someone looking at next month with a caption
   * saying "Updated just now" over stale days.
   */
  const latestWindow = useRef(scheduleWindow);
  latestWindow.current = scheduleWindow;
  const refreshSchedules = async () => {
    if (!scheduleWindow) return;
    const { from, to } = visibleRange(viewMode, selectedDate);
    // The pull reports its own trouble; the re-read below runs either way,
    // since a failed pull still leaves Journey's copy worth showing.
    if (scheduleWindow.pullFromMindbody) {
      await scheduleWindow.pullFromMindbody(from, to).catch(() => undefined);
    }
    // The controls as they are NOW: a pull takes seconds, and a studio
    // switched meanwhile must not have the old studio's rows read into it.
    const current = latestWindow.current;
    if (!current) return;
    current.refresh();
    current.ensureRange(from, to, true);
  };

  // The caption ("Updated 3 min ago") has to age while nothing else changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(t);
  }, []);
  const lastFetchedAt = scheduleWindow?.lastFetchedAt ?? null;
  const freshness = useMemo(
    // Read the clock again on each new fetch so a fresh read says "just now"
    // at once instead of waiting for the next tick.
    () => freshnessLabel(lastFetchedAt, Math.max(now, lastFetchedAt ?? 0)),
    [lastFetchedAt, now],
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

  /**
   * Events are clients' FORD dates (the Atlas answers, Oct 2 2026): every
   * client's birthday, every year, and each dated FORD detail on the days on
   * screen (features/calendar/ford-events.ts). The frozen `client.events`
   * list is no longer read. One read of the studio's FORD per month on
   * screen, only while Month shows events.
   */
  const monthRange = useMemo(() => {
    const r = visibleRange("month", selectedDate);
    return { from: localDayKey(r.from), to: localDayKey(r.to) };
  }, [selectedDate]);
  const ford = useCalendarFord(activeStudioId ?? null, monthRange.from, monthRange.to, viewMode === "month" && filterMode !== "sessions");
  const events = useMemo<CalendarEvent[]>(
    () =>
      fordCalendarEvents({
        details: ford.details,
        clients: (clients ?? []) as CalendarClient[],
        studioId: activeStudioId ?? null,
        from: monthRange.from,
        to: monthRange.to,
      }),
    [ford.details, clients, activeStudioId, monthRange.from, monthRange.to],
  );

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
              {m === "month" ? "Month" : m === "week" ? "Week" : "Day"}
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
          >
            <option value="all">Entire team</option>
            {visibleTrainers
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
          </select>
        </label>

        {scheduleWindow && (
          <div className="cal-refresh">
            <button
              type="button"
              className="cal-refresh__btn"
              onClick={() => void refreshSchedules()}
              disabled={scheduleWindow.isFetching}
              aria-label="Refresh the schedule"
            >
              {scheduleWindow.isFetching ? (
                <LoadingMark label="" size="sm" />
              ) : (
                <RefreshCw size={15} strokeWidth={2.4} aria-hidden />
              )}
              Refresh
            </button>
            <span className="cal-refresh__note" role="status" aria-live="polite">
              {scheduleWindow.isFetching ? "Updating…" : freshness}
            </span>
          </div>
        )}
      </header>

      {/* The Relay layer: reminders, timed studio tasks, jobs, initiatives
          and hand-offs on the days on screen (Relay, Sep 2026; was the
          reminders strip of the Planner rework). */}
      <RelayStrip
        studioId={activeStudioId ?? null}
        trainerId={authTrainer?.id ?? null}
        from={visibleRange(viewMode, selectedDate).from}
        to={visibleRange(viewMode, selectedDate).to}
        onOpenPlanner={setView ? () => setView("studio-tasks") : undefined}
      />

      {viewMode === "month" && filterMode !== "sessions" && ford.status === "failed" && (
        <p className="cal-refresh__note" role="status">
          {"Couldn\u2019t read the studio\u2019s FORD dates just now, so only birthdays show."}
        </p>
      )}

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
