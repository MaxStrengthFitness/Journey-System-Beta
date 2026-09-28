/**
 * Every studio's sync lease, read once — and again on "Check again".
 *
 * Round: the Admins room (Sep 28 2026). The lease is its own small document,
 * `studios/{id}/sync/lease` (features/admin/sync-lease.ts), one per studio,
 * so this is one document read per studio when the Admins dashboard opens.
 * It is kept apart from Operations → Mindbody's own reader (useSyncLeases)
 * for one reason: that one folds a failed read into "no lease", and here a
 * failed read must say "Couldn't check", never "hasn't pulled".
 *
 * No listener (a lease is stamped at every pull, and every stamp would be a
 * read for every admin watching), no timer, no Mindbody call.
 */
import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import { leaseRef } from "../../admin/sync-lease";
import type { SyncLease } from "../../admin/syncPolicy";
import type { LeaseRead } from "./sync-check";

export function useStudioLeases(
  studioIds: readonly string[],
  refreshKey: unknown = 0,
): { leases: Record<string, LeaseRead>; checkedAt: number | null } {
  const [state, setState] = useState<{ leases: Record<string, LeaseRead>; checkedAt: number | null }>({ leases: {}, checkedAt: null });
  const key = [...studioIds].filter(Boolean).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    // Loading for the ones being read; the rest are gone from the list.
    setState((prev) => ({
      leases: Object.fromEntries(ids.map((id) => [id, { state: "loading" } as LeaseRead])),
      checkedAt: prev.checkedAt,
    }));
    Promise.all(
      ids.map((id) =>
        getDoc(leaseRef(id))
          .then((snap): [string, LeaseRead] => [id, snap.exists() ? { state: "ok", lease: snap.data() as SyncLease } : { state: "none" }])
          .catch((): [string, LeaseRead] => [id, { state: "failed" }]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setState({ leases: Object.fromEntries(pairs), checkedAt: Date.now() });
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  return state;
}
