/**
 * PLANNER NOTES — the shapes.
 *
 * Round: Learning + Planner, Sep 2026. AJ: "an area where trainers can store
 * notes in folders and link clients to those notes to build plans and plan
 * routine changes or additions or retention strategies or injury plans".
 * He chose: private to the author, with a Share button that makes a note
 * readable by anyone who can open the linked client.
 *
 * WHERE THEY LIVE, AND WHY THERE
 *
 *   trainers/{uid}/notes/{noteId}         the author's own notes
 *   trainers/{uid}/noteFolders/{folderId} the author's folders
 *   clients/{clientId}/sharedNotes/{noteId}
 *                                         a shared note's copy, on the record
 *
 * Private by PATH, like the personal task list (TaskScope in
 * features/studio-tasks/types.ts): the rule is request.auth.uid == trainerId
 * and there is no visibility field for a future query to forget. A note can
 * name a client and describe an injury — health data — so "private" has to
 * be structural, not a convention.
 *
 * Sharing COPIES the note onto the client's record rather than opening the
 * author's tree to others. The copy lives beside the client's InBody scans
 * and reads the same way: whoever can open the client, and nobody else. It
 * is also why a shared plan outlives the trainer who wrote it — it belongs
 * to the client's record now, not to a person's account.
 */

export type NoteKind = "note" | "plan" | "routine" | "retention" | "injury";

export const NOTE_KINDS: NoteKind[] = ["note", "plan", "routine", "retention", "injury"];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: "Note",
  plan: "Plan",
  routine: "Routine change",
  retention: "Retention",
  injury: "Injury plan",
};

/** trainers/{uid}/noteFolders/{folderId} */
export interface NoteFolder {
  id: string;
  name: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** trainers/{uid}/notes/{noteId} */
export interface TrainerNote {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  /** Null: not in a folder. */
  folderId: string | null;
  /** The clients this note is about. At most NOTE_MAX_CLIENTS. */
  clientIds: string[];
  /**
   * Their names as they were when linked. Shown when a client is not in the
   * list the Planner has (another studio's client, or one since removed), so
   * a link never renders as a bare id.
   */
  clientNames: Record<string, string>;
  pinned: boolean;
  /** The client whose record carries a copy, while the note is shared. */
  sharedWith: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * clients/{clientId}/sharedNotes/{noteId} — the id is the private note's.
 *
 * Rewritten whole on every save by its author (a set, never a merge), so a
 * copy a studio leader removed comes back only if the author shares it again
 * on purpose — see the copy check in NoteEditor. No createdAt: nothing reads
 * "shared since", and leaving it out is what lets every save be one plain
 * overwrite that the rules can check in full.
 */
export interface SharedNote {
  id: string;
  clientId: string;
  title: string;
  body: string;
  kind: NoteKind;
  authorId: string;
  authorName: string;
  updatedAt?: unknown;
}

/** What the editor hands to the mutations. */
export interface NoteDraft {
  title: string;
  body: string;
  kind: NoteKind;
  folderId: string | null;
  clientIds: string[];
  clientNames: Record<string, string>;
  pinned: boolean;
  /** Whether it should be shared once saved. Needs exactly one client. */
  share: boolean;
}

/* Limits. Mirrored in firestore.rules (trainerNoteValid, sharedNoteValid). */
export const NOTE_TITLE_MAX = 160;
export const NOTE_BODY_MAX = 10000;
export const NOTE_MAX_CLIENTS = 10;
export const FOLDER_NAME_MAX = 60;
