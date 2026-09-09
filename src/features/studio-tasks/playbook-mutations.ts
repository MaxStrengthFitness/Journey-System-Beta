/**
 * Writes for the playbook and for initiative submissions.
 *
 * Separate from mutations.ts on purpose: that file owns the templates and
 * instances model and is already 400 lines. These are a different collection
 * with a different authority story, and keeping them apart means a change here
 * cannot break the nightly task reset.
 */
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { studioDateKey } from "../../lib/studio-time";
import {
  PLAYBOOK_BODY_MAX,
  PLAYBOOK_TITLE_MAX,
  withConfirmation,
  type PlaybookDraft,
  type PlaybookEntry,
} from "./playbook";
import type { InitiativeSubmission, SubmissionEntry } from "./initiatives";

/* ------------------------------------------------------------------ *
 * Playbook
 * ------------------------------------------------------------------ */

function playbookRef(studioId: string) {
  return collection(db, "studios", studioId, "playbook");
}

/**
 * Create or update an entry.
 *
 * The author is stamped from `auth.currentUser`, never from the caller, so a
 * bug in a screen cannot attribute someone else's entry. `lastConfirmedOn` is
 * set on every save because an edit IS a confirmation — the person editing it
 * has just asserted this is current.
 */
export async function savePlaybookEntry(
  studioId: string,
  draft: PlaybookDraft,
  author: { id: string; name: string },
  entryId?: string,
): Promise<string> {
  const id = entryId ?? doc(playbookRef(studioId)).id;
  const todayKey = studioDateKey(new Date()) ?? "";

  const payload: Record<string, unknown> = {
    studioId,
    title: draft.title.trim().slice(0, PLAYBOOK_TITLE_MAX),
    situation: draft.situation.trim().slice(0, PLAYBOOK_BODY_MAX),
    worked: draft.worked.trim().slice(0, PLAYBOOK_BODY_MAX),
    machineIds: draft.machineIds ?? [],
    // Lower-cased and de-duplicated at the door. Tags are a search surface,
    // and "Shoulder" / "shoulder" as two tags makes the surface worse.
    tags: Array.from(
      new Set((draft.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
    ),
    updatedAt: serverTimestamp(),
    lastConfirmedOn: todayKey,
  };

  if (draft.tried?.trim()) {
    payload.tried = draft.tried.trim().slice(0, PLAYBOOK_BODY_MAX);
  }
  if (draft.sourceRequestId) payload.sourceRequestId = draft.sourceRequestId;

  if (!entryId) {
    payload.authorId = author.id || auth.currentUser?.uid || "";
    payload.authorName = author.name;
    payload.createdAt = serverTimestamp();
  }

  // merge:true so an edit never drops confirmations left by other trainers.
  await setDoc(doc(playbookRef(studioId), id), payload, { merge: true });
  return id;
}

/** "This worked for me too." Idempotent — the same trainer twice is once. */
export async function confirmPlaybookEntry(
  studioId: string,
  entry: PlaybookEntry,
  trainer: { id: string; name: string },
): Promise<void> {
  const todayKey = studioDateKey(new Date()) ?? "";
  await updateDoc(doc(playbookRef(studioId), entry.id), {
    ...withConfirmation(entry, trainer, todayKey),
  });
}

/**
 * Retire, never delete.
 *
 * A resolved request may point at this entry, and the Catalog may be showing
 * it against a machine. Deleting orphans both. Retiring keeps the record and
 * takes it out of search, and it is reversible by clearing the same fields.
 */
export async function retirePlaybookEntry(
  studioId: string,
  entryId: string,
  trainerId: string,
): Promise<void> {
  await updateDoc(doc(playbookRef(studioId), entryId), {
    retiredAt: serverTimestamp(),
    retiredBy: trainerId,
  });
}

export async function restorePlaybookEntry(
  studioId: string,
  entryId: string,
): Promise<void> {
  const todayKey = studioDateKey(new Date()) ?? "";
  await updateDoc(doc(playbookRef(studioId), entryId), {
    retiredAt: deleteField(),
    retiredBy: deleteField(),
    // Restoring is an assertion that it is current again, so the staleness
    // clock restarts rather than resuming from whenever it was retired.
    lastConfirmedOn: todayKey,
  });
}

/* ------------------------------------------------------------------ *
 * Initiative submissions
 * ------------------------------------------------------------------ */

function submissionsRef(studioId: string, requestId: string) {
  return collection(
    db,
    "studios",
    studioId,
    "taskRequests",
    requestId,
    "submissions",
  );
}

/**
 * Log what I did against an initiative.
 *
 * The document id IS the trainer id, which is the whole safety story: a
 * trainer can only ever write their own submission, the rule is
 * `request.auth.uid == trainerId`, and nine trainers submitting at once cannot
 * clobber each other the way a shared array would.
 *
 * `count` is denormalised alongside `entries` so a progress bar over nine
 * trainers does not have to read nine arrays.
 */
export async function saveSubmission(
  studioId: string,
  requestId: string,
  trainer: { id: string; name: string },
  entries: SubmissionEntry[],
): Promise<void> {
  await setDoc(
    doc(submissionsRef(studioId, requestId), trainer.id),
    {
      trainerId: trainer.id,
      trainerName: trainer.name,
      entries,
      count: entries.length,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** One read of every trainer's submission, for the manager's roll-up. */
export async function fetchSubmissions(
  studioId: string,
  requestId: string,
): Promise<InitiativeSubmission[]> {
  const snap = await getDocs(submissionsRef(studioId, requestId));
  return snap.docs.map(
    (d) => ({ ...(d.data() as object), trainerId: d.id }) as InitiativeSubmission,
  );
}

/** Live version, for the card a manager is watching while the week runs. */
export function watchSubmissions(
  studioId: string,
  requestId: string,
  onChange: (subs: InitiativeSubmission[]) => void,
): () => void {
  return onSnapshot(submissionsRef(studioId, requestId), (snap) => {
    onChange(
      snap.docs.map(
        (d) => ({ ...(d.data() as object), trainerId: d.id }) as InitiativeSubmission,
      ),
    );
  });
}
