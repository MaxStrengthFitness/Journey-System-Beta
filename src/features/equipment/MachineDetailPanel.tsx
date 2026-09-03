import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { orderMachineSettings } from "../../lib/utils";
import { NoteIndicator } from "./NoteIndicator";
import type { EquipmentMachine } from "./types";

/**
 * Right pane: everything known about ONE machine for ONE client.
 *
 * Because only one machine is ever on screen here, this panel can afford depth
 * the old twenty-card grid could not — the setup guide, the note history and
 * the change log all fit without a modal.
 */

export interface MachineDetailPanelProps {
  machine: EquipmentMachine | null;
  /** Shown only in the drill-in layout. */
  onBack: () => void;
}

function PrescriptionCard({ machine }: { machine: EquipmentMachine }) {
  const start = machine.startingWeight;
  const current = machine.currentWeight;
  const delta = start !== null && current !== null ? current - start : null;
  const pct = delta !== null && start ? Math.round((delta / start) * 100) : null;

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Prescription</h3>
      </header>
      <div className="eq-card__body">
        <div className="eq-rx">
          <div className="eq-rx__stat">
            <span className="eq-rx__label">Starting</span>
            <span className={`eq-rx__value ${start === null ? "eq-rx__value--empty" : ""}`}>
              {start ?? "—"}
              {start !== null && <small>lbs</small>}
            </span>
          </div>
          <div className="eq-rx__stat eq-rx__stat--current">
            <span className="eq-rx__label">Current</span>
            <span className={`eq-rx__value ${current === null ? "eq-rx__value--empty" : ""}`}>
              {current ?? "—"}
              {current !== null && <small>lbs</small>}
            </span>
          </div>
          <div className="eq-rx__stat">
            <span className="eq-rx__label">Change</span>
            <span className="eq-rx__value">
              {delta === null ? (
                <span className="eq-rx__value--empty">—</span>
              ) : (
                <span className={`eq-rx__delta ${delta < 0 ? "eq-rx__delta--down" : ""}`}>
                  {delta > 0 ? "+" : ""}
                  {delta} {pct !== null && <>({pct > 0 ? "+" : ""}{pct}%)</>}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsReadCard({ machine }: { machine: EquipmentMachine }) {
  const rows = useMemo(() => orderMachineSettings(machine.settings), [machine.settings]);

  return (
    <section className="eq-card">
      <header className="eq-card__head">
        <h3 className="eq-card__title">Machine settings</h3>
      </header>
      <div className="eq-card__body">
        {rows.length === 0 ? (
          <p className="eq-field__help">
            No settings saved for this client yet.
          </p>
        ) : (
          <div className="eq-fields">
            {rows.map(([key, value, originalKey]) => (
              <div className="eq-field" key={originalKey || key}>
                <span className="eq-field__label">{key}</span>
                <div className="eq-field__read">
                  <b>{value}</b>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function MachineDetailPanel({ machine, onBack }: MachineDetailPanelProps) {
  if (!machine) {
    return (
      <div className="eq-detail">
        <div className="eq-empty">
          <span className="eq-empty__title">Select a machine</span>
          <span className="eq-empty__hint">
            Pick a machine on the left to see this client's weights, settings and setup guide.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="eq-detail" key={machine.id}>
      <header className="eq-detail__head">
        <button type="button" className="eq-back" onClick={onBack}>
          <ChevronLeft size={16} strokeWidth={2.6} aria-hidden />
          Machines
        </button>

        <div className="eq-detail__title">
          <h2 className="eq-detail__name">{machine.name}</h2>
          <div className="eq-detail__sub">
            {machine.kinematic && <span className="eq-chip">{machine.kinematic}</span>}
            <span className={`eq-chip ${machine.inUse ? "eq-chip--use" : "eq-chip--idle"}`}>
              {machine.inUse ? "In use" : "Not set up"}
            </span>
            {machine.loggedSetCount > 0 && (
              <span className="eq-chip">
                {machine.loggedSetCount} logged set{machine.loggedSetCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <NoteIndicator
          count={machine.notes.length}
          hasMaintenanceFlag={machine.hasMaintenanceFlag}
          size="md"
        />
      </header>

      <PrescriptionCard machine={machine} />
      <SettingsReadCard machine={machine} />
    </div>
  );
}
