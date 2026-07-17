import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Machine } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

export function useMachines(isReady: boolean, defaultMachines: Machine[]) {
  const [machines, setMachines] = useState<Machine[]>(defaultMachines);

  useEffect(() => {
    if (!isReady) return;

    const unsubscribeMachines = onSnapshot(
      query(collection(db, "machines"), orderBy("order", "asc")),
      (snap) => {
        const machinesData = snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Machine,
        );
        const mergedMachines = defaultMachines.map((dm) => {
          const remote = machinesData.find((r) => r.id === dm.id);
          return remote ? { ...dm, ...remote } : dm;
        });
        const customMachines = machinesData.filter(
          (r) => !defaultMachines.find((dm) => dm.id === r.id),
        );
        setMachines(
          [...mergedMachines, ...customMachines].sort(
            (a, b) => (a.order || 0) - (b.order || 0),
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "machines");
      },
    );

    return () => unsubscribeMachines();
  }, [isReady, defaultMachines]);

  return { machines };
}
