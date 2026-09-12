/**
 * ONE SEARCH FOR ALL OF LEARNING — the matching, without the screen.
 *
 * Round: Learning + Planner, Sep 2026.
 *
 * Before this, the Catalog searched machines and the Academy searched its own
 * four lists, and a trainer had to know which half held the answer before
 * typing. "Glute" found the machines in one and nothing in the other; "CP"
 * found nothing anywhere. Now one field searches everything, and the results
 * say where each one lives.
 *
 * HOW MATCHING WORKS
 * ------------------
 * The query is split into words and EVERY word has to appear somewhere in an
 * entry — its title, its catalog code, the line under it, or its keywords
 * (muscles, category, module). So "leg curl" does not match every machine
 * with "leg" in the region.
 *
 * Results are ranked by how well the TITLE matches, because that is what the
 * trainer is scanning:
 *   an exact code ("cp")         > the title starts with the query
 *   > a title word starts with it > the title contains it
 *   > it only matched elsewhere.
 * Ties keep the order the entries arrived in, which is each list's own
 * (the studio's machine order, the curriculum's teaching order).
 *
 * PURE MODULE — no React, no Firestore.
 */

import type { LearningRef } from "./ref";
import type { WikiAccent } from "../wiki/categories";

export type LearningSearchGroupKey =
  | "catalog"
  | "academy-machines"
  | "academy"
  | "topics"
  | "glossary"
  | "studio";

/** The order groups appear in. Machines first: the thirty-second lookup. */
export const SEARCH_GROUP_ORDER: LearningSearchGroupKey[] = [
  "catalog",
  "academy-machines",
  "studio",
  "academy",
  "glossary",
  "topics",
];

export interface LearningSearchEntry {
  ref: LearningRef;
  group: LearningSearchGroupKey;
  title: string;
  /** The line under the title. Searched too. */
  meta?: string;
  /** A catalog code ("CP"). An exact match on it ranks first. */
  code?: string | null;
  accent?: WikiAccent;
  /** Searched, never shown: muscles, category names, a module's blurb. */
  keywords?: string[];
}

export interface LearningSearchHit extends LearningSearchEntry {
  score: number;
}

export interface LearningSearchResult {
  group: LearningSearchGroupKey;
  hits: LearningSearchHit[];
  /** How many matched beyond the ones returned. */
  more: number;
}

/** Lower-case, accents stripped, punctuation to spaces, runs collapsed. */
export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function queryWords(query: string): string[] {
  const n = normalise(query);
  return n ? n.split(" ") : [];
}

/**
 * How well one entry matches, 0 when it does not.
 *
 * Exported for the tests; screens call searchLearning.
 */
export function scoreEntry(entry: LearningSearchEntry, words: string[]): number {
  if (words.length === 0) return 0;

  const title = normalise(entry.title);
  const code = entry.code ? normalise(entry.code) : "";
  const haystack = [
    title,
    code,
    entry.meta ? normalise(entry.meta) : "",
    ...(entry.keywords ?? []).map(normalise),
  ].join(" ");

  // Every word must appear somewhere.
  for (const w of words) {
    if (!haystack.includes(w)) return 0;
  }

  const phrase = words.join(" ");
  if (code && phrase === code) return 100;
  if (title === phrase) return 90;
  if (title.startsWith(phrase)) return 80;
  const titleWords = title.split(" ");
  if (words.every((w) => titleWords.some((t) => t.startsWith(w)))) return 60;
  if (title.includes(phrase)) return 50;
  if (words.every((w) => title.includes(w))) return 40;
  return 10;
}

/**
 * Search every entry, group the hits, rank inside each group.
 *
 * `limit` caps each group: the curriculum alone has two hundred topics, and a
 * one-letter query matching all of them buries the machine the trainer was
 * after. The count of the rest is returned so the screen can say so.
 */
export function searchLearning(
  entries: LearningSearchEntry[],
  query: string,
  limit = 8,
): LearningSearchResult[] {
  const words = queryWords(query);
  if (words.length === 0) return [];

  const byGroup = new Map<LearningSearchGroupKey, LearningSearchHit[]>();
  entries.forEach((entry) => {
    const score = scoreEntry(entry, words);
    if (score === 0) return;
    const list = byGroup.get(entry.group) ?? [];
    list.push({ ...entry, score });
    byGroup.set(entry.group, list);
  });

  const out: LearningSearchResult[] = [];
  for (const group of SEARCH_GROUP_ORDER) {
    const hits = byGroup.get(group);
    if (!hits || hits.length === 0) continue;
    // Stable: Array.prototype.sort is stable, so equal scores keep list order.
    const sorted = [...hits].sort((a, b) => b.score - a.score);
    out.push({ group, hits: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) });
  }
  return out;
}
