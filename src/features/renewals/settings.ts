/**
 * RENEWALS — studio settings: defaults, cleaning and checks.
 *
 * AJ, Sep 10 2026: "each studio should be able to customize anything that
 * relates to knowing." So every threshold the renewal engine uses lives in
 * studios/{studioId}/config/renewals, and this file is the only place that
 * turns whatever is stored there into settings the engine can trust:
 *
 *   - a studio that never saved anything gets the defaults below;
 *   - a field that was saved wins; a field that was not falls back;
 *   - a nonsense value (a negative day count, a package with no sessions) is
 *     replaced by the default rather than trusted, so one bad save cannot
 *     make every client in a studio look overdue.
 *
 * The defaults are AJ's answers to the proposal (Sep 11 2026: "everything
 * else is golden") and the package table on the Max Strength website.
 */

import type { PackageTier, RenewalSettings } from "./types";

export const DEFAULT_PACKAGES: PackageTier[] = [
  {
    key: "trial",
    label: "The Trial",
    months: 6,
    payments: 6,
    sessions: 48,
    ratePerSession: 70,
    paymentAmount: 560,
    prepayRatePerSession: 67,
    // "48 Sessions - 2X Week" is on a real client's account (AJ, Sep 11).
    // The PIF name follows the "144 PIF" pattern and is unconfirmed; an
    // unused name matches nothing and costs nothing.
    mindbodyNames: ["48 Sessions - 2X Week", "48 PIF"],
  },
  {
    key: "committed",
    label: "Committed",
    months: 12,
    payments: 12,
    sessions: 96,
    ratePerSession: 60,
    paymentAmount: 480,
    prepayRatePerSession: 57,
    mindbodyNames: ["96 Sessions - 2X Week", "96 PIF"],
  },
  {
    key: "transformed",
    label: "Life Transformed",
    months: 18,
    payments: 18,
    sessions: 144,
    ratePerSession: 54,
    paymentAmount: 432,
    prepayRatePerSession: 51,
    // "144 PIF" is on a real client's account (AJ, Sep 11).
    mindbodyNames: ["144 Sessions - 2X Week", "144 PIF"],
  },
];

export const DEFAULT_RENEWAL_SETTINGS: RenewalSettings = {
  conversationAtSessionsLeft: 10,
  chargeWarnDays: 30,
  chargeWarnMinBanked: 4,
  horizonMonths: 3,
  breakDays: 14,
  lostAfterDays: 30,
  payAsYouGoCountsAs: "retained",
  pauseDuringAwayEvents: true,
  packages: DEFAULT_PACKAGES,
  extraSessionNames: ["Session Comp"],
};

/** The allowed range of every number setting, and what the form says about it. */
export const SETTING_LIMITS = {
  conversationAtSessionsLeft: { min: 0, max: 60 },
  chargeWarnDays: { min: 0, max: 180 },
  chargeWarnMinBanked: { min: 1, max: 100 },
  horizonMonths: { min: 1, max: 12 },
  breakDays: { min: 7, max: 90 },
  lostAfterDays: { min: 0, max: 365 },
} as const;

export const MAX_PACKAGES = 12;
export const MAX_NAMES_PER_PACKAGE = 20;

/** Pricing options come 8 at a time on a monthly package; below this a package is not a package. */
const MIN_PACKAGE_SESSIONS = 1;

type NumberSetting = keyof typeof SETTING_LIMITS;

function cleanNumber(value: unknown, key: NumberSetting): number {
  const { min, max } = SETTING_LIMITS[key];
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n < min || n > max) return DEFAULT_RENEWAL_SETTINGS[key];
  return Math.round(n);
}

/* ------------------------------------------------------------------ *
 * Mindbody names
 * ------------------------------------------------------------------ */

/**
 * How two names are compared: capitals, extra spaces and the kind of dash
 * don't matter. "48 sessions – 2x week " matches "48 Sessions - 2X Week".
 * Nothing looser than that: a name that merely CONTAINS "48" is not the
 * Trial, and a wrong match would put the wrong price in a conversation.
 */
export function normalizeMindbodyName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanNames(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const shown = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = normalizeMindbodyName(shown);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(shown);
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Packages
 * ------------------------------------------------------------------ */

function positive(value: unknown, fallback: number, { integer = false, max = 100_000 } = {}): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n > max) return fallback;
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

/** "Life Transformed" -> "life-transformed". */
export function slugifyPackageKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "package"
  );
}

function cleanPackage(raw: any, index: number): PackageTier | null {
  if (!raw || typeof raw !== "object") return null;
  const label = typeof raw.label === "string" ? raw.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!label) return null;
  const sessions = positive(raw.sessions, 0, { integer: true, max: 1000 });
  if (sessions < MIN_PACKAGE_SESSIONS) return null;
  const payments = positive(raw.payments, 1, { integer: true, max: 120 });
  const months = positive(raw.months, Math.max(1, Math.round((payments * 28) / 30.4)), {
    integer: true,
    max: 120,
  });
  const ratePerSession = positive(raw.ratePerSession, 0);
  const paymentAmount = positive(
    raw.paymentAmount,
    ratePerSession ? Math.round(((ratePerSession * sessions) / payments) * 100) / 100 : 0,
  );
  const prepayRatePerSession = positive(raw.prepayRatePerSession, ratePerSession);
  const key =
    typeof raw.key === "string" && /^[a-z0-9-]{1,40}$/.test(raw.key)
      ? raw.key
      : `${slugifyPackageKey(label)}-${index + 1}`;
  return {
    key,
    label,
    months,
    payments,
    sessions,
    ratePerSession,
    paymentAmount,
    prepayRatePerSession,
    mindbodyNames: cleanNames(raw.mindbodyNames, MAX_NAMES_PER_PACKAGE),
  };
}

function cleanPackages(value: unknown): PackageTier[] {
  if (!Array.isArray(value)) return DEFAULT_PACKAGES;
  const out: PackageTier[] = [];
  const keys = new Set<string>();
  value.slice(0, MAX_PACKAGES).forEach((raw, i) => {
    const p = cleanPackage(raw, i);
    if (!p) return;
    let key = p.key;
    let n = 2;
    while (keys.has(key)) key = `${p.key}-${n++}`;
    keys.add(key);
    out.push({ ...p, key });
  });
  // A studio that deleted every package still needs something to measure
  // against; an empty table would make every client "unknown package".
  return out.length > 0 ? out : DEFAULT_PACKAGES;
}

/* ------------------------------------------------------------------ *
 * The whole document
 * ------------------------------------------------------------------ */

/** Whatever is stored (or nothing) -> settings the engine can trust. */
export function normalizeRenewalSettings(raw: unknown): RenewalSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    conversationAtSessionsLeft: cleanNumber(d.conversationAtSessionsLeft, "conversationAtSessionsLeft"),
    chargeWarnDays: cleanNumber(d.chargeWarnDays, "chargeWarnDays"),
    chargeWarnMinBanked: cleanNumber(d.chargeWarnMinBanked, "chargeWarnMinBanked"),
    horizonMonths: cleanNumber(d.horizonMonths, "horizonMonths"),
    breakDays: cleanNumber(d.breakDays, "breakDays"),
    lostAfterDays: cleanNumber(d.lostAfterDays, "lostAfterDays"),
    payAsYouGoCountsAs: d.payAsYouGoCountsAs === "lost" ? "lost" : "retained",
    pauseDuringAwayEvents:
      typeof d.pauseDuringAwayEvents === "boolean"
        ? d.pauseDuringAwayEvents
        : DEFAULT_RENEWAL_SETTINGS.pauseDuringAwayEvents,
    packages: cleanPackages(d.packages),
    extraSessionNames:
      d.extraSessionNames === undefined
        ? DEFAULT_RENEWAL_SETTINGS.extraSessionNames
        : cleanNames(d.extraSessionNames, 40),
  };
}

/**
 * Which package, if any, a Mindbody contract or pricing-option name means.
 * Built once per studio per run.
 */
export interface PackageNameIndex {
  tierFor(name: unknown): PackageTier | null;
  isExtraSessions(name: unknown): boolean;
}

export function buildPackageNameIndex(settings: RenewalSettings): PackageNameIndex {
  const byName = new Map<string, PackageTier>();
  for (const tier of settings.packages) {
    for (const n of tier.mindbodyNames) {
      const key = normalizeMindbodyName(n);
      // First claim wins; validateRenewalSettings() tells the leader about the clash.
      if (key && !byName.has(key)) byName.set(key, tier);
    }
  }
  const extras = new Set(settings.extraSessionNames.map(normalizeMindbodyName).filter(Boolean));
  return {
    tierFor: (name) => byName.get(normalizeMindbodyName(name)) ?? null,
    isExtraSessions: (name) => extras.has(normalizeMindbodyName(name)),
  };
}

/**
 * Problems a leader should fix before saving, in plain English. Empty when
 * the settings are fine. (normalizeRenewalSettings would quietly repair most
 * of these; the form says so instead, so nobody wonders where an edit went.)
 */
export function validateRenewalSettings(s: RenewalSettings): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(SETTING_LIMITS) as NumberSetting[]) {
    const { min, max } = SETTING_LIMITS[key];
    const v = s[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      problems.push(`${SETTING_LABELS[key]} must be between ${min} and ${max}.`);
    }
  }
  if (s.packages.length === 0) problems.push("Keep at least one package.");
  if (s.packages.length > MAX_PACKAGES) problems.push(`At most ${MAX_PACKAGES} packages.`);
  const labels = new Set<string>();
  const claimed = new Map<string, string>();
  s.packages.forEach((p, i) => {
    const name = p.label.trim() || `Package ${i + 1}`;
    if (!p.label.trim()) problems.push(`Package ${i + 1} needs a name.`);
    if (labels.has(p.label.trim().toLowerCase())) problems.push(`Two packages are called "${name}".`);
    labels.add(p.label.trim().toLowerCase());
    if (!(p.sessions >= 1)) problems.push(`${name}: sessions must be at least 1.`);
    if (!(p.payments >= 1)) problems.push(`${name}: payments must be at least 1.`);
    if (!(p.months >= 1)) problems.push(`${name}: months must be at least 1.`);
    if (!(p.ratePerSession > 0)) problems.push(`${name}: add the price per session.`);
    for (const n of p.mindbodyNames) {
      const key = normalizeMindbodyName(n);
      const other = claimed.get(key);
      if (other && other !== name) problems.push(`"${n}" is listed under both ${other} and ${name}.`);
      claimed.set(key, name);
    }
  });
  for (const n of s.extraSessionNames) {
    const owner = claimed.get(normalizeMindbodyName(n));
    if (owner) problems.push(`"${n}" is a package name (${owner}) and an extra-sessions name.`);
  }
  return Array.from(new Set(problems));
}

export const SETTING_LABELS: Record<NumberSetting, string> = {
  conversationAtSessionsLeft: "Start the conversation at (sessions left)",
  chargeWarnDays: "Warn before the charge (days)",
  chargeWarnMinBanked: "Only when this many sessions are banked",
  horizonMonths: "Plan ahead (months)",
  breakDays: "A break is (days without a visit)",
  lostAfterDays: "Lost after (days past the end)",
};

/** A blank package row for the editor. */
export function newPackageTier(existing: PackageTier[]): PackageTier {
  let n = existing.length + 1;
  let key = `package-${n}`;
  const keys = new Set(existing.map((p) => p.key));
  while (keys.has(key)) key = `package-${++n}`;
  return {
    key,
    label: "",
    months: 12,
    payments: 12,
    sessions: 96,
    ratePerSession: 0,
    paymentAmount: 0,
    prepayRatePerSession: 0,
    mindbodyNames: [],
  };
}

/** Sessions that arrive with each 4-weekly payment (8 on every MSF package). */
export function sessionsPerPayment(tier: PackageTier): number {
  return tier.payments > 0 ? tier.sessions / tier.payments : tier.sessions;
}
