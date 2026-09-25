/**
 * WHICH CLIENTS THE SCHEDULE PULL STILL LOOKS UP (the lean pull, Sep 25 2026).
 *
 * Every schedule pull used to ask Mindbody's client/clients about every
 * client in its window, 20 to a call, with nothing kept between pulls: on a
 * 150-session week that is 5 to 7 calls of every ~12 a pull spends, fifteen
 * minutes after the last pull learned the same names. The browser now sends
 * the Mindbody ids of clients Journey already holds and names (see
 * SyncOptions in lib/mindbody-api-sync.ts), and the server leaves those out.
 *
 * Pure so the server's route and its test agree on one rule. The list comes
 * from the browser, so it is treated as untrusted: only plain ids are kept,
 * and there is a ceiling. A bad or oversized list can only make the server
 * look up MORE clients (the old behaviour), never fewer than it should,
 * because an id that is dropped from the list is simply looked up.
 */

/** Far above any studio's roster; the ceiling only stops a runaway body. */
export const MAX_SKIP_IDS = 5000;

const PLAIN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The ids a request asked to skip, as a set of trimmed strings. */
export function parseSkipIds(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const v of raw) {
    if (out.size >= MAX_SKIP_IDS) break;
    if (typeof v !== "string" && typeof v !== "number") continue;
    const id = String(v).trim();
    if (PLAIN_ID.test(id)) out.add(id);
  }
  return out;
}

/** The client ids still to look up, in their original order. */
export function idsToLookUp(uniqueClientIds: string[], skip: Set<string>): string[] {
  if (skip.size === 0) return uniqueClientIds;
  return uniqueClientIds.filter((id) => !skip.has(String(id).trim()));
}
