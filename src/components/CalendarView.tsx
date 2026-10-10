import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Client, ScheduleEntry, Trainer, WorkoutSession } from "../types";
import { studioDateKey, studioDayBoundsForKey } from "../lib/studio-time";
import { FETCH_RETRY_MS, dayKeysBetween, freshnessLabel, liveWindow, type DayReadState } from "../lib/schedule-window";
import { cardDayReadable } from "../lib/hub-card-state";
import { hubWindow } from "../features/hub-schedule/hub-window";
import { LoadingMark } from "./LoadingMark";
import { RelayStrip } from "../features/relay/board/RelayStrip";
import { RoomBar, RoomSwitch, type RoomSwitchOption } from "../features/rooms";
import { HubNotice } from "../features/hub-schedule/HubGrid";
import { UNASSIGNED_ID, columnIdOf, worksHereOnCalendar } from "../features/hub-schedule/columns";
import { trainerDayFrame, weeksByTrainer } from "../features/hub-schedule/off-hours";
import type { Span } from "../features/hub-schedule/grid-model";
import { staffIdsAt } from "../features/standing-week/check";
import { mayReadWeeks } from "../features/standing-week/present";
import { useStandingWeeks } from "../features/standing-week/useStandingWeeks";
import { weekdayOf } from "../features/client-history/model";
import { usePhone } from "../features/phone/device";
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
import { DayLife, eventsOnDay } from "../features/calendar/DayLife";
import { dayToDate, fordCalendarEvents, type CalendarClient } from "../features/calendar/ford-events";
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

/** One empty list, so the Day's bookings don't look new on every render while another view is up. */
const NO_BOOKINGS: any[] = [];
const NO_SESSIONS: ReadonlyArray<WorkoutSession> = [];

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

/**
 * The next or previous month, week or day. A month steps from its 1st (the
 * review, Oct 10 2026): Oct 31 plus a month is "Nov 31", which a Date rolls
 * on to Dec 1, so Next skipped November; Mar 31 back a month landed on Mar 3.
 */
export function stepDate(cur: Date, viewMode: ViewMode, direction: 1 | -1): Date {
  const next = new Date(cur);
  if (viewMode === "month") {
    next.setDate(1);
    next.setMonth(cur.getMonth() + direction);
  } else if (viewMode === "week") next.setDate(cur.getDate() + 7 * direction);
  else next.setDate(cur.getDate() + direction);
  return next;
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
  mindbodySiteId = null,
  rosterStatus,
  sessions: workoutSessions = NO_SESSIONS,
  sessionsKnown = false,
}: {
  schedules: ScheduleEntry[];
  /** The trainers, in the studio's order (AppContent's sortedTrainers). */
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
  /** This studio's Mindbody site: staff ids are numbered per site (the Hub's column rule). */
  mindbodySiteId?: string | number | null;
  /** The studio's client list ("loading", "ready", "error"): a card says nothing about sync off a list nobody read. */
  rosterStatus?: string;
  /**
   * The app's session stream (useSessions: the studio's last 24 hours) and
   * whether its server has answered: the Day's cards say what happened from
   * it, as the Hub's do, on the days it covers (`cardDayReadable`).
   */
  sessions?: ReadonlyArray<WorkoutSession>;
  sessionsKnown?: boolean;
}) {
  const isPhone = usePhone();
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
   *
   * Each day's state is asked once a render, into one map the views read
   * (the review, Oct 10 2026: the Month and the Week asked the hook about
   * eighty times a render).
   */
  const dayStateFn = scheduleWindow?.dayState;
  const stateOf = React.useCallback(
    (key: string): DayReadState => (dayStateFn ? dayStateFn(key) : "ready"),
    [dayStateFn],
  );
  const rangeKeys = useMemo(() => dayKeysOfRange(range.from, range.to), [range]);
  const dayStates = useMemo(() => {
    const out = new Map<string, DayReadState>();
    for (const key of rangeKeys) out.set(key, stateOf(key));
    return out;
  }, [rangeKeys, stateOf]);
  const stateOfDay = React.useCallback((key: string): DayReadState => dayStates.get(key) ?? stateOf(key), [dayStates, stateOf]);
  const failedKeys = useMemo(() => rangeKeys.filter((key) => dayStates.get(key) === "failed"), [rangeKeys, dayStates]);
  const failedDays = failedKeys.length;
  /*
   * Which failed days are whose. The live days (yesterday to tomorrow) are the
   * listener's, which reopens itself after a failure; the others were fetched,
   * and a retry reads only their span, from the first to the last, never the
   * whole range on screen.
   */
  const { liveFailed, fetchedSpan } = useMemo(() => {
    const live = liveWindow(new Date());
    const liveKeys = new Set(dayKeysBetween(live.from, live.to));
    const fetched = failedKeys.filter((key) => !liveKeys.has(key));
    return {
      liveFailed: failedKeys.some((key) => liveKeys.has(key)),
      fetchedSpan: fetched.length > 0 ? `${fetched[0]}|${fetched[fetched.length - 1]}` : "",
    };
  }, [failedKeys]);
  const readFetchedSpan = React.useCallback(() => {
    const current = latestWindow.current;
    if (!current || !fetchedSpan) return;
    const [first, last] = fetchedSpan.split("|");
    // Forced: a day whose earlier read landed keeps that read's stamp, and an
    // unforced ask would find it fresh and skip it.
    current.ensureRange(dayToDate(first), dayToDate(last), true);
  }, [fetchedSpan]);

  /*
   * A failed day is asked for again while it is on screen and the page is
   * visible, every FETCH_RETRY_MS, until none remain (the review, Oct 10 2026:
   * it was asked once, keyed on how many days had failed).
   */
  useEffect(() => {
    if (!fetchedSpan) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      readFetchedSpan();
    }, FETCH_RETRY_MS);
    return () => clearInterval(t);
  }, [fetchedSpan, readFetchedSpan]);

  /* Try again: the listener reopened when a live day failed, and the fetched failed days read again. */
  const retryUnread = () => {
    if (liveFailed) latestWindow.current?.retry?.();
    readFetchedSpan();
  };

  /* ---------------- trainers ---------------- */

  /*
   * WHOSE BOOKING (the rooms round, Oct 10 2026): the Hub's rule
   * (hub-schedule/columns.ts) — the booking's trainer id, else the Mindbody
   * staff id at this studio's site, else Unassigned. Never a name. The
   * Calendar matched a name down to a first name or its first letters, so two
   * Chrises could swap and a "Chris" took Christine's bookings; the Hub
   * retired that on Oct 1 2026 and the Calendar follows it now.
   */
  const trainerIdSet = useMemo(
    () => new Set(trainers.map((t) => (t.id ? String(t.id) : "")).filter(Boolean)),
    [trainers],
  );
  const staffIds = useMemo(() => staffIdsAt(trainers as any, mindbodySiteId ?? null), [trainers, mindbodySiteId]);
  const whoseBooking = React.useCallback(
    (s: any): string | null => {
      const column = columnIdOf(s, trainerIdSet, staffIds);
      return column === null || column === UNASSIGNED_ID ? null : column;
    },
    [trainerIdSet, staffIds],
  );

  /* The team at this studio, and a guest whose bookings here are theirs by id. */
  const visibleTrainers = useMemo(() => {
    const guests = new Set<string>();
    for (const s of schedules as any[]) {
      if (s.status === "Cancelled") continue;
      if (activeStudioId && s.studioId && s.studioId !== activeStudioId) continue;
      const id = whoseBooking(s);
      if (id) guests.add(id);
    }
    return trainers.filter((t) => worksHereOnCalendar(t, activeStudioId ?? null) || (t.id ? guests.has(String(t.id)) : false));
  }, [trainers, activeStudioId, schedules, whoseBooking]);

  const trainerRefs = useMemo(() => {
    const map = new Map<string, TrainerRef>();
    for (const t of visibleTrainers) {
      const ref = toTrainerRef(t);
      map.set(ref.id, ref);
    }
    return map;
  }, [visibleTrainers]);

  /* The studio's order (the trainers arrive sorted): who comes first in a Week slot after you. */
  const trainerOrder = useMemo(() => trainers.map((t) => String(t.id ?? "")).filter(Boolean), [trainers]);

  const pickerTrainers = useMemo(
    () => visibleTrainers.filter((t) => t.id).map((t) => ({ id: String(t.id), name: (t.fullName || "").trim() || "Trainer" })),
    [visibleTrainers],
  );

  /* ---------------- sessions ---------------- */

  const sessions = useMemo<CalendarSession[]>(() => {
    const out: CalendarSession[] = [];
    schedules.forEach((s: any, i) => {
      if (s.status === "Cancelled") return;

      const trainerId = whoseBooking(s);
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
  }, [schedules, whoseBooking, selectedTrainerId]);

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
    setSelectedDate((cur) => stepDate(cur, viewMode, direction));
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
  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients ?? []) if (c?.id) map.set(String(c.id).trim(), c as Client);
    return map;
  }, [clients]);
  /*
   * Has a booking's client a profile to open? A Week booking with none says
   * so (the Hub card's "Not synced yet"), never a tap that does nothing; while
   * the client list loads or after it failed, it is unknown and says nothing.
   */
  const profileOf = React.useCallback(
    (clientId: string | null | undefined): "linked" | "unlinked" | "unknown" => {
      const id = clientId ? String(clientId).trim() : "";
      if (!id) return "unlinked";
      if (clientsById.has(id)) return "linked";
      return rosterStatus === "loading" || rosterStatus === "error" ? "unknown" : "unlinked";
    },
    [clientsById, rosterStatus],
  );
  /*
   * ONE handler for every booking, kept across renders (the review, Oct 10
   * 2026): a new one each render redrew every memoised card and booking on a
   * 30-second tick. It reads the latest clients and doors through a ref.
   */
  const latestDoors = useRef({ clientsById, onSelectClient, setView });
  latestDoors.current = { clientsById, onSelectClient, setView };
  const openClient = React.useCallback((clientId: string) => {
    const { clientsById: byId, onSelectClient: select, setView: go } = latestDoors.current;
    if (!select || !go) return;
    const match = byId.get(String(clientId).trim());
    if (!match?.id) return;
    select(match.id);
    go("profile");
  }, []);

  const openDay = React.useCallback((date: Date) => {
    setSelectedDate(date);
    setViewMode("day");
  }, []);

  const todayKey = studioDateKey(new Date());
  const pickedToday = studioDateKey(selectedDate) === todayKey;

  /* ---------------- the Day: the Hub's grid ---------------- */

  const dayKey = studioDateKey(selectedDate) ?? localDayKey(selectedDate);
  /* The day's bookings at this studio, in time order (the Hub's own filter). */
  const dayBookings = useMemo(() => {
    if (viewMode !== "day") return NO_BOOKINGS;
    const { start, end } = studioDayBoundsForKey(dayKey);
    return (schedules as any[])
      .filter((s) => {
        if (s.status === "Cancelled") return false;
        const at = safeToDate(s.startTime || s.StartDateTime || s.date);
        return !!at && at >= start && at <= end;
      })
      .sort((a, b) => {
        const x = safeToDate(a.startTime || a.StartDateTime || a.date)?.getTime() ?? 0;
        const y = safeToDate(b.startTime || b.StartDateTime || b.date)?.getTime() ?? 0;
        return x - y;
      });
  }, [viewMode, schedules, dayKey]);
  const nowDate = useMemo(() => new Date(now), [now]);

  /*
   * May the Day's cards say what happened? Only on the days the session
   * stream covers (lib/hub-card-state `cardDayReadable`: the studio's today
   * once its server has answered, and the days ahead in the Hub's window);
   * elsewhere a card is "unread", no fade and no word (AJ's Sep 24 rule).
   */
  const studioToday = todayKey ?? dayKey;
  const dayReadable = cardDayReadable(dayKey, {
    today: studioToday,
    lastDay: hubWindow(studioToday, studioToday).to,
    sessionsKnown,
  });
  const readsStudio = mayReadWeeks(authTrainer, activeStudioId ?? null);

  /* The team filter's trainer, by name ("you" when it's yours): an empty day says whose it is. */
  const filterName =
    selectedTrainerId === ENTIRE_TEAM
      ? null
      : authTrainer?.id && selectedTrainerId === String(authTrainer.id)
        ? "you"
        : pickerTrainers.find((t) => t.id === selectedTrainerId)?.name ?? null;

  /*
   * Who's on (the Hub's hatching): the AGREED standing weeks, one listener on
   * the studio's, only while the Day is on an iPad and only for someone who
   * may read them (mayReadWeeks, the rule the Hub asks), so no refused
   * listener is opened. It is the Hub's own read, and the Hub is not mounted
   * while the Calendar is. No agreed week, or no answer, hatches nothing.
   */
  const readsWeeks = viewMode === "day" && !isPhone && readsStudio;
  const standingWeeks = useStandingWeeks(readsWeeks ? activeStudioId : null);
  const weeks = useMemo(() => weeksByTrainer(standingWeeks.docs), [standingWeeks.docs]);
  const weekday = weekdayOf(dayKey);
  const frameOf = React.useCallback(
    (columnId: string, span: Span) => trainerDayFrame(weeks.get(columnId), dayKey, weekday, span),
    [weeks, dayKey, weekday],
  );
  const dayEvents = useMemo(() => (viewMode === "day" ? eventsOnDay(events, selectedDate) : []), [viewMode, events, selectedDate]);

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
              <span className="cal-refresh__word">Refresh</span>
            </button>
            <span className="cal-refresh__note" role="status" aria-live="polite">
              {scheduleWindow.isFetching ? "Updating…" : freshness}
            </span>
          </div>
        )}
      </RoomBar>

      {failedDays > 0 && <HubNotice words={unreadWords(viewMode, failedDays)} onRetry={retryUnread} />}

      {viewMode === "day" ? (
        /* The Day is the Hub's grid, which is its own scroller for both axes
           (its names row sticks to the top, its rail to the left), so it
           takes the room under the bar rather than sitting in the body's. */
        <div className="cal-daybody">
          <div className="cal-daytop">
            <RelayStrip
              studioId={activeStudioId ?? null}
              trainerId={authTrainer?.id ?? null}
              from={range.from}
              to={range.to}
              onOpenPlanner={setView ? () => setView("studio-tasks") : undefined}
            />
            <DayLife events={dayEvents} onOpenClient={openClient} />
          </div>
          <DayView
            dayKey={dayKey}
            bookings={dayBookings}
            trainers={trainers}
            studioId={activeStudioId ?? null}
            staffIds={staffIds}
            selfId={authTrainer?.id ?? null}
            onlyTrainerId={selectedTrainerId === ENTIRE_TEAM ? null : selectedTrainerId}
            clientsById={clientsById}
            rosterLoading={rosterStatus === "loading"}
            rosterFailed={rosterStatus === "error"}
            now={nowDate}
            readState={stateOfDay(dayKey)}
            sessions={workoutSessions}
            sessionsKnown={sessionsKnown}
            readable={dayReadable}
            readsStudio={readsStudio}
            frameOf={readsWeeks ? frameOf : undefined}
            phone={isPhone}
            onOpenClient={openClient}
          />
        </div>
      ) : (
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

        {/* Narrowed to one trainer, the page says whose bookings these are (the review, Oct 10 2026). */}
        {filterName && (
          <p className="cal-note" role="status">
            {`Showing ${filterName === "you" ? "your" : `${filterName}’s`} bookings only.`}
          </p>
        )}

        {viewMode === "month" && (
          <MonthView
            anchor={selectedDate}
            sessions={sessions}
            events={events}
            selectedDate={selectedDate}
            onSelectDate={openDay}
            stateOf={stateOfDay}
            filterName={filterName}
          />
        )}

        {viewMode === "week" && (
          <WeekView
            anchor={selectedDate}
            sessions={sessions}
            trainerRefs={trainerRefs}
            trainerOrder={trainerOrder}
            selfId={authTrainer?.id ?? null}
            selectedDate={selectedDate}
            onSelectDate={openDay}
            onSelectClient={openClient}
            stateOf={stateOfDay}
            priorStateOf={stateOf}
            filterName={filterName}
            profileOf={profileOf}
          />
        )}
      </div>
      )}
    </div>
  );
}
