/**
 * "What is different about OUR one."
 *
 * A studio adopting a catalog machine keeps inheriting every field it does
 * not deliberately change — which is what lets an Academy correction to a
 * clinical warning reach a hundred floors at once. This dialog exists to make
 * the local exceptions explicit and small: a name, a note about the unit, a
 * serial number.
 *
 * The rule it enforces lives in clone.ts: an edit equal to the inherited
 * value is not stored, because storing it would silently freeze that field.
 *
 * And it writes those four fields and nothing else (clone.ts,
 * localSetupUpdate), with updateDoc: a box left blank is deleted, and what
 * the machine is and whether it is in service are never written from here.
 * Until Sep 28 2026 it merged a whole roster document in, which took a
 * studio's own machine off the floor, put a machine that was out of service
 * back in service, and kept anything cleared.
 */

import { useState } from "react";
import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../../types/machines";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import {
  AdminButton,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminTextarea,
} from "../primitives";
import { isPlainAdoption, localSetupUpdate, pruneOverrides } from "./clone";
import "../admin.css";

export function LocalSetupDialog({
  studioId,
  machineId,
  catalogName,
  catalog,
  entry,
  onClose,
}: {
  studioId: string;
  machineId: string;
  catalogName: string;
  /** The catalog machine it follows, when the catalog has it. */
  catalog?: MachineCatalogEntry | null;
  /** The roster entry: the dialog edits one, it never creates one. */
  entry: StudioMachineRosterEntry;
  onClose: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const existingOverrides =
    entry.source === "catalog" ? (entry.overrides ?? {}) : {};

  const [localName, setLocalName] = useState(
    (existingOverrides.name as string | undefined) ?? "",
  );
  const [notes, setNotes] = useState(entry.studioNotes ?? "");
  // Only an old note is shown here; new ones go in the floor's notes.
  const [hadUnitNote] = useState(Boolean(entry.studioNotes?.trim()));
  const [serialNumber, setSerialNumber] = useState(
    entry.unit?.serialNumber ?? "",
  );
  const [manufacturer, setManufacturer] = useState(
    entry.unit?.manufacturer ?? "",
  );
  const [saving, setSaving] = useState(false);

  const preview = pruneOverrides(catalog ?? {}, {
    ...(localName.trim() ? { name: localName.trim() } : {}),
  } as any);

  const save = async () => {
    const update = localSetupUpdate({
      entry,
      catalog: catalog ?? {},
      local: { localName, notes, serialNumber, manufacturer },
    });
    if (update.ok === false) {
      toastError(update.reason);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "studios", studioId, "roster", machineId), {
        ...update.set,
        ...Object.fromEntries(update.clear.map((field) => [field, deleteField()])),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(`${catalogName} updated for this studio.`);
      onClose();
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `studios/${studioId}/roster/${machineId}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // A studio's own machine, or a copy of another studio's, has no catalog
  // machine behind it, and its name lives in its own definition. Neither door
  // offers Local set-up on one; this is the net under them, because saving
  // here once rewrote such a machine as a copy of a catalog machine that does
  // not exist, and the floor dropped it (Sep 28 2026).
  if (entry.source === "custom") {
    return (
      <div
        className="adm-scrim adm"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="adm-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Local setup for ${catalogName}`}
          style={{ maxWidth: 560 }}
        >
          <div className="adm-dialog__body">
            <h3 className="adm-dialog__title">{catalogName}</h3>
            <p className="adm-dialog__text">
              This is the studio&apos;s own machine rather than a Max Strength
              one, so there is nothing to set up locally. Change its name and
              set-up with Edit on the floor list. What a trainer walking up
              should know goes in the floor&apos;s notes.
            </p>
          </div>
          <div className="adm-dialog__foot">
            <AdminButton variant="primary" onClick={onClose}>
              Close
            </AdminButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Local setup for ${catalogName}`}
        style={{ maxWidth: 560 }}
      >
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">{catalogName}</h3>
          <p className="adm-dialog__text">
            Anything left blank keeps following the catalog, so corrections from
            the Academy still reach this floor.
          </p>

          <AdminGrid>
            <AdminField
              label="What this studio calls it"
              wide
              hint={`Leave blank to keep "${catalogName}".`}
            >
              <AdminInput
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder={catalogName}
              />
            </AdminField>
            <AdminField label="Manufacturer">
              <AdminInput
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Imagine Strength"
              />
            </AdminField>
            <AdminField label="Serial number">
              <AdminInput
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </AdminField>
            {/* Notes about the unit are the floor's dated list since the notes
                round (Oct 3 2026; AJ's answer 2A), on the machine's door and
                its Catalog page. A note written here before stays editable
                so it can be cleared once it is copied into that list, where
                it shows as an earlier note until then. */}
            {hadUnitNote ? (
              <AdminField
                label="The unit's old note"
                wide
                hint="New notes about this unit go in the floor's notes, with dates and updates. This one shows there as an earlier note: copy it into the list, then clear it here."
              >
                <AdminTextarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </AdminField>
            ) : (
              <p className="adm-dialog__text">
                Notes about this unit (a seat replaced, a pin that sticks) go in the floor&apos;s notes on its door and
                Catalog page, where each keeps its date and its updates.
              </p>
            )}
          </AdminGrid>

          {localName.trim() && Object.keys(preview).length === 0 && (
            <AdminNotice tone="info">
              That is the catalog's own name, so it will not be stored as an
              override — which keeps this machine inheriting any future rename.
            </AdminNotice>
          )}

          {isPlainAdoption(preview, { notes, serialNumber, manufacturer }) && (
            <AdminNotice tone="info">
              Nothing local set. This machine follows the catalog exactly.
            </AdminNotice>
          )}
        </div>

        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton variant="primary" busy={saving} onClick={() => void save()}>
            Save local setup
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
