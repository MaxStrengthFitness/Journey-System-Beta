import { useEffect, useRef, useState } from "react";
import { settleOrQueue } from "../../session-record/finish-wait";
import { useUnsavedChanges } from "../../unsaved-changes";
import { MAX_MARK_NOTE, type MarkWord, type OpeningsMark } from "../marks";
import type { TimeKey } from "../rows";
import { keepMark, removeMark, saveMark, type MarkSigner } from "./marks-store";
import { markLabel, type MarkAction } from "./mark-words";

/**
 * "MARK THIS TIME" (Openings round, Sep 27 2026, phase 6): the state of one
 * time's mark on its sheet, and the three writes (marks-store.ts).
 *
 *   open / cancel / save   the form: a word (Always full · Usually has room)
 *                          and a short note, for a time nobody has marked or
 *                          to change the mark that is there
 *   keep                   the review's Keep: signed again, today, by the
 *                          person keeping it
 *   askRemove / remove     one question, then the mark goes for everyone
 *
 * A half-written mark is typing, so it registers with `useUnsavedChanges`
 * ("the mark on Monday 8:00 AM"): the app's navigation, My Studio's sections,
 * Openings' parts, the Context Panel's X and Escape, a tap on another time,
 * and the form's own Cancel all ask before they would lose it. It is not
 * dirty while its save is on its way.
 *
 * A write never hangs the sheet. Firestore keeps a write on the iPad at once
 * and its promise waits for the DATABASE's answer, which never comes while
 * the iPad is offline; so every write goes through session-record's
 * `settleOrQueue` (as the dates-away editor's does): the answer if it comes
 * within a moment, and not waited for at all offline. Past that the write is
 * taken as saved on this iPad, the form (or the question) closes, and the
 * sheet says so (`queued`) until the database answers. A refusal inside the
 * moment keeps the typing and says so; a refusal that comes later, after the
 * form has closed, is said at the foot of the sheet (`failed`).
 *
 * Mount one per time (the sheet keys it by the time), so a note typed for
 * Monday 8:00 can never be saved onto another time.
 */

export type { MarkAction };

export interface MarkDraft {
  word: MarkWord | null;
  note: string;
}

export interface MarkThisTimeInput {
  studioId: string | null;
  timeKey: TimeKey;
  /** The mark on the time now, as the server last said (null when none, or not known). */
  mark: OpeningsMark | null;
  /** The person signed in, or null: nothing is written without one. */
  signer: MarkSigner | null;
}

export interface MarkThisTime {
  editing: boolean;
  draft: MarkDraft;
  /** The draft differs from what the form opened with. */
  dirty: boolean;
  /** The one write on its way, if any. */
  busy: MarkAction | null;
  /** The write that last failed, if any: at once, or refused after it was saved on the iPad. */
  failed: MarkAction | null;
  /** A write saved on this iPad and not yet answered by the database (offline, or slow). */
  queued: MarkAction | null;
  confirmingRemove: boolean;
  /** Someone signed in, at a studio: the only case anything can be written. */
  canWrite: boolean;
  open: () => void;
  choose: (word: MarkWord) => void;
  setNote: (note: string) => void;
  cancel: () => void;
  save: () => Promise<void>;
  keep: () => Promise<void>;
  askRemove: () => void;
  dontRemove: () => void;
  remove: () => Promise<void>;
}

const EMPTY: MarkDraft = { word: null, note: "" };
const VERB: Record<MarkAction, string> = { save: "saved", keep: "kept", remove: "removed" };
const draftOf = (mark: OpeningsMark | null): MarkDraft => (mark ? { word: mark.mark, note: mark.note } : EMPTY);

export function useMarkThisTime({ studioId, timeKey, mark, signer }: MarkThisTimeInput): MarkThisTime {
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<MarkDraft>(EMPTY);
  const [draft, setDraft] = useState<MarkDraft>(EMPTY);
  const [busy, setBusy] = useState<MarkAction | null>(null);
  const [failed, setFailed] = useState<MarkAction | null>(null);
  const [queued, setQueued] = useState<MarkAction | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // A write that finishes after the sheet has closed sets nothing.
  const live = useRef(true);
  // Which write is the latest, so an older one's late answer says nothing.
  const sequence = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const changed = editing && (draft.word !== baseline.word || draft.note.trim() !== baseline.note.trim());
  const dirty = changed && busy !== "save";

  const reset = () => {
    setEditing(false);
    setBaseline(EMPTY);
    setDraft(EMPTY);
    setFailed(null);
  };

  const unsaved = useUnsavedChanges(dirty, markLabel(timeKey), { onDiscard: reset });
  const canWrite = Boolean(studioId && signer?.uid);

  const run = async (action: MarkAction, write: () => Promise<void>, done: () => void) => {
    if (!canWrite || busy) return;
    const mine = ++sequence.current;
    setBusy(action);
    setFailed(null);
    setQueued(null);
    let sent: Promise<void>;
    try {
      sent = write();
    } catch (err) {
      sent = Promise.reject(err);
    }
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const outcome = await settleOrQueue(sent, online);
    if (!live.current) return;
    setBusy(null);
    if (outcome.kind === "failed") {
      console.warn(`[openings] the mark couldn't be ${VERB[action]}:`, outcome.error);
      setFailed(action);
      return;
    }
    // Saved, or saved on this iPad and on its way: the form closes either way.
    done();
    if (outcome.kind === "queued") {
      setQueued(action);
      // Only the latest write speaks: a later one has said its own.
      const latest = () => live.current && sequence.current === mine;
      sent.then(
        () => {
          if (latest()) setQueued(null);
        },
        (err) => {
          console.warn(`[openings] the mark couldn't be ${VERB[action]}:`, err);
          if (!latest()) return;
          setQueued(null);
          setFailed(action);
        },
      );
    }
  };

  return {
    editing,
    draft,
    dirty,
    busy,
    failed,
    queued,
    confirmingRemove,
    canWrite,
    open: () => {
      const start = draftOf(mark);
      setBaseline(start);
      setDraft(start);
      setEditing(true);
      setFailed(null);
      setConfirmingRemove(false);
    },
    choose: (word) => setDraft((d) => ({ ...d, word })),
    setNote: (note) => setDraft((d) => ({ ...d, note: note.slice(0, MAX_MARK_NOTE) })),
    cancel: () => unsaved.guard(reset),
    save: () => {
      const word = draft.word;
      if (!word) return Promise.resolve();
      return run("save", () => saveMark(studioId!, timeKey, word, draft.note, signer!), reset);
    },
    keep: () => {
      if (!mark) return Promise.resolve();
      return run("keep", () => keepMark(studioId!, mark, signer!), () => {});
    },
    askRemove: () => {
      setFailed(null);
      setConfirmingRemove(true);
    },
    dontRemove: () => setConfirmingRemove(false),
    remove: () =>
      run("remove", () => removeMark(studioId!, timeKey), () => {
        setConfirmingRemove(false);
        reset();
      }),
  };
}
