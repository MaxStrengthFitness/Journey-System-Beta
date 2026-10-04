/**
 * THE FLOOR'S NOTES — every write, in one file (notes round, Oct 3 2026).
 *
 * studios/{s}/floorNotes/{noteId}. firestore.rules is the other half: a note
 * is signed by the Auth uid that writes it (never `authTrainer.id`, which
 * differs on older accounts), its machine and author never change, the words
 * change only for their author or a leader, anyone at the studio closes or
 * reopens one, and nothing is deleted — a note that should never have been
 * written is archived.
 *
 * Every write throws on failure. The screens say so; none claims a save that
 * did not happen (the old Studio notes box's lesson, catalog/mutations.ts).
 */
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { FLOOR_NOTE_MAX, type EarlierKey, type FloorNote } from "./floor-notes";

export interface FloorWriter {
  /** The person's name as the floor knows it. */
  name: string;
}

export const floorNotesCol = (studioId: string) => collection(db, "studios", studioId, "floorNotes");
const noteRef = (studioId: string, id: string) => doc(db, "studios", studioId, "floorNotes", id);

function signer(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again: the app can't tell who is writing.");
  return uid;
}

function words(body: string): string {
  const text = body.trim().slice(0, FLOOR_NOTE_MAX);
  if (!text) throw new Error("A note needs some words.");
  return text;
}

/** A new note on a machine. Returns its id. */
export async function addFloorNote(input: {
  studioId: string;
  machineId: string;
  machineName?: string;
  body: string;
  writer: FloorWriter;
  /** Copying one of the earlier notes into the list: which one. */
  copiedFrom?: EarlierKey;
}): Promise<string> {
  const uid = signer();
  const ref = await addDoc(floorNotesCol(input.studioId), {
    machineId: input.machineId,
    ...(input.machineName?.trim() ? { machineName: input.machineName.trim().slice(0, 120) } : {}),
    ...(input.copiedFrom ? { copiedFrom: input.copiedFrom } : {}),
    body: words(input.body),
    threadId: null,
    authorId: uid,
    authorName: (input.writer.name || "A trainer").slice(0, 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
    isArchived: false,
  });
  return ref.id;
}

/** An update on a note: it hangs off the note, never replaces it. */
export async function addFloorUpdate(input: {
  studioId: string;
  root: Pick<FloorNote, "id" | "machineId" | "machineName">;
  body: string;
  writer: FloorWriter;
}): Promise<string> {
  const uid = signer();
  const ref = await addDoc(floorNotesCol(input.studioId), {
    machineId: input.root.machineId,
    ...(input.root.machineName ? { machineName: input.root.machineName } : {}),
    body: words(input.body),
    threadId: input.root.id,
    authorId: uid,
    authorName: (input.writer.name || "A trainer").slice(0, 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
    isArchived: false,
  });
  return ref.id;
}

/**
 * Close a note: it moves to the history, never away. With words, they are
 * said on it first ("Maintenance replaced the pin"), the way a client note
 * closes with what happened.
 */
export async function closeFloorNote(input: {
  studioId: string;
  root: Pick<FloorNote, "id" | "machineId" | "machineName">;
  writer: FloorWriter;
  why?: string;
}): Promise<void> {
  const uid = signer();
  if (input.why?.trim()) await addFloorUpdate({ studioId: input.studioId, root: input.root, body: input.why, writer: input.writer });
  await updateDoc(noteRef(input.studioId, input.root.id), {
    resolvedAt: serverTimestamp(),
    resolvedBy: { id: uid, name: (input.writer.name || "A trainer").slice(0, 120) },
    updatedAt: serverTimestamp(),
  });
}

/** Open a closed note again: anyone at the studio may. */
export async function reopenFloorNote(studioId: string, rootId: string): Promise<void> {
  signer();
  await updateDoc(noteRef(studioId, rootId), { resolvedAt: null, resolvedBy: null, updatedAt: serverTimestamp() });
}

/** Change a note's words: its author, or a leader (the rules hold it). */
export async function editFloorNote(studioId: string, id: string, body: string): Promise<void> {
  signer();
  await updateDoc(noteRef(studioId, id), { body: words(body), updatedAt: serverTimestamp() });
}

/** Take a note off the list for good, without deleting it. */
export async function archiveFloorNote(studioId: string, id: string): Promise<void> {
  signer();
  await updateDoc(noteRef(studioId, id), { isArchived: true, updatedAt: serverTimestamp() });
}
