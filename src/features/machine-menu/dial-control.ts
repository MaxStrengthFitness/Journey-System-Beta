/**
 * THE MACHINE MENU — how a dial is offered on its tile.
 *
 * A tile changes a dial with + and −, a row of positions, option buttons, or
 * (the fallback) a field. Which one comes from the FIRST rule that fits, and
 * nothing is invented (machine menu design §C, "How a dial is offered"):
 *
 *   1. The field's `options` (8 or fewer) give a row of option buttons.
 *   2. The field's `min`, `max` and `step` give a stepper.
 *   3. The values this studio's clients are set to on this machine give a
 *      stepper — the studio rows machine fit's `useFitData` already reads
 *      for the fit line, in the engine's spelling, shown back through
 *      `shownValue`. Used only once that read has answered.
 *   4. The current value plus every value on this client's record (the
 *      sets' settings snapshots, and `settingHistory` old and new): all whole
 *      numbers step by 1, all on halves by 0.5, all single letters A → B.
 *   5. Otherwise, a text field (a word dial: chips of the values on the
 *      client's record plus the studio standard, and a field).
 *
 * Why not the catalog's own step: all 57 setting fields in the twenty
 * generated definitions are `"type": "text"` with no min, max, step or
 * options, so rules 1 and 2 are for the catalog editor's future fields, and
 * rules 3 and 4 do the floor's work today.
 *
 * Bounds are the field's own, else ≥ 0 for a number and A–Z for a letter;
 * ± is disabled at a bound. Holding ± never repeats — that is the tile's
 * concern, not this file's.
 *
 * A row of positions (tap the number for a big jump) is offered when the
 * rule gives 12 or fewer of them; the positions run between the lowest and
 * highest value the rule saw (the current and saved values included), at
 * its step. Past 12, the tap opens a field instead.
 *
 * PURE — no React, no Firestore.
 */
import { normalizedValues, shownValue, type FitField } from "../machine-fit/ui/field-values";
import { normalizeSettingKey, normalizeSettingValue } from "../machine-trends/trends";
import { labelKey, type SettingRow } from "./setting-history";

/** More options than this, and the options are stepped through instead of drawn as buttons. */
export const MAX_OPTION_BUTTONS = 8;
/** More positions than this, and tapping the number opens a field. */
export const MAX_POSITIONS = 12;

/** A dial as the card holds it. `SettingFieldSpec` (equipment/types.ts) fits. */
export interface DialField {
  /** The storage key — what `clientMachineSettings.settings` uses for this machine. */
  key: string;
  label: string;
  type?: "enum" | "number" | "text";
  options?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
  /** The studio standard (shown only on an empty dial; never a value). */
  ghost?: string | null;
}

export type DialScale =
  | { unit: "number"; step: number }
  | { unit: "letter" }
  /** The field's own options, in their order (more than MAX_OPTION_BUTTONS of them). */
  | { unit: "list"; values: readonly string[] };

export interface WordChip {
  value: string;
  /** This chip is the studio standard ("· studio standard"). */
  standard: boolean;
}

export type DialControl =
  | { kind: "options"; rule: 1; options: string[] }
  | {
      kind: "stepper";
      rule: 1 | 2 | 3 | 4;
      scale: DialScale;
      /** The lowest and highest a number may go (letters run A–Z; a list runs its ends). */
      min: number | null;
      max: number | null;
      /** The position row for a big jump, or null: tapping the number opens a field. */
      positions: string[] | null;
      /** The keypad that field asks for. */
      keypad: "decimal" | "text";
    }
  | { kind: "text"; rule: 5; chips: WordChip[] };

export interface DialContext {
  /** The value on the tile now (the draft); "" or null for none. */
  current?: string | null;
  /** The value saved, so the position row covers it. */
  saved?: string | null;
  /**
   * The values this studio's clients are set to on this machine, in the
   * engine's spelling ("6_5", "b") — `studioValuesFor`. Null until machine
   * fit's read has answered: rule 3 waits for it.
   */
  studioValues?: readonly string[] | null;
  /** Every value on this client's record for this dial, as written — `recordValuesFor`. */
  recordValues?: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Spellings
 * ------------------------------------------------------------------ */

/** The dial as machine fit's spelling helpers want it. */
function fitFieldOf(field: DialField): FitField {
  return {
    key: field.key,
    nk: normalizeSettingKey(field.key) || normalizeSettingKey(field.label),
    label: field.label,
    type: field.type ?? "text",
    options: field.options ? [...field.options] : undefined,
    step: field.step,
    max: field.max,
    ghost: field.ghost ?? null,
  };
}

/** A value in the engine's spelling ("6_5"), or null for nothing. */
function engineValue(fit: FitField, raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  return normalizedValues([fit], { [fit.key]: String(raw) })[fit.nk] ?? null;
}

/** A value as the tile shows it: "6.5", "B". */
function shown(fit: FitField, raw: string | null | undefined): string | null {
  const v = engineValue(fit, raw);
  return v === null ? null : shownValue(fit, v);
}

const NUMBER = /^\d+(?:\.\d+)?$/;
const LETTER = /^[A-Za-z]$/;

/** The scale a set of shown values fits, or null when they don't agree. */
export function scaleOf(values: readonly string[]): DialScale | null {
  if (values.length === 0) return null;
  if (values.every((v) => NUMBER.test(v))) {
    const nums = values.map(Number);
    if (nums.every((n) => Number.isInteger(n))) return { unit: "number", step: 1 };
    if (nums.every((n) => Number.isInteger(n * 2))) return { unit: "number", step: 0.5 };
    return null;
  }
  if (values.every((v) => LETTER.test(v))) return { unit: "letter" };
  return null;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
const formatNumber = (n: number): string => String(round(n));

/** Positions from the lowest to the highest value at the scale's step, inside the bounds; null past MAX_POSITIONS. */
function span(values: readonly string[], scale: DialScale, min: number | null, max: number | null): string[] | null {
  if (values.length === 0) return null;
  if (scale.unit === "list") return scale.values.length <= MAX_POSITIONS ? [...scale.values] : null;
  if (scale.unit === "letter") {
    const codes = values.map((v) => v.toUpperCase().charCodeAt(0));
    const lo = Math.min(...codes);
    const hi = Math.max(...codes);
    if (hi - lo + 1 > MAX_POSITIONS) return null;
    return Array.from({ length: hi - lo + 1 }, (_, i) => String.fromCharCode(lo + i));
  }
  const nums = values.map(Number);
  const lo = Math.max(Math.min(...nums), min ?? 0);
  const hi = max === null ? Math.max(...nums) : Math.min(Math.max(...nums), max);
  if (hi < lo) return null;
  const count = Math.floor(round((hi - lo) / scale.step)) + 1;
  if (count > MAX_POSITIONS) return null;
  return Array.from({ length: count }, (_, i) => formatNumber(lo + i * scale.step));
}

const distinct = (values: readonly string[]): string[] => [...new Set(values)];

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * How the dial is offered: the first of rules 1–5 that fits. Work it out
 * again whenever the draft changes — the current value is part of the
 * answer (an empty dial filled by Use becomes a stepper).
 */
export function dialControl(field: DialField, ctx: DialContext = {}): DialControl {
  const fit = fitFieldOf(field);
  const current = shown(fit, ctx.current);
  const saved = shown(fit, ctx.saved);
  const around = [current, saved].filter((v): v is string => v !== null);

  // 1. The field's own options.
  const options = (field.options ?? []).map((o) => String(o)).filter((o) => o.trim() !== "");
  if (options.length > 0 && options.length <= MAX_OPTION_BUTTONS) return { kind: "options", rule: 1, options };
  if (options.length > MAX_OPTION_BUTTONS) {
    const scale: DialScale = { unit: "list", values: options };
    return { kind: "stepper", rule: 1, scale, min: null, max: null, positions: span(options, scale, null, null), keypad: "text" };
  }

  // 2. The field's own min, max and step. A word already on the dial can't be stepped.
  const fieldMin = finite(field.min) ? field.min : null;
  const fieldMax = finite(field.max) ? field.max : null;
  const step = finite(field.step) && field.step > 0 ? field.step : null;
  if ((step !== null || (fieldMin !== null && fieldMax !== null)) && around.every((v) => NUMBER.test(v))) {
    const scale: DialScale = { unit: "number", step: step ?? 1 };
    const positions = fieldMin !== null && fieldMax !== null ? span([String(fieldMin), String(fieldMax)], scale, fieldMin, fieldMax) : null;
    return { kind: "stepper", rule: 2, scale, min: fieldMin ?? 0, max: fieldMax, positions, keypad: "decimal" };
  }

  // 3. What this studio's clients are set to on this machine, once machine fit has answered.
  if (ctx.studioValues) {
    const studio = distinct(ctx.studioValues.map((v) => shownValue(fit, v)).filter((v) => v.trim() !== ""));
    const stepper = stepperOver(studio, around, 3, fieldMin, fieldMax);
    if (stepper) return stepper;
  }

  // 4. The current value and every value on this client's record.
  const record = distinct((ctx.recordValues ?? []).map((v) => shown(fit, v)).filter((v): v is string => v !== null));
  const stepper = stepperOver(record, around, 4, fieldMin, fieldMax);
  if (stepper) return stepper;

  // 5. A text field, with chips of what's on the record and the standard.
  return { kind: "text", rule: 5, chips: wordChips(field, ctx.recordValues ?? []) };
}

function stepperOver(
  seen: readonly string[],
  around: readonly string[],
  rule: 3 | 4,
  fieldMin: number | null,
  fieldMax: number | null,
): DialControl | null {
  const values = distinct([...seen, ...around]);
  if (seen.length === 0 && rule === 3) return null;
  const scale = scaleOf(values);
  if (!scale) return null;
  if (scale.unit === "letter") {
    return { kind: "stepper", rule, scale, min: null, max: null, positions: span(values, scale, null, null), keypad: "text" };
  }
  const min = fieldMin ?? 0;
  return { kind: "stepper", rule, scale, min, max: fieldMax, positions: span(values, scale, min, fieldMax), keypad: "decimal" };
}

/**
 * The chips a word dial offers: the values on the client's record, as
 * written (one chip per value however it was spelled), then the studio
 * standard, marked as such. A chip fills the field only when tapped.
 */
export function wordChips(field: DialField, recordValues: readonly string[]): WordChip[] {
  const fit = fitFieldOf(field);
  const standard = engineValue(fit, field.ghost);
  const seen = new Set<string>();
  const out: WordChip[] = [];
  for (const raw of recordValues) {
    const v = String(raw ?? "").trim();
    const key = engineValue(fit, v);
    if (!v || key === null || seen.has(key)) continue;
    seen.add(key);
    out.push({ value: v, standard: key === standard });
  }
  if (standard !== null && !seen.has(standard)) out.push({ value: String(field.ghost).trim(), standard: true });
  return out;
}

/* ------------------------------------------------------------------ *
 * The editor's field: which keypad
 * ------------------------------------------------------------------ */

/**
 * The keypad a dial's typing field asks for (the open session round, Oct 9
 * 2026, finding 5: an empty dial's field came up on the letter keyboard, so
 * "12" took a switch to the numbers first).
 *
 * A stepper says its own (a number dial "decimal", a letter dial "text").
 * A field (rule 5) asks for the number pad when the field is a number, when
 * everything known about the dial is a number (what is saved, the studio
 * standard, the values on the client's record and this studio's), and when
 * nothing is known at all: the floor's dials are numbers ("Seat 12, Back pad
 * 3"), and the iPad's number keys still switch to letters. A word on the
 * record or the standard ("High") keeps the letters.
 */
export function editorKeypad(field: DialField, control: DialControl, ctx: DialContext = {}): "decimal" | "text" {
  if (control.kind === "stepper") return control.keypad;
  if (control.kind === "options") return "text";
  if (field.type === "number") return "decimal";
  const fit = fitFieldOf(field);
  const known = [
    ctx.saved,
    field.ghost,
    ...(ctx.recordValues ?? []),
    ...(ctx.studioValues ?? []).map((v) => shownValue(fit, v)),
  ]
    .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
    .filter((v) => v !== "");
  return known.every((v) => NUMBER.test(v)) ? "decimal" : "text";
}

/* ------------------------------------------------------------------ *
 * Stepping
 * ------------------------------------------------------------------ */

/**
 * The value one step up (+1) or down (−1) from `value`, or null at a bound,
 * for an empty dial (no ± on an empty dial), or for a control that isn't a
 * stepper.
 */
export function stepDial(control: DialControl, value: string | null | undefined, dir: 1 | -1): string | null {
  if (control.kind !== "stepper") return null;
  const v = (value ?? "").trim();
  if (!v) return null;
  const { scale } = control;
  if (scale.unit === "list") {
    const at = scale.values.findIndex((o) => o.trim().toLowerCase() === v.toLowerCase());
    if (at < 0) return null;
    return scale.values[at + dir] ?? null;
  }
  if (scale.unit === "letter") {
    if (!LETTER.test(v)) return null;
    const code = v.toUpperCase().charCodeAt(0) + dir;
    if (code < 65 || code > 90) return null;
    const next = String.fromCharCode(code);
    return v === v.toLowerCase() ? next.toLowerCase() : next;
  }
  const n = Number(v);
  if (!NUMBER.test(v) || !Number.isFinite(n)) return null;
  const next = round(n + dir * scale.step);
  if (next < (control.min ?? 0)) return null;
  if (control.max !== null && next > control.max) return null;
  return formatNumber(next);
}

/** ± is enabled: a step that way exists. */
export function canStep(control: DialControl, value: string | null | undefined, dir: 1 | -1): boolean {
  return stepDial(control, value, dir) !== null;
}

/* ------------------------------------------------------------------ *
 * Where the values come from
 * ------------------------------------------------------------------ */

/**
 * Rule 3's values for one dial: what each of this studio's clients is set to
 * on this machine, from the studio rows `useFitData` returns (`sources[id].
 * studio`, engine spelling). Null while that read hasn't answered.
 */
export function studioValuesFor(
  field: DialField,
  studioRows: readonly { settings: Readonly<Record<string, string>> }[] | null | undefined,
): string[] | null {
  if (!studioRows) return null;
  const nk = fitFieldOf(field).nk;
  return distinct(studioRows.map((r) => r.settings?.[nk]).filter((v): v is string => typeof v === "string" && v !== ""));
}

/**
 * Rule 4's values for one dial: every value on this client's record — the
 * settings snapshot on each of the client's sets on this machine (keyed by
 * the storage key, whichever spelling it was saved under), and both sides
 * of each `settingHistory` row that moved this dial.
 */
export function recordValuesFor(
  field: DialField,
  record: {
    snapshots?: readonly (Readonly<Record<string, unknown>> | null | undefined)[];
    rows?: readonly Pick<SettingRow, "pairs">[] | null;
  },
): string[] {
  const nk = fitFieldOf(field).nk;
  const label = labelKey(field.label);
  const out: string[] = [];
  for (const snap of record.snapshots ?? []) {
    if (!snap) continue;
    for (const [k, v] of Object.entries(snap)) {
      if (v === null || v === undefined || String(v).trim() === "") continue;
      if (k === field.key || normalizeSettingKey(k) === nk || labelKey(k) === label) out.push(String(v).trim());
    }
  }
  for (const row of record.rows ?? []) {
    for (const p of row.pairs) {
      if (labelKey(p.label) !== label) continue;
      if (p.from) out.push(p.from);
      if (p.to) out.push(p.to);
    }
  }
  // One entry per value however it was written ("5", "05", "Seat 5").
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = normalizeSettingValue(v, field.label) ?? v;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
