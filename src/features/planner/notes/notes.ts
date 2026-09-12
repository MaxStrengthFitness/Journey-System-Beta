/**
 * PLANNER NOTES — the rules of the thing, without React or Firestore.
 *
 * Round: Learning + Planner, Sep 2026. Shapes and the privacy reasoning are
 * in ./types.ts.
 *
 * PURE MODULE — every decision the notes screen and its writes make lives
 * here, so it can be tested without a device.
 */

import { formatStudioDate, formatStudioTime, startOfStudioDay, studioDateKey, toDate } from "../../../lib/studio-time";
import { clipText } from "../../../lib/clip-text";
import {
  FOLDER_NAME_MAX,
  NOTE_BODY_MAX,
  NOTE_KIND_LABEL,
  NOTE_KINDS,
  NOTE_MAX_CLIENTS,
  NOTE_TITLE_MAX,
  type NoteDraft,
  type NoteFolder,
  type NoteKind,
  type SharedNote,
  type TrainerNote,
} from "./types";

/** Which notes the list shows. */
export type NotesView =
  | { kind: "all" }
  | { kind: "pinned" }
  | { kind: "shared" }
  | { kind: "unfiled" }
  | { kind: "folder"; folderId: string };

export interface NoteProblem {
  field: "title" | "body" | "kind" | "clients" | "share";
  message: string;
}

/**
 * A note is shareable when it is about exactly ONE client.
 *
 * A shared copy is readable by anyone who can open that client — at that
 * client's studio. A note about two clients at two studios would put each
 * client's details in front of the other's team. One client, one audience.
 */
export function canShare(clientIds: string[]): boolean {
  return clientIds.length === 1;
}

/**
 * The title a note is saved under: the one typed, or else the body's first
 * line — so a quick jot needs no title, the way a notes app behaves.
 */
export function effectiveTitle(d: Pick<NoteDraft, "title" | "body">): string {
  const typed = d.title.replace(/\s+/g, " ").trim();
  if (typed) return clipText(typed, NOTE_TITLE_MAX);
  const first = d.body.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return first.length > 80 ? `${clipText(first, 79).trimEnd()}…` : first;
}

export function validateNoteDraft(d: NoteDraft): NoteProblem[] {
  const out: NoteProblem[] = [];
  const title = d.title.trim();
  if (!effectiveTitle(d)) out.push({ field: "title", message: "Write something first — a title or a line." });
  if (title.length > NOTE_TITLE_MAX) {
    out.push({ field: "title", message: `Keep the title under ${NOTE_TITLE_MAX} characters.` });
  }
  if (d.body.length > NOTE_BODY_MAX) {
    out.push({ field: "body", message: `That is over ${NOTE_BODY_MAX.toLocaleString()} characters — split it into two notes.` });
  }
  if (d.clientIds.length > NOTE_MAX_CLIENTS) {
    out.push({ field: "clients", message: `A note can be about ${NOTE_MAX_CLIENTS} clients at most.` });
  }
  if (d.share && !canShare(d.clientIds)) {
    out.push({
      field: "share",
      message:
        d.clientIds.length === 0
          ? "Link the client first — a shared note goes on their record."
          : "A shared note has to be about one client. Remove the others, or keep it private.",
    });
  }
  if (!NOTE_KINDS.includes(d.kind)) out.push({ field: "kind", message: "Pick what kind of note it is." });
  return out;
}

/** Trim, de-duplicate, and keep names only for linked clients. */
export function normaliseDraft(d: NoteDraft): NoteDraft {
  const clientIds = Array.from(new Set(d.clientIds.filter(Boolean)));
  const clientNames: Record<string, string> = {};
  for (const id of clientIds) {
    const name = (d.clientNames[id] ?? "").trim().slice(0, 80);
    if (name) clientNames[id] = name;
  }
  return {
    ...d,
    title: d.title.trim().slice(0, NOTE_TITLE_MAX),
    body: d.body.slice(0, NOTE_BODY_MAX),
    clientIds,
    clientNames,
  };
}

/** The private document's fields, minus id and timestamps. */
export function noteFields(
  d: NoteDraft,
  sharedWith: string | null,
): Omit<TrainerNote, "id" | "createdAt" | "updatedAt"> {
  const n = normaliseDraft(d);
  return {
    title: effectiveTitle(n),
    body: n.body,
    kind: n.kind,
    folderId: n.folderId,
    clientIds: n.clientIds,
    clientNames: n.clientNames,
    pinned: n.pinned,
    sharedWith,
  };
}

/** The shared copy's fields, minus id and timestamps. Nothing about other clients. */
export function sharedFields(
  d: Pick<NoteDraft, "title" | "body" | "kind">,
  clientId: string,
  author: { id: string; name: string },
): Omit<SharedNote, "id" | "updatedAt"> {
  return {
    clientId,
    title: effectiveTitle(d),
    body: d.body.slice(0, NOTE_BODY_MAX),
    kind: d.kind,
    authorId: author.id,
    authorName: (author.name || "A trainer").slice(0, 80),
  };
}

/**
 * What a save has to do to the shared copy.
 *
 *   write  the client whose copy to (re)write, or null
 *   remove the client whose copy to delete, or null
 *
 * The editor locks the client while a note is shared, so `remove` differing
 * from `write` is a guard rather than a path the screen takes — but if the
 * two ever differ, the old copy must not be left behind on someone's record.
 */
export function sharePlan(
  before: Pick<TrainerNote, "sharedWith"> | null,
  draft: Pick<NoteDraft, "share" | "clientIds">,
): { write: string | null; remove: string | null } {
  const was = before?.sharedWith ?? null;
  const target = draft.share && canShare(draft.clientIds) ? draft.clientIds[0] : null;
  return {
    write: target,
    remove: was && was !== target ? was : null,
  };
}

/* ------------------------------------------------------------------ *
 * From Firestore — defensive, so one odd document never blanks the list
 * ------------------------------------------------------------------ */

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const kindOf = (v: unknown): NoteKind => (NOTE_KINDS.includes(v as NoteKind) ? (v as NoteKind) : "note");

export function noteFromDoc(id: string, d: Record<string, unknown> | undefined): TrainerNote {
  const data = d ?? {};
  const clientIds = Array.isArray(data.clientIds)
    ? data.clientIds.filter((c): c is string => typeof c === "string" && c.length > 0).slice(0, NOTE_MAX_CLIENTS)
    : [];
  const rawNames = data.clientNames && typeof data.clientNames === "object" ? (data.clientNames as Record<string, unknown>) : {};
  const clientNames: Record<string, string> = {};
  for (const c of clientIds) if (typeof rawNames[c] === "string") clientNames[c] = rawNames[c] as string;
  const sharedWith = typeof data.sharedWith === "string" && data.sharedWith ? data.sharedWith : null;
  return {
    id,
    title: str(data.title, NOTE_TITLE_MAX),
    body: str(data.body, NOTE_BODY_MAX),
    kind: kindOf(data.kind),
    folderId: typeof data.folderId === "string" && data.folderId ? data.folderId : null,
    clientIds,
    clientNames,
    pinned: data.pinned === true,
    sharedWith,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function folderFromDoc(id: string, d: Record<string, unknown> | undefined): NoteFolder {
  return { id, name: str(d?.name, FOLDER_NAME_MAX) || "Folder", createdAt: d?.createdAt, updatedAt: d?.updatedAt };
}

export function sharedNoteFromDoc(id: string, d: Record<string, unknown> | undefined): SharedNote {
  const data = d ?? {};
  return {
    id,
    clientId: str(data.clientId, 200),
    title: str(data.title, NOTE_TITLE_MAX),
    body: str(data.body, NOTE_BODY_MAX),
    kind: kindOf(data.kind),
    authorId: str(data.authorId, 200),
    authorName: str(data.authorName, 80) || "A trainer",
    updatedAt: data.updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function millis(v: unknown): number {
  if (!v) return 0;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return typeof v === "number" ? v : 0;
}

/**
 * Pinned first, then most recently changed. A note whose write has not come
 * back from the server yet (no timestamp) is the one just typed: newest.
 */
export function sortNotes(notes: TrainerNote[]): TrainerNote[] {
  const when = (n: TrainerNote) =>
    millis(n.updatedAt) || millis(n.createdAt) || Number.MAX_SAFE_INTEGER;
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || when(b) - when(a),
  );
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Every word of the query somewhere in the title, body, kind or client names. */
export function noteMatches(
  note: TrainerNote,
  query: string,
  nameOf: (clientId: string) => string,
): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(
    [
      note.title,
      note.body,
      NOTE_KIND_LABEL[note.kind] ?? "",
      ...note.clientIds.map((id) => nameOf(id) || note.clientNames[id] || ""),
    ].join(" "),
  );
  return words.every((w) => hay.includes(w));
}

/**
 * Whether a note is in a folder that exists. `folderIds` is the folders that
 * do, once they have loaded; without it every folder is taken as real. A note
 * can point at a deleted folder — saved from a draft that was open when the
 * folder went — and it belongs in Unfiled then, not nowhere (review fix).
 */
function inAFolder(note: Pick<TrainerNote, "folderId">, folderIds?: ReadonlySet<string>): boolean {
  if (!note.folderId) return false;
  return folderIds ? folderIds.has(note.folderId) : true;
}

export function inView(note: TrainerNote, view: NotesView, folderIds?: ReadonlySet<string>): boolean {
  switch (view.kind) {
    case "all":
      return true;
    case "pinned":
      return note.pinned;
    case "shared":
      return Boolean(note.sharedWith);
    case "unfiled":
      return !inAFolder(note, folderIds);
    case "folder":
      return note.folderId === view.folderId;
  }
}

export function notesInView(
  notes: TrainerNote[],
  view: NotesView,
  kind: NoteKind | "all",
  query: string,
  nameOf: (clientId: string) => string,
  folderIds?: ReadonlySet<string>,
): TrainerNote[] {
  return sortNotes(
    notes.filter(
      (n) =>
        inView(n, view, folderIds) &&
        (kind === "all" || n.kind === kind) &&
        noteMatches(n, query, nameOf),
    ),
  );
}

/** How many notes each folder holds, plus the unfiled count (see inAFolder). */
export function folderCounts(
  notes: TrainerNote[],
  folderIds?: ReadonlySet<string>,
): { byFolder: Record<string, number>; unfiled: number } {
  const byFolder: Record<string, number> = {};
  let unfiled = 0;
  for (const n of notes) {
    if (inAFolder(n, folderIds)) byFolder[n.folderId!] = (byFolder[n.folderId!] ?? 0) + 1;
    else unfiled += 1;
  }
  return { byFolder, unfiled };
}

/** The first bit of the body, on one line. */
export function excerpt(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function cleanFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function validFolderName(name: string): string | null {
  const n = cleanFolderName(name);
  if (!n) return "Name the folder.";
  if (n.length > FOLDER_NAME_MAX) return `Keep it under ${FOLDER_NAME_MAX} characters.`;
  return null;
}

/** Folders in name order, the way a person scans them. */
export function sortFolders<T extends { name: string }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

/* ------------------------------------------------------------------ *
 * The list: saved notes plus drafts not saved yet
 * ------------------------------------------------------------------ */

export interface NoteListItem {
  id: string;
  /** The saved note — or, for a note never saved, a stand-in built from its draft. */
  note: TrainerNote;
  /** There are changes on this iPad that have not been saved. */
  unsaved: boolean;
  /** Never saved at all. */
  isNew: boolean;
}

/**
 * What the list shows. A note never saved appears (as its draft) so it can be
 * found again; a saved note with unsaved changes shows what is SAVED, marked
 * unsaved, because the card must not claim something is stored that is not.
 */
export function noteListItems(
  saved: TrainerNote[],
  drafts: Array<{ noteId: string; draft: NoteDraft; isNew: boolean }>,
  view: NotesView,
  kind: NoteKind | "all",
  query: string,
  nameOf: (clientId: string) => string,
  folderIds?: ReadonlySet<string>,
): NoteListItem[] {
  const savedIds = new Set(saved.map((n) => n.id));
  const unsavedIds = new Set(drafts.map((d) => d.noteId));
  const standIns: TrainerNote[] = drafts
    .filter((d) => d.isNew && !savedIds.has(d.noteId))
    .map((d) => ({ id: d.noteId, ...noteFields(d.draft, null), title: effectiveTitle(d.draft) || "New note" }));
  const newIds = new Set(standIns.map((n) => n.id));
  return notesInView([...saved, ...standIns], view, kind, query, nameOf, folderIds).map((note) => ({
    id: note.id,
    note,
    unsaved: unsavedIds.has(note.id),
    isNew: newIds.has(note.id),
  }));
}

/* ------------------------------------------------------------------ *
 * Errors, in studio English
 * ------------------------------------------------------------------ */

export function noteErrorMessage(err: unknown, action: "save" | "delete" | "folder"): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") {
    return action === "folder"
      ? "The database refused that. Sign out and back in, then try again."
      : "The database refused that. If the note is shared, you may no longer be able to write to that client's record — turn Share off and save it privately.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "No connection right now. Nothing was lost — try again in a moment.";
  }
  if (code === "unauthenticated") return "You've been signed out. Sign back in and try again.";
  return action === "delete" ? "Couldn't delete that note. Try again." : "Couldn't save. Try again.";
}

/**
 * When a note last changed, the way a person says it, in studio time:
 * "Today, 2:14 PM" · "Yesterday" · "Sep 3" · "Sep 3, 2025".
 */
export function whenLabel(value: unknown, now: Date = new Date()): string {
  const d = toDate(value as Parameters<typeof toDate>[0]);
  if (!d) return "Just now";
  const key = studioDateKey(d);
  const today = studioDateKey(now);
  if (!key || !today) return "";
  if (key === today) return `Today, ${formatStudioTime(d)}`;
  const yesterday = studioDateKey(new Date(startOfStudioDay(now).getTime() - 1));
  if (key === yesterday) return "Yesterday";
  return formatStudioDate(
    d,
    key.slice(0, 4) === today.slice(0, 4)
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

/**
 * A linked client's name: from the list the screen has, else as it was when
 * linked, else a plain placeholder — never a bare Mindbody id.
 */
export function clientLabel(
  id: string,
  note: Pick<TrainerNote, "clientNames"> | Pick<NoteDraft, "clientNames">,
  nameOf: (clientId: string) => string,
): string {
  return nameOf(id) || note.clientNames[id] || "A client";
}

/** A blank draft, optionally already about one client (from a profile). */
export function blankDraft(client?: { id: string; name: string } | null): NoteDraft {
  return {
    title: "",
    body: "",
    kind: "note",
    folderId: null,
    clientIds: client ? [client.id] : [],
    clientNames: client ? { [client.id]: client.name } : {},
    pinned: false,
    share: false,
  };
}

/** A draft from a saved note, for the editor. */
export function draftFromNote(n: TrainerNote): NoteDraft {
  return {
    title: n.title,
    body: n.body,
    kind: n.kind,
    folderId: n.folderId,
    clientIds: [...n.clientIds],
    clientNames: { ...n.clientNames },
    pinned: n.pinned,
    share: Boolean(n.sharedWith),
  };
}

/**
 * True when saving `a` would store something different from `b`.
 *
 * Compared as they would be stored — trimmed, de-duplicated, and titled the
 * way a save titles them — so a jot saved with its first line as the title
 * does not come back from the save looking unsaved.
 */
export function draftChanged(a: NoteDraft, b: NoteDraft): boolean {
  const stored = (d: NoteDraft) => {
    const n = normaliseDraft(d);
    return JSON.stringify({ ...n, title: effectiveTitle(n) });
  };
  return stored(a) !== stored(b);
}
