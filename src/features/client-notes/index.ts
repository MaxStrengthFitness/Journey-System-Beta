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
export { addThreadUpdate, closeThread, reopenThread } from "./thread-write";
export { NoteThreadCard } from "./NoteThreadCard";
export * from "./dismissals";
export { useNoteDismissals, dismissThread, restoreThread } from "./dismissal-store";
