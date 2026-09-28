/**
 * WHERE STUDIOS SET THEIR OWN — a house default changed at two studios or
 * more, one line per machine. PURE: no React, no Firestore.
 *
 * AJ, Sep 27 2026 (the Admins room's q6): "as a admin I should definitely be
 * able to see if lots of studios are shifting off of the average because then
 * that might tell me like hey I'm not always the correct answer ... this is
 * Kaizen we are always improving". And, on marks (q8): "I don't want there to
 * be five markings on the document". So this is one quiet line per machine,
 * from two studios up, built only from what is already stored:
 *
 *   a studio's copy of a catalog machine, `studios/{s}/roster/{machineId}`
 *   with `source: "catalog"`, `basedOn` (the catalog machine) and
 *   `overrides` — the studio's DIFF, pruned to the sub-keys that actually
 *   differ (pruneOverrides, features/admin/equipment/clone.ts), so a key
 *   being there means the studio set its own value.
 *
 * The HOUSE DEFAULTS are the studio's hardware settings in the template
 * boundary (lib/machine-template.ts): the baseline positions, the
 * body-type set-ups, the dials' defaults and the starting load. A studio's
 * name for the unit and its photo are its own, not a default, so they are
 * not counted. A switched-off machine is not counted either.
 */
import type { MachineCatalogEntry } from "../../../types/machines";

/** A roster document as the check reads it; every field optional, as Firestore gives them. */
export interface RosterDocLike {
  machineId?: string;
  source?: string;
  basedOn?: string;
  status?: string;
  overrides?: Record<string, unknown>;
}

export interface DefaultSignal {
  machineId: string;
  machineName: string;
  /** "universalBaseline.seatHeightPosition", "defaultSettings.seat". */
  path: string;
  /** "the seat position", "the Seat dial's default". */
  what: string;
  studioIds: string[];
  studioNames: string[];
}

/** Studios that must set their own before a default is flagged. */
export const MIN_STUDIOS = 2;

const BASELINE_WORDS: Record<string, string> = {
  seatHeightPosition: "the seat position",
  padAxisAlignment: "the pad alignment",
  restraintsAnchoring: "the belts and pads",
  gripHandPosition: "the grip",
  startingWeightStackGap: "the starting gap",
};

const BODY_WORDS: Record<string, string> = {
  shorterStature: "the set-up for shorter clients",
  tallerStature: "the set-up for taller clients",
  limitedMobility: "the set-up for limited mobility",
};

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The default paths one studio's overrides set, and the words for each. */
export function overriddenDefaults(
  overrides: Record<string, unknown> | undefined,
  catalogEntry: MachineCatalogEntry | undefined,
): { path: string; what: string }[] {
  if (!isObject(overrides)) return [];
  const out: { path: string; what: string }[] = [];
  const baseline = overrides.universalBaseline;
  if (isObject(baseline)) {
    for (const key of Object.keys(baseline)) out.push({ path: `universalBaseline.${key}`, what: BASELINE_WORDS[key] ?? `the ${humanize(key)}` });
  }
  const body = overrides.bodyTypeAdjustments;
  if (isObject(body)) {
    for (const key of Object.keys(body)) out.push({ path: `bodyTypeAdjustments.${key}`, what: BODY_WORDS[key] ?? `the ${humanize(key)} set-up` });
  }
  const dials = overrides.defaultSettings;
  if (isObject(dials)) {
    const fields = (catalogEntry as { settingFields?: { key?: string; label?: string }[] } | undefined)?.settingFields ?? [];
    for (const key of Object.keys(dials)) {
      const label = fields.find((f) => f.key === key)?.label?.trim();
      out.push({ path: `defaultSettings.${key}`, what: `the ${label || humanize(key)} dial's default` });
    }
  }
  const load = overrides.baselineLoad;
  if (isObject(load)) {
    if ("male" in load) out.push({ path: "baselineLoad.male", what: "the starting load for men" });
    if ("female" in load) out.push({ path: "baselineLoad.female", what: "the starting load for women" });
  }
  return out;
}

/**
 * Every house default that MIN_STUDIOS or more studios set their own, grouped
 * by machine in the catalog's order of names, the most studios first within one.
 */
export function defaultSignals(
  rosters: Record<string, readonly RosterDocLike[]>,
  studioName: (studioId: string) => string,
  catalog: readonly MachineCatalogEntry[],
  minStudios: number = MIN_STUDIOS,
): DefaultSignal[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const tally = new Map<string, { machineId: string; path: string; what: string; studios: Set<string> }>();
  for (const [studioId, entries] of Object.entries(rosters)) {
    for (const e of entries) {
      if (e.source !== "catalog" || !e.basedOn) continue;
      if (String(e.status ?? "").toLowerCase() === "inactive") continue;
      for (const d of overriddenDefaults(e.overrides, byId.get(e.basedOn))) {
        const key = `${e.basedOn}|${d.path}`;
        const t = tally.get(key) ?? { machineId: e.basedOn, path: d.path, what: d.what, studios: new Set<string>() };
        t.studios.add(studioId);
        tally.set(key, t);
      }
    }
  }
  return [...tally.values()]
    .filter((t) => t.studios.size >= minStudios)
    .map((t) => {
      const ids = [...t.studios].sort((a, b) => studioName(a).localeCompare(studioName(b)));
      return {
        machineId: t.machineId,
        machineName: byId.get(t.machineId)?.name ?? t.machineId,
        path: t.path,
        what: t.what,
        studioIds: ids,
        studioNames: ids.map(studioName),
      };
    })
    .sort((a, b) => a.machineName.localeCompare(b.machineName) || b.studioIds.length - a.studioIds.length || a.path.localeCompare(b.path));
}

function names(list: readonly string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** "Leg Press: 2 studios set their own seat position (Solon and Strongsville)." */
export function signalLine(s: DefaultSignal): string {
  const what = s.what.replace(/^the /, "");
  const n = s.studioIds.length;
  return `${s.machineName}: ${n === 1 ? "1 studio sets its" : `${n} studios set their`} own ${what} (${names(s.studioNames)}).`;
}
