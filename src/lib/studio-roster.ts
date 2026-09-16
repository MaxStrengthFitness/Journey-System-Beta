/**
 * The studio roster — which client documents the app holds, and why.
 *
 * Round: hub sync fixes, Sep 16 2026 ("some clients on the Hub aren't synced,
 * especially after a studio switch or when the iPad has been open a while").
 *
 * WHAT WAS WRONG
 * --------------
 * `useLiveSchedule` used to fetch the clients named by the bookings in the
 * next nine days, re-reading the WHOLE set whenever the set of ids changed.
 * Three things followed from that:
 *
 *   1. A re-read requested while one was already running was dropped, and
 *      nothing asked again. On a studio switch the old studio's read was
 *      usually still in flight, so the new studio's roster was never read:
 *      the Hub showed "Not synced" on every block and the directory kept the
 *      PREVIOUS studio's clients (Solon clients listed in Strongsville).
 *   2. The set of ids is the only thing it watched. A client document the
 *      sync created after the first read — same ids, so no re-read — stayed
 *      "Not synced" until the app was reloaded, and no change to any client
 *      (a new nickname, tonight's renewal snapshot) ever arrived.
 *   3. Every booking added or cancelled re-read every client in the window.
 *
 * WHAT IT IS NOW
 * --------------
 *   STUDIO    one listener: `clients where homeStudioId == <this studio>`.
 *             About one read per client when the app opens or the studio
 *             changes (~300 at the largest studio), then one read per client
 *             that CHANGES. New clients the sync creates arrive on their own.
 *   VISITORS  clients booked here whose home is elsewhere (or who have no
 *             home studio yet). Fetched by id, only the ones the listener
 *             does not already hold — usually a handful — and re-checked on a
 *             slow timer.
 *
 * Everything in this file is pure so the rules can be tested without
 * Firestore; `useStudioRoster` does the reading and the wiring.
 */

import type { Client, ScheduleEntry } from "../types";

/**
 * Safety valve on the studio listener. A studio has ~300 clients today; this
 * only matters if a historical import (FileMaker) adds years of former
 * clients with the same `homeStudioId` — at which point the listener should
 * filter to active clients instead. The hook warns when it is hit.
 */
export const STUDIO_ROSTER_LIMIT = 1500;

/** Most visitor ids read in one pass (Firestore `in` takes 10 per query here). */
export const VISITOR_FETCH_CAP = 200;
export const VISITOR_CHUNK = 10;

/** A visitor document older than this is re-read on the next visible tick. */
export const VISITOR_STALE_MS = 15 * 60_000;

/**
 * An id that came back with no document (the sync has not created it yet, or
 * this trainer may not read it) is asked about again after this long — so a
 * document created later still turns up without an app reload, and a
 * genuinely missing one costs one read every few minutes, not one per render.
 */
export const MISSING_RECHECK_MS = 5 * 60_000;

/** Pause visitor reads for this long after Firestore reports a quota error. */
export const QUOTA_COOLDOWN_MS = 30_000;

/** The client ids the bookings point at, trimmed and de-duplicated, in order. */
export function bookedClientIds(schedules: readonly ScheduleEntry[]): string[] {
  const seen = new Set<string>();
  for (const s of schedules) {
    const id = s?.clientId == null ? "" : String(s.clientId).trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

export interface VisitorState {
  /** id → when its document was last read (ms). */
  fetchedAt: ReadonlyMap<string, number>;
  /** id → when it was last asked for and NOT returned (ms). */
  missingAt: ReadonlyMap<string, number>;
  /** ids being read right now. */
  inFlight: ReadonlySet<string>;
}

/**
 * Which booked clients to read by id right now.
 *
 * Skips anyone the studio listener holds (it is fresher than any fetch),
 * anyone read recently, anyone recently confirmed missing, and anyone already
 * being read. Capped so a very long calendar range cannot fire hundreds of
 * reads at once — the rest are picked up on the next pass.
 */
export function visitorIdsToFetch(
  bookedIds: readonly string[],
  studioIds: ReadonlySet<string>,
  state: VisitorState,
  now: number,
  cap: number = VISITOR_FETCH_CAP,
): string[] {
  const out: string[] = [];
  for (const id of bookedIds) {
    if (out.length >= cap) break;
    if (studioIds.has(id)) continue;
    if (state.inFlight.has(id)) continue;
    const fetched = state.fetchedAt.get(id);
    if (fetched !== undefined && now - fetched < VISITOR_STALE_MS) continue;
    const missing = state.missingAt.get(id);
    if (missing !== undefined && now - missing < MISSING_RECHECK_MS) continue;
    out.push(id);
  }
  return out;
}

/** Split ids into `in`-query sized chunks. */
export function chunk<T>(items: readonly T[], size: number = VISITOR_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The roster the app uses: the studio's own clients, then any visitor the
 * listener does not hold. The listener's copy wins when both have one (it is
 * live; the visitor copy is a fetch).
 */
export function mergeRoster(studio: readonly Client[], visitors: Iterable<Client>): Client[] {
  const byId = new Map<string, Client>();
  for (const c of visitors) if (c?.id) byId.set(c.id, c);
  for (const c of studio) if (c?.id) byId.set(c.id, c);
  return [...byId.values()];
}

/** Firestore's "you are over quota" shows up as a code or only in the message. */
export function isQuotaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    e?.code === "resource-exhausted" ||
    String(e?.message ?? "").toLowerCase().includes("quota")
  );
}

export function isPermissionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    e?.code === "permission-denied" ||
    String(e?.message ?? "").toLowerCase().includes("insufficient permissions")
  );
}
