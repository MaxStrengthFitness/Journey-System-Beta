/**
 * THE CATALOG GATE — reading a studio's machine before it becomes the standard.
 *
 * Round: the catalog gate, Sep 2026.
 *
 * `src/lib/machine-template.ts` exists to stop a franchise location rewriting
 * Max Strength's method on its own copy of a catalog machine. It does that
 * well, at the roster write, with `scopeOverrides` as the last gate.
 *
 * The submission path went around it.
 *
 * A studio's OWN machine (`source: "custom"`) is not a copy of anything, so it
 * stores a whole `MachineDefinition` — musculature, movement pattern,
 * kinematics, the cadence, both turnarounds, the handoff, the key cues. That
 * is correct while the machine is theirs alone: nobody else reads it. But
 * "Offer to the MSF catalog" sends that definition verbatim to
 * `catalogSubmissions`, and Publish wrote it straight to `machines/{id}` —
 * at which point a studio leader's wording of the method became the sentence
 * every other location reads, live-inherited, on a screen a trainer is told
 * to trust. The admin tapping Publish saw a name, a studio, a submitter and a
 * note. Not one word of the method they were adopting.
 *
 * So this module answers the two questions corporate actually has, before the
 * tap rather than after:
 *
 *   what did the studio WRITE that becomes ours?   `authored`
 *   is it finished enough to be the standard?      `blocking` / `remaining`
 *
 * and, when the studio said which machine theirs is most like, a third:
 *
 *   is this a new machine, or our machine with different words?  `likeness`
 *
 * THE BAR IS THE CATALOG'S OWN. `BLOCKING_GAPS` is deliberately short, and
 * `review.test.ts` asserts every one of the twenty generated MSF definitions
 * clears it. A gate a studio's machine must pass and the standard itself
 * would fail is not a gate, it is a grudge.
 *
 * PURE MODULE — no React, no Firestore.
 */

import type {
  MachineCatalogEntry,
  MachineDefinition,
  MachineDefinitionField,
} from "../../../types/machines";
import {
  FIELD_LABELS,
  METHOD_DEFINITION_FIELDS,
  describeFields,
} from "../../../lib/machine-template";
import {
  completeness,
  hasContent,
  type Gap,
  type GapId,
} from "../machines/completeness";
import { sameValue } from "../formState";
import type { CatalogSubmissionDoc } from "../../my-studio/floor";

/* ------------------------------------------------------------------ *
 * What stops a machine being the standard
 * ------------------------------------------------------------------ */

/**
 * The gaps that refuse a publish, and only these.
 *
 * The test for membership is NOT "a finished machine would have it" — half the
 * catalog is missing synergists and eleven of twenty have no dial defaults,
 * because the Academy's guides do not state them and the generator refuses to
 * guess. The test is: **would the app render this machine wrong, or the floor
 * coach it wrong, if this were blank?**
 *
 *   name                         nothing can list it
 *   region, movement-pattern     every grouped view sorts it somewhere arbitrary
 *   kinematic-class              decides the turnaround style the tracker shows
 *   primary-muscles              the body diagram lights up nothing
 *   concentric, eccentric        the count IS the method; a blank is not a cadence
 *   upper/lower-turnaround       likewise — the two ends of the rep
 *   key-cues                     a standard with no cues gives the coach no words
 *   failure-notice               only asked when the studio flagged
 *                                never-to-failure, and then it must say why —
 *                                an unexplained prohibition gets ignored
 *
 * Everything else is NAMED on screen and left to the admin's judgement. An
 * empty baseline or an empty dial list is a studio-tier field: the next
 * location to adopt the machine overrides it anyway, and holding a submission
 * for one is how a queue stops being read.
 */
export const BLOCKING_GAPS: readonly GapId[] = [
  "name",
  "region",
  "movement-pattern",
  "kinematic-class",
  "primary-muscles",
  "concentric",
  "eccentric",
  "upper-turnaround",
  "lower-turnaround",
  "key-cues",
  "failure-notice",
];

const BLOCKING = new Set<GapId>(BLOCKING_GAPS);

/** The gaps in `definition` that refuse a publish. Empty means it may go. */
export function blockingGaps(definition: MachineDefinition): Gap[] {
  return completeness(definition, "catalog").gaps.filter((g) => BLOCKING.has(g.id));
}

/* ------------------------------------------------------------------ *
 * The review
 * ------------------------------------------------------------------ */

/** One method field the studio filled in, which publishing would adopt. */
export interface AuthoredField {
  field: MachineDefinitionField;
  /** "execution and cadence", "movement pattern" — never the raw key. */
  label: string;
}

/** How a submission compares to the catalog machine the studio named. */
export interface Likeness {
  standardId: string;
  standardName: string;
  /** Every field that differs from that machine. */
  differs: MachineDefinitionField[];
  /** The differing fields corporate owns — the ones worth arguing about. */
  method: MachineDefinitionField[];
  /** The differing fields a studio owns anyway — hardware, not method. */
  hardware: MachineDefinitionField[];
}

/**
 * `incomplete`  something on the blocking list is missing. Publish refuses.
 * `read-it`     it may go, and the studio wrote method the catalog will adopt.
 * `ready`       it may go and it claims no method of its own.
 */
export type ReviewVerdict = "incomplete" | "read-it" | "ready";

export interface SubmissionReview {
  verdict: ReviewVerdict;
  /** Refuses the publish. */
  blocking: Gap[];
  /** Named on screen, does not refuse. */
  remaining: Gap[];
  /** Method fields the studio wrote. Publishing makes these Max Strength's. */
  authored: AuthoredField[];
  /** Null when the studio named no machine, or named one the catalog lost. */
  likeness: Likeness | null;
  /** One sentence, for the row and the decision panel. */
  headline: string;
}

const labelFor = (f: MachineDefinitionField): string => FIELD_LABELS[f] ?? String(f);

/**
 * Which method fields this definition actually says something in.
 *
 * `METHOD_DEFINITION_FIELDS` is derived from the template boundary rather
 * than listed here, so a field that moves from studio-owned to corporate-owned
 * starts being reviewed on the same commit that moves it.
 */
export function authoredMethod(definition: MachineDefinition): AuthoredField[] {
  return METHOD_DEFINITION_FIELDS.filter((f) =>
    hasContent((definition as unknown as Record<string, unknown>)[f]),
  ).map((f) => ({ field: f, label: labelFor(f) }));
}

/** What differs between a submission and the catalog machine it is based on. */
export function likenessTo(
  definition: MachineDefinition,
  standard: MachineCatalogEntry | undefined,
): Likeness | null {
  if (!standard) return null;
  const method = new Set<string>(METHOD_DEFINITION_FIELDS as readonly string[]);
  const differs: MachineDefinitionField[] = [];
  // Walk the definition's own fields only. A catalog entry also carries
  // bookkeeping — id, status, defaultOrder, the timestamps — which a
  // definition never has, and comparing those would report every submission
  // as wholly unlike everything in the catalog.
  for (const key of DEFINITION_FIELDS) {
    const a = (definition as unknown as Record<string, unknown>)[key];
    const b = (standard as unknown as Record<string, unknown>)[key];
    if (!hasContent(a) && !hasContent(b)) continue;
    if (!sameValue(a, b)) differs.push(key);
  }
  differs.sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
  return {
    standardId: standard.id,
    standardName: standard.name,
    differs,
    method: differs.filter((f) => method.has(f)),
    hardware: differs.filter((f) => !method.has(f)),
  };
}

/**
 * Every key of `MachineDefinition`, as a runtime set.
 *
 * Written out rather than derived, because a TypeScript type does not survive
 * to runtime — and kept honest by `review.test.ts`, which walks a generated
 * definition and fails on a key missing here.
 */
export const DEFINITION_FIELDS: readonly MachineDefinitionField[] = [
  "name",
  "shortName",
  "anatomicalRegion",
  "movementPattern",
  "kinematicClass",
  "kinematicClassification",
  "executionPosture",
  "primaryMuscles",
  "secondaryMuscles",
  "synergistMuscles",
  "musculature",
  "preferredView",
  "clinicalNote",
  "universalBaseline",
  "bodyTypeAdjustments",
  "alignmentCheckpoints",
  "execution",
  "clinicalWarnings",
  "contraindicatedFor",
  "sequencingContraindications",
  "biomechanicalNotes",
  "settingFields",
  "defaultSettings",
  "baselineLoad",
  "imageUrl",
  "formVideoUrl",
];

/** One sentence naming what the admin is about to adopt, or why they cannot. */
function headlineFor(
  blocking: Gap[],
  authored: AuthoredField[],
  likeness: Likeness | null,
  studioName: string,
): string {
  if (blocking.length > 0) {
    const named = blocking.slice(0, 2).map((g) => g.what);
    const rest = blocking.length - named.length;
    const list = named.length === 1 ? named[0] : `${named[0]} and ${named[1]}`;
    return rest > 0
      ? `Not ready for the catalog — it still needs ${list}, and ${rest} more.`
      : `Not ready for the catalog — it still needs ${list}.`;
  }
  if (likeness && likeness.method.length === 0 && likeness.differs.length > 0) {
    return `Reads like ${likeness.standardName} with different hardware — ${describeFields(likeness.hardware)}. Publishing makes it a second catalog machine.`;
  }
  if (likeness && likeness.method.length > 0) {
    return `Based on ${likeness.standardName}, and ${studioName} wrote their own ${describeFields(likeness.method)}. Read those before publishing.`;
  }
  if (authored.length === 0) {
    return "No method of its own — publishing adopts the hardware and nothing else.";
  }
  return `${studioName} wrote the method here: ${describeFields(authored.map((a) => a.field))}. Publishing makes those Max Strength's words on every floor.`;
}

/**
 * Everything corporate needs before deciding, from the submission and the
 * catalog it would join.
 *
 * `definition` is passed separately so the decision panel can review the
 * version corporate has EDITED rather than the one that arrived — which is
 * the whole point of letting them open it in the editor first.
 */
export function reviewSubmission(
  submission: Pick<CatalogSubmissionDoc, "basedOn" | "studioName">,
  definition: MachineDefinition,
  catalog: MachineCatalogEntry[],
): SubmissionReview {
  const all = completeness(definition, "catalog").gaps;
  const blocking = all.filter((g) => BLOCKING.has(g.id));
  const remaining = all.filter((g) => !BLOCKING.has(g.id));
  const authored = authoredMethod(definition);
  const likeness = likenessTo(
    definition,
    submission.basedOn ? catalog.find((m) => m.id === submission.basedOn) : undefined,
  );
  const verdict: ReviewVerdict =
    blocking.length > 0 ? "incomplete" : authored.length > 0 ? "read-it" : "ready";
  return {
    verdict,
    blocking,
    remaining,
    authored,
    likeness,
    headline: headlineFor(blocking, authored, likeness, submission.studioName || "The studio"),
  };
}

/**
 * What corporate changed between the submitted definition and the one being
 * published — recorded on the submission so the studio can be told, and so a
 * later question about where a catalog sentence came from has an answer.
 */
export function correctedFields(
  submitted: MachineDefinition,
  published: MachineDefinition,
): MachineDefinitionField[] {
  const out: MachineDefinitionField[] = [];
  for (const f of DEFINITION_FIELDS) {
    const a = (submitted as unknown as Record<string, unknown>)[f];
    const b = (published as unknown as Record<string, unknown>)[f];
    if (!hasContent(a) && !hasContent(b)) continue;
    if (!sameValue(a, b)) out.push(f);
  }
  return out;
}
