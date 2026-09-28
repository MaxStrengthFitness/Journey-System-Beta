/**
 * WHAT IS THIS STUDIO'S VALUE, AND WHERE DID IT COME FROM — the one answer.
 * Pure: resolve.test.ts.
 *
 * Three layers (registry.ts): the studio's own, Max Strength's default (head
 * office, in the app), the app's default. A value that isn't usable — the
 * wrong type, out of range, or Settling in not past New — is skipped, never
 * clamped into something nobody chose: the next layer answers, and the
 * editors say so. A read that failed is not "nothing set": the answer still
 * falls through to what it can stand behind, and `failed` travels with it so
 * a screen that lets you edit can say it couldn't check.
 */
import { SETTINGS, SETTING_BY_KEY, WEEKDAY_NAMES, type SettingDef, type SettingKey } from "./registry";

export type SettingValue = number | null;
export type SettingValues = Partial<Record<SettingKey, unknown>>;

export type SettingSource = "studio" | "company" | "app";

export interface ResolvedSetting {
  key: SettingKey;
  value: SettingValue;
  source: SettingSource;
}

export interface SettingLayers {
  /** studios/{s}/config/settings `values`; null when unread or absent. */
  studio: SettingValues | null;
  /** system/studioDefaults `values`; null when unread or absent. */
  company: SettingValues | null;
  /** The studio document itself, for a setting that lived there before (deepCleanIntervalDays). */
  studioDoc?: { deepCleanIntervalDays?: unknown } | null;
}

/** A usable value for this setting, or undefined when it isn't one. `null` is usable only as a weekday's "none". */
export function usable(def: SettingDef, raw: unknown): SettingValue | undefined {
  if (def.kind === "weekday") {
    if (raw === null) return null;
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 6 ? raw : undefined;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (def.kind !== "multiple" && !Number.isInteger(raw)) return undefined;
  if (def.kind === "multiple" && Math.round(raw * 10) !== raw * 10) return undefined;
  if (def.min !== undefined && raw < def.min) return undefined;
  if (def.max !== undefined && raw > def.max) return undefined;
  return raw;
}

function layerValue(def: SettingDef, values: SettingValues | null | undefined): SettingValue | undefined {
  if (!values || !(def.key in values)) return undefined;
  return usable(def, values[def.key]);
}

/** One setting, from the three layers. */
export function resolveSetting(key: SettingKey, layers: SettingLayers): ResolvedSetting {
  const def = SETTING_BY_KEY[key];
  let studio = layerValue(def, layers.studio);
  if (studio === undefined && def.legacyStudioField && layers.studioDoc) {
    studio = usable(def, layers.studioDoc[def.legacyStudioField]);
  }
  if (studio !== undefined) return { key, value: studio, source: "studio" };
  const company = layerValue(def, layers.company);
  if (company !== undefined) return { key, value: company, source: "company" };
  return { key, value: def.appDefault, source: "app" };
}

/**
 * Every setting at once, with the one rule across two of them: Settling in
 * must end after New. When a layer breaks it, both fall back together to
 * the next layer that keeps it, so a studio never reads a New of 30 and a
 * Settling in of 24.
 */
export function resolveAll(layers: SettingLayers): Record<SettingKey, ResolvedSetting> {
  const out = Object.fromEntries(SETTINGS.map((d) => [d.key, resolveSetting(d.key, layers)])) as Record<
    SettingKey,
    ResolvedSetting
  >;
  const newMax = out.newMax.value ?? 0;
  const settlingMax = out.settlingMax.value ?? 0;
  if (settlingMax <= newMax) {
    const withoutStudio: SettingLayers = { ...layers, studio: omit(layers.studio, ["newMax", "settlingMax"]) };
    const n = resolveSetting("newMax", withoutStudio);
    const s = resolveSetting("settlingMax", withoutStudio);
    const pair =
      (s.value ?? 0) > (n.value ?? 0)
        ? [n, s]
        : [
            { key: "newMax" as const, value: SETTING_BY_KEY.newMax.appDefault, source: "app" as const },
            { key: "settlingMax" as const, value: SETTING_BY_KEY.settlingMax.appDefault, source: "app" as const },
          ];
    out.newMax = pair[0];
    out.settlingMax = pair[1];
  }
  return out;
}

function omit(values: SettingValues | null, keys: SettingKey[]): SettingValues | null {
  if (!values) return values;
  const copy: SettingValues = { ...values };
  for (const k of keys) delete copy[k];
  return copy;
}

/** "3", "2.5", "Monday", "None": a value as an editor shows it. */
export function formatSetting(key: SettingKey, value: SettingValue): string {
  const def = SETTING_BY_KEY[key];
  if (def.kind === "weekday") {
    return value === null ? "None" : WEEKDAY_NAMES[value] ?? "None";
  }
  return value === null ? "—" : String(value);
}

/** Where a value came from, in the words the editors use. */
export const SOURCE_WORDS: Record<SettingSource, string> = {
  studio: "This studio's own",
  company: "Max Strength's default",
  app: "The app's default",
};

/**
 * What an editor's typed text becomes: a usable value, `null` for "back to
 * the default" (an empty box, or a weekday's None is its own value), or an
 * error sentence. Text, because inputs hold text.
 */
export function parseSetting(key: SettingKey, text: string): { value: SettingValue } | { clear: true } | { error: string } {
  const def = SETTING_BY_KEY[key];
  const t = text.trim();
  if (def.kind === "weekday") {
    if (t === "") return { clear: true };
    if (t === "none") return { value: null };
    const n = Number(t);
    const v = usable(def, n);
    return v === undefined ? { error: "Choose a day, or None." } : { value: v };
  }
  if (t === "") return { clear: true };
  const n = Number(t);
  const v = usable(def, n);
  if (v === undefined) {
    const range = def.min !== undefined && def.max !== undefined ? ` between ${def.min} and ${def.max}` : "";
    const whole = def.kind === "multiple" ? " (one decimal place at most)" : " (a whole number)";
    return { error: `Enter a number${range}${whole}.` };
  }
  return { value: v };
}
