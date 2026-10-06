/**
 * A STUDIO'S SESSIONS IN A WINDOW — one paged read, one place.
 *
 * Operations round, Sep 2026. Insights, Hours and the Exports tab all ask
 * the same question of Firestore: this studio's sessions with a `createdAt`
 * inside a window. Three copies of the query were three chances to drift
 * (one had no upper bound, one no cap), so the read lives here.
 *
 * `createdAt` and not `date`: the (hostedAtStudioId, createdAt) index exists
 * and `date` has no index; callers that care which DAY a session belongs to
 * filter the result with `sessionDay` (insights/metrics). The cap is a
 * guard rail, not a page — when it bites, `truncated` is true and the
 * screen says so rather than showing a number computed from part of the
 * month.
 *
 * CLOSED DAYS ARE KEPT (speed round, Oct 5 2026; R26). Operations' pages
 * (Today, Week, Team, Hours) each read their studio's sessions when they
 * open, and a page switch unmounts the last one, so a leader walking Today →
 * Week → Team read the same fortnight three times. The hook now keeps the
 * part of a read that lies before the studio's today, for this studio, for
 * fifteen minutes, and forgets it at sign-out; TODAY IS ALWAYS READ LIVE. A
 * stale "nobody logged it" for today could invite a wrong late-cancel mark,
 * which the renewal pace counts, so today never comes from the keep.
 * `fromServer` reads, and the plain `fetchSessionsInRange`, never use it.
 */
import { useEffect, useState } from "react";
import { Timestamp, collection, getDocs, getDocsFromServer, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { WorkoutSession } from "../../types";
import { forgetOnSignOut } from "../sign-out/memory";
import { studioDayBoundsForKey, studioTodayKey } from "../../lib/studio-time";
import { millis } from "./insights/metrics";

/** A busy studio does forty sessions a day; a month is well under this. */
export const MAX_SESSIONS_IN_RANGE = 1500;

export interface SessionsRange {
  studioId: string;
  startMs: number;
  /** Omit for "since startMs". */
  endMs?: number;
  max?: number;
  /**
   * Only the server's answer (My Profile → Your week, Openings round, Sep 27
   * 2026). With the persistent cache, a plain read offline is answered by
   * whatever this iPad last saw; with this set it fails instead, and the
   * screen says it can't read. Absent or false: the read Hours, Insights and
   * Exports have always made.
   */
  fromServer?: boolean;
}

export interface SessionsRangeResult {
  sessions: WorkoutSession[];
  truncated: boolean;
}

export async function fetchSessionsInRange({ studioId, startMs, endMs, max = MAX_SESSIONS_IN_RANGE, fromServer = false }: SessionsRange): Promise<SessionsRangeResult> {
  const clauses = [
    where("hostedAtStudioId", "==", studioId),
    where("createdAt", ">=", Timestamp.fromMillis(startMs)),
    ...(endMs !== undefined ? [where("createdAt", "<=", Timestamp.fromMillis(endMs))] : []),
    orderBy("createdAt", "desc"),
    fsLimit(max),
  ];
  const q = query(collection(db, "sessions"), ...clauses);
  const snap = await (fromServer ? getDocsFromServer(q) : getDocs(q));
  return {
    sessions: snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id })),
    truncated: snap.size >= max,
  };
}

/* ------------------------------------------------------------------ *
 * The keep: closed days only
 * ------------------------------------------------------------------ */

/** How long a closed stretch is kept: an edit to a past session shows within this. */
export const CLOSED_KEEP_MS = 15 * 60_000;

interface ClosedStretch {
  fromMs: number;
  /** Inclusive, and always before the studio's today when it was read. */
  toMs: number;
  /** Newest first, as the query returns them. */
  sessions: WorkoutSession[];
  readAt: number;
}

/** By studio. The Demo studio has its own id, so the practice realm never meets a real one. */
const closedKeep = new Map<string, ClosedStretch[]>();
forgetOnSignOut(() => closedKeep.clear());

/** For tests: forget every kept stretch. */
export function forgetClosedSessions(): void {
  closedKeep.clear();
}

const createdMsOf = (s: WorkoutSession): number => millis(s.createdAt) ?? 0;

/**
 * The same read as `fetchSessionsInRange`, with the part before the studio's
 * today taken from the keep when this studio's stretch covering it was read
 * in the last CLOSED_KEEP_MS (and was not cut by the cap). Today is read
 * every time. Two reads at most, side by side.
 */
export async function readSessionsInRange(range: SessionsRange, now: Date = new Date()): Promise<SessionsRangeResult> {
  const { studioId, startMs, endMs, max = MAX_SESSIONS_IN_RANGE } = range;
  if (range.fromServer) return fetchSessionsInRange(range);
  const todayStart = studioDayBoundsForKey(studioTodayKey(now)).start.getTime();
  if (startMs >= todayStart) return fetchSessionsInRange(range);
  const closedTo = Math.min(endMs ?? Number.POSITIVE_INFINITY, todayStart - 1);
  const wantsToday = endMs === undefined || endMs >= todayStart;

  const closed = (async (): Promise<SessionsRangeResult> => {
    const kept = (closedKeep.get(studioId) ?? []).find(
      (c) => c.fromMs <= startMs && c.toMs >= closedTo && now.getTime() - c.readAt < CLOSED_KEEP_MS,
    );
    if (kept) {
      const sessions = kept.sessions.filter((s) => {
        const at = createdMsOf(s);
        return at >= startMs && at <= closedTo;
      });
      return { sessions: sessions.slice(0, max), truncated: sessions.length >= max };
    }
    const read = await fetchSessionsInRange({ studioId, startMs, endMs: closedTo, max });
    // A stretch the cap cut is not kept: a narrower ask could not tell what it is missing.
    if (!read.truncated) {
      const fresh = (closedKeep.get(studioId) ?? []).filter((c) => now.getTime() - c.readAt < CLOSED_KEEP_MS);
      closedKeep.set(studioId, [...fresh.slice(-3), { fromMs: startMs, toMs: closedTo, sessions: read.sessions, readAt: now.getTime() }]);
    }
    return read;
  })();
  const live = wantsToday
    ? fetchSessionsInRange({ studioId, startMs: todayStart, endMs, max })
    : Promise.resolve<SessionsRangeResult>({ sessions: [], truncated: false });

  const [past, today] = await Promise.all([closed, live]);
  const sessions = [...today.sessions, ...past.sessions];
  return {
    sessions: sessions.slice(0, max),
    truncated: past.truncated || today.truncated || sessions.length >= max,
  };
}

export interface SessionsRangeState extends SessionsRangeResult {
  loading: boolean;
  /** True when the read failed — unknown, never "no sessions". */
  failed: boolean;
}

/** The same read as a hook. A null studio reads nothing. */
export function useSessionsInRange(range: Omit<SessionsRange, "studioId"> & { studioId: string | null }): SessionsRangeState {
  const { studioId, startMs, endMs, max } = range;
  const [state, setState] = useState<SessionsRangeState>({ sessions: [], truncated: false, loading: Boolean(studioId), failed: false });

  useEffect(() => {
    if (!studioId) {
      setState({ sessions: [], truncated: false, loading: false, failed: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, failed: false }));
    void (async () => {
      try {
        const result = await readSessionsInRange({ studioId, startMs, endMs, max });
        if (!cancelled) setState({ ...result, loading: false, failed: false });
      } catch (err) {
        if (!cancelled) {
          handleFirestoreError(err, OperationType.GET, "sessions");
          setState({ sessions: [], truncated: false, loading: false, failed: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId, startMs, endMs, max]);

  return state;
}
