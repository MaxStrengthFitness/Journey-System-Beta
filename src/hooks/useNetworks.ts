import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { FranchiseNetwork } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useNetworks(isReady: boolean, setNetworks: (networks: FranchiseNetwork[]) => void) {
  useEffect(() => {
    if (!isReady) return;

    const unsubscribeNetworks = onSnapshot(
      collection(db, "networks"),
      (snap) => {
        setNetworks(
          snap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as FranchiseNetwork,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "networks");
      },
    );

    return () => unsubscribeNetworks();
  }, [isReady, setNetworks]);
}
