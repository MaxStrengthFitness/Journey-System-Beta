import { MACHINE_DATABASE } from "../../data/machine-database";
import { CANONICAL_TO_DB_KEY } from "../catalog/machine-identity";
import type { MachineScript, OverviewsFile, QuickCard } from "./types";

/**
 * THE ACADEMY, JOINED BY MACHINE.
 *
 * Round: Academy flow pass, Sep 2026.
 *
 * WHY THIS EXISTS
 * ---------------
 * The corpus documents roughly the same twenty machines THREE times over:
 * 18 quick cards, 20 spoken scripts, 19 deep-dive write-ups. The first cut of
 * the Academy index listed all three as separate groups, so "Chest Press"
 * appeared in three places on one page and a trainer had to know which of the
 * words card / script / deep dive matched what was in their head. Fifty-seven
 * rows to reach twenty machines.
 *
 * This module joins them into one row per machine. The index then has a single
 * "By machine" group, and the quick card is the front door — it is the
 * shortest, and it is the one written to be read standing at the machine.
 *
 * THE NAME PROBLEM, WHICH IS WORSE THAN IT LOOKS
 * ----------------------------------------------
 * Ten of the eighteen card `title` fields are not names at all. They are the
 * Academy's abbreviations: "CP", "CR", "LC", "LE", "LP", "OH", "Pd", "PO",
 * "Abs", "Lumbar". The first cut of the index rendered those verbatim, so the
 * screen literally offered a row called "Pd".
 *
 * So the display name comes from MACHINE_DATABASE via CANONICAL_TO_DB_KEY —
 * the app's own canonical name, the same string the Catalog shows. Two tabs
 * naming one machine two different ways is exactly the class of bug
 * catalog/anatomy.ts was written to end. Using CANONICAL_TO_DB_KEY also
 * inherits its resolution of the contested neck id for free: m-neck resolves
 * to cervical_extension, not 4_way_neck, so the Academy cannot end up showing
 * the safety copy that omits "NEVER take to failure".
 *
 * The Academy's own abbreviation is kept alongside as `abbr`, because that is
 * how a routine is written down ("ADD, SD, CR, TR, OH") and a trainer holding
 * a written sequence needs to find the row.
 *
 * MATCHING THE DEEP DIVES
 * -----------------------
 * Cards and scripts carry `machineId`. Overviews do not — they carry only a
 * title, and the Academy's titles disagree with the app's names on eight
 * machines ("Chest Flye" vs "Pec Fly", "Pulldown (Torso Arm)" vs "Torso Arm",
 * "Lumbar Extension (Lumbar, Lower Back)" vs "Low Back").
 *
 * So an alias index is built from every name the same machine is known by —
 * the app's name, its database key, the card's title and abbreviation, the
 * script's opening phrase and abbreviation — and overview titles are matched
 * against that, trying the whole title, the part before a parenthetical, and
 * each comma-separated term inside it. That resolves 19 of 19 today.
 *
 * A machine with no match simply has no deep dive link. Nothing is invented
 * and nothing is dropped: the machine still appears, and academy-machines.test
 * asserts the match count so a corpus rebuild that breaks it fails loudly
 * rather than quietly losing links.
 *
 * PURE MODULE — no React, no Firestore.
 */

export interface AcademyMachine {
  /** The app's canonical id — the same one the Catalog uses. */
  machineId: string;
  /** The app's canonical name. Never the Academy's abbreviation. */
  name: string;
  /** The Academy's own code, e.g. "CR". Null when the corpus has none. */
  abbr: string | null;
  cardId: string | null;
  scriptId: string | null;
  overviewId: string | null;
  /** "Lower Body", "Upper Body", "SpineTrunkCore" — from the script. */
  workout: string | null;
}

/** The app's canonical display name for a machine id, or null. */
export function machineName(machineId: string): string | null {
  const dbKey = CANONICAL_TO_DB_KEY[machineId];
  if (!dbKey) return null;
  return MACHINE_DATABASE[dbKey]?.name ?? null;
}

/** Strip the corpus's "X - Quick Reference Guide" suffix. */
export function cardTitle(card: QuickCard): string {
  return card.title.replace(/\s*[-–]\s*Quick Reference Guide\s*$/i, "").trim();
}

/**
 * A script's opening phrase — "Leg Curl - Gap 3 for most…" -> "Leg Curl".
 * The summary is one long line whose head is the machine, so the first
 * dash-delimited segment is the name.
 */
export function scriptTitle(script: MachineScript): string {
  const summary = script.summary ?? script.abbr;
  return summary.split(/\s[-–—]\s/)[0].trim();
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The forms an overview title might take.
 *
 * Two candidates from a parenthetical, because it can be either the noise or
 * the whole name: "Pulldown (Torso Arm)" wants both halves tried, and the
 * bracket is where the app's name actually lives. Same reasoning as
 * machine-identity's own name matching.
 */
function titleVariants(title: string): string[] {
  const trimmed = title.trim();
  const out = [trimmed];
  const bracket = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(trimmed);
  if (bracket) {
    out.push(bracket[1]);
    for (const part of bracket[2].split(",")) out.push(part.trim());
  }
  return out.map(norm).filter(Boolean);
}

/**
 * Every name each machine is known by -> its canonical id.
 *
 * First writer wins, so the app's own name and database key are registered
 * before the corpus's, and an ambiguous corpus label can never steal an alias
 * the app already owns.
 */
export function buildAliasIndex(
  cards: QuickCard[],
  scripts: MachineScript[],
): Map<string, string> {
  const alias = new Map<string, string>();
  const add = (label: string | null | undefined, machineId: string) => {
    if (!label) return;
    const key = norm(label);
    if (key && !alias.has(key)) alias.set(key, machineId);
  };

  for (const [canonical, dbKey] of Object.entries(CANONICAL_TO_DB_KEY)) {
    add(MACHINE_DATABASE[dbKey]?.name, canonical);
    // "triceps_extension" normalises to "tricepsextension", which is how the
    // deep dive titled "Triceps Extension" finds its machine. The app's own
    // name for it is "Seated Tricep", so nothing else would have matched.
    add(dbKey, canonical);
  }

  for (const card of cards) {
    if (!card.machineId) continue;
    add(cardTitle(card), card.machineId);
    add(card.abbr, card.machineId);
  }
  for (const script of scripts) {
    if (!script.machineId) continue;
    add(scriptTitle(script), script.machineId);
    add(script.abbr, script.machineId);
  }
  return alias;
}

/**
 * One row per machine, alphabetical by the app's name.
 *
 * Alphabetical rather than by the Academy's workout grouping: this is a
 * LOOKUP list — a trainer arrives with a machine already in mind — and the
 * workout grouping is what the routine builder is for.
 */
export function buildAcademyMachines(
  cards: QuickCard[] | null,
  scripts: MachineScript[] | null,
  overviews: OverviewsFile["overviews"] | null,
): AcademyMachine[] {
  const safeCards = cards ?? [];
  const safeScripts = scripts ?? [];
  const alias = buildAliasIndex(safeCards, safeScripts);

  const overviewByMachine = new Map<string, string>();
  for (const overview of overviews ?? []) {
    for (const variant of titleVariants(overview.title)) {
      const machineId = alias.get(variant);
      if (machineId) {
        // First overview wins, so a second write-up cannot displace the one
        // already attached to a machine.
        if (!overviewByMachine.has(machineId)) {
          overviewByMachine.set(machineId, overview.id);
        }
        break;
      }
    }
  }

  const ids = new Set<string>();
  for (const c of safeCards) if (c.machineId) ids.add(c.machineId);
  for (const s of safeScripts) if (s.machineId) ids.add(s.machineId);

  const rows: AcademyMachine[] = [];
  for (const machineId of ids) {
    const card = safeCards.find((c) => c.machineId === machineId) ?? null;
    const script = safeScripts.find((s) => s.machineId === machineId) ?? null;
    rows.push({
      machineId,
      // Falling back to the corpus rather than showing a bare id: a machine
      // the app's database has never heard of is still a machine the Academy
      // documents, and the reader should see a name.
      name:
        machineName(machineId) ??
        (card ? cardTitle(card) : null) ??
        (script ? scriptTitle(script) : null) ??
        machineId,
      abbr: card?.abbr ?? script?.abbr ?? null,
      cardId: card?.id ?? null,
      scriptId: script?.id ?? null,
      overviewId: overviewByMachine.get(machineId) ?? null,
      workout: script?.workout ?? null,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** What this machine has, as a line under its name: "Card · Script · Deep dive". */
export function whatItHas(entry: AcademyMachine): string {
  const parts: string[] = [];
  if (entry.cardId) parts.push("Card");
  if (entry.scriptId) parts.push("Script");
  if (entry.overviewId) parts.push("Deep dive");
  const has = parts.join(" · ");
  return entry.abbr ? `${entry.abbr} · ${has}` : has;
}
