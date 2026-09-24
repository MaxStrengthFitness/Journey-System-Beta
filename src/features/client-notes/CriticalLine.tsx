/**
 * THE CRITICAL LINE — "Critical · Leg Press: stop at 90° at the bottom turn."
 *
 * Client codex, Sep 2026. On the profile's Notes & Profile tab a critical
 * note is drawn in full ONCE, in Notes' Open zone. Every other page (FORD,
 * Body & Pulse, Goals & Focus, Story, Account) shows this one red line under
 * the sub-toggle instead, with a button to the note; Notes shows it only when
 * a filter is hiding a critical note. The mockup's complaint it answers: one
 * critical note was being drawn up to four times on the tab.
 *
 * The rules it keeps (the words are `criticalLineOf`, record-selectors.ts):
 *  - The briefing's selection: `criticalEntries` — critical, unresolved and
 *    mattering today — so the line and the pre-session briefing can never
 *    disagree about what is critical.
 *  - It ignores dismissals. "No need to remind me" quietens one trainer's
 *    briefing; the record never hides a note.
 *  - Whole sentences, never cut and never "…". The line wraps instead, and
 *    the machine name is printed in full.
 *  - A failed read is not "nothing critical": with `failed`, it says a
 *    critical note may be missing, rather than drawing nothing.
 *
 * Notes owns this component (INTEGRATION: one critical-line component, not a
 * second one in the codex kit). It imports nothing from the codex, and its
 * look is its own small stylesheet, read by the codex's scale test.
 */
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { Machine } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { NoteThread } from "./threads";
import { criticalLineOf } from "./record-selectors";
import "./critical-line.css";

/** What the line says when the notes could not all be read. */
export const CRITICAL_LINE_FAILED = "Notes couldn't be loaded, so a critical note may be missing.";

export interface CriticalLineProps {
  /** The journal hook's `criticalEntries`, in its order (newest first). */
  criticalEntries: readonly JournalEntry[];
  /** The journal's threads, so the button opens the whole thread. */
  threads?: readonly NoteThread[] | null;
  machines: readonly Pick<Machine, "id" | "name">[];
  /** Go to the note: the shell opens Notes at `noteAnchor(threadId)`. */
  onOpen: (threadId: string) => void;
  /** The button's words. "Open the note", or "Open the notes" when there are more. */
  actionLabel?: string;
  /** The notes read failed (`journal.loadState.notes === "failed"`). */
  failed?: boolean;
}

export function CriticalLine({
  criticalEntries,
  threads,
  machines,
  onOpen,
  actionLabel,
  failed = false,
}: CriticalLineProps) {
  const line = useMemo(() => criticalLineOf(criticalEntries, threads, machines), [criticalEntries, threads, machines]);

  if (!line) {
    if (!failed) return null;
    return (
      <aside className="nx-critline" data-state="failed" aria-label="Critical notes" data-testid="critical-line">
        <AlertTriangle className="nx-critline__icon" aria-hidden />
        <p className="nx-critline__text">{CRITICAL_LINE_FAILED}</p>
      </aside>
    );
  }

  const several = line.more > 0;
  const label = actionLabel ?? (several ? "Open the notes" : "Open the note");
  return (
    <aside
      className="nx-critline"
      data-state="critical"
      aria-label={several ? "Critical notes" : "Critical note"}
      data-testid="critical-line"
    >
      <AlertTriangle className="nx-critline__icon" aria-hidden />
      <p className="nx-critline__text">
        <b className="nx-critline__tag">Critical ·</b>{" "}
        {line.machineName ? (line.text ? `${line.machineName}: ` : line.machineName) : null}
        {line.text}
        {several ? (
          <span className="nx-critline__more">
            {" "}· and {line.more} more critical {line.more === 1 ? "note" : "notes"}
          </span>
        ) : null}
      </p>
      <button type="button" className="nx-critline__btn" onClick={() => onOpen(line.thread.id)}>
        {label}
      </button>
      {failed ? <p className="nx-critline__failed">{CRITICAL_LINE_FAILED}</p> : null}
    </aside>
  );
}
