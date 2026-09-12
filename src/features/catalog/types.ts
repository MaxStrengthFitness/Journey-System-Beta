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

export type CatalogRosterStatus = "active" | "inactive" | "maintenance";

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

  // ── the figure ───────────────────────────────────────────────────
  anatomy: MachineAnatomy;

  // ── the header ───────────────────────────────────────────────────
  clinicalNote: string;

  // ── the four spec tiles ──────────────────────────────────────────
  kinematicClassification: string;
  executionPosture: string;
  setupGap: string;
  requiresHandoff: boolean;

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
