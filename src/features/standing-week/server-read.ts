/**
 * AN ANSWER FROM THE SERVER, OR "CAN'T TELL" (voice review follow-up, Sep 27
 * 2026).
 *
 * Firestore here keeps a persistent local cache (src/firebase.ts). With no
 * connection, or before the server has answered, a listener is handed what
 * this iPad last saw, flagged `fromCache`. An empty or stale cache is not an
 * answer: read as one, the week check would call every agreed slot the cache
 * lacks "open", and Team would say a trainer "hasn't proposed" a week they
 * proposed yesterday. AJ's rule: a day whose bookings weren't read is "can't
 * tell", never "open".
 *
 * So a read the screen may act on is one the server confirmed. While it
 * waits, the screen says it is reading; once this iPad is offline, or the
 * server has not answered in SERVER_WAIT_MS, it says it can't tell — its own
 * sentence, never an empty list.
 *
 * PURE MODULE. `useServerWait` is the clock and the browser's online flag.
 */

/** How long a read may wait for the server before the screen says it can't tell. */
export const SERVER_WAIT_MS = 15_000;

export type ServerRead = "ready" | "loading" | "failed" | "offline";

export interface ServerReadInput {
  /** No answer at all yet. */
  loading: boolean;
  /** The read failed (permissions, an index, a quota). */
  failed: boolean;
  /** The latest answer came from this iPad's cache alone. */
  fromCache: boolean;
  /** The browser says it has a connection. */
  online: boolean;
  /** The read has waited SERVER_WAIT_MS for the server. */
  waitedOut: boolean;
}

export function serverRead(r: ServerReadInput): ServerRead {
  if (r.failed) return "failed";
  if (!r.loading && !r.fromCache) return "ready";
  return !r.online || r.waitedOut ? "offline" : "loading";
}

/** A snapshot this iPad's cache answered alone. A fake without metadata is the server's. */
export function isCacheOnly(snap: { metadata?: { fromCache?: boolean } | null } | null | undefined): boolean {
  return snap?.metadata?.fromCache === true;
}
