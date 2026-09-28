/**
 * MARKS ON A TIME, WRITTEN (Openings round, Sep 27 2026, phase 6;
 * docs/rounds/2026-09-27-openings.md, "Marks: how a person disagrees" and the
 * data, part 3). What a mark is, what it changes and when it comes up for
 * review is the pure core's (`../marks.ts`); this is the write, and the only
 * place a mark is written from.
 *
 *   studios/{studioId}/openingsMarks/{weekday-HHMM}        e.g. "1-0800"
 *
 * Three writes, each one small document and no read first:
 *
 *   saveMark    sets or changes the mark on a time: the word, the note (left
 *               out when empty), who, and the server's time. The WHOLE mark
 *               is written (no merge), so a note taken out is gone, and a
 *               colleague's mark changed is signed by the person changing it.
 *   keepMark    the review's Keep: the same word and note, signed again by
 *               the person keeping it, today.
 *   removeMark  deletes it. Anyone who works at the studio may, as the notes
 *               rule has it (any trainer may close a thread).
 *
 * Always AS THE PERSON SIGNED IN: `by.id` is the Auth uid, never the
 * trainers/{id} (CLAUDE.md: the two differ on older accounts), and `at` is the
 * server's time. firestore.rules (`match /openingsMarks/{markKey}`) refuses a
 * mark under someone else's uid, a backdated one, and an id that names another
 * time than the fields. `by.name` is this app's copy of the signer's name: the
 * rule checks only its length, as it does for the standing week's stamps.
 *
 * Nothing here books, holds or asks Mindbody anything, and nobody is pinged:
 * the mark shows on Openings, to whoever opens it.
 */
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { withoutUndefined } from "../../studio-tasks/task-wizard";
import { MARKS_COLLECTION, markForWrite, type MarkWord, type OpeningsMark } from "../marks";
import type { TimeKey } from "../rows";

/** The longest name a mark carries: the rules' limit, as the standing week's stamps. */
export const MARK_NAME_MAX = 120;

/** Who is marking: the signed-in person's Auth uid and name. */
export interface MarkSigner {
  uid: string;
  name: string;
}

export const markRef = (studioId: string, key: TimeKey) => doc(db, "studios", studioId, MARKS_COLLECTION, key);

/**
 * The document a mark is written as: `markForWrite`'s fields (the note
 * trimmed and left out when empty) and the server's time. Null for anything
 * the rules would refuse before it is sent: a key that isn't a time, or no
 * one signed in.
 */
export function markDocument(key: TimeKey, mark: MarkWord, note: string | undefined, by: MarkSigner) {
  const fields = markForWrite({ key, mark, note, by: { id: by.uid, name: (by.name || "").trim().slice(0, MARK_NAME_MAX) } });
  if (!fields) return null;
  return withoutUndefined({ ...fields, at: serverTimestamp() });
}

/** Sets or changes the mark on a time, signed by the person saving it. */
export async function saveMark(studioId: string, key: TimeKey, mark: MarkWord, note: string | undefined, by: MarkSigner): Promise<void> {
  const data = markDocument(key, mark, note, by);
  if (!studioId || !data) throw new Error("A mark needs a studio, a time and someone signed in.");
  await setDoc(markRef(studioId, key), data);
}

/** The review's Keep: the same word and note, signed again as the person keeping it, today. */
export async function keepMark(studioId: string, mark: Pick<OpeningsMark, "id" | "mark" | "note">, by: MarkSigner): Promise<void> {
  await saveMark(studioId, mark.id, mark.mark, mark.note, by);
}

/** Takes the mark off a time, for everyone at the studio. */
export async function removeMark(studioId: string, key: TimeKey): Promise<void> {
  if (!studioId) throw new Error("A mark needs a studio.");
  await deleteDoc(markRef(studioId, key));
}
