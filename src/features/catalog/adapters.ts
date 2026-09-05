/**
 * CATALOG — assemble one CatalogMachine from every source that describes it.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * Same job as features/equipment/adapters.ts: merge sources that each describe
 * a machine partially, with the most specific winning per field, so the UI
 * upgrades itself as the roster backfill lands rather than needing a rewrite.
 *
 * Precedence, highest first:
 *
 *   1. the studio's roster entry      what THIS location actually has
 *   2. the Firestore catalog doc      the shared library
 *   3. MACHINE_ANATOMY                in-repo taxonomy + diagram targeting
 *   4. MACHINE_DATABASE               in-repo coaching content
 *
 * Note what is not in the chain: machineMuscleMap, deleted in phase 2.
 */

import type { Machine } from "../../types";
import type { ResolvedMachine } from "../../types/machines";
import { MACHINE_ANATOMY } from "../../data/machine-anatomy-map";
import {
  MACHINE_DATABASE,
  type MachineKnowledge,
} from "../../data/machine-database";
import { resolveMachineAnatomy } from "./anatomy";
import { CANONICAL_TO_DB_KEY, canonicalMachineId } from "./machine-identity";
import type { CatalogMachine, CatalogRosterStatus } from "./types";

/**
 * MACHINE_DATABASE's entry for a machine, via the id table rather than the
 * ten-branch if-ladder this replaces.
 */
function knowledgeFor(
  canonicalId: string,
  name: string,
): MachineKnowledge | null {
  const dbKey = CANONICAL_TO_DB_KEY[canonicalId];
  if (dbKey && MACHINE_DATABASE[dbKey]) return MACHINE_DATABASE[dbKey];
  if (MACHINE_DATABASE[canonicalId]) return MACHINE_DATABASE[canonicalId];

  const lower = name.toLowerCase();
  return (
    Object.values(MACHINE_DATABASE).find(
      (db) =>
        db.name.toLowerCase() === lower ||
        lower.includes(db.name.toLowerCase()),
    ) ?? null
  );
}

/** First non-empty value wins. Empty strings and empty arrays do not count. */
function firstOf<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

/** Some legacy docs store targetMuscles as a comma-joined string. */
function asList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return undefined;
}

export interface AdaptOptions {
  /** studios/{id}/machineNotes, keyed by machineId. */
  studioNotes?: Record<string, { notes?: string }>;
}

/**
 * The legacy path: AppContent's `Machine[]`, used until a studio's roster is
 * populated. Studio-agnostic by nature — this is the shared library.
 */
export function fromLegacyMachine(
  machine: Machine,
  opts: AdaptOptions = {},
): CatalogMachine {
  const id = canonicalMachineId(machine.id, machine.name);
  const anatomyMap = MACHINE_ANATOMY[id];
  const db = knowledgeFor(id, machine.name);

  return {
    id,
    name: machine.name,
    movementPattern: anatomyMap?.movementPattern ?? "Equipment",
    anatomicalRegion:
      firstOf(machine.anatomicalRegion, db?.category) ?? "Other",

    isStudioCustom: false,
    rosterStatus: "active",

    anatomy: resolveMachineAnatomy(id, machine),

    clinicalNote: anatomyMap?.clinicalNote ?? db?.target ?? "",

    kinematicClassification:
      firstOf(machine.kinematicClassification, db?.kinematicClassification) ??
      "",
    executionPosture:
      firstOf(machine.executionPosture, db?.executionPosture) ?? "",
    setupGap: firstOf(machine.setupGap, db?.setupGap) ?? "Standard Gap",
    requiresHandoff: machine.requiresHandoff ?? db?.requiresHandoff ?? false,

    targetMuscles:
      firstOf(
        asList(machine.targetMusculature),
        asList(machine.targetMuscles),
        db?.targetMuscles,
      ) ?? [],
    synergists: firstOf(asList(machine.synergists), db?.synergists) ?? [],
    clinicalWarnings: db?.clinicalWarnings ?? [],
    contraindicatedFor:
      firstOf(machine.contraindicatedFor, db?.contraindicatedFor) ?? [],
    setup: firstOf(db?.setup, machine.settings) ?? "",
    setupCues: db?.setupCues ?? [],
    execution: db?.execution ?? "",
    executionCues: db?.executionCues ?? [],

    studioNotes: opts.studioNotes?.[id]?.notes ?? machine.trainerTips ?? "",
  };
}

/**
 * The roster path: what THIS studio actually has, including equipment the
 * shared catalog has never heard of.
 *
 * ResolvedMachine already carries the studio's overrides merged in (see
 * lib/resolve-machine.ts), so nothing is re-decided here — this only reshapes
 * it and fills gaps from the in-repo content the catalog docs do not yet have.
 */
export function fromResolvedMachine(
  machine: ResolvedMachine,
  opts: AdaptOptions = {},
): CatalogMachine {
  const id = machine.machineId;
  // Custom machines have no catalog analogue, so fall back through their
  // lineage (`comparisonKey` is basedOn ?? machineId) rather than their own id.
  const contentId = canonicalMachineId(machine.comparisonKey, machine.name);
  const db = knowledgeFor(contentId, machine.name);
  const anatomyMap = MACHINE_ANATOMY[contentId];

  return {
    id,
    name: machine.name,
    movementPattern:
      firstOf(machine.movementPattern, anatomyMap?.movementPattern) ??
      "Equipment",
    anatomicalRegion: machine.anatomicalRegion ?? "Other",

    isStudioCustom: machine.source === "custom",
    rosterStatus: (machine.rosterStatus ?? "active") as CatalogRosterStatus,

    // The document's own MuscleId fields win; contentId supplies the in-repo
    // default so a studio's copy of a catalog machine still lights up.
    anatomy: resolveMachineAnatomy(contentId, machine),

    clinicalNote:
      firstOf(machine.clinicalNote, anatomyMap?.clinicalNote, db?.target) ?? "",

    kinematicClassification:
      firstOf(
        machine.kinematicClassification,
        machine.kinematicClass,
        db?.kinematicClassification,
      ) ?? "",
    executionPosture:
      firstOf(machine.executionPosture, db?.executionPosture) ?? "",
    setupGap:
      firstOf(
        machine.universalBaseline?.startingWeightStackGap,
        db?.setupGap,
      ) ?? "Standard Gap",
    requiresHandoff:
      machine.execution?.requiresHandoff ?? db?.requiresHandoff ?? false,

    targetMuscles:
      firstOf(machine.musculature?.primary, db?.targetMuscles) ?? [],
    synergists:
      firstOf(machine.musculature?.synergists, db?.synergists) ?? [],
    clinicalWarnings:
      firstOf(machine.clinicalWarnings, db?.clinicalWarnings) ?? [],
    contraindicatedFor:
      firstOf(machine.contraindicatedFor, db?.contraindicatedFor) ?? [],
    setup:
      firstOf(machine.universalBaseline?.padAxisAlignment, db?.setup) ?? "",
    setupCues:
      firstOf(
        machine.alignmentCheckpoints?.map((c) => `${c.title}: ${c.verify}`),
        db?.setupCues,
      ) ?? [],
    execution: firstOf(machine.execution?.loadUpProtocol, db?.execution) ?? "",
    executionCues:
      firstOf(machine.execution?.keyCues, db?.executionCues) ?? [],

    // The roster's own studioNotes is the MANAGER's note; the trainer-writable
    // one lives in machineNotes and wins. See features/catalog/mutations.ts.
    studioNotes:
      opts.studioNotes?.[id]?.notes ?? machine.studioNotes ?? "",
  };
}
