import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, Trainer, WorkoutSession } from "../../types";
import { toEquipmentMachines } from "./adapters";
import { authorFromTrainer } from "./author";
import { MachineDetailPanel } from "./MachineDetailPanel";
import { loadProgression } from "./progression";
import { useMachineStats } from "./useMachineStats";
import type { JournalContext } from "./mutations";

/**
 * THE ONE MACHINE WINDOW — the client profile's answer to "tap a machine".
 *
 * Before (Sep 2026) the profile had two different machine screens. Tapping a
 * machine on the Journey grid, or a row of Routine A / B, opened a legacy
 * pop-up (MachineSettingsDashboardModal) that saved settings with a bare
 * setDoc: no reason, no settingHistory, no journal entry — so a change made
 * there never reached the Equipment tab's change history. Programming → All
 * Machines showed a different, richer pane for the same machine.
 *
 * Now both open THIS: a centred window around the very same detail pane All
 * Machines draws (MachineDetailPanel), for the one machine tapped. Same
 * cards, same writes (features/equipment/mutations.ts, journalled with
 * origin "profile"), and the Load progression card keeps the trend the old
 * pop-up opened on.
 *
 * Shape: the MachineSheet pattern (`.eq .eq-sheet`) — capped at 88dvh so the
 * profile always shows around it, the header fixed, the body scrolling, a
 * 40px close button.
 *
 * Cost: nothing until the first open. Then the machine catalog listener
 * stays up for as long as the profile is open, so tapping machine after
 * machine does not re-subscribe. Usage figures come from the lifetime rollup
 * when it exists and never START the one-time history backfill — that read
 * belongs to the Equipment tab (useMachineStats).
 */

export interface ClientMachineWindowProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  client?: Client | null;
  /** The machine to show. The window stays shut if it is not in `machines`. */
  machineId: string | null;
  machines: Machine[];
  clientSettings?: Record<string, ClientMachineSetting>;
  /** The sets the profile has loaded — usage fallback and the progression line. */
  allLogs?: ExerciseLog[];
  /** The sessions those sets belong to. */
  sessions?: WorkoutSession[];
  /** Who writes are attributed to (the Auth uid is used — see author.ts). */
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
}

const NO_SETTINGS: Record<string, ClientMachineSetting> = {};
const NO_LOGS: ExerciseLog[] = [];
const NO_SESSIONS: WorkoutSession[] = [];

export function ClientMachineWindow(props: ClientMachineWindowProps) {
  // Mounted on first open, kept thereafter (see "Cost" above).
  const [armed, setArmed] = useState(props.open);
  useEffect(() => {
    if (props.open) setArmed(true);
  }, [props.open]);
  if (!armed && !props.open) return null;
  return <WindowBody {...props} />;
}

function WindowBody({
  open,
  onClose,
  clientId,
  client,
  machineId,
  machines,
  clientSettings = NO_SETTINGS,
  allLogs = NO_LOGS,
  sessions = NO_SESSIONS,
  authTrainer,
  activeStudioId,
}: ClientMachineWindowProps) {
  const { byId: catalogById } = useMachineCatalog();
  const { activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();
  const { stats: machineStats } = useMachineStats(client, { enabled: false });

  const machine = useMemo(
    () => (machineId ? machines.find((m) => m.id === machineId) ?? null : null),
    [machines, machineId],
  );

  const equipment = useMemo(() => {
    if (!machine?.id) return null;
    return (
      toEquipmentMachines({
        machines: [machine],
        clientSettings,
        allLogs,
        catalogById,
        studioMachineSettings: activeStudio?.machineSettings,
        machineStats,
        sessions,
      })[0] ?? null
    );
  }, [machine, clientSettings, allLogs, catalogById, activeStudio, machineStats, sessions]);

  const progression = useMemo(
    () => loadProgression(equipment?.id, allLogs, sessions),
    [equipment?.id, allLogs, sessions],
  );

  const journal: JournalContext = useMemo(
    () => ({ studioId: activeStudioId || activeStudio?.id || "", origin: "profile" }),
    [activeStudioId, activeStudio],
  );

  const author = authorFromTrainer(authTrainer);
  const clientName = client ? [client.firstName, client.lastName].filter(Boolean).join(" ") : "";
  const who = [client?.height, client?.gender].filter(Boolean).join(", ");

  return (
    <Dialog
      open={open && !!equipment}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-none sm:max-w-[760px] w-[calc(100%-2rem)] max-h-[88dvh] rounded-[22px] p-0 gap-0 border-0 ring-0 bg-transparent shadow-none"
      >
        {equipment && (
          <div className="eq eq-sheet eq-window">
            <header className="eq-sheet__head">
              <div className="eq-sheet__id">
                <DialogTitle className="eq-sheet__name">{equipment.name}</DialogTitle>
                <p className="eq-sheet__who">
                  {clientName || "Client"}
                  {who ? ` · ${who}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="eq-sheet__close"
                onClick={onClose}
                aria-label={`Close ${equipment.name}`}
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </header>

            <MachineDetailPanel
              machine={equipment}
              clientId={clientId}
              author={author}
              onBack={onClose}
              onSettingsSaved={(result) => toastSuccess(`Settings saved — ${result.summary}`)}
              onWeightsSaved={(result) => toastSuccess(result.summary)}
              onError={toastError}
              experienceLevel={client?.experienceLevel}
              gender={client?.gender}
              studioMachineSettings={activeStudio?.machineSettings}
              journal={journal}
              onNoteSaved={toastSuccess}
              progression={progression}
              client={client}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
