/**
 * CHANGE A PERSON'S ROLE — from a studio's Team on the Admins dashboard, or
 * from the administrators on Machinery → Activity.
 *
 * A consequential act, so it asks, and says what will happen before it is
 * saved (the Admins room's confirmation rules). The write is the one field,
 * `role` on trainers/{id}, which the rules let an administrator write for
 * anyone; the role reaches the person's token the next time they sign in or
 * within the hour (syncTrainerClaims). Then one line goes into the Activity
 * record (role-change.ts says which kind), after the change has landed —
 * the record never holds a change that didn't happen.
 */
import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { UserCog, X } from "lucide-react";
import { db } from "../../../firebase";
import type { Trainer, UserRole } from "../../../types";
import { AdminButton, AdminField, AdminNotice, AdminSelect } from "../../admin/primitives";
import { logActivity } from "../activity/log-activity";
import { roleChangeRecord, roleChoicesFor, roleConsequences, roleLabel } from "./role-change";

export interface RoleDialogProps {
  /** Who, or null while the dialog is shut. */
  person: Trainer | null;
  /** The studio page it was opened from (null on Activity), for the record. */
  studioId: string | null;
  studioName?: string | null;
  /** The signed-in administrator's name, for the record. */
  byName: string;
  onClose: () => void;
  /** After the role is saved: the dashboard reads the people again. */
  onSaved?: () => void | Promise<void>;
}

/** Shut while there is nobody; opened fresh for each person, so the picker starts on their role. */
export function RoleDialog(props: RoleDialogProps) {
  if (!props.person) return null;
  return <RoleDialogOpen key={props.person.id} {...props} person={props.person} />;
}

function RoleDialogOpen({ person, studioId, studioName, byName, onClose, onSaved }: RoleDialogProps & { person: Trainer }) {
  const [role, setRole] = useState<string>(person.role ?? "LifeTransformer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const name = person.fullName || "This person";
  const changed = role !== (person.role ?? "");

  const save = async () => {
    if (!changed) return;
    setBusy(true);
    setError(null);
    try {
      await updateDoc(doc(db, "trainers", person.id), { role: role as UserRole });
      const record = roleChangeRecord({ personName: name, from: person.role, to: role, studioId, studioName });
      // Awaited (it never throws) so a record read straight after shows the line.
      await logActivity({ ...record, byName });
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(`Couldn't change the role: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="adm-dialog" role="alertdialog" aria-modal="true" aria-label={`Change ${name}'s role`}>
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">Change {name}&apos;s role</h3>
          <p className="adm-dialog__text">Now: {roleLabel(person.role)}.</p>
          <AdminField label="Role" htmlFor="hq-role-choice">
            <AdminSelect id="hq-role-choice" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
              {roleChoicesFor(person.role).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          {changed ? (
            <ul className="adm-dialog__text hq-consequences">
              {roleConsequences({ personName: name, from: person.role, to: role }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose} disabled={busy}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Cancel
          </AdminButton>
          <AdminButton variant="primary" onClick={() => void save()} disabled={!changed} busy={busy}>
            <UserCog className="w-3.5 h-3.5" aria-hidden="true" />
            Save the role
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
