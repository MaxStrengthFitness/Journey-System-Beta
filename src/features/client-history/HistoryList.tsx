import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Network, StickyNote } from "lucide-react";
import type { ExerciseLog } from "../../types";
import { formatStudioTime } from "../../lib/studio-time";
import { TrainerAvatar, toneClass, type TrainerRef } from "../calendar";
import { QualityMark } from "../journey-grid";
import {
  describeRange,
  describeSpan,
  describeSpanAdjective,
  isBackfilledSession,
  isLegacySession,
  parseKey,
  routineLetter,
  sessionStartInstant,
  shortDate,
  summarizeSession,
  weekdayOf,
  type HistorySession,
  type ListBreakItem,
  type ListMonth,
  type ListSessionItem,
} from "./model";

/**
 * HISTORY — the list.
 *
 * One month per card, newest first, one row per session, and the breaks
 * written in between the sessions they separate, in the calendar's hatch.
 *
 * A row reads left to right in the order a trainer asks the questions:
 *   WHEN   the day, in the calendar's own tile
 *   WHO    the trainer, in their calendar colour (and as the row's left edge)
 *   WHAT   session number, routine letter, time
 *   HOW    one bar per machine in the Journey grid's rep-quality colours,
 *          stars and kaizens counted, machines that went up in weight
 *   HOW MUCH  volume, against the last session on the same routine
 *
 * Sets are loaded per month, when the month scrolls near the screen, so a
 * two-year history does not cost two years of reads to open.
 */

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The note LogPastSessionDialog stamps on every backfilled session. */
export const BACKFILL_NOTE = "Manually inputted past session.";

/**
 * True once the element has come within ~1.5 screens of the page scroller's
 * visible area, and from then on.
 *
 * The observer's root has to be the SCROLLER (the app's `<main>`), not the
 * window: `<main>` clips its content, so against the window every section
 * off-screen is clipped to nothing and the margin never gets a chance to
 * prefetch — each month would flash its placeholder as it scrolled in.
 */
function useNear<T extends HTMLElement>(root: HTMLElement | null) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root, rootMargin: "900px 0px 900px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root, near]);

  return { ref, near };
}

export interface SessionRowProps {
  item: ListSessionItem;
  logs: ExerciseLog[] | undefined;
  weightUps: number | undefined;
  delta: { pct: number; against: string | null } | undefined;
  trainer: TrainerRef | null;
  /** The routine's name, resolved from the session's routineId. */
  routineName: string | null;
  timeZone?: string;
  onOpen: (session: HistorySession) => void;
}

export const SessionRow = memo(function SessionRow({
  item,
  logs,
  weightUps,
  delta,
  trainer,
  routineName,
  timeZone,
  onOpen,
}: SessionRowProps) {
  const s = item.session;
  const summary = logs ? summarizeSession(logs) : null;
  const legacy = isLegacySession(s);
  const backfilled = isBackfilledSession(s);
  const instant = legacy || backfilled ? null : sessionStartInstant(s);
  const time = instant ? formatStudioTime(instant, timeZone) : null;
  const letter = routineLetter(routineName);
  const day = item.dayKey ? parseKey(item.dayKey).day : null;
  const dow = item.dayKey ? DOW_SHORT[weekdayOf(item.dayKey)] : "—";
  // "Log past session" writes this sentence into every backfill; the row
  // already says "Logged later", so it is not repeated as a note.
  const rawNote = (s.notes || s.legacy_notes || "").trim();
  const note = rawNote === BACKFILL_NOTE ? "" : rawNote;
  const isOpen = s.status !== "Completed";

  const label = [
    item.number ? `Session ${item.number}` : "Session",
    item.dayKey ?? "undated",
    trainer ? `with ${trainer.name}` : "",
    summary ? `${summary.machines} machines` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      className={`hist-row ${trainer ? toneClass(trainer.tone) : ""}`}
      onClick={() => onOpen(s)}
      aria-label={label}
    >
      <span className="hist-date" aria-hidden>
        <span className="hist-date__dow">{dow}</span>
        <span className="hist-date__num">{day ?? "—"}</span>
      </span>

      <span className="hist-main">
        <span className="hist-line">
          {item.number ? <span className="hist-num">S{item.number}</span> : null}
          <span
            className={`hist-routine ${letter ? "" : "hist-routine--none"}`}
            title={routineName ?? "No routine recorded"}
          >
            {letter ?? "•"}
          </span>
          <span className="hist-who">
            {trainer ? (
              <TrainerAvatar trainer={trainer} size="sm" />
            ) : (
              <span className="cal-avatar cal-avatar--sm hist-avatar--unknown" aria-hidden>
                {(s.trainerInitials || "?").slice(0, 2)}
              </span>
            )}
            <span className="hist-who__name">
              {trainer?.shortName || (legacy ? "Imported" : s.trainerInitials || "Unknown")}
            </span>
          </span>
          <span className={`hist-time ${time ? "" : "hist-time--muted"}`}>
            {time ?? (legacy ? "Imported" : backfilled ? "Logged later" : "—")}
          </span>
          {isOpen && <span className="hist-tag hist-tag--open">Not closed out</span>}
          {s.isCrossTrain && (
            <span className="hist-tag hist-tag--live">
              <Network size={10} strokeWidth={3} aria-hidden /> Cross-train
            </span>
          )}
          {s.sessionType && s.sessionType !== "Standard" && <span className="hist-tag">{s.sessionType}</span>}
        </span>

        <span className="hist-line">
          {summary === null ? (
            <span className="hist-strip hist-strip--waiting" aria-label="Loading sets">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          ) : summary.machines === 0 ? (
            <span className="hist-meta">No sets recorded</span>
          ) : (
            <>
              <span
                className="hist-strip"
                aria-label={`${summary.max} max strength, ${summary.done} completed, ${summary.poor} to work on`}
              >
                {summary.strip.map((q, i) => (
                  <i key={`${q.machineId}-${i}`} data-q={q.quality} />
                ))}
              </span>
              <span className="hist-meta">
                <b>{summary.machines}</b> machine{summary.machines === 1 ? "" : "s"}
              </span>
              {summary.max > 0 && (
                <span className="hist-meta hist-meta--star" title="Max strength sets">
                  <QualityMark quality={3} size={12} />
                  <b>{summary.max}</b>
                </span>
              )}
              {summary.poor > 0 && (
                <span className="hist-meta hist-meta--kaizen" title="Sets with room to improve">
                  <QualityMark quality={1} size={12} />
                  <b>{summary.poor}</b>
                </span>
              )}
              {weightUps ? (
                <span className="hist-meta hist-meta--up" title="Machines heavier than last time">
                  <ArrowUpRight size={13} strokeWidth={3} aria-hidden />
                  <b>{weightUps}</b> heavier
                </span>
              ) : null}
            </>
          )}
          {item.gapDays !== null && item.gapDays > 0 && (
            <span className="hist-meta" title="Days since the previous visit">
              {describeSpan(item.gapDays)} after last
            </span>
          )}
        </span>

        {note && (
          <span className="hist-line hist-line--note">
            <StickyNote size={12} strokeWidth={2.4} aria-hidden style={{ color: "var(--cal-ink-faint)", flex: "0 0 auto" }} />
            <span className="hist-note">{note}</span>
          </span>
        )}
      </span>

      <span className="hist-vol">
        <span className="hist-vol__label">Volume</span>
        <span className="hist-vol__num">
          {summary && summary.volume > 0 ? summary.volume.toLocaleString() : "—"}
          {summary && summary.volume > 0 ? <small>lb</small> : null}
        </span>
        {delta && delta.pct !== 0 ? (
          <span
            className={`hist-vol__delta ${delta.pct > 0 ? "hist-vol__delta--up" : "hist-vol__delta--down"}`}
            title={routineName && delta.against ? `vs the last ${routineName}` : "vs the last session"}
          >
            {delta.pct > 0 ? `+${delta.pct}%` : `${delta.pct}%`}
          </span>
        ) : null}
      </span>
    </button>
  );
});

export const BreakRow = memo(function BreakRow({
  item,
  currentYear,
}: {
  item: ListBreakItem;
  currentYear: number;
}) {
  const { gap, away } = item;
  return (
    <div className={`hist-break ${gap.ongoing ? "hist-break--ongoing" : ""}`} role="note">
      {gap.ongoing && <AlertTriangle size={14} strokeWidth={2.6} aria-hidden style={{ color: "var(--eq-alert)" }} />}
      <b>{gap.ongoing ? `No visit in ${describeSpan(gap.days)}` : `${describeSpanAdjective(gap.days)} break`}</b>
      <span>
        {gap.ongoing ? `last visit ${shortDate(gap.from, currentYear)}` : describeRange(gap.from, gap.to, currentYear)}
      </span>
      {away && <span className="hist-tag hist-tag--away">{away.title}</span>}
    </div>
  );
});

export interface ListMonthSectionProps {
  month: ListMonth;
  logsBySession: ReadonlyMap<string, ExerciseLog[]>;
  weightUps: ReadonlyMap<string, number>;
  deltas: ReadonlyMap<string, { pct: number; against: string | null }>;
  trainerFor: (session: HistorySession) => TrainerRef | null;
  routineNameFor: (session: HistorySession) => string | null;
  currentYear: number;
  timeZone?: string;
  scrollRoot: HTMLElement | null;
  onOpen: (session: HistorySession) => void;
  onNeedLogs: (sessionIds: string[]) => void;
}

export const ListMonthSection = memo(function ListMonthSection({
  month,
  logsBySession,
  weightUps,
  deltas,
  trainerFor,
  routineNameFor,
  currentYear,
  timeZone,
  scrollRoot,
  onOpen,
  onNeedLogs,
}: ListMonthSectionProps) {
  const { ref, near } = useNear<HTMLElement>(scrollRoot);
  const idsKey = useMemo(
    () =>
      month.items
        .filter((i): i is ListSessionItem => i.kind === "session")
        .map((i) => i.session.id)
        .filter((id): id is string => Boolean(id))
        .join(","),
    [month.items],
  );

  // Once near, ask again whenever the month's sessions change — a session
  // logged into a month already on screen, or older ones arriving with "Load
  // full history". The loader skips anything it already has.
  useEffect(() => {
    if (near && idsKey) onNeedLogs(idsKey.split(","));
  }, [near, idsKey, onNeedLogs]);

  return (
    <section
      ref={ref}
      className="hist-lmonth"
      id={`hist-month-${month.key}`}
      aria-label={month.year ? `${month.name} ${month.year}` : month.name}
    >
      <header className="hist-lmonth__head">
        <span className="hist-lmonth__name">{month.name}</span>
        {month.year > 0 && <span className="hist-lmonth__year">{month.year}</span>}
        <span className="hist-rule" aria-hidden />
        <span className="hist-lmonth__count">
          {month.sessions} session{month.sessions === 1 ? "" : "s"}
        </span>
      </header>
      <div className="hist-lcard">
        {month.items.map((item) =>
          item.kind === "session" ? (
            <SessionRow
              key={item.id}
              item={item}
              logs={item.session.id ? logsBySession.get(item.session.id) : []}
              weightUps={item.session.id ? weightUps.get(item.session.id) : undefined}
              delta={item.session.id ? deltas.get(item.session.id) : undefined}
              trainer={trainerFor(item.session)}
              routineName={routineNameFor(item.session)}
              timeZone={timeZone}
              onOpen={onOpen}
            />
          ) : (
            <BreakRow key={item.id} item={item} currentYear={currentYear} />
          ),
        )}
      </div>
    </section>
  );
});

export interface HistoryListProps {
  months: ListMonth[];
  logsBySession: ReadonlyMap<string, ExerciseLog[]>;
  weightUps: ReadonlyMap<string, number>;
  deltas: ReadonlyMap<string, { pct: number; against: string | null }>;
  trainerFor: (session: HistorySession) => TrainerRef | null;
  routineNameFor: (session: HistorySession) => string | null;
  currentYear: number;
  timeZone?: string;
  scrollRoot: HTMLElement | null;
  onOpen: (session: HistorySession) => void;
  onNeedLogs: (sessionIds: string[]) => void;
}

/**
 * The list. A break that is still going is NOT repeated at the top: the
 * notice above the stats already says it, in the same words, in both views.
 */
export function HistoryList({ months, ...rest }: HistoryListProps) {
  return (
    <div className="hist-list">
      {months.map((m) => (
        <ListMonthSection key={m.key} month={m} {...rest} />
      ))}
    </div>
  );
}
