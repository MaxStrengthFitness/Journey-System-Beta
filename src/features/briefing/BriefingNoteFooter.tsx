/**
 * The line under a note on the briefing: what has happened to it lately, and
 * the way to stop being reminded about it.
 *
 * Notes round, Sep 2026. Two things, and they belong together:
 *
 *   THE LATEST UPDATE is the whole reason the briefing shows threads rather
 *   than notes. "No overhead" is what the note says; "MRI on the 31st" is
 *   what changed, and it is the part a trainer walking in has not read.
 *
 *   "NO NEED TO REMIND ME" is per trainer, private, and undone by the next
 *   update (client-notes/dismissals.ts). It is offered on every item,
 *   critical ones included, because AJ's case for it was never "I've read
 *   this" alone — it was "that's not my part of this client".
 */
import { BellOff } from "lucide-react";
import { latestUpdateLine } from "./briefing-notes";
import { updateCountLabel, type NoteThread } from "../client-notes/threads";

export interface BriefingNoteFooterProps {
  thread: NoteThread;
  /** Absent while nobody is signed in — the line still reads, it just cannot be hushed. */
  onDismiss?: (thread: NoteThread) => void;
}

export function BriefingNoteFooter({ thread, onDismiss }: BriefingNoteFooterProps) {
  const latest = latestUpdateLine(thread);
  const count = updateCountLabel(thread);
  if (!latest && !onDismiss) return null;

  return (
    <div className="br__notefoot" data-testid={`notefoot-${thread.id}`}>
      {latest && (
        <p className="br__notefoot-latest">
          <span className="br__notefoot-kicker">Latest{count ? ` · ${count}` : ""}</span>
          {latest}
        </p>
      )}
      {onDismiss && (
        <button
          type="button"
          className="br__notefoot-hush"
          onClick={() => onDismiss(thread)}
        >
          <BellOff className="h-3.5 w-3.5" aria-hidden /> No need to remind me
        </button>
      )}
    </div>
  );
}
