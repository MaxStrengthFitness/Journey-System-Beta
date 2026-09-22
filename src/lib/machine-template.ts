import type { MachineDefinition, MachineDefinitionField } from "../types/machines";
import { ADDITIVE_DEFINITION_FIELDS } from "./resolve-machine";

/**
 * THE TEMPLATE BOUNDARY — what a studio owns, and what Max Strength owns.
 *
 * Round: Machine authoring, Sep 2026. AJ, Sep 19: "Max Strength has the
 * template. Other studios fulfill it."
 *
 * Three corporate locations grew into a franchise. The company's product is
 * the METHOD — the cadence, the turnarounds, the handoff, the cues, what a
 * machine is actually for. A franchisee buys that method; they do not get to
 * reword it, and a client moving between locations has to meet the same one.
 *
 * What a franchisee genuinely owns is the PHYSICAL UNIT in their building. A
 * leg press at Solon and a leg press in a franchise two states over are the
 * same movement on different hardware: different seat positions, different
 * handle letters, different dials, a different starting stack. Nobody at
 * head office can know those, and a studio that cannot correct them is stuck
 * reading a setup guide that does not describe the machine in front of them.
 *
 * So the line is drawn at the hardware, not at the risk:
 *
 *   studio    the physical machine — name, baseline positions, body-type
 *             adjustments, the dials and their defaults, starting loads,
 *             a photo of THEIR unit.
 *
 *   method    the coaching — musculature, movement pattern, kinematics,
 *             cadence, turnarounds, the handoff, the key cues. Corporate
 *             writes it once and every location reads the same words.
 *
 *   additive  safety — warnings, contraindications, sequencing, alignment
 *             checkpoints. A studio may ADD one; the catalog's own can never
 *             be removed. Already enforced by the merge in resolve-machine;
 *             named here so the editor can say so on screen.
 *
 * An ADMIN editing a studio's machine is not bound by this. That is the
 * point of the `scope` argument: corporate can reach into a location and fix
 * anything, which is what makes the boundary safe to enforce on studios.
 *
 * Pure and exhaustively tested, because it is the only thing standing
 * between a franchisee and the company's own method.
 *
 * ──────────────────────────────────────────────────────────────────────
 * SUPERSEDED IN PRINCIPLE — AJ, Sep 21 2026. NOT YET BUILT.
 *
 * AJ has changed the rule, and this file does not implement the new one
 * yet. Read this before designing anything on top of the boundary.
 *
 *   "a studio should be able to edit whatever they want on there but it's
 *    never gonna fully affect the main Max Strength cataloged item ... they
 *    should be able to customize, add safety, remove safety, do whatever
 *    they want to their machines in their studio but head office controls
 *    the main Max Strength catalog and also approves any submitted
 *    machines."
 *
 * The reasoning is scale and ownership: ~20 studios now, plausibly ~100
 * within two years, EACH OWNED BY A DIFFERENT FRANCHISEE running their own
 * business on the Max Strength protocol. They own the iron in their room.
 * An older unit may genuinely lack the part a warning refers to, and a
 * warning that visibly does not apply is worse than no warning, because it
 * teaches a trainer that warnings can be ignored.
 *
 * WHAT MAKES IT SAFE IS VISIBILITY, NOT PROHIBITION. Three things have to
 * hold, and the third is the one this codebase does not have:
 *
 *   1. lineage — a studio's machine always traces back to the catalog
 *      entry it came from, however far it has been edited (`basedOn`,
 *      already true, and the reason never to re-mint a machineId);
 *   2. the catalog stays head office's, and so does approving submissions
 *      (`features/admin/catalog/review.ts` — already true, and it becomes
 *      MORE load-bearing under the new rule, not less, because it is then
 *      the only place the company's own words are protected);
 *   3. divergence is SURFACED — a view telling head office which studios
 *      changed what, a heavily-modified machine that reads as heavily
 *      modified, and a removed safety line marked and carrying a reason.
 *      "This unit has no seat belt" and "it was in the way" are identical
 *      in the data and are not the same thing.
 *
 * So the round is: open `canEdit` / `scopeOverrides`, change the additive
 * merge in `resolve-machine.ts` (which currently unions safety lines so
 * they CANNOT be removed), and build the divergence view — together.
 * Shipping the permission without the visibility is strictly worse than
 * either state on its own, so do not do half of it.
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * The physical machine. A studio may override any of these on its own copy,
 * and corporate's value is what they start from.
 *
 * Adding a field here is a product decision, not a refactor: it hands every
 * franchise location the right to diverge from the standard on that field.
 * `machine-template.test.ts` fails until the new field is named in one of
 * the two lists, so the decision cannot be made by omission.
 */
export const STUDIO_DEFINITION_FIELDS = [
  // What this location calls it. "Our leg press", "Leg Press (Hammer)".
  "name",
  "shortName",
  // Where the seat, pads, belts and handles go ON THIS UNIT.
  "universalBaseline",
  // Shorter / taller / limited mobility, in this unit's own positions
  // ("P3", the narrow handle "N") — which no two models share.
  "bodyTypeAdjustments",
  // The dials this unit actually has, and where they sit by default.
  "settingFields",
  "defaultSettings",
  // Where an average new client starts on THIS stack.
  "baselineLoad",
  // A photo of the machine in their room, not the one in the brochure.
  "imageUrl",
  "formVideoUrl",
] as const satisfies readonly (keyof MachineDefinition)[];

export type StudioDefinitionField = (typeof STUDIO_DEFINITION_FIELDS)[number];

/** Which layer of the template owns a field. */
export type TemplateTier = "studio" | "method" | "additive";

/**
 * Who is doing the editing.
 *
 *   catalog  an admin editing the master entry — the standard itself.
 *   studio   a studio leader editing their location's copy. Bound.
 *   admin    corporate editing a location's copy. Not bound.
 */
export type EditScope = "catalog" | "studio" | "admin";

function isStudioField(field: MachineDefinitionField): boolean {
  return (STUDIO_DEFINITION_FIELDS as readonly string[]).includes(field);
}

function isAdditiveField(field: MachineDefinitionField): boolean {
  return (ADDITIVE_DEFINITION_FIELDS as readonly string[]).includes(field);
}

/**
 * Which tier a field belongs to.
 *
 * Method is the REMAINDER, deliberately. A field added to MachineDefinition
 * and named in neither list lands on the corporate side, so the failure mode
 * of forgetting is "the standard held", never "every location may quietly
 * rewrite the new thing".
 */
export function tierOf(field: MachineDefinitionField): TemplateTier {
  if (isAdditiveField(field)) return "additive";
  if (isStudioField(field)) return "studio";
  return "method";
}

/** Every field on the corporate side, derived so it cannot drift. */
export const METHOD_DEFINITION_FIELDS: readonly MachineDefinitionField[] =
  ([] as MachineDefinitionField[]).concat(
    (
      [
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
        "execution",
        "biomechanicalNotes",
      ] as MachineDefinitionField[]
    ).filter((f) => tierOf(f) === "method"),
  );

/**
 * May this scope write this field?
 *
 * Additive fields are writable by a studio — the merge unions them, so what
 * a studio "writes" there can only ever be an addition. That is enforced in
 * resolve-machine, not here; this only decides whether the editor offers an
 * input at all.
 */
export function canEdit(scope: EditScope, field: MachineDefinitionField): boolean {
  if (scope !== "studio") return true;
  return tierOf(field) !== "method";
}

/**
 * Drop anything this scope is not allowed to have written.
 *
 * The last gate before a roster write. The editor already hides the method
 * fields, so in normal use this removes nothing — which is exactly why it is
 * here. A stale draft, a copied object, a future call site that forgets, or
 * a bug in the form all end up passing a full definition to a studio save,
 * and without this the company's cadence goes out the door with it.
 *
 * Firestore rules would be the stronger place for this, but validating a
 * nested partial in rules costs expressions we have already run out of once
 * (docs/KNOWN-TRAPS.md, the sessions read rule). This is the app-side answer;
 * the rules keep enforcing WHO may write the roster, which they do well.
 */
export function scopeOverrides(
  scope: EditScope,
  overrides: Partial<MachineDefinition> | undefined,
): Partial<MachineDefinition> {
  if (!overrides) return {};
  if (scope !== "studio") return { ...overrides };
  const out: Partial<MachineDefinition> = {};
  for (const key of Object.keys(overrides) as MachineDefinitionField[]) {
    if (!canEdit(scope, key)) continue;
    const value = overrides[key];
    if (value === undefined) continue;
    out[key] = value as never;
  }
  return out;
}

/**
 * What a studio changed that corporate would want to know about, in plain
 * English, for the row under a machine's name.
 *
 * Names the fields rather than counting them: "3 changes" tells a leader
 * nothing about whether one of them is the starting weight.
 */
export const FIELD_LABELS: Partial<Record<MachineDefinitionField, string>> = {
  name: "name",
  shortName: "short name",
  universalBaseline: "baseline setup",
  bodyTypeAdjustments: "body-type adjustments",
  settingFields: "the dials",
  defaultSettings: "dial defaults",
  baselineLoad: "starting weight",
  imageUrl: "photo",
  formVideoUrl: "video",
  clinicalWarnings: "clinical warnings",
  contraindicatedFor: "contraindications",
  sequencingContraindications: "sequencing",
  alignmentCheckpoints: "alignment checkpoints",
  anatomicalRegion: "region",
  movementPattern: "movement pattern",
  kinematicClass: "kinematics",
  kinematicClassification: "kinematic classification",
  executionPosture: "posture",
  primaryMuscles: "primary muscles",
  secondaryMuscles: "secondary muscles",
  synergistMuscles: "synergists",
  musculature: "musculature",
  preferredView: "diagram view",
  clinicalNote: "clinical note",
  execution: "execution and cadence",
  biomechanicalNotes: "biomechanics notes",
};

/** "baseline setup, the dials and starting weight" — never "3 overrides". */
export function describeFields(fields: readonly MachineDefinitionField[]): string {
  const names = fields.map((f) => FIELD_LABELS[f] ?? String(f));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
