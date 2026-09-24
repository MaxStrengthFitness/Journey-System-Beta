/**
 * NOTES — the catalog, the chips, the To-file tray, and threads.
 *
 * Read note-catalog.ts first: it is the one place the categories are
 * defined, and its header explains "capture now, tag at teardown". Then
 * threads.ts, which is the one place a note's updates are assembled and the
 * three zones are decided.
 */
export * from "./note-catalog";
export { NoteSweep } from "./NoteSweep";
export { fileUnfiledEntry, discardUnfiledEntry } from "./file-unfiled";
export * from "./threads";
export { addThreadUpdate, archiveThread, closeThread, reopenThread } from "./thread-write";
export { NoteThreadCard } from "./NoteThreadCard";
// The Notes page of the record (client codex): the page, its catalog, a row.
export { NotesPage, type NotesPageProps } from "./NotesPage";
export { NotesCatalog, type NotesCatalogProps } from "./NotesCatalog";
export { ThreadRow, firstLineOf, type ThreadRowProps } from "./ThreadRow";
export { notesIntentOf, type CatalogIntent, type NotesIntent } from "./notes-intent";
export * from "./dismissals";
// The record's note selectors and its one critical line (client codex): every
// page of Notes & Profile reads the one journal load through these.
export * from "./record-selectors";
export { CriticalLine, CRITICAL_LINE_FAILED, type CriticalLineProps } from "./CriticalLine";
export {
  useNoteDismissals,
  useNoteDismissalsState,
  dismissThread,
  restoreThread,
  type NoteDismissalsState,
  type NoteDismissalsStatus,
} from "./dismissal-store";
