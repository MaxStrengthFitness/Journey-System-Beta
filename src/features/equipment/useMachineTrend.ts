import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { MachineTrend } from "../machine-trends/trends";

/**
 * One machine's weekly trends document (machineTrends/{machineId}), read at
 * most ONCE per machine per app session.
 *
 * The document changes once a week, and a trainer setting up a client taps
 * the same handful of machines all day, so a module-level cache is the whole
 * cost story: the first "Set up" on a machine costs one read, every later one
 * costs nothing. A failed read is cached as `null` for this session and the
 * Settings card simply offers no suggestion — unknown, never "nobody uses it".
 */

type TrendResult = MachineTrend | null;

/** `failed` tells "could not be read" from "read fine, there is no document" — both have a null trend. */
export interface TrendRead {
  trend: TrendResult;
  failed: boolean;
}

const cache = new Map<string, Promise<TrendRead>>();

/** The read with its outcome. Machine fit needs the difference: unknown is not empty. */
export function fetchMachineTrendRead(machineId: string): Promise<TrendRead> {
  let hit = cache.get(machineId);
  if (!hit) {
    hit = getDoc(doc(db, "machineTrends", machineId))
      .then((snap) => ({ trend: snap.exists() ? (snap.data() as MachineTrend) : null, failed: false }))
      .catch((err) => {
        console.warn("[machine trends] read failed", machineId, err);
        return { trend: null, failed: true };
      });
    cache.set(machineId, hit);
  }
  return hit;
}

export function fetchMachineTrend(machineId: string): Promise<TrendResult> {
  return fetchMachineTrendRead(machineId).then((r) => r.trend);
}

/** Test seam. */
export function __resetMachineTrendCache() {
  cache.clear();
}

/**
 * `enabled` gates the read: the Settings card asks only while it is being
 * edited, for a client with a known height.
 */
export function useMachineTrend(machineId: string | null | undefined, enabled: boolean): TrendResult {
  const [trend, setTrend] = useState<TrendResult>(null);
  useEffect(() => {
    if (!enabled || !machineId) {
      setTrend(null);
      return;
    }
    let live = true;
    fetchMachineTrend(machineId).then((t) => {
      if (live) setTrend(t);
    });
    return () => {
      live = false;
    };
  }, [machineId, enabled]);
  return trend;
}
