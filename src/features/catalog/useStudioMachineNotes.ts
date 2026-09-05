import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import type { StudioMachineNote } from "./mutations";

/**
 * Live studio-scoped machine notes, keyed by machineId.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * Deliberately does NOT go through useStudioMachines / ResolvedMachine. That
 * hook resolves catalog + roster, and the roster backfill has not run — it
 * returns nothing today. Notes are the one thing on this screen a trainer can
 * actually change, so they cannot wait on a backfill. This reads
 * studios/{studioId}/machineNotes directly and works before, during and after
 * that migration.
 *
 * One listener for the whole studio rather than one per selected machine: the
 * roster is ~22 documents, and re-subscribing on every machine tap would put a
 * fresh read on the wire for each swipe.
 */
export function useStudioMachineNotes(studioId: string | null | undefined) {
  const [notesByMachineId, setNotesByMachineId] = useState<
    Record<string, StudioMachineNote>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studioId) {
      setNotesByMachineId({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "studios", studioId, "machineNotes"),
      (snap) => {
        const map: Record<string, StudioMachineNote> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Omit<StudioMachineNote, "machineId">;
          map[d.id] = { ...data, machineId: d.id };
        });
        setNotesByMachineId(map);
        setLoading(false);
      },
      (err) => {
        // A read failure is not fatal: the box renders empty and the trainer can
        // still type. The WRITE is what must report honestly.
        console.error("Error loading studio machine notes:", err);
        setNotesByMachineId({});
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [studioId]);

  return { notesByMachineId, loading };
}
