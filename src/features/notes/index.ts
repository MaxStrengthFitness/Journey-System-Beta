/**
 * NOTES — the catalog, the chips, the To-file tray.
 *
 * Read note-catalog.ts first: it is the one place the categories are
 * defined, and its header explains "capture now, tag at teardown".
 */
export * from "./note-catalog";
export { NoteSweep } from "./NoteSweep";
export { fileUnfiledEntry, discardUnfiledEntry } from "./file-unfiled";
