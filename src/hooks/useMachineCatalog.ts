import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { MachineCatalogEntry } from "../types/machines";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

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
 * `loading` false and an empty catalog, so a screen that quotes the catalog
 * checks it to say "couldn't be loaded" rather than "nothing to show".
 */
export function useMachineCatalog(): {
  catalog: MachineCatalogEntry[];
  byId: Record<string, MachineCatalogEntry>;
  loading: boolean;
  failed: boolean;
} {
  const [catalog, setCatalog] = useState<MachineCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "machines"),
      (snap) => {
        setCatalog(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MachineCatalogEntry),
        );
        setFailed(false);
        setLoading(false);
      },
      (error) => {
        setFailed(true);
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, "machines");
      },
    );
    return () => unsub();
  }, []);

  /* The same map until the catalog changes (speed round, Oct 5 2026; R10).
     A new map on every render made useStudioMachines resolve the whole floor
     again on every render of every screen that holds it, and the Active
     Session rebuilt every grid row once a second and on every keystroke. */
  const byId = useMemo(() => {
    const map: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) map[c.id] = c;
    return map;
  }, [catalog]);

  return { catalog, byId, loading, failed };
}
