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
 */

import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
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

function flagsFor(flagIds: readonly string[] | null | undefined, matrix: readonly ClinicalSafetyFlag[]): ClinicalSafetyFlag[] {
  if (!flagIds || flagIds.length === 0) return [];
  const wanted = new Set(flagIds);
  return matrix.filter((f) => wanted.has(f.id));
}

function sortWatchOuts(list: WatchOut[]): WatchOut[] {
  return list.sort(
    (a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.condition.localeCompare(b.condition),
  );
}

/**
 * Watch-outs whose instruction names this machine. A machine matches on its
 * id or its name, both normalised — studio-original machines (`sm-…`) match
 * on name only, which is the honest answer: the matrix was written for the
 * standard lineup.
 */
export function machineWatchOuts(
  flagIds: readonly string[] | null | undefined,
  machine: { id?: string | null; name?: string | null; fullName?: string | null },
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): WatchOut[] {
  const keys = new Set(
    [machine.id, machine.name, machine.fullName].map(machineKey).filter((k) => k.length > 0),
  );
  if (keys.size === 0) return [];
  const out: WatchOut[] = [];
  for (const flag of flagsFor(flagIds, matrix)) {
    for (const rule of flag.protocolHandling || []) {
      const hits = (rule.affectedMachineIds || []).some((id) => keys.has(machineKey(id)));
      if (!hits) continue;
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

/** How many machines in a list carry at least one machine-specific watch-out. */
export function machinesWithWatchOuts(
  flagIds: readonly string[] | null | undefined,
  machines: ReadonlyArray<{ id?: string | null; name?: string | null; fullName?: string | null }>,
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): number {
  if (!flagIds || flagIds.length === 0) return 0;
  return machines.filter((m) => machineWatchOuts(flagIds, m, matrix).length > 0).length;
}
