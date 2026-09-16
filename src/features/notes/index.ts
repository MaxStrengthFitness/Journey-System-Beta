/**
 * NOTES — the catalog, the chips, the To-file tray.
 *
 * Read note-catalog.ts first: it is the one place the categories are
 * defined, and its header explains "capture now, tag at teardown".
 */
export * from "./note-catalog";
export { NoteCategoryChips, NoteCategoryIcon, categoryDotClass } from "./NoteCategoryChips";
export { NotesCatalog, type NotesCatalogProps } from "./NotesCatalog";
export { NoteSweep, type NoteSweepProps } from "./NoteSweep";
export { fileUnfiledEntry, discardUnfiledEntry } from "./file-unfiled";
