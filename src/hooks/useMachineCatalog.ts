import { useEffect, useMemo, useState } from "react";
import { MachineCatalogEntry } from "../types/machines";
import { MACHINES_LOADING, subscribeMachines, type MachinesRead } from "../lib/machines-store";

/**
 * The global machine catalog — the default set every studio picks from.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * Deliberately NOT ordered in the query: Firestore's orderBy silently drops
 * documents missing the field, so a machine created without defaultOrder
 * would vanish from the app rather than merely sort badly. Ordering happens
 * downstream through resolveMachineOrder.
 *
 * `failed` (client codex, Sep 2026): a read that failed also ends with
 * `loading` false, so a screen that quotes the catalog checks it to say
 * "couldn't be loaded" rather than "nothing to show".
 *
 * One read for the whole app (the speed round, Oct 5 2026): every caller
 * shares the listener in lib/machines-store.ts with AppContent's useMachines,
 * and `byId` is built once per answer, not on every render.
 */
export function useMachineCatalog(): {
  catalog: MachineCatalogEntry[];
  byId: Record<string, MachineCatalogEntry>;
  loading: boolean;
  failed: boolean;
} {
  const [read, setRead] = useState<MachinesRead>(MACHINES_LOADING);

  useEffect(() => subscribeMachines(setRead), []);

  const catalog = useMemo(
    () => read.docs.map((d) => ({ ...d.data, id: d.id }) as MachineCatalogEntry),
    [read.docs],
  );
  const byId = useMemo(() => {
    const map: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) map[c.id] = c;
    return map;
  }, [catalog]);

  return { catalog, byId, loading: read.loading, failed: read.failed };
}
