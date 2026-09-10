import {
  collection,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  parseBlocks,
  targetDocId,
  WIKI_SUMMARY_MAX,
  WIKI_TITLE_MAX,
  type StudioWikiDraft,
} from "./studio-wiki";

/**
 * Writes for the studio's own wiki content.
 *
 * Round: Wiki Redesign Phase 4, Sep 2026.
 *
 * Everything about the authority model — why overlays are open to any trainer
 * and pages are not — is in studio-wiki.ts. What matters here is that the
 * client never sends a shape the rule would have to reason about:
 *
 *   - `authorId` is stamped from `auth.currentUser` on CREATE only, so a bug
 *     in a screen cannot attribute someone else's page, and an edit by a
 *     second trainer does not steal authorship of the first one's work.
 *   - `kind`, `targetType` and `targetId` are written once and never touched
 *     again by an update. The rule pins `kind` too — an overlay must not be
 *     promotable into a page, which is the only way the leader check on pages
 *     could be escaped.
 *   - `merge: true` on every save, so a field this build does not know about
 *     (added later, or by an admin tool) is not silently erased by an edit.
 */

function wikiRef(studioId: string) {
  return collection(db, "studios", studioId, "wiki");
}

/**
 * Create or update one document.
 *
 * For an overlay the id is DERIVED from the target, so two trainers editing
 * the Chest Press overlay converge on one document instead of quietly
 * creating two that both render and contradict each other. For a page the id
 * is random on create and passed back in on edit.
 */
export async function saveStudioWikiDoc(
  studioId: string,
  draft: StudioWikiDraft,
  author: { id: string; name: string },
  existingId?: string,
): Promise<string> {
  const id =
    existingId ??
    (draft.kind === "overlay" && draft.targetType && draft.targetId
      ? targetDocId(draft.targetType, draft.targetId)
      : doc(wikiRef(studioId)).id);

  const payload: Record<string, unknown> = {
    studioId,
    kind: draft.kind,
    title: draft.title.trim().slice(0, WIKI_TITLE_MAX),
    blocks: parseBlocks(draft.body),
    machineIds: draft.machineIds ?? [],
    // Lower-cased and de-duplicated at the door: tags are a search surface,
    // and "Shoulder" / "shoulder" as two tags makes that surface worse.
    tags: Array.from(
      new Set((draft.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
    ),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid ?? author.id ?? "",
    updatedByName: author.name,
  };

  const summary = draft.summary?.trim();
  if (summary) payload.summary = summary.slice(0, WIKI_SUMMARY_MAX);
  if (draft.kind === "page" && draft.section) payload.section = draft.section;

  if (!existingId) {
    payload.authorId = auth.currentUser?.uid || author.id || "";
    payload.authorName = author.name;
    payload.createdAt = serverTimestamp();
    if (draft.kind === "overlay") {
      payload.targetType = draft.targetType;
      payload.targetId = draft.targetId;
    }
  }

  await setDoc(doc(wikiRef(studioId), id), payload, { merge: true });
  return id;
}

/**
 * Retire, never delete.
 *
 * A machine article may be linking to this page and the Academy index may be
 * listing it; deleting orphans both, and Firestore does not cascade. Retiring
 * keeps the record, takes it out of every list and search, and is reversible
 * by clearing the same two fields — the same call the playbook makes.
 *
 * Hard delete stays with management, in the rule, for a page posted in error.
 */
export async function retireStudioWikiDoc(
  studioId: string,
  docId: string,
  trainerId: string,
): Promise<void> {
  await updateDoc(doc(wikiRef(studioId), docId), {
    retiredAt: serverTimestamp(),
    retiredBy: trainerId || auth.currentUser?.uid || "",
  });
}

export async function restoreStudioWikiDoc(
  studioId: string,
  docId: string,
): Promise<void> {
  await updateDoc(doc(wikiRef(studioId), docId), {
    retiredAt: deleteField(),
    retiredBy: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
