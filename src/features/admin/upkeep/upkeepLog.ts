/**
 * Equipment upkeep — one timeline out of two sources.
 *
 * WHY TWO SOURCES
 *
 * The studio To-Do round already derives "last cleaned" and "last serviced"
 * from completed task instances, which is the right primary source: the
 * person who wipes a machine down is ticking today's list, not filling in a
 * maintenance form.
 *
 * But it only covers work that was SCHEDULED. A trainer who deep-cleans the
 * leg press because a client spilled a shake, or a manager who has the seat
 * pad replaced by an engineer on a Tuesday, has nowhere to record either —
 * and both are exactly the events the equipment-longevity tally is for.
 *
 * So there is a second source: an explicit upkeep log a person writes. The
 * risk in that is obvious and is the thing this file exists to prevent —
 * two sources of truth for "when was this last serviced", disagreeing on
 * different screens. Nothing merges them ad hoc; everything reads
 * mergeUpkeepHistory, exactly as every machine screen reads resolveMachine
 * rather than picking between the catalog and the roster itself.
 *
 * Pure. The tally is arithmetic about whether a machine is overdue, and that
 * is worth being sure of.
 */

import type { StudioTaskCategory, TaskInstance } from "../../studio-tasks/types";
import { upkeepRoleOf } from "../../studio-tasks/types";

export type UpkeepKind = "clean" | "deep-clean" | "service";

export const UPKEEP_LABEL: Record<UpkeepKind, string> = {
  clean: "Cleaned",
  "deep-clean": "Deep cleaned",
  service: "Serviced",
};

/** Firestore: studios/{studioId}/upkeepLog/{entryId} */
export interface UpkeepLogEntry {
  id: string;
  machineId: string;
  kind: UpkeepKind;
  /** ISO. A client clock, so the person who did it decides when it happened. */
  at: string;
  byId?: string;
  byName?: string;
  note?: string;
}

export interface UpkeepEvent {
  id: string;
  machineId: string;
  kind: UpkeepKind;
  /** Studio-local YYYY-MM-DD. Both sources reduce to this. */
  day: string;
  byName?: string;
  note?: string;
  /** Where it came from, so the history can say. */
  source: "task" | "logged";
}

const dayOf = (iso: string): string => (iso || "").slice(0, 10);

/**
 * Both sources, newest first, de-duplicated.
 *
 * De-duplication matters: a manager who ticks the scheduled cleaning task AND
 * logs "deep cleaned" on the same machine the same day has done one job, and
 * counting it twice inflates a tally whose whole purpose is accountability.
 * Same machine, same day, same kind collapses — and the LOGGED entry wins,
 * because it carries a note and a person typed it deliberately.
 */
export function mergeUpkeepHistory(
  taskInstances: TaskInstance[],
  logged: UpkeepLogEntry[],
  studioCategories?: StudioTaskCategory[],
): UpkeepEvent[] {
  const events: UpkeepEvent[] = [];

  for (const entry of logged) {
    if (!entry.machineId || !entry.at) continue;
    events.push({
      id: entry.id,
      machineId: entry.machineId,
      kind: entry.kind,
      day: dayOf(entry.at),
      byName: entry.byName,
      note: entry.note,
      source: "logged",
    });
  }

  for (const i of taskInstances) {
    if (!i.machineId || i.status !== "done") continue;
    // Resolved through the category, never a hard-coded string: categories
    // are studio-authored, and matching on "cleaning" would empty this the
    // first time a manager renamed it to "Wipe-down".
    const role = upkeepRoleOf(i.category ?? "", studioCategories);
    if (role !== "cleaning" && role !== "maintenance") continue;
    events.push({
      id: i.id,
      machineId: i.machineId,
      kind: role === "cleaning" ? "clean" : "service",
      day: i.localDate,
      byName: i.completedBy?.name,
      note: i.note,
      source: "task",
    });
  }

  const seen = new Map<string, UpkeepEvent>();
  for (const e of events) {
    const key = `${e.machineId}|${e.day}|${e.kind}`;
    const existing = seen.get(key);
    if (!existing || (existing.source === "task" && e.source === "logged")) {
      seen.set(key, e);
    }
  }

  // localDate and the ISO prefix are both YYYY-MM-DD, so a string sort is a
  // date sort — no parsing, and no dependence on completedAt, which reads
  // back null for a moment after a write.
  return [...seen.values()].sort(
    (a, b) => b.day.localeCompare(a.day) || a.machineId.localeCompare(b.machineId),
  );
}

export interface UpkeepTally {
  machineId: string;
  cleans: number;
  services: number;
  lastCleanedDay: string | null;
  lastServicedDay: string | null;
  daysSinceCleaned: number | null;
  daysSinceServiced: number | null;
  total: number;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(day: string | null, todayKey: string): number | null {
  if (!day) return null;
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${todayKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

/**
 * The running tally, per machine.
 *
 * A deep clean counts toward BOTH totals: it is a clean, and it is also the
 * kind of attention that says the machine is being looked after. Counting it
 * only as its own third category would leave the cleaning number looking
 * worse the more thoroughly a studio worked.
 */
export function tallyUpkeep(
  events: UpkeepEvent[],
  machineId: string,
  todayKey: string,
): UpkeepTally {
  const mine = events.filter((e) => e.machineId === machineId);
  const cleans = mine.filter((e) => e.kind === "clean" || e.kind === "deep-clean");
  const services = mine.filter((e) => e.kind === "service");

  const lastCleanedDay = cleans[0]?.day ?? null;
  const lastServicedDay = services[0]?.day ?? null;

  return {
    machineId,
    cleans: cleans.length,
    services: services.length,
    lastCleanedDay,
    lastServicedDay,
    daysSinceCleaned: daysBetween(lastCleanedDay, todayKey),
    daysSinceServiced: daysBetween(lastServicedDay, todayKey),
    total: mine.length,
  };
}

export interface UpkeepPolicy {
  /** Days after which a machine wants cleaning again. */
  cleanEveryDays: number;
  /** Days after which it wants servicing. */
  serviceEveryDays: number;
}

/** House defaults. Daily wipe-downs, a service pass each quarter. */
export const DEFAULT_UPKEEP_POLICY: UpkeepPolicy = {
  cleanEveryDays: 1,
  serviceEveryDays: 90,
};

export type UpkeepStatus = "never" | "ok" | "due" | "overdue";

/**
 * Is this machine behind?
 *
 * "never" is deliberately its own state rather than an extreme "overdue". A
 * machine nobody has ever logged is an onboarding gap — the studio has not
 * started using the log — and telling a manager their whole floor is overdue
 * on day one is how a status light gets ignored forever.
 */
export function upkeepStatus(
  daysSince: number | null,
  everyDays: number,
): UpkeepStatus {
  if (daysSince === null) return "never";
  if (daysSince <= everyDays) return "ok";
  if (daysSince <= everyDays * 2) return "due";
  return "overdue";
}

export function worstStatus(
  tally: UpkeepTally,
  policy: UpkeepPolicy = DEFAULT_UPKEEP_POLICY,
): UpkeepStatus {
  const order: UpkeepStatus[] = ["ok", "never", "due", "overdue"];
  const a = upkeepStatus(tally.daysSinceCleaned, policy.cleanEveryDays);
  const b = upkeepStatus(tally.daysSinceServiced, policy.serviceEveryDays);
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
