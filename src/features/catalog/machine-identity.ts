/**
 * CATALOG — one machine, one identity.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * The app has been carrying three id conventions for the same twenty machines:
 *
 *   m-ext          AppContent's DEFAULT_MACHINES, MACHINE_ANATOMY, Firestore
 *   leg_extension  MACHINE_DATABASE, routine-templates
 *   sm-{studio}-*  a studio's own equipment (types/machines.ts)
 *
 * MachineAnatomyCatalogView coped with the first two by way of a hand-written
 * if-ladder of ten hardcoded pairs, in the middle of a useMemo, which is where
 * this map came from. Nothing coped with the consequence: useMachines() merges
 * DEFAULT_MACHINES with the machines/ collection BY ID, so any Firestore
 * document filed under the other convention misses its match, falls through to
 * `customMachines`, and renders as a SECOND machine. That is the duplicate Leg
 * Extension in the catalog — "LEG EXTENSION" (m-ext, from defaults) beside
 * "Seated Leg Extension" (leg_extension, from Firestore).
 *
 * Deduping here is a guard, not a repair. The stray document is still in
 * Firestore and still wrong; dedupeMachines names it in a console warning so it
 * can be deleted at the source.
 */

import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";

/** MACHINE_DATABASE / routine-template keys -> the app's canonical m-* id. */
const DB_KEY_TO_CANONICAL: Record<string, string> = {
  "4_way_neck": "m-neck",
  cervical_extension: "m-neck",
  leg_press: "m-leg-press",
  leg_curl: "m-leg-curl",
  leg_extension: "m-ext",
  abduction: "m-hip-abd",
  adduction: "m-hip-add",
  chest_press: "m-chest-press",
  chest_flye: "m-chest-fly",
  overhead_press: "m-overhead-press",
  seated_dip: "m-dip",
  triceps_extension: "m-tricep-ext",
  biceps_curl: "m-bicep",
  lateral_raise: "m-lateral-raise",
  compound_row: "m-compound-row",
  simple_row: "m-simple-row",
  pulldown: "m-pulldown",
  pullover: "m-pullover",
  lumbar_extension: "m-lumbar",
  abdominals: "m-abs",
  torso_rotation: "m-torso-rotation",
};

/** The reverse, for reaching MACHINE_DATABASE from a canonical id. */
export const CANONICAL_TO_DB_KEY: Record<string, string> = Object.entries(
  DB_KEY_TO_CANONICAL,
).reduce<Record<string, string>>((acc, [dbKey, canonical]) => {
  // First wins, so m-neck resolves to 4_way_neck rather than cervical_extension.
  if (!acc[canonical]) acc[canonical] = dbKey;
  return acc;
}, {});

/**
 * Loose name forms to try, so "Seated Leg Extension" and "LEG EXTENSION" agree.
 *
 * Two candidates, because a parenthetical can be either the noise or the whole
 * name: "Chest Press (Hammer)" wants the bracket dropped, while "CX (4 WAY
 * NECK)" is nothing BUT the bracket. Trying both and taking the first hit
 * avoids having to guess which kind we are looking at.
 */
function nameCandidates(name: string): string[] {
  const base = name.toLowerCase();
  const strip = (v: string) =>
    v
      .replace(/\b(seated|standing|machine|the|cx)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "");
  return [strip(base.replace(/\(.*?\)/g, " ")), strip(base)].filter(Boolean);
}

const CANONICAL_BY_NORMALIZED_NAME: Record<string, string> = {
  legextension: "m-ext",
  legcurl: "m-leg-curl",
  legpress: "m-leg-press",
  hipabduction: "m-hip-abd",
  abduction: "m-hip-abd",
  hipadduction: "m-hip-add",
  adduction: "m-hip-add",
  chestpress: "m-chest-press",
  chestfly: "m-chest-fly",
  chestflye: "m-chest-fly",
  pecfly: "m-chest-fly",
  overheadpress: "m-overhead-press",
  lateralraise: "m-lateral-raise",
  compoundrow: "m-compound-row",
  simplerow: "m-simple-row",
  pulldown: "m-pulldown",
  pullover: "m-pullover",
  dip: "m-dip",
  bicepcurl: "m-bicep",
  bicepscurl: "m-bicep",
  tricepextension: "m-tricep-ext",
  tricepsextension: "m-tricep-ext",
  lumbarextension: "m-lumbar",
  lumbar: "m-lumbar",
  abdominals: "m-abs",
  abcrunch: "m-abs",
  torsorotation: "m-torso-rotation",
  "4wayneck": "m-neck",
  neckextension: "m-neck",
  cervicalextension: "m-neck",
};

/**
 * The id this machine should be filed under.
 *
 * Studio-original machines (`sm-*`) are always their own canonical id — two
 * locations' bespoke leg presses are genuinely different machines, and
 * collapsing them would merge their leaderboards. Lineage is expressed through
 * `basedOn`, never through the id.
 */
export function canonicalMachineId(
  id: string | undefined,
  name?: string,
): string {
  if (!id) return "";
  if (id.startsWith("sm-")) return id;
  if (MACHINE_ANATOMY[id]) return id;
  if (DB_KEY_TO_CANONICAL[id]) return DB_KEY_TO_CANONICAL[id];

  // leg_extension -> m-leg-extension, for any pair the table above misses.
  const dashed = `m-${id.replace(/_/g, "-")}`;
  if (MACHINE_ANATOMY[dashed]) return dashed;

  if (name) {
    for (const candidate of nameCandidates(name)) {
      const byName = CANONICAL_BY_NORMALIZED_NAME[candidate];
      if (byName) return byName;
    }
  }

  return id;
}

export interface DedupeResult<T> {
  machines: T[];
  /** canonical id -> the ids that collapsed onto it, when more than one did. */
  collisions: Record<string, string[]>;
}

/**
 * Collapse entries that are the same machine under different ids.
 *
 * The winner is whichever entry already carries the canonical id, so ordering,
 * anatomy and settings keep working. Fields the winner is missing are filled
 * from the loser rather than dropped — a stray Firestore document usually has
 * SOMETHING worth keeping, and silently discarding it is how a studio loses a
 * note it wrote.
 */
export function dedupeMachines<T extends { id?: string; name?: string }>(
  list: T[],
): DedupeResult<T> {
  const byCanonical = new Map<string, T>();
  const seenIds = new Map<string, string[]>();

  for (const item of list) {
    const canonical = canonicalMachineId(item.id, item.name);
    if (!canonical) continue;

    const ids = seenIds.get(canonical) ?? [];
    ids.push(item.id ?? "(no id)");
    seenIds.set(canonical, ids);

    const existing = byCanonical.get(canonical);
    if (!existing) {
      byCanonical.set(canonical, item);
      continue;
    }

    const existingIsCanonical = existing.id === canonical;
    const incomingIsCanonical = item.id === canonical;
    const winner = incomingIsCanonical && !existingIsCanonical ? item : existing;
    const loser = winner === item ? existing : item;

    // Backfill only — never let the loser overwrite a value the winner has.
    const merged = { ...winner } as T;
    for (const [k, v] of Object.entries(loser) as [keyof T, unknown][]) {
      if (k === "id") continue;
      const current = merged[k];
      const isEmpty =
        current === undefined ||
        current === null ||
        current === "" ||
        (Array.isArray(current) && current.length === 0);
      if (isEmpty && v !== undefined) merged[k] = v as T[keyof T];
    }
    byCanonical.set(canonical, merged);
  }

  const collisions: Record<string, string[]> = {};
  for (const [canonical, ids] of seenIds) {
    if (ids.length > 1) collisions[canonical] = ids;
  }

  return { machines: [...byCanonical.values()], collisions };
}
