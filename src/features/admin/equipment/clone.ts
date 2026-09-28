/**
 * Cloning a catalog machine onto one studio's floor.
 *
 * The brief: "allow them to duplicate foundational MSF templates (e.g. the
 * Imagine Strength Leg Press) and apply localized metadata (e.g. noting a
 * specific seat replacement or pin friction at their location)."
 *
 * The data model for that already exists — RosterEntryFromCatalog carries
 * `overrides`, `studioNotes` and `unit`. What did not exist is the rule that
 * makes it safe, which is this:
 *
 *   AN OVERRIDE IS ONLY STORED WHEN IT ACTUALLY DIFFERS.
 *
 * Omitted fields stay live-inherited from the catalog. So an override written
 * with a value EQUAL to the catalog's quietly freezes that field forever: an
 * admin later correcting a clinical warning, a contraindication or a cue
 * reaches every studio except the ones that "overrode" it with the same text
 * they were already inheriting. On a field carrying safety content that is not
 * a stale label, it is a warning a coach never sees.
 *
 * So cloning stores the difference and nothing else — the same principle as
 * the admin form's diff-saving, for a more serious reason.
 */

import type {
  MachineDefinition,
  StudioMachineRosterEntry,
} from "../../../types/machines";
import { ADDITIVE_DEFINITION_FIELDS, pruneMergedField } from "../../../lib/resolve-machine";
import { sameValue } from "../formState";

export interface LocalMetadata {
  /** What this location calls it, when that differs from the catalog. */
  localName?: string;
  /** "Seat replaced March 2026", "pin sticks on the 90lb stack". */
  notes?: string;
  serialNumber?: string;
  manufacturer?: string;
  installedAt?: string;
}

/**
 * Only the edits that genuinely differ from the catalog.
 *
 * Anything equal to the inherited value is DROPPED, so the studio keeps
 * receiving corrections to it. See the note at the top of this file for why
 * that matters more than it looks.
 */
export function pruneOverrides(
  catalog: Partial<MachineDefinition>,
  edits: Partial<MachineDefinition> | undefined,
): Partial<MachineDefinition> {
  if (!edits) return {};
  const out: Partial<MachineDefinition> = {};
  for (const key of Object.keys(edits) as (keyof MachineDefinition)[]) {
    const next = edits[key];
    // An explicitly blank value is not an override either — it is someone
    // clearing a box they never meant to fill, and storing it would blank the
    // inherited value on the floor.
    if (next === undefined || next === null || next === "") continue;
    if (sameValue(next, catalog[key])) continue;

    // A bag of independent values (the baseline, the body-type columns, the
    // dial defaults) is reduced to the sub-keys that actually differ, so the
    // rest keeps live-inheriting. A form always hands back the whole object;
    // storing the whole object is what quietly freezes a studio out of
    // corrections it never asked to opt out of. See resolve-machine.
    const pruned = pruneMergedField(key, catalog[key], next);
    if (pruned === undefined) continue;
    out[key] = pruned as never;
  }
  return out;
}

/** True when this clone changes nothing and is a plain adoption. */
export function isPlainAdoption(
  overrides: Partial<MachineDefinition>,
  local: LocalMetadata | undefined,
): boolean {
  return (
    Object.keys(overrides).length === 0 &&
    !local?.notes?.trim() &&
    !local?.serialNumber?.trim() &&
    !local?.manufacturer?.trim() &&
    !local?.installedAt
  );
}

/**
 * The four things Local set-up shows, as the field paths it writes them to.
 *
 * Nothing else on a roster entry is the dialog's (Sep 28 2026). Its save
 * used to rebuild the whole document (`source: "catalog"`, `basedOn` its own
 * id, `status: "active"`) and merge it in, which turned a studio's own
 * machine into a copy of a catalog machine that does not exist (the floor
 * then dropped it), put a machine that was out of service back in service,
 * and kept any box cleared on purpose, because a merge keeps every key the
 * write leaves out. What a machine IS (`machineId`, `studioId`, `source`,
 * `basedOn`), whether it is in service (`status`, the floor list's switch),
 * the machine editor's other overrides, `order`, `shared`, an offer's marker
 * and the unit's install date all belong to someone else.
 */
export const LOCAL_SETUP_FIELDS = [
  "overrides.name",
  "studioNotes",
  "unit.serialNumber",
  "unit.manufacturer",
] as const;

export type LocalSetupField = (typeof LOCAL_SETUP_FIELDS)[number];

export type LocalSetupUpdate =
  | {
      ok: true;
      /** What to write, by field path. */
      set: Partial<Record<LocalSetupField, string>>;
      /** Left blank: deleted, so the catalog's name comes back and an old note goes. */
      clear: LocalSetupField[];
    }
  | { ok: false; reason: string };

/**
 * What saving Local set-up writes to an EXISTING roster entry, for
 * `updateDoc` and never `setDoc(..., { merge: true })`.
 *
 * Every field the dialog shows is either set or cleared, and nothing else is
 * touched. A local name equal to the catalog's is cleared rather than stored
 * (pruneOverrides), so the machine keeps inheriting any future rename.
 *
 * Refused on a studio's own machine, or a copy of another studio's: it has no
 * catalog machine behind it, and its name is its own definition's, changed
 * with Edit on the floor list.
 */
export function localSetupUpdate(input: {
  entry: Pick<StudioMachineRosterEntry, "source">;
  catalog: Partial<MachineDefinition>;
  local: LocalMetadata;
}): LocalSetupUpdate {
  if (input.entry.source === "custom") {
    return {
      ok: false,
      reason: "This is the studio's own machine. Change it with Edit on the floor list.",
    };
  }

  const localName = input.local.localName?.trim();
  const values: Record<LocalSetupField, string | undefined> = {
    "overrides.name": localName
      ? pruneOverrides(input.catalog, { name: localName }).name
      : undefined,
    studioNotes: input.local.notes?.trim() || undefined,
    "unit.serialNumber": input.local.serialNumber?.trim() || undefined,
    "unit.manufacturer": input.local.manufacturer?.trim() || undefined,
  };

  const set: Partial<Record<LocalSetupField, string>> = {};
  const clear: LocalSetupField[] = [];
  for (const field of LOCAL_SETUP_FIELDS) {
    const value = values[field];
    if (value) set[field] = value;
    else clear.push(field);
  }
  return { ok: true, set, clear };
}

/**
 * A plain-English summary of what this studio changed, for the roster row.
 *
 * Named fields rather than a count, because "3 overrides" tells a manager
 * nothing about whether one of them is a clinical warning.
 */
export function describeOverrides(
  overrides: Partial<MachineDefinition> | undefined,
): string {
  const keys = Object.keys(overrides ?? {});
  if (keys.length === 0) return "Follows the catalog";
  const pretty = keys.map((k) =>
    k
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  );
  if (pretty.length <= 3) return `Local: ${pretty.join(", ")}`;
  return `Local: ${pretty.slice(0, 3).join(", ")} +${pretty.length - 3} more`;
}

/**
 * Fields where an override REPLACES safety-relevant content.
 *
 * Deliberately NOT clinicalWarnings, contraindicatedFor or
 * alignmentCheckpoints: lib/resolve-machine.ts treats those three as
 * ADDITIVE — a studio can add to them and can never remove an Academy
 * warning, and the union dedupes. Flagging them would be crying wolf.
 *
 * The ones below replace cleanly, which is the simpler rule and the reason
 * they need saying out loud: a studio overriding `execution` stops receiving
 * Academy corrections to how the movement is performed, and nobody on that
 * floor will ever be told.
 *
 * Flagged, not blocked. A location with a genuinely different unit may need
 * exactly this.
 */
const CANDIDATE_SAFETY_FIELDS: (keyof MachineDefinition)[] = [
  "execution",
  "universalBaseline",
  "settingFields",
  "clinicalNote",
  "sequencingContraindications",
];

/**
 * Derived from resolve-machine rather than hand-listed, because a hand-listed
 * copy is what a test caught being wrong: sequencingContraindications LOOKS
 * like replacing safety content and is in fact additive, so warning about it
 * would be crying wolf on a field a studio can only ever add to.
 */
export const REPLACING_SAFETY_FIELDS: (keyof MachineDefinition)[] =
  CANDIDATE_SAFETY_FIELDS.filter(
    (f) => !ADDITIVE_DEFINITION_FIELDS.includes(f),
  );

export function overriddenSafetyFields(
  overrides: Partial<MachineDefinition> | undefined,
): string[] {
  if (!overrides) return [];
  return REPLACING_SAFETY_FIELDS.filter((f) => f in overrides).map(String);
}
