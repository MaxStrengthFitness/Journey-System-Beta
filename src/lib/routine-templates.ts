/**
 * Routine templates — tiering, normalization and deviation.
 *
 * Round: Routine Template Builder, Sep 2026.
 *
 * Three tiers share the one `routinePresets` collection, distinguished by
 * `tier` (see RoutinePreset in types.ts):
 *
 *   company   admin-authored, visible at every studio. Replaces the
 *             hardcoded GLOBAL_ROUTINE_PRESETS, which now serve only as a
 *             fallback when the collection has none.
 *   studio    authored by a location's owner/leader, visible only there.
 *   trainer   ad-hoc, saved from the Edit Routine drawer. Pre-existing
 *             behavior, unchanged.
 *
 * Templates are ADVISORY. A trainer applies one and may then change
 * anything. What we guarantee is not compliance but visibility: the routine
 * records which template it came from and what the machine list looked like
 * at that moment, so describeDeviation() can say what changed.
 */

import { Routine, RoutinePreset, RoutinePresetTier, Trainer } from "../types";
import { isFounder, isStudioLeader } from "./permissions";

/** Labels for the three tiers. */
export const TIER_LABEL: Record<RoutinePresetTier, string> = {
  company: "Company Standard",
  studio: "Studio Template",
  trainer: "Saved by a trainer",
};

/**
 * Fill in what a stored preset document is missing.
 *
 * Same discipline as normalizeMachineDefinition: a Firestore document is
 * untyped at runtime, and every preset written before Sep 2026 predates
 * `tier` and `machineNotes` entirely. The tier is inferred from `scope`, so
 * an old trainer-saved preset stays a trainer preset.
 */
export function normalizeRoutinePreset(
  raw: Partial<RoutinePreset> | null | undefined,
): RoutinePreset {
  const scope = raw?.scope ?? "global";
  return {
    id: raw?.id,
    name: raw?.name ?? "",
    description: raw?.description ?? "",
    machineIds: raw?.machineIds ?? [],
    machineNotes: raw?.machineNotes ?? {},
    scope,
    tier: raw?.tier ?? (scope === "global" ? "company" : "trainer"),
    studioId: raw?.studioId ?? (scope === "global" ? undefined : scope),
    // A starting routine's part (Oct 8 2026) is carried as it came, so the
    // template editor can show it; it is read as a starting routine only
    // through routine-plan's `startingRoutineFromPreset`, which checks it.
    ...(raw?.start !== undefined ? { start: raw.start } : null),
    // One switched off in the editor keeps its part beside it, for the
    // editor to bring back (`startParked`); nothing else reads it.
    ...(raw?.startParked !== undefined ? { startParked: raw.startParked } : null),
    createdBy: raw?.createdBy,
    createdByName: raw?.createdByName,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
    updatedBy: raw?.updatedBy,
  };
}

/**
 * Can this trainer author a template at this tier?
 *
 * Mirrors the routinePresets rules deliberately: the rules are the
 * enforcement, this only decides what UI to show. Keep the two in step --
 * a button that always fails is worse than no button.
 *
 *   company  isFounder()      <-> isSuperAdmin() in rules
 *   studio   isStudioLeader() <-> isStudioOwnerOrHeadTrainer(studioId)
 *   trainer  any trainer      <-> isAnyAuthenticatedTrainer()
 */
export function canAuthorTier(
  trainer: Trainer | null | undefined,
  tier: RoutinePresetTier,
): boolean {
  if (!trainer) return false;
  if (tier === "company") return isFounder(trainer);
  if (tier === "studio") return isStudioLeader(trainer);
  return true;
}

/** The highest tier this trainer can author, or null if none. */
export function highestAuthorableTier(
  trainer: Trainer | null | undefined,
): RoutinePresetTier | null {
  if (canAuthorTier(trainer, "company")) return "company";
  if (canAuthorTier(trainer, "studio")) return "studio";
  return null;
}

/**
 * Whether a preset is a starting routine: it has a `start` part (Oct 8 2026,
 * src/features/routine-plan/starting-routines.ts). Its `machineIds` is a
 * plan's whole road, not a routine to apply. The one answer to "is this a
 * starting routine" (the whole-branch review, Oct 9 2026: the template
 * editor asked a second rule of its own): a part is a record, never a list,
 * as the editor (`readStartPart`) and the app (`startingRoutineFromPreset`)
 * read it, so a stored `start: []` is an ordinary template in the drawer.
 */
export function isStartingRoutinePreset(preset: Pick<RoutinePreset, "start"> | null | undefined): boolean {
  const start = preset?.start;
  return typeof start === "object" && start !== null && !Array.isArray(start);
}

/**
 * The templates the Edit routine drawer offers: presets that are routines.
 * A starting routine is left out, because applying one there would make its
 * whole road the client's routine and skip the plan (day one, then each
 * step as it joins); Start a plan on Programming is where one is used.
 *
 * Head office's list falls back to the built-in templates while head office
 * has no routine templates of its own, starting routines not counted, so
 * seeding the Academy's eleven (scripts/seed-starting-routines.ts) never
 * takes the built-in ones away. Each list by name.
 */
export function drawerTemplates(
  presets: readonly RoutinePreset[],
  studioId: string | null | undefined,
  builtIn: readonly RoutinePreset[],
): { company: RoutinePreset[]; studio: RoutinePreset[] } {
  const routines = presets.filter((p) => !isStartingRoutinePreset(p));
  const byName = (a: RoutinePreset, b: RoutinePreset) => (a.name || "").localeCompare(b.name || "");
  const company = routines.filter((p) => p.tier === "company").sort(byName);
  // This studio's own templates first, then trainer-saved presets.
  const studio = studioId
    ? routines
        .filter((p) => p.studioId === studioId)
        .sort((a, b) => (a.tier === "studio" ? 0 : 1) - (b.tier === "studio" ? 0 : 1) || byName(a, b))
    : [];
  return { company: company.length > 0 ? company : [...builtIn], studio };
}

/**
 * What a trainer at `studioId` should see: every company template, plus
 * anything scoped to their own studio. Company first, so the house standard
 * is what they reach for, then alphabetical.
 */
export function visibleToStudio(
  presets: RoutinePreset[],
  studioId: string | null | undefined,
): RoutinePreset[] {
  const order: Record<RoutinePresetTier, number> = {
    company: 0,
    studio: 1,
    trainer: 2,
  };
  return presets
    .filter((p) => p.tier === "company" || (!!studioId && p.studioId === studioId))
    .sort(
      (a, b) =>
        order[a.tier ?? "trainer"] - order[b.tier ?? "trainer"] ||
        (a.name || "").localeCompare(b.name || ""),
    );
}

export interface RoutineDeviation {
  /** In the routine but not the template. */
  added: string[];
  /** In the template but dropped from the routine. */
  removed: string[];
  /** Same machines, different order. */
  reordered: boolean;
  hasDeviation: boolean;
}

/**
 * Compare a routine's machine list against the template snapshot taken when
 * it was applied. Returns an all-clear when the routine came from no
 * template, so callers can render unconditionally.
 */
export function describeDeviation(
  machineIds: string[],
  templateMachineIds: string[] | null | undefined,
): RoutineDeviation {
  if (!templateMachineIds || templateMachineIds.length === 0) {
    return { added: [], removed: [], reordered: false, hasDeviation: false };
  }
  const inRoutine = new Set(machineIds);
  const inTemplate = new Set(templateMachineIds);

  const added = machineIds.filter((id) => !inTemplate.has(id));
  const removed = templateMachineIds.filter((id) => !inRoutine.has(id));

  // Order only counts when the sets match; otherwise the add/remove lists
  // already tell the story and "reordered" is noise.
  const sameSet = added.length === 0 && removed.length === 0;
  const reordered =
    sameSet && machineIds.join(" ") !== templateMachineIds.join(" ");

  return {
    added,
    removed,
    reordered,
    hasDeviation: added.length > 0 || removed.length > 0 || reordered,
  };
}

/** One short human sentence, or null when the routine matches its template. */
export function deviationSummary(
  d: RoutineDeviation,
  nameFor: (machineId: string) => string,
): string | null {
  if (!d.hasDeviation) return null;
  const parts: string[] = [];
  if (d.added.length) parts.push(`added ${d.added.map(nameFor).join(", ")}`);
  if (d.removed.length) parts.push(`removed ${d.removed.map(nameFor).join(", ")}`);
  if (d.reordered) parts.push("reordered");
  return parts.join("; ");
}

/** Provenance fields to write when a template is applied to a routine. */
export function templateProvenance(
  preset: RoutinePreset | null,
): Pick<Routine, "templateId" | "templateName" | "templateMachineIds"> {
  if (!preset) return {};
  return {
    templateId: preset.id,
    templateName: preset.name,
    templateMachineIds: [...preset.machineIds],
  };
}
