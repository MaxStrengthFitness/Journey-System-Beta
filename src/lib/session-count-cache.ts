import {
  collection,
  getCountFromServer,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Cached, de-duplicated "how many completed sessions does this client have?"
 *
 * WHY THIS EXISTS: the client profile reconciles `client.sessionCount` against
 * a live server count. That effect depended on the `sessions` ARRAY, which the
 * profile's snapshot listener rebuilds on every Firestore write — so a bulk
 * schedule sync (432 appointments) produced a snapshot storm, and each snapshot
 * fired another aggregation query. The browser's read quota went in seconds and
 * the console filled with 429s.
 *
 * Three guards, in order of importance:
 *   1. In-flight de-duplication — N concurrent callers share ONE query.
 *   2. A short TTL cache — repeat asks inside the window cost nothing.
 *   3. A quota cooldown — once Firestore says "resource-exhausted", stop asking
 *      for a while and serve the last known value instead of hammering.
 */

type CacheEntry = { count: number; fetchedAt: number };

const CACHE_TTL_MS = 60_000;
const QUOTA_COOLDOWN_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<number | null>>();
let quotaCooldownUntil = 0;

/** Test seam. */
export function __resetSessionCountCache(): void {
  cache.clear();
  inFlight.clear();
  quotaCooldownUntil = 0;
}

/** Call after a session is completed or discarded so the next read is fresh. */
export function invalidateSessionCount(clientId: string): void {
  cache.delete(clientId);
}

export function getCachedSessionCount(clientId: string): number | null {
  const hit = cache.get(clientId);
  return hit ? hit.count : null;
}

/**
 * Returns the client's completed-session count, or null when it cannot be
 * determined right now (quota cooldown with nothing cached, or a failed read).
 *
 * Null means "unknown" — callers must leave their existing value alone rather
 * than treating it as zero.
 */
export async function getCompletedSessionCount(
  clientId: string,
  options: { force?: boolean } = {},
): Promise<number | null> {
  if (!clientId) return null;

  const cached = cache.get(clientId);
  if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.count;
  }

  const pending = inFlight.get(clientId);
  if (pending) return pending;

  if (Date.now() < quotaCooldownUntil) {
    // Serve whatever we last knew rather than adding to the pile-up.
    return cached ? cached.count : null;
  }

  const request = (async (): Promise<number | null> => {
    try {
      const snapshot = await getCountFromServer(
        query(
          collection(db, "sessions"),
          where("clientId", "==", clientId),
          where("status", "==", "Completed"),
        ),
      );
      const count = snapshot.data().count;
      cache.set(clientId, { count, fetchedAt: Date.now() });
      return count;
    } catch (error: any) {
      const code = error?.code || "";
      if (
        code === "resource-exhausted" ||
        String(error?.message || "").includes("Quota exceeded")
      ) {
        quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.warn(
          `Session count: Firestore quota exceeded; pausing count reads for ${
            QUOTA_COOLDOWN_MS / 1000
          }s.`,
        );
      } else {
        console.error("Error fetching session count", error);
      }
      return cached ? cached.count : null;
    } finally {
      inFlight.delete(clientId);
    }
  })();

  inFlight.set(clientId, request);
  return request;
}
