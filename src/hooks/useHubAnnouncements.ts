import { useState, useEffect } from "react";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { HubAnnouncement, Trainer } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useHubAnnouncements(authTrainer: Trainer | null, activeStudioId: string | null) {
  const [announcements, setAnnouncements] = useState<HubAnnouncement[]>([]);

  useEffect(() => {
    if (!authTrainer) return;
    const q = query(collection(db, "hub_announcements"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as HubAnnouncement,
        );
        const filtered = data
          .filter((a) => a.isActive !== false)
          .filter((a) => a.studioId === "all" || a.studioId === activeStudioId)
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) -
              (a.createdAt?.toMillis?.() || 0),
          );
        setAnnouncements(filtered);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "hub_announcements");
      },
    );
    return () => unsubscribe();
  }, [authTrainer, activeStudioId]);

  return { announcements };
}
