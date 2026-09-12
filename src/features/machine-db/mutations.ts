/**
 * THE MSF MACHINE DATABASE — the writes.
 *
 * Every one of them lands on a document the studio already owns, under the
 * rule that already governs it:
 *
 *   adopting a machine      studios/{s}/roster       leaders (as before)
 *   sharing a machine       studios/{s}/roster       leaders; custom only
 *   sharing a note          studios/{s}/wiki         anyone at the studio
 *   sharing a tip           studios/{s}/playbook     its author, or a leader
 *
 * Sharing never copies anything anywhere: it sets `shared` on the studio's
 * own document, plus what other studios need to find it (`sharedKeys`, the
 * machine lineages it is about) and to credit it (the studio's name).
 * Switching it off takes it out of every other studio's view at once.
 */

import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { AdoptionPlan } from "./database";

const uid = () => auth.currentUser?.uid ?? null;

/** Puts a machine from the database on this studio's floor. See planAdoption. */
export async function adoptMachine(studioId: string, plan: Extract<AdoptionPlan, { ok: true }>): Promise<void> {
  // merge: an MSF machine the studio once switched off ("We don't have this")
  // comes back with the local setup it had.
  await setDoc(
    doc(db, "studios", studioId, "roster", plan.machineId),
    { ...plan.entry, updatedAt: serverTimestamp(), updatedBy: uid() },
    { merge: true },
  );
}

/** Lists (or unlists) one of this studio's own machines in the database. */
export async function setMachineShared(
  studioId: string,
  machineId: string,
  shared: boolean,
  studioName: string,
): Promise<void> {
  const by = uid();
  await updateDoc(
    doc(db, "studios", studioId, "roster", machineId),
    shared
      ? {
          shared: true,
          sharedStudioName: studioName.slice(0, 80),
          sharedAt: serverTimestamp(),
          sharedBy: by,
          updatedAt: serverTimestamp(),
          updatedBy: by,
        }
      : { shared: false, updatedAt: serverTimestamp(), updatedBy: by },
  );
}

export interface ShareWhere {
  /** The machine lineages it is about — sharedKeysFor(). */
  keys: string[];
  studioName: string;
}

/** Shares (or stops sharing) this studio's note on a machine. */
export async function setNoteShared(studioId: string, docId: string, shared: boolean, where: ShareWhere): Promise<void> {
  await updateDoc(
    doc(db, "studios", studioId, "wiki", docId),
    shared
      ? { shared: true, sharedKeys: where.keys, studioName: where.studioName.slice(0, 80) }
      : { shared: false, sharedKeys: [] },
  );
}

/** Shares (or stops sharing) a playbook tip. */
export async function setTipShared(studioId: string, entryId: string, shared: boolean, where: ShareWhere): Promise<void> {
  await updateDoc(
    doc(db, "studios", studioId, "playbook", entryId),
    shared
      ? { shared: true, sharedKeys: where.keys, studioName: where.studioName.slice(0, 80) }
      : { shared: false, sharedKeys: [] },
  );
}
