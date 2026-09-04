/**
 * CATALOG — every write this feature makes, in one file.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * There is one write here today, and it exists because the old one was wrong in
 * two different ways at once. `MachineAnatomyCatalogView.handleSaveTip` did:
 *
 *     updateDoc(doc(db, "machines", selectedMachineId), { trainerTips })
 *
 * `machines/{machineId}` is the GLOBAL catalog document — the library every
 * studio in every franchise reads. There was no studioId in the write at all,
 * so a note typed at Solon was written onto the document Beachwood renders.
 * And firestore.rules allows update there only for isSuperAdmin(), so for an
 * ordinary trainer the write ALSO just failed — under a button that said
 * "Stored Successfully" either way.
 *
 * WHY NOT studios/{id}/roster/{machineId}.studioNotes
 * ---------------------------------------------------
 * That is where types/machines.ts said these notes belong, and it is the right
 * home for a MANAGER-authored note. But the roster is manager-write only:
 *
 *     allow create, update, delete:
 *       if isSuperAdmin() || isStudioOwnerOrHeadTrainer(studioId);
 *
 * and deliberately so — a roster entry carries `overrides`, which can rewrite
 * clinicalWarnings, contraindicatedFor and settingFields. Widening that rule so
 * a floor trainer can jot "the left thigh pad sticks" would also hand them edit
 * rights over safety content. The authority levels are genuinely different, so
 * the documents are too.
 *
 * Machine notes therefore live in their own sibling collection, carrying no
 * safety content and no override power, writable by any trainer:
 *
 *     studios/{studioId}/machineNotes/{machineId}
 *
 * Tenancy is enforced by the path, exactly as the roster does it, so no get()
 * is spent on a rule check.
 */

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";

export interface NotesAuthor {
  id: string;
  name: string;
}

export interface StudioMachineNote {
  studioId: string;
  machineId: string;
  notes: string;
  updatedAt?: unknown;
  updatedBy?: NotesAuthor | null;
}

/** Firestore location of one studio's notes for one machine. */
export function machineNotesRef(studioId: string, machineId: string) {
  return doc(db, "studios", studioId, "machineNotes", machineId);
}

/**
 * Save this studio's notes for one machine.
 *
 * Throws on failure — deliberately. The old call swallowed the error into a
 * console.error while the button reported success; callers here are expected to
 * surface a real failure state to the trainer.
 */
export async function saveStudioMachineNotes(params: {
  studioId: string;
  machineId: string;
  notes: string;
  author?: NotesAuthor | null;
}): Promise<void> {
  const { studioId, machineId, notes, author } = params;

  if (!studioId) {
    throw new Error("No active studio selected — cannot save studio notes.");
  }
  if (!machineId) {
    throw new Error("No machine selected — cannot save studio notes.");
  }

  // merge:true so the document is created on first write, and so fields added
  // later (the upkeep round) are never clobbered by a notes edit.
  await setDoc(
    machineNotesRef(studioId, machineId),
    {
      studioId,
      machineId,
      notes,
      updatedAt: serverTimestamp(),
      updatedBy: author ?? null,
    },
    { merge: true },
  );
}
