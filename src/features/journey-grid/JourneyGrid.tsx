import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertCircle, ChevronLeft, ChevronsRight, NotebookPen, Star, Plus } from "lucide-react";
import type { Density, JourneyRow, JourneySession, JourneySet, LiveColumn, LiveSet, StatMetric } from "./types";
import {
  computeRowStats,
  formatLongDate,
  formatShortDate,
  journeySummary,
  nextMetric,
  STAT_LABEL,
  STAT_ORDER,
  type RowStats,
} from "./stats";
import { JourneyCell } from "./JourneyCell";
import { StatCell } from "./StatCell";
import { LiveInputCell } from "./LiveInputCell";

/* ------------------------------------------------------------------ *
 * Public props
 * ------------------------------------------------------------------ */

export interface GridSection {
  id: string;
  label: string;
  rows: JourneyRow[];
  /** Collapsed sections render only their divider row (tap to expand). */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Rows in this section get a 1..n order badge (today's routine). */
  numbered?: boolean;
  /** Rows in this section have NO live input even when a live column exists. */
  inactive?: boolean;
}

export interface JourneyGridProps {
  /** Columns to render, oldest → newest. The grid never re-sorts. */
  sessions: JourneySession[];
  /**
   * Every loaded session (a superset of `sessions`), oldest → newest. The
   * Analytics column and the start→now summary search THIS set, so "Lowest"
   * is the true floor even when only the last ten columns are open.
   * Defaults to `sessions`.
   */
  historySessions?: JourneySession[];
  sections: GridSection[];
  density?: Density;
  /** Show the sticky Analytics column (default true). */
  showStats?: boolean;
  /** Controlled metric for the Analytics column. Uncontrolled if omitted. */
  metric?: StatMetric;
  onMetricChange?: (metric: StatMetric) => void;
  /**
   * The most recent logged session — framed as the baseline for today's
   * prescription. Defaults to the last entry of `historySessions`.
   */
  latestSessionId?: string | null;
  /** Controlled spotlight (tap a date header). Uncontrolled if omitted. */
  spotlightSessionId?: string | null;
  onSpotlight?: (sessionId: string | null) => void;
  /** Controlled row trace (tap a machine name). Uncontrolled if omitted. */
  selectedMachineId?: string | null;
  onSelectMachine?: (machineId: string | null) => void;
  /** When set, every machine cell gets a note button at its right edge. */
  onMachineNote?: (machineId: string) => void;
  /** Present only inside an Active Session — adds the sticky-right Today column. */
  live?: LiveColumn;
  /** "Older" affordance at the far left of the timeline. */
  onLoadOlder?: () => void;
  canLoadOlder?: boolean;
  loadingOlder?: boolean;
  /**
   * "auto": the scroller caps at `maxHeight` (default 72dvh).
   * "fill": the grid stretches to fill its flex-column parent — for a parent
   * whose height is already bounded.
   * "viewport": the grid measures its own offset from the top of the page and
   * sizes itself to the viewport that is left (minus `viewportReserve` for a
   * bottom bar / legend). Use this under a static page header on a page that
   * is NOT itself height-bounded — the grid, not the page, scrolls.
   */
  layout?: "auto" | "fill" | "viewport";
  /** CSS length for the scroll container when layout="auto". */
  maxHeight?: string;
  /** Pixels kept free under the grid in "viewport" layout (bottom bar, legend). */
  viewportReserve?: number;
  /** Column caption in the sticky corner. */
  title?: string;
}

/* ------------------------------------------------------------------ *
 * Row
 * ------------------------------------------------------------------ */

interface RowProps {
  row: JourneyRow;
  sessions: JourneySession[];
  history: JourneySession[];
  stats: RowStats | undefined;
  metric: StatMetric;
  showStats: boolean;
  latestSessionId: string | null;
  spotlightSessionId: string | null;
  isSelected: boolean;
  onSelect: (machineId: string) => void;
  onJump: (sessionId: string) => void;
  onNote?: (machineId: string) => void;
  hasOlderColumn: boolean;
  orderNumber?: number;
  live?: LiveColumn;
  liveValue?: LiveSet;
  liveInactive: boolean;
}

const EMPTY_LIVE: LiveSet = { weight: null, reps: null, seconds: null, isTSC: false, quality: null };

function RowImpl({
  row,
  sessions,
  history,
  stats,
  metric,
  showStats,
  latestSessionId,
  spotlightSessionId,
  isSelected,
  onSelect,
  onJump,
  onNote,
  hasOlderColumn,
  orderNumber,
  live,
  liveValue,
  liveInactive,
}: RowProps) {
  const { machine } = row;
  const readout = journeySummary(row, history);
  const hasLive = !!live && !liveInactive;
  const isFocus = hasLive && live?.focusMachineId === machine.id;
  const hit = stats ? stats[metric] : null;
  const hitSessionId = hit?.session.id ?? null;
  const hitVisible = hitSessionId ? sessions.some((s) => s.id === hitSessionId) : false;

  // Walk once, carrying the previous set forward for the trend glyph.
  let previous: JourneySet | undefined;
  const cells = sessions.map((s) => {
    const set = row.sets[s.id];
    const cell = (
      <JourneyCell
        key={s.id}
        session={s}
        machineName={machine.name}
        set={set}
        previous={previous}
        isLatest={latestSessionId === s.id}
        isSpot={spotlightSessionId === s.id}
        isStatHit={showStats && hitSessionId === s.id}
      />
    );
    if (set) previous = set;
    return cell;
  });

  const settingEntries = machine.settings ? Object.entries(machine.settings) : [];

  return (
    <div
      className={`jg-row ${isSelected ? "is-selected" : ""} ${hasLive ? "has-live" : ""} ${isFocus ? "is-focus" : ""} ${
        machine.sides ? "has-sides" : ""
      }`}
      role="row"
    >
      <div className="jg-machine" role="rowheader">
        <button
          type="button"
          className="jg-machine__btn"
          aria-pressed={isSelected}
          aria-label={`${machine.name}. ${readout}. Tap to trace this row.`}
          onClick={() => onSelect(machine.id)}
        >
          <span className="jg-machine__name">
            {orderNumber !== undefined && <span className="jg-machine__order">{orderNumber}</span>}
            <span className="jg-machine__label">{machine.name}</span>
            {machine.starred && (
              <Star className="jg-machine__star" size={12} fill="currentColor" strokeWidth={0} aria-label="core lift" />
            )}
            {machine.alert && (
              <AlertCircle className="jg-machine__alert" size={13} strokeWidth={2.5} aria-label="important machine note" />
            )}
          </span>
          {settingEntries.length > 0 && (
            <span className="jg-machine__meta">
              {settingEntries.map(([k, v]) => (
                <span key={k} className="jg-chip">
                  {k} {v}
                </span>
              ))}
            </span>
          )}
          <span className="jg-machine__readout">{readout}</span>
        </button>
        {onNote && (
          <button
            type="button"
            className={`jg-machine__note ${machine.alert ? "is-alert" : machine.noteCount ? "has-notes" : ""}`}
            aria-label={`${machine.name} notes${machine.noteCount ? ` (${machine.noteCount})` : ""}`}
            onClick={() => onNote(machine.id)}
          >
            <NotebookPen size={15} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {showStats && (
        <StatCell
          machineName={machine.name}
          metric={metric}
          hit={hit}
          isVisible={hitVisible}
          onJump={hitVisible ? onJump : undefined}
        />
      )}

      {hasOlderColumn && <div className="jg-cell jg-cell--older" role="gridcell" aria-hidden="true" />}

      {cells}

      {live &&
        (hasLive ? (
          <LiveInputCell
            machineId={machine.id}
            machineName={machine.name}
            sides={!!machine.sides}
            value={liveValue ?? EMPTY_LIVE}
            prescribedWeight={row.prescribedWeight}
            step={live.weightStep ?? 2}
            isFocus={isFocus}
            onChange={live.onChange}
            onFocus={live.onFocusMachine}
          />
        ) : (
          <div className="jg-live jg-live--idle" role="gridcell" aria-label={`${machine.name}: not in today's routine`}>
            {live.onAddMachine ? (
              <button type="button" className="jg-live__add" onClick={() => live.onAddMachine?.(machine.id)}>
                <Plus size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px" }} /> Add to session
              </button>
            ) : (
              <span aria-hidden="true">—</span>
            )}
          </div>
        ))}
    </div>
  );
}

const Row = memo(RowImpl);

/* ------------------------------------------------------------------ *
 * Grid
 * ------------------------------------------------------------------ */

export function JourneyGrid({
  sessions,
  historySessions,
  sections,
  density = "full",
  showStats = true,
  metric: metricProp,
  onMetricChange,
  latestSessionId: latestProp,
  spotlightSessionId,
  onSpotlight,
  selectedMachineId,
  onSelectMachine,
  onMachineNote,
  live,
  onLoadOlder,
  canLoadOlder = false,
  loadingOlder = false,
  layout = "auto",
  maxHeight,
  viewportReserve = 112,
  title = "Equipment",
}: JourneyGridProps) {
  const history = historySessions ?? sessions;
  const latestSessionId = latestProp !== undefined ? latestProp : (history[history.length - 1]?.id ?? null);

  /* --- controlled / uncontrolled metric, spotlight, selection -------- */
  const [innerMetric, setInnerMetric] = useState<StatMetric>("high");
  const metric = metricProp ?? innerMetric;
  const cycleMetric = useCallback(() => {
    const next = nextMetric(metric);
    setInnerMetric(next);
    onMetricChange?.(next);
  }, [metric, onMetricChange]);

  const [innerSpot, setInnerSpot] = useState<string | null>(null);
  const spot = spotlightSessionId !== undefined ? spotlightSessionId : innerSpot;
  const setSpot = useCallback(
    (next: string | null) => {
      setInnerSpot(next);
      onSpotlight?.(next);
    },
    [onSpotlight],
  );
  const toggleSpot = useCallback((id: string) => setSpot(spot === id ? null : id), [spot, setSpot]);

  const [innerSel, setInnerSel] = useState<string | null>(null);
  const selected = selectedMachineId !== undefined ? selectedMachineId : innerSel;
  const toggleSelect = useCallback(
    (id: string) => {
      const next = selected === id ? null : id;
      setInnerSel(next);
      onSelectMachine?.(next);
    },
    [selected, onSelectMachine],
  );

  /* --- analytics: all five metrics per row, one pass, memoised ------- */
  const stats = useMemo(() => {
    const map = new Map<string, RowStats>();
    if (!showStats) return map;
    for (const section of sections) {
      for (const row of section.rows) map.set(row.machine.id, computeRowStats(row, history));
    }
    return map;
  }, [sections, history, showStats]);

  /* --- scroll management --------------------------------------------- */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const prevFirstId = useRef<string | null>(null);
  const prevScrollWidth = useRef(0);
  const userTouched = useRef(false);

  const scrollToEnd = useCallback(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstId = sessions[0]?.id ?? null;

    if (prevFirstId.current && firstId !== prevFirstId.current && sessions.some((s) => s.id === prevFirstId.current)) {
      // Older columns were prepended: keep the same cells under the thumb.
      el.scrollLeft += el.scrollWidth - prevScrollWidth.current;
    } else if (!userTouched.current) {
      // Chronological flow: newest is on the right, so open the grid there.
      scrollToEnd();
    }
    prevFirstId.current = firstId;
    prevScrollWidth.current = el.scrollWidth;
  }, [sessions, scrollToEnd]);

  // The host page can resize after mount (fonts, orientation, a panel
  // animating open). Until the trainer touches the grid, keep it parked on
  // the latest session through those resizes.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const touch = () => {
      userTouched.current = true;
    };
    el.addEventListener("pointerdown", touch, { passive: true });
    el.addEventListener("wheel", touch, { passive: true });
    el.addEventListener("keydown", touch);
    const ro = new ResizeObserver(() => {
      if (!userTouched.current) scrollToEnd();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", touch);
      el.removeEventListener("wheel", touch);
      el.removeEventListener("keydown", touch);
    };
  }, [scrollToEnd]);

  /** Tap on an Analytics cell: bring that session's column into view and spotlight it. */
  const jumpTo = useCallback(
    (sessionId: string) => {
      const el = scrollerRef.current;
      if (!el) return;
      const head = el.querySelector<HTMLElement>(`.jg-head[data-session-id="${sessionId}"]`);
      if (!head) return;
      const corner = el.querySelector<HTMLElement>(".jg-corner");
      const statHead = el.querySelector<HTMLElement>(".jg-stat-head");
      const rail = (corner?.offsetWidth ?? 0) + (statHead?.offsetWidth ?? 0);
      userTouched.current = true;
      const left = Math.max(0, head.offsetLeft - rail - 8);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
      setSpot(sessionId);
    },
    [setSpot],
  );

  /* --- "viewport" layout: size to what is left under the page header --- */
  const [viewportMaxH, setViewportMaxH] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (layout !== "viewport") return;
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setViewportMaxH(`max(240px, calc(100dvh - ${top}px - ${viewportReserve}px))`);
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [layout, viewportReserve]);

  const hasOlderColumn = !!onLoadOlder;
  const cols = sessions.length + (hasOlderColumn ? 1 : 0);

  const effectiveMaxH = layout === "viewport" ? viewportMaxH : maxHeight;
  const style = {
    "--jg-cols": cols,
    ...(effectiveMaxH ? { "--jg-max-h": effectiveMaxH } : null),
  } as CSSProperties;

  const metricLabel = STAT_LABEL[metric];
  const metricIndex = STAT_ORDER.indexOf(metric);

  return (
    <div
      className={`jg ${layout === "fill" ? "jg--fill" : ""}`}
      data-density={density}
      data-live={live ? "true" : "false"}
      data-stats={showStats ? "true" : "false"}
      style={style}
    >
      <div
        ref={scrollerRef}
        className="jg-scroller"
        role="grid"
        aria-label="Client journey"
        aria-rowcount={sections.reduce((n, s) => n + 1 + (s.collapsed ? 0 : s.rows.length), 1)}
        aria-colcount={cols + 1 + (showStats ? 1 : 0) + (live ? 1 : 0)}
      >
        <div className="jg-grid">
          {/* ---------- header row ---------- */}
          <div className="jg-row" role="row">
            <div className="jg-corner" role="columnheader">
              <span className="jg-corner__title">{title}</span>
              <span className="jg-corner__sub">start → now</span>
            </div>

            {showStats && (
              <div className="jg-stat-head" role="columnheader">
                <button
                  type="button"
                  className="jg-stat-head__btn"
                  onClick={cycleMetric}
                  aria-label={`Analytics: ${metricLabel.long}. Tap to show the next metric.`}
                >
                  <span className="jg-stat-head__title" aria-live="polite">
                    {metricLabel.title}
                  </span>
                  <span className="jg-stat-head__sub">{metricLabel.sub}</span>
                  <span className="jg-stat-head__dots" aria-hidden="true">
                    {STAT_ORDER.map((m, i) => (
                      <i key={m} className={i === metricIndex ? "is-on" : ""} />
                    ))}
                    <ChevronsRight size={11} strokeWidth={2.5} />
                  </span>
                </button>
              </div>
            )}

            {hasOlderColumn && (
              <div className="jg-head jg-head--older" role="columnheader">
                <button
                  type="button"
                  className="jg-head__btn"
                  onClick={onLoadOlder}
                  disabled={!canLoadOlder || loadingOlder}
                  aria-label="Load older sessions"
                  style={{ opacity: canLoadOlder ? 1 : 0.4 }}
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                  <span>{loadingOlder ? "…" : canLoadOlder ? "Older" : "Start"}</span>
                </button>
              </div>
            )}

            {sessions.map((s) => {
              const isSpot = spot === s.id;
              const isLatest = latestSessionId === s.id;
              return (
                <div
                  key={s.id}
                  className={`jg-head ${isSpot ? "is-spot" : ""} ${isLatest ? "is-latest" : ""}`}
                  role="columnheader"
                  data-session-id={s.id}
                >
                  <button
                    type="button"
                    className="jg-head__btn"
                    aria-pressed={isSpot}
                    aria-label={`Session ${s.sessionNumber}, ${formatLongDate(s.date)}, trainer ${s.trainerName ?? s.trainerInitials}${
                      isLatest ? ", most recent session" : ""
                    }. Tap to spotlight this column.`}
                    onClick={() => toggleSpot(s.id)}
                  >
                    {isLatest ? (
                      <span className="jg-head__tag">Latest · #{s.sessionNumber}</span>
                    ) : (
                      <span className="jg-head__n">#{s.sessionNumber}</span>
                    )}
                    <span className="jg-head__d">{formatShortDate(s.date)}</span>
                    <span className="jg-head__t" aria-hidden="true">
                      {s.trainerInitials}
                    </span>
                  </button>
                </div>
              );
            })}

            {live && (
              <div className="jg-head jg-head--live" role="columnheader">
                <div
                  className="jg-head__btn"
                  aria-label={`Today, session ${live.session.sessionNumber}, ${formatLongDate(live.session.date)}`}
                >
                  <span className="jg-head__tag">Today</span>
                  <span className="jg-head__d">{formatShortDate(live.session.date)}</span>
                  <span className="jg-head__n">
                    #{live.session.sessionNumber} · {live.session.trainerInitials}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ---------- sections ---------- */}
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              sessions={sessions}
              history={history}
              stats={stats}
              metric={metric}
              showStats={showStats}
              latestSessionId={latestSessionId}
              spot={spot}
              selected={selected}
              onSelect={toggleSelect}
              onJump={jumpTo}
              onNote={onMachineNote}
              hasOlderColumn={hasOlderColumn}
              live={live}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SectionBlockProps {
  section: GridSection;
  sessions: JourneySession[];
  history: JourneySession[];
  stats: Map<string, RowStats>;
  metric: StatMetric;
  showStats: boolean;
  latestSessionId: string | null;
  spot: string | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onJump: (sessionId: string) => void;
  onNote?: (machineId: string) => void;
  hasOlderColumn: boolean;
  live?: LiveColumn;
}

const SectionBlock = memo(function SectionBlock({
  section,
  sessions,
  history,
  stats,
  metric,
  showStats,
  latestSessionId,
  spot,
  selected,
  onSelect,
  onJump,
  onNote,
  hasOlderColumn,
  live,
}: SectionBlockProps) {
  const toggle = section.onToggle;
  return (
    <>
      <div
        className={`jg-group ${toggle ? "jg-group--action" : ""}`}
        role="row"
        aria-label={section.label}
        onClick={toggle}
      >
        <span className="jg-group__label">
          {toggle && <span aria-hidden="true">{section.collapsed ? "▸ " : "▾ "}</span>}
          {section.label}
          <span className="jg-group__count">{section.rows.length}</span>
        </span>
      </div>
      {!section.collapsed &&
        section.rows.map((row, i) => (
          <Row
            key={row.machine.id}
            row={row}
            sessions={sessions}
            history={history}
            stats={stats.get(row.machine.id)}
            metric={metric}
            showStats={showStats}
            latestSessionId={latestSessionId}
            spotlightSessionId={spot}
            isSelected={selected === row.machine.id}
            onSelect={onSelect}
            onJump={onJump}
            onNote={onNote}
            hasOlderColumn={hasOlderColumn}
            orderNumber={section.numbered ? i + 1 : undefined}
            live={live}
            liveValue={live?.values[row.machine.id]}
            liveInactive={!!section.inactive}
          />
        ))}
    </>
  );
});
