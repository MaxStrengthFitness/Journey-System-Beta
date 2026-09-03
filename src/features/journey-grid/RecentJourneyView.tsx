import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Density, JourneyRow, JourneySession, MovementGroup, StatMetric } from "./types";
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
  layout?: "fill" | "auto";
  maxHeight?: string;
  /** localStorage key for the density preference (already a user pref in the app). */
  densityStorageKey?: string;
  /** Initial Analytics metric. */
  initialMetric?: StatMetric;
}

const GROUP_LABEL: Record<MovementGroup, string> = {
  Neck: "Neck",
  "Lower Body": "Lower body",
  Push: "Push",
  Pull: "Pull",
  Core: "Core",
};

function readDensity(key: string): Density {
  try {
    const v = localStorage.getItem(key);
    if (v === "compact" || v === "comfortable" || v === "full") return v;
  } catch {
    /* private mode etc. */
  }
  return "full";
}

/**
 * Client profile → Journey tab.
 *
 * Lives UNDER the static client header (name, trainer, last/next session,
 * tabs). This component owns only the section caption row, the grid and the
 * legend; the grid scrolls inside whatever height is left.
 */
export function RecentJourneyView({
  sessions,
  rows,
  hasMoreOnServer = false,
  onLoadMore,
  loadingMore = false,
  initialVisible = 10,
  pageStep = 5,
  layout = "fill",
  maxHeight,
  densityStorageKey = "journey-grid-density",
  initialMetric = "high",
}: RecentJourneyViewProps) {
  const [density, setDensityState] = useState<Density>(() => readDensity(densityStorageKey));
  const [order, setOrder] = useState<RowOrder>("sequence");
  const [metric, setMetric] = useState<StatMetric>(initialMetric);
  const [visible, setVisible] = useState(initialVisible);

  const setDensity = useCallback(
    (d: Density) => {
      setDensityState(d);
      try {
        localStorage.setItem(densityStorageKey, d);
      } catch {
        /* ignore */
      }
    },
    [densityStorageKey],
  );

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
    <section className={`jg-view ${layout === "fill" ? "jg-view--fill" : ""}`} aria-label="Recent journey">
      <GridToolbar title="Recent journey" density={density} onDensity={setDensity}>
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
      </GridToolbar>

      <JourneyGrid
        sessions={visibleSessions}
        historySessions={sessions}
        sections={sections}
        density={density}
        metric={metric}
        onMetricChange={setMetric}
        onLoadOlder={loadOlder}
        canLoadOlder={canLoadOlder}
        loadingOlder={loadingMore}
        layout={layout}
        maxHeight={maxHeight}
        title="Equipment"
      />

      <div className="jg-view__legend">
        <QualityLegend />
      </div>
    </section>
  );
}
