/**
 * THE DANGER ZONE'S QUESTION — type the studio's name to delete it.
 *
 * Round: the Admins room (Sep 28 2026), the confirmation rules: a reversible
 * act is done and offers Undo; a consequential one asks, listing what will
 * happen; a DESTRUCTIVE one asks you to type the name. Deleting a studio is
 * the one destructive act on the Admins dashboard: it cannot be undone, and
 * the studio's clients, sessions and bookings stay behind with no studio to
 * belong to. Typing the name is what stops a tap on the wrong row.
 *
 * Drawn with the admin kit's dialog classes (admin.css), so it looks like
 * every other question on the dashboard. Escape and the scrim cancel.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { NAME_SEARCH_PROPS } from "../../../lib/name-search-input";
import { AdminButton } from "../../admin/primitives";

/** Does what was typed name the studio? Spaces at the ends and letter case don't matter; every letter does. */
export function namesStudio(typed: string, name: string): boolean {
  const a = typed.trim().toLowerCase();
  return a.length > 0 && a === name.trim().toLowerCase();
}

export function DeleteStudioDialog({
  open,
  studioName,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  studioName: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const ready = namesStudio(typed, studioName);

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="adm-dialog" role="alertdialog" aria-modal="true" aria-label={`Delete ${studioName}?`}>
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">Delete {studioName}?</h3>
          <ul className="adm-dialog__text hq-consequences">
            <li>{studioName} is taken out of every franchise that lists it, then deleted.</li>
            <li>
              Its clients, sessions and bookings are <b>not</b> deleted. They stay behind with no studio to belong to.
            </li>
            <li>This can&apos;t be undone.</li>
          </ul>
          <label className="adm-label" htmlFor="delete-studio-name">
            Type {studioName} to delete it
          </label>
          <input
            ref={input}
            id="delete-studio-name"
            className="adm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready && !busy) onConfirm();
            }}
            {...NAME_SEARCH_PROPS}
          />
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Keep it
          </AdminButton>
          <AdminButton variant="danger" onClick={onConfirm} disabled={!ready} busy={busy}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Delete {studioName}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
