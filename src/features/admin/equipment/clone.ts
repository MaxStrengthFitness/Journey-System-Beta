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
  RosterEntryFromCatalog,
} from "../../../types/machines";
import { ADDITIVE_DEFINITION_FIELDS } from "../../../lib/resolve-machine";
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

export interface CloneInput {
  studioId: string;
  catalogId: string;
  catalog: Partial<MachineDefinition>;
  /** Fields the studio deliberately changed. */
  edits?: Partial<MachineDefinition>;
  local?: LocalMetadata;
  authorUid?: string | null;
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
    out[key] = next as never;
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
 * The roster document for a cloned machine.
 *
 * `source: "catalog"` with `basedOn`, NOT `source: "custom"`. A cloned MSF
 * template is still that template — it must keep inheriting the catalog and
 * must keep rolling up against every other one of its kind in network
 * reporting. `custom` is for equipment the catalog has never heard of, and
 * choosing it here would quietly split a leaderboard.
 */
export function buildClone(input: CloneInput): Omit<
  RosterEntryFromCatalog,
  "updatedAt"
> & { updatedBy: string | null } {
  const overrides = pruneOverrides(input.catalog, {
    ...(input.edits ?? {}),
    ...(input.local?.localName?.trim()
      ? ({ name: input.local.localName.trim() } as Partial<MachineDefinition>)
      : {}),
  });

  const unit =
    input.local?.serialNumber?.trim() ||
    input.local?.manufacturer?.trim() ||
    input.local?.installedAt
      ? {
          ...(input.local?.serialNumber?.trim()
            ? { serialNumber: input.local.serialNumber.trim() }
            : {}),
          ...(input.local?.manufacturer?.trim()
            ? { manufacturer: input.local.manufacturer.trim() }
            : {}),
          ...(input.local?.installedAt
            ? { installedAt: input.local.installedAt }
            : {}),
        }
      : undefined;

  return {
    machineId: input.catalogId,
    studioId: input.studioId,
    source: "catalog",
    basedOn: input.catalogId,
    status: "active",
    ...(Object.keys(overrides).length ? { overrides } : {}),
    ...(input.local?.notes?.trim() ? { studioNotes: input.local.notes.trim() } : {}),
    ...(unit ? { unit } : {}),
    updatedBy: input.authorUid ?? null,
  } as Omit<RosterEntryFromCatalog, "updatedAt"> & { updatedBy: string | null };
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
