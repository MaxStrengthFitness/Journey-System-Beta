/**
 * ATTENTION — the Firestore half. Two small per-studio streams and the four
 * writes the Overview's buttons make. See attention.ts for what they mean.
 *
 * Reads are streams (onSnapshot) because a second iPad in the office should
 * see an acknowledgement land without a refresh — that is the point of one.
 * Both collections stay small: a studio's watchlist is a handful of clients,
 * and acknowledgements are read newest-first, capped.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, limit as fsLimit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { kindOfKey, type Acknowledgement, type WatchlistEntry } from "./attention";

export interface StreamState<T> {
  value: T;
  loading: boolean;
  failed: boolean;
}

export function useWatchlist(studioId: string | null): StreamState<Map<string, WatchlistEntry>> {
  const [state, setState] = useState<StreamState<Map<string, WatchlistEntry>>>({ value: new Map(), loading: true, failed: false });
  useEffect(() => {
    setState({ value: new Map(), loading: Boolean(studioId), failed: false });
    if (!studioId) return;
    const unsub = onSnapshot(
      collection(db, "studios", studioId, "watchlist"),
      (snap) => {
        const next = new Map<string, WatchlistEntry>();
        snap.docs.forEach((d) => next.set(d.id, { ...(d.data() as WatchlistEntry), clientId: d.id }));
        setState({ value: next, loading: false, failed: false });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "watchlist");
        setState({ value: new Map(), loading: false, failed: true });
      },
    );
    return unsub;
  }, [studioId]);
  return state;
}

/** Newest first; older than this many are simply not held in memory. */
const ACK_LIMIT = 600;

export function useAcknowledgements(studioId: string | null): StreamState<ReadonlySet<string>> & { byKey: ReadonlyMap<string, Acknowledgement> } {
  const [state, setState] = useState<{ byKey: Map<string, Acknowledgement>; loading: boolean; failed: boolean }>({ byKey: new Map(), loading: true, failed: false });
  useEffect(() => {
    setState({ byKey: new Map(), loading: Boolean(studioId), failed: false });
    if (!studioId) return;
    const unsub = onSnapshot(
      query(collection(db, "studios", studioId, "acknowledgements"), orderBy("acknowledgedAt", "desc"), fsLimit(ACK_LIMIT)),
      (snap) => {
        const next = new Map<string, Acknowledgement>();
        snap.docs.forEach((d) => next.set(d.id, d.data() as Acknowledgement));
        setState({ byKey: next, loading: false, failed: false });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "acknowledgements");
        setState({ byKey: new Map(), loading: false, failed: true });
      },
    );
    return unsub;
  }, [studioId]);
  const keys = useMemo(() => new Set(state.byKey.keys()), [state.byKey]);
  return { value: keys, byKey: state.byKey, loading: state.loading, failed: state.failed };
}

/* ------------------------------------------------------------------ *
 * The writes
 * ------------------------------------------------------------------ */

export async function writeWatch(studioId: string, entry: WatchlistEntry): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "studios", studioId, "watchlist", entry.clientId), { ...entry, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function clearWatch(studioId: string, clientId: string): Promise<void> {
  await deleteDoc(doc(db, "studios", studioId, "watchlist", clientId));
}

export interface AckTarget {
  key: string;
  clientId: string;
}

/** One batch, however many rows: "acknowledge all" is the same write as one. */
export async function acknowledge(studioId: string, targets: AckTarget[], me: { id: string; name: string }): Promise<void> {
  if (targets.length === 0) return;
  const batch = writeBatch(db);
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    const ack: Acknowledgement = {
      sourceKind: kindOfKey(t.key),
      clientId: t.clientId,
      acknowledgedAt: serverTimestamp(),
      acknowledgedBy: me.id,
      acknowledgedByName: me.name,
    };
    batch.set(doc(db, "studios", studioId, "acknowledgements", t.key), ack);
  }
  await batch.commit();
}
