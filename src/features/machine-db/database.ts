/**
 * THE MSF MACHINE DATABASE — every machine in the network, in one list.
 *
 * Round: Learning + Planner, Sep 2026. AJ: "studio should 100% be able to
 * make machines and add them to the database but I think we just need to
 * have a overall all MSF machines, then studios can adopt machines from this
 * machine database and then studios can also grab information submitted by
 * other studios about the machine". He chose: the studio picks, each time —
 * a "Share with all MSF studios" switch per machine and per tip.
 *
 * WHAT IS IN IT
 * -------------
 *   MSF machines    the shared catalog (machines/{id}): what every studio
 *                   picks from. Admin-written, as before.
 *   studio machines a studio's own machine (studios/{s}/roster, source
 *                   "custom") that its leaders switched to Shared.
 *
 * Nothing new is stored to make the list: it is the catalog plus one
 * collection-group query over the rosters (`shared == true`).
 *
 * ADOPTING
 * --------
 * An MSF machine is adopted the way the Equipment panel always added one: a
 * roster entry `source: "catalog"`, live-inheriting the catalog. A studio
 * machine is adopted as a COPY — `source: "custom"` under the adopting
 * studio's own id (`sm-{studio}-{slug}`), because machine ids are foreign
 * keys in logs and settings queried across studios, and two studios writing
 * logs under one id would merge their numbers. The copy keeps the original's
 * lineage in `basedOn`, so cross-studio roll-ups and shared notes still meet.
 *
 * LINEAGE, THE KEY SHARED NOTES ARE FILED UNDER
 * ---------------------------------------------
 * `comparisonKey` (resolve-machine.ts): the MSF id for an MSF machine, and
 * `basedOn ?? machineId` for a studio's own. A tip shared about Westlake's
 * copy of Solon's sled is filed under Solon's sled, and shows on both.
 *
 * PURE MODULE — no React, no Firestore.
 */

import {
  ACADEMY_CATEGORIES,
  categoryOf,
  type AcademyCategory,
} from "../routine-builder/academy";
import {
  UNCATEGORISED_KEY,
  groupKeyOf,
  groupLabelOf,
  searchMachines,
} from "../catalog/grouping";
import type { CatalogMachine, GroupingMode } from "../catalog/types";
import { studioMachineId, type AdoptedFrom, type MachineDefinition } from "../../types/machines";

/** A studio's own machine that its leaders listed in the database. */
export interface SharedStudioMachine {
  studioId: string;
  studioName: string;
  machineId: string;
  /** Adapted for display. */
  machine: CatalogMachine;
  /** Copied whole on adoption. */
  definition: MachineDefinition;
  basedOn: string | null;
  /** Set on a copy. A copy is never listed — its original is. */
  adoptedFrom: AdoptedFrom | null;
}

/** What this studio has on its floor, as the Catalog already holds it. */
export type FloorMachine = Pick<CatalogMachine, "id" | "comparisonKey" | "adoptedFrom">;

export interface DatabaseEntry {
  /** Unique in the database: the MSF id, or "{studioId}/{machineId}". */
  key: string;
  origin: "msf" | "studio";
  /** For display. `isStudioCustom` is false: "added by this studio" is not true here. */
  machine: CatalogMachine;
  /** The key notes shared about it are filed under. */
  lineageKey: string;
  sharedBy: { studioId: string; studioName: string } | null;
  /** Retired from the MSF catalog: readable, not adoptable. */
  retired: boolean;
  /** This studio's own machine for it, when it has one. */
  floorMachineId: string | null;
  /** The shared machine behind a studio entry, for adopting it. */
  shared: SharedStudioMachine | null;
}

/** The cross-studio key for a machine: its lineage, else itself. */
export function lineageKeyOf(m: { id: string; comparisonKey?: string | null }): string {
  return m.comparisonKey || m.id;
}

export function buildDatabase({
  msf,
  shared,
  floor,
  studioId,
}: {
  /** The catalog, in its display order. */
  msf: { machine: CatalogMachine; retired: boolean }[];
  shared: SharedStudioMachine[];
  floor: FloorMachine[];
  studioId: string | null;
}): DatabaseEntry[] {
  const floorIds = new Set(floor.map((m) => m.id));
  const adoptedCopies = new Map<string, string>();
  for (const m of floor) {
    if (m.adoptedFrom) adoptedCopies.set(`${m.adoptedFrom.studioId}/${m.adoptedFrom.machineId}`, m.id);
  }

  const out: DatabaseEntry[] = [];
  const seen = new Set<string>();

  for (const { machine, retired } of msf) {
    if (seen.has(machine.id)) continue;
    seen.add(machine.id);
    out.push({
      key: machine.id,
      origin: "msf",
      machine: { ...machine, isStudioCustom: false },
      lineageKey: machine.id,
      sharedBy: null,
      retired,
      // A catalog entry on a roster is filed under the catalog id itself.
      floorMachineId: floorIds.has(machine.id) ? machine.id : null,
      shared: null,
    });
  }

  const studio = shared
    .filter((s) => !s.adoptedFrom)
    .sort((a, b) => a.machine.name.localeCompare(b.machine.name) || a.studioName.localeCompare(b.studioName));
  for (const s of studio) {
    const key = `${s.studioId}/${s.machineId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const floorMachineId =
      s.studioId === studioId ? (floorIds.has(s.machineId) ? s.machineId : null) : adoptedCopies.get(key) ?? null;
    out.push({
      key,
      origin: "studio",
      machine: { ...s.machine, isStudioCustom: false },
      lineageKey: s.basedOn || s.machineId,
      sharedBy: { studioId: s.studioId, studioName: s.studioName },
      retired: false,
      floorMachineId,
      shared: s,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Browsing
 * ------------------------------------------------------------------ */

/**
 * The bucket for an entry. Under the Academy's categories a studio machine
 * goes where its lineage goes — Solon's sled, based on the Leg Press, sits
 * with the Leg Press — rather than in "not in the Academy categories".
 */
export function databaseGroupKey(e: DatabaseEntry, mode: GroupingMode): string {
  if (mode === "academy") {
    return categoryOf(e.lineageKey) ?? categoryOf(e.machine.id) ?? UNCATEGORISED_KEY;
  }
  return groupKeyOf(e.machine, mode);
}

export interface DatabaseGroup {
  key: string;
  label: string;
  entries: DatabaseEntry[];
}

export function groupDatabase(entries: DatabaseEntry[], mode: GroupingMode): DatabaseGroup[] {
  const buckets = new Map<string, DatabaseEntry[]>();
  for (const e of entries) {
    const key = databaseGroupKey(e, mode);
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }
  const groups = [...buckets.entries()];
  if (mode === "academy") {
    const rank = (k: string) => {
      const i = ACADEMY_CATEGORIES.indexOf(k as AcademyCategory);
      return i === -1 ? ACADEMY_CATEGORIES.length : i;
    };
    groups.sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  return groups.map(([key, list]) => ({ key, label: groupLabelOf(key, mode), entries: list }));
}

/** Name, pattern, region, muscles and category — and, for a studio's machine, the studio. */
export function searchDatabase(entries: DatabaseEntry[], query: string): DatabaseEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const hits = new Set(searchMachines(entries.map((e) => e.machine), q));
  return entries.filter((e) => hits.has(e.machine) || Boolean(e.sharedBy?.studioName.toLowerCase().includes(q)));
}

export interface DatabaseCounts {
  msf: number;
  studio: number;
  onFloor: number;
  /** Studios with at least one machine in the database. */
  sharingStudios: number;
}

export function databaseCounts(entries: DatabaseEntry[]): DatabaseCounts {
  const studios = new Set<string>();
  let msf = 0;
  let studio = 0;
  let onFloor = 0;
  for (const e of entries) {
    if (e.origin === "msf") msf += 1;
    else {
      studio += 1;
      if (e.sharedBy) studios.add(e.sharedBy.studioId);
    }
    if (e.floorMachineId) onFloor += 1;
  }
  return { msf, studio, onFloor, sharingStudios: studios.size };
}

/* ------------------------------------------------------------------ *
 * Adopting
 * ------------------------------------------------------------------ */

export type AdoptionPlan =
  | { ok: true; machineId: string; entry: Record<string, unknown>; reason?: undefined }
  | { ok: false; reason: string; machineId?: undefined; entry?: undefined };

/**
 * What adopting an entry would write to this studio's roster — or why it
 * cannot. Without the timestamps and the signature, which the write adds.
 *
 *   floorSource "global" means the studio has no roster yet, and the Catalog
 *   is showing every MSF machine as its own. Adding one machine would make
 *   that one the whole roster and the rest vanish from the floor, so it is
 *   refused with the way to set the roster up instead.
 */
export function planAdoption(
  e: DatabaseEntry,
  ctx: {
    studioId: string | null;
    studioName: string;
    floorSource: "roster" | "global";
    /** Every id on the roster, whatever its status — a new copy must not collide. */
    takenIds: Set<string>;
  },
): AdoptionPlan {
  if (!ctx.studioId) return { ok: false, reason: "Pick a studio first." };
  if (e.floorMachineId) return { ok: false, reason: `Already on ${ctx.studioName}'s floor.` };
  if (ctx.floorSource === "global") {
    return {
      ok: false,
      reason: `${ctx.studioName}'s equipment list hasn't been set up, so every MSF machine shows as yours for now. A studio leader sets it up under Operations → Studios → Equipment; then machines can be added from here.`,
    };
  }
  if (e.retired) return { ok: false, reason: "Retired from the MSF catalog, so it can't be added to a floor." };

  if (e.origin === "msf") {
    const id = e.machine.id;
    return {
      ok: true,
      machineId: id,
      entry: { machineId: id, studioId: ctx.studioId, source: "catalog", basedOn: id, status: "active" },
    };
  }

  const src = e.shared;
  if (!src) return { ok: false, reason: "That machine is no longer shared." };
  const base = studioMachineId(ctx.studioId, src.machine.name);
  let id = base;
  for (let n = 2; ctx.takenIds.has(id); n += 1) id = `${base}-${n}`;
  return {
    ok: true,
    machineId: id,
    entry: {
      machineId: id,
      studioId: ctx.studioId,
      source: "custom",
      basedOn: e.lineageKey,
      definition: src.definition,
      adoptedFrom: { studioId: src.studioId, machineId: src.machineId, studioName: src.studioName },
      status: "active",
    },
  };
}

/* ------------------------------------------------------------------ *
 * Sharing notes and tips
 * ------------------------------------------------------------------ */

/** Firestore's array-contains-any limit, and more machines than one tip is ever about. */
export const SHARED_KEYS_MAX = 10;

/**
 * The keys a shared tip or note is filed under: the lineage of each machine
 * it is about, as this studio has them. De-duplicated, capped.
 */
export function sharedKeysFor(machineIds: string[], floor: FloorMachine[]): string[] {
  const byId = new Map(floor.map((m) => [m.id, m]));
  const keys = machineIds.map((id) => lineageKeyOf(byId.get(id) ?? { id }));
  return Array.from(new Set(keys.filter(Boolean))).slice(0, SHARED_KEYS_MAX);
}
