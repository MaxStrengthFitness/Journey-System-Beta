import { useMemo, useState, type CSSProperties } from "react";
import { accentVar } from "./accents";
import {
  GROUPING_LABEL,
  GROUPING_MODES,
  groupMachines,
  searchMachines,
} from "./grouping";
import type { UpkeepStatus } from "../admin/upkeep/upkeepLog";
import type { CatalogMachine, GroupingMode } from "./types";

/**
 * The machine list. One component, two hosts: the always-visible rail in split
 * mode, and the bottom sheet's body in stack mode.
 *
 * This replaces the "lazy susan" carousel, which rendered the roster three
 * times over ([...machines, ...machines, ...machines]), wrapped by mutating
 * scrollLeft mid-scroll, and identified the selection with a 100ms-debounced
 * spy measuring every card's offsetLeft on every scroll event, coordinated by
 * two setTimeout refs and an isProgrammaticScroll boolean. Roughly ninety lines
 * to answer "which machine".
 *
 * Beyond the complexity, it had three problems a list does not have: the active
 * card could sit half-scrolled so the current selection was never unambiguous;
 * selection changed on scroll POSITION rather than on activation, which means
 * keyboard and VoiceOver users had no way to choose a machine at all; and it
 * fought iOS momentum, toggling scrollBehavior imperatively while the browser
 * was still decelerating.
 */
export interface MachinePickerProps {
  machines: CatalogMachine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  grouping: GroupingMode;
  onGroupingChange?: (mode: GroupingMode) => void;
  /** Renders wider, two-up items for the sheet. */
  variant?: "rail" | "sheet";
  autoFocusSearch?: boolean;
  /** Machines a trainer has reported a problem with. */
  flaggedIds?: Set<string>;
  /**
   * Cleaning and service state per machine id, from features/admin/upkeep.
   * Only "due" and "overdue" ever render — a badge on every row would make
   * the two that need attention harder to find, not easier.
   */
  upkeep?: Record<string, UpkeepStatus>;
}

export function MachinePicker({
  machines,
  selectedId,
  onSelect,
  grouping,
  onGroupingChange,
  variant = "rail",
  autoFocusSearch = false,
  flaggedIds,
  upkeep,
}: MachinePickerProps) {
  const [search, setSearch] = useState("");

  // Bucketing and searching moved to grouping.ts in Round 2 Phase 6, so the
  // Academy grouping is decided in one tested place rather than in a ternary
  // here. The ordering rules live there too: roster order for the kinematic
  // and regional groupings, the Academy's own order for the Academy one.
  const groups = useMemo(
    () => groupMachines(searchMachines(machines, search), grouping),
    [machines, grouping, search],
  );

  const total = groups.reduce((n, g) => n + g.machines.length, 0);

  return (
    <div
      className={`cat__picker ${variant === "sheet" ? "cat__picker--sheet" : ""}`}
    >
      <div className="cat__picker-head">
        <input
          type="search"
          className="cat__search"
          value={search}
          autoFocus={autoFocusSearch}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${machines.length} machines…`}
          aria-label="Search machines"
        />
        {onGroupingChange && (
          <div className="cat__segmented" role="group" aria-label="Group by">
            {GROUPING_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className="cat__seg"
                aria-pressed={grouping === mode}
                onClick={() => onGroupingChange(mode)}
              >
                {GROUPING_LABEL[mode]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cat__picker-list cat__scroller">
        {total === 0 && (
          <p className="cat__empty">
            {machines.length === 0
              ? "No machines on this studio's roster yet."
              : `Nothing matches “${search}”.`}
          </p>
        )}

        {groups.map((group) => (
          <section className="cat__group" key={group.key}>
            <h3 className="cat__group-head">
              <span>{group.label}</span>
              <span className="cat__group-count">{group.machines.length}</span>
            </h3>
            <div className="cat__group-items">
              {group.machines.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="cat__item"
                  aria-current={m.id === selectedId ? "true" : undefined}
                  style={
                    {
                      "--cat-item-accent": accentVar(m.movementPattern),
                    } as CSSProperties
                  }
                  onClick={() => onSelect(m.id)}
                >
                  <span className="cat__item-name">{m.name}</span>
                  {(m.isStudioCustom ||
                    m.rosterStatus === "maintenance" ||
                    flaggedIds?.has(m.id) ||
                    upkeep?.[m.id] === "due" ||
                    upkeep?.[m.id] === "overdue") && (
                    <span className="cat__item-meta">
                      {m.isStudioCustom && (
                        <span className="cat__badge cat__badge--custom">
                          Studio
                        </span>
                      )}
                      {(m.rosterStatus === "maintenance" ||
                        flaggedIds?.has(m.id)) && (
                        <span className="cat__badge cat__badge--maintenance">
                          {flaggedIds?.has(m.id) ? "Flagged" : "Maintenance"}
                        </span>
                      )}
                      {(upkeep?.[m.id] === "due" ||
                        upkeep?.[m.id] === "overdue") && (
                        <span className="cat__badge cat__badge--upkeep">
                          {upkeep[m.id] === "overdue" ? "Overdue" : "Due"}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
