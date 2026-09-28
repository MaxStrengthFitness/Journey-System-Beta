import { useEffect, useRef, useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { MAX_MARK_NOTE, type MarkWord, type OpeningsMark } from "../marks";
import type { TimeKey } from "../rows";
import { keepMark, removeMark, saveMark, type MarkSigner } from "./marks-store";
import { markLabel } from "./mark-words";

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
 * ("the mark on Monday 8:00 AM"): the app's navigation, My Studio's sections
 * and Openings' parts ask before they would lose it, and the form's own
 * Cancel asks too. It is not dirty while its save is on its way.
 *
 * Mount one per time (the sheet keys it by the time), so a note typed for
 * Monday 8:00 can never be saved onto another time.
 */

export type MarkAction = "save" | "keep" | "remove";

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
  /** The write that last failed, if any. */
  failed: MarkAction | null;
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
const draftOf = (mark: OpeningsMark | null): MarkDraft => (mark ? { word: mark.mark, note: mark.note } : EMPTY);

export function useMarkThisTime({ studioId, timeKey, mark, signer }: MarkThisTimeInput): MarkThisTime {
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<MarkDraft>(EMPTY);
  const [draft, setDraft] = useState<MarkDraft>(EMPTY);
  const [busy, setBusy] = useState<MarkAction | null>(null);
  const [failed, setFailed] = useState<MarkAction | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // A write that finishes after the sheet has closed sets nothing.
  const live = useRef(true);
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
    setBusy(action);
    setFailed(null);
    try {
      await write();
      if (live.current) done();
    } catch (err) {
      console.warn(`[openings] the mark couldn't be ${action === "save" ? "saved" : action === "keep" ? "kept" : "removed"}:`, err);
      if (live.current) setFailed(action);
    } finally {
      if (live.current) setBusy(null);
    }
  };

  return {
    editing,
    draft,
    dirty,
    busy,
    failed,
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
