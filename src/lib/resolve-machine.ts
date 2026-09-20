import {
  AlignmentCheckpoint,
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
 * Safety content a studio may ADD to but never remove from.
 *
 * Everything else replaces cleanly on override, which is the simpler and
 * more predictable rule. These are the deliberate exception: under plain
 * replacement, a studio editing the array to append a note of their own
 * could silently drop "use extremely light loads; stop immediately if any
 * cervical pain is felt" for every trainer at that location.
 *
 * Admins can still edit the catalog's entries — those changes reach every
 * studio, precisely because a studio can never override them away.
 */
const ADDITIVE_STRING_FIELDS = [
  "clinicalWarnings",
  "contraindicatedFor",
  "sequencingContraindications",
] as const satisfies readonly (keyof MachineDefinition)[];

/**
 * Alignment checkpoints are additive for the same reason, but they are
 * objects, so they dedupe on `title` rather than on the whole value.
 */
const ADDITIVE_CHECKPOINT_FIELDS = [
  "alignmentCheckpoints",
] as const satisfies readonly (keyof MachineDefinition)[];

/** Everything a studio can extend but not delete. For docs and UI copy. */
export const ADDITIVE_DEFINITION_FIELDS: readonly (keyof MachineDefinition)[] =
  [...ADDITIVE_STRING_FIELDS, ...ADDITIVE_CHECKPOINT_FIELDS];

type AdditiveStringField = (typeof ADDITIVE_STRING_FIELDS)[number];
type AdditiveCheckpointField = (typeof ADDITIVE_CHECKPOINT_FIELDS)[number];

function isAdditiveStringField(key: string): key is AdditiveStringField {
  return (ADDITIVE_STRING_FIELDS as readonly string[]).includes(key);
}

function isAdditiveCheckpointField(key: string): key is AdditiveCheckpointField {
  return (ADDITIVE_CHECKPOINT_FIELDS as readonly string[]).includes(key);
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

/** Same union, keyed on checkpoint title so a studio can reword its own. */
function unionCheckpoints(
  base: AlignmentCheckpoint[] = [],
  extra: AlignmentCheckpoint[] = [],
): AlignmentCheckpoint[] {
  const seen = new Set<string>();
  const out: AlignmentCheckpoint[] = [];
  for (const c of [...base, ...extra]) {
    const k = (c?.title ?? "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * Fields that are a BAG OF INDEPENDENT VALUES, not one value.
 *
 * `universalBaseline` holds five separate sentences — seat, axis, restraints,
 * grip, starting gap — written by five different judgements. Under plain
 * replacement, a studio correcting the seat position on their model has to
 * send the whole object, and the other four stop live-inheriting: an admin
 * later fixing the axis-alignment line reaches every location EXCEPT the ones
 * that once edited a seat height. Nobody would ever see that happen.
 *
 * So these merge per key, the same way `defaultSettings` already did and for
 * exactly the same reason. A key the studio did not send keeps inheriting; a
 * key sent as "" is a deliberate clear (a plate-loaded unit has no grip
 * position) and wins.
 *
 * `bodyTypeAdjustments` is the same argument one level deeper: its three
 * columns are independent, and the limited-mobility column in particular
 * carries the Academy's static-hold guidance that a studio editing the
 * taller-stature column must not drop.
 */
const MERGED_FLAT_FIELDS = [
  "universalBaseline",
  "defaultSettings",
] as const satisfies readonly (keyof MachineDefinition)[];

const MERGED_COLUMN_FIELDS = [
  "bodyTypeAdjustments",
] as const satisfies readonly (keyof MachineDefinition)[];

/** Every field whose override merges per key rather than replacing. */
export const MERGED_DEFINITION_FIELDS: readonly (keyof MachineDefinition)[] = [
  ...MERGED_FLAT_FIELDS,
  ...MERGED_COLUMN_FIELDS,
];

function isMergedFlatField(key: string): boolean {
  return (MERGED_FLAT_FIELDS as readonly string[]).includes(key);
}

function isMergedColumnField(key: string): boolean {
  return (MERGED_COLUMN_FIELDS as readonly string[]).includes(key);
}

type Bag = Record<string, unknown>;

/** One level: studio keys win, catalog keys survive where the studio was silent. */
function mergeFlat(base: unknown, extra: unknown): Bag {
  return { ...((base as Bag) ?? {}), ...((extra as Bag) ?? {}) };
}

/** Two levels: merge each column, so one column's edit leaves the others alone. */
function mergeColumns(base: unknown, extra: unknown): Bag {
  const b = (base as Bag) ?? {};
  const e = (extra as Bag) ?? {};
  const out: Bag = { ...b };
  for (const key of Object.keys(e)) {
    out[key] = mergeFlat(b[key], e[key]);
  }
  return out;
}

/**
 * Drop sub-keys that already match the catalog, so only real differences are
 * stored.
 *
 * The write-side half of the merge above, and useless without it: merging per
 * key only preserves live inheritance if the override does not carry a copy
 * of every inherited value. The editor hands us a whole object because that
 * is what a form produces; this reduces it to what the studio actually
 * changed. Exported for clone.ts, which is the one place a roster override
 * is built.
 */
export function pruneMergedField(
  field: keyof MachineDefinition,
  base: unknown,
  value: unknown,
): unknown {
  if (value === undefined || value === null) return value;

  if (isMergedFlatField(field)) {
    const b = (base as Bag) ?? {};
    const v = value as Bag;
    const out: Bag = {};
    for (const key of Object.keys(v)) {
      if (sameLoose(v[key], b[key])) continue;
      out[key] = v[key];
    }
    return Object.keys(out).length ? out : undefined;
  }

  if (isMergedColumnField(field)) {
    const b = (base as Bag) ?? {};
    const v = value as Bag;
    const out: Bag = {};
    for (const key of Object.keys(v)) {
      const inner = pruneMergedField(
        "universalBaseline",
        b[key],
        v[key],
      ) as Bag | undefined;
      if (inner) out[key] = inner;
    }
    return Object.keys(out).length ? out : undefined;
  }

  return value;
}

/**
 * Equality for one sub-value, with the same null/undefined blindness the
 * admin forms use: Firestore omits absent fields, so a doc read back has
 * `undefined` where the form put "".
 */
function sameLoose(a: unknown, b: unknown): boolean {
  const an = a === null || a === undefined || a === "" ? "" : a;
  const bn = b === null || b === undefined || b === "" ? "" : b;
  if (an === bn) return true;
  if (typeof an !== typeof bn) return false;
  if (typeof an === "object") return JSON.stringify(an) === JSON.stringify(bn);
  return false;
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

    if (isAdditiveStringField(key)) {
      merged[field] = unionStrings(
        base[field] as string[],
        value as string[],
      ) as never;
      continue;
    }

    if (isAdditiveCheckpointField(key)) {
      merged[field] = unionCheckpoints(
        base[field] as AlignmentCheckpoint[],
        value as AlignmentCheckpoint[],
      ) as never;
      continue;
    }

    if (isMergedFlatField(key)) {
      merged[field] = mergeFlat(base[field], value) as never;
      continue;
    }

    if (isMergedColumnField(key)) {
      merged[field] = mergeColumns(base[field], value) as never;
      continue;
    }

    merged[field] = value as never;
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
    // The MSF machine database (Learning + Planner round): carried through
    // untouched, so the Catalog can show and toggle them.
    ...(entry.shared === true ? { shared: true } : {}),
    ...(entry.source === "custom" && entry.adoptedFrom ? { adoptedFrom: entry.adoptedFrom } : {}),
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
