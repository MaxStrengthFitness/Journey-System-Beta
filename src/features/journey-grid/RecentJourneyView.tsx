import { useCallback, useEffect, useMemo, useState } from "react";
import type { JourneyRow, JourneySession, StatMetric } from "./types";
import { JourneyGrid, type GridSection } from "./JourneyGrid";
import { GridToolbar, QualityLegend } from "./GridToolbar";
import { LoadingArea, LoadingMark } from "../../components/LoadingMark";

/**
 * Which machines the grid lists.
 *
 * "performed" was the default for a while (a 21-machine catalogue against a
 * client who trains six meant fifteen rows of em-dashes). AJ reversed it in
 * the Sep 13 audit — "the Journey tab should really display all the
 * machines" — because what a client has NOT been put on is part of the
 * evaluation, and the grid now fits rows to the screen. "performed" stays
 * as a filter for the quick read.
 */
export type RowFilter = "performed" | "a" | "b" | "all";

const FILTER_LABEL: Record<RowFilter, string> = {
  performed: "Machines performed",
  a: "A routine",
  b: "B routine",
  all: "All machines",
};

export interface RecentJourneyViewProps {
  /** Every session loaded so far, oldest → newest. */
  sessions: JourneySession[];
  /** Rows in the studio's display sequence (DEFAULT_MACHINE_DISPLAY_ORDER). */
  rows: JourneyRow[];
  /** More sessions exist in Firestore beyond `sessions`. */
  hasMoreOnServer?: boolean;
  onLoadMore?: () => Promise<void> | void;
  /** The first batch of sessions (and their sets) is still on its way. */
  loading?: boolean;
  /** The next batch of older sessions is being fetched. */
  loadingMore?: boolean;
  /** Columns shown before the trainer scrolls back for older sessions. */
  initialVisible?: number;
  /** Columns revealed each time the trainer reaches the oldest one drawn. */
  pageStep?: number;
  /**
   * Changes when the grid is showing a different client (the client id).
   * The revealed history and the machine filter reset on it — and ONLY on
   * it. They used to reset whenever `rows` changed, which is every new page
   * of sets and every saved setting: the grid jumped back to fourteen
   * columns in the middle of scrolling through history. Falls back to
   * `rows` when omitted.
   */
  resetKey?: string | null;
  /**
   * "fill" (default): the view is a flex column that fills its parent and the
   * grid scrolls in the space under the client header. "auto": the grid caps
   * at `maxHeight` and the page scrolls.
   */
  layout?: "fill" | "auto" | "viewport" | "page";
  maxHeight?: string;
  /** Pixels kept free under the grid in "viewport" layout. */
  viewportReserve?: number;
  /** Initial Analytics metric. */
  initialMetric?: StatMetric;
  /** Machine ids prescribed in Routine A / B — drives the two routine filters. */
  routineAMachineIds?: string[];
  routineBMachineIds?: string[];
  /**
   * Tap on a machine name — every tap, including the second one on the same
   * row (the row trace toggles alongside). The profile opens its machine
   * window here.
   */
  onOpenMachine?: (machineId: string) => void;
}

/**
 * Client profile → Journey tab.
 *
 * Lives UNDER the static client header (name, trainer, last/next session,
 * tabs). This component owns only the section caption row, the grid and the
 * legend; the grid scrolls inside whatever height is left.
 *
 * Density (Sep 2026): fourteen sessions are loaded and asked for up front,
 * and the grid runs in `fit="auto"` — it measures the height and width it
 * has and shrinks rows and columns until every machine is on screen at once
 * and at least ten sessions show across. Machine settings live behind the
 * ⋯ menu here; the inline rail is the Active Session's, where the trainer
 * reads it walking up to the machine.
 */
export function RecentJourneyView({
  sessions,
  rows,
  hasMoreOnServer = false,
  onLoadMore,
  loading = false,
  loadingMore = false,
  initialVisible = 14,
  pageStep = 7,
  resetKey,
  layout = "fill",
  maxHeight,
  viewportReserve = 72,
  initialMetric = "high",
  routineAMachineIds,
  routineBMachineIds,
  onOpenMachine,
}: RecentJourneyViewProps) {
  /* Every machine, by default (audit, Sep 13): "the Journey tab should really
     display all the machines" — a trainer evaluating a client reads what was
     NOT done as much as what was. */
  const [filter, setFilter] = useState<RowFilter>("all");
  const [metric, setMetric] = useState<StatMetric>(initialMetric);
  const [visible, setVisible] = useState(initialVisible);


  // Never inherit the previous client's expansion — or their filter. This
  // view is not remounted between clients, and "B routine" left on from the
  // last client resolved against the new client's rows.
  const resetOn: unknown = resetKey !== undefined ? resetKey : rows;
  useEffect(() => {
    setVisible(initialVisible);
    setFilter("all");
  }, [initialVisible, resetOn]);

  const visibleSessions = useMemo(() => sessions.slice(Math.max(0, sessions.length - visible)), [sessions, visible]);
  const canLoadOlder = visible < sessions.length || hasMoreOnServer;

  const loadOlder = useCallback(async () => {
    const next = visible + pageStep;
    if (next > sessions.length && hasMoreOnServer && onLoadMore) await onLoadMore();
    setVisible(next);
  }, [visible, pageStep, sessions.length, hasMoreOnServer, onLoadMore]);


  /** Routine filters are only offered when that routine actually has machines. */
  const hasA = (routineAMachineIds?.length ?? 0) > 0;
  const hasB = (routineBMachineIds?.length ?? 0) > 0;
  const availableFilters = useMemo<RowFilter[]>(
    () =>
      (["performed", "a", "b", "all"] as RowFilter[]).filter(
        (f) => (f !== "a" || hasA) && (f !== "b" || hasB),
      ),
    [hasA, hasB],
  );

  // Never strand the trainer on a filter this client cannot show.
  useEffect(() => {
    if (!availableFilters.includes(filter)) setFilter("all");
  }, [availableFilters, filter]);

  const sections = useMemo<GridSection[]>(() => {
    const inA = new Set(routineAMachineIds ?? []);
    const inB = new Set(routineBMachineIds ?? []);
    // Performed means performed in a column the grid is actually DRAWING.
    // Measured against all loaded history it kept rows whose last set was
    // 25 sessions ago — a full row of em-dashes, which is the exact thing
    // this filter exists to remove.
    const shownIds = new Set(visibleSessions.map((s) => s.id));
    const pick =
      filter === "all"
        ? rows
        : filter === "a"
          ? rows.filter((r) => inA.has(r.machine.id))
          : filter === "b"
            ? rows.filter((r) => inB.has(r.machine.id))
            : rows.filter((r) => Object.keys(r.sets).some((id) => shownIds.has(id)));
    return [{ id: filter, label: FILTER_LABEL[filter], rows: pick }];
  }, [rows, filter, routineAMachineIds, routineBMachineIds, visibleSessions]);

  return (
    <section
      className={`jg-view jg-view--journey ${layout === "fill" ? "jg-view--fill" : ""} ${layout === "page" ? "jg-view--page" : ""}`}
      aria-label="Recent journey"
    >
      {/* No caption: this IS the Journey tab, and "Recent journey" under a
          tab called Journey was a heading repeating the tab (profile audit,
          Sep 2026). The toolbar is the filter and the key, nothing else. */}
      <GridToolbar>
        <div className="jg-seg" role="radiogroup" aria-label="Which machines to show">
          {availableFilters.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              className={`jg-seg__btn ${filter === f ? "is-on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        {/* No "Older +7" pill any more: the grid reveals older sessions as
            the trainer scrolls back, and its sticky rail says where it is.
            The key rides in the toolbar so the grid can take the full height
            down to the nav — in landscape that is the difference between 16
            and 21 machines on screen. No "Latest session" key: the profile
            grid does not frame its newest column. */}
        <div className="jg-toolbar__legend">
          <QualityLegend compact showLatest={false} showStatHit />
        </div>
      </GridToolbar>

      {/* The brand loading mark, never empty cells: a whole-area wait while
          the first batch loads, and a mark over the grid if it reloads.
          Older pages do NOT cover the grid — the trainer is mid-scroll, and
          the rail's "Loading…" is the whole of that wait. */}
      {loading && sessions.length === 0 ? (
        <LoadingArea label="Loading the journey…" />
      ) : (
      <div className="jg-view__grid-wrap">
        {loading && (
          <div className="jg-view__loading">
            <LoadingMark label="Loading…" size="sm" />
          </div>
        )}
      <JourneyGrid
        /* One grid per client. The profile is not remounted between clients,
           and the grid keeps its scroll position, its measured column width
           and its "which session was first" marker in refs — all of which
           belong to the client that was on screen a moment ago. Remounting on
           the client id is cheaper than keeping five refs honest, and it is
           what makes every client open pinned to their own newest session.
           Fluidity round, Sep 2026. */
        key={resetKey ?? undefined}
        sessions={visibleSessions}
        historySessions={sessions}
        sections={sections}
        metric={metric}
        onMetricChange={setMetric}
        onOpenMachine={onOpenMachine}
        /* The owner's call (Sep 2026): no LATEST frame on the profile. The
           newest column was a blue stripe of dashes whenever its session
           logged nothing, and the Active Session is where "baseline →
           today" matters. */
        latestSessionId={null}
        onLoadOlder={loadOlder}
        canLoadOlder={canLoadOlder}
        loadingOlder={loadingMore}
        autoLoadOlder
        layout={layout}
        maxHeight={maxHeight}
        viewportReserve={viewportReserve}
        title="Equipment"
        fit="auto"
        settingsDisplay="menu"
        targetColumns={initialVisible}
      />
      </div>
      )}
    </section>
  );
}
