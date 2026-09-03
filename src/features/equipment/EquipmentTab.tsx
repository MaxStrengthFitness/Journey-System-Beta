import { useEffect, useMemo, useState } from "react";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useToast } from "../../contexts/ToastContext";
import { useActiveStudio } from "../../ActiveStudioContext";
import type { Machine, ClientMachineSetting, ExerciseLog, Client, Trainer } from "../../types";
import { summarise, toEquipmentMachines } from "./adapters";
import { EquipmentSummaryBar } from "./EquipmentSummaryBar";
import { MachineRail } from "./MachineRail";
import { MachineDetailPanel } from "./MachineDetailPanel";
import type {
  JournalContext,
  MutationAuthor,
  SaveSettingsResult,
  SaveWeightsResult,
} from "./mutations";
import type { PaneMode } from "./types";

/**
 * EQUIPMENT TAB — dual-pane.
 *
 * Drop-in replacement for ClientEquipmentPrescriptions: identical props, so
 * ClientProfileView changes by one import and one element name.
 *
 * Owns exactly three pieces of state — which machine is selected, the search
 * text, and (below 1024px) which pane is showing. Everything else is derived,
 * which is why selecting a machine costs no fetch.
 */

const SPLIT_AT = 1024;

function useIsSplit(): boolean {
  const [isSplit, setIsSplit] = useState(
    () => typeof window === "undefined" || window.innerWidth >= SPLIT_AT,
  );

  useEffect(() => {
    // matchMedia rather than a resize listener: it fires once on the crossing
    // instead of on every pixel of an iPad rotation animation.
    const mq = window.matchMedia(`(min-width: ${SPLIT_AT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsSplit(e.matches);
    setIsSplit(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isSplit;
}

export interface EquipmentTabProps {
  clientId: string;
  client?: Client | null;
  machines: Machine[];
  clientSettings?: Record<string, ClientMachineSetting>;
  allLogs?: ExerciseLog[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  /** Accepted for prop compatibility with the view it replaces. */
  clientBodyWeight?: number;
}

export function EquipmentTab({
  clientId,
  client,
  machines,
  clientSettings = {},
  allLogs = [],
  authTrainer,
  activeStudioId,
}: EquipmentTabProps) {
  const { byId: catalogById } = useMachineCatalog();
  const { activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();

  const author: MutationAuthor | null = authTrainer
    ? {
        id: authTrainer.id || "unknown",
        fullName: authTrainer.fullName || authTrainer.initials || "Unknown",
        initials: authTrainer.initials,
      }
    : null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState<PaneMode>("list");
  const isSplit = useIsSplit();

  const equipment = useMemo(
    () =>
      toEquipmentMachines({
        machines,
        clientSettings,
        allLogs,
        catalogById,
        studioMachineSettings: activeStudio?.machineSettings,
      }),
    [machines, clientSettings, allLogs, catalogById, activeStudio],
  );

  const summary = useMemo(() => summarise(equipment), [equipment]);

  // Everything written from this tab is journalled with origin "profile", so
  // the Journal can say where a note came from without the trainer saying it.
  const journal: JournalContext = useMemo(
    () => ({ studioId: activeStudioId || activeStudio?.id || "", origin: "profile" }),
    [activeStudioId, activeStudio],
  );

  // Search filters the RAIL only. The summary sentence keeps describing the
  // whole roster, because "6 of 6 matching" is not a fact about the client.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.kinematic || "").toLowerCase().includes(q) ||
        (m.category || "").toLowerCase().includes(q),
    );
  }, [equipment, search]);

  // In the split layout something is always selected; the empty right pane is
  // dead space on a 13" screen. In drill-in, nothing is selected until a tap.
  useEffect(() => {
    if (!isSplit) return;
    if (selectedId && equipment.some((m) => m.id === selectedId)) return;
    setSelectedId(equipment[0]?.id ?? null);
  }, [isSplit, equipment, selectedId]);

  // Searching should not strand the detail pane on a machine the rail no
  // longer lists — but only in the split layout, where the panes are meant to
  // agree. Mid drill-in the trainer is reading, not browsing; leave them be.
  useEffect(() => {
    if (!isSplit || !search.trim()) return;
    if (selectedId && visible.some((m) => m.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [isSplit, search, visible, selectedId]);

  // A different client is a different prescription — never keep the selection.
  useEffect(() => {
    setSelectedId(null);
    setSearch("");
    setPane("list");
  }, [clientId]);

  const selected = useMemo(
    () => equipment.find((m) => m.id === selectedId) ?? null,
    [equipment, selectedId],
  );

  const handleSettingsSaved = (result: SaveSettingsResult) => {
    toastSuccess(`Settings saved — ${result.summary}`);
  };

  const handleWeightsSaved = (result: SaveWeightsResult) => {
    toastSuccess(result.summary);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setPane("detail");
  };

  const showRail = isSplit || pane === "list";
  const showDetail = isSplit || pane === "detail";

  return (
    <div className="eq">
      <EquipmentSummaryBar
        summary={summary}
        search={search}
        onSearch={setSearch}
        matchCount={search.trim() ? visible.length : null}
      />

      <div className="eq-body">
        {showRail && (
          <MachineRail machines={visible} selectedId={selectedId} onSelect={handleSelect} />
        )}
        {showDetail && (
          <MachineDetailPanel
            machine={selected}
            clientId={clientId}
            author={author}
            onBack={() => setPane("list")}
            onSettingsSaved={handleSettingsSaved}
            onWeightsSaved={handleWeightsSaved}
            onError={toastError}
            experienceLevel={client?.experienceLevel}
            gender={client?.gender}
            studioMachineSettings={activeStudio?.machineSettings}
            journal={journal}
            onNoteSaved={toastSuccess}
          />
        )}
      </div>
    </div>
  );
}
