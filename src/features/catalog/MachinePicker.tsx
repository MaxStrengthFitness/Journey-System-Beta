import { useMemo, useState, type CSSProperties } from "react";
import { accentVar } from "./accents";
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
}

function groupOf(machine: CatalogMachine, mode: GroupingMode): string {
  return mode === "movement"
    ? machine.movementPattern || "Equipment"
    : machine.anatomicalRegion || "Other";
}

export function MachinePicker({
  machines,
  selectedId,
  onSelect,
  grouping,
  onGroupingChange,
  variant = "rail",
  autoFocusSearch = false,
}: MachinePickerProps) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = q
      ? machines.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.movementPattern.toLowerCase().includes(q) ||
            m.anatomicalRegion.toLowerCase().includes(q) ||
            m.targetMuscles.some((t) => t.toLowerCase().includes(q)),
        )
      : machines;

    // Insertion order is the studio's own display order, which useCatalogMachines
    // has already applied — so groups appear in the order their first machine
    // does rather than in a hardcoded list that a studio cannot influence.
    const buckets = new Map<string, CatalogMachine[]>();
    for (const m of matching) {
      const key = groupOf(m, grouping);
      const list = buckets.get(key);
      if (list) list.push(m);
      else buckets.set(key, [m]);
    }

    return [...buckets.entries()].map(([key, list]) => ({
      key,
      label: key,
      machines: list,
    }));
  }, [machines, grouping, search]);

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
            <button
              type="button"
              className="cat__seg"
              aria-pressed={grouping === "movement"}
              onClick={() => onGroupingChange("movement")}
            >
              Kinematics
            </button>
            <button
              type="button"
              className="cat__seg"
              aria-pressed={grouping === "region"}
              onClick={() => onGroupingChange("region")}
            >
              Region
            </button>
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
                  {(m.isStudioCustom || m.rosterStatus === "maintenance") && (
                    <span className="cat__item-meta">
                      {m.isStudioCustom && (
                        <span className="cat__badge cat__badge--custom">
                          Studio
                        </span>
                      )}
                      {m.rosterStatus === "maintenance" && (
                        <span className="cat__badge cat__badge--maintenance">
                          Maintenance
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
