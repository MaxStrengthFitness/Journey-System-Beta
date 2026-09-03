import { Search, X } from "lucide-react";
import type { EquipmentSummary } from "./types";

/**
 * What replaced boxes 1, 2 and 3.
 *
 * Gone: "Configured 5% · Starting Logged 43% · Warning Alerts 0", the
 * Compact/Full toggle, and Mass-Apply Standard Settings.
 *
 * Those percentages measured compliance, not readiness. A trainer walking to
 * the floor does not need to know that 43% of a roster has a starting weight
 * on file; they need to know which machines this client actually trains on and
 * whether anything is missing from a region. So the bar states that in a
 * sentence and gives back the space.
 *
 * The Compact/Full toggle went because the rail IS the compact view — it is
 * always on screen, so there is nothing left to toggle.
 *
 * Mass-Apply is not replaced. It wrote studio defaults across every
 * unconfigured machine in one tap with no per-machine review, which is how a
 * client ends up with a Leg Extension prescribed at "20 → 20" that no one ever
 * chose. Setting up a machine is a per-machine act now; it takes two taps.
 */

export interface EquipmentSummaryBarProps {
  summary: EquipmentSummary;
  search: string;
  onSearch: (value: string) => void;
  /** Non-null while a search is filtering the rail. */
  matchCount?: number | null;
}

export function EquipmentSummaryBar({
  summary,
  search,
  onSearch,
  matchCount = null,
}: EquipmentSummaryBarProps) {
  const searching = search.trim().length > 0;

  return (
    <div className="eq-summary">
      {searching ? (
        <span className="eq-summary__count">
          <b>{matchCount ?? 0}</b> {matchCount === 1 ? "machine" : "machines"} matching
          {" “"}
          {search.trim()}
          {"”"}
        </span>
      ) : (
        <span className="eq-summary__count">
          <b>
            {summary.inUse} of {summary.total}
          </b>{" "}
          {summary.total === 1 ? "machine" : "machines"} in use
        </span>
      )}

      {!searching && summary.byRegion.length > 0 && (
        <span className="eq-summary__regions">
          {summary.byRegion.map((r, i) => (
            <span key={r.region} className="eq-summary__region">
              {i > 0 && <span className="eq-summary__dot" aria-hidden />}
              <b>{r.count}</b> {r.label}
            </span>
          ))}
        </span>
      )}

      <div className="eq-summary__search">
        <Search size={15} strokeWidth={2.2} aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Find a machine"
          aria-label="Find a machine"
        />
        {searching && (
          <button
            type="button"
            className="eq-summary__clear"
            onClick={() => onSearch("")}
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={2.6} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
