/**
 * Reads for the Operations → Renewals pipeline.
 *
 * One query per studio for the pipeline itself: clients whose package ends
 * between six months ago (the lapsed list) and the end of the planning
 * horizon, straight off their nightly snapshots — the composite index
 * clients (homeStudioId, renewal.focusDate) exists for exactly this. Cycle
 * documents (stage, leaning, "needs a leader") come from small `in` queries
 * for just the clients on screen, never the whole collection.
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import type { RenewalCycle } from "./types";

const IN_CHUNK = 30;

export function usePipelineClients(
  studioId: string | null,
  fromKey: string,
  toKey: string,
): { clients: Client[]; loading: boolean; error: string | null } {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setClients([]);
    setError(null);
    if (!studioId) return;
    setLoading(true);
    return onSnapshot(
      query(
        collection(db, "clients"),
        where("homeStudioId", "==", studioId),
        where("renewal.focusDate", ">=", fromKey),
        where("renewal.focusDate", "<=", toKey),
        orderBy("renewal.focusDate", "asc"),
        limit(500),
      ),
      (snap) => {
        setClients(snap.docs.map((d) => ({ ...(d.data() as Client), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.warn("[renewals] pipeline read failed:", err);
        setError(
          String(err?.message ?? "").includes("index")
            ? "The renewals index is still building in Firestore. Try again in a few minutes."
            : "Couldn't load the renewals pipeline.",
        );
        setLoading(false);
      },
    );
  }, [studioId, fromKey, toKey]);
  return { clients, loading, error };
}

export function useCyclesFor(studioId: string | null, cycleKeys: string[]): Record<string, RenewalCycle> {
  const [cycles, setCycles] = useState<Record<string, RenewalCycle>>({});
  const keyString = useMemo(
    () => Array.from(new Set(cycleKeys.filter((k) => /^[A-Za-z0-9_-]{1,120}$/.test(k)))).sort().join(","),
    [cycleKeys],
  );
  useEffect(() => {
    setCycles({});
    if (!studioId || !keyString) return;
    const keys = keyString.split(",");
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < keys.length; i += IN_CHUNK) {
      const chunk = keys.slice(i, i + IN_CHUNK);
      unsubs.push(
        onSnapshot(
          query(collection(db, "studios", studioId, "renewals"), where(documentId(), "in", chunk)),
          (snap) =>
            setCycles((prev) => {
              const next = { ...prev };
              for (const k of chunk) delete next[k];
              snap.docs.forEach((d) => {
                next[d.id] = d.data() as RenewalCycle;
              });
              return next;
            }),
          (err) => console.warn("[renewals] cycles read failed:", err),
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [studioId, keyString]);
  return cycles;
}

/** How many of the studio's clients the engine couldn't place for lack of Mindbody data. */
export function useMissingDataCount(studioId: string | null, refreshKey: unknown): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    setCount(null);
    if (!studioId) return;
    let cancelled = false;
    getCountFromServer(
      query(
        collection(db, "clients"),
        where("homeStudioId", "==", studioId),
        where("renewal.situation", "==", "unknown"),
      ),
    )
      .then((snap) => {
        if (!cancelled) setCount(snap.data().count);
      })
      .catch((err) => console.warn("[renewals] missing-data count failed:", err));
    return () => {
      cancelled = true;
    };
  }, [studioId, refreshKey]);
  return count;
}

/** The clients behind that count, loaded only when a leader asks to see them. */
export function useMissingDataClients(studioId: string | null, enabled: boolean): Client[] | null {
  const [clients, setClients] = useState<Client[] | null>(null);
  useEffect(() => {
    setClients(null);
    if (!studioId || !enabled) return;
    return onSnapshot(
      query(
        collection(db, "clients"),
        where("homeStudioId", "==", studioId),
        where("renewal.situation", "==", "unknown"),
        limit(100),
      ),
      (snap) => setClients(snap.docs.map((d) => ({ ...(d.data() as Client), id: d.id }))),
      () => setClients([]),
    );
  }, [studioId, enabled]);
  return clients;
}
