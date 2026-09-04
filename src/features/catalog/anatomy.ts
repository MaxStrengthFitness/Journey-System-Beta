/**
 * CATALOG — which muscles the figure lights up, resolved from one place.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * Before this file there were FOUR descriptions of "which muscles does this
 * machine work" in the repo, and the figure read the oldest one:
 *
 *   data/machineMuscleMap.ts    legacy react-body-highlighter slugs  <- the figure
 *   MACHINE_ANATOMY             MuscleId, correct                    <- grouping only
 *   MachineDefinition.*Muscles  MuscleId, the real future home       <- unread here
 *   MACHINE_DATABASE.target*    free text                            <- the text list
 *
 * Hip Abduction is the case that exposed it. MACHINE_ANATOMY has had
 * `preferredView: 'back', primary: ['abductors']` the whole time. The legacy map
 * had `primary: ['gluteal'], synergist: ['lower-back', 'obliques']`, so with the
 * figure stuck on the anterior view — where nothing primary is visible — the
 * only thing left to paint was a synergist list that is anatomically wrong
 * anyway. A glute machine lit up the client's core, while the detail panel
 * beside it correctly listed Gluteus Medius. The figure and the text disagreed
 * on the same screen.
 *
 * Precedence, highest first:
 *
 *   1. the machine document's own MuscleId fields  (catalog / roster override)
 *   2. MACHINE_ANATOMY                             (the in-repo default)
 *   3. nothing — an unmapped machine renders a neutral figure, not a wrong one
 *
 * Note what is NOT in that chain: machineMuscleMap, which this round deletes.
 */

import {
  isMuscleId,
  isMuscleVisibleOn,
  musclesForBodySlug,
  toBodySlug,
  type MuscleId,
} from "../../types/machines";
import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";

export interface MachineAnatomy {
  primary: MuscleId[];
  /** Secondary and synergist merged: the figure paints two intensities, not three. */
  secondary: MuscleId[];
  /** The side that actually shows the activation. */
  preferredView: "front" | "back";
}

const NEUTRAL: MachineAnatomy = {
  primary: [],
  secondary: [],
  preferredView: "front",
};

/**
 * Accept a loose string[] only if every entry is a real MuscleId.
 *
 * The legacy `Machine` type declares `primaryMuscles?: string[]`, and in
 * practice some documents carry display names ("Gluteus Medius") rather than
 * ids. Painting those would silently highlight nothing; half-painting them
 * would be worse. All-or-nothing means the Firestore path lights up by itself
 * the moment the roster backfill writes real ids, and is ignored until then.
 */
function asMuscleIds(value: unknown): MuscleId[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: MuscleId[] = [];
  for (const v of value) {
    if (typeof v !== "string" || !isMuscleId(v)) return null;
    out.push(v);
  }
  return out;
}

/** Anything carrying the definition's anatomy fields — catalog doc, resolved
 *  machine, or the legacy Machine shape. All fields optional on purpose. */
export interface AnatomySource {
  primaryMuscles?: unknown;
  secondaryMuscles?: unknown;
  synergistMuscles?: unknown;
  preferredView?: unknown;
}

export function resolveMachineAnatomy(
  machineId: string | null | undefined,
  source?: AnatomySource | null,
): MachineAnatomy {
  if (!machineId) return NEUTRAL;

  const docPrimary = asMuscleIds(source?.primaryMuscles);
  const docSecondary = [
    ...(asMuscleIds(source?.secondaryMuscles) ?? []),
    ...(asMuscleIds(source?.synergistMuscles) ?? []),
  ];

  const fallback = MACHINE_ANATOMY[machineId];

  const primary = docPrimary ?? fallback?.primary ?? [];
  const secondaryRaw =
    docPrimary && docSecondary.length > 0
      ? docSecondary
      : (fallback?.secondary ?? []);

  // A region painted as primary must never also be painted as secondary — the
  // library draws in order, so the lighter pass would win and the machine's
  // actual target would render as an assist.
  //
  // Deduped by REGION, not by muscle id: several ids collapse onto one region
  // (rhomboids and lats are both 'upper-back'; glutes and abductors are both
  // 'gluteal'), so Simple Row's primary rhomboids and secondary lats are the
  // same patch of the figure even though they are different muscles. The names
  // both survive in the detail panel's musculature list, which is where that
  // distinction is real; here there is only one region to paint.
  const primarySet = new Set<MuscleId>(primary);
  const primaryRegions = new Set(
    [...primarySet].map(toBodySlug).filter(Boolean) as string[],
  );
  const secondary = secondaryRaw.filter(
    (m) => !primarySet.has(m) && !primaryRegions.has(toBodySlug(m) ?? ""),
  );

  const rawView =
    (typeof source?.preferredView === "string" ? source.preferredView : null) ??
    fallback?.preferredView ??
    null;

  // 'side' is a valid AnatomyView for authoring, but the model has only two
  // figures — so it has to resolve to one of them. Defaulting to 'front' is
  // what it used to do, and it was wrong for exactly the machines that need
  // the choice made for them: Seated Dip (primary triceps) and Pullover
  // (primary lats) are both authored 'side', and both have primaries the model
  // draws ONLY on the posterior figure. They rendered lit by their synergists
  // alone — a triceps machine that appeared to work the chest.
  //
  // So when the view is unrenderable, pick the side that actually shows the
  // most primary muscles rather than a fixed default. Any future 'side' entry
  // is then right by construction.
  const preferredView: "front" | "back" =
    rawView === "back" || rawView === "front"
      ? rawView
      : pickViewShowing(primary);

  return { primary: [...primarySet], secondary, preferredView };
}

/** The side of the figure that renders the most of these muscles. */
function pickViewShowing(primary: MuscleId[]): "front" | "back" {
  if (primary.length === 0) return "front";
  const front = primary.filter((m) => isMuscleVisibleOn(m, "front")).length;
  const back = primary.filter((m) => isMuscleVisibleOn(m, "back")).length;
  return back > front ? "back" : "front";
}

/**
 * Machines whose target lands on a region of the figure the user just tapped.
 *
 * Primary matches first, then secondary, so tapping the chest reaches Chest
 * Press rather than whichever machine happens to list pecs as a synergist.
 * The old version searched primary and synergist together and took the first
 * key in object order, which is not a ranking.
 */
export function machinesForBodySlug(slug: string): string[] {
  if (!slug) return [];
  const ids = new Set(musclesForBodySlug(slug));
  if (ids.size === 0) return [];

  const primaryHits: string[] = [];
  const secondaryHits: string[] = [];

  for (const entry of Object.values(MACHINE_ANATOMY)) {
    if (entry.primary.some((m) => ids.has(m))) {
      primaryHits.push(entry.machineId);
    } else if ((entry.secondary ?? []).some((m) => ids.has(m))) {
      secondaryHits.push(entry.machineId);
    }
  }

  return [...primaryHits, ...secondaryHits];
}
