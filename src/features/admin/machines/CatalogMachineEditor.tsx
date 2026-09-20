import { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import { MachineEditor } from "./editor/MachineEditor";
import { definitionOf, emptyMachineDefinition } from "./definition-defaults";

/**
 * EDITING THE STANDARD — the Max Strength catalog entry itself.
 *
 * Round: Machine authoring, Sep 2026.
 *
 * Admin-only (isSuperAdmin in firestore.rules), because every field a studio
 * has not deliberately overridden is live-inherited: a correction here
 * reaches every location, which is the whole point and also the reason a
 * franchise owner cannot make one.
 *
 * There is no `standard` prop. This IS the standard, so there is nothing to
 * inherit from and nothing to revert to — the editor renders without any of
 * its inheritance marks.
 */

/** 'LEG PRESS' -> 'm-leg-press'. The existing catalog id convention. */
function catalogId(name: string): string {
  return (
    "m-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
  );
}

export function CatalogMachineEditor({
  machine,
  existingIds,
  catalogSize,
  onBack,
}: {
  /** Absent for a new machine. */
  machine?: MachineCatalogEntry;
  existingIds: string[];
  catalogSize: number;
  onBack: () => void;
}) {
  const { success: toastSuccess } = useToast();
  const isNew = !machine;

  const value = useMemo(
    () => (machine ? definitionOf(machine) : emptyMachineDefinition()),
    [machine],
  );

  // A new machine's id is minted from its name ONCE, on create. It is never
  // re-minted on a later rename: machineId is a foreign key in exerciseLogs,
  // clientMachineSettings and routines, all queried across studios, so
  // changing it would orphan every set ever logged against the machine.
  const [mintedId] = useState(() => machine?.id ?? null);

  const save = async (patch: Partial<MachineDefinition>) => {
    const name = (patch.name ?? value.name ?? "").trim();
    if (isNew && !name) {
      throw new Error("Give the machine a name before creating it.");
    }
    const id = mintedId ?? catalogId(name);
    if (isNew && existingIds.includes(id)) {
      throw new Error(`A machine with the id ${id} already exists.`);
    }

    await setDoc(
      doc(db, "machines", id),
      {
        // On create the whole definition goes in; on an edit only the diff,
        // so a field nobody touched is not rewritten with what it already
        // said and its updatedAt does not move.
        ...(isNew ? value : {}),
        ...patch,
        id,
        status: machine?.status ?? "active",
        defaultOrder: machine?.defaultOrder ?? (catalogSize + 1) * 10,
        inStandardSet: machine?.inStandardSet ?? true,
        schemaVersion: 1,
        ...(isNew
          ? { createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid ?? null }
          : {}),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      },
      { merge: true },
    );

    toastSuccess(
      isNew
        ? `${name} added to the catalog. Every studio can now put it on their floor.`
        : `${name} saved. Every floor that has not overridden these fields follows it.`,
    );
    if (isNew) onBack();
  };

  return (
    <MachineEditor
      value={value}
      scope="catalog"
      whose="The Max Strength standard"
      backLabel="Catalog"
      onBack={onBack}
      onSave={save}
      isNew={isNew}
    />
  );
}
