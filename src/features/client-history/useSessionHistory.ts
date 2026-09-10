import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { ExerciseLog } from "../../types";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { HistorySession } from "./model";

/**
 * SESSIONS FOR THE HISTORY TAB.
 *
 * The old calendar subscribed to `limit(30)` and nothing else, so a client's
 * history stopped about four months back no matter what you did — and the
 * "Load More Sessions" button under it set a state variable that nothing
 * read. This hook is the replacement.
 *
 * ONE live listener, in TWO steps:
 *   1. The newest FIRST_WINDOW sessions. For a twice-a-week client that is
 *      about two years, which is the whole history for most of the roster.
 *   2. "Load full history" re-subscribes with FULL_WINDOW.
 *
 * Why not page with cursors: a cursor page is a one-off read, so a session
 * edited or deleted in an older page would keep showing its old self. One
 * listener keeps every visible session live — delete one from the pop-up and
 * it leaves the calendar at once. The price is re-reading the first window
 * when stepping up, once, and only when someone asks for the whole history.
 *
 * Session documents only. Sets are loaded per month by useSessionLogs, and
 * only for months someone scrolls to in the list — sets are most of the reads.
 */
export const FIRST_WINDOW = 200;
export const FULL_WINDOW = 2000;

export interface SessionHistoryState {
  /** Newest first, as Firestore returns them. */
  sessions: HistorySession[];
  status: "loading" | "ready" | "error";
  /** The window was full, so there are probably older sessions. */
  hasMore: boolean;
  /** Whether the full-history step has been taken. */
  isFull: boolean;
  loadAll: () => void;
}

/** How long to wait for the server before showing what the offline cache has. */
const CACHE_GRACE_MS = 2500;

export function useSessionHistory(
  clientId: string | null | undefined,
  enabled = true,
): SessionHistoryState {
  // "Full" belongs to one client: opening someone else starts small again.
  const [fullFor, setFullFor] = useState<string | null>(null);
  const isFull = Boolean(clientId) && fullFor === clientId;
  const windowSize = isFull ? FULL_WINDOW : FIRST_WINDOW;

  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [status, setStatus] = useState<SessionHistoryState["status"]>("loading");
  const [hasMore, setHasMore] = useState(false);
  const shownFor = useRef<string | null | undefined>(clientId);

  useEffect(() => {
    if (!clientId || !enabled) return;
    if (shownFor.current !== clientId) {
      // Never show one client's history under another client's name.
      shownFor.current = clientId;
      setSessions([]);
      setStatus("loading");
      setHasMore(false);
    }
    const q = query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      orderBy("date", "desc"),
      limit(windowSize),
    );

    /*
     * The app runs Firestore with a persistent offline cache, so the FIRST
     * snapshot is usually whatever the cache holds — on a first visit that is
     * the fifteen sessions the profile just fetched for the Journey grid. Drawn
     * as-is, the tab would show fifteen visits' worth of stats, number the rows
     * S15…S1, then jump when the server answered. So a cached snapshot fills
     * the list but does not end "loading", and never claims the history is
     * complete; the server's answer does. If the server never answers (the
     * tablet is offline), the cache is shown after a short grace period.
     */
    let heardFromServer = false;
    const grace = setTimeout(() => {
      if (!heardFromServer) setStatus((current) => (current === "loading" ? "ready" : current));
    }, CACHE_GRACE_MS);

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        if (!fromCache) heardFromServer = true;
        // Metadata-only events (a pending write confirming) change nothing drawn.
        if (snap.docChanges().length > 0 || !fromCache) {
          setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistorySession));
        }
        setHasMore(fromCache ? true : snap.size >= windowSize);
        if (!fromCache) setStatus("ready");
      },
      (error) => {
        setStatus("error");
        handleFirestoreError(error, OperationType.LIST, "sessions");
      },
    );
    return () => {
      clearTimeout(grace);
      unsubscribe();
    };
  }, [clientId, enabled, windowSize]);

  const loadAll = useCallback(() => setFullFor(clientId ?? null), [clientId]);

  return { sessions, status, hasMore, isFull, loadAll };
}

/**
 * SETS, PER SESSION, ON DEMAND.
 *
 * `request(ids)` fetches the exercise logs for sessions not seen yet, ten ids
 * to an `in` query — the same batching the profile's own loader uses. The
 * profile has usually loaded the newest fifteen sessions' sets already for the
 * Journey grid; those arrive as `seed` and are never fetched twice.
 *
 * A session with no sets is stored as an empty list, so "loaded, nothing
 * there" and "not loaded yet" stay different things — the list shows a quiet
 * placeholder for the second and "No sets recorded" for the first.
 */
export function useSessionLogs(seed: ExerciseLog[] = []) {
  const [logsBySession, setLogsBySession] = useState<Map<string, ExerciseLog[]>>(() => new Map());
  const requested = useRef(new Set<string>());
  /** Ids whose sets could only come from the offline cache — asked again when back online. */
  const waiting = useRef(new Set<string>());

  useEffect(() => {
    if (seed.length === 0) return;
    const grouped = new Map<string, ExerciseLog[]>();
    for (const log of seed) {
      if (!log.sessionId) continue;
      const list = grouped.get(log.sessionId) ?? [];
      list.push(log);
      grouped.set(log.sessionId, list);
    }
    setLogsBySession((prev) => {
      let changed = false;
      const next = new Map(prev);
      grouped.forEach((logs, id) => {
        if (next.has(id)) return;
        next.set(id, logs);
        requested.current.add(id);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [seed]);

  const request = useCallback(async (sessionIds: string[]) => {
    const wanted = Array.from(new Set(sessionIds)).filter(
      (id) => id && !requested.current.has(id),
    );
    if (wanted.length === 0) return;
    wanted.forEach((id) => requested.current.add(id));

    const chunks: string[][] = [];
    for (let i = 0; i < wanted.length; i += 10) chunks.push(wanted.slice(i, i + 10));

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const snap = await getDocs(
            query(collection(db, "exerciseLogs"), where("sessionId", "in", chunk)),
          );
          // Offline, getDocs answers from the cache, which may hold some of a
          // session's sets or none. Recording that as "loaded" would label a
          // session "No sets recorded" for good; leave it waiting instead.
          if (snap.metadata.fromCache) {
            chunk.forEach((id) => {
              requested.current.delete(id);
              waiting.current.add(id);
            });
            return;
          }
          const found = new Map<string, ExerciseLog[]>(chunk.map((id) => [id, []]));
          snap.docs.forEach((d) => {
            const log = { id: d.id, ...d.data() } as ExerciseLog;
            found.get(log.sessionId)?.push(log);
          });
          chunk.forEach((id) => waiting.current.delete(id));
          setLogsBySession((prev) => {
            const next = new Map(prev);
            found.forEach((logs, id) => next.set(id, logs));
            return next;
          });
        } catch (error) {
          // Let a later scroll, or the connection coming back, try again.
          chunk.forEach((id) => {
            requested.current.delete(id);
            waiting.current.add(id);
          });
          handleFirestoreError(error, OperationType.LIST, "exerciseLogs");
        }
      }),
    );
  }, []);

  useEffect(() => {
    const retry = () => {
      if (waiting.current.size > 0) void request(Array.from(waiting.current));
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [request]);

  /** The session pop-up saved edits: take its copy as the truth. */
  const replace = useCallback((sessionId: string, logs: ExerciseLog[]) => {
    requested.current.add(sessionId);
    waiting.current.delete(sessionId);
    setLogsBySession((prev) => new Map(prev).set(sessionId, logs));
  }, []);

  const forget = useCallback((sessionId: string) => {
    requested.current.delete(sessionId);
    setLogsBySession((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  return { logsBySession, request, replace, forget };
}
