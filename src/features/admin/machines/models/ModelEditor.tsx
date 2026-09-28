import React from "react";
import { ArrowLeft, Layers, Plus, X } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  AdminSelect,
  AdminTextarea,
  SaveBar,
} from "../../primitives";
import { useDirtyForm } from "../../useDirtyForm";
import { useToast } from "../../../../contexts/ToastContext";
import type { MachineCatalogEntry, ModelDial } from "../../../../types/machines";
import { settingFieldKey } from "../../../../types/machines";
import { resolveMachineOrder } from "../../../../data/machine-display-order";
import {
  dialsFromMovement,
  draftOf,
  emptyModelDraft,
  modelIdFor,
  modelLabel,
  modelProblems,
  type ModelDraft,
  type ModelWithId,
} from "../../../machine-codex/models";
import { saveMachineModel } from "../../../machine-codex/models-store";
import "../editor/codex-editor.css";

/**
 * ONE MODEL — a maker's model of an MSF movement (Codex R2, Sep 28 2026).
 *
 * Administrators write it (the catalog is theirs, and a model is the
 * catalog's middle tier); every studio's unit may point at it. The id is
 * minted once from the brand and model on create and never again — it is a
 * foreign key on every unit that names it and in the weekly job's pools —
 * and a dial keeps the key it was saved with, like the movement's own dials,
 * because a unit that takes a model's dials must keep every client's saved
 * values.
 */
export function ModelEditor({
  model,
  catalog,
  movementId,
  existingIds,
  onBack,
}: {
  /** Absent for a new model. */
  model?: ModelWithId;
  catalog: MachineCatalogEntry[];
  /** The movement a new model starts on, when opened from one. */
  movementId?: string;
  existingIds: string[];
  onBack: () => void;
}) {
  const { success: toastSuccess } = useToast();
  const isNew = !model;
  const external = React.useMemo(
    () => (model ? draftOf(model) : emptyModelDraft(movementId ?? "")),
    [model, movementId],
  );
  const [mintedId] = React.useState(() => model?.id ?? null);

  const draftRef = React.useRef<ModelDraft>(external);
  const form = useDirtyForm<ModelDraft>(
    external,
    async () => {
      const draft = draftRef.current;
      const problems = modelProblems(draft);
      if (problems.length) throw new Error(problems[0]);
      const id = mintedId ?? modelIdFor(draft.brand, draft.model);
      if (isNew && existingIds.includes(id)) {
        throw new Error(`A model called ${modelLabel(draft)} is already recorded.`);
      }
      await saveMachineModel(id, draft);
      toastSuccess(
        isNew
          ? `${modelLabel(draft)} recorded. A studio can now say its unit is one.`
          : `${modelLabel(draft)} saved.`,
      );
      if (isNew) onBack();
    },
    { label: model ? modelLabel(model) : "this new model" },
  );
  draftRef.current = form.value;
  const d = form.value;

  const movements = React.useMemo(
    () =>
      catalog
        .filter((c) => c.status !== "retired" || c.id === d.movementId)
        .sort((a, b) => resolveMachineOrder(a.id, a.defaultOrder) - resolveMachineOrder(b.id, b.defaultOrder)),
    [catalog, d.movementId],
  );
  const movement = catalog.find((c) => c.id === d.movementId);

  const setDial = (i: number, patch: Partial<ModelDial>) => {
    const next = [...d.dials];
    next[i] = { ...next[i], ...patch };
    form.setField("dials", next);
  };

  return (
    <AdminScreen className="adm-me">
      <AdminHeader
        icon={<Layers className="w-5 h-5" />}
        title={modelLabel(d) || "New model"}
        subtitle={
          movement
            ? `A model of the ${movement.name}. Its dials and stacks, written once for every unit of it.`
            : "A maker's model of an MSF movement: its dials and stacks, written once for every unit of it."
        }
        actions={
          <AdminButton variant="quiet" onClick={() => form.leave.guard(onBack)}>
            <ArrowLeft className="w-4 h-4" /> Models
          </AdminButton>
        }
      />

      <AdminNotice tone="info">
        Settings pool per model in the weekly count: a seat 4 on one maker&apos;s unit is not a seat
        4 on another&apos;s. Weights keep pooling per movement. A studio says which model its unit
        is on its own machine page.
      </AdminNotice>

      <AdminPanel title="The model">
        <AdminGrid>
          <AdminField label="Brand" htmlFor="model-brand" required>
            <AdminInput
              id="model-brand"
              value={d.brand}
              placeholder="Hoist"
              onChange={(e) => form.setField("brand", e.target.value)}
            />
          </AdminField>
          <AdminField label="Model" htmlFor="model-name" required>
            <AdminInput
              id="model-name"
              value={d.model}
              placeholder="ROC-IT Leg Press"
              onChange={(e) => form.setField("model", e.target.value)}
            />
          </AdminField>
          <AdminField
            label="Which MSF movement it is"
            htmlFor="model-movement"
            required
            hint="Its method is the movement's; the model adds only what is different about the hardware."
          >
            <AdminSelect
              id="model-movement"
              value={d.movementId}
              onChange={(e) => form.setField("movementId", e.target.value)}
            >
              <option value="">Choose a movement</option>
              {movements.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          {mintedId && (
            <AdminField label="Its id" hint="Fixed for good: every unit that names this model uses it.">
              <AdminBadge tone="neutral">{mintedId}</AdminBadge>
            </AdminField>
          )}
        </AdminGrid>
      </AdminPanel>

      <AdminPanel
        title="Its dials"
        subtitle="The dials this model has, the letter on its plate, and where the maker sets them."
        actions={
          d.dials.length === 0 && movement?.settingFields?.length ? (
            <AdminButton variant="quiet" onClick={() => form.setField("dials", dialsFromMovement(movement.settingFields))}>
              <Plus className="w-4 h-4" /> Start from the {movement.name}&apos;s dials
            </AdminButton>
          ) : undefined
        }
      >
        <div className="adm-me__stack">
          {d.dials.length === 0 && <p className="adm-me__empty">No dials recorded</p>}
          {d.dials.map((dial, i) => {
            // A dial with a key keeps it — one saved on this model, or one
            // taken from the movement (so a unit's saved values still match).
            // A new dial's key comes from its name when it is first saved.
            const fixed = !!dial.key;
            const key = dial.key || settingFieldKey(dial.label);
            return (
              <div key={i} className="adm-me__card">
                <div className="adm-me__dialhead">
                  <AdminBadge tone="neutral">{key ? (fixed ? key : `${key} (from its name)`) : "key from its name"}</AdminBadge>
                  <AdminButton
                    variant="ghost"
                    aria-label={`Remove the ${dial.label || "unnamed"} dial`}
                    onClick={() => form.setField("dials", d.dials.filter((_, j) => j !== i))}
                  >
                    <X className="w-4 h-4" /> Remove
                  </AdminButton>
                </div>
                <AdminGrid>
                  <AdminField label="Name">
                    <AdminInput
                      value={dial.label}
                      placeholder="Seat Distance"
                      onChange={(e) => setDial(i, { label: e.target.value })}
                    />
                  </AdminField>
                  <AdminField label="Letter on the plate">
                    <AdminInput
                      value={dial.letter ?? ""}
                      placeholder="S"
                      maxLength={4}
                      onChange={(e) => setDial(i, { letter: e.target.value })}
                    />
                  </AdminField>
                  <AdminField label="Where the maker sets it">
                    <AdminInput
                      value={dial.default ?? ""}
                      placeholder="7"
                      onChange={(e) => setDial(i, { default: e.target.value })}
                    />
                  </AdminField>
                  <AdminField label="Its positions" hint="Comma-separated, when it has a fixed set: 1, 2, 3.">
                    <AdminInput
                      value={(dial.options ?? []).join(", ")}
                      placeholder="1, 2, 3"
                      onChange={(e) =>
                        setDial(i, {
                          options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                        })
                      }
                    />
                  </AdminField>
                </AdminGrid>
              </div>
            );
          })}
          <div>
            <AdminButton
              variant="quiet"
              onClick={() => form.setField("dials", [...d.dials, { key: "", label: "" }])}
            >
              <Plus className="w-4 h-4" /> Add a dial
            </AdminButton>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title="Notes" subtitle="Anything every unit of it shares — an accessory stack, a seat that moves during the rep.">
        <AdminTextarea
          rows={4}
          value={d.notes}
          placeholder="An 18 lb accessory stack; the seat travels with the footplate."
          onChange={(e) => form.setField("notes", e.target.value)}
        />
      </AdminPanel>

      <div className="adm-me__savebar">
        <SaveBar
          status={form.status}
          error={form.error}
          onSave={() => void form.save()}
          onDiscard={form.discard}
          saveLabel={isNew ? "Record this model" : "Save changes"}
        />
      </div>
    </AdminScreen>
  );
}
