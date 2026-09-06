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
 */

import React, { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
import { buildClone, isPlainAdoption, pruneOverrides } from "./clone";

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
  catalog?: MachineCatalogEntry;
  entry?: StudioMachineRosterEntry;
  onClose: () => void;
}) {
  const { success: toastSuccess } = useToast();
  const existingOverrides =
    entry && entry.source === "catalog" ? (entry.overrides ?? {}) : {};

  const [localName, setLocalName] = useState(
    (existingOverrides.name as string | undefined) ?? "",
  );
  const [notes, setNotes] = useState(entry?.studioNotes ?? "");
  const [serialNumber, setSerialNumber] = useState(
    entry?.unit?.serialNumber ?? "",
  );
  const [manufacturer, setManufacturer] = useState(
    entry?.unit?.manufacturer ?? "",
  );
  const [saving, setSaving] = useState(false);

  const preview = pruneOverrides(catalog ?? {}, {
    ...(localName.trim() ? { name: localName.trim() } : {}),
  } as any);

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildClone({
        studioId,
        catalogId: machineId,
        catalog: catalog ?? {},
        local: {
          localName,
          notes,
          serialNumber,
          manufacturer,
        },
        authorUid: auth.currentUser?.uid ?? null,
      });
      await setDoc(
        doc(db, "studios", studioId, "roster", machineId),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      );
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
            <AdminField
              label="Notes about this unit"
              wide
              hint="Seat replacements, a sticky pin, a pad that needs the footstool — what a trainer walking up should know."
            >
              <AdminTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Seat replaced March 2026. Pin sticks on the 90lb stack."
              />
            </AdminField>
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
