/**
 * A LEADER'S INACTIVE MARK, STORED — the Firestore half. What a mark means
 * (when it holds, the reasons, the words) is inactive.ts; this file reads and
 * writes the document and nothing else.
 *
 *   studios/{studioId}/inactiveMarks/{clientId}
 *     { clientId, reason, note?, day, markedBy: { id: <Auth uid>, name },
 *       markedAt: <server time> }
 *
 * Its own collection, one document a client: never a whole-client write, and
 * never the nightly job's clientStates (the job owns those, and reads these
 * in one query a studio a night). firestore.rules ("the inactive round"):
 * everyone who works at the studio reads them (the Client Directory leaves
 * an inactive client out of All, and her profile says she is inactive); the
 * studio's leaders, franchise owners and administrators mark, change and
 * take one back (delete: Mark active again). Signed with the Auth uid and the
 * server's time.
 *
 * READS: one listener per studio for the whole app (the Journey page, the
 * client opened over it and the Client Directory all ask), dropped when the
 * last one leaves and forgotten at sign-out; and one document for a single
 * client (her profile's Account page). A refused or failed read is never
 * "nobody is marked": `failed` travels with it.
 */
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { forgetOnSignOut } from "../../sign-out/memory";
import { INACTIVE_MARKS, inactiveMarkDoc, parseInactiveMark, type InactiveDraft, type InactiveMark } from "./inactive";

export interface InactiveMarksRead {
  marks: ReadonlyMap<string, InactiveMark>;
  loading: boolean;
  /** The read was refused or failed: nothing can be said about who is marked. */
  failed: boolean;
}

const EMPTY: ReadonlyMap<string, InactiveMark> = new Map();
const LOADING: InactiveMarksRead = { marks: EMPTY, loading: true, failed: false };
const NONE: InactiveMarksRead = { marks: EMPTY, loading: false, failed: false };

interface Shared {
  value: InactiveMarksRead;
  listeners: Set<(v: InactiveMarksRead) => void>;
  stop: () => void;
}

const shared = new Map<string, Shared>();

function subscribe(studioId: string, fn: (v: InactiveMarksRead) => void): () => void {
  let s = shared.get(studioId);
  if (!s) {
    const entry: Shared = { value: LOADING, listeners: new Set(), stop: () => {} };
    const publish = (v: InactiveMarksRead) => {
      entry.value = v;
      entry.listeners.forEach((l) => l(v));
    };
    entry.stop = onSnapshot(
      collection(db, "studios", studioId, INACTIVE_MARKS),
      (snap) => {
        const next = new Map<string, InactiveMark>();
        snap.docs.forEach((d) => {
          const m = parseInactiveMark(d.id, d.data() as Record<string, unknown>);
          if (m) next.set(d.id, m);
        });
        publish({ marks: next, loading: false, failed: false });
      },
      () => publish({ marks: EMPTY, loading: false, failed: true }),
    );
    s = entry;
    shared.set(studioId, s);
  }
  const entry = s;
  entry.listeners.add(fn);
  fn(entry.value);
  return () => {
    entry.listeners.delete(fn);
    if (entry.listeners.size === 0) {
      entry.stop();
      if (shared.get(studioId) === entry) shared.delete(studioId);
    }
  };
}

// The next person on a shared iPad reads the marks afresh (and may not work at this studio).
forgetOnSignOut(() => {
  for (const s of shared.values()) s.stop();
  shared.clear();
});

/** Every mark at the studio: one small collection, no index. */
export function useInactiveMarks(studioId: string | null | undefined): InactiveMarksRead {
  const [value, setValue] = useState<InactiveMarksRead>(studioId ? LOADING : NONE);
  useEffect(() => {
    if (!studioId) {
      setValue(NONE);
      return;
    }
    return subscribe(studioId, setValue);
  }, [studioId]);
  return value;
}

export interface InactiveMarkRead {
  mark: InactiveMark | null;
  loading: boolean;
  failed: boolean;
}

/** One client's mark at one studio (her profile). */
export function useInactiveMark(studioId: string | null | undefined, clientId: string | null | undefined): InactiveMarkRead {
  const on = Boolean(studioId && clientId);
  const [value, setValue] = useState<InactiveMarkRead>(on ? { mark: null, loading: true, failed: false } : { mark: null, loading: false, failed: false });
  useEffect(() => {
    if (!on) {
      setValue({ mark: null, loading: false, failed: false });
      return;
    }
    setValue({ mark: null, loading: true, failed: false });
    return onSnapshot(
      doc(db, "studios", studioId as string, INACTIVE_MARKS, clientId as string),
      (snap) => setValue({ mark: snap.exists() ? parseInactiveMark(snap.id, snap.data() as Record<string, unknown>) : null, loading: false, failed: false }),
      () => setValue({ mark: null, loading: false, failed: true }),
    );
  }, [on, studioId, clientId]);
  return value;
}

const signedIn = (): string => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save: the app can't tell who is changing this.");
  return uid;
};

/** A leader marks her inactive (or changes the reason): the whole document, signed, stamped now. */
export async function markInactive(studioId: string, clientId: string, draft: InactiveDraft, name: string, day: string): Promise<void> {
  const data = inactiveMarkDoc(clientId, draft, day, { id: signedIn(), name }, serverTimestamp());
  try {
    await setDoc(doc(db, "studios", studioId, INACTIVE_MARKS, clientId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, INACTIVE_MARKS);
    throw err;
  }
}

/** Mark active again: the mark taken back. Her state is the rules' again. */
export async function markActiveAgain(studioId: string, clientId: string): Promise<void> {
  signedIn();
  try {
    await deleteDoc(doc(db, "studios", studioId, INACTIVE_MARKS, clientId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, INACTIVE_MARKS);
    throw err;
  }
}
