import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { floorNoteFromDoc, type FloorNote } from "./floor-notes";
import { floorNotesCol } from "./store";

export type FloorNotesRead =
  | { state: "loading"; notes: FloorNote[] }
  | { state: "ready"; notes: FloorNote[] }
  /** A failed read is "unknown", never "no notes" (the app's rule). */
  | { state: "failed"; notes: FloorNote[] };

/**
 * Every note this studio has written on its machines, live. ONE listener for
 * the studio, mounted by the screen rather than by each machine's page, so a
 * leader tapping through the floor never re-reads it (the Studio notes box's
 * reasoning, catalog/useStudioMachineNotes.ts). A studio's notes on its
 * twenty-odd machines stay small; the read takes them all.
 */
export function useFloorNotes(studioId: string | null | undefined): FloorNotesRead {
  const [read, setRead] = useState<FloorNotesRead>({ state: studioId ? "loading" : "ready", notes: [] });
  useEffect(() => {
    if (!studioId) {
      setRead({ state: "ready", notes: [] });
      return;
    }
    setRead({ state: "loading", notes: [] });
    return onSnapshot(
      floorNotesCol(studioId),
      (snap) =>
        setRead({
          state: "ready",
          notes: snap.docs
            // A note just written has no server time yet: estimate it, so it
            // sorts as new rather than as undated.
            .map((d) => floorNoteFromDoc(d.id, d.data({ serverTimestamps: "estimate" }) as Record<string, unknown>))
            .filter((n): n is FloorNote => n !== null),
        }),
      (err) => {
        console.warn("[floor-notes] read failed:", err);
        setRead({ state: "failed", notes: [] });
      },
    );
  }, [studioId]);
  return read;
}
