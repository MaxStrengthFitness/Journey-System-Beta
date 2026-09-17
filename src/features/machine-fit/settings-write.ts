/**
 * MACHINE FIT — what a settings save actually stores.
 *
 * Pure, and shared by the two writers: the Settings card (one machine,
 * equipment/mutations.ts) and the Setup screen (many machines, setup-save.ts).
 * Both write the `settings` and `sources` maps WHOLE, so both must build them
 * the same way.
 */

import type { SettingSource } from "./types.ts";

/** The part of a field the writers need. `SettingFieldSpec` fits it. */
export interface WritableField {
  key: string;
}

/**
 * The settings map to store: what was saved, with this machine's fields
 * replaced by the draft and a cleared field REMOVED.
 *
 * It starts from `saved` rather than from nothing because the map is written
 * whole (see saveSettings): a key the current field list does not show — an
 * older label-keyed value, a field a studio has since renamed — must survive
 * a save it took no part in.
 */
export function nextSettings(
  fields: readonly WritableField[],
  saved: Record<string, string>,
  draft: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...saved };
  for (const f of fields) {
    const v = (draft[f.key] ?? "").toString().trim();
    if (v) out[f.key] = v;
    else delete out[f.key];
  }
  return out;
}

/**
 * Where each stored value came from (machine fit round, Sep 2026). A field
 * that did not change keeps its source; one that did takes the source the
 * caller gives for it, or "typed". Only fields that still have a value are
 * listed, and "typed" is the default so it is not stored.
 */
export function nextSources(
  fields: readonly WritableField[],
  saved: Record<string, string>,
  settings: Record<string, string>,
  existing: Record<string, SettingSource> | null | undefined,
  changed: Record<string, SettingSource | undefined> | null | undefined,
): Record<string, SettingSource> {
  const out: Record<string, SettingSource> = {};
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(settings)) {
    const before = (saved[key] ?? "").toString().trim();
    const moved = known.has(key) && before !== settings[key];
    const source = moved ? (changed?.[key] ?? "typed") : existing?.[key];
    if (source && source !== "typed") out[key] = source;
  }
  return out;
}
