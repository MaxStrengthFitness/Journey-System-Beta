import { useEffect, useState } from "react";
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
 */
export function useMachineCatalog(): {
  catalog: MachineCatalogEntry[];
  byId: Record<string, MachineCatalogEntry>;
  loading: boolean;
} {
  const [catalog, setCatalog] = useState<MachineCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "machines"),
      (snap) => {
        setCatalog(
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MachineCatalogEntry),
        );
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "machines");
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const byId: Record<string, MachineCatalogEntry> = {};
  for (const c of catalog) byId[c.id] = c;

  return { catalog, byId, loading };
}
