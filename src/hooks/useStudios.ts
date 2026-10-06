import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Studio } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useStudios(isReady: boolean, setStudios: (studios: Studio[], meta?: { fromCache?: boolean }) => void) {
  useEffect(() => {
    if (!isReady) return;

    const unsubscribeStudios = onSnapshot(
      collection(db, "studios"),
      (snap) => {
        setStudios(
          snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Studio),
          // An empty answer from the cache alone is not "no studios"
          // (useAuthInitialization, the speed round, Oct 5 2026).
          { fromCache: snap.metadata.fromCache },
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "studios");
      },
    );

    return () => unsubscribeStudios();
  }, [isReady, setStudios]);
}
