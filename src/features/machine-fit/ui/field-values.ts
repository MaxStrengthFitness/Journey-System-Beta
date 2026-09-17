/**
 * MACHINE FIT — between the machine's spelling and the engine's.
 *
 * A screen shows and stores a setting in the MACHINE'S terms: the storage key
 * (the legacy label "Back Pad", or the catalog slug "back-pad") and the value
 * as a trainer types it ("6.5", "In"). The engine only ever sees NORMALISED
 * keys and values ("back-pad", "6_5", "in"), so both conventions count as one
 * fact. This file is the only place that crosses the line, in both directions.
 */

import { displayValue } from "../../equipment/setting-suggestions";
import type { SettingFieldSpec } from "../../equipment/types";
import { normalizeSettingKey, normalizeSettingValue } from "../../machine-trends/trends";

export interface FitField {
  /** The storage key — what clientMachineSettings.settings uses for this machine. */
  key: string;
  /** The engine's key. */
  nk: string;
  label: string;
  type: "enum" | "number" | "text";
  options?: string[];
  step?: number;
  max?: number;
  /** The studio standard, shown as a placeholder. Never a value. */
  ghost: string | null;
}

/** A machine's fields with their engine keys. Two fields that normalise alike keep the first. */
export function toFitFields(specs: readonly SettingFieldSpec[]): FitField[] {
  const seen = new Set<string>();
  const out: FitField[] = [];
  for (const f of specs) {
    const nk = normalizeSettingKey(f.key) || normalizeSettingKey(f.label);
    if (!nk || seen.has(nk)) continue;
    seen.add(nk);
    out.push({ key: f.key, nk, label: f.label, type: f.type, options: f.options, step: f.step, max: f.max, ghost: f.ghost });
  }
  return out;
}

/** On-screen or saved values (storage keys) as the engine reads them. Empty values are left out. */
export function normalizedValues(
  fields: readonly FitField[],
  values: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = normalizeSettingValue(values[f.key], f.label);
    if (v !== null) out[f.nk] = v;
  }
  return out;
}

/** An engine value in the field's own spelling: "6_5" → "6.5", "in" → "In". */
export function shownValue(field: FitField, valueKey: string): string {
  return displayValue(valueKey, field.options ?? null);
}

export function fieldByNk(fields: readonly FitField[]): Map<string, FitField> {
  return new Map(fields.map((f) => [f.nk, f]));
}

/**
 * One key is a whole value: every option is a single character, or the
 * catalog says the scale stops below ten. The pad moves on by itself after
 * one tap on these — and only on these, because "1" may be the start of "12".
 */
export function isSingleKeyField(field: FitField): boolean {
  if (field.options && field.options.length > 0) return field.options.every((o) => o.trim().length === 1);
  return field.type === "number" && typeof field.max === "number" && field.max < 10;
}

/** Catalog steps by engine key, for the audit's "one notch". */
export function stepsByNk(fields: readonly FitField[]): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const f of fields) out[f.nk] = f.step;
  return out;
}
