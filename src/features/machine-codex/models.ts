/**
 * THE MODEL RECORD — machineModels/{modelId} (Codex R2, Sep 28 2026).
 *
 * A seat 4 on a Nautilus is not a seat 4 on a Hoist. The model is the tier
 * between the movement (a catalog machine) and the unit (a studio's roster
 * entry): the dials and stacks every unit of one maker's model shares,
 * written once by an administrator and pointed at by each unit
 * (`RosterEntryBase.modelId`). The weekly machine-trends job pools settings
 * per model; weights keep pooling per movement.
 *
 * The document's shape is EXACTLY `MachineModel` in types/machines.ts —
 * { brand, model, movementId, dials?, notes?, updatedAt, updatedBy } — and
 * firestore.rules holds it to that. This file builds one (`modelDocument`),
 * checks one (`modelProblems`), mints its id once (`modelIdFor`) and names
 * one (`modelLabel`). PURE.
 */

import type { MachineModel, MachineSettingField, ModelDial } from "../../types/machines";
import { settingFieldKey } from "../../types/machines";

/** Every model id starts so, which keeps it apart from a machine id at a glance. */
export const MODEL_ID_PREFIX = "mm-";

/** Limits the rules hold too (firestore.rules, "WAVE 2 CODEX: the model record"). */
export const MODEL_LIMITS = {
  brand: 60,
  model: 80,
  notes: 2000,
  dials: 20,
  movementId: 100,
} as const;

/**
 * "Hoist" + "ROC-IT Leg Press" → "mm-hoist-roc-it-leg-press". Minted ONCE,
 * when the model is created, and never again: the id is a foreign key on
 * every unit that names the model and in the trends job's pools, so a later
 * rename of the brand or model keeps the id it was born with.
 */
export function modelIdFor(brand: string, model: string): string {
  const slug = `${brand} ${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${MODEL_ID_PREFIX}${slug || "model"}`;
}

/** "Hoist ROC-IT Leg Press" — the brand, then the model, never cut short. */
export function modelLabel(m: Pick<MachineModel, "brand" | "model"> | null | undefined): string {
  if (!m) return "";
  const brand = (m.brand ?? "").trim();
  const model = (m.model ?? "").trim();
  if (!brand) return model;
  if (!model) return brand;
  // "Hoist" + "Hoist ROC-IT" should not read "Hoist Hoist ROC-IT".
  return model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`;
}

/** What the editor holds while an administrator types. */
export interface ModelDraft {
  brand: string;
  model: string;
  movementId: string;
  dials: ModelDial[];
  notes: string;
}

export function emptyModelDraft(movementId = ""): ModelDraft {
  return { brand: "", model: "", movementId, dials: [], notes: "" };
}

/** A stored model as the editor's draft. Untrusted input: every part is checked. */
export function draftOf(raw: Partial<MachineModel> | null | undefined): ModelDraft {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const dials = Array.isArray(raw?.dials)
    ? raw!.dials.filter((d): d is ModelDial => !!d && typeof d.key === "string" && typeof d.label === "string")
    : [];
  return {
    brand: str(raw?.brand),
    model: str(raw?.model),
    movementId: str(raw?.movementId),
    dials: dials.map((d) => ({ ...d })),
    notes: str(raw?.notes),
  };
}

/**
 * What stops a save, named — never a greyed-out button. Empty means the
 * model can be written.
 */
export function modelProblems(d: ModelDraft): string[] {
  const out: string[] = [];
  const brand = d.brand.trim();
  const model = d.model.trim();
  if (!brand) out.push("Give it a brand — Hoist, Nautilus, MedX.");
  if (!model) out.push("Give it a model name — ROC-IT Leg Press.");
  if (!d.movementId.trim()) out.push("Say which MSF movement it is.");
  if (brand.length > MODEL_LIMITS.brand) out.push(`The brand is longer than ${MODEL_LIMITS.brand} characters.`);
  if (model.length > MODEL_LIMITS.model) out.push(`The model name is longer than ${MODEL_LIMITS.model} characters.`);
  if (d.notes.length > MODEL_LIMITS.notes) out.push(`The notes are longer than ${MODEL_LIMITS.notes} characters.`);
  const dials = d.dials.filter((x) => x.label.trim());
  if (dials.length > MODEL_LIMITS.dials) out.push(`A model can list up to ${MODEL_LIMITS.dials} dials.`);
  const keys = new Set<string>();
  for (const x of dials) {
    const k = x.key.trim() || settingFieldKey(x.label);
    if (keys.has(k)) out.push(`Two dials share the key “${k}”.`);
    keys.add(k);
  }
  return out;
}

/**
 * The document to write, without its stamp (the store adds `updatedAt` and
 * `updatedBy`). Empty parts are left out rather than stored as "" or [], so
 * the document holds only what the model actually says.
 */
export function modelDocument(d: ModelDraft): Omit<MachineModel, "updatedAt" | "updatedBy"> {
  const dials: ModelDial[] = d.dials
    .filter((x) => x.label.trim())
    .map((x) => {
      const out: ModelDial = { key: x.key.trim() || settingFieldKey(x.label), label: x.label.trim() };
      if (x.letter?.trim()) out.letter = x.letter.trim();
      if (x.type) out.type = x.type;
      if (x.options?.length) out.options = x.options.map((o) => o.trim()).filter(Boolean);
      if (typeof x.min === "number" && Number.isFinite(x.min)) out.min = x.min;
      if (typeof x.max === "number" && Number.isFinite(x.max)) out.max = x.max;
      if (typeof x.step === "number" && Number.isFinite(x.step)) out.step = x.step;
      if (x.default?.trim()) out.default = x.default.trim();
      if (out.options && out.options.length === 0) delete out.options;
      return out;
    });
  const doc: Omit<MachineModel, "updatedAt" | "updatedBy"> = {
    brand: d.brand.trim(),
    model: d.model.trim(),
    movementId: d.movementId.trim(),
  };
  if (dials.length) doc.dials = dials;
  if (d.notes.trim()) doc.notes = d.notes.trim();
  return doc;
}

/** A model's dials as the movement's dials, to start a model from the standard. */
export function dialsFromMovement(fields: readonly MachineSettingField[] | undefined): ModelDial[] {
  return (fields ?? []).map((f) => {
    const d: ModelDial = { key: f.key, label: f.label || f.key };
    if (f.letter) d.letter = f.letter;
    if (f.type) d.type = f.type;
    if (f.options?.length) d.options = [...f.options];
    return d;
  });
}

export interface ModelWithId extends MachineModel {
  id: string;
}

/** The models of one movement, by label. */
export function modelsFor(models: readonly ModelWithId[], movementId: string | null | undefined): ModelWithId[] {
  if (!movementId) return [];
  return models
    .filter((m) => m.movementId === movementId)
    .sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));
}

/** "4 dials: G · P · SP · S" or "No dials recorded". */
export function dialSummary(m: Pick<MachineModel, "dials">): string {
  const dials = m.dials ?? [];
  if (dials.length === 0) return "No dials recorded";
  const names = dials.map((d) => d.letter || d.label).join(" · ");
  return `${dials.length} ${dials.length === 1 ? "dial" : "dials"}: ${names}`;
}
