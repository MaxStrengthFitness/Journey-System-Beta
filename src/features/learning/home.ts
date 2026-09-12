/**
 * THE LEARNING FRONT PAGE — what it shows, without the screen.
 *
 * Round: Learning + Planner, Sep 2026.
 *
 * AJ: make it feel "a bit more organized, an expert MSF wiki feel. Or feel
 * like I'm browsing an in-depth system catalog."
 *
 * A reference site's front page does three jobs, in this order:
 *   1. SEARCH, for the reader who knows what they want;
 *   2. the CONTENTS, laid out so the whole shape of the library is visible
 *      at once — every category with what is in it, not five tiles that each
 *      hide a list;
 *   3. what is NEW or LOCAL — here, what this studio has written.
 *
 * Before this round the tab opened straight onto one half's index, so the
 * other half (and the fact that it existed) was a switch away. The front page
 * puts both halves on one screen, each with its contents showing.
 *
 * PURE MODULE — no React, no Firestore.
 */

import { accentForGroupKey, type WikiAccent } from "../wiki/categories";
import { groupMachines } from "../catalog/grouping";
import type { CatalogMachine } from "../catalog/types";
import { abbr } from "../routine-builder/academy";

export interface HomeMachineLink {
  id: string;
  name: string;
  code: string | null;
}

export interface HomeCategoryTile {
  /** The Academy category key — also the Catalog's group key under "Category". */
  key: string;
  label: string;
  accent: WikiAccent;
  machines: HomeMachineLink[];
}

/**
 * The studio's machines, one tile per Academy category, in the Academy's own
 * order, every machine listed on its tile.
 *
 * Every machine, not the first three: the whole point is that the contents
 * are visible, and a category has at most six machines.
 */
export function homeCategoryTiles(machines: CatalogMachine[]): HomeCategoryTile[] {
  return groupMachines(machines, "academy").map((g) => ({
    key: g.key,
    label: g.label,
    accent: accentForGroupKey(g.key, "academy"),
    machines: g.machines.map((m) => ({ id: m.id, name: m.name, code: abbr(m.id) })),
  }));
}

export interface FloorStatus {
  flagged: number;
  outOfService: number;
  /** Due or overdue for cleaning. */
  due: number;
}

export function floorStatus(
  machines: CatalogMachine[],
  upkeepStatusById: Record<string, string | undefined>,
  flaggedIds: ReadonlySet<string>,
): FloorStatus {
  let flagged = 0;
  let outOfService = 0;
  let due = 0;
  for (const m of machines) {
    if (flaggedIds.has(m.id)) flagged += 1;
    if (m.rosterStatus === "maintenance") outOfService += 1;
    const s = upkeepStatusById[m.id];
    if (s === "due" || s === "overdue") due += 1;
  }
  return { flagged, outOfService, due };
}

export interface AcademyIndexLike {
  modules: { topics: { readingMinutes: number }[] }[];
  glossaryCount: number;
  cardCount: number;
  scriptCount?: number;
}

export interface AcademyFacts {
  modules: number;
  topics: number;
  minutes: number;
  glossary: number;
  cards: number;
  scripts: number;
}

export function academyFacts(index: AcademyIndexLike): AcademyFacts {
  let topics = 0;
  let minutes = 0;
  for (const m of index.modules) {
    topics += m.topics.length;
    for (const t of m.topics) minutes += t.readingMinutes;
  }
  return {
    modules: index.modules.length,
    topics,
    minutes,
    glossary: index.glossaryCount,
    cards: index.cardCount,
    scripts: index.scriptCount ?? 0,
  };
}

/** "45 min", "about 9 hours". Reading time, so rounding is honest. */
export function readingTime(minutes: number): string {
  if (minutes < 90) return `${Math.max(1, Math.round(minutes))} min`;
  return `about ${Math.round(minutes / 60)} hours`;
}

/** Firestore Timestamp, Date, millis or {seconds} -> millis; 0 when unknown. */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}

/**
 * The studio's pages, most recently changed first. A page with no dates at
 * all (a write that has not come back from the server yet) sorts as newest —
 * it is the one someone just wrote.
 */
export function recentPages<T extends { updatedAt?: unknown; createdAt?: unknown }>(
  pages: T[],
  limit = 5,
): T[] {
  const when = (p: T) => toMillis(p.updatedAt) || toMillis(p.createdAt) || Number.MAX_SAFE_INTEGER;
  return [...pages].sort((a, b) => when(b) - when(a)).slice(0, limit);
}

/** "1 machine", "6 machines". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
