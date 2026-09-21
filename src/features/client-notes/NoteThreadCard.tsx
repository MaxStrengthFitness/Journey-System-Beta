/**
 * A THREAD ON SCREEN — the note, then everything that happened to it.
 *
 * Notes round, Sep 2026. The root renders as the card it always was
 * (`JournalEntryCard`); underneath it hangs the spine — the updates, oldest
 * first, so the story reads top to bottom the way it happened.
 *
 * Two actions, and the wording is the decision:
 *   "Add an update"  is the ordinary one, and it is offered even on a note
 *                    today contradicted. A trainer whose client did the
 *                    overhead movement fine adds "performed overhead, seemed
 *                    okay" — see threads.ts for why closing would be worse.
 *   "All healed up"  closes the thread. Any trainer may (AJ, Sep 20), and
 *                    "It's back" reopens it, because a shoulder that flares
 *                    again is ordinary.
 *
 * A thread with no updates shows no spine and no toggle — it is a note, and
 * it should look like one until something happens to it.
 */
import React, { useState } from "react";
import { ChevronDown, CornerDownRight, Check, RotateCcw, Plus } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import type { Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { relativeDay, toDate } from "../../types/journal";
import { JournalEntryCard } from "../../components/journal/JournalEntryCard";
import type { JournalAuthor } from "../../hooks/useClientJournal";
import { addThreadUpdate, closeThread, reopenThread } from "./thread-write";
import { updateCountLabel, type NoteThread } from "./threads";

export interface NoteThreadCardProps {
  /** React 19 types require key to be declared on the props type. */
  key?: React.Key;
  thread: NoteThread;
  machines: Machine[];
  /** Who is writing. Null makes the thread read-only — no update, no close. */
  author?: JournalAuthor | null;
  onArchive?: (entry: JournalEntry) => void;
  onResolve?: (entry: JournalEntry, resolved: boolean) => void;
  /** Start with the spine open. The briefing opens what it is pointing at. */
  defaultOpen?: boolean;
}

const whenOf = (entry: JournalEntry): string => {
  const d = toDate(entry.occurredAt);
  return d ? relativeDay(d) : "";
};

export function NoteThreadCard({
  thread,
  machines,
  author = null,
  onArchive,
  onResolve,
  defaultOpen = false,
}: NoteThreadCardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const { root, updates, isResolved } = thread;
  // An imported record is somebody else's; we do not write onto it.
  const canWrite = !!author && !root.isLegacy;
  const countLabel = updateCountLabel(thread);

  const save = async () => {
    if (!author || !text.trim() || busy) return;
    setBusy(true);
    try {
      await addThreadUpdate(root, author, text, { origin: "profile" });
      setText("");
      setComposing(false);
      setOpen(true);
      toastSuccess("Added to the thread.");
    } catch {
      toastError("Could not add that update. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleResolved = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      if (isResolved) {
        await reopenThread(root.id);
        toastSuccess("Thread reopened.");
      } else {
        await closeThread(root.id);
        toastSuccess("Thread closed. It stays in the notes.");
      }
    } catch {
      toastError("Could not change that thread. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nt-thread" data-testid={`thread-${root.id}`}>
      <JournalEntryCard
        entry={root}
        machines={machines}
        onArchive={root.isLegacy ? undefined : onArchive}
        onResolve={root.isLegacy ? undefined : onResolve}
      />

      {updates.length > 0 && (
        <button
          type="button"
          className="nt-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={`h-3.5 w-3.5 nt-chev${open ? " nt-chev--open" : ""}`} aria-hidden />
          {countLabel}
          <span className="nt-muted">· last {whenOf(updates[updates.length - 1]).toLowerCase()}</span>
        </button>
      )}

      {open && updates.length > 0 && (
        <ol className="nt-spine" data-testid={`spine-${root.id}`}>
          {updates.map((u) => (
            <li key={u.id} className="nt-update">
              <CornerDownRight className="h-3.5 w-3.5 nt-muted shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="nt-update__body">{u.body}</p>
                <p className="nt-update__by">
                  {u.authorInitials || u.authorName} · {whenOf(u)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {canWrite && (
        <div className="nt-actions">
          {composing ? (
            <div className="nt-composer">
              <textarea
                className="nc-input"
                rows={2}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What happened? — it joins this note rather than starting a new one."
                aria-label="Add an update to this note"
              />
              <div className="nt-composer__row">
                <button
                  type="button"
                  className="nc-btn nc-btn--primary"
                  disabled={!text.trim() || busy}
                  onClick={save}
                >
                  Add it
                </button>
                <button
                  type="button"
                  className="nc-btn nc-btn--quiet"
                  disabled={busy}
                  onClick={() => {
                    setComposing(false);
                    setText("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="nc-btn" onClick={() => setComposing(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add an update
              </button>
              <button
                type="button"
                className="nc-btn nc-btn--quiet"
                disabled={busy}
                onClick={toggleResolved}
              >
                {isResolved ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> It&rsquo;s back
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden /> All healed up
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
