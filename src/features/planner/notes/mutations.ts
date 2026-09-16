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
  arrayRemove,
  arrayUnion,
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
import { notify } from "../../notifications";
import { cleanFolderName, draftFromNote, noteFields, sharePlan, sharedFields } from "./notes";
import { newlyNamed, noteShareFields, teamSharePlan, type NoteShare } from "./team-share";
import type { NoteDraft, NoteFolder, NoteLogEntry, TrainerNote } from "./types";

export function notesRef(uid: string) {
  return collection(db, "trainers", uid, "notes");
}

export function noteFoldersRef(uid: string) {
  return collection(db, "trainers", uid, "noteFolders");
}

export function sharedNotesRef(clientId: string) {
  return collection(db, "clients", clientId, "sharedNotes");
}

/** studios/{studioId}/noteShares — colleague copies (./team-share.ts). */
export function noteSharesRef(studioId: string) {
  return collection(db, "studios", studioId, "noteShares");
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
  //
  // mergeFields, not a plain set (Planner rework): the working log is written
  // on its own, a jot at a time, possibly from another iPad while this one
  // was open, so a save rewrites every field it owns — whole, maps included
  // — and leaves `log` exactly as the server has it.
  batch.set(
    doc(notesRef(uid), noteId),
    {
      ...fields,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    },
    { mergeFields: [...NOTE_OWN_FIELDS] },
  );
  if (plan.write) {
    // A whole overwrite every time (see SharedNote in ./types.ts).
    batch.set(doc(sharedNotesRef(plan.write), noteId), {
      ...sharedFields(draft, plan.write, author),
      updatedAt: now,
    });
  }
  if (plan.remove) batch.delete(doc(sharedNotesRef(plan.remove), noteId));

  // The colleague copy (Planner rework): rewritten whole with the note, or
  // taken down, in the same batch — so the marker and the copy agree.
  const team = teamSharePlan(before?.teamShare, fields.teamShare);
  if (team.write && fields.teamShare) {
    batch.set(doc(noteSharesRef(team.write), noteId), {
      ...noteShareFields({ noteId, ...fields }, fields.teamShare, author),
      updatedAt: now,
    });
  }
  if (team.remove) batch.delete(doc(noteSharesRef(team.remove), noteId));

  await batch.commit();

  // Tell the people newly named — after the write, and never failing it.
  if (fields.teamShare) {
    const until = fields.teamShare.expiresOn ? ` until ${fields.teamShare.expiresOn}` : "";
    await Promise.all(
      newlyNamed(before?.teamShare, fields.teamShare).map((p) =>
        notify({
          to: p.id,
          actor: author,
          kind: "note-shared",
          title: `${author.name || "A colleague"} shared “${fields.title}” with you${until}`.slice(0, 200),
          ...(fields.teamShare?.message ? { body: fields.teamShare.message } : {}),
          studioId: fields.teamShare!.studioId,
          link: { view: "studio-tasks", id: `share:${noteId}` },
        }),
      ),
    );
  }
  return draftFromNote({ id: noteId, ...fields, log: [] });
}

/**
 * Ends a colleague share without touching anything else in the note — the
 * Planner's sweep of shares past their date, and "Stop sharing" on a note
 * with no other changes.
 */
export async function endTeamShare(uid: string, note: Pick<TrainerNote, "id" | "teamShare">): Promise<void> {
  if (!note.teamShare) return;
  const batch = writeBatch(db);
  batch.update(doc(notesRef(uid), note.id), { teamShare: null, updatedAt: serverTimestamp() });
  batch.delete(doc(noteSharesRef(note.teamShare.studioId), note.id));
  await batch.commit();
}

/**
 * A colleague's shared note, kept as the reader's own private note — so a
 * trainer covering a client can keep working from it after the share ends.
 * Returns the new note's id.
 */
export async function copyShareToMyNotes(uid: string, share: NoteShare): Promise<string> {
  const ref = doc(notesRef(uid));
  const now = serverTimestamp();
  const intro = `From ${share.authorName}${share.message ? ` — “${share.message}”` : ""}`;
  await setDoc(ref, {
    title: share.title,
    body: `> ${intro}\n\n${share.body}`.slice(0, 10000),
    kind: share.kind,
    folderId: null,
    clientIds: share.clientIds,
    clientNames: share.clientNames,
    pinned: false,
    sharedWith: null,
    links: share.links,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/** Every field a save owns — all of a note but its working log. */
const NOTE_OWN_FIELDS = [
  "title",
  "body",
  "kind",
  "folderId",
  "clientIds",
  "clientNames",
  "pinned",
  "sharedWith",
  "links",
  "teamShare",
  "createdAt",
  "updatedAt",
] as const;

/**
 * Adds a jot to a saved note's working log. One array element, added with
 * arrayUnion, so a jot from another iPad a moment earlier is kept.
 * Never touches the body or a shared copy: the log is always private.
 */
export async function appendNoteLog(uid: string, noteId: string, entry: NoteLogEntry): Promise<void> {
  await updateDoc(doc(notesRef(uid), noteId), {
    log: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

/** Removes one jot. arrayRemove matches the whole entry as stored. */
export async function removeNoteLog(uid: string, noteId: string, entry: NoteLogEntry): Promise<void> {
  await updateDoc(doc(notesRef(uid), noteId), {
    log: arrayRemove(entry),
    updatedAt: serverTimestamp(),
  });
}

/** Deletes a note — and its copies on a client's record and with colleagues. */
export async function deleteNote(
  uid: string,
  note: Pick<TrainerNote, "id" | "sharedWith"> & { teamShare?: TrainerNote["teamShare"] },
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(notesRef(uid), note.id));
  // The rules let the author delete a copy that is already gone (a leader may
  // have removed it), so this never blocks deleting the note itself.
  if (note.sharedWith) batch.delete(doc(sharedNotesRef(note.sharedWith), note.id));
  if (note.teamShare) batch.delete(doc(noteSharesRef(note.teamShare.studioId), note.id));
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
