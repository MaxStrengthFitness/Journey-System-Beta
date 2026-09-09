import {
  collection,
  getCountFromServer,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Cached, de-duplicated "how many active clients does this studio have?"
 *
 * Feeds the quick stats on the studio picker. Written with the same three
 * guards as session-count-cache.ts, for the same reason: the Aug 30 quota storm
 * came from aggregation queries fired without dedupe or cooldown. This one runs
 * on the screen EVERY trainer sees at EVERY login, before a studio is even
 * chosen, so it is the last place to be casual about read volume.
 *
 *   1. In-flight de-duplication — concurrent callers share one query.
 *   2. TTL cache — a re-render, or a second login in the same window, is free.
 *   3. Quota cooldown — once Firestore says "resource-exhausted", stop asking.
 *
 * Cost is one aggregation read per studio per TTL window (Firestore bills a
 * count query as one read per 1000 documents matched), NOT one read per client.
 *
 * Runs on the existing clients[homeStudioId, isActive] composite index, so it
 * needs no index deploy.
 *
 * Null means "unknown", never zero — a studio whose count could not be read
 * shows no number rather than claiming it has no clients.
 */

type CacheEntry = { count: number; fetchedAt: number };

const CACHE_TTL_MS = 300_000; // 5 min: a roster size does not move quickly.
const QUOTA_COOLDOWN_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<number | null>>();
let quotaCooldownUntil = 0;

/** Test seam. */
export function __resetStudioRosterCountCache(): void {
  cache.clear();
  inFlight.clear();
  quotaCooldownUntil = 0;
}

export function getCachedStudioClientCount(studioId: string): number | null {
  const hit = cache.get(studioId);
  return hit ? hit.count : null;
}

export async function getStudioClientCount(
  studioId: string,
): Promise<number | null> {
  if (!studioId) return null;

  const cached = cache.get(studioId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.count;
  }

  const pending = inFlight.get(studioId);
  if (pending) return pending;

  if (Date.now() < quotaCooldownUntil) {
    return cached ? cached.count : null;
  }

  const request = (async (): Promise<number | null> => {
    try {
      const snapshot = await getCountFromServer(
        query(
          collection(db, "clients"),
          where("homeStudioId", "==", studioId),
          where("isActive", "==", true),
        ),
      );
      const count = snapshot.data().count;
      cache.set(studioId, { count, fetchedAt: Date.now() });
      return count;
    } catch (error: any) {
      const code = error?.code || "";
      if (
        code === "resource-exhausted" ||
        String(error?.message || "").includes("Quota exceeded")
      ) {
        quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn(
          `Studio roster count: Firestore quota exceeded; pausing for ${
            QUOTA_COOLDOWN_MS / 1000
          }s.`,
        );
      } else {
        console.error("Error fetching studio client count", error);
      }
      return cached ? cached.count : null;
    } finally {
      inFlight.delete(studioId);
    }
  })();

  inFlight.set(studioId, request);
  return request;
}
