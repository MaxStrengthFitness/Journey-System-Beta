/**
 * WHAT A DOOR ASKS OF THE NOTES PAGE — read from the card the navigation
 * points at (client codex, Sep 2026).
 *
 * The codex has one place a trainer is (profile-nav.ts: a page and, maybe, a
 * card on it). Notes' three cards are not scrolled to by the shell, because
 * each needs the page to DO something first:
 *
 *   note-{threadId}   open that thread — clear a filter hiding it, open its
 *                     row, unfold Resolved — then bring it into view (the
 *                     critical line's "Open the note", the Overview's rows);
 *   notes-compose     open the composer and put the cursor in it (the
 *                     Overview's "Write a note");
 *   notes-resolved    unfold the Resolved zone.
 *
 * Anything else is not Notes' to act on: null. Pure: notes-intent.test.ts.
 */
import { threadIdOfAnchor, type RecordAnchor } from "../client-profile/profile-nav";

/** A request the catalog acts on: one thread, or the Resolved zone. */
export type CatalogIntent = { kind: "thread"; threadId: string } | { kind: "resolved" };

/** What a door may ask of the Notes page. */
export type NotesIntent = CatalogIntent | { kind: "compose" };

export function notesIntentOf(anchor: RecordAnchor | null | undefined): NotesIntent | null {
  if (anchor === "notes-compose") return { kind: "compose" };
  if (anchor === "notes-resolved") return { kind: "resolved" };
  const threadId = threadIdOfAnchor(anchor);
  return threadId ? { kind: "thread", threadId } : null;
}
