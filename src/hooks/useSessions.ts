import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp, QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { WorkoutSession } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useSessions(activeStudioId: string | null, isReady: boolean) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  /*
   * Has the stream answered for this studio? `sessions` is [] while loading,
   * after a failure and when nothing was logged, and only the last is
   * "nothing logged" — a failed read means unknown, never empty. The Hub's
   * "Not logged" (lib/hub-card-state) waits for this.
   */
  const [sessionsKnown, setSessionsKnown] = useState(false);

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

    const unsubscribeSessions = onSnapshot(
      query(collection(db, "sessions"), ...sessionConstraints),
      (snap) => {
        setSessions(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
          ),
        );
        setSessionsKnown(true);
      },
      (error) => {
        setSessionsKnown(false);
        handleFirestoreError(error, OperationType.GET, "sessions");
      },
    );

    return () => unsubscribeSessions();
  }, [activeStudioId, isReady]);

  return { sessions, sessionsKnown };
}
