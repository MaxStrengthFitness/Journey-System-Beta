import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  MachineCatalogEntry,
  ResolvedMachine,
  StudioMachineRosterEntry,
} from "../types/machines";
import { resolveMachine, resolveUnrostered } from "../lib/resolve-machine";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

/**
 * Every machine one studio has, fully resolved.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026. Replaces the
 * useMachines + useStudioMachineSettings pairing, and with it the
 * hand-rolled fallback chain each call site was writing for itself:
 *
 *     activeStudio?.machineSettings?.[id] || machine.standardSettings || {}
 *
 * Six components had a version of that line and they did not agree, which is
 * how a studio's override could win in one view and lose in another. The
 * merge policy now lives only in lib/resolve-machine.ts.
 *
 * NOTE: call sites are converted only after the roster backfill runs — until
 * then studios/{id}/roster is empty and this returns nothing.
 */
export interface UseStudioMachinesOptions {
  /**
   * Include equipment the studio has switched off entirely.
   * Machines under `maintenance` are ALWAYS included — the studio owns them,
   * they are just out of service — so the UI can flag rather than hide them.
   */
  includeInactive?: boolean;
  /**
   * Also list catalog machines this studio has not rostered at all, as
   * rosterStatus 'inactive'. For the roster manager and the onboarding
   * picker, which exist to add exactly those.
   */
  includeUnrostered?: boolean;
}

export interface UseStudioMachinesResult {
  machines: ResolvedMachine[];
  /** O(1) lookup — call sites do a lot of `.find(m => m.id === x)`. */
  byId: Record<string, ResolvedMachine>;
  /** Catalog docs, unresolved. For the Admin Machine Creator only. */
  catalog: MachineCatalogEntry[];
  loading: boolean;
}

export function useStudioMachines(
  studioId: string | null,
  opts: UseStudioMachinesOptions = {},
): UseStudioMachinesResult {
  const { includeInactive = false, includeUnrostered = false } = opts;

  const [catalog, setCatalog] = useState<MachineCatalogEntry[]>([]);
  const [roster, setRoster] = useState<StudioMachineRosterEntry[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  // Global catalog. Deliberately NOT ordered in the query: Firestore's
  // orderBy silently drops documents missing the field, so a machine added
  // without defaultOrder would vanish from the app rather than sort badly.
  // Ordering happens below, through resolveMachineOrder.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "machines"),
      (snap) => {
        setCatalog(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MachineCatalogEntry),
        );
        setCatalogLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "machines");
        setCatalogLoaded(true);
      },
    );
    return () => unsub();
  }, []);

  // This studio's roster.
  useEffect(() => {
    if (!studioId) {
      setRoster([]);
      setRosterLoaded(true);
      return;
    }
    setRosterLoaded(false);
    const unsub = onSnapshot(
      collection(db, "studios", studioId, "roster"),
      (snap) => {
        setRoster(
          snap.docs.map(
            (d) =>
              ({
                ...d.data(),
                machineId: d.id,
                studioId,
              }) as StudioMachineRosterEntry,
          ),
        );
        setRosterLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "studio machine roster");
        setRosterLoaded(true);
      },
    );
    return () => unsub();
  }, [studioId]);

  const { machines, byId } = useMemo(() => {
    const catalogById: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) catalogById[c.id] = c;

    const resolved: ResolvedMachine[] = [];
    const rostered = new Set<string>();

    for (const entry of roster) {
      rostered.add(entry.machineId);

      const machine = resolveMachine(
        entry,
        entry.source === "catalog" ? catalogById[entry.basedOn] : undefined,
      );

      if (!machine) {
        // Catalog deletes are denied in rules, so this means a genuinely
        // orphaned roster doc. Skip it rather than blanking the screen.
        console.warn(
          `[useStudioMachines] roster entry ${entry.machineId} references ` +
            `missing catalog machine ${(entry as { basedOn?: string }).basedOn}`,
        );
        continue;
      }

      if (!includeInactive && machine.rosterStatus === "inactive") continue;
      resolved.push(machine);
    }

    if (includeUnrostered && studioId) {
      for (const c of catalog) {
        if (rostered.has(c.id) || c.status !== "active") continue;
        resolved.push(resolveUnrostered(c, studioId));
      }
    }

    resolved.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    const map: Record<string, ResolvedMachine> = {};
    for (const m of resolved) map[m.machineId] = m;

    return { machines: resolved, byId: map };
  }, [catalog, roster, includeInactive, includeUnrostered, studioId]);

  return {
    machines,
    byId,
    catalog,
    loading: !catalogLoaded || !rosterLoaded,
  };
}
