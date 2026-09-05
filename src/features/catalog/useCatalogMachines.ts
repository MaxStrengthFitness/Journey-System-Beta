import { useEffect, useMemo, useRef } from "react";
import type { Machine } from "../../types";
import { resolveMachineOrder } from "../../data/machine-display-order";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { useStudioMachineNotes } from "./useStudioMachineNotes";
import { fromLegacyMachine, fromResolvedMachine } from "./adapters";
import { dedupeMachines } from "./machine-identity";
import type { CatalogMachine } from "./types";

/**
 * The machines THIS studio has, ready to render.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * The catalog previously rendered `useMachines()` — an unfiltered read of the
 * global machines/ collection. Three consequences, all reported from the floor:
 *
 *   1. Every studio saw the shared library rather than its own equipment.
 *   2. A studio's own machines (roster source 'custom', id sm-{studio}-*) never
 *      appeared at all, because they do not live in that collection.
 *   3. Duplicates. useMachines merges DEFAULT_MACHINES with Firestore BY ID, so
 *      a document filed under the other id convention (leg_extension rather
 *      than m-ext) misses its match, lands in `customMachines`, and renders as
 *      a second Leg Extension.
 *
 * Two sources, one shape:
 *
 *   roster populated -> studios/{id}/roster, already studio-scoped, already
 *                       includes custom equipment, already excludes inactive.
 *   roster empty     -> the global list, deduped, so the screen still works
 *                       before the backfill runs.
 *
 * The fallback is a bridge, not a home. Deduping there is a GUARD: the stray
 * Firestore document is still wrong and still needs deleting, which is why the
 * collision is logged with both ids rather than silently swallowed.
 */
export interface UseCatalogMachinesResult {
  machines: CatalogMachine[];
  /** Which source produced them — surfaced so the UI can say so if it wants. */
  source: "roster" | "global";
  loading: boolean;
}

export function useCatalogMachines(
  studioId: string | null,
  legacyMachines: Machine[],
): UseCatalogMachinesResult {
  const { machines: resolved, loading } = useStudioMachines(studioId);
  const { notesByMachineId } = useStudioMachineNotes(studioId);
  const warnedRef = useRef<Set<string>>(new Set());

  const result = useMemo<UseCatalogMachinesResult>(() => {
    const opts = { studioNotes: notesByMachineId };

    if (resolved.length > 0) {
      // useStudioMachines has already sorted by the studio's own order.
      return {
        machines: resolved.map((m) => fromResolvedMachine(m, opts)),
        source: "roster",
        loading: false,
      };
    }

    const { machines: deduped, collisions } = dedupeMachines(legacyMachines);

    const machines = deduped
      .map((m) => fromLegacyMachine(m, opts))
      .sort(
        (a, b) =>
          resolveMachineOrder(a.id, undefined) -
            resolveMachineOrder(b.id, undefined) ||
          a.name.localeCompare(b.name),
      );

    return { machines, source: "global", loading, collisions } as
      UseCatalogMachinesResult & { collisions: Record<string, string[]> };
  }, [resolved, legacyMachines, notesByMachineId, loading]);

  // Name the duplicate rather than hiding it — the stray document is still in
  // Firestore and will keep coming back until someone deletes it.
  const collisions =
    (result as { collisions?: Record<string, string[]> }).collisions ?? {};
  useEffect(() => {
    for (const [canonical, ids] of Object.entries(collisions)) {
      const key = `${canonical}:${ids.join(",")}`;
      if (warnedRef.current.has(key)) continue;
      warnedRef.current.add(key);
      console.warn(
        `[catalog] ${ids.length} documents resolve to the same machine ` +
          `"${canonical}" (${ids.join(", ")}). They are being merged for ` +
          `display. Delete the stray machines/ document to fix this at source.`,
      );
    }
  }, [collisions]);

  return result;
}
