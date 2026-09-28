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
 * Safety lists whose entries are OBJECTS, so they dedupe on one named part
 * rather than on the whole value: a checkpoint on its title, and the Codex
 * format's stop rules (on their words) and watch-outs (on the condition).
 * The catalog's entry wins a collision, so a studio restating one cannot
 * weaken it.
 */
const ADDITIVE_KEYED_FIELDS = {
  alignmentCheckpoints: "title",
  stopRules: "text",
  watchOuts: "condition",
} as const satisfies Partial<Record<keyof MachineDefinition, string>>;

type AdditiveKeyedField = keyof typeof ADDITIVE_KEYED_FIELDS;

/** Everything a studio can extend but not delete. For docs and UI copy. */
export const ADDITIVE_DEFINITION_FIELDS: readonly (keyof MachineDefinition)[] =
  [...ADDITIVE_STRING_FIELDS, ...(Object.keys(ADDITIVE_KEYED_FIELDS) as AdditiveKeyedField[])];

type AdditiveStringField = (typeof ADDITIVE_STRING_FIELDS)[number];

function isAdditiveStringField(key: string): key is AdditiveStringField {
  return (ADDITIVE_STRING_FIELDS as readonly string[]).includes(key);
}

function isAdditiveKeyedField(key: string): key is AdditiveKeyedField {
  return Object.prototype.hasOwnProperty.call(ADDITIVE_KEYED_FIELDS, key);
}

/**
 * The words a safety list's entry is known by — the whole line for a list of
 * strings, the named part for a list of objects. Exported so the editor, the
 * Compare view and the write gate all agree on when two lines are one line.
 */
export function safetyLineKey(field: keyof MachineDefinition, entry: unknown): string {
  if (typeof entry === "string") return entry.trim();
  if (isAdditiveKeyedField(field) && entry && typeof entry === "object") {
    const part = (entry as Record<string, unknown>)[ADDITIVE_KEYED_FIELDS[field]];
    return typeof part === "string" ? part.trim() : "";
  }
  return "";
}

/** Union preserving catalog order first, then studio additions, deduped. */
function unionStrings(base: string[] = [], extra: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...base, ...extra]) {
    if (typeof v !== "string") continue;
    const k = v.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Same union for a list of objects, keyed on one part, case-blind. */
function unionKeyed<T>(field: AdditiveKeyedField, base: T[] = [], extra: T[] = []): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of [...(Array.isArray(base) ? base : []), ...(Array.isArray(extra) ? extra : [])]) {
    const k = safetyLineKey(field, c).toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * `sources` (the Codex format, v2): one record per method line, keyed on the
 * line's path and words. A studio recording where ITS wording came from
 * replaces the catalog's record for that one line and leaves every other
 * line's record live-inherited — replacing the whole list would freeze head
 * office's future source corrections out of that floor.
 */
const KEYED_MERGE_FIELDS = ["sources"] as const satisfies readonly (keyof MachineDefinition)[];

function isKeyedMergeField(key: string): boolean {
  return (KEYED_MERGE_FIELDS as readonly string[]).includes(key);
}

function sourceKey(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const e = entry as { path?: unknown; line?: unknown };
  const path = typeof e.path === "string" ? e.path.trim() : "";
  if (!path) return "";
  const line = typeof e.line === "string" ? e.line.trim() : "";
  return `${path}\u0000${line}`;
}

/** Catalog records first; a studio record replaces the one for the same line. */
function mergeKeyedRecords(base: unknown, extra: unknown): unknown[] {
  const out = new Map<string, unknown>();
  for (const e of Array.isArray(base) ? base : []) {
    const k = sourceKey(e);
    if (k) out.set(k, e);
  }
  for (const e of Array.isArray(extra) ? extra : []) {
    const k = sourceKey(e);
    if (k) out.set(k, e);
  }
  return [...out.values()];
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
 *
 * The Codex format's object leaves (v2, Sep 28 2026) are bags of the same
 * kind — set-up's entry, preload and starting-load rule are three separate
 * judgements — and so are its switches and its per-dial rules (keyed by the
 * dial's key). They merge per key for the same reason.
 */
const MERGED_FLAT_FIELDS = [
  "universalBaseline",
  "defaultSettings",
  "setUp",
  "dialRules",
  "getSet",
  "begin",
  "rep",
  "finish",
  "adapt",
  "program",
  "understand",
  "switches",
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

  // A line's source record is stored only when it differs from the
  // catalog's record for the same line (the keyed merge above).
  if (isKeyedMergeField(field)) {
    if (!Array.isArray(value)) return undefined;
    const b = new Map<string, unknown>();
    for (const e of Array.isArray(base) ? base : []) {
      const k = sourceKey(e);
      if (k) b.set(k, e);
    }
    const out = value.filter((e) => {
      const k = sourceKey(e);
      return !!k && !sameLoose(e, b.get(k));
    });
    return out.length ? out : undefined;
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

    if (isAdditiveKeyedField(key)) {
      merged[field] = unionKeyed(
        key,
        base[field] as unknown[],
        value as unknown[],
      ) as never;
      continue;
    }

    if (isKeyedMergeField(key)) {
      merged[field] = mergeKeyedRecords(base[field], value) as never;
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

  // THE UNIT'S MODEL (Codex R2, Sep 28 2026). The roster entry names it. A
  // copy never takes the catalog's own `modelId` — that is the reference
  // unit the standard was written on, and calling Solon's leg press a Hoist
  // for being a copy of the page would be a confident wrong answer. A
  // studio's own machine may carry one in its definition.
  let modelId: string | undefined = entry.modelId?.trim() || undefined;

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
    modelId = modelId ?? (entry.definition.modelId?.trim() || undefined);
  } else {
    if (!catalog) return null;
    const merged = mergeMachineDefinition(catalog, entry.overrides);
    definition = merged.definition;
    overriddenFields = merged.overriddenFields;
    comparisonKey = entry.basedOn;
  }
  const { modelId: _inheritedModel, ...unitDefinition } = definition;
  definition = unitDefinition as MachineDefinition;

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
    ...(modelId ? { modelId } : {}),
    // The MSF machine database (Learning + Planner round): carried through
    // untouched, so the Catalog can show and toggle them.
    ...(entry.shared === true ? { shared: true } : {}),
    ...(entry.shareStatus ? { shareStatus: entry.shareStatus } : {}),
    ...(entry.shareReviewNote ? { shareReviewNote: entry.shareReviewNote } : {}),
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
  // No unit, so no unit's model: the catalog's reference model is not this
  // studio's (see resolveMachine).
  const { modelId: _referenceModel, ...rest } = catalog;
  return {
    ...rest,
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
