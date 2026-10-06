import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { FranchiseNetwork } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { listDeliveryGate } from "../features/front-door/boot-lookup";

export function useNetworks(isReady: boolean, setNetworks: (networks: FranchiseNetwork[], meta?: { fromCache?: boolean }) => void) {
  useEffect(() => {
    if (!isReady) return;

    const deliver = listDeliveryGate();
    const unsubscribeNetworks = onSnapshot(
      collection(db, "networks"),
      // Metadata changes too: the server confirming the iPad's copy raises no
      // event otherwise (front-door/boot-lookup.ts, listDeliveryGate).
      { includeMetadataChanges: true },
      (snap) => {
        if (!deliver(snap.docChanges().length, snap.metadata.fromCache)) return;
        setNetworks(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FranchiseNetwork,
          ),
          { fromCache: snap.metadata.fromCache },
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "networks");
      },
    );

    return () => unsubscribeNetworks();
  }, [isReady, setNetworks]);
}
