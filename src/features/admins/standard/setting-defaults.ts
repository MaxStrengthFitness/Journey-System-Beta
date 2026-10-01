/**
 * ADMINS → STANDARD → STUDIO DEFAULTS, the pure half — the form, what a save
 * writes, the line it leaves in the Activity record, and who sets their own.
 * PURE: no React, no Firestore.
 *
 * AJ, Sep 28 2026: "let the admins assign the default within the app". Every
 * number a studio may set for itself (features/studio-settings, registry.ts)
 * has three layers — the studio's own, Max Strength's default, the app's —
 * and this page edits the middle one, system/studioDefaults, through the only
 * writer of it (saveCompanyDefaults). A box left empty is "not set": studios
 * then fall through to the app's own value. What is usable is resolve.ts's
 * answer (parseSetting), never a second one here.
 *
 * A studio's own values are edited on My Studio → Studio by its leaders; this
 * page only COUNTS them, read only, from one read of each studio's settings.
 */
import {
  SETTINGS,
  SETTING_BY_KEY,
  formatSetting,
  inactiveProblem,
  parseSetting,
  resolveSetting,
  usable,
  type SettingDef,
  type SettingKey,
  type SettingValue,
  type SettingValues,
  type SettingsPatch,
} from "../../studio-settings";
import { andList, type ActivityValue } from "../activity/activity";

/** What each box holds: text, because inputs hold text. "" is not set; a weekday's "none" is its own value. */
export type DefaultsForm = Record<SettingKey, string>;

/** A setting as a sentence names it: the label, except where the label only reads after the one above it. */
const SENTENCE_NAME: Partial<Record<SettingKey, string>> = {
  driftMinDays: "Drifting's shortest wait",
};

export function settingName(key: SettingKey): string {
  return SENTENCE_NAME[key] ?? SETTING_BY_KEY[key].label;
}

/** A stored value as its box shows it; not set, or not usable, is empty. */
export function textOf(def: SettingDef, raw: unknown): string {
  const v = usable(def, raw);
  if (v === undefined) return "";
  if (v === null) return def.kind === "weekday" ? "none" : "";
  return String(v);
}

/** Max Strength's defaults as the form's boxes. */
export function formOf(values: SettingValues | null): DefaultsForm {
  return Object.fromEntries(
    SETTINGS.map((d) => [d.key, values && d.key in values ? textOf(d, values[d.key]) : ""]),
  ) as DefaultsForm;
}

/** Values stored that aren't usable, as they were stored — said beside the box, never shown as "not set" in silence. */
export function unusableStored(values: SettingValues | null): Partial<Record<SettingKey, string>> {
  const out: Partial<Record<SettingKey, string>> = {};
  if (!values) return out;
  for (const d of SETTINGS) {
    if (!(d.key in values)) continue;
    const raw = values[d.key];
    if (usable(d, raw) === undefined) out[d.key] = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  }
  return out;
}

/** A box's text as the value it would give studios: its own, or the app's when empty; undefined when it isn't usable. */
function effective(key: SettingKey, text: string): SettingValue | undefined {
  const r = parseSetting(key, text);
  if ("error" in r) return undefined;
  if ("clear" in r) return SETTING_BY_KEY[key].appDefault;
  return r.value;
}

/** The one box's problem, in words, or null. */
export function fieldProblem(key: SettingKey, text: string): string | null {
  const r = parseSetting(key, text);
  return "error" in r ? r.error : null;
}

/**
 * The one rule across two settings: Settling in must end after New. Checked
 * on what studios would get (a box left empty gives the app's value), because
 * a company layer that breaks it would be skipped whole by resolve.ts, and
 * the save would quietly change nothing.
 */
export function pairProblem(form: DefaultsForm): string | null {
  const n = effective("newMax", form.newMax);
  const s = effective("settlingMax", form.settlingMax);
  if (typeof n !== "number" || typeof s !== "number") return null;
  if (s > n) return null;
  return `Settling in must end after New: New runs to session ${n}, so Settling in has to be more than ${n}.`;
}

/** The other pair (the inactive round, Oct 1 2026): Inactive must come after Lapsed, on what studios would get. */
export function inactivePairProblem(form: DefaultsForm): string | null {
  const l = effective("lapsedDays", form.lapsedDays);
  const i = effective("inactiveDays", form.inactiveDays);
  if (typeof l !== "number" || typeof i !== "number") return null;
  return inactiveProblem(l, i);
}

/** The first problem on the page, box by box and then the pairs, or null when it can be saved. */
export function formProblem(form: DefaultsForm): string | null {
  for (const d of SETTINGS) {
    const p = fieldProblem(d.key, form[d.key]);
    if (p) return `${settingName(d.key)}: ${p}`;
  }
  return pairProblem(form) ?? inactivePairProblem(form);
}

/** What a save writes: only the boxes that changed, a cleared one taken back to the app's value. */
export function patchOf(changed: Partial<DefaultsForm>): SettingsPatch {
  const patch: SettingsPatch = {};
  for (const [key, text] of Object.entries(changed) as [SettingKey, string | undefined][]) {
    if (text === undefined) continue;
    const r = parseSetting(key, text);
    if ("error" in r) throw new Error(`${settingName(key)}: ${r.error}`);
    patch[key] = "clear" in r ? "clear" : r.value;
  }
  return patch;
}

/** A value in the record's words: "3", "Monday", "not set (the app's 14)". */
function recordValue(key: SettingKey, v: SettingValue | "clear" | undefined): string {
  if (v === undefined || v === "clear") return `not set (the app's ${formatSetting(key, SETTING_BY_KEY[key].appDefault)})`;
  return formatSetting(key, v);
}

/** The Activity entry for a save: what changed, from what. Null when nothing did. */
export function defaultsRecord(
  patch: SettingsPatch,
  before: SettingValues | null,
): { what: string; before: Record<string, ActivityValue>; after: Record<string, ActivityValue> } | null {
  const keys = (Object.keys(patch) as SettingKey[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return null;
  const was: Record<string, ActivityValue> = {};
  const now: Record<string, ActivityValue> = {};
  for (const k of keys) {
    const prior = before && k in before ? usable(SETTING_BY_KEY[k], before[k]) : undefined;
    was[settingName(k)] = recordValue(k, prior);
    now[settingName(k)] = recordValue(k, patch[k]);
  }
  let what: string;
  if (keys.length === 1) {
    const k = keys[0];
    what =
      patch[k] === "clear"
        ? `Took Max Strength's default for “${settingName(k)}” back to the app's ${formatSetting(k, SETTING_BY_KEY[k].appDefault)}.`
        : `Set Max Strength's default for “${settingName(k)}” to ${formatSetting(k, patch[k] as SettingValue)}.`;
  } else {
    what = `Changed ${keys.length} of Max Strength's studio defaults: ${andList(keys.map((k) => `“${settingName(k)}”`))}.`;
  }
  return { what, before: was, after: now };
}

/* ---- who sets their own ---------------------------------------------------------- */

export type OwnRead = { state: "loading" } | { state: "ok"; values: SettingValues | null } | { state: "failed" };

export interface StudioLike {
  id?: string;
  name: string;
  deepCleanIntervalDays?: unknown;
}

/**
 * Which studios set their own value for each setting, by name, from one read
 * of each studio's settings (and, for the deep clean, the field on the studio
 * that My Studio → Studio still edits: resolve.ts's legacy layer). A studio
 * whose settings couldn't be read is named in `failed`, never counted as
 * following the default.
 */
export function whoSetsTheirOwn(
  studios: readonly StudioLike[],
  reads: Record<string, OwnRead>,
): { byKey: Record<SettingKey, string[]>; failed: string[]; loading: boolean } {
  const byKey = Object.fromEntries(SETTINGS.map((d) => [d.key, [] as string[]])) as Record<SettingKey, string[]>;
  const failed: string[] = [];
  let loading = false;
  for (const s of studios) {
    const read = s.id ? reads[s.id] : undefined;
    if (!read || read.state === "loading") {
      loading = true;
      continue;
    }
    if (read.state === "failed") {
      failed.push(s.name);
      continue;
    }
    for (const d of SETTINGS) {
      const r = resolveSetting(d.key, { studio: read.values, company: null, studioDoc: s });
      if (r.source === "studio") byKey[d.key].push(s.name);
    }
  }
  for (const d of SETTINGS) byKey[d.key].sort((a, b) => a.localeCompare(b));
  return { byKey, failed: failed.sort((a, b) => a.localeCompare(b)), loading };
}

/** "Solon sets its own." · "Solon and Westlake set their own." · "5 studios set their own." */
export function ownLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} sets its own.`;
  if (names.length <= 3) return `${andList(names)} set their own.`;
  return `${names.length} studios set their own.`;
}
