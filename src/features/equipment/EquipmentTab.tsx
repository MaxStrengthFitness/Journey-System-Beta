import { useEffect, useMemo, useState } from "react";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useActiveStudio } from "../../ActiveStudioContext";
import type { Machine, ClientMachineSetting, ExerciseLog, Client, Trainer } from "../../types";
import { summarise, toEquipmentMachines } from "./adapters";
import { MachineRail } from "./MachineRail";
import { MachineDetailPanel } from "./MachineDetailPanel";
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
}: EquipmentTabProps) {
  const { byId: catalogById } = useMachineCatalog();
  const { activeStudio } = useActiveStudio();

  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // In the split layout something is always selected; the empty right pane is
  // dead space on a 13" screen. In drill-in, nothing is selected until a tap.
  useEffect(() => {
    if (!isSplit) return;
    if (selectedId && equipment.some((m) => m.id === selectedId)) return;
    setSelectedId(equipment[0]?.id ?? null);
  }, [isSplit, equipment, selectedId]);

  // A different client is a different prescription — never keep the selection.
  useEffect(() => {
    setSelectedId(null);
    setPane("list");
  }, [clientId]);

  const selected = useMemo(
    () => equipment.find((m) => m.id === selectedId) ?? null,
    [equipment, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setPane("detail");
  };

  const showRail = isSplit || pane === "list";
  const showDetail = isSplit || pane === "detail";

  return (
    <div className="eq">
      <div className="eq-summary">
        <span className="eq-summary__count">
          <b>
            {summary.inUse} of {summary.total}
          </b>{" "}
          machines in use
        </span>
        {summary.byRegion.length > 0 && (
          <span className="eq-summary__regions">
            {summary.byRegion.map((r) => (
              <span key={r.region} className="eq-summary__region">
                <b>{r.count}</b> {r.label}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="eq-body">
        {showRail && (
          <MachineRail machines={equipment} selectedId={selectedId} onSelect={handleSelect} />
        )}
        {showDetail && (
          <MachineDetailPanel
            machine={selected}
            onBack={() => setPane("list")}
          />
        )}
      </div>
    </div>
  );
}
