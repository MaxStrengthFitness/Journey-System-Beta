/**
 * Filing an unfiled note — the write behind every "one tap" in the To-file
 * tray (`NoteSweep`), wherever the tray is mounted.
 *
 * Only the two fields that change are written (`kind`, `category`), through
 * the journal hook's existing edit function; body, loudness, machine, dates
 * and provenance are untouched. Discarding is the journal's archive, never a
 * delete — history can't quietly vanish.
 */
import { archiveJournalEntry, updateJournalEntry } from "../../hooks/useClientJournal";
import { storedKindOf, type FilingCategory, type NoteFlavour } from "./note-catalog";

/**
 * File `entryId` under `category`, with its flavour when one was picked (a
 * 4 P or Set-up under Coaching & equipment, a Health flavour). What is
 * written is `storedKindOf`'s answer — the same one the composer writes — so
 * a note filed from the tray and one filed as it was written are the same
 * note.
 */
export async function fileUnfiledEntry(
  entryId: string,
  category: FilingCategory,
  flavour?: NoteFlavour | null,
): Promise<void> {
  const stored = storedKindOf(category, flavour ?? null);
  await updateJournalEntry(entryId, { kind: stored.kind, category: stored.category });
}

/** Discard an unfiled note: archived, not deleted. */
export async function discardUnfiledEntry(entryId: string): Promise<void> {
  await archiveJournalEntry(entryId);
}
