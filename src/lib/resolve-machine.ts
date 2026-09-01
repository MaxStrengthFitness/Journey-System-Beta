import {
  MachineCatalogEntry,
  MachineDefinition,
  MachineDefinitionField,
  MachineSettingField,
  ResolvedMachine,
  StudioMachineRosterEntry,
} from "../types/machines";
import { resolveMachineOrder } from "../data/machine-display-order";

/**
 * MACHINE RESOLUTION — the entire merge policy, in one place.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * A studio's roster entry is either a customization of a catalog machine or
 * a machine the studio authored itself. Either way this collapses it into
 * the single ResolvedMachine shape every screen renders from, so no
 * component ever reads two layers and picks a winner. Six files were doing
 * that independently — with three different fallback orders between them —
 * which is how a studio's setting override could win in the session table
 * and lose in the client journey grid.
 *
 * Pure and synchronous on purpose: the whole policy is unit-testable
 * without Firestore.
 */

/**
 * Fields a studio may ADD to but never remove from.
 *
 * Everything else replaces cleanly on override, which is the simpler and
 * more predictable rule. These two are the deliberate exception: under plain
 * replacement, a studio editing the array to append a note of their own
 * could silently drop "use extremely light loads; stop immediately if any
 * cervical pain is felt" for every trainer at that location.
 *
 * Admins can still edit the catalog's warnings — those changes reach every
 * studio, because a studio can never override them away.
 */
export const ADDITIVE_DEFINITION_FIELDS = [
  "clinicalWarnings",
  "contraindicatedFor",
] as const satisfies readonly (keyof MachineDefinition)[];

type AdditiveField = (typeof ADDITIVE_DEFINITION_FIELDS)[number];

function isAdditiveField(key: string): key is AdditiveField {
  return (ADDITIVE_DEFINITION_FIELDS as readonly string[]).includes(key);
}

/** Union preserving catalog order first, then studio additions, deduped. */
function unionStrings(base: string[] = [], extra: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...base, ...extra]) {
    const k = v.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/**
 * Drop stored values whose dial no longer exists.
 *
 * A studio that replaces settingFields (an older model with no Back Pad)
 * would otherwise keep a stale "back-pad" default forever, which then shows
 * up as a phantom row in the settings modal.
 */
function pruneToFields(
  settings: Record<string, string>,
  fields: MachineSettingField[],
): Record<string, string> {
  const valid = new Set(fields.map((f) => f.key));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (valid.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Apply a studio's partial override to a catalog definition.
 *
 * Exported for the roster manager's live preview — it needs the merged
 * result before anything is written.
 */
export function mergeMachineDefinition(
  base: MachineDefinition,
  overrides: Partial<MachineDefinition> | undefined,
): { definition: MachineDefinition; overriddenFields: MachineDefinitionField[] } {
  if (!overrides) {
    return { definition: base, overriddenFields: [] };
  }

  const merged: MachineDefinition = { ...base };
  const overriddenFields: MachineDefinitionField[] = [];

  for (const [key, value] of Object.entries(overrides)) {
    // An explicitly-undefined key means "inherit", not "clear".
    if (value === undefined) continue;

    const field = key as MachineDefinitionField;
    overriddenFields.push(field);

    if (isAdditiveField(key)) {
      merged[field] = unionStrings(
        base[field] as string[],
        value as string[],
      ) as never;
      continue;
    }

    merged[field] = value as never;
  }

  // defaultSettings merges per key (studio wins) rather than replacing, so a
  // studio setting one dial doesn't wipe the catalog's values for the rest.
  if (overrides.defaultSettings) {
    merged.defaultSettings = {
      ...base.defaultSettings,
      ...overrides.defaultSettings,
    };
  }

  merged.defaultSettings = pruneToFields(
    merged.defaultSettings ?? {},
    merged.settingFields ?? [],
  );

  return { definition: merged, overriddenFields };
}

/**
 * Collapse one roster entry (+ its catalog entry, if it has one) into the
 * shape components render.
 *
 * Returns null when a catalog-sourced entry's catalog doc is missing. That
 * should not happen — catalog deletes are denied in firestore.rules, entries
 * are retired instead — but a resolver that throws inside a render path
 * blanks the whole screen, and we have shipped that bug before (see
 * lib/routine-utils.ts). Callers filter nulls; useStudioMachines warns.
 */
export function resolveMachine(
  entry: StudioMachineRosterEntry,
  catalog?: MachineCatalogEntry,
): ResolvedMachine | null {
  let definition: MachineDefinition;
  let overriddenFields: MachineDefinitionField[] = [];
  let comparisonKey: string;

  if (entry.source === "custom") {
    // Self-contained: nothing is inherited, `basedOn` is lineage only.
    definition = {
      ...entry.definition,
      defaultSettings: pruneToFields(
        entry.definition.defaultSettings ?? {},
        entry.definition.settingFields ?? [],
      ),
    };
    comparisonKey = entry.basedOn ?? entry.machineId;
  } else {
    if (!catalog) return null;
    const merged = mergeMachineDefinition(catalog, entry.overrides);
    definition = merged.definition;
    overriddenFields = merged.overriddenFields;
    comparisonKey = entry.basedOn;
  }

  return {
    ...definition,
    machineId: entry.machineId,
    studioId: entry.studioId,
    source: entry.source,
    rosterStatus: entry.status,
    order: resolveMachineOrder(
      entry.machineId,
      catalog?.defaultOrder,
      entry.order,
    ),
    studioNotes: entry.studioNotes,
    catalogStatus: catalog?.status,
    comparisonKey,
    overriddenFields,
  };
}

/**
 * A catalog entry a studio has NOT rostered, presented in the same shape.
 *
 * The roster manager and the onboarding picker both need to list equipment
 * the studio doesn't have yet so it can be added; rendering those through
 * the same type keeps the machine card component single-purpose.
 */
export function resolveUnrostered(
  catalog: MachineCatalogEntry,
  studioId: string,
): ResolvedMachine {
  return {
    ...catalog,
    machineId: catalog.id,
    studioId,
    source: "catalog",
    rosterStatus: "inactive",
    order: resolveMachineOrder(catalog.id, catalog.defaultOrder, undefined),
    catalogStatus: catalog.status,
    comparisonKey: catalog.id,
    overriddenFields: [],
  };
}
