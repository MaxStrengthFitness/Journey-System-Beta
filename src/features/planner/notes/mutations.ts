/**
 * PLANNER NOTES — every write, in one file.
 *
 * A save is ONE batch: the private note, plus whatever the shared copy needs
 * (written, rewritten or removed — sharePlan() in ./notes.ts decides). Either
 * both land or neither does, so a note can never say "shared" while the copy
 * is missing, or leave a copy on a record after it was made private.
 *
 * The author on a shared copy is the Firebase Auth uid, never the trainer
 * document's id: the rules pin authorId to request.auth.uid, and on older
 * accounts the two differ.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { cleanFolderName, draftFromNote, noteFields, sharePlan, sharedFields } from "./notes";
import type { NoteDraft, NoteFolder, TrainerNote } from "./types";

export function notesRef(uid: string) {
  return collection(db, "trainers", uid, "notes");
}

export function noteFoldersRef(uid: string) {
  return collection(db, "trainers", uid, "noteFolders");
}

export function sharedNotesRef(clientId: string) {
  return collection(db, "clients", clientId, "sharedNotes");
}

/**
 * An id for a note not saved yet. Reserved up front (no write) so the draft
 * keeps the same id from the first keystroke to the save — the list, the
 * draft stash and the editor all follow one note by it.
 */
export function newNoteId(uid: string): string {
  return doc(notesRef(uid)).id;
}

export interface SaveNoteArgs {
  uid: string;
  noteId: string;
  draft: NoteDraft;
  /** The note as saved before this edit; null for a new note. */
  before: TrainerNote | null;
  author: { id: string; name: string };
}

/**
 * Saves a note and brings its shared copy into line, in one batch.
 * Returns the note as it was written, as a draft, for the editor to adopt.
 */
export async function saveNote({ uid, noteId, draft, before, author }: SaveNoteArgs): Promise<NoteDraft> {
  const plan = sharePlan(before, draft);
  const fields = noteFields(draft, plan.write);
  const now = serverTimestamp();
  const batch = writeBatch(db);

  // set(), not update(): a note deleted on another device while this one was
  // open comes back rather than failing with nowhere for the text to go.
  batch.set(doc(notesRef(uid), noteId), {
    ...fields,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  });
  if (plan.write) {
    // A whole overwrite every time (see SharedNote in ./types.ts).
    batch.set(doc(sharedNotesRef(plan.write), noteId), {
      ...sharedFields(draft, plan.write, author),
      updatedAt: now,
    });
  }
  if (plan.remove) batch.delete(doc(sharedNotesRef(plan.remove), noteId));

  await batch.commit();
  return draftFromNote({ id: noteId, ...fields });
}

/** Deletes a note — and its copy on the client's record, if it was shared. */
export async function deleteNote(uid: string, note: Pick<TrainerNote, "id" | "sharedWith">): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(notesRef(uid), note.id));
  // The rules let the author delete a copy that is already gone (a leader may
  // have removed it), so this never blocks deleting the note itself.
  if (note.sharedWith) batch.delete(doc(sharedNotesRef(note.sharedWith), note.id));
  await batch.commit();
}

export async function createNoteFolder(uid: string, name: string): Promise<string> {
  const ref = doc(noteFoldersRef(uid));
  const now = serverTimestamp();
  await setDoc(ref, { name: cleanFolderName(name), createdAt: now, updatedAt: now });
  return ref.id;
}

export async function renameNoteFolder(uid: string, folderId: string, name: string): Promise<void> {
  await updateDoc(doc(noteFoldersRef(uid), folderId), {
    name: cleanFolderName(name),
    updatedAt: serverTimestamp(),
  });
}

/** Firestore takes 500 writes a batch; stay well under. */
const BATCH_LIMIT = 400;

/**
 * Deletes a folder. Its notes are kept: they move to Unfiled first, and the
 * folder goes in the last batch, so an interrupted delete leaves a folder
 * that is merely emptier — never notes pointing at a folder that is gone.
 *
 * The notes to move are read fresh from the database, not taken from the
 * screen (review fix): the screen's list is capped at the newest 500, and a
 * note deleted on another iPad would still be in it — and one update to a
 * note that is gone fails the whole batch.
 */
export async function deleteNoteFolder(uid: string, folder: Pick<NoteFolder, "id">): Promise<void> {
  const inFolder = await getDocs(query(notesRef(uid), where("folderId", "==", folder.id)));
  const moves = inFolder.docs.map((d) => d.ref);
  for (let i = 0; i < moves.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of moves.slice(i, i + BATCH_LIMIT)) batch.update(ref, { folderId: null });
    // The folder itself goes with the last group of moves.
    if (i + BATCH_LIMIT >= moves.length) batch.delete(doc(noteFoldersRef(uid), folder.id));
    await batch.commit();
  }
  if (moves.length === 0) {
    const batch = writeBatch(db);
    batch.delete(doc(noteFoldersRef(uid), folder.id));
    await batch.commit();
  }
}

/**
 * Takes a shared note off a client's record — a studio leader's or an
 * administrator's call, from the profile. The author's own note is theirs
 * and is not touched; their Planner notices the copy is gone the next time
 * they open it (useSharedCopy).
 */
export async function removeSharedNote(clientId: string, noteId: string): Promise<void> {
  await deleteDoc(doc(sharedNotesRef(clientId), noteId));
}
