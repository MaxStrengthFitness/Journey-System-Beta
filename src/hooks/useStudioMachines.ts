import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  MachineCatalogEntry,
  ResolvedMachine,
  StudioMachineRosterEntry,
} from "../types/machines";
import { resolveMachine, resolveUnrostered } from "../lib/resolve-machine";
import { useMachineCatalog } from "./useMachineCatalog";
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
 * IMPORTANT for session screens: pass the studio where training is HAPPENING
 * (activeStudioId), never the client's home studio. A client cross-training
 * at another location must see that location's equipment. useSessionMachines
 * wraps this with that guarantee.
 *
 * NOTE: until the roster backfill runs, studios/{id}/roster is empty and this
 * returns nothing. Call sites where an empty list is indistinguishable from a
 * broken screen opt into `bridgeWhenRosterEmpty` — see that option.
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
  /**
   * When the studio has NO roster documents at all, fall back to the global
   * catalog as if every active machine were rostered.
   *
   * This is a BRIDGE, not a home. studios/{id}/roster is the real answer to
   * "what equipment does this location have"; until the backfill runs it is
   * empty everywhere, and a screen reading it unbridged renders nothing at
   * all. That is how a daily "wipe down every machine" task came to show
   * "Nothing scheduled today", and how its machine picker came to render an
   * empty box that looked like a broken button (reported Sep 5 2026).
   *
   * Deliberately NOT the default: every existing call site keeps its current
   * behaviour. Opt in only where empty reads as broken. Delete the option
   * once the backfill has run everywhere.
   */
  bridgeWhenRosterEmpty?: boolean;
}

export interface UseStudioMachinesResult {
  machines: ResolvedMachine[];
  /** Where `machines` came from. "global" means the bridge above is active. */
  source: "roster" | "global";
  /** O(1) lookup — call sites do a lot of `.find(m => m.id === x)`. */
  byId: Record<string, ResolvedMachine>;
  /** Catalog docs, unresolved. For the Admin Machine Creator only. */
  catalog: MachineCatalogEntry[];
  /** Raw roster entries, for the roster manager's edit forms. */
  rosterEntries: StudioMachineRosterEntry[];
  loading: boolean;
}

export function useStudioMachines(
  studioId: string | null,
  opts: UseStudioMachinesOptions = {},
): UseStudioMachinesResult {
  const {
    includeInactive = false,
    includeUnrostered = false,
    bridgeWhenRosterEmpty = false,
  } = opts;

  const { catalog, byId: catalogById, loading: catalogLoading } = useMachineCatalog();
  const [roster, setRoster] = useState<StudioMachineRosterEntry[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);

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

  const { machines, byId, source } = useMemo(() => {
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

    // The bridge. Only when the roster produced nothing AT ALL: a studio that
    // has deliberately de-rostered every machine is indistinguishable from one
    // nobody has set up yet, and of those two failure modes showing the catalog
    // is by far the safer one today. Once the backfill has run, an empty roster
    // means empty for real and this whole branch should go.
    let source: "roster" | "global" = "roster";
    if (
      bridgeWhenRosterEmpty &&
      !includeUnrostered &&
      studioId &&
      rosterLoaded &&
      roster.length === 0
    ) {
      source = "global";
      for (const c of catalog) {
        if (c.status !== "active") continue;
        // rosterStatus "active": under the bridge the studio is treated as
        // having the machine. resolveUnrostered marks it "inactive", which is
        // right for the roster manager and wrong for everyone else.
        resolved.push({
          ...resolveUnrostered(c, studioId),
          rosterStatus: "active",
        });
      }
      if (resolved.length === 0 && !catalogLoading) {
        console.warn(
          "[useStudioMachines] studio " + studioId + " has no roster AND the " +
            "global catalog is empty, so no machines can be shown. Seed the " +
            "catalog or run the roster backfill.",
        );
      }
    }

    resolved.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    const map: Record<string, ResolvedMachine> = {};
    for (const m of resolved) map[m.machineId] = m;

    return { machines: resolved, byId: map, source };
  }, [
    catalog,
    catalogById,
    catalogLoading,
    roster,
    rosterLoaded,
    includeInactive,
    includeUnrostered,
    bridgeWhenRosterEmpty,
    studioId,
  ]);

  return {
    machines,
    byId,
    source,
    catalog,
    rosterEntries: roster,
    loading: catalogLoading || !rosterLoaded,
  };
}
