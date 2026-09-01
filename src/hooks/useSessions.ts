import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, Timestamp, QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { WorkoutSession } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useSessions(activeStudioId: string | null, isReady: boolean) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    if (!isReady) return;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sessionConstraints: QueryConstraint[] = [
      where("createdAt", ">=", Timestamp.fromDate(twentyFourHoursAgo)),
      orderBy("createdAt", "desc"),
    ];
    if (activeStudioId) {
      sessionConstraints.push(where("hostedAtStudioId", "==", activeStudioId));
    }

    const unsubscribeSessions = onSnapshot(
      query(collection(db, "sessions"), ...sessionConstraints),
      (snap) => {
        setSessions(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as WorkoutSession,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "sessions");
      },
    );

    return () => unsubscribeSessions();
  }, [activeStudioId, isReady]);

  return { sessions };
}
