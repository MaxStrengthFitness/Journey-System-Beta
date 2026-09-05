import { ChevronLeft } from "lucide-react";
import { NoteIndicator } from "./NoteIndicator";
import { ChangeHistory } from "./ChangeHistory";
import { MachineNotes } from "./MachineNotes";
import { MachineUsageCard } from "./MachineUsageCard";
import { PrescriptionCard } from "./PrescriptionCard";
import { SettingsCard } from "./SettingsCard";
import { SetupGuide } from "./SetupGuide";
import type {
  JournalContext,
  MutationAuthor,
  SaveSettingsResult,
  SaveWeightsResult,
} from "./mutations";
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
  clientId: string;
  author: MutationAuthor | null;
  /** Shown only in the drill-in layout. */
  onBack: () => void;
  onSettingsSaved?: (result: SaveSettingsResult, machine: EquipmentMachine) => void;
  onWeightsSaved?: (result: SaveWeightsResult, machine: EquipmentMachine) => void;
  onError?: (message: string) => void;
  experienceLevel?: string;
  gender?: string;
  studioMachineSettings?: Record<string, Record<string, string>>;
  journal?: JournalContext;
  onNoteSaved?: (message: string) => void;
}

export function MachineDetailPanel({
  machine,
  clientId,
  author,
  onBack,
  onSettingsSaved,
  onWeightsSaved,
  onError,
  experienceLevel,
  gender,
  studioMachineSettings,
  journal,
  onNoteSaved,
}: MachineDetailPanelProps) {
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

      <PrescriptionCard
        machine={machine}
        clientId={clientId}
        author={author}
        experienceLevel={experienceLevel}
        gender={gender}
        studioMachineSettings={studioMachineSettings}
        onSaved={onWeightsSaved}
        onError={onError}
      />

      <MachineUsageCard machine={machine} />

      <SettingsCard
        machine={machine}
        clientId={clientId}
        author={author}
        onSaved={onSettingsSaved}
        onError={onError}
        journal={journal}
      />

      <MachineNotes
        machine={machine}
        clientId={clientId}
        author={author}
        journal={journal}
        onSaved={onNoteSaved}
        onError={onError}
      />

      {machine.guide && (
        /* Open by default on a machine the client has never used — that is the
           moment a trainer actually needs the cues. */
        <SetupGuide guide={machine.guide} defaultOpen={!machine.inUse} />
      )}

      <ChangeHistory machineId={machine.id} clientId={clientId} />
    </div>
  );
}
