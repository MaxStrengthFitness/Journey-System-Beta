import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, History, List as ListIcon, PlusCircle } from "lucide-react";
import type { ClientEvent, ExerciseLog, Routine, Trainer } from "../../types";
import { HistoryCalendar } from "./HistoryCalendar";
import { HistoryList } from "./HistoryList";
import { HistoryLegend, HistoryStats, OnBreakNotice } from "./HistoryStats";
import { trainerLookup } from "./trainers";
import {
  buildCalendar,
  buildList,
  computeCadence,
  monthName,
  parseKey,
  shortDate,
  toTimelineEvents,
  toVisitDays,
  todayKey,
  routineNamer,
  volumeDeltas,
  weightUpsBySession,
  type DayKey,
  type HistorySession,
} from "./model";
import "./client-history.css";

export type HistoryViewMode = "calendar" | "list";

export interface HistoryViewProps {
  /** Newest first, as the listener returns them. */
  sessions: HistorySession[];
  status: "loading" | "ready" | "error";
  hasMore: boolean;
  isFull: boolean;
  onLoadAll: () => void;
  /** The client's own completed-session count, for numbering and "of N". */
  clientSessionCount?: number;
  events?: ClientEvent[];
  trainers: Trainer[];
  /** The client's routines — sessions store only a routineId. */
  routines?: Routine[];
  logsBySession: ReadonlyMap<string, ExerciseLog[]>;
  onNeedLogs: (sessionIds: string[]) => void;
  onOpenSessions: (sessions: HistorySession[]) => void;
  onLogPast?: () => void;
  /** Injected by the harness so screenshots do not drift with the date. */
  today?: DayKey;
  timeZone?: string;
  defaultView?: HistoryViewMode;
}

/**
 * The History tab, drawn from plain props — no Firestore in here, so the
 * harness can render it with a synthetic client and the container
 * (ClientHistoryTab) owns every read and write.
 */
export function HistoryView({
  sessions,
  status,
  hasMore,
  isFull,
  onLoadAll,
  clientSessionCount,
  events,
  trainers,
  routines,
  logsBySession,
  onNeedLogs,
  onOpenSessions,
  onLogPast,
  today: todayProp,
  timeZone,
  defaultView = "calendar",
}: HistoryViewProps) {
  const today = todayProp ?? todayKey(new Date(), timeZone);
  const currentYear = parseKey(today).year;
  const [view, setView] = useState<HistoryViewMode>(defaultView);
  const [focusMonth, setFocusMonth] = useState<string | null>(null);

  const { days, undated } = useMemo(
    () => toVisitDays(sessions, timeZone, today),
    [sessions, timeZone, today],
  );
  const timeline = useMemo(() => toTimelineEvents(events), [events]);
  const cadence = useMemo(() => computeCadence(days, today), [days, today]);
  const years = useMemo(
    () => buildCalendar({ days, events: timeline, cadence, today }),
    [days, timeline, cadence, today],
  );
  const list = useMemo(
    () =>
      buildList({
        days,
        undated,
        events: timeline,
        cadence,
        // Everything loaded: count the history itself. A window of it: count
        // down from the client's own total so the oldest loaded row is not "S1".
        numberAnchor: hasMore ? clientSessionCount : undefined,
      }),
    [days, undated, timeline, cadence, hasMore, clientSessionCount],
  );

  const oldestFirstIds = useMemo(
    () => days.flatMap((d) => d.sessions.map((s) => s.id).filter((id): id is string => Boolean(id))),
    [days],
  );
  const newestFirst = useMemo(
    () => [...days].reverse().flatMap((d) => [...d.sessions].reverse()),
    [days],
  );
  const weightUps = useMemo(
    () => weightUpsBySession(oldestFirstIds, logsBySession),
    [oldestFirstIds, logsBySession],
  );
  const deltas = useMemo(() => volumeDeltas(newestFirst, logsBySession), [newestFirst, logsBySession]);

  const trainerFor = useMemo(() => trainerLookup(trainers), [trainers]);
  const routineNameFor = useMemo(() => routineNamer(routines), [routines]);

  const openMonthInList = useCallback((monthKey: string) => {
    setView("list");
    setFocusMonth(monthKey);
  }, []);

  // After switching to the list, land on the month that was tapped — or, for
  // a month with no sessions, the nearest older month that has some.
  useEffect(() => {
    if (view !== "list" || !focusMonth) return;
    const dated = list.months.filter((m) => m.key !== "undated");
    const target = dated.find((m) => m.key <= focusMonth) ?? dated[dated.length - 1];
    // Cleared INSIDE the frame: clearing it here would re-render, run this
    // effect's cleanup and cancel the scroll before it ever happened.
    const frame = requestAnimationFrame(() => {
      if (target) {
        document
          .getElementById(`hist-month-${target.key}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      setFocusMonth(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, focusMonth, list.months]);

  const openOne = useCallback((s: HistorySession) => onOpenSessions([s]), [onOpenSessions]);

  // Pin the sticky year / month headers to the page scroller's true top edge
  // (see .hist-year__head in client-history.css for why this is measured).
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroller = root ? scrollParentOf(root) : null;
    setScrollRoot(scroller);
    if (!root || !scroller) return;
    const apply = () => {
      const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      root.style.setProperty("--hist-stick-top", `${-pad}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const since = cadence.first ? parseKey(cadence.first) : null;
  const subline =
    status === "loading" && sessions.length === 0
      ? "Loading…"
      : cadence.sessions === 0
        ? "No sessions yet"
        : `${cadence.sessions} session${cadence.sessions === 1 ? "" : "s"} · since ${monthName(since!.month).slice(0, 3)} ${since!.year}`;

  const total = clientSessionCount && clientSessionCount > sessions.length ? clientSessionCount : null;

  return (
    <div ref={rootRef} className="cal cal-shell hist">
      <header className="cal-header">
        <div className="cal-header__title">
          <span className="cal-header__icon">
            <History size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <h2 className="cal-header__name">History</h2>
            <div className="cal-header__sub">{subline}</div>
          </div>
        </div>
        <div className="hist-actions">
          <div className="cal-seg" role="group" aria-label="History view">
            <button
              type="button"
              className="cal-seg__btn"
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              <CalendarDays size={14} strokeWidth={2.6} aria-hidden /> Calendar
            </button>
            <button
              type="button"
              className="cal-seg__btn"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <ListIcon size={14} strokeWidth={2.6} aria-hidden /> List
            </button>
          </div>
          {onLogPast && (
            <button type="button" className="hist-btn" onClick={onLogPast}>
              <PlusCircle size={15} strokeWidth={2.4} aria-hidden /> Log past session
            </button>
          )}
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="cal-empty">
          <span className="cal-empty__title">
            {status === "loading" ? "Loading history…" : status === "error" ? "History did not load" : "No sessions yet"}
          </span>
          {status !== "loading" && (
            <span className="cal-empty__hint">
              {status === "error"
                ? "Check the connection and open the tab again."
                : "Sessions appear here as they are logged. Older ones can be added with Log past session."}
            </span>
          )}
        </div>
      ) : (
        <>
          <OnBreakNotice cadence={cadence} events={timeline} currentYear={currentYear} />
          <HistoryStats cadence={cadence} currentYear={currentYear} />

          {view === "calendar" ? (
            <>
              <HistoryLegend />
              <HistoryCalendar years={years} onOpenDay={onOpenSessions} onOpenMonth={openMonthInList} />
            </>
          ) : (
            <HistoryList
              months={list.months}
              logsBySession={logsBySession}
              weightUps={weightUps}
              deltas={deltas}
              trainerFor={trainerFor}
              routineNameFor={routineNameFor}
              currentYear={currentYear}
              timeZone={timeZone}
              scrollRoot={scrollRoot}
              onOpen={openOne}
              onNeedLogs={onNeedLogs}
            />
          )}

          <footer className="hist-foot">
            {hasMore && !isFull ? (
              <>
                <span>
                  Showing the newest <b>{sessions.length}</b> sessions{total ? ` of ${total}` : ""}.
                </span>
                <button type="button" className="hist-btn" onClick={onLoadAll}>
                  <History size={15} strokeWidth={2.4} aria-hidden /> Load full history
                </button>
              </>
            ) : hasMore ? (
              <span>
                Showing the newest <b>{sessions.length}</b> sessions.
              </span>
            ) : cadence.first ? (
              <span>
                First visit on record · <b>{shortDate(cadence.first, currentYear)}</b>
                {parseKey(cadence.first).year === currentYear ? `, ${currentYear}` : ""}
              </span>
            ) : null}
            {undated.length > 0 && (
              <span>
                {undated.length} session{undated.length === 1 ? " has a date" : "s have dates"} the calendar
                cannot place — listed last in the List view, under "Date needs a look".
              </span>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflowY = getComputedStyle(p).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}
