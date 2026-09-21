import type { MachineDefinition, MachineDefinitionField } from "../../../types/machines";
import { tierOf, type EditScope } from "../../../lib/machine-template";

/**
 * HOW FINISHED IS THIS MACHINE — per section, in plain English.
 *
 * Round: Machine authoring, Sep 2026.
 *
 * The catalog's real problem was never that a field was hard to fill; it was
 * that nobody could see which ones were empty. Twenty machines rendered as
 * twenty identical rows, and the only way to learn that the leg press had no
 * baseline was to open it and scroll.
 *
 * So the editor and the catalog list both read this. It counts only fields a
 * machine genuinely needs — an absent `shortName` or `formVideoUrl` is not a
 * gap — and it names what is missing rather than printing a percentage,
 * because "no alignment checkpoints" tells a manager what to do and "68%"
 * does not.
 *
 * Pure. The editor calls it on every keystroke of a draft.
 */

export type SectionId =
  | "identity"
  | "musculature"
  | "baseline"
  | "bodytype"
  | "checkpoints"
  | "execution"
  | "safety"
  | "dials";

export interface SectionSpec {
  id: SectionId;
  title: string;
  /** One line under the heading. What this section is FOR, on the floor. */
  blurb: string;
  /** Which fields of the definition this section edits. */
  fields: MachineDefinitionField[];
}

/**
 * The eight sections, in the order the Academy's own template walks them, so
 * a coach moving between the paper guide and this screen sees the same words
 * in the same order.
 */
export const SECTIONS: SectionSpec[] = [
  {
    id: "identity",
    title: "Identity and kinematics",
    blurb: "What this machine is, and how the app groups it.",
    fields: [
      "name",
      "shortName",
      "anatomicalRegion",
      "movementPattern",
      "kinematicClass",
      "kinematicClassification",
      "executionPosture",
      "preferredView",
      "clinicalNote",
      "imageUrl",
      "formVideoUrl",
    ],
  },
  {
    id: "musculature",
    title: "Target musculature",
    blurb: "What the diagram lights up, and what a coach reads.",
    fields: [
      "primaryMuscles",
      "secondaryMuscles",
      "synergistMuscles",
      "musculature",
    ],
  },
  {
    id: "baseline",
    title: "Universal baseline",
    blurb: "Where everything starts for an average new client.",
    fields: ["universalBaseline"],
  },
  {
    id: "bodytype",
    title: "Body-type adjustments",
    blurb: "What changes for a shorter, taller or restricted client.",
    fields: ["bodyTypeAdjustments"],
  },
  {
    id: "checkpoints",
    title: "Alignment checkpoints",
    blurb: "What the coach must see before the client moves.",
    fields: ["alignmentCheckpoints"],
  },
  {
    id: "execution",
    title: "Execution and cadence",
    blurb: "The handoff, the load-up, the count and both turnarounds.",
    fields: ["execution"],
  },
  {
    id: "safety",
    title: "Safety",
    blurb: "Who must not use it, and what never to do on it.",
    fields: [
      "clinicalWarnings",
      "contraindicatedFor",
      "sequencingContraindications",
      "biomechanicalNotes",
    ],
  },
  {
    id: "dials",
    title: "The dials",
    blurb: "Every adjustment on this unit, and where it sits by default.",
    fields: ["settingFields", "defaultSettings", "baselineLoad"],
  },
];

/**
 * A stable name for one check.
 *
 * The prose in `what` is written for a manager and will be reworded; code
 * that needs to reason about a PARTICULAR gap matches this instead. The
 * catalog gate blocks a publish on a named few of them
 * (`features/admin/catalog/review.ts`), so renaming one here fails that
 * file's typecheck rather than quietly un-blocking a machine.
 */
export type GapId =
  | "name"
  | "region"
  | "movement-pattern"
  | "kinematic-class"
  | "clinical-note"
  | "primary-muscles"
  | "musculature-primary"
  | "synergists"
  | "seat"
  | "pad-axis"
  | "restraints"
  | "stack-gap"
  | "shorter"
  | "taller"
  | "limited-mobility"
  | "checkpoints"
  | "load-up"
  | "concentric"
  | "eccentric"
  | "upper-turnaround"
  | "lower-turnaround"
  | "key-cues"
  | "handoff"
  | "failure-notice"
  | "clinical-warnings"
  | "contraindications"
  | "dials"
  | "dial-defaults";

/** One thing a machine still needs, named the way a manager would say it. */
export interface Gap {
  id: GapId;
  section: SectionId;
  /** "no alignment checkpoints", "the starting weight stack gap" */
  what: string;
}

export interface SectionState {
  id: SectionId;
  title: string;
  blurb: string;
  /** How many of this section's checks are satisfied. */
  done: number;
  total: number;
  gaps: Gap[];
  /** True when this scope may not change anything here — read-only. */
  locked: boolean;
}

/**
 * Does this field say anything at all?
 *
 * Exported because the catalog gate asks the same question of a submission's
 * method fields ("did the studio write this, or is it empty?") and two
 * answers to "is it filled in" would disagree the first time one of them
 * learned about a new shape.
 */
export function hasContent(v: unknown): boolean {
  return has(v);
}

function has(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return true;
  if (typeof v === "object") return Object.values(v as object).some(has);
  return Boolean(v);
}

/**
 * The checks, per section.
 *
 * Deliberately NOT "every field is non-empty". A machine with no handoff has
 * no handoff cue, and counting that as a gap would train people to ignore the
 * meter. Each entry below is something a machine actually needs to be usable
 * on the floor.
 */
function checksFor(id: SectionId, d: MachineDefinition): Gap[] {
  const out: Gap[] = [];
  const need = (gapId: GapId, ok: boolean, what: string) => {
    if (!ok) out.push({ id: gapId, section: id, what });
  };

  switch (id) {
    case "identity":
      need("name", has(d.name), "a name");
      need("region", has(d.anatomicalRegion), "a region");
      need("movement-pattern", has(d.movementPattern), "a movement pattern");
      need("kinematic-class", has(d.kinematicClass), "a kinematic class");
      need("clinical-note", has(d.clinicalNote), "the one-line clinical note");
      break;
    case "musculature":
      need("primary-muscles", has(d.primaryMuscles), "the primary muscles for the diagram");
      need("musculature-primary", has(d.musculature?.primary), "the primary muscles in words");
      need("synergists", has(d.musculature?.synergists), "the synergists");
      break;
    case "baseline": {
      const b = d.universalBaseline;
      need("seat", has(b?.seatHeightPosition), "the seat position");
      need("pad-axis", has(b?.padAxisAlignment), "the pad and axis alignment");
      need("restraints", has(b?.restraintsAnchoring), "the restraints");
      need("stack-gap", has(b?.startingWeightStackGap), "the starting weight stack gap");
      break;
    }
    case "bodytype": {
      const b = d.bodyTypeAdjustments;
      need("shorter", has(b?.shorterStature), "what changes for a shorter client");
      need("taller", has(b?.tallerStature), "what changes for a taller client");
      need("limited-mobility", has(b?.limitedMobility), "what changes for limited mobility");
      break;
    }
    case "checkpoints":
      need("checkpoints", has(d.alignmentCheckpoints), "at least one alignment checkpoint");
      break;
    case "execution": {
      const e = d.execution;
      need("load-up", has(e?.loadUpProtocol), "the load-up");
      need("concentric", Number(e?.concentricSeconds) > 0, "the concentric count");
      need("eccentric", Number(e?.eccentricSeconds) > 0, "the eccentric count");
      need("upper-turnaround", has(e?.upperTurnaround?.description), "the upper turnaround");
      need("lower-turnaround", has(e?.lowerTurnaround?.description), "the lower turnaround");
      need("key-cues", has(e?.keyCues), "the key cues");
      // Only ask for the handoff protocol on a machine that HAS a handoff.
      if (e?.requiresHandoff) {
        need("handoff", has(e.handoffProtocol), "how the handoff is performed");
      }
      // Only ask for a safety notice where failure is off the table.
      if (e?.neverToFailure) {
        need("failure-notice", has(e.safetyNotice), "the safety notice that explains never-to-failure");
      }
      break;
    }
    case "safety":
      need("clinical-warnings", has(d.clinicalWarnings), "clinical warnings");
      need("contraindications", has(d.contraindicatedFor), "who must not use it");
      break;
    case "dials":
      need("dials", has(d.settingFields), "the dials this machine has");
      need("dial-defaults", has(d.defaultSettings), "where the dials sit by default");
      break;
  }
  return out;
}

/** Every section's state for one definition, for the rail and the meter. */
export function sectionStates(
  definition: MachineDefinition,
  scope: EditScope = "catalog",
): SectionState[] {
  return SECTIONS.map((s) => {
    const gaps = checksFor(s.id, definition);
    const total = totalChecks(s.id, definition);
    return {
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      done: total - gaps.length,
      total,
      gaps,
      // A section is locked when this scope may edit none of its fields.
      locked: s.fields.every((f) => tierOf(f) === "method" && scope === "studio"),
    };
  });
}

function totalChecks(id: SectionId, d: MachineDefinition): number {
  // Run the checks against an empty definition to learn how many there are,
  // conditionals included, so the denominator matches what was actually asked.
  const blank = {
    ...d,
    name: "",
    anatomicalRegion: "" as MachineDefinition["anatomicalRegion"],
    movementPattern: "" as MachineDefinition["movementPattern"],
    kinematicClass: "" as MachineDefinition["kinematicClass"],
    clinicalNote: "",
    primaryMuscles: [],
    musculature: { primary: [], secondary: [], synergists: [] },
    universalBaseline: {
      seatHeightPosition: "",
      padAxisAlignment: "",
      restraintsAnchoring: "",
      startingWeightStackGap: "",
    },
    bodyTypeAdjustments: {
      shorterStature: {},
      tallerStature: {},
      limitedMobility: {},
    },
    alignmentCheckpoints: [],
    execution: {
      ...d.execution,
      loadUpProtocol: "",
      concentricSeconds: 0,
      eccentricSeconds: 0,
      upperTurnaround: { ...d.execution?.upperTurnaround, description: "" },
      lowerTurnaround: { ...d.execution?.lowerTurnaround, description: "" },
      keyCues: [],
      handoffProtocol: "",
      safetyNotice: "",
    },
    clinicalWarnings: [],
    contraindicatedFor: [],
    settingFields: [],
    defaultSettings: {},
  } as MachineDefinition;
  return checksFor(id, blank).length;
}

export interface Completeness {
  done: number;
  total: number;
  /** 0-100, for a bar. Never shown as the only thing — gaps are named. */
  percent: number;
  gaps: Gap[];
}

/** The whole machine, for the catalog row. */
export function completeness(
  definition: MachineDefinition,
  scope: EditScope = "catalog",
): Completeness {
  const states = sectionStates(definition, scope);
  const done = states.reduce((n, s) => n + s.done, 0);
  const total = states.reduce((n, s) => n + s.total, 0);
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
    gaps: states.flatMap((s) => s.gaps),
  };
}

/**
 * What to put under a machine's name in a list.
 *
 * Names the first few gaps and counts the rest, so a row stays one line and
 * still says something actionable.
 */
export function describeGaps(gaps: Gap[], max = 2): string {
  if (gaps.length === 0) return "";
  const named = gaps.slice(0, max).map((g) => g.what);
  const rest = gaps.length - named.length;
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return rest > 0 ? `Needs ${list}, and ${rest} more` : `Needs ${list}`;
}
