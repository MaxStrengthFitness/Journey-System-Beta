import { useMemo, useState, type ReactNode } from "react";
import { deleteField, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import { GitCompare, Layers } from "lucide-react";
import { StandardMachineSwitch } from "../catalog/StandardMachineSwitch";
import { MachineAliases } from "../catalog/MachineAliases";
import { MachineEditor } from "./editor/MachineEditor";
import { definitionOf, emptyMachineDefinition, stripUndefined } from "./definition-defaults";
import { AdminButton } from "../primitives";
import { useMachineModels } from "../../machine-codex/models-store";

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
 *
 * THE MACHINE'S STANDING (wave 2 of the Machine Catalog room, Sep 28 2026).
 * Above the sections, for a machine that exists: "Standard machine", the
 * switch that marks it as one (AJ: "a machine just needs to be able to be
 * marked as a standard machine, a task only by admins"), written at once and
 * on its own, apart from the definition's save bar, because it is a catalog
 * field and not part of what the machine IS. Under it, for one of the twenty
 * movements, the other names Find knows it by, head office's own among them
 * (`aliases`, ../catalog/MachineAliases.tsx), added and taken off the same
 * way. `notice` adds a host's own lines under those (head office's view in
 * the Catalog says where studios changed the standard there).
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
  onOpenModels,
  onOpenCompare,
  backLabel = "Catalog",
  notice,
}: {
  /** Absent for a new machine. */
  machine?: MachineCatalogEntry;
  existingIds: string[];
  catalogSize: number;
  onBack: () => void;
  /** The models of this movement (Codex R2). Absent: no door to them. */
  onOpenModels?: (movementId: string) => void;
  /** Every studio's differences from this machine (Codex R5). Absent: no door. */
  onOpenCompare?: () => void;
  /** What the back button says it goes to. */
  backLabel?: string;
  /** A host's own lines, under the machine's standing. */
  notice?: ReactNode;
}) {
  const { success: toastSuccess } = useToast();
  const isNew = !machine;
  const { models } = useMachineModels();

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

    // A field cleared to nothing (a Codex leaf emptied) is deleted rather
    // than written as `undefined`, which Firestore refuses; an `undefined`
    // left inside an object is dropped for the same reason.
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      changes[k] = v === undefined ? (isNew ? undefined : deleteField()) : stripUndefined(v);
    }
    const body = stripUndefined({ ...(isNew ? value : {}), ...changes });

    await setDoc(
      doc(db, "machines", id),
      {
        // On create the whole definition goes in; on an edit only the diff,
        // so a field nobody touched is not rewritten with what it already
        // said and its updatedAt does not move.
        ...body,
        id,
        // The catalog's own fields go in once, on create. An edit leaves
        // them alone (wave 2, Sep 28 2026): "Standard machine" and the
        // Standard template write `inStandardSet` themselves, and an edit
        // that re-wrote it from the copy it opened with would undo a switch
        // turned a moment before, in this screen or another.
        ...(isNew
          ? {
              status: "active",
              defaultOrder: (catalogSize + 1) * 10,
              inStandardSet: true,
              createdAt: serverTimestamp(),
              createdBy: auth.currentUser?.uid ?? null,
            }
          : // A document from before `status` existed is active; the lists
            // that offer a machine to a floor read only active ones.
            machine?.status
            ? {}
            : { status: "active" }),
        schemaVersion: 1,
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
      backLabel={backLabel}
      onBack={onBack}
      onSave={save}
      isNew={isNew}
      movementId={machine?.id}
      models={models}
      extraActions={(guard) =>
        machine ? (
          <>
            {onOpenCompare && (
              <AdminButton variant="quiet" onClick={() => guard(onOpenCompare)}>
                <GitCompare className="w-4 h-4" /> Compare
              </AdminButton>
            )}
            {onOpenModels && (
              <AdminButton variant="quiet" onClick={() => guard(() => onOpenModels(machine.id))}>
                <Layers className="w-4 h-4" /> Models
              </AdminButton>
            )}
          </>
        ) : null
      }
      notice={
        machine || notice ? (
          <>
            {machine && <StandardMachineSwitch machine={machine} />}
            {/* Head office's own names for the movement (wave 2): Find knows them. */}
            {machine && <MachineAliases machine={machine} />}
            {notice}
          </>
        ) : undefined
      }
    />
  );
}
