/**
 * CATALOG — the Studio notes store, and why it was where it was.
 *
 * Round: Catalog Redesign, Sep 2026. Since the notes round (Oct 3 2026) the
 * floor writes its notes on a machine to one dated list per machine
 * (features/floor-notes), and nothing writes here any more: what this store
 * holds is read as an earlier note under that list. The reasoning below is
 * why that list, too, is its own collection rather than the roster.
 *
 * The write that was here existed because the one before it was wrong in
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

import { doc } from "firebase/firestore";
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
