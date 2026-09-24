/**
 * CLINICAL WATCH-OUTS — which of a client's clinical flags matter on THIS
 * machine, in words a trainer can act on while walking to it.
 *
 * The clinical matrix (src/data/clinical-matrix.ts) has always carried
 * `protocolHandling` — an instruction, the machines it applies to and, for a
 * few, a setup modification ("Gap 4-6. Diagnostic load: 20 lbs / 3 reps").
 * Until the client-profile audit round (Sep 2026) nothing read it: the Body
 * section's helper text promised "machine-level contraindications" that no
 * screen delivered. This module is that reader, and it is pure so the
 * Programming rows, the machine window and the Body section say the same
 * thing.
 *
 * Two kinds of watch-out:
 *   · machine-specific — the instruction names this machine (osteoporosis →
 *     leg press, lumbar extension, …);
 *   · general — the instruction names no machine, so it applies to every set
 *     (uncontrolled hypertension → never hold the breath).
 *
 * The text is the studio's own clinical matrix, quoted — never generated.
 *
 * ── Which machine a rule names (Sep 24 2026) ────────────────────────────
 * The matrix names machines by the MACHINE_DATABASE keys it was written
 * against ("lumbar_extension", "abdominals", "4_way_neck"); the floor carries
 * the catalog's ids ("m-lumbar", "m-abs", "m-neck") and the studio's names
 * ("LUMBAR", "SEATED ABDOMINALS", "CX (4 WAY NECK)"). Matching the two by
 * normalised id-or-name left nine of the twenty standard machines — lumbar,
 * abs, neck, hip abduction and adduction, pullover, chest fly, bicep and
 * tricep — with no watch-out ever, so a client with degenerative disc disease
 * sat down at the lumbar machine and nothing on the screen said so.
 *
 * Both sides now go through `canonicalMachineId`
 * (features/catalog/machine-identity.ts), the app's one table from those keys
 * to the catalog's ids, rather than a second table here that could drift from
 * it. The matrix TEXT is not touched: the words are quoted, never reworded.
 * `clinical-watchouts.test.ts` fails if a key ever stops resolving to a real
 * catalog machine.
 *
 * A studio's own machine (`sm-…`) is matched by its lineage when it has one —
 * `comparisonKey`, which is `basedOn ?? machineId` (types/machines.ts) — so
 * "our Hammer leg press" gets the leg press's watch-outs. With no lineage it
 * is matched on its name only, which is the honest answer: the matrix was
 * written for the standard lineup.
 */

import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { canonicalMachineId } from "../features/catalog/machine-identity";
import type { ClinicalSafetyFlag } from "../types";

export type WatchOutTone = "alert" | "caution" | "modify";

export interface WatchOut {
  flagId: string;
  /** "Uncontrolled Hypertension" — the parenthetical detail dropped. */
  condition: string;
  /** The matrix's full condition name, for a tooltip or a detail line. */
  conditionFull: string;
  severity: string;
  tone: WatchOutTone;
  instruction: string;
  /** A concrete setup change, when the matrix names one. */
  setup: string | null;
  /** True when the instruction applies to every machine. */
  general: boolean;
}

/** A machine-specific watch-out, with the machines it names in words. */
export interface NamedWatchOut extends WatchOut {
  /** The machines on this floor the rule names, else the matrix's names for them. */
  machines: string[];
}

/** A machine as the floor, the routine rows and the machine windows carry it. */
export interface WatchOutMachine {
  id?: string | null;
  name?: string | null;
  fullName?: string | null;
  /**
   * `ResolvedMachine.comparisonKey` — `basedOn ?? machineId`. How a studio's
   * own machine says which catalog machine it is.
   */
  comparisonKey?: string | null;
}

/** "Uncontrolled Hypertension (Resting BP > 180/100 mmHg)" → "Uncontrolled Hypertension". */
export function shortCondition(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function toneOf(severity: string): WatchOutTone {
  const s = severity.toLowerCase();
  if (s.includes("absolute")) return "alert";
  if (s.includes("high")) return "caution";
  return "modify";
}

const TONE_RANK: Record<WatchOutTone, number> = { alert: 0, caution: 1, modify: 2 };

/** "Leg Press", "leg-press", "LEG_PRESS" → "leg_press". */
export function machineKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The catalog id a matrix key names: "lumbar_extension" → "m-lumbar",
 * "4_way_neck" → "m-neck". A key the identity table has never heard of comes
 * back as itself, which the test catches.
 */
export function catalogIdOfMatrixKey(key: string): string {
  return canonicalMachineId(machineKey(key));
}

/**
 * Every form a machine can be recognised by: its normalised id and names (so
 * a studio machine named after a matrix key still matches, as it always did)
 * and the catalog id each of them resolves to.
 */
function recognisedAs(machine: WatchOutMachine): Set<string> {
  const out = new Set<string>();
  for (const id of [machine.id, machine.comparisonKey]) {
    const raw = String(id ?? "").trim();
    if (!raw) continue;
    out.add(machineKey(raw));
    out.add(canonicalMachineId(raw));
  }
  for (const name of [machine.name, machine.fullName]) {
    const key = machineKey(name);
    if (!key) continue;
    out.add(key);
    out.add(canonicalMachineId(key, String(name)));
  }
  out.delete("");
  return out;
}

function namesMachine(keys: readonly string[] | null | undefined, recognised: ReadonlySet<string>): boolean {
  if (recognised.size === 0) return false;
  return (keys || []).some((k) => recognised.has(machineKey(k)) || recognised.has(catalogIdOfMatrixKey(k)));
}

/** "lumbar_extension" → "Lumbar Extension": a key, said as words. */
function keyAsWords(key: string): string {
  return machineKey(key)
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The machines a rule names, as a trainer knows them: the names on THIS
 * floor, in floor order. When none of them is on the floor (or there is no
 * floor to hand), the matrix's keys said as words, one per catalog machine —
 * never the raw key.
 */
export function namedMachines(
  keys: readonly string[] | null | undefined,
  floor: readonly WatchOutMachine[] = [],
): string[] {
  if (!keys || keys.length === 0) return [];
  const onFloor: string[] = [];
  for (const m of floor) {
    if (!namesMachine(keys, recognisedAs(m))) continue;
    const label = String(m.name || m.fullName || "").trim();
    if (label && !onFloor.includes(label)) onFloor.push(label);
  }
  if (onFloor.length > 0) return onFloor;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const id = catalogIdOfMatrixKey(k);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(keyAsWords(k));
  }
  return out;
}

function flagsFor(flagIds: readonly string[] | null | undefined, matrix: readonly ClinicalSafetyFlag[]): ClinicalSafetyFlag[] {
  if (!flagIds || flagIds.length === 0) return [];
  const wanted = new Set(flagIds);
  return matrix.filter((f) => wanted.has(f.id));
}

function sortWatchOuts<T extends WatchOut>(list: T[]): T[] {
  return list.sort(
    (a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.condition.localeCompare(b.condition),
  );
}

/**
 * Watch-outs whose instruction names this machine — by its catalog id, its
 * lineage or its name (see "Which machine a rule names" above).
 */
export function machineWatchOuts(
  flagIds: readonly string[] | null | undefined,
  machine: WatchOutMachine,
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): WatchOut[] {
  if (!flagIds || flagIds.length === 0) return [];
  const recognised = recognisedAs(machine);
  if (recognised.size === 0) return [];
  const out: WatchOut[] = [];
  for (const flag of flagsFor(flagIds, matrix)) {
    for (const rule of flag.protocolHandling || []) {
      if (!namesMachine(rule.affectedMachineIds, recognised)) continue;
      out.push({
        flagId: flag.id,
        condition: shortCondition(flag.conditionName),
        conditionFull: flag.conditionName,
        severity: flag.severity,
        tone: toneOf(flag.severity),
        instruction: rule.instruction,
        setup: rule.setupModification?.trim() || null,
        general: false,
      });
    }
  }
  return sortWatchOuts(out);
}

/** Watch-outs that name no machine — they apply to every set. */
export function generalWatchOuts(
  flagIds: readonly string[] | null | undefined,
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): WatchOut[] {
  const out: WatchOut[] = [];
  for (const flag of flagsFor(flagIds, matrix)) {
    for (const rule of flag.protocolHandling || []) {
      if ((rule.affectedMachineIds || []).length > 0) continue;
      out.push({
        flagId: flag.id,
        condition: shortCondition(flag.conditionName),
        conditionFull: flag.conditionName,
        severity: flag.severity,
        tone: toneOf(flag.severity),
        instruction: rule.instruction,
        setup: rule.setupModification?.trim() || null,
        general: true,
      });
    }
  }
  return sortWatchOuts(out);
}

/**
 * Watch-outs that name machines, each with those machines in words — for a
 * screen that lists the client's conditions rather than one machine's (the
 * session's "What to know" sheet).
 */
export function machineSpecificWatchOuts(
  flagIds: readonly string[] | null | undefined,
  floor: readonly WatchOutMachine[] = [],
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): NamedWatchOut[] {
  const out: NamedWatchOut[] = [];
  for (const flag of flagsFor(flagIds, matrix)) {
    for (const rule of flag.protocolHandling || []) {
      if ((rule.affectedMachineIds || []).length === 0) continue;
      out.push({
        flagId: flag.id,
        condition: shortCondition(flag.conditionName),
        conditionFull: flag.conditionName,
        severity: flag.severity,
        tone: toneOf(flag.severity),
        instruction: rule.instruction,
        setup: rule.setupModification?.trim() || null,
        general: false,
        machines: namedMachines(rule.affectedMachineIds, floor),
      });
    }
  }
  return sortWatchOuts(out);
}

/** How many machines in a list carry at least one machine-specific watch-out. */
export function machinesWithWatchOuts(
  flagIds: readonly string[] | null | undefined,
  machines: ReadonlyArray<WatchOutMachine>,
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): number {
  if (!flagIds || flagIds.length === 0) return 0;
  return machines.filter((m) => machineWatchOuts(flagIds, m, matrix).length > 0).length;
}
