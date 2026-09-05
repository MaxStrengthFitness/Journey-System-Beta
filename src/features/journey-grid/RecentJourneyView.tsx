import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { JourneyRow, JourneySession, MovementGroup, StatMetric } from "./types";
import { GROUP_ORDER } from "./adapters";
import { JourneyGrid, type GridSection } from "./JourneyGrid";
import { GridToolbar, QualityLegend } from "./GridToolbar";

export type RowOrder = "sequence" | "group";

export interface RecentJourneyViewProps {
  /** Every session loaded so far, oldest → newest. */
  sessions: JourneySession[];
  /** Rows in the studio's display sequence (DEFAULT_MACHINE_DISPLAY_ORDER). */
  rows: JourneyRow[];
  /** More sessions exist in Firestore beyond `sessions`. */
  hasMoreOnServer?: boolean;
  onLoadMore?: () => Promise<void> | void;
  loadingMore?: boolean;
  /** Columns shown before the trainer taps "Older". */
  initialVisible?: number;
  pageStep?: number;
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
  /** Tap on a machine name (the row also traces). The app opens the settings editor here. */
  onSelectMachine?: (machineId: string | null) => void;
}

const GROUP_LABEL: Record<MovementGroup, string> = {
  Neck: "Neck",
  "Lower Body": "Lower body",
  Push: "Push",
  Pull: "Pull",
  Core: "Core",
};

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
  loadingMore = false,
  initialVisible = 14,
  pageStep = 7,
  layout = "fill",
  maxHeight,
  viewportReserve = 72,
  initialMetric = "high",
  onSelectMachine,
}: RecentJourneyViewProps) {
  const [order, setOrder] = useState<RowOrder>("sequence");
  const [metric, setMetric] = useState<StatMetric>(initialMetric);
  const [visible, setVisible] = useState(initialVisible);


  // Never inherit the previous client's expansion.
  useEffect(() => setVisible(initialVisible), [initialVisible, rows]);

  const visibleSessions = useMemo(() => sessions.slice(Math.max(0, sessions.length - visible)), [sessions, visible]);
  const canLoadOlder = visible < sessions.length || hasMoreOnServer;

  const loadOlder = useCallback(async () => {
    const next = visible + pageStep;
    if (next > sessions.length && hasMoreOnServer && onLoadMore) await onLoadMore();
    setVisible(next);
  }, [visible, pageStep, sessions.length, hasMoreOnServer, onLoadMore]);


  const sections = useMemo<GridSection[]>(() => {
    if (order === "sequence") return [{ id: "all", label: "All equipment", rows }];
    return GROUP_ORDER.map((g) => ({
      id: g,
      label: GROUP_LABEL[g],
      rows: rows.filter((r) => r.machine.group === g),
    })).filter((s) => s.rows.length > 0);
  }, [rows, order]);

  return (
    <section
      className={`jg-view ${layout === "fill" ? "jg-view--fill" : ""} ${layout === "page" ? "jg-view--page" : ""}`}
      aria-label="Recent journey"
    >
      <GridToolbar title="Recent journey">
        <div className="jg-seg" role="radiogroup" aria-label="Row order">
          {(["sequence", "group"] as RowOrder[]).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={order === o}
              className={`jg-seg__btn ${order === o ? "is-on" : ""}`}
              onClick={() => setOrder(o)}
            >
              {o === "group" ? "By group" : "Sequence"}
            </button>
          ))}
        </div>
        <button type="button" className="jg-btn" onClick={loadOlder} disabled={!canLoadOlder || loadingMore}>
          <ChevronLeft size={15} strokeWidth={2.5} />
          {loadingMore ? "Loading…" : `Older +${pageStep}`}
        </button>
        {/* The key rides in the toolbar so the grid can take the full height
            down to the nav — in landscape that is the difference between 16
            and 21 machines on screen. */}
        <div className="jg-toolbar__legend">
          <QualityLegend compact />
        </div>
      </GridToolbar>

      <JourneyGrid
        sessions={visibleSessions}
        historySessions={sessions}
        sections={sections}
        metric={metric}
        onMetricChange={setMetric}
        onSelectMachine={onSelectMachine}
        onLoadOlder={loadOlder}
        canLoadOlder={canLoadOlder}
        loadingOlder={loadingMore}
        layout={layout}
        maxHeight={maxHeight}
        viewportReserve={viewportReserve}
        title="Equipment"
        fit="auto"
        settingsDisplay="menu"
        targetColumns={initialVisible}
      />
    </section>
  );
}
