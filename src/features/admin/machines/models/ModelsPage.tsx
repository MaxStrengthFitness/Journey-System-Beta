import React from "react";
import { ArrowLeft, Layers, Loader2, Pencil, Plus } from "lucide-react";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
} from "../../primitives";
import type { MachineCatalogEntry } from "../../../../types/machines";
import { resolveMachineOrder } from "../../../../data/machine-display-order";
import { dialSummary, modelLabel, modelsFor, type ModelWithId } from "../../../machine-codex/models";
import { useMachineModels } from "../../../machine-codex/models-store";
import { ModelEditor } from "./ModelEditor";
import "../editor/codex-editor.css";

/**
 * MODELS — every maker's model of every MSF movement (Codex R2, Sep 28 2026),
 * reached from Admins → Catalog. One document per model, grouped by the
 * movement it is; opening one replaces this screen with its editor, the
 * way a catalog machine opens.
 */
export function ModelsPage({
  catalog,
  movementId: startOn,
  isAdmin,
  onBack,
  backLabel,
}: {
  catalog: MachineCatalogEntry[];
  /** Open filtered to one movement (from that machine's page). */
  movementId?: string;
  isAdmin: boolean;
  onBack: () => void;
  backLabel: string;
}) {
  const { models, loading, failed } = useMachineModels();
  const [movementId, setMovementId] = React.useState(startOn ?? "");
  const [open, setOpen] = React.useState<{ kind: "new" } | { kind: "model"; id: string } | null>(null);

  const movements = React.useMemo(
    () =>
      catalog
        .filter((c) => c.status !== "retired")
        .sort((a, b) => resolveMachineOrder(a.id, a.defaultOrder) - resolveMachineOrder(b.id, b.defaultOrder)),
    [catalog],
  );

  if (open) {
    const live = open.kind === "model" ? models.find((m) => m.id === open.id) : undefined;
    return (
      <ModelEditor
        model={live}
        catalog={catalog}
        movementId={movementId || undefined}
        existingIds={models.map((m) => m.id)}
        onBack={() => setOpen(null)}
      />
    );
  }

  const groups: { movement: MachineCatalogEntry | null; id: string; models: ModelWithId[] }[] = [];
  const shown = movementId ? movements.filter((m) => m.id === movementId) : movements;
  for (const m of shown) {
    const list = modelsFor(models, m.id);
    if (list.length || movementId) groups.push({ movement: m, id: m.id, models: list });
  }
  // A model whose movement is not in the catalog any more still shows.
  const known = new Set(movements.map((m) => m.id));
  const orphans = models.filter((m) => !known.has(m.movementId));
  if (!movementId && orphans.length) groups.push({ movement: null, id: "__none", models: orphans });

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Layers className="w-5 h-5" />}
        title="Models"
        subtitle="A maker's model of an MSF movement: its dials and stacks, written once for every unit of it."
        actions={
          <>
            <AdminButton variant="quiet" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" /> {backLabel}
            </AdminButton>
            {isAdmin && (
              <AdminButton variant="hero" onClick={() => setOpen({ kind: "new" })}>
                <Plus className="w-4 h-4" /> New model
              </AdminButton>
            )}
          </>
        }
      />

      <AdminPanel>
        <AdminField label="Movement" htmlFor="models-movement">
          <AdminSelect id="models-movement" value={movementId} onChange={(e) => setMovementId(e.target.value)}>
            <option value="">Every movement</option>
            {movements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      </AdminPanel>

      {loading ? (
        <AdminNotice tone="info">
          <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> Reading the models…
        </AdminNotice>
      ) : failed ? (
        <AdminNotice tone="warn">The models couldn&apos;t be read just now, so none can be listed or opened.</AdminNotice>
      ) : groups.length === 0 ? (
        <AdminEmpty title="No models recorded yet">
          A model is worth writing when studios own the same maker&apos;s machine: its dials are then
          written once, and set-ups on it can be compared like with like.
        </AdminEmpty>
      ) : (
        groups.map((g) => (
          <AdminPanel
            key={g.id}
            title={g.movement ? g.movement.name : "A movement no longer in the catalog"}
            subtitle={
              g.models.length === 0
                ? "No model of it recorded yet."
                : `${g.models.length} ${g.models.length === 1 ? "model" : "models"}`
            }
            flush
          >
            {g.models.length > 0 && (
              <AdminRows>
                {g.models.map((m) => (
                  <AdminRow
                    key={m.id}
                    name={modelLabel(m)}
                    meta={dialSummary(m)}
                    trailing={
                      isAdmin ? (
                        <AdminButton variant="primary" size="sm" onClick={() => setOpen({ kind: "model", id: m.id })}>
                          <Pencil className="w-3.5 h-3.5" /> Open
                        </AdminButton>
                      ) : undefined
                    }
                  />
                ))}
              </AdminRows>
            )}
          </AdminPanel>
        ))
      )}
    </AdminScreen>
  );
}
