/**
 * READ VIEW FIRST, EDIT ON DEMAND.
 *
 * Client codex, Sep 2026. The old record showed every field as an input box,
 * all the time, so reading a client meant reading a form. A codex card shows
 * what is on file as sentences; an Edit button opens the editor in place.
 *
 * The editor does not save. Its fields write to the shell's record form, and
 * the ONE Save bar at the bottom of the tab saves everything together — so
 * "Done" only closes the editor, and the edits stay unsaved (and the card
 * says "Unsaved") until the trainer saves or discards them on the bar. Every
 * open editor closes when `revision` changes, which the form bumps on a save
 * and on a discard.
 *
 * A reader who may not edit this record (a cross-train studio, a franchise
 * owner who does not work there — the same answer as the clients/{id} update
 * rule) gets the read view and no Edit button, rather than an editor the
 * database would refuse.
 *
 * `useReadEdit` is the same behaviour for a card that draws its own frame
 * (FORD's pillar cards): the open state, the reset on `revision`, and the
 * rule that a reader who cannot edit is never shown an editor.
 */
import { useState, type ReactNode } from "react";
import { Check, Pencil, type LucideIcon } from "lucide-react";
import type { RecordAnchor } from "../../client-profile/profile-nav";
import { Btn, CardHead, Chip, Source, anchorProps, cls } from "./primitives";

export interface ReadEditState {
  /** The editor is showing. Always false when the reader cannot edit. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export function useReadEdit({ canEdit, revision }: { canEdit: boolean; revision: number }): ReadEditState {
  const [editing, setEditing] = useState(false);
  const [seenRevision, setSeenRevision] = useState(revision);
  // A save or a discard closes every editor. Adjusting state from a changed
  // prop during render (React's documented pattern) rather than in an effect,
  // so the card never paints one frame still open after a save.
  if (seenRevision !== revision) {
    setSeenRevision(revision);
    setEditing(false);
  }
  const open = canEdit && editing;
  return {
    open,
    setOpen: (next: boolean) => setEditing(next),
    toggle: () => setEditing((was) => !was),
  };
}

/** The Edit / Done button, for a card that draws its own frame. */
export function EditButton({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  /** What is being edited, for a screen reader: "Edit Occupation". */
  label?: string;
}) {
  return (
    <Btn
      variant={open ? "live" : "default"}
      icon={open ? Check : Pencil}
      aria-expanded={open}
      aria-label={label ? `${open ? "Done editing" : "Edit"} ${label}` : undefined}
      onClick={onToggle}
    >
      {open ? "Done" : "Edit"}
    </Btn>
  );
}

export interface ReadEditProps {
  /** The card's heading (its eyebrow). */
  label: string;
  icon?: LucideIcon;
  /** May this reader change the record? (codexAccess().canEdit) */
  canEdit: boolean;
  /** Does this card hold an unsaved change? */
  dirty: boolean;
  /** The record form's revision; a change closes the editor. */
  revision: number;
  read: ReactNode;
  edit: ReactNode;
  /** An anchor from RECORD_ANCHORS, when a door may land on this card. */
  id?: RecordAnchor;
  /** More buttons in the head, before Edit. */
  actions?: ReactNode;
  source?: ReactNode;
  className?: string;
}

/** A Card that reads first and edits on demand. */
export function ReadEdit({ label, icon, canEdit, dirty, revision, read, edit, id, actions, source, className }: ReadEditProps) {
  const { open, toggle } = useReadEdit({ canEdit, revision });
  return (
    <section className={cls("cx-card", className)} data-editing={open ? "" : undefined} {...anchorProps(id)}>
      <CardHead
        eyebrow={label}
        icon={icon}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={
          actions || canEdit ? (
            <>
              {actions}
              {canEdit ? <EditButton open={open} onToggle={toggle} label={label} /> : null}
            </>
          ) : null
        }
      />
      {open ? <div className="cx-readedit__edit">{edit}</div> : read}
      {source ? <Source>{source}</Source> : null}
    </section>
  );
}
