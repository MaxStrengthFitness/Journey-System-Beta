/**
 * Reads for the Operations → Renewals pipeline.
 *
 * The pipeline's clients are the studio's roster the app already holds
 * (useStudioRoster), placed by admin/renewals/lanes.ts; until Oct 6 2026 it
 * had its own query here, a window of `renewal.focusDate`, which a client
 * too slow for the window never reached. Cycle documents (stage, leaning,
 * "needs a leader") come from small `in` queries for just the clients on
 * screen, never the whole collection.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, documentId, getCountFromServer, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import type { RenewalCycle } from "./types";

const IN_CHUNK = 30;

export function useCyclesFor(studioId: string | null, cycleKeys: string[]): Record<string, RenewalCycle> {
  return useCyclesRead(studioId, cycleKeys).cycles;
}

export interface CyclesRead {
  cycles: Record<string, RenewalCycle>;
  /** Some chunk has not answered yet. */
  loading: boolean;
  /**
   * Some chunk's read failed. A cycle missing then is UNKNOWN: "nobody has
   * talked to them" may not be said off it (the redesign's Operations room,
   * Sep 28 2026 — the pin "a failed lookup reads 'Nobody has talked to them
   * yet'").
   */
  failed: boolean;
}

/** The cycles for the clients on screen, with whether every chunk answered. */
export function useCyclesRead(studioId: string | null, cycleKeys: string[]): CyclesRead {
  const [cycles, setCycles] = useState<Record<string, RenewalCycle>>({});
  const [waiting, setWaiting] = useState<ReadonlySet<number>>(new Set());
  const [failedChunks, setFailedChunks] = useState<ReadonlySet<number>>(new Set());
  const keyString = useMemo(
    () => Array.from(new Set(cycleKeys.filter((k) => /^[A-Za-z0-9_-]{1,120}$/.test(k)))).sort().join(","),
    [cycleKeys],
  );
  useEffect(() => {
    setCycles({});
    setFailedChunks(new Set());
    if (!studioId || !keyString) {
      setWaiting(new Set());
      return;
    }
    const keys = keyString.split(",");
    const unsubs: Array<() => void> = [];
    const chunks: number[] = [];
    for (let i = 0; i < keys.length; i += IN_CHUNK) chunks.push(i);
    setWaiting(new Set(chunks));
    const settle = (i: number) =>
      setWaiting((prev) => {
        if (!prev.has(i)) return prev;
        const next = new Set(prev);
        next.delete(i);
        return next;
      });
    for (const i of chunks) {
      const chunk = keys.slice(i, i + IN_CHUNK);
      unsubs.push(
        onSnapshot(
          query(collection(db, "studios", studioId, "renewals"), where(documentId(), "in", chunk)),
          (snap) => {
            setCycles((prev) => {
              const next = { ...prev };
              for (const k of chunk) delete next[k];
              snap.docs.forEach((d) => {
                next[d.id] = d.data() as RenewalCycle;
              });
              return next;
            });
            settle(i);
          },
          (err) => {
            console.warn("[renewals] cycles read failed:", err);
            setFailedChunks((prev) => new Set(prev).add(i));
            settle(i);
          },
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [studioId, keyString]);
  return { cycles, loading: waiting.size > 0, failed: failedChunks.size > 0 };
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
