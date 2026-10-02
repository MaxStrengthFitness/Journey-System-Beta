/**
 * Her journal's notes that name a machine, for a screen that does not hold
 * her journal already (machine-notes.ts). The SAME query `useClientJournal`
 * streams (clientId, newest first, 300), on the existing
 * `journalEntries(clientId, occurredAt desc)` index, so the Firestore client
 * shares one listener between them while both are mounted, and no new index
 * is needed. A screen that already holds the journal passes its entries in
 * and this reads nothing.
 *
 * `null` while unread or after a failed read: the readers then fall back to
 * the legacy list alone, never "no notes".
 */
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { JournalEntry } from "../../types/journal";

const STREAM_LIMIT = 300;

export function useMachineJournal(clientId: string | null | undefined, given?: readonly JournalEntry[] | null): JournalEntry[] | null {
  const skip = given !== undefined || !clientId;
  const [held, setHeld] = useState<{ clientId: string; entries: JournalEntry[] } | null>(null);
  useEffect(() => {
    if (skip || !clientId) return;
    return onSnapshot(
      query(collection(db, "journalEntries"), where("clientId", "==", clientId), orderBy("occurredAt", "desc"), limit(STREAM_LIMIT)),
      (snap) => {
        setHeld({
          clientId,
          entries: snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as JournalEntry)
            .filter((e) => typeof e.machineId === "string" && e.machineId !== ""),
        });
      },
      (err) => {
        console.warn("[machine notes] her journal couldn't be read", err);
        setHeld(null);
      },
    );
  }, [skip, clientId]);
  if (given !== undefined) return given ? [...given] : null;
  return held && held.clientId === clientId ? held.entries : null;
}
