/**
 * HOW THE CATALOG IS ORGANISED, AND WHAT THE LANDING SHOWS.
 *
 * Round: Admin Overhaul, Round 2 Phase 5-7 (Section 18, 18a).
 *
 * THREE VOCABULARIES, NOT TWO
 * ---------------------------
 * The picker already grouped by movement pattern (Horizontal Push, Vertical
 * Pull) and by anatomical region. Section 18a asks for the MSF Academy
 * hierarchy as well - the five programming categories a routine is actually
 * built from.
 *
 * These do not nest, and routine-builder/academy.ts says why in its own
 * header: Hip Abduction is "Lower Body: Posterior Chain" kinematically and its
 * own category, "Hips", for programming. So a third grouping is the honest
 * answer rather than a mapping. What matters is that the Academy grouping here
 * reads MACHINE_CATEGORY from that file rather than re-deriving it, so the
 * catalog and the routine builder cannot drift into disagreeing about which
 * category a machine is in.
 *
 * WHY THE LANDING GROUPS BY ACADEMY CATEGORY
 * ------------------------------------------
 * Section 18 asks for a body-group landing. Of the three vocabularies the
 * Academy one is the coarsest - five buckets against roughly nine movement
 * patterns - and it is the one a trainer already thinks in when planning. Nine
 * tiles is a list; five is a glance.
 *
 * The counts on those tiles are of machines this STUDIO has, not of the global
 * catalog, so a location without a Dip station sees "Upper Body — Push 5", not
 * 6 with one that will 404 when tapped.
 */

import {
  ACADEMY_CATEGORIES,
  CATEGORY_LABEL,
  categoryOf,
  type AcademyCategory,
} from "../routine-builder/academy";
import {
  DEFAULT_UPKEEP_POLICY,
  tallyUpkeep,
  worstStatus,
  type UpkeepEvent,
  type UpkeepPolicy,
  type UpkeepStatus,
} from "../admin/upkeep/upkeepLog";
import type { CatalogGroup, CatalogMachine, GroupingMode } from "./types";

export const GROUPING_LABEL: Record<GroupingMode, string> = {
  movement: "Kinematics",
  region: "Region",
  academy: "Academy",
};

export const GROUPING_MODES: GroupingMode[] = ["movement", "region", "academy"];

/** Machines the Academy has no category for. Never silently dropped. */
export const UNCATEGORISED_KEY = "uncategorised";
export const UNCATEGORISED_LABEL = "Not in the Academy categories";

export function academyCategoryOf(
  machine: Pick<CatalogMachine, "id">,
): AcademyCategory | null {
  return categoryOf(machine.id);
}

/** The bucket key for one machine under one grouping. */
export function groupKeyOf(machine: CatalogMachine, mode: GroupingMode): string {
  if (mode === "academy") return academyCategoryOf(machine) ?? UNCATEGORISED_KEY;
  if (mode === "region") return machine.anatomicalRegion || "Other";
  return machine.movementPattern || "Equipment";
}

export function groupLabelOf(key: string, mode: GroupingMode): string {
  if (mode !== "academy") return key;
  if (key === UNCATEGORISED_KEY) return UNCATEGORISED_LABEL;
  return CATEGORY_LABEL[key as AcademyCategory] ?? key;
}

/**
 * Bucket machines under the given grouping.
 *
 * Under "movement" and "region" the bucket ORDER is insertion order, which is
 * the studio's own display order - a studio can influence it, a hardcoded list
 * could not. Under "academy" the order is the Academy's own, because those
 * five categories are a doctrine with a sequence, and shuffling them by which
 * machine happens to sit first on a roster would make the same screen read
 * differently at two locations.
 */
export function groupMachines(
  machines: CatalogMachine[],
  mode: GroupingMode,
): CatalogGroup[] {
  const buckets = new Map<string, CatalogMachine[]>();
  for (const m of machines) {
    const key = groupKeyOf(m, mode);
    const list = buckets.get(key);
    if (list) list.push(m);
    else buckets.set(key, [m]);
  }

  const entries = [...buckets.entries()];
  if (mode === "academy") {
    const rank = (k: string) => {
      const i = ACADEMY_CATEGORIES.indexOf(k as AcademyCategory);
      return i === -1 ? ACADEMY_CATEGORIES.length : i;
    };
    entries.sort((a, b) => rank(a[0]) - rank(b[0]));
  }

  return entries.map(([key, list]) => ({
    key,
    label: groupLabelOf(key, mode),
    machines: list,
  }));
}

/** The search the picker runs, extracted so it can be tested without a DOM. */
export function searchMachines(
  machines: CatalogMachine[],
  search: string,
): CatalogMachine[] {
  const q = search.trim().toLowerCase();
  if (!q) return machines;
  return machines.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.movementPattern.toLowerCase().includes(q) ||
      m.anatomicalRegion.toLowerCase().includes(q) ||
      m.targetMuscles.some((t) => t.toLowerCase().includes(q)) ||
      // Added with the Academy grouping: searching "hips" should find the
      // hip machines even though no machine has that word in its name.
      (groupLabelOf(groupKeyOf(m, "academy"), "academy")
        .toLowerCase()
        .includes(q)),
  );
}

/* ------------------------------------------------------------------ *
 * THE LANDING
 * ------------------------------------------------------------------ */

export interface LandingTile {
  key: string;
  label: string;
  count: number;
  /** Machine ids in this tile, in roster order. */
  machineIds: string[];
  /** The worst upkeep state among them. Drives the tile's warning dot. */
  upkeep: UpkeepStatus;
  /** How many machines in this tile are due or overdue for something. */
  needsUpkeep: number;
  /** Machines a trainer has reported a problem with. */
  flagged: number;
}

export interface LandingInput {
  machines: CatalogMachine[];
  /** Upkeep events for this studio, from features/admin/upkeep. */
  events: UpkeepEvent[];
  /** Studio-local YYYY-MM-DD. The upkeep layer counts days, not milliseconds. */
  todayKey: string;
  policy?: UpkeepPolicy;
  flaggedIds?: Set<string>;
}

/**
 * The order the four upkeep states escalate in.
 *
 * "never" sits between ok and due deliberately, matching upkeepLog: a machine
 * nobody has ever logged is an onboarding gap rather than a maintenance
 * failure, so it should not outrank one that is genuinely overdue.
 */
const UPKEEP_RANK: UpkeepStatus[] = ["ok", "never", "due", "overdue"];

function worstOf(statuses: UpkeepStatus[]): UpkeepStatus {
  let worst: UpkeepStatus = "ok";
  for (const s of statuses) {
    if (UPKEEP_RANK.indexOf(s) > UPKEEP_RANK.indexOf(worst)) worst = s;
  }
  return worst;
}

/**
 * Every machine's worst upkeep state, keyed by machine id.
 *
 * Exposed separately because the picker rows want it too, and computing it
 * twice from the same event list is how two parts of one screen end up
 * disagreeing about whether a machine is overdue.
 */
export function upkeepByMachine(
  machines: CatalogMachine[],
  events: UpkeepEvent[],
  todayKey: string,
  policy: UpkeepPolicy = DEFAULT_UPKEEP_POLICY,
): Record<string, UpkeepStatus> {
  const out: Record<string, UpkeepStatus> = {};
  for (const m of machines) {
    out[m.id] = worstStatus(tallyUpkeep(events, m.id, todayKey), policy);
  }
  return out;
}

/** The Academy tiles, with counts and upkeep, for the landing screen. */
export function landingTiles(input: LandingInput): LandingTile[] {
  const { machines, events, todayKey, policy, flaggedIds } = input;
  const status = upkeepByMachine(machines, events, todayKey, policy);
  return groupMachines(machines, "academy").map((g) => {
    const perMachine = g.machines.map((m) => status[m.id] ?? "never");
    return {
      key: g.key,
      label: g.label,
      count: g.machines.length,
      machineIds: g.machines.map((m) => m.id),
      upkeep: worstOf(perMachine),
      needsUpkeep: perMachine.filter((s) => s === "due" || s === "overdue")
        .length,
      flagged: flaggedIds
        ? g.machines.filter((m) => flaggedIds.has(m.id)).length
        : 0,
    };
  });
}

export interface CatalogOverview {
  total: number;
  /** Machines this studio added itself rather than inheriting. */
  studioCustom: number;
  outOfService: number;
  needsUpkeep: number;
  flagged: number;
  /** Academy categories with no machine at all at this studio. */
  missingCategories: string[];
}

/**
 * The one-line state of the roster.
 *
 * `missingCategories` is the number worth having. The Academy's five
 * categories are what a complete routine draws from, so a studio with nothing
 * in "Trunk" cannot build a compliant programme - and no screen said so. It is
 * computed against the full category list rather than against what is present,
 * which is the difference between noticing a gap and rendering one.
 */
export function catalogOverview(input: LandingInput): CatalogOverview {
  const { machines, flaggedIds } = input;
  const status = upkeepByMachine(
    machines,
    input.events,
    input.todayKey,
    input.policy,
  );
  const present = new Set(
    machines.map((m) => academyCategoryOf(m)).filter(Boolean) as string[],
  );
  return {
    total: machines.length,
    studioCustom: machines.filter((m) => m.isStudioCustom).length,
    outOfService: machines.filter((m) => m.rosterStatus !== "active").length,
    needsUpkeep: machines.filter((m) => {
      const s = status[m.id];
      return s === "due" || s === "overdue";
    }).length,
    flagged: flaggedIds
      ? machines.filter((m) => flaggedIds.has(m.id)).length
      : 0,
    missingCategories: ACADEMY_CATEGORIES.filter((c) => !present.has(c)).map(
      (c) => CATEGORY_LABEL[c],
    ),
  };
}

/* ------------------------------------------------------------------ *
 * BRIDGING THE TWO UPKEEP SOURCES
 * ------------------------------------------------------------------ */

/**
 * What `studio-tasks/useMachineUpkeep` already gives the Catalog.
 *
 * Structurally typed rather than imported so this module does not depend on
 * the studio-tasks feature: it needs two dates, not a TaskInstance.
 */
export interface MachineUpkeepLike {
  lastCleaned?: { localDate: string } | undefined;
  lastServiced?: { localDate: string } | undefined;
  flagged?: unknown;
}

/**
 * Turn the Catalog's existing upkeep records into the event shape
 * features/admin/upkeep reasons about.
 *
 * There are two upkeep sources in the app and this is deliberately NOT a
 * third. The Catalog reads completed task instances (a trainer ticking
 * "wipe down" on the floor); the admin equipment panel reads a logged upkeep
 * history. They answer the same question from different sides of the studio,
 * and until now only the admin side knew how to turn "last cleaned on the 4th"
 * into "overdue".
 *
 * Converting here means the Catalog gets that judgement from the same tested
 * function - upkeepLog.upkeepStatus, with the same policy - rather than a
 * second threshold that would drift. If the house policy changes from a daily
 * wipe-down, both screens change together or neither does.
 */
export function upkeepEventsFrom(
  byMachineId: Record<string, MachineUpkeepLike>,
): UpkeepEvent[] {
  const out: UpkeepEvent[] = [];
  for (const [machineId, entry] of Object.entries(byMachineId)) {
    if (entry?.lastCleaned?.localDate) {
      out.push({
        id: `${machineId}-clean`,
        machineId,
        kind: "clean",
        day: entry.lastCleaned.localDate,
        source: "task",
      });
    }
    if (entry?.lastServiced?.localDate) {
      out.push({
        id: `${machineId}-service`,
        machineId,
        kind: "service",
        day: entry.lastServiced.localDate,
        source: "task",
      });
    }
  }
  return out;
}

/** Studio-local YYYY-MM-DD. The upkeep layer counts days, not milliseconds. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
