import { useEffect, useMemo, useState } from "react";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import type { Machine, ClientMachineSetting, ExerciseLog, Client, Trainer, WorkoutSession } from "../../types";
import { summarise, toEquipmentMachines } from "./adapters";
import { useMachineStats } from "./useMachineStats";
import { EquipmentSummaryBar } from "./EquipmentSummaryBar";
import { MachineRail } from "./MachineRail";
import type { PaneMode } from "./types";
import type { HistoryCoverage } from "../../lib/prior-history";
import { MachineMenuBody } from "../machine-menu/MachineMenuBody";
import type { MachineMenuHost } from "../machine-menu/useMachineMenuData";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import "./equipment.css";

/**
 * EQUIPMENT TAB — dual-pane.
 *
 * Drop-in replacement for ClientEquipmentPrescriptions: identical props, so
 * ClientProfileView changes by one import and one element name.
 *
 * Owns exactly three pieces of state — which machine is selected, the search
 * text, and (below 1024px) which pane is showing. Everything else is derived,
 * which is why selecting a machine costs no fetch.
 *
 * The right pane is the machine menu's body (features/machine-menu, Oct
 * 2026), the profile's door: the same card a machine's name opens on the
 * Journey grid, drawn inline beside the list. It replaced the old detail
 * pane (prescription, usage, load progression, settings, notes, change
 * history), so a machine reads the same here as everywhere else. The pane
 * is a leave scope: picking another machine, or Back in the one-pane
 * layout, asks first when a setting or a note is typed and not saved.
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
  /** The sessions `allLogs` belong to; only used until the lifetime rollup exists. */
  sessions?: WorkoutSession[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  /** Accepted for prop compatibility with the view it replaces. */
  clientBodyWeight?: number;
  /**
   * How much of the client's story Journey holds (lib/client-coverage.ts).
   * The rail's usage figures name Journey's part unless Journey holds all of
   * it. Cautious by default.
   */
  coverage?: HistoryCoverage;
  /**
   * The machine menu's door on the profile (ClientProfileView builds it):
   * what the right pane is handed. Without it the pane shows nothing.
   */
  menuHost?: MachineMenuHost;
}

export function EquipmentTab({
  clientId,
  client,
  machines,
  clientSettings = {},
  allLogs = [],
  sessions = [],
  menuHost,
}: EquipmentTabProps) {
  const { byId: catalogById } = useMachineCatalog();
  const { stats: machineStats } = useMachineStats(client);
  const { activeStudio } = useActiveStudio();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState<PaneMode>("list");
  const isSplit = useIsSplit();
  // The pane holds the card's drafts: a switch away from it asks first.
  const paneScope = useLeaveScope();

  const equipment = useMemo(
    () =>
      toEquipmentMachines({
        machines,
        clientSettings,
        allLogs,
        catalogById,
        studioMachineSettings: activeStudio?.machineSettings,
        machineStats,
        sessions,
        // The rail's note marks read the one list: the profile's one
        // journal read, the same one the menu is handed.
        journal: menuHost?.journal ?? null,
      }),
    [machines, clientSettings, allLogs, catalogById, activeStudio, machineStats, sessions, menuHost?.journal],
  );

  const summary = useMemo(() => summarise(equipment), [equipment]);

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

  const handleSelect = (id: string) => {
    if (id === selectedId) {
      setPane("detail");
      return;
    }
    paneScope.guard(() => {
      setSelectedId(id);
      setPane("detail");
    });
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
          <MachineRail
            machines={visible}
            selectedId={selectedId}
            onSelect={handleSelect}
            clinicalFlags={client?.clinicalFlags}
          />
        )}
        {showDetail && (
          <div className="eq-detail">
            {selectedId && menuHost ? (
              <UnsavedChangesScope scope={paneScope}>
                <MachineMenuBody
                  key={`${clientId}_${selectedId}`}
                  host={menuHost}
                  machineId={selectedId}
                  catalogById={catalogById}
                  inline
                  onBack={isSplit ? undefined : () => paneScope.guard(() => setPane("list"))}
                />
              </UnsavedChangesScope>
            ) : (
              <div className="eq-empty">
                <span className="eq-empty__title">Select a machine</span>
                <span className="eq-empty__hint">
                  Pick a machine on the left to see this client's settings, notes and how they have done on it.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
