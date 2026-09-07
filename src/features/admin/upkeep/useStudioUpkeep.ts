import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { instancesRef } from "../../studio-tasks/mutations";
import { useStudioTaskCategories } from "../../studio-tasks/useStudioTaskCategories";
import type { TaskInstance } from "../../studio-tasks/types";
import { mergeUpkeepHistory, type UpkeepEvent, type UpkeepLogEntry } from "./upkeepLog";

/**
 * One studio's upkeep timeline, from both sources.
 *
 * Two listeners, read whole rather than per machine: one subscription for a
 * studio beats twenty-two that re-subscribe every time someone taps a row,
 * which is the same call useMachineUpkeep already made and for the same
 * reason.
 */
export function useStudioUpkeep(studioId: string | null): {
  events: UpkeepEvent[];
  loading: boolean;
} {
  const [instances, setInstances] = useState<TaskInstance[]>([]);
  const [logged, setLogged] = useState<UpkeepLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { categories } = useStudioTaskCategories(studioId);

  useEffect(() => {
    if (!studioId) {
      setInstances([]);
      setLogged([]);
      return;
    }
    setLoading(true);
    let done = 0;
    const settle = () => {
      done += 1;
      if (done >= 2) setLoading(false);
    };

    const unsubTasks = onSnapshot(
      query(instancesRef(studioId), where("kind", "==", "machine")),
      (snap) => {
        setInstances(
          snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
        );
        settle();
      },
      () => {
        setInstances([]);
        settle();
      },
    );

    const unsubLog = onSnapshot(
      collection(db, "studios", studioId, "upkeepLog"),
      (snap) => {
        setLogged(snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })));
        settle();
      },
      () => {
        setLogged([]);
        settle();
      },
    );

    return () => {
      unsubTasks();
      unsubLog();
    };
  }, [studioId]);

  const events = useMemo(
    () => mergeUpkeepHistory(instances, logged, categories),
    [instances, logged, categories],
  );

  return { events, loading };
}
