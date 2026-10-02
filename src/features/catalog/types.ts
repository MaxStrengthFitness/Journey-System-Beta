/**
 * CATALOG — the view model.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * One flat shape assembled by adapters.ts, so no component reads two sources
 * and picks a winner. MachineAnatomyCatalogView did that inline — a useMemo
 * with a ten-branch if-ladder walking MACHINE_DATABASE, plus MACHINE_ANATOMY
 * for grouping, plus the legacy Machine prop for notes — which is how the
 * figure and the musculature list beside it ended up disagreeing.
 */

import type { MachineAnatomy } from "./anatomy";
import type { OutOfService } from "./out-of-service";

export type CatalogRosterStatus = "active" | "inactive" | "maintenance";

/** One of Max Strength's safety lines a studio's copy does without, as its page shows it. */
export interface RemovedSafetyShown {
  /** The list it was on: "clinicalWarnings", "contraindicatedFor", "stopRules"... */
  field: string;
  /** The line's words as the catalog has them. */
  line: string;
  /** The studio's reason. */
  reason: string;
  /** Who took it off, by name as it read then; "" when unknown. */
  by: string;
  /** ISO time it came off; "" when unknown. */
  at: string;
}

export interface CatalogMachine {
  /** Canonical id — see machine-identity.ts. */
  id: string;
  name: string;

  // ── taxonomy: drives grouping in the picker ──────────────────────
  movementPattern: string;
  anatomicalRegion: string;

  // ── provenance ───────────────────────────────────────────────────
  /** Defined by this studio rather than inherited from the shared catalog. */
  isStudioCustom: boolean;
  rosterStatus: CatalogRosterStatus;
  /**
   * Why this unit is out of service, and who said so (wave 2 of the Machine
   * Catalog room, Sep 28 2026): the roster entry's `outOfService`, carried
   * only while the unit IS out of service. Absent on an entry set out of
   * service before reasons existed, which reads as it always did.
   */
  outOfService?: OutOfService | null;
  /**
   * Which maker's model this unit is (wave 2, Catalog R4): the roster
   * entry's `modelId`, a `machineModels` record's id. Absent when the studio
   * hasn't said, and then nothing about a model is shown (never a guess).
   */
  modelId?: string;

  // ── the figure ───────────────────────────────────────────────────
  anatomy: MachineAnatomy;

  // ── the header ───────────────────────────────────────────────────
  clinicalNote: string;

  // ── the four spec tiles ──────────────────────────────────────────
  kinematicClassification: string;
  executionPosture: string;
  setupGap: string;
  requiresHandoff: boolean;
  /**
   * The Academy says never to take this machine to failure (the Lumbar and
   * the Cervical today): `execution.neverToFailure`, with its reason in
   * `safetyNotice`. Optional, so a machine assembled before the Catalog round
   * (Sep 28 2026) reads as "not flagged" rather than failing to build.
   */
  neverToFailure?: boolean;
  /** The Academy's own sentence for why, shown with the switch. */
  safetyNotice?: string;

  // ── the unit's dials (Machine Catalog round, Catalog R2) ─────────
  /**
   * The dials this studio's unit has, in order: the resolved machine's
   * `settingFields` (key and label), or the legacy machine's setting labels.
   * Optional for the same reason as above.
   */
  dials?: { key: string; label: string }[];
  /**
   * Where the dials sit by default on this unit: the resolved machine's
   * `defaultSettings` (the studio's override merged over the catalog's), keyed
   * by the dial's key or, on the legacy path, its label.
   */
  dialDefaults?: Record<string, string>;

  // ── the sections ─────────────────────────────────────────────────
  /** Precise anatomy as the coach reads it — the diagram cannot say
   *  "Gluteus Medius (hip horizontal abduction)". */
  targetMuscles: string[];
  synergists: string[];
  clinicalWarnings: string[];
  contraindicatedFor: string[];
  setup: string;
  setupCues: string[];
  execution: string;
  executionCues: string[];

  /**
   * Max Strength's safety lines this studio's copy does without, each with
   * the studio's reason (the Sep 21 rule; `removedSafety` on the resolved
   * machine). The unit's page shows them crossed out and faded, never
   * hidden (AJ, Oct 2 2026: "Just cross it out or make it faded").
   * Absent on a machine with none, and on the MSF standard itself.
   */
  removedSafety?: RemovedSafetyShown[];

  /** Studio-scoped, from studios/{id}/machineNotes. Empty until one is written. */
  studioNotes: string;

  // ── the MSF machine database (Learning + Planner round, Sep 2026) ──
  /**
   * The key notes shared between studios are filed under: the MSF id for an
   * MSF machine, the lineage (`basedOn`) for a studio's own. Equals
   * ResolvedMachine.comparisonKey. Absent: use `id`.
   */
  comparisonKey?: string;
  /** This studio listed it in the database (its own machines only). */
  shared?: boolean;
  /** Where the studio's offer to list it stands: an administrator decides (Sep 28 2026). */
  shareStatus?: "pending" | "approved" | "declined";
  shareReviewNote?: string;
  /** Copied from another studio's shared machine. */
  adoptedFrom?: { studioId: string; machineId: string; studioName: string } | null;
}

/** A machine grouped under a heading in the picker. */
export interface CatalogGroup {
  key: string;
  label: string;
  machines: CatalogMachine[];
}

/**
 * How the picker buckets machines.
 *
 * "academy" arrived with Round 2 Phase 6 (Section 18a) and reads the five MSF
 * programming categories from features/routine-builder/academy.ts. It is a
 * third vocabulary rather than a re-mapping of the other two on purpose - see
 * the header of catalog/grouping.ts.
 */
export type GroupingMode = "movement" | "region" | "academy";
