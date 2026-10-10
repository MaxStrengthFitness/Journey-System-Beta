import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { ScheduleEntry, Trainer } from "../types";
import { studioDateKey } from "../lib/studio-time";
import { FETCH_RETRY_MS, freshnessLabel, type DayReadState } from "../lib/schedule-window";
import { LoadingMark } from "./LoadingMark";
import { RelayStrip } from "../features/relay/board/RelayStrip";
import { RoomBar, RoomSwitch, type RoomSwitchOption } from "../features/rooms";
import { HubNotice } from "../features/hub-schedule/HubGrid";
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
import { ENTIRE_TEAM, TeamPicker } from "../features/calendar/TeamPicker";
import { fordCalendarEvents, type CalendarClient } from "../features/calendar/ford-events";
import { useCalendarFord } from "../features/calendar/useCalendarFord";
import "../features/calendar/calendar.css";

/** The local calendar day of a Date the calendar built at local noon. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * CALENDAR — the first room (the rooms round, Oct 10 2026).
 *
 * AJ: "i feel like im in the learning area or the active session area or
 * the client area so i can instantly know what im looking at when i pull up
 * the app ... i think ill calendar would be the easiest to improve". His
 * picks on "Journey Rooms": 1b (the room bar and a room hue), 2a (Day is the
 * Hub's grid), 3b (Week is the bookings, the charts folded).
 *
 * The container keeps two jobs: it RESOLVES the schedule into what the views
 * draw, and it holds the room's state (which view, which day, whose
 * bookings). The room bar (features/rooms) carries the mark, the name, the
 * one switch Month · Week · Day, the team filter, and under them the date
 * stepper, Today and Refresh. The views are pure: give them bookings and
 * they draw.
 */

type ViewMode = "month" | "week" | "day";

const VIEWS: ReadonlyArray<RoomSwitchOption<ViewMode>> = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

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
  /**
   * What is known about a studio day's bookings (useLiveSchedule's dayState,
   * the Hub's own): a day is drawn as quiet only when it was read; a read
   * that failed is said in place, never an empty day (the rooms round, Oct
   * 10 2026). Absent: read.
   */
  dayState?(dayKey: string): DayReadState;
  /** "Try again" on a failed read (useLiveSchedule's retry). */
  retry?(): void;
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

/** The studio day keys of a range the calendar built at local noon, inclusive. */
export function dayKeysOfRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(from);
  let guard = 0;
  while (cursor.getTime() <= to.getTime() && guard < 60) {
    const key = studioDateKey(cursor);
    if (key) out.push(key);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

/** The words of the one notice above a view whose days weren't all read. */
export function unreadWords(viewMode: ViewMode, failed: number): string {
  if (viewMode === "day") return "Couldn’t read this day’s bookings, so it may look emptier than it is. Trying again.";
  return failed === 1
    ? "Couldn’t read one of these days’ bookings, so it may look emptier than it is. Trying again."
    : `Couldn’t read ${failed} of these days’ bookings, so they may look emptier than they are. Trying again.`;
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  // Everyone sees the whole team (the Atlas answers, Oct 2 2026): the
  // calendar opens on the entire team and anyone may pick any trainer.
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(ENTIRE_TEAM);

  /* ---------------- the schedule window ---------------- */

  const range = useMemo(() => visibleRange(viewMode, selectedDate), [viewMode, selectedDate]);

  /**
   * Ask the hook for whatever is on screen. The prop object is rebuilt on
   * every AppContent render, so the effect keys on the (stable) callback, not
   * the object — otherwise it would fire every render. A range already read
   * in the last hour costs nothing; see `rangeToFetch`.
   */
  const ensureRange = scheduleWindow?.ensureRange;
  useEffect(() => {
    if (!ensureRange) return;
    ensureRange(range.from, range.to);
  }, [ensureRange, range]);

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
    const { from, to } = range;
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

  /*
   * WHAT IS KNOWN ABOUT THE DAYS ON SCREEN (the rooms round, Oct 10 2026;
   * the Hub's rule since Oct 1): a failed read is unknown, never a quiet
   * day. The views draw a day as empty only when it was read, and one plum
   * line above them says when a read failed, with Try again.
   */
  const dayStateFn = scheduleWindow?.dayState;
  const stateOf = React.useCallback(
    (key: string): DayReadState => (dayStateFn ? dayStateFn(key) : "ready"),
    [dayStateFn],
  );
  const rangeKeys = useMemo(() => dayKeysOfRange(range.from, range.to), [range]);
  const failedDays = rangeKeys.filter((k) => stateOf(k) === "failed").length;

  /* A failed range is asked for again while it is on screen: the hook's own
     retry re-reads only the week ahead (useLiveSchedule). */
  useEffect(() => {
    if (!ensureRange || failedDays === 0) return;
    const t = setTimeout(() => ensureRange(range.from, range.to), FETCH_RETRY_MS);
    return () => clearTimeout(t);
  }, [ensureRange, failedDays, range]);

  const retryUnread = () => {
    const current = latestWindow.current;
    if (!current) return;
    current.retry?.();
    current.ensureRange(range.from, range.to, true);
  };

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

  const pickerTrainers = useMemo(
    () => visibleTrainers.filter((t) => t.id).map((t) => ({ id: String(t.id), name: (t.fullName || "").trim() || "Trainer" })),
    [visibleTrainers],
  );

  /* ---------------- sessions ---------------- */

  const sessions = useMemo<CalendarSession[]>(() => {
    const out: CalendarSession[] = [];
    schedules.forEach((s: any, i) => {
      if (s.status === "Cancelled") return;

      const trainerId = resolveTrainerId(s);
      if (selectedTrainerId !== ENTIRE_TEAM && trainerId !== selectedTrainerId) return;

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
   * Life events are clients' FORD dates (the Atlas answers, Oct 2 2026):
   * every client's birthday, every year, and each dated FORD detail on the
   * days on screen (features/calendar/ford-events.ts). One read of the
   * studio's FORD per month on screen, while Month or Day shows them. Month
   * marks the day; Day says them.
   */
  const monthRange = useMemo(() => {
    const r = visibleRange("month", selectedDate);
    return { from: localDayKey(r.from), to: localDayKey(r.to) };
  }, [selectedDate]);
  const ford = useCalendarFord(activeStudioId ?? null, monthRange.from, monthRange.to, viewMode !== "week");
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
  const pickedToday = studioDateKey(selectedDate) === todayKey;

  return (
    <div className="cal cal-room">
      <RoomBar
        room="calendar"
        name="Calendar"
        icon={CalendarDays}
        switcher={<RoomSwitch<ViewMode> label="View" options={VIEWS} value={viewMode} onChange={(next) => setViewMode(next)} />}
        tools={
          <TeamPicker
            trainers={pickerTrainers}
            value={selectedTrainerId}
            onChange={setSelectedTrainerId}
            selfId={authTrainer?.id ?? null}
          />
        }
      >
        <div className="cal-when">
          <DateNavigator
            primary={navLabels.primary}
            secondary={navLabels.secondary}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={() => setSelectedDate(new Date())}
            prevLabel={`Previous ${viewMode}`}
            nextLabel={`Next ${viewMode}`}
          />
          {!pickedToday && (
            <button type="button" className="rm-tool" onClick={() => setSelectedDate(new Date())}>
              Today
            </button>
          )}
        </div>

        {scheduleWindow && (
          <div className="cal-refresh">
            <button
              type="button"
              className="rm-tool cal-refresh__btn"
              onClick={() => void refreshSchedules()}
              disabled={scheduleWindow.isFetching}
              aria-label="Refresh the schedule"
            >
              {scheduleWindow.isFetching ? (
                <LoadingMark label="" size="sm" />
              ) : (
                <RefreshCw size={16} strokeWidth={2.4} aria-hidden />
              )}
              Refresh
            </button>
            <span className="cal-refresh__note" role="status" aria-live="polite">
              {scheduleWindow.isFetching ? "Updating…" : freshness}
            </span>
          </div>
        )}
      </RoomBar>

      {failedDays > 0 && <HubNotice words={unreadWords(viewMode, failedDays)} onRetry={retryUnread} />}

      <div className="cal-body" data-view={viewMode}>
        {/* The Relay layer: reminders, timed studio tasks, jobs, initiatives
            and hand-offs on the days on screen (Relay, Sep 2026; was the
            reminders strip of the Planner rework). */}
        <RelayStrip
          studioId={activeStudioId ?? null}
          trainerId={authTrainer?.id ?? null}
          from={range.from}
          to={range.to}
          onOpenPlanner={setView ? () => setView("studio-tasks") : undefined}
        />

        {viewMode === "month" && ford.status === "failed" && (
          <p className="cal-note" role="status">
            {"Couldn’t read the studio’s FORD dates just now, so only birthdays are marked."}
          </p>
        )}

        {viewMode === "month" && (
          <MonthView
            anchor={selectedDate}
            sessions={sessions}
            events={events}
            trainerRefs={trainerRefs}
            selectedDate={selectedDate}
            onSelectDate={openDay}
            stateOf={stateOf}
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
    </div>
  );
}
