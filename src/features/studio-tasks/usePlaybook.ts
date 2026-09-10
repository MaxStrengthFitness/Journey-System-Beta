/**
 * The studio's playbook, live.
 *
 * One unfiltered listener over `studios/{id}/playbook`. Deliberately not a
 * filtered query: a studio's playbook is tens of documents, the screen needs
 * to search across all of them client-side anyway (see searchPlaybook), and a
 * `where("retiredAt", "==", null)` would drop every entry written before that
 * field existed — the same trap the trainer tombstone filtering hit in
 * September, where a Firestore inequality silently excluded every document
 * that had never carried the field.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { studioDateKey } from "../../lib/studio-time";
import {
  needsReview,
  searchPlaybook,
  type PlaybookEntry,
  type PlaybookHit,
} from "./playbook";

export interface UsePlaybookResult {
  entries: PlaybookEntry[];
  loading: boolean;
  /** Ranked results for a term. Empty term returns everything, live-sorted. */
  search: (term: string, machineId?: string) => PlaybookHit[];
  /** Entries nobody has confirmed in a year. Drives the "still true?" nudge. */
  stale: PlaybookEntry[];
}

export function usePlaybook(studioId: string | null): UsePlaybookResult {
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studioId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "studios", studioId, "playbook"),
      (snap) => {
        setEntries(
          snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as PlaybookEntry),
        );
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `studios/${studioId}/playbook`,
        );
        setLoading(false);
      },
    );
    return () => unsub();
  }, [studioId]);

  const todayKey = studioDateKey(new Date()) ?? "";

  const stale = useMemo(
    () => (todayKey ? needsReview(entries, todayKey) : []),
    [entries, todayKey],
  );

  const search = useMemo(
    () =>
      (term: string, machineId?: string) =>
        searchPlaybook(entries, term, { machineId }),
    [entries],
  );

  return { entries, loading, search, stale };
}

/**
 * The playbook filtered to one machine, for the Catalog's detail pane.
 *
 * Separate hook rather than a parameter on the one above, because the caller
 * is a different screen with a different lifetime — the Catalog opens and
 * closes a machine sheet far more often than the hub mounts, and it should not
 * inherit the hub's search closure.
 */
export function useMachinePlaybook(
  studioId: string | null,
  machineId: string | null,
): { entries: PlaybookEntry[]; loading: boolean } {
  const { entries, loading } = usePlaybook(studioId);
  const forMachine = useMemo(
    () =>
      machineId
        ? searchPlaybook(entries, "", { machineId }).map((h) => h.entry)
        : [],
    [entries, machineId],
  );
  return { entries: forMachine, loading };
}
