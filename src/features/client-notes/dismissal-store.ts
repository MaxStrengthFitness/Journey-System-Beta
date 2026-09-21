/**
 * WHERE A DISMISSAL LIVES — one document per trainer: `noteDismissals/{uid}`.
 *
 * Read `dismissals.ts` first for the model. Two decisions are in this file:
 *
 * ONE DOCUMENT, NOT A FLAG ON THE NOTE. A dismissal is private (AJ, Sep 20:
 * no trainer sees who dismissed what, and there is nothing to gain by
 * showing it). Firestore rules apply to whole documents, so the only way to
 * say "only this person may read this" is to give it a document of its own.
 * It is also one read for a whole briefing rather than one per note.
 *
 * KEYED BY THE AUTH UID, never `authTrainer.id` — the two differ on older
 * accounts, and the rule pins the document to `request.auth.uid`.
 */
import { useEffect, useState } from "react";
import { Timestamp, deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { toDate } from "../../types/journal";
import type { NoteDismissals } from "./dismissals";

export const DISMISSALS_COLLECTION = "noteDismissals";

const refFor = (uid: string) => doc(db, DISMISSALS_COLLECTION, uid);

function readDismissals(data: Record<string, unknown> | undefined): NoteDismissals {
  const raw = (data?.threads ?? {}) as Record<string, unknown>;
  const out: NoteDismissals = {};
  for (const [id, at] of Object.entries(raw)) {
    const when = toDate(at as never);
    if (when) out[id] = when;
  }
  return out;
}

/** This trainer's dismissals, live. `{}` until the document has been read. */
export function useNoteDismissals(uid: string | null | undefined): NoteDismissals {
  const [dismissals, setDismissals] = useState<NoteDismissals>({});

  useEffect(() => {
    if (!uid) {
      setDismissals({});
      return;
    }
    const unsub = onSnapshot(
      refFor(uid),
      (snap) => setDismissals(readDismissals(snap.data() as Record<string, unknown> | undefined)),
      // A failed read means "unknown", never "empty" — but the honest empty
      // here is showing MORE than the trainer asked for, never less.
      (err) => handleFirestoreError(err, OperationType.GET, `${DISMISSALS_COLLECTION}/${uid}`),
    );
    return unsub;
  }, [uid]);

  return dismissals;
}

/** "No need to remind me." Private to this trainer, and undone by any update. */
export async function dismissThread(uid: string, threadId: string): Promise<void> {
  if (!uid || !threadId) return;
  try {
    await setDoc(
      refFor(uid),
      { threads: { [threadId]: Timestamp.now() }, updatedAt: Timestamp.now() },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${DISMISSALS_COLLECTION}/${uid}`);
    throw err;
  }
}

/** Put it back on this trainer's briefing. */
export async function restoreThread(uid: string, threadId: string): Promise<void> {
  if (!uid || !threadId) return;
  try {
    await setDoc(
      refFor(uid),
      { threads: { [threadId]: deleteField() }, updatedAt: Timestamp.now() },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${DISMISSALS_COLLECTION}/${uid}`);
    throw err;
  }
}
