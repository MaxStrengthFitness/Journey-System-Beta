/**
 * The floor as machine fit reads it: every machine with its fit fields, in
 * the floor's order — and `fieldsOf`, which the studio reports need.
 *
 * Lifted out of AdminMachineFitTab (Operations round, Sep 2026) so the
 * Monday page's one line — "N clients worth a look" — reads the same floor
 * and the same reports as the tab, and there is one copy of the plumbing.
 */
import { useCallback, useMemo } from "react";
import type { Client, Machine, Studio } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { toEquipmentMachines } from "../../equipment/adapters";
import { stepsByNk, toFitFields, type FitField } from "../../machine-fit/ui/field-values";
import { useStudioFitReports, type LoadState, type MachineFieldInfo } from "./useMachineFitReports";

export interface FloorMachine {
  id: string;
  name: string;
  order: number;
  fields: FitField[];
}

export function useFitFloor(machines: Machine[], studio: Studio | null) {
  const { catalog } = useMachineCatalog();
  const floor = useMemo<FloorMachine[]>(() => {
    const catalogById: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) catalogById[c.id] = c;
    return toEquipmentMachines({
      machines,
      clientSettings: {},
      allLogs: [],
      catalogById,
      studioMachineSettings: studio?.machineSettings,
      machineStats: null,
    })
      .map((m) => ({ id: m.id, name: m.name, order: m.order, fields: toFitFields(m.fields) }))
      .filter((m) => m.fields.length > 0)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [machines, catalog, studio?.machineSettings]);

  const floorById = useMemo(() => new Map(floor.map((m) => [m.id, m])), [floor]);

  const fieldsOf = useCallback(
    (id: string): MachineFieldInfo | null => {
      const m = floorById.get(id);
      return m ? { fieldKeys: m.fields.map((f) => f.nk), fieldSteps: stepsByNk(m.fields) } : null;
    },
    [floorById],
  );

  return { floor, floorById, fieldsOf };
}

export interface WorthALook {
  status: LoadState;
  /** Distinct clients set somewhere unusual for their build, across the floor. */
  clients: number;
  machines: number;
}

/** The Monday line: how many clients the passive check would flag at this studio. */
export function useWorthALook(studioId: string | null, machines: Machine[], clients: Client[], studio: Studio | null, enabled = true): WorthALook {
  const { fieldsOf } = useFitFloor(machines, studio);
  const reports = useStudioFitReports(studioId, clients, fieldsOf, enabled && Boolean(studioId));
  return useMemo(() => {
    if (reports.status !== "ready") return { status: reports.status, clients: 0, machines: 0 };
    const ids = new Set<string>();
    let machinesFlagged = 0;
    for (const r of Object.values(reports.byMachine)) {
      if (r.findings.length > 0) machinesFlagged += 1;
      for (const f of r.findings) ids.add(f.clientId);
    }
    return { status: "ready", clients: ids.size, machines: machinesFlagged };
  }, [reports]);
}
