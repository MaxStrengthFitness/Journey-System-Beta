/**
 * THE SCHEDULE SYNC'S LEASE — its own small document, not the studio's.
 *
 * The cost plan (Sep 26 2026, D3b). The shared lease that lets one iPad per
 * studio do the Mindbody pull (useAutoSync.ts, syncPolicy.ts) used to live on
 * `studios/{id}`: `lastScheduleSyncAt`, `scheduleSyncFailures`,
 * `lastDeepScheduleSyncAt`, stamped two or three times a pull. Every iPad in
 * the company watches EVERY studio document (hooks/useStudios.ts), so each
 * stamp was read by every connected iPad at every studio - the one Firestore
 * cost that grew with the square of the studio count.
 *
 * Now the three fields live at `studios/{id}/sync/lease`. A subcollection is
 * not part of the `studios` listener, so a stamp is read only by the iPads
 * watching this lease: the ones at that studio. Operations -> Mindbody reads
 * each studio's lease once when it opens.
 *
 * THE TRANSITION. The fields already on studio documents are read as a
 * fallback until the first pull writes the lease (`leaseOf`), so the first
 * pull after this ships is not a thundering herd of iPads that think the
 * studio has never synced. An iPad that has not reloaded yet still writes the
 * old fields; the rules keep allowing that, and the next reload moves it over.
 */

import { doc, getDoc, onSnapshot, type DocumentReference } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import type { SyncLease } from "./syncPolicy";

export { LEASE_FIELDS, leaseOf, withLease, type SyncLease } from "./syncPolicy";

export function leaseRef(studioId: string): DocumentReference {
  return doc(db, "studios", studioId, "sync", "lease");
}

/**
 * One studio's lease, live - the iPads at that studio, for the sync policy.
 * `undefined` until the first answer; `null` when there is no lease yet (or it
 * could not be read, which the policy treats the same as the old fields say).
 */
export function useSyncLease(studioId: string | null | undefined): SyncLease | null | undefined {
  const [lease, setLease] = useState<SyncLease | null | undefined>(undefined);
  useEffect(() => {
    setLease(undefined);
    if (!studioId) return;
    return onSnapshot(
      leaseRef(studioId),
      (snap) => setLease(snap.exists() ? (snap.data() as SyncLease) : null),
      () => setLease(null),
    );
  }, [studioId]);
  return lease;
}

/**
 * Several studios' leases, read once (and again when `refreshKey` changes) -
 * Operations -> Mindbody, which lists them. A failed read leaves that studio
 * on the old fields, never on "never synced".
 */
export function useSyncLeases(studioIds: readonly string[], refreshKey: unknown = 0): Record<string, SyncLease> {
  const [leases, setLeases] = useState<Record<string, SyncLease>>({});
  const key = [...studioIds].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    Promise.all(
      ids.map((id) =>
        getDoc(leaseRef(id))
          .then((snap) => [id, snap.exists() ? (snap.data() as SyncLease) : null] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, SyncLease> = {};
      for (const [id, lease] of pairs) if (lease) next[id] = lease;
      setLeases(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);
  return leases;
}
