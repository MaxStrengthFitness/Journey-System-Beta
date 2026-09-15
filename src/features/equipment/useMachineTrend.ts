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

const cache = new Map<string, Promise<TrendResult>>();

export function fetchMachineTrend(machineId: string): Promise<TrendResult> {
  let hit = cache.get(machineId);
  if (!hit) {
    hit = getDoc(doc(db, "machineTrends", machineId))
      .then((snap) => (snap.exists() ? (snap.data() as MachineTrend) : null))
      .catch((err) => {
        console.warn("[machine trends] read failed", machineId, err);
        return null;
      });
    cache.set(machineId, hit);
  }
  return hit;
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
