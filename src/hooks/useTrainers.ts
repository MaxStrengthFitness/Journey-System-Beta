import { useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Trainer } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useTrainers(isReady: boolean, setTrainers: (trainers: Trainer[]) => void) {
  useEffect(() => {
    if (!isReady) return;

    const unsubscribeTrainers = onSnapshot(
      query(collection(db, "trainers"), orderBy("order", "asc")),
      (snap) => {
        setTrainers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trainer),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "trainers");
      },
    );

    return () => unsubscribeTrainers();
  }, [isReady, setTrainers]);
}
