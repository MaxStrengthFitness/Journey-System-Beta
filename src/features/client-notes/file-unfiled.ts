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
import type { FocusCategory } from "../../types/journal";
import { NOTE_CATEGORY_META, type FilingCategory } from "./note-catalog";

/**
 * File `entryId` under `category`. `p` is the 4 P for a coaching tip and is
 * ignored for any other category (the journal keeps `category` for the P).
 */
export async function fileUnfiledEntry(
  entryId: string,
  category: FilingCategory,
  p?: FocusCategory | null,
): Promise<void> {
  const kind = NOTE_CATEGORY_META[category].kind;
  if (!kind) throw new Error(`Cannot file a note under ${category}`);
  await updateJournalEntry(entryId, {
    kind,
    category: category === "coaching" ? (p ?? null) : null,
  });
}

/** Discard an unfiled note: archived, not deleted. */
export async function discardUnfiledEntry(entryId: string): Promise<void> {
  await archiveJournalEntry(entryId);
}
