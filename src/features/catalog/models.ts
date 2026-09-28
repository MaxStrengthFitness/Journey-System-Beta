/**
 * THE MODEL TIER, READ — which maker's machine a unit is.
 *
 * Wave 2 of the Machine Catalog room (Catalog R4, AJ's "all yes", Sep 28
 * 2026). The room's plan: Movement ▸ Model ▸ Unit. A MOVEMENT is one of the
 * twenty the Academy writes (the Leg Press); a MODEL is one maker's machine
 * for it (Hoist ROC-IT Leg Press, Nautilus Nitro Plus); a UNIT is the one in
 * a studio's room, a roster entry. The model record is the Machine Codex's
 * (its format round builds and writes it):
 *
 *     machineModels/{modelId}
 *       { brand, model, movementId,   // movementId: the MSF machine id
 *         dials?: [...], notes?, updatedAt, updatedBy }
 *
 *     studios/{s}/roster/{machineId}.modelId?    // which model a unit is
 *
 * administrators write it, everyone signed in reads it. This file is the
 * Catalog's read of it and nothing else: brand and model on every floor row,
 * and a movement's page listing its models.
 *
 * NEVER A GUESS. A unit says its model only when its roster entry names one
 * by id and that record was read; a unit with no `modelId`, or one naming a
 * record that is not there, says nothing (never "Unknown model", never the
 * maker the name looks like). Until the collection exists, or while it
 * cannot be read, nothing is drawn at all.
 *
 * Trainers don't see how many floors have a machine (AJ, Sep 27 2026), so a
 * model says what it is, never where it is.
 *
 * PURE MODULE — no React, no Firestore.
 */

export interface MachineModel {
  id: string;
  brand: string;
  model: string;
  /** The MSF movement it is a model of: a catalog id ("m-leg-press"). */
  movementId: string;
  /** The model's dials, as their labels, in order. Empty when not recorded. */
  dials: string[];
  /** Head office's note on the model. Empty when there is none. */
  notes: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** One dial as the record may hold it: a label, or { label } / { name } / { key }. */
function dialLabel(v: unknown): string {
  if (typeof v === "string") return text(v);
  if (v && typeof v === "object") {
    const d = v as { label?: unknown; name?: unknown; key?: unknown };
    return text(d.label) || text(d.name) || text(d.key);
  }
  return "";
}

/**
 * One record, or null when it isn't one a screen can stand behind: no brand,
 * no model name or no movement is no model. Firestore documents are untyped
 * at runtime, so everything is checked.
 */
export function machineModelOf(id: string, raw: unknown): MachineModel | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const r = raw as { brand?: unknown; model?: unknown; movementId?: unknown; dials?: unknown; notes?: unknown };
  const brand = text(r.brand);
  const model = text(r.model);
  const movementId = text(r.movementId);
  if (!brand || !model || !movementId) return null;
  const dials = Array.isArray(r.dials) ? r.dials.map(dialLabel).filter(Boolean) : [];
  return { id, brand, model, movementId, dials, notes: text(r.notes) };
}

/** Which model a roster entry says its unit is, or null. */
export function modelIdOf(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const id = text((entry as { modelId?: unknown }).modelId);
  return id || null;
}

/**
 * A model as a person says it: its maker, then its name, without saying the
 * maker twice ("Hoist" + "ROC-IT Leg Press" → "Hoist ROC-IT Leg Press";
 * "Hoist" + "Hoist ROC-IT" → "Hoist ROC-IT").
 */
export function modelName(m: Pick<MachineModel, "brand" | "model">): string {
  const lowerModel = m.model.toLowerCase();
  const lowerBrand = m.brand.toLowerCase();
  if (lowerModel === lowerBrand || lowerModel.startsWith(`${lowerBrand} `)) return m.model;
  return `${m.brand} ${m.model}`;
}

/** The model a unit is: only the record its entry names, never a guess. */
export function modelForUnit(
  modelId: string | null | undefined,
  byId: Readonly<Record<string, MachineModel>> | null,
): MachineModel | null {
  if (!modelId || !byId) return null;
  return byId[modelId] ?? null;
}

/** A movement's models, by maker then name. */
export function modelsOfMovement(models: readonly MachineModel[], movementId: string): MachineModel[] {
  return models
    .filter((m) => m.movementId === movementId)
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
}

/** How the collection read went. Only "ready" draws anything. */
export type ModelsRead =
  | { state: "off" }
  | { state: "loading" }
  | { state: "ready"; models: MachineModel[]; byId: Record<string, MachineModel> }
  | { state: "unreadable" };

/** The read's answer from the documents it returned. */
export function modelsReadOf(docs: readonly { id: string; data: unknown }[]): ModelsRead {
  const models: MachineModel[] = [];
  const byId: Record<string, MachineModel> = {};
  for (const d of docs) {
    const m = machineModelOf(d.id, d.data);
    if (!m) continue;
    models.push(m);
    byId[m.id] = m;
  }
  return { state: "ready", models, byId };
}

/** The records by id, or null while there is nothing a screen may draw from. */
export function modelsById(read: ModelsRead): Record<string, MachineModel> | null {
  return read.state === "ready" && read.models.length > 0 ? read.byId : null;
}
