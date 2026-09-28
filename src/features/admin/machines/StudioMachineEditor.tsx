import { useMemo, useState } from "react";
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import type {
  MachineCatalogEntry,
  MachineDefinition,
  StudioMachineRosterEntry,
} from "../../../types/machines";
import { studioMachineId } from "../../../types/machines";
import type { EditScope } from "../../../lib/machine-template";
import { definitionFieldsOnly, describeFields, scopeOverrides } from "../../../lib/machine-template";
import { pruneOverrides } from "../equipment/clone";
import { MachineEditor } from "./editor/MachineEditor";
import { definitionOf, emptyMachineDefinition, stripUndefined } from "./definition-defaults";
import { useMachineModels } from "../../machine-codex/models-store";

/**
 * EDITING A STUDIO'S OWN MACHINE.
 *
 * Round: Machine authoring, Sep 2026. AJ: "when you're looking at your own
 * floor for your studio, it doesn't seem as if we can edit the machine."
 *
 * He was right, twice over, and neither was a missing button — the doors were
 * never cut:
 *
 *  - A CUSTOM machine, once saved, could not be edited at all. saveCustom()
 *    refused an existing name and nothing anywhere reopened the form on an
 *    existing entry, so the only way to change a studio's own machine was to
 *    delete it and retype sixty fields.
 *  - A CATALOG machine's local copy could override exactly one field, its
 *    name. LocalSetupDialog was the app's only writer of `overrides`, and it
 *    wrote four things. Meanwhile the type allowed any field, the resolver
 *    merged any field, and MachineDefinitionForm had an `inherited` prop
 *    built for precisely this that no caller ever passed.
 *
 * All three cases land here, and the difference between them is only where
 * the write goes.
 */

export interface StudioMachineEditorProps {
  studioId: string;
  studioName?: string;
  /** The roster entry being edited. Absent when adding a new custom machine. */
  entry?: StudioMachineRosterEntry;
  /** The resolved definition for an existing entry. */
  resolved?: MachineDefinition;
  /** The catalog entry an entry is based on, for a catalog-sourced machine. */
  catalogEntry?: MachineCatalogEntry;
  /** Every catalog machine, for the "most like" picker on a new custom one. */
  catalog: MachineCatalogEntry[];
  /** Ids already on this floor, so a new custom name cannot collide. */
  rosteredIds: Set<string>;
  /** "studio" for a studio leader, "admin" for corporate inside a location. */
  scope: EditScope;
  onBack: () => void;
  backLabel: string;
  /** The unit card — serial, manufacturer, notes. */
  unit?: React.ReactNode;
}

export function StudioMachineEditor({
  studioId,
  studioName,
  entry,
  resolved,
  catalogEntry,
  catalog,
  rosteredIds,
  scope,
  onBack,
  backLabel,
  unit,
}: StudioMachineEditorProps) {
  const { success: toastSuccess } = useToast();
  const isNew = !entry;
  const isCustom = !entry || entry.source === "custom";

  const value = useMemo(
    () => resolved ?? (entry ? definitionOf(entry) : emptyMachineDefinition()),
    [resolved, entry],
  );

  // Lineage for a brand-new custom machine. Nothing is inherited through it —
  // it exists so a location's bespoke leg press still rolls up against every
  // other leg press instead of becoming its own one-studio leaderboard.
  const [basedOn, setBasedOn] = useState<string>(
    entry && "basedOn" in entry ? (entry.basedOn ?? "") : "",
  );

  // Minted once, from the name it was created with, and never again. machineId
  // is a foreign key in exerciseLogs, clientMachineSettings and routines, all
  // queried ACROSS studios — re-minting it on a rename would orphan every set
  // ever logged on the machine and split its leaderboard in two.
  const [existingId] = useState(() => entry?.machineId ?? null);

  // The model records, for "Which model this unit is" (Codex R2).
  const { models } = useMachineModels();
  const movementId = catalogEntry?.id ?? (basedOn || undefined);

  const save = async (
    patch: Partial<MachineDefinition>,
    draftIn: MachineDefinition,
  ) => {
    const name = (draftIn.name ?? "").trim();
    if (!name) throw new Error("Give the machine a name first.");

    // THE UNIT'S MODEL lives on the roster entry itself (`modelId`), never in
    // the definition or its overrides: the definition's own `modelId` is the
    // catalog's reference unit. Deleted when cleared, so "not recorded" is
    // absent rather than "".
    const { modelId: pickedModel, ...draft } = draftIn;
    const unitModel = pickedModel?.trim() || undefined;
    const modelWrite = (updating: boolean) =>
      unitModel ? { modelId: unitModel } : updating ? { modelId: deleteField() } : {};

    if (isCustom) {
      const machineId = existingId ?? studioMachineId(studioId, name);
      if (!existingId && rosteredIds.has(machineId)) {
        throw new Error(`${studioName ?? "This studio"} already has a machine with that name.`);
      }
      const ref = doc(db, "studios", studioId, "roster", machineId);
      const body = {
        machineId,
        studioId,
        source: "custom" as const,
        ...(basedOn ? { basedOn } : {}),
        status: entry?.status ?? ("active" as const),
        // A custom machine inherits nothing, so its definition is stored
        // whole rather than as a diff — its own fields only (the draft is a
        // resolved machine and carries the floor's bookkeeping too), and
        // with nothing `undefined` in it, which Firestore refuses.
        definition: stripUndefined(definitionFieldsOnly(draft)),
        ...modelWrite(!!existingId),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      };
      if (existingId) await updateDoc(ref, body);
      else await setDoc(ref, body);

      toastSuccess(
        existingId
          ? `${name} saved for ${studioName ?? "this studio"}.`
          : `${name} added to ${studioName ?? "this studio"}.`,
      );
      if (!existingId) onBack();
      return;
    }

    // A catalog machine's local copy. The stored value is the DIFFERENCE from
    // the standard, computed from the whole draft rather than from this
    // sitting's patch, so overrides made earlier survive.
    if (!catalogEntry) throw new Error("This machine's catalog entry is missing.");
    const scoped = scopeOverrides(scope, draft as Partial<MachineDefinition>);
    const overrides = stripUndefined(pruneOverrides(catalogEntry, scoped));

    const ref = doc(db, "studios", studioId, "roster", catalogEntry.id);
    const body = {
      machineId: catalogEntry.id,
      studioId,
      source: "catalog" as const,
      basedOn: catalogEntry.id,
      status: entry?.status ?? ("active" as const),
      // REPLACED, never merged. Firestore's merge is deep for maps, so a
      // setDoc({overrides}, {merge:true}) would keep a key the studio has
      // just reverted — "use the standard" would appear to work and then not.
      overrides,
      ...modelWrite(!!entry),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    };
    if (entry) await updateDoc(ref, body);
    else await setDoc(ref, body);

    const changedFields = Object.keys(overrides) as (keyof MachineDefinition)[];
    toastSuccess(
      changedFields.length === 0
        ? `${name} now follows the Max Strength standard exactly.`
        : `${name} saved. ${
            studioName ?? "This studio"
          } differs from the standard on ${describeFields(changedFields)}; everything else still follows it.`,
    );
  };

  return (
    <MachineEditor
      value={value}
      standard={catalogEntry ? definitionOf(catalogEntry) : undefined}
      scope={scope}
      whose={
        isCustom
          ? `${studioName ?? "This studio"}'s own machine`
          : `${studioName ?? "This studio"}'s copy of the Max Strength standard`
      }
      backLabel={backLabel}
      onBack={onBack}
      onSave={save}
      isNew={isNew}
      movementId={movementId}
      models={models}
      unit={
        <>
          {isNew && (
            <div className="adm-field adm-field--wide">
              <label className="adm-label" htmlFor="based-on">
                Which Max Strength machine is this most like?
              </label>
              <select
                id="based-on"
                className="adm-select"
                value={basedOn}
                onChange={(e) => setBasedOn(e.target.value)}
              >
                <option value="">None — genuinely novel equipment</option>
                {catalog
                  .filter((c) => c.status === "active")
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className="adm-hint">
                Nothing is inherited from this. It only lets network reporting
                compare your unit against the same movement at other locations
                — without it, your leg press becomes its own one-studio
                leaderboard.
              </p>
            </div>
          )}
          {unit}
        </>
      }
    />
  );
}
