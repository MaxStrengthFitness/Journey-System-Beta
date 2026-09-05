/**
 * useMachineStats — lifetime per-machine usage for one client.
 *
 * `client.machineStats` is kept current by the session-save rollup
 * (lib/client-rollups.ts), but clients who trained before that existed have
 * either no field or one that only counts recent sessions. So the tab trusts
 * the field only once `machineStatsBackfilledAt` says the complete history has
 * been folded in. Until then it returns null — the adapter falls back to the
 * loaded sessions and labels the figures partial — and, once per client per
 * app load, this hook fetches every session and set the client has, rebuilds
 * the rollup and writes it back with the marker. The next client snapshot then
 * carries the lifetime numbers, and every other surface reads the same field.
 *
 * Cost: one sessions query plus the sets (≤60 sessions: `sessionId in` batches
 * of ten; beyond that a single `clientId ==` query), one document write. Paid
 * once per client, ever.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, ClientMachineStat, ExerciseLog, WorkoutSession } from "../../types";
import { rollupFromHistory } from "../../lib/client-rollups";

export interface MachineStatsState {
  /** Lifetime rollup, or null while the figures should come from loaded sessions. */
  stats: Record<string, ClientMachineStat> | null;
  backfilling: boolean;
}

/** Client ids whose backfill has started in this app load — never run twice. */
const started = new Set<string>();

async function fetchAllLogs(clientId: string, sessionIds: string[]): Promise<ExerciseLog[]> {
  if (sessionIds.length === 0) return [];
  if (sessionIds.length > 60) {
    const idSet = new Set(sessionIds);
    const snap = await getDocs(query(collection(db, "exerciseLogs"), where("clientId", "==", clientId)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ExerciseLog) })).filter((l) => idSet.has(l.sessionId));
  }
  const out: ExerciseLog[] = [];
  for (let i = 0; i < sessionIds.length; i += 10) {
    const chunk = sessionIds.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "in", chunk)));
    for (const d of snap.docs) out.push({ id: d.id, ...(d.data() as ExerciseLog) });
  }
  return out;
}

export function useMachineStats(client: Client | null | undefined, options: { enabled?: boolean } = {}): MachineStatsState {
  const enabled = options.enabled ?? true;
  const clientId = client?.id ?? null;
  const ready = !!client?.machineStatsBackfilledAt;
  const [backfilling, setBackfilling] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !clientId || ready || started.has(clientId)) return;
    started.add(clientId);
    setBackfilling(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "sessions"), where("clientId", "==", clientId)));
        const sessions = snap.docs.map((d) => ({ id: d.id, ...(d.data() as WorkoutSession) }));
        const logs = await fetchAllLogs(clientId, sessions.map((s) => s.id!).filter(Boolean));
        const rolled = rollupFromHistory(sessions, logs, []);
        // Whole-field replace, not a merge: the history already includes any
        // session the incremental rollup counted, so merging would double it.
        await updateDoc(doc(db, "clients", clientId), {
          machineStats: rolled.machineStats,
          machineStatsBackfilledAt: serverTimestamp(),
        });
      } catch (err) {
        // Best-effort: the partial figures stay on screen; try again next app load.
        started.delete(clientId);
        console.warn("Machine stats backfill skipped:", err);
      } finally {
        if (mounted.current) setBackfilling(false);
      }
    })();
  }, [enabled, clientId, ready]);

  return useMemo<MachineStatsState>(() => ({ stats: ready ? client?.machineStats ?? {} : null, backfilling }), [ready, client?.machineStats, backfilling]);
}
