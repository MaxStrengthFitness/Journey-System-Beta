import {
  collection,
  getCountFromServer,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * How many active clients does a studio have?
 *
 * WHY THIS EXISTS: the old admin Overview computed it as
 *
 *     clients.filter(c => c.homeStudioId === studio.id)
 *
 * where `clients` is AppContent's roster — and that roster is built from the
 * ACTIVE studio's schedule. So the studio you were looking at showed 86 and
 * every other studio in the network showed 0, on a screen whose whole purpose
 * was comparing studios. It was read as a Mindbody location-id bug; it was a
 * scoping bug, and it would have come back the moment any other screen counted
 * clients the same way.
 *
 * A server-side aggregation is the fix: correct for every studio, and one read
 * per 1,000 documents rather than one per document. Guards are lifted straight
 * from session-count-cache.ts, which exists because unguarded aggregation
 * queries in a snapshot storm are what emptied the browser read quota before.
 *
 * NEEDS AN INDEX: clients(homeStudioId ASC, isActive ASC), added to
 * firestore.indexes.json in the same commit. Deploy indexes before this ships
 * or every count returns null and the UI shows an em-dash.
 */

type CacheEntry = { count: number; fetchedAt: number };

/** Client rosters move in days, not seconds. */
const CACHE_TTL_MS = 5 * 60_000;
const QUOTA_COOLDOWN_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<number | null>>();
let quotaCooldownUntil = 0;

/** Test seam. */
export function __resetStudioClientCounts(): void {
  cache.clear();
  inFlight.clear();
  quotaCooldownUntil = 0;
}

export function getCachedStudioClientCount(studioId: string): number | null {
  return cache.get(studioId)?.count ?? null;
}

/**
 * Active clients whose home studio is `studioId`, or null when the number
 * cannot be determined right now.
 *
 * Null means UNKNOWN. Callers must render it as unknown — an em-dash, the
 * previous value — never as zero. "0 active clients" is a statement about a
 * business, and this function is not entitled to make it on a failed read.
 */
export async function getStudioClientCount(
  studioId: string,
  options: { force?: boolean } = {},
): Promise<number | null> {
  if (!studioId) return null;

  const cached = cache.get(studioId);
  if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
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
          `Studio client count: Firestore quota exceeded; pausing for ${
            QUOTA_COOLDOWN_MS / 1000
          }s.`,
        );
      } else {
        console.error("Error counting studio clients", error);
      }
      return cached ? cached.count : null;
    } finally {
      inFlight.delete(studioId);
    }
  })();

  inFlight.set(studioId, request);
  return request;
}

/**
 * Counts for several studios at once, in sequence rather than in parallel.
 *
 * Sequential on purpose: the Studios screen lists every location in the
 * network, and firing sixty aggregation queries in one tick is precisely the
 * burst the cooldown above exists to survive. Sixty sequential counts take
 * about a second and cost sixty reads.
 */
export async function getStudioClientCounts(
  studioIds: string[],
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const id of studioIds) {
    out[id] = await getStudioClientCount(id);
  }
  return out;
}
