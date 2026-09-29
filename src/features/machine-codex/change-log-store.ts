/**
 * THE CHANGE LOG'S ONE WRITER AND ITS READ (change-log.ts says what an entry
 * is). Catalog wave 3, Sep 29 2026.
 *
 *   void recordMachineChange("m-leg-press", "edited", Object.keys(changes));
 *
 * Called by the catalog editor's save AFTER the machine's own write has
 * landed. It signs the entry with the Auth uid and the person's name
 * (who.ts) and the server's time, and it NEVER throws: the correction an
 * administrator made is what matters, and a record that couldn't be written
 * must not undo it or block the screen. Offline, Firestore queues the entry
 * with the change. It resolves true when written, false when not, and says
 * why in the console. Administrators only: the rules refuse anyone else.
 *
 * The read is one `getDocs` of the subcollection, with no `orderBy` and no
 * `where` — nothing that needs an index (the database builds none by itself)
 * — sorted on the iPad, which is cheap because a machine's log is short. It
 * is read when a machine's page opens, not listened to: a change to the
 * standard is rare, and the page is reopened far more often than the
 * standard is edited.
 */
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { changeDocument, changesOf, type ChangesRead, type MachineChangeKind } from "./change-log";
import { signedInPerson } from "./who";

export function changesCollection(machineId: string) {
  return collection(db, "machines", machineId, "changes");
}

export async function recordMachineChange(
  machineId: string,
  kind: MachineChangeKind,
  fields: Iterable<string>,
): Promise<boolean> {
  try {
    const by = await signedInPerson();
    if (!by) {
      console.warn("The machine's change log wasn't written: nobody is signed in.");
      return false;
    }
    const body = changeDocument(kind, [...fields], by);
    if (!body) return false;
    await addDoc(changesCollection(machineId), { ...body, at: serverTimestamp() });
    return true;
  } catch (err) {
    console.warn("Couldn't write to the machine's change log", err);
    return false;
  }
}

/** The log, once. A refused or failed read is "unreadable", never an empty log. */
export async function fetchMachineChanges(machineId: string): Promise<ChangesRead> {
  try {
    const snap = await getDocs(changesCollection(machineId));
    return { state: "ready", changes: changesOf(snap.docs.map((d) => ({ id: d.id, data: d.data() }))) };
  } catch (err) {
    console.warn("[catalog] a machine's change log couldn't be read:", err);
    return { state: "unreadable" };
  }
}

/** The same, as a hook: read once per machine id while `enabled`. */
export function useMachineChanges(machineId: string | null, enabled = true): ChangesRead {
  const [read, setRead] = useState<ChangesRead>({ state: "loading" });
  useEffect(() => {
    if (!machineId || !enabled) return;
    let live = true;
    setRead({ state: "loading" });
    fetchMachineChanges(machineId).then((r) => {
      if (live) setRead(r);
    });
    return () => {
      live = false;
    };
  }, [machineId, enabled]);
  return read;
}
