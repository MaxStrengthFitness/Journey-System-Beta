import { memo, useMemo } from "react";
import { orderMachineSettings } from "../../lib/utils";
import { NoteIndicator } from "./NoteIndicator";
import type { EquipmentMachine } from "./types";

/**
 * Left pane: every machine this studio has, always visible, never scrolled
 * away by the detail panel.
 *
 * The list is the ONLY compact view now — which is why the Compact/Full toggle
 * could go. Two sections make the existing concurrent sort legible: the client's
 * machines first, then everything else in studio display order.
 */

interface RailItemProps {
  machine: EquipmentMachine;
  selected: boolean;
  onSelect: (id: string) => void;
}

const RailItem = memo(function RailItem({ machine, selected, onSelect }: RailItemProps) {
  // Same normaliser the Entry HUD and the Journey Grid use, so "G 9 / S 8"
  // reads identically wherever a trainer sees it.
  const chips = useMemo(
    () => orderMachineSettings(machine.settings).slice(0, 4),
    [machine.settings],
  );

  const hasWeights = machine.startingWeight !== null || machine.currentWeight !== null;

  return (
    <button
      type="button"
      onClick={() => onSelect(machine.id)}
      aria-current={selected ? "true" : undefined}
      className={[
        "eq-item",
        selected ? "eq-item--selected" : "",
        machine.inUse ? "" : "eq-item--idle",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="eq-item__top">
        <span className="eq-item__name">{machine.name}</span>
        <NoteIndicator count={machine.notes.length} hasMaintenanceFlag={machine.hasMaintenanceFlag} />
      </span>

      <span className="eq-item__meta">
        {hasWeights ? (
          <span className="eq-item__weights">
            {machine.startingWeight ?? "—"} <span aria-hidden>→</span>{" "}
            <em>{machine.currentWeight ?? "—"}</em> lbs
          </span>
        ) : (
          <span className="eq-item__empty">Not set up</span>
        )}

        {chips.length > 0 && (
          <span className="eq-item__settings">
            {chips.map(([key, value, originalKey]) => (
              <span key={originalKey || key} className="eq-item__chip">
                {key.charAt(0).toUpperCase()} {value}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
});

export interface MachineRailProps {
  machines: EquipmentMachine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MachineRail({ machines, selectedId, onSelect }: MachineRailProps) {
  const { inUse, idle } = useMemo(() => {
    const a: EquipmentMachine[] = [];
    const b: EquipmentMachine[] = [];
    for (const m of machines) (m.inUse ? a : b).push(m);
    return { inUse: a, idle: b };
  }, [machines]);

  if (machines.length === 0) {
    return (
      <div className="eq-rail">
        <div className="eq-empty">
          <span className="eq-empty__title">No machines</span>
          <span className="eq-empty__hint">
            No equipment matched your search, or this studio has no machines on its roster yet.
          </span>
        </div>
      </div>
    );
  }

  return (
    <nav className="eq-rail" aria-label="Machines">
      {inUse.length > 0 && (
        <>
          <div className="eq-rail__section">
            <span>In use</span>
            <span>{inUse.length}</span>
          </div>
          {inUse.map((m) => (
            <RailItem key={m.id} machine={m} selected={m.id === selectedId} onSelect={onSelect} />
          ))}
        </>
      )}

      {idle.length > 0 && (
        <>
          <div className="eq-rail__section">
            <span>Not set up</span>
            <span>{idle.length}</span>
          </div>
          {idle.map((m) => (
            <RailItem key={m.id} machine={m} selected={m.id === selectedId} onSelect={onSelect} />
          ))}
        </>
      )}
    </nav>
  );
}
