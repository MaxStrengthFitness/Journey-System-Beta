import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Studio } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { listDeliveryGate } from "../features/front-door/boot-lookup";

export function useStudios(isReady: boolean, setStudios: (studios: Studio[], meta?: { fromCache?: boolean }) => void) {
  useEffect(() => {
    if (!isReady) return;

    const deliver = listDeliveryGate();
    const unsubscribeStudios = onSnapshot(
      collection(db, "studios"),
      // Metadata changes too: the server confirming the iPad's copy raises no
      // event otherwise (front-door/boot-lookup.ts, listDeliveryGate).
      { includeMetadataChanges: true },
      (snap) => {
        if (!deliver(snap.docChanges().length, snap.metadata.fromCache)) return;
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
