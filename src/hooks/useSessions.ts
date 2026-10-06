import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp, QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { WorkoutSession } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { msUntilNextStudioDay } from "../lib/schedule-window";

/**
 * The studio's sessions of the last 24 hours, live.
 *
 * Speed round (Oct 5 2026, R16), three changes and nothing else:
 *
 *   - The window moves at the studio's midnight, as the live schedule's
 *     does (useLiveSchedule, `msUntilNextStudioDay`). It used to be anchored
 *     at mount and never move, so an iPad left open for days kept every
 *     session since then.
 *   - `sessionsKnown` waits for an answer from the server. The first answer
 *     can come from this iPad's own cache (the persistent cache,
 *     src/firebase.ts), which only says what this iPad last saw; a session
 *     finished on another iPad since may be missing from it, and the Hub
 *     would say "Not logged" about it. Once the server has answered for this
 *     listener it stays known (a passing Wi-Fi drop doesn't take the labels
 *     away). It is for labels only: no Start, Finish or session path reads it.
 *   - A session whose document did not change keeps its object. Each
 *     heartbeat of a running session (WorkoutTrackerView, at most every 30 s)
 *     used to hand every reader a new object for EVERY session of the day,
 *     so a Hub card for a session finished hours ago drew again; now only
 *     the session that changed is new, and an answer that changed nothing
 *     (a cache-to-server hand-over) keeps the same list.
 */
export function useSessions(activeStudioId: string | null, isReady: boolean) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  /*
   * Has the stream answered for this studio, from the server? `sessions` is
   * [] while loading, after a failure and when nothing was logged, and only
   * the last is "nothing logged" — a failed read means unknown, never empty.
   * The Hub's "Not logged" (lib/hub-card-state) waits for this.
   */
  const [sessionsKnown, setSessionsKnown] = useState(false);
  /** Bumped just after the studio's midnight, so the window moves with the day. */
  const [dayTick, setDayTick] = useState(0);

  useEffect(() => {
    if (!isReady) return;
    setSessionsKnown(false);

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    /*
     * The studio constraint is NOT optional (tenancy pass, Sep 2026).
     *
     * It used to be added only `if (activeStudioId)`, so with no active studio
     * this streamed every session created anywhere in the platform in the last
     * 24 hours. Now that `sessions` is scoped by rule, that query would be
     * rejected outright rather than merely over-fetching — and the honest
     * behaviour either way is to ask for nothing until we know where we are.
     */
    if (!activeStudioId) {
      setSessions([]);
      return;
    }

    const sessionConstraints: QueryConstraint[] = [
      where("hostedAtStudioId", "==", activeStudioId),
      where("createdAt", ">=", Timestamp.fromDate(twentyFourHoursAgo)),
      orderBy("createdAt", "desc"),
    ];

    let cancelled = false;
    const unsubscribeSessions = onSnapshot(
      query(collection(db, "sessions"), ...sessionConstraints),
      { includeMetadataChanges: true },
      (snap) => {
        if (cancelled) return;
        // Documents added, changed or removed since this listener's last answer.
        const changed = new Set(snap.docChanges().map((c) => c.doc.id));
        setSessions((prev) => sharedSessions(prev, snap.docs, changed));
        if (!snap.metadata.fromCache) setSessionsKnown(true);
      },
      (error) => {
        if (cancelled) return;
        setSessionsKnown(false);
        handleFirestoreError(error, OperationType.GET, "sessions");
      },
    );

    // Move the window when the studio's day rolls over.
    const dayTimer = setTimeout(() => {
      if (!cancelled) setDayTick((t) => t + 1);
    }, msUntilNextStudioDay(now));

    return () => {
      cancelled = true;
      clearTimeout(dayTimer);
      unsubscribeSessions();
    };
  }, [activeStudioId, isReady, dayTick]);

  return { sessions, sessionsKnown };
}

/**
 * The listener's documents as sessions, keeping the previous object for each
 * document that did not change, and the previous LIST when nothing did.
 * `changed` holds the ids `docChanges()` named for this answer. Pure, for
 * useSessions.test.ts.
 */
export function sharedSessions(
  prev: readonly WorkoutSession[],
  docs: ReadonlyArray<{ id: string; data: () => unknown }>,
  changed: ReadonlySet<string>,
): WorkoutSession[] {
  const prevById = new Map<string, WorkoutSession>();
  for (const s of prev) if (s?.id) prevById.set(s.id, s);
  let same = prev.length === docs.length;
  const next = docs.map((d, i) => {
    const old = changed.has(d.id) ? undefined : prevById.get(d.id);
    const session = old ?? ({ id: d.id, ...(d.data() as object) } as WorkoutSession);
    if (same && prev[i] !== session) same = false;
    return session;
  });
  return same ? (prev as WorkoutSession[]) : next;
}
