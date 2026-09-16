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

export type NoteKind = "note" | "plan" | "routine" | "retention" | "injury" | "research";

export const NOTE_KINDS: NoteKind[] = ["note", "plan", "routine", "retention", "injury", "research"];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  note: "Note",
  plan: "Plan",
  routine: "Routine change",
  retention: "Retention",
  injury: "Injury plan",
  /* Planner rework (Sep 2026): study notes, findings, an article that
     supports the method — to show a client on the iPad later. */
  research: "Research",
};

/**
 * A source a note points at — an article, a study, a video. http(s) only
 * (./format.ts safeHref). Planner rework, Sep 2026.
 */
export interface NoteLink {
  url: string;
  title: string;
}

/**
 * One jot in a note's working log (Planner rework, Sep 2026). AJ: trainers
 * "build notes about a client over time rather than having to sit and write
 * one big document at one time … and finally publish the plan or findings".
 *
 * The log is the "over time" part: short, dated, private ALWAYS — it is
 * never copied onto a client's record or to colleagues, even when the note
 * is. The body is the part that gets published; a jot moves into it with
 * "Add to the note".
 *
 * `at` is a plain number (ms) rather than a server timestamp, because it is
 * written inside an array (arrayUnion), where server timestamps are not
 * allowed.
 */
export interface NoteLogEntry {
  id: string;
  at: number;
  text: string;
  /** The client it was about, when the note names several. */
  clientId: string | null;
}

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
  /** Sources (Planner rework). Absent on older notes. */
  links: NoteLink[];
  /** The working log, oldest first (Planner rework). Absent on older notes. */
  log: NoteLogEntry[];
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
  /** Sources travel with the published note (Planner rework). */
  links: NoteLink[];
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
  links: NoteLink[];
}

/* Limits. Mirrored in firestore.rules (trainerNoteValid, sharedNoteValid). */
export const NOTE_TITLE_MAX = 160;
export const NOTE_BODY_MAX = 10000;
export const NOTE_MAX_CLIENTS = 10;
export const FOLDER_NAME_MAX = 60;
export const NOTE_MAX_LINKS = 10;
export const NOTE_LINK_URL_MAX = 500;
export const NOTE_LINK_TITLE_MAX = 120;
export const NOTE_LOG_MAX = 100;
export const NOTE_LOG_TEXT_MAX = 2000;
