/**
 * The renewal settings screen's form shape, and the conversions both ways.
 *
 * Inputs hold text, not numbers: a leader clearing a box to type "12" passes
 * through "" on the way, and a number field would turn that into 0 and mark a
 * change nobody made. Mindbody names are edited one per line in a text box
 * for the same reason — splitting on every keystroke would swallow the new
 * line being typed. formToSettings() does the parsing once, at save time,
 * and says what is wrong in words when something is.
 */

import {
  MAX_NAMES_PER_PACKAGE,
  SETTING_LABELS,
  SETTING_LIMITS,
  newPackageTier,
  normalizeMindbodyName,
  validateRenewalSettings,
} from "./settings";
import type { PackageTier, RenewalSettings } from "./types";

export interface PackageRowForm {
  key: string;
  label: string;
  months: string;
  payments: string;
  sessions: string;
  ratePerSession: string;
  paymentAmount: string;
  prepayRatePerSession: string;
  /** Mindbody names, one per line. */
  namesText: string;
}

export interface RenewalSettingsForm {
  conversationAtSessionsLeft: string;
  chargeWarnDays: string;
  chargeWarnMinBanked: string;
  horizonMonths: string;
  breakDays: string;
  lostAfterDays: string;
  payAsYouGoCountsAs: "retained" | "lost";
  pauseDuringAwayEvents: "yes" | "no";
  packages: PackageRowForm[];
  extraNamesText: string;
}

const NUMBER_FIELDS = Object.keys(SETTING_LIMITS) as Array<keyof typeof SETTING_LIMITS>;

function numText(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

export function packageToRow(p: PackageTier): PackageRowForm {
  return {
    key: p.key,
    label: p.label,
    months: numText(p.months),
    payments: numText(p.payments),
    sessions: numText(p.sessions),
    ratePerSession: numText(p.ratePerSession),
    paymentAmount: numText(p.paymentAmount),
    prepayRatePerSession: numText(p.prepayRatePerSession),
    namesText: p.mindbodyNames.join("\n"),
  };
}

export function settingsToForm(s: RenewalSettings): RenewalSettingsForm {
  return {
    conversationAtSessionsLeft: numText(s.conversationAtSessionsLeft),
    chargeWarnDays: numText(s.chargeWarnDays),
    chargeWarnMinBanked: numText(s.chargeWarnMinBanked),
    horizonMonths: numText(s.horizonMonths),
    breakDays: numText(s.breakDays),
    lostAfterDays: numText(s.lostAfterDays),
    payAsYouGoCountsAs: s.payAsYouGoCountsAs,
    pauseDuringAwayEvents: s.pauseDuringAwayEvents ? "yes" : "no",
    packages: s.packages.map(packageToRow),
    extraNamesText: s.extraSessionNames.join("\n"),
  };
}

/** One name per line; blank lines and repeats dropped. */
export function parseNames(text: string, max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const shown = line.replace(/\s+/g, " ").trim();
    const key = normalizeMindbodyName(shown);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(shown.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

function parseNumber(text: string): number {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!t) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function rowToPackage(row: PackageRowForm): PackageTier {
  return {
    key: row.key,
    label: row.label.replace(/\s+/g, " ").trim(),
    months: parseNumber(row.months),
    payments: parseNumber(row.payments),
    sessions: parseNumber(row.sessions),
    ratePerSession: parseNumber(row.ratePerSession),
    paymentAmount: parseNumber(row.paymentAmount),
    prepayRatePerSession: parseNumber(row.prepayRatePerSession),
    mindbodyNames: parseNames(row.namesText, MAX_NAMES_PER_PACKAGE),
  };
}

export function formToSettings(form: RenewalSettingsForm): {
  settings: RenewalSettings;
  problems: string[];
} {
  const settings: RenewalSettings = {
    conversationAtSessionsLeft: parseNumber(form.conversationAtSessionsLeft),
    chargeWarnDays: parseNumber(form.chargeWarnDays),
    chargeWarnMinBanked: parseNumber(form.chargeWarnMinBanked),
    horizonMonths: parseNumber(form.horizonMonths),
    breakDays: parseNumber(form.breakDays),
    lostAfterDays: parseNumber(form.lostAfterDays),
    payAsYouGoCountsAs: form.payAsYouGoCountsAs === "lost" ? "lost" : "retained",
    pauseDuringAwayEvents: form.pauseDuringAwayEvents !== "no",
    packages: form.packages.map(rowToPackage),
    extraSessionNames: parseNames(form.extraNamesText),
  };
  const problems = validateRenewalSettings(settings);
  for (const key of NUMBER_FIELDS) {
    if (!Number.isInteger(settings[key]) && Number.isFinite(settings[key])) {
      problems.push(`${SETTING_LABELS[key]} must be a whole number.`);
    }
  }
  for (const p of settings.packages) {
    if (Number.isNaN(p.paymentAmount) || p.paymentAmount < 0) {
      problems.push(`${p.label || "A package"}: add the amount of each payment.`);
    }
    if (Number.isNaN(p.prepayRatePerSession) || p.prepayRatePerSession < 0) {
      problems.push(
        `${p.label || "A package"}: add the price per session when paid in full (the monthly price if there's no discount).`,
      );
    }
  }
  return { settings, problems: Array.from(new Set(problems)) };
}

/**
 * The part of the form that changed, as settings fields. Built from the WHOLE
 * form's parse, so a package edit sends the full, valid package table — one
 * array field — and never half a row.
 */
export function settingsPatchFromForm(
  patch: Partial<RenewalSettingsForm>,
  parsed: RenewalSettings,
): Partial<RenewalSettings> {
  const out: Partial<RenewalSettings> = {};
  for (const key of Object.keys(patch) as Array<keyof RenewalSettingsForm>) {
    if (key === "packages") out.packages = parsed.packages;
    else if (key === "extraNamesText") out.extraSessionNames = parsed.extraSessionNames;
    else if (key === "payAsYouGoCountsAs") out.payAsYouGoCountsAs = parsed.payAsYouGoCountsAs;
    else if (key === "pauseDuringAwayEvents") out.pauseDuringAwayEvents = parsed.pauseDuringAwayEvents;
    else (out as Record<string, unknown>)[key] = parsed[key as keyof RenewalSettings];
  }
  return out;
}

/** Adds a Mindbody name to a package (or to the extra-sessions list) in the form. */
export function assignNameInForm(
  form: RenewalSettingsForm,
  name: string,
  target: string,
): Partial<RenewalSettingsForm> {
  const append = (text: string) => {
    const existing = parseNames(text, 1000).map(normalizeMindbodyName);
    if (existing.includes(normalizeMindbodyName(name))) return text;
    return text.trim() ? `${text.replace(/\s+$/, "")}\n${name}` : name;
  };
  if (target === "__extra__") return { extraNamesText: append(form.extraNamesText) };
  return {
    packages: form.packages.map((row) =>
      row.key === target ? { ...row, namesText: append(row.namesText) } : row,
    ),
  };
}

/** A new, blank package row. */
export function newPackageRow(form: RenewalSettingsForm): PackageRowForm {
  const tiers = form.packages.map(rowToPackage);
  // Prices start blank, not "0": an empty box asks for a number, a zero
  // looks like an answer.
  return {
    ...packageToRow(newPackageTier(tiers)),
    ratePerSession: "",
    paymentAmount: "",
    prepayRatePerSession: "",
  };
}
