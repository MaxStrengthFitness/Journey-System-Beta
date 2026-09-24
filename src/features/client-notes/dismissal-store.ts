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
import { useEffect, useMemo, useState } from "react";
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

/**
 * Whether this trainer's dismissals have been read (client codex).
 *   - `loading` — no answer yet for THIS uid, or nobody signed in yet;
 *   - `ready`   — read (an absent document is a real answer: nothing hushed);
 *   - `failed`  — the read errored, so what is hushed is unknown.
 * Only `ready` means the map is the trainer's own. A screen offering "No
 * need to remind me" / "Show it again" waits for it: before then it cannot
 * tell a hushed thread from one that is not.
 */
export type NoteDismissalsStatus = "loading" | "ready" | "failed";

export interface NoteDismissalsState {
  /**
   * What was last read for this uid: `{}` before any answer, and after a
   * failure the last good read (what the briefing has always shown). Only
   * `status === "ready"` says it is current.
   */
  dismissals: NoteDismissals;
  status: NoteDismissalsStatus;
}

interface DismissalsRead {
  /** Which trainer this answer is for, so another uid never inherits it. */
  uid: string;
  status: Exclude<NoteDismissalsStatus, "loading">;
  dismissals: NoteDismissals;
}

/** One empty map, so an unanswered read does not re-memo every render. */
const NONE: NoteDismissals = Object.freeze({}) as NoteDismissals;

/**
 * This trainer's dismissals, live, and whether they have been read. ONE doc
 * listener; the Notes & Profile tab opens it once and shares it.
 */
export function useNoteDismissalsState(uid: string | null | undefined): NoteDismissalsState {
  const [read, setRead] = useState<DismissalsRead | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      refFor(uid),
      (snap) =>
        setRead({
          uid,
          status: "ready",
          dismissals: readDismissals(snap.data() as Record<string, unknown> | undefined),
        }),
      // A failed read means "unknown", never "empty". On failure the last
      // good map for this uid is kept (what the briefing has always shown,
      // and its hushed count still offers every thread back); `status` says
      // the map is stale, so the Notes page can offer hush and restore only
      // once it is "ready". The status is set before the error handler
      // (which may throw) runs.
      (err) => {
        setRead((prev) => ({
          uid,
          status: "failed",
          dismissals: prev?.uid === uid ? prev.dismissals : NONE,
        }));
        handleFirestoreError(err, OperationType.GET, `${DISMISSALS_COLLECTION}/${uid}`);
      },
    );
    return unsub;
  }, [uid]);

  return useMemo(() => {
    if (!uid || !read || read.uid !== uid) return { dismissals: NONE, status: "loading" };
    return { dismissals: read.dismissals, status: read.status };
  }, [uid, read]);
}

/** This trainer's dismissals, live. `{}` until the document has been read. */
export function useNoteDismissals(uid: string | null | undefined): NoteDismissals {
  return useNoteDismissalsState(uid).dismissals;
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
