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
 */
import { useEffect, useState } from "react";
import { Timestamp, collection, getDocs, limit as fsLimit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { WorkoutSession } from "../../types";

/** A busy studio does forty sessions a day; a month is well under this. */
export const MAX_SESSIONS_IN_RANGE = 1500;

export interface SessionsRange {
  studioId: string;
  startMs: number;
  /** Omit for "since startMs". */
  endMs?: number;
  max?: number;
}

export interface SessionsRangeResult {
  sessions: WorkoutSession[];
  truncated: boolean;
}

export async function fetchSessionsInRange({ studioId, startMs, endMs, max = MAX_SESSIONS_IN_RANGE }: SessionsRange): Promise<SessionsRangeResult> {
  const clauses = [
    where("hostedAtStudioId", "==", studioId),
    where("createdAt", ">=", Timestamp.fromMillis(startMs)),
    ...(endMs !== undefined ? [where("createdAt", "<=", Timestamp.fromMillis(endMs))] : []),
    orderBy("createdAt", "desc"),
    fsLimit(max),
  ];
  const snap = await getDocs(query(collection(db, "sessions"), ...clauses));
  return {
    sessions: snap.docs.map((d) => ({ ...(d.data() as WorkoutSession), id: d.id })),
    truncated: snap.size >= max,
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
        const result = await fetchSessionsInRange({ studioId, startMs, endMs, max });
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
