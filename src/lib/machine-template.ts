import type {
  MachineDefinition,
  MachineDefinitionField,
  RemovedSafetyLine,
  SafetyListField,
} from "../types/machines";
import { SAFETY_LIST_FIELDS } from "../types/machines";
import { ADDITIVE_DEFINITION_FIELDS, MIN_REMOVAL_REASON, safetyLineKey, validRemovals } from "./resolve-machine";

/**
 * THE TEMPLATE BOUNDARY — what a studio's copy may change, and what stays
 * Max Strength's.
 *
 * Round: Machine authoring, Sep 2026. AJ, Sep 19: "Max Strength has the
 * template. Other studios fulfill it." Rebuilt for the Sep 21 rule in the
 * Machine Codex's second round, Sep 28 2026.
 *
 * ──────────────────────────────────────────────────────────────────────
 * THE SEP 21 RULE — BUILT Sep 28 2026.
 *
 *   "a studio should be able to edit whatever they want on there but it's
 *    never gonna fully affect the main Max Strength cataloged item ... they
 *    should be able to customize, add safety, remove safety, do whatever
 *    they want to their machines in their studio but head office controls
 *    the main Max Strength catalog and also approves any submitted
 *    machines."  (AJ, Sep 21 2026)
 *
 *   "Yes studios need to be able to customize their stuff safety is
 *    definitely a worry but are trusted"  (AJ, Sep 27 2026, confirming it)
 *
 * So a studio may change ANYTHING on its own copy of a catalog machine —
 * the hardware, the method's words, the safety lines — and the change
 * reaches that studio's floor and nowhere else. What keeps it safe is
 * VISIBILITY, not prohibition, and all three parts ship together:
 *
 *   1. lineage — a copy always traces back to its catalog entry (`basedOn`,
 *      and the reason never to re-mint a machineId);
 *   2. the catalog stays head office's, and so does approving what a studio
 *      offers it (`features/admin/catalog/review.ts`, more load-bearing now,
 *      not less: it is the one place the company's own words are held);
 *   3. divergence is SURFACED: head office's Compare view
 *      (`features/admin/machines/compare/`) shows every studio's
 *      differences from the standard, and a removed safety line is marked
 *      and carries a REASON, who and when. "This unit has no seat belt" and
 *      "it was in the way" are not the same thing, and the record says which.
 *
 * Removing one of the catalog's safety lines (`SAFETY_LIST_FIELDS`) takes a
 * reason of at least MIN_REMOVAL_REASON characters. Without one the write
 * is refused — here (`scopeOverrides`, `unexplainedRemovals`) and in
 * firestore.rules — and the line stays. Adding to the safety lists is free.
 * An ADMIN inside a location follows the same record, so the next person in
 * Compare can see why.
 * ──────────────────────────────────────────────────────────────────────
 *
 * The TIERS below still say whose words a field is — the unit's (studio),
 * Max Strength's (method), or the safety lists (additive). They no longer
 * decide what a studio may write; they decide how Compare groups a
 * difference, how the editor labels a line, and what the catalog gate
 * reviews when a studio's own machine is offered to every studio.
 *
 *   studio    the physical machine — name, baseline positions, body-type
 *             adjustments, the dials and their defaults, starting loads,
 *             a photo of THEIR unit, its model.
 *
 *   method    the coaching — musculature, movement pattern, kinematics,
 *             cadence, turnarounds, the handoff, the key cues, the Codex
 *             format's leaves. The REMAINDER, so a new field defaults here.
 *
 *   additive  safety — warnings, contraindications, sequencing, alignment
 *             checkpoints, stop rules, watch-outs. Added to freely; one of
 *             the catalog's removed only with a reason.
 *
 * Pure and exhaustively tested.
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
  // Which model this machine is (machineModels/{id}) — the Codex format, v2.
  "modelId",
] as const satisfies readonly (keyof MachineDefinition)[];

export type StudioDefinitionField = (typeof STUDIO_DEFINITION_FIELDS)[number];

/** Which layer of the template owns a field. */
export type TemplateTier = "studio" | "method" | "additive";

/**
 * Who is doing the editing.
 *
 *   catalog  an admin editing the master entry — the standard itself.
 *   studio   a studio leader editing their location's copy.
 *   admin    corporate editing a location's copy.
 *
 * Under the Sep 21 rule a studio and an admin may both change anything on a
 * copy; the scope still names who is writing (the editor's words, the save
 * bar's reach) and the catalog scope is the only one with no standard above.
 */
export type EditScope = "catalog" | "studio" | "admin";

/**
 * The safety lists' bookkeeping: the record of a catalog line a copy does
 * without, and why (the Sep 21 rule). Filed with the safety tier.
 */
export const SAFETY_RECORD_FIELDS = ["removedSafety"] as const satisfies readonly (keyof MachineDefinition)[];

function isStudioField(field: MachineDefinitionField): boolean {
  return (STUDIO_DEFINITION_FIELDS as readonly string[]).includes(field);
}

function isAdditiveField(field: MachineDefinitionField): boolean {
  return (
    (ADDITIVE_DEFINITION_FIELDS as readonly string[]).includes(field) ||
    (SAFETY_RECORD_FIELDS as readonly string[]).includes(field)
  );
}

/**
 * Which tier a field belongs to.
 *
 * Method is the REMAINDER, deliberately. A field added to MachineDefinition
 * and named in neither list lands on the corporate side, so the failure mode
 * of forgetting is "counted as the method" — reviewed by the catalog gate,
 * grouped as a method difference in Compare — never "quietly the unit's".
 */
export function tierOf(field: MachineDefinitionField): TemplateTier {
  if (isAdditiveField(field)) return "additive";
  if (isStudioField(field)) return "studio";
  return "method";
}

/**
 * The Codex format's method fields (v2, Sep 28 2026): the leaves, each
 * dial's rule, the switches and every method line's source. On the
 * corporate side by the remainder rule; listed so the boundary's test and
 * the editor can name them.
 *
 * Kept apart from METHOD_DEFINITION_FIELDS on purpose: the catalog gate's
 * review (features/admin/catalog/review.ts) walks that list against its own
 * hand-written DEFINITION_FIELDS, and a v2 field in one and not the other
 * fails review.test.ts. Folding these in is a two-line change there — see
 * docs/rounds/2026-09-28-codex-2.md, "For the integrator".
 */
export const CODEX_METHOD_FIELDS: readonly MachineDefinitionField[] = (
  [
    "stopRules",
    "watchOuts",
    "setUp",
    "dialRules",
    "getSet",
    "begin",
    "rep",
    "finish",
    "ifWrong",
    "adapt",
    "program",
    "faults",
    "understand",
    "switches",
    "sources",
  ] as MachineDefinitionField[]
).filter((f) => tierOf(f) === "method");

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
 * Yes, every field, for every scope — the Sep 21 rule: a studio may change
 * anything on its own copy (AJ: "trusted"). The catalog's safety lines are
 * the one place a change needs something more (a reason, to take one off),
 * and that is the write gate's to hold (`scopeOverrides`), not this. Kept as
 * a function because the editor asks it field by field and a future rule
 * would change the answer here, in one place.
 */
export function canEdit(_scope: EditScope, _field: MachineDefinitionField): boolean {
  return true;
}

/** The most catalog safety lines one copy may do without (the rules hold the same number). */
export const MAX_REMOVED_SAFETY = 10;
/** The longest reason a removal may carry (the rules hold the same number). */
export const MAX_REMOVAL_REASON = 300;

/** One of the catalog's safety lines, by the list it is on and the words it is known by. */
export interface SafetyLine {
  field: SafetyListField;
  line: string;
}

/**
 * A write that takes one of the catalog's safety lines off a copy without
 * saying why. Its message names the line, for the save bar.
 */
export class RemovedSafetyError extends Error {
  readonly lines: SafetyLine[];
  constructor(lines: SafetyLine[], message?: string) {
    super(
      message ??
        (lines.length === 1
          ? `Say why “${clip(lines[0].line)}” comes off this unit — or put it back. A safety line leaves only with a reason.`
          : `Say why ${lines.length} of Max Strength's safety lines come off this unit — or put them back. A safety line leaves only with a reason.`),
    );
    this.name = "RemovedSafetyError";
    this.lines = lines;
  }
}

function clip(s: string, n = 60): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Two list entries are one when they say the same thing, whatever order their parts are in. */
function sameEntry(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined && x !== "") out[k] = norm(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * The catalog's safety lines missing from this WHOLE draft of a copy, for
 * each safety list the draft holds. What the editor shows as "removed".
 *
 * A line of a list of records (a checkpoint, a stop rule, a watch-out) is
 * missing when no entry of the draft says what the catalog's says — so a
 * studio REWORDING one of the catalog's checkpoints is taking the catalog's
 * off (with a reason) and adding its own, which is exactly what it is.
 */
export function safetyLinesMissing(
  standard: Partial<MachineDefinition> | null | undefined,
  draft: Partial<MachineDefinition>,
): SafetyLine[] {
  const out: SafetyLine[] = [];
  if (!standard) return out;
  for (const field of SAFETY_LIST_FIELDS) {
    if (!(field in draft)) continue;
    const list = (draft[field] as unknown[]) ?? [];
    for (const e of (standard[field] as unknown[]) ?? []) {
      const line = safetyLineKey(field, e);
      if (!line) continue;
      const kept =
        typeof e === "string"
          ? list.some((d) => typeof d === "string" && d.trim().toLowerCase() === line.toLowerCase())
          : list.some((d) => sameEntry(d, e));
      if (!kept) out.push({ field, line });
    }
  }
  return out;
}

/**
 * The catalog safety lines this WHOLE draft of a copy leaves out WITHOUT a
 * removal record that names them with a reason. Empty means the write may go.
 */
export function unexplainedRemovals(
  standard: Partial<MachineDefinition> | null | undefined,
  draft: Partial<MachineDefinition>,
): SafetyLine[] {
  const records = validRemovals(standard, draft.removedSafety);
  const explained = new Set(records.map((r) => `${r.field}\u0000${r.line.toLowerCase()}`));
  return safetyLinesMissing(standard, draft).filter(
    (l) => !explained.has(`${l.field}\u0000${l.line.toLowerCase()}`),
  );
}

/**
 * THE LAST GATE BEFORE A WRITE.
 *
 * Keeps the definition's own fields and nothing else (a resolved machine
 * hands the editor its `machineId`, `comparisonKey` and the rest, and none
 * of that is an override). Then, by scope:
 *
 *   catalog         the standard: every definition field it was given,
 *                   `undefined` included (the catalog save turns a cleared
 *                   field into a delete), and never a removal record — head
 *                   office changes its own lines directly.
 *
 *   studio / admin  a copy: anything, safety included (the Sep 21 rule),
 *                   with `undefined` dropped (it means "inherit"). Given the
 *                   `standard` and the WHOLE draft, it also:
 *                     · REFUSES the write (RemovedSafetyError) when a
 *                       catalog safety line is missing with no removal
 *                       record carrying a reason;
 *                     · keeps only the removal records that apply, at most
 *                       MAX_REMOVED_SAFETY, each reason at most
 *                       MAX_REMOVAL_REASON characters;
 *                     · stores a safety list as the studio's ADDITIONS only,
 *                       so a line head office later takes out of the catalog
 *                       leaves every floor, not just the ones that never
 *                       touched the list.
 *
 * Without the standard (a studio's own machine inherits nothing), there is
 * nothing to remove and no record is kept.
 */
export function scopeOverrides(
  scope: EditScope,
  overrides: Partial<MachineDefinition> | undefined,
  standard?: Partial<MachineDefinition> | null,
): Partial<MachineDefinition> {
  if (!overrides) return {};
  const src = overrides as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (scope === "catalog") {
    for (const key of DEFINITION_KEYS) {
      if (key === "removedSafety") continue;
      if (key in src) out[key] = src[key];
    }
    return out as Partial<MachineDefinition>;
  }

  for (const key of DEFINITION_KEYS) {
    const v = src[key];
    if (v !== undefined) out[key] = v;
  }
  if (!standard) {
    delete out.removedSafety;
    return out as Partial<MachineDefinition>;
  }

  const draft = out as Partial<MachineDefinition>;
  const missing = unexplainedRemovals(standard, draft);
  if (missing.length) throw new RemovedSafetyError(missing);

  const records = validRemovals(standard, draft.removedSafety).filter((r) =>
    safetyLinesMissing(standard, draft).some(
      (l) => l.field === r.field && l.line.toLowerCase() === r.line.toLowerCase(),
    ),
  );
  if (records.length > MAX_REMOVED_SAFETY) {
    throw new RemovedSafetyError(
      records,
      `At most ${MAX_REMOVED_SAFETY} of Max Strength's safety lines can come off one machine. Put some back, or talk to head office about the standard itself.`,
    );
  }
  const tooLong = records.find((r) => r.reason.length > MAX_REMOVAL_REASON);
  if (tooLong) {
    throw new RemovedSafetyError(
      [tooLong],
      `Keep the reason for “${clip(tooLong.line)}” under ${MAX_REMOVAL_REASON} characters.`,
    );
  }
  if (records.length) out.removedSafety = records;
  else delete out.removedSafety;

  // A safety list keeps only what the studio ADDED (and, on a list of
  // records, its own rewording of a line it removed with a reason).
  const removed = new Set(records.map((r) => `${r.field}\u0000${r.line.toLowerCase()}`));
  for (const field of SAFETY_LIST_FIELDS) {
    if (!(field in out)) continue;
    const stdByKey = new Map<string, unknown>();
    for (const e of (standard[field] as unknown[]) ?? []) {
      stdByKey.set(safetyLineKey(field, e).toLowerCase(), e);
    }
    const additions = ((out[field] as unknown[]) ?? []).filter((e) => {
      const k = safetyLineKey(field, e).toLowerCase();
      if (!k) return false;
      if (!stdByKey.has(k)) return true;
      return removed.has(`${field}\u0000${k}`) && !sameEntry(e, stdByKey.get(k));
    });
    if (additions.length) out[field] = additions;
    else delete out[field];
  }

  return out as Partial<MachineDefinition>;
}

/**
 * A removal record, for the editor: the line, the reason as typed, and who
 * and when (the Auth uid — the rules read the record, and a name that reads
 * as it did that day).
 */
export function removalRecord(
  line: SafetyLine,
  reason: string,
  by: { uid: string; name: string },
  now: Date = new Date(),
): RemovedSafetyLine {
  return {
    field: line.field,
    line: line.line.trim(),
    reason: reason.trim().slice(0, MAX_REMOVAL_REASON),
    by: { uid: by.uid, name: by.name },
    at: now.toISOString(),
  };
}

/** True when a typed reason is enough to take a line off. */
export function reasonIsEnough(reason: string): boolean {
  const t = reason.trim();
  return t.length >= MIN_REMOVAL_REASON && t.length <= MAX_REMOVAL_REASON;
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
  // The Codex format, v2.
  modelId: "the model",
  stopRules: "stop rules",
  watchOuts: "watch-outs",
  setUp: "the set-up",
  dialRules: "the dials' rules",
  getSet: "get set",
  begin: "the begin",
  rep: "the rep",
  finish: "the finish",
  ifWrong: "if something goes wrong",
  adapt: "adapt",
  program: "program it",
  faults: "faults and fixes",
  understand: "understand",
  switches: "the switches",
  sources: "sources",
  removedSafety: "removed safety lines",
};

/**
 * Every field a machine definition may carry, v1 and v2 — the keys a write
 * of a definition or an override may hold. Anything else on a draft is
 * bookkeeping from somewhere else (a resolved machine's `machineId`,
 * `comparisonKey`, `rosterStatus`…) and must not be stored as an override.
 */
export const DEFINITION_KEYS: readonly MachineDefinitionField[] = [
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
  "stopRules",
  "watchOuts",
  "setUp",
  "dialRules",
  "getSet",
  "begin",
  "rep",
  "finish",
  "ifWrong",
  "adapt",
  "program",
  "faults",
  "understand",
  "switches",
  "sources",
  "modelId",
  "removedSafety",
];

/** Only the definition's own fields, for a write that must not carry anything else. */
export function definitionFieldsOnly<T extends object>(value: T): Partial<MachineDefinition> {
  const out: Partial<MachineDefinition> = {};
  const src = value as Record<string, unknown>;
  for (const key of DEFINITION_KEYS) {
    const v = src[key];
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

/** "baseline setup, the dials and starting weight" — never "3 overrides". */
export function describeFields(fields: readonly MachineDefinitionField[]): string {
  const names = fields.map((f) => FIELD_LABELS[f] ?? String(f));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
