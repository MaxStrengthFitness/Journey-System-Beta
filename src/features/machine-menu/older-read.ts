/**
 * THE MACHINE MENU — "Load older" in a session.
 *
 * The Active Session holds every one of the client's sessions (its sessions
 * listener has no limit) but reads the SETS of only the newest 30: its logs
 * listener asks `where("sessionId", "in", ids)`, and Firestore takes at most
 * 30 ids in one `in`. Load older on the menu runs that same query again for
 * the next 30 sessions whose sets haven't been read, newest first. So:
 *
 *   - no new index (it is the tracker's own query shape);
 *   - session order comes from the sessions, never from a log's `createdAt`,
 *     which a set entered after the fact stamps with the day it was typed;
 *   - every machine's sets come back (about 200 documents), so they are kept
 *     for the rest of the session in a per-client memory, and every
 *     machine's card draws them without another read. The memory is
 *     forgotten at sign-out, like every other module memory on a shared iPad.
 *
 * The Firestore call itself is injected (`fetchSets`), so this file stays a
 * pure, testable half; the menu's data hook passes the real query.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import { toIsoDate } from "../journey-grid/adapters";
import { isDrawableLog, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";

/** Firestore's limit on one `in` query, and the tracker's window. */
export const OLDER_PAGE = 30;

type SessionWithId = TimelineSessionInput & { id: string };

/** Newest first, by the session's own day, then its number: the tracker's order. */
export function newestFirst<T extends TimelineSessionInput>(sessions: readonly T[]): (T & { id: string })[] {
  return sessions
    .filter((s): s is T & { id: string } => !!s?.id)
    .map((s) => ({ s, day: toIsoDate(s.date ?? "") }))
    .sort((a, b) => b.day.localeCompare(a.day) || (b.s.sessionNumber ?? 0) - (a.s.sessionNumber ?? 0) || b.s.id.localeCompare(a.s.id))
    .map((x) => x.s);
}

/**
 * The next sessions to read: those whose sets haven't been read, newest
 * first, at most `n`. Reading is by whole sessions from the newest back, so
 * these are always the ones just older than what was read.
 */
export function nextOlderSessionIds(
  sessions: readonly TimelineSessionInput[],
  readIds: ReadonlySet<string>,
  n: number = OLDER_PAGE,
): string[] {
  const limit = Math.max(0, Math.min(OLDER_PAGE, Math.trunc(n)));
  return newestFirst(sessions)
    .filter((s) => !readIds.has(s.id))
    .slice(0, limit)
    .map((s) => s.id);
}

/** Are there sessions whose sets haven't been read? Load older shows only then. */
export function hasOlderToRead(sessions: readonly TimelineSessionInput[], readIds: ReadonlySet<string>): boolean {
  return sessions.some((s) => !!s?.id && !readIds.has(s.id));
}

/** A set, with the studio day of the session it belongs to. */
export type DatedLog<L extends TimelineLogInput = TimelineLogInput> = L & { day: string };

/**
 * Join sets to their sessions' days. A set whose session isn't known is left
 * out (its day can't be told), and so is a placeholder Start seeded in a
 * session that never finished (`isDrawableLog`): only a set someone worked on
 * counts from one of those, and a finished session's sets all carry their
 * outcome.
 */
export function joinLogsToSessions<L extends TimelineLogInput>(
  logs: readonly L[],
  sessions: readonly TimelineSessionInput[],
  runningSessionId?: string | null,
): DatedLog<L>[] {
  const byId = new Map<string, SessionWithId>();
  for (const s of sessions) if (s?.id) byId.set(s.id, s as SessionWithId);
  const out: DatedLog<L>[] = [];
  for (const log of logs) {
    const session = log?.sessionId ? byId.get(log.sessionId) : undefined;
    if (!session) continue;
    const day = toIsoDate(session.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!isDrawableLog(log, session, runningSessionId)) continue;
    out.push({ ...log, day });
  }
  return out;
}

export interface OlderRead<L extends TimelineLogInput> {
  /** The session ids this read covered (whether or not they held a set). */
  ids: string[];
  logs: L[];
}

/**
 * Read the next page: pick the ids, fetch their sets through the injected
 * query, and hand back both. An empty pick reads nothing. A failed fetch
 * throws to the caller, which says "Couldn't load older sessions".
 */
export async function readOlderSets<L extends TimelineLogInput>(
  fetchSets: (sessionIds: string[]) => Promise<L[]>,
  sessions: readonly TimelineSessionInput[],
  readIds: ReadonlySet<string>,
  n: number = OLDER_PAGE,
): Promise<OlderRead<L>> {
  const ids = nextOlderSessionIds(sessions, readIds, n);
  if (ids.length === 0) return { ids, logs: [] };
  const wanted = new Set(ids);
  const logs = (await fetchSets(ids)).filter((l) => !!l && wanted.has(l.sessionId));
  return { ids, logs };
}

/* ------------------------------------------------------------------ *
 * The per-client memory, for the rest of the session
 * ------------------------------------------------------------------ */

interface Remembered {
  ids: Set<string>;
  logs: Map<string, TimelineLogInput>;
}

const memory = new Map<string, Remembered>();

forgetOnSignOut(() => {
  memory.clear();
});

const logKey = (l: TimelineLogInput): string => l.id ?? `${l.sessionId}_${l.machineId}${l.side ? `_${l.side}` : ""}`;

/** Keep an older read for this client. A later read of the same set replaces it. */
export function rememberOlderSets(clientId: string, read: OlderRead<TimelineLogInput>): void {
  if (!clientId) return;
  const kept = memory.get(clientId) ?? { ids: new Set<string>(), logs: new Map<string, TimelineLogInput>() };
  for (const id of read.ids) kept.ids.add(id);
  for (const l of read.logs) kept.logs.set(logKey(l), l);
  memory.set(clientId, kept);
}

/** What has been read for this client by Load older, so far this session. */
export function olderSetsFor(clientId: string): { ids: ReadonlySet<string>; logs: TimelineLogInput[] } {
  const kept = memory.get(clientId);
  return { ids: kept ? new Set(kept.ids) : new Set<string>(), logs: kept ? [...kept.logs.values()] : [] };
}
