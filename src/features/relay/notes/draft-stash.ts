/**
 * PLANNER NOTES — unsaved drafts, kept for the session.
 *
 * A trainer halfway through a plan who taps Studio to check the shift, opens
 * another note, or goes to a client's profile comes back to what they typed.
 * The list marks those notes "Unsaved", and a new note that was never saved
 * keeps its card until it is saved or discarded.
 *
 * Module state, never localStorage: a studio iPad is shared, and a note can
 * describe an injury. Keyed by the signed-in uid, so the next trainer on the
 * same iPad never sees anyone else's drafts, and gone on a reload.
 *
 * PURE MODULE (no React, no Firestore), so it is tested without a device.
 */

import type { NoteDraft } from "./types";

export interface StashedDraft {
  draft: NoteDraft;
  /** What the draft started from: the saved note, or a blank (maybe about a client). */
  baseline: NoteDraft;
  /** Never saved. The id is already reserved, so saving keeps it. */
  isNew: boolean;
}

const stash = new Map<string, StashedDraft>();
const key = (uid: string, noteId: string) => `${uid}/${noteId}`;

export function stashDraft(uid: string, noteId: string, entry: StashedDraft): void {
  stash.set(key(uid, noteId), entry);
}

export function stashedDraft(uid: string | null, noteId: string): StashedDraft | null {
  return uid ? stash.get(key(uid, noteId)) ?? null : null;
}

export function dropDraft(uid: string | null, noteId: string): void {
  if (uid) stash.delete(key(uid, noteId));
}

/** This trainer's unsaved drafts, newest stashed last. */
export function stashedDrafts(uid: string | null): Array<StashedDraft & { noteId: string }> {
  if (!uid) return [];
  const prefix = `${uid}/`;
  const out: Array<StashedDraft & { noteId: string }> = [];
  for (const [k, v] of stash) {
    if (k.startsWith(prefix)) out.push({ ...v, noteId: k.slice(prefix.length) });
  }
  return out;
}

/** Tests only. */
export function clearDraftStash(): void {
  stash.clear();
}
