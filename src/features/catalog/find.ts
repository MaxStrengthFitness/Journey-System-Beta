/**
 * FIND — the Catalog's one field, and what it knows.
 *
 * Round: the Machine Catalog, Sep 28 2026 (Catalog R1 "Find and the names").
 * AJ's pick opens the Catalog on the floor "with Find on top", and Find knows
 * every name a machine goes by:
 *
 *   LUMBAR, Low Back and Lumb     all open the Lumbar Extension on this floor
 *   lp2                           the floor's second Leg Press, in walking order
 *   handoff, a maker's name       filter the floor
 *   a word inside a page          finds the line, and says which page
 *
 * Before this, search matched a machine's floor name, its code and its
 * muscles and nothing else, so "low back" and "torso arm" found nothing.
 *
 * HOW IT RANKS
 * ------------
 * An exact name is a hundred: it is the TOP MATCH, and Enter opens it. Then
 * every word of the query starting a word of a name (60 when the name starts
 * with the whole query, else 40), a muscle (30), and a name merely containing
 * the query (25). Page lines only ever list, never top. Ties keep walking order
 * for machines and the Academy's order for movements.
 *
 * A machine's name that leads to MORE than one unit on the floor is a filter,
 * not a top match: "leg press" on a floor with two leg presses shows both
 * rather than guessing which one was meant.
 *
 * PURE MODULE — no React, no Firestore. The screen is CatalogFind.tsx.
 */

import {
  MOVEMENTS,
  MOVEMENT_IDS,
  floorNameHidesMovement,
  movementOf,
  normaliseName,
  type MovementNames,
} from "./names";
import type { CatalogMachine } from "./types";

/** One machine on this floor, as Find reads it. */
export interface FindUnit {
  /** The machine id its page opens by. */
  id: string;
  /** The unit's floor name. */
  name: string;
  /** Its movement, through its lineage; null for a studio's own machine with none. */
  movement: MovementNames | null;
  /** Who made it, when the studio recorded one on the unit. */
  maker?: string | null;
  requiresHandoff: boolean;
  neverToFailure: boolean;
  outOfService: boolean;
  /** True when flagged, false when not, null when the floor's flags could not be read. */
  flagged: boolean | null;
  /** The muscles its page names, for "glute" and "lats". */
  muscles: string[];
  /** The lines its page shows, for a word inside a page. */
  lines: { section: string; text: string }[];
}

export type FindFilterKey = "handoff" | "never-to-failure" | "out-of-service" | "flagged";

export type FindHit =
  /** A machine on this floor: opens its page. */
  | { kind: "unit"; unitId: string; label: string; sub: string; score: number }
  /** A movement NOT on this floor: opens its page in All MSF. */
  | { kind: "movement"; movementId: string; label: string; sub: string; score: number }
  /** Filters the floor: a switch, a maker, or a movement this floor has more than one of. */
  | {
      kind: "filter";
      filter: { key: string; label: string; unitIds: string[] };
      label: string;
      sub: string;
      score: number;
    }
  /** A line inside a machine's page: opens that page, saying where the line is. */
  | { kind: "line"; unitId: string; section: string; text: string; label: string; sub: string; score: number };

export interface FindGroup {
  key: FindHit["kind"];
  label: string;
  hits: FindHit[];
}

export interface FindResult {
  query: string;
  /** The one hit Enter opens: an exact name. Null when nothing is exact. */
  top: FindHit | null;
  /** Everything else, grouped, the top match left out. */
  groups: FindGroup[];
  /** True when nothing at all matched. */
  none: boolean;
}

const EXACT = 100;
const MAX_LINES = 5;

function words(text: string): string[] {
  const n = normaliseName(text);
  return n ? n.split(" ") : [];
}

/**
 * How well one name answers the query. 0 when it does not.
 *
 * Every query word must START a word of the name ("leg cu" finds Leg Curl,
 * "eg" does not find Leg Press), unless the query is three letters or more and
 * sits inside the name ("press" inside "chestpress" never matters; "pull"
 * inside "pulldown" does, and is a prefix anyway).
 */
function nameScore(name: string, q: string, qWords: string[]): number {
  const n = normaliseName(name);
  if (!n) return 0;
  const nWords = n.split(" ");
  if (qWords.every((w) => nWords.some((x) => x.startsWith(w)))) return n.startsWith(q) ? 60 : 40;
  if (q.length > 2 && n.replace(/ /g, "").includes(q.replace(/ /g, ""))) return 25;
  return 0;
}

function bestOf(names: readonly string[], q: string, qWords: string[]): number {
  let best = 0;
  for (const name of names) best = Math.max(best, nameScore(name, q, qWords));
  return best;
}

/**
 * The first sentence of a line that holds every query word, whole.
 *
 * Split by matching rather than by a look-behind: older iPadOS Safari throws
 * on a look-behind when the file is parsed, which would take the whole
 * Catalog down with it (machine-fit/shorthand.ts keeps the same rule).
 */
function sentenceWith(text: string, qWords: string[]): string | null {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  for (const s of sentences) {
    const sw = words(s);
    if (qWords.every((w) => sw.some((x) => x.startsWith(w)))) return s.trim();
  }
  return null;
}

/** "1 on Solon's floor", "2 on Solon's floor". */
function onFloor(n: number, studioName: string): string {
  return `${n} on ${studioName}'s floor`;
}

/**
 * The units of each movement on this floor, in walking order — the order the
 * units arrive in, which is the floor's.
 */
function unitsByMovement(units: FindUnit[]): Map<string, FindUnit[]> {
  const out = new Map<string, FindUnit[]>();
  for (const u of units) {
    if (!u.movement) continue;
    (out.get(u.movement.id) ?? out.set(u.movement.id, []).get(u.movement.id)!).push(u);
  }
  return out;
}

/**
 * The shorthand a unit answers to exactly: its code and its place among the
 * floor's units of that movement ("lp2" is the second leg press walked), and
 * its code with the number in its own name ("LEG PRESS 2" is also lp2).
 */
function shorthandsOf(u: FindUnit, index: number): string[] {
  if (!u.movement) return [];
  const trailing = /(\d+)\s*$/.exec(u.name)?.[1];
  const out: string[] = [];
  for (const code of u.movement.codes) {
    const c = normaliseName(code).replace(/ /g, "");
    out.push(`${c}${index + 1}`, `${c} ${index + 1}`);
    if (trailing) out.push(`${c}${trailing}`, `${c} ${trailing}`);
  }
  return out;
}

/**
 * The floor's machines as Find reads them, in the order given (walking order).
 *
 * `makers` is the maker a studio recorded on each unit, where it did;
 * `flagged` is the set of flagged machines, or null when the floor's flags
 * could not be read (Find then offers no "Flagged" filter rather than an
 * empty one).
 */
export function findUnitsFrom(
  machines: CatalogMachine[],
  opts: { makers?: Record<string, string | undefined>; flagged?: ReadonlySet<string> | null } = {},
): FindUnit[] {
  return machines.map((m) => ({
    id: m.id,
    name: m.name,
    movement: movementOf(m),
    maker: opts.makers?.[m.id] ?? null,
    requiresHandoff: m.requiresHandoff,
    neverToFailure: m.neverToFailure === true,
    outOfService: m.rosterStatus === "maintenance",
    flagged: opts.flagged === null ? null : Boolean(opts.flagged?.has(m.id)),
    muscles: [...m.targetMuscles, ...m.synergists],
    lines: [
      ...(m.safetyNotice ? [{ section: "Never to failure", text: m.safetyNotice }] : []),
      ...m.clinicalWarnings.map((text) => ({ section: "Clinical warnings", text })),
      ...(m.setup ? [{ section: "Setup", text: m.setup }] : []),
      ...m.setupCues.map((text) => ({ section: "Setup", text })),
      ...(m.execution ? [{ section: "Execution", text: m.execution }] : []),
      ...m.executionCues.map((text) => ({ section: "Execution", text })),
      ...m.contraindicatedFor.map((text) => ({ section: "Contraindicated for", text })),
    ],
  }));
}

export interface FindInput {
  query: string;
  /** The floor, in walking order. */
  units: FindUnit[];
  studioName: string;
}

export function findOnFloor({ query, units, studioName }: FindInput): FindResult {
  const q = normaliseName(query);
  if (!q) return { query, top: null, groups: [], none: false };
  const qWords = q.split(" ");
  const byMovement = unitsByMovement(units);

  const hits: FindHit[] = [];

  /* ── machines on this floor ─────────────────────────────────────── */
  for (const u of units) {
    const siblings = u.movement ? byMovement.get(u.movement.id) ?? [u] : [u];
    const exactKeys = new Set([normaliseName(u.name), ...shorthandsOf(u, siblings.indexOf(u))]);
    // A movement's own exact name opens its unit only when it is the ONLY one.
    if (u.movement && siblings.length === 1) for (const k of u.movement.exact) exactKeys.add(k);

    let score = exactKeys.has(q) ? EXACT : 0;
    if (!score) {
      const names = [u.name, ...(u.movement ? [u.movement.name, ...u.movement.aliases] : []), u.maker ?? ""];
      score = bestOf(names, q, qWords);
      if (!score && u.muscles.some((m) => nameScore(m, q, qWords) >= 40)) score = 30;
    }
    if (!score) continue;
    const sub = [
      // The Academy's name only when the floor name leaves it unsaid.
      u.movement && floorNameHidesMovement(u.name, u.movement.name) ? u.movement.name : null,
      u.movement?.code,
      u.outOfService ? "Out of service" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    hits.push({ kind: "unit", unitId: u.id, label: u.name, sub, score });
  }

  /* ── movements: not on this floor (All MSF), or more than one here (a filter) ── */
  for (const id of MOVEMENT_IDS) {
    const m = MOVEMENTS[id];
    const here = byMovement.get(id) ?? [];
    if (here.length === 1) continue; // its unit already answers, above
    const score = m.exact.includes(q) ? EXACT : bestOf([m.name, ...m.aliases], q, qWords);
    if (!score) continue;
    if (here.length === 0) {
      hits.push({
        kind: "movement",
        movementId: id,
        label: m.name,
        sub: [m.code, `Not on ${studioName}'s floor`].filter(Boolean).join(" · "),
        score,
      });
    } else {
      hits.push({
        kind: "filter",
        filter: { key: `movement:${id}`, label: m.name, unitIds: here.map((u) => u.id) },
        label: m.name,
        sub: onFloor(here.length, studioName),
        score,
      });
    }
  }

  /* ── switches and makers ─────────────────────────────────────────── */
  const switches: { key: FindFilterKey; label: string; names: string[]; test: (u: FindUnit) => boolean }[] = [
    { key: "handoff", label: "Handoff", names: ["handoff", "hand off"], test: (u) => u.requiresHandoff },
    { key: "never-to-failure", label: "Never to failure", names: ["never to failure", "ntf"], test: (u) => u.neverToFailure },
    { key: "out-of-service", label: "Out of service", names: ["out of service", "broken"], test: (u) => u.outOfService },
    { key: "flagged", label: "Flagged", names: ["flagged", "flag"], test: (u) => u.flagged === true },
  ];
  for (const s of switches) {
    const ids = units.filter(s.test).map((u) => u.id);
    if (ids.length === 0) continue;
    const exact = s.names.map(normaliseName).includes(q);
    const score = exact ? EXACT : bestOf(s.names, q, qWords);
    if (!score) continue;
    hits.push({
      kind: "filter",
      filter: { key: s.key, label: s.label, unitIds: ids },
      label: s.label,
      sub: onFloor(ids.length, studioName),
      score,
    });
  }
  const makers = new Map<string, FindUnit[]>();
  for (const u of units) {
    const maker = (u.maker ?? "").trim();
    if (!maker) continue;
    const key = normaliseName(maker);
    (makers.get(key) ?? makers.set(key, []).get(key)!).push(u);
  }
  for (const [key, list] of makers) {
    const label = list[0].maker!.trim();
    const score = key === q ? EXACT : nameScore(label, q, qWords);
    if (!score) continue;
    hits.push({
      kind: "filter",
      filter: { key: `maker:${key}`, label, unitIds: list.map((u) => u.id) },
      label,
      sub: `Made by ${label} · ${onFloor(list.length, studioName)}`,
      score,
    });
  }

  /* ── a word inside a page ────────────────────────────────────────── */
  const lines: FindHit[] = [];
  for (const u of units) {
    for (const line of u.lines) {
      const sentence = sentenceWith(line.text, qWords);
      if (!sentence) continue;
      lines.push({
        kind: "line",
        unitId: u.id,
        section: line.section,
        text: sentence,
        label: `${u.name} · ${line.section}`,
        sub: sentence,
        score: 20,
      });
      break; // one line per page per section is plenty; the page has the rest
    }
  }
  hits.push(...lines.slice(0, MAX_LINES));

  if (hits.length === 0) return { query, top: null, groups: [], none: true };

  // Stable: equal scores keep the order they were pushed in (walking order,
  // then the Academy's).
  const ranked = [...hits].sort((a, b) => b.score - a.score);
  const top = ranked[0].score === EXACT && ranked[0].kind !== "line" ? ranked[0] : null;

  const GROUPS: { key: FindHit["kind"]; label: string }[] = [
    { key: "unit", label: `On ${studioName}'s floor` },
    { key: "movement", label: "Other MSF machines" },
    { key: "filter", label: "Switches and makers" },
    { key: "line", label: "Inside a page" },
  ];
  const groups = GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    hits: ranked.filter((h) => h.kind === g.key && h !== top),
  })).filter((g) => g.hits.length > 0);

  return { query, top, groups, none: false };
}
