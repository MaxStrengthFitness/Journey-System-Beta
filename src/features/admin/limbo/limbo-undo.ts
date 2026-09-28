/**
 * UNDO A DISMISSAL — put a Limbo event back where it was.
 *
 * Round: the Admins room (Sep 28 2026), the confirmation rules: a reversible
 * act is done at once and offers Undo, instead of asking first. Dismissing a
 * Limbo event (lib/mindbody-limbo.ts, dismissLimboEntry) stamps `resolvedAt`
 * and `dismissed: true` on the event's own document and deletes nothing, so
 * it can be put back exactly: `resolvedAt` back to null — the value the park
 * wrote, which is what "waiting" means to the queue's one read — and the
 * `dismissed` mark removed. No new field, no new value.
 *
 * A RELEASE has no Undo: it writes a booking onto a studio's schedule (and
 * may create the client's record), which is not a stamp to take back.
 */
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { LIMBO_QUEUE } from "../../../lib/mindbody-limbo";

export async function reopenLimboEntry(entryId: string): Promise<void> {
  await updateDoc(doc(db, LIMBO_QUEUE, entryId), { resolvedAt: null, dismissed: deleteField() });
}
