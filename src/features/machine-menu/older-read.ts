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
 *     for the rest of the session in a memory keyed by the client AND the
 *     running session, and every machine's card draws them without another
 *     read. A new session starts with nothing remembered; the memory is
 *     forgotten at sign-out, like every other module memory on a shared iPad;
 *   - a read only this iPad's cache answered is a FAILED read, never an empty
 *     one: the hook's query refuses a `fromCache` answer, so nothing is
 *     remembered and the next tap reads those sessions again;
 *   - what is remembered counts as read only while it joins on to the
 *     tracker's window (`trustedReadIds`), so a window that moved never
 *     leaves a session between the two that neither read.
 *
 * The Firestore call itself is injected (`fetchSets`), so this file stays a
 * pure, testable half; the menu's data hook passes the real query.
 */
import { forgetOnSignOut } from "../sign-out/memory";
import { getBounded, setBounded } from "../../lib/bounded-map";
import { toIsoDate } from "../journey-grid/adapters";
import { isDrawableLog, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";

/** Firestore's limit on one `in` query, and the tracker's window. */
export const OLDER_PAGE = 30;

/** The tracker's window: the ids its logs listener asks for, and the past sessions among them. */
export interface LogsWindow {
  /** Every id the one `in` query asks for: the running session first, when there is one. */
  ids: string[];
  /** The past sessions in it, in the order given: what the grid draws as history. */
  past: string[];
}

/**
 * The tracker's window (machine menu design §F 6): the sessions whose sets
 * its logs listener reads, in ONE `in` query, so at most `OLDER_PAGE` ids.
 * The running session (the one recorded here, or the one being watched)
 * takes the first place when there is one; the past sessions take the rest,
 * newest first: 30 places, less one only when the running session is among
 * the ids. It used to take the newest 30 ids with the running session one of
 * them, while the grid drew 30 past columns, so the oldest column it drew
 * had no sets read. `past` is what the grid draws, so every column it draws
 * has its sets. `sessionIds` come in the tracker's order, newest first.
 */
export function logsWindowIds(
  sessionIds: readonly (string | null | undefined)[],
  runningId: string | null | undefined,
): LogsWindow {
  const running = runningId || null;
  const room = OLDER_PAGE - (running ? 1 : 0);
  const seen = new Set<string>();
  const past: string[] = [];
  for (const id of sessionIds) {
    if (past.length >= room) break;
    if (!id || id === running || seen.has(id)) continue;
    seen.add(id);
    past.push(id);
  }
  return { ids: running ? [running, ...past] : past, past };
}

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

/**
 * The sessions whose sets may be drawn: every session in the tracker's
 * window, and a session Load older read only while no session newer than it
 * is unread. Walking newest first, the first session in neither stops the
 * remembered ones from counting, so a window that moved by one (a new
 * session, or a back-dated one logged elsewhere) never leaves a hole the
 * model would take for "every session between two columns was read". Load
 * older then reads the hole first, being the newest unread session.
 */
export function trustedReadIds(
  sessions: readonly TimelineSessionInput[],
  windowIds: ReadonlySet<string>,
  rememberedIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>(windowIds);
  let gap = false;
  for (const s of newestFirst(sessions)) {
    if (windowIds.has(s.id)) continue;
    if (!gap && rememberedIds.has(s.id)) out.add(s.id);
    else gap = true;
  }
  return out;
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
 * The memory, for the rest of the session
 *
 * Keyed by `olderMemoryKey(clientId, sessionId)`: one client in one running
 * session. The next session (or the next day's, on an iPad left signed in)
 * starts with nothing remembered, so a remembered read never outlives the
 * session it was made in, nor goes stale behind a later edit.
 * ------------------------------------------------------------------ */

interface Remembered {
  ids: Set<string>;
  logs: Map<string, TimelineLogInput>;
}

const memory = new Map<string, Remembered>();
/**
 * The keys kept: a few clients' older sets (the session's client, and a
 * profile or two looked at beside it). A shared iPad signed in for days
 * gained one per client per session and never let one go (audit W11); a key
 * let go is read again from Load older, as on a fresh start.
 */
export const OLDER_MEMORY_KEYS = 8;

forgetOnSignOut(() => {
  memory.clear();
});

const logKey = (l: TimelineLogInput): string => l.id ?? `${l.sessionId}_${l.machineId}${l.side ? `_${l.side}` : ""}`;

/** The memory's key: this client, in this running session (none running: the empty id). */
export function olderMemoryKey(clientId: string, sessionId: string | null | undefined): string {
  return clientId ? `${clientId}|${sessionId ?? ""}` : "";
}

/** Keep an older read under its key. A later read of the same set replaces it. */
export function rememberOlderSets(key: string, read: OlderRead<TimelineLogInput>): void {
  if (!key) return;
  const kept = getBounded(memory, key) ?? { ids: new Set<string>(), logs: new Map<string, TimelineLogInput>() };
  for (const id of read.ids) kept.ids.add(id);
  for (const l of read.logs) kept.logs.set(logKey(l), l);
  setBounded(memory, key, kept, OLDER_MEMORY_KEYS);
}

/** What Load older has read under this key, so far this session. */
export function olderSetsFor(key: string): { ids: ReadonlySet<string>; logs: TimelineLogInput[] } {
  const kept = getBounded(memory, key);
  return { ids: kept ? new Set(kept.ids) : new Set<string>(), logs: kept ? [...kept.logs.values()] : [] };
}
