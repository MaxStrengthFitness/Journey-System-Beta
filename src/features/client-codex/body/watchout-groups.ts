/**
 * BODY & PULSE → WATCH-OUTS — her clinical flags' instructions, quoted in
 * full and grouped by instruction, with the machines on this floor each one
 * names.
 *
 * Client codex, Sep 2026 (phase 12). The long scroll's banner (BodyWatchOuts,
 * deleted) said "Machine instructions on file for: Leg Press, Chest Press —
 * open the machine for the detail": it pointed elsewhere instead of saying
 * what the instruction was. The card now QUOTES every instruction, once, with
 * a button for each machine on this floor it names:
 *
 *   Every set · High blood pressure — managed
 *     “Keep the breathing continuous on every set — no breath-holding under load.”
 *   [Leg Press ›]  Total Knee Replacement
 *     “Avoid deep knee flexion …”
 *
 * One instruction that names three floor machines is ONE group listing all
 * three, not three copies of the paragraph. An instruction that names no
 * machine on this studio's floor is still shown, and says so.
 *
 * The words are the studio's clinical matrix, verbatim — built only from
 * `generalWatchOuts` / `machineWatchOuts` (src/lib/clinical-watchouts.ts) and
 * the matrix's own rules, so nothing here can reword one. Most serious first:
 * general groups (they apply to every set), then machine groups, each by tone
 * (Stop · High · modify), then by condition.
 *
 * Pure: watchout-groups.test.ts.
 */
import { CLINICAL_FLAGS_MATRIX } from "../../../data/clinical-matrix";
import { generalWatchOuts, machineKey, machineWatchOuts } from "../../../lib/clinical-watchouts";
import { TONE_BADGE, TONE_ORDER, selectedFlags, type FlagOption } from "../../clinical-flags/flag-search";
import type { ClinicalSafetyFlag } from "../../../types";

export interface FloorMachineLike {
  id?: string | null;
  name?: string | null;
  fullName?: string | null;
  /**
   * Lineage (`basedOn ?? machineId`), which `toFloorMachines` carries since
   * the clinical watch-outs fix (Sep 24): how a studio's own machine
   * ("our Hammer leg press") picks up its catalog machine's watch-outs.
   */
  comparisonKey?: string | null;
}

export interface WatchOutGroup {
  key: string;
  flag: FlagOption;
  /** The matrix's instruction, verbatim. */
  instruction: string;
  /** The matrix's set-up change, verbatim, when it names one. */
  setup: string | null;
  /** True when the instruction names no machine: it applies to every set. */
  general: boolean;
  /** The machines on this floor the instruction names, by name. */
  machines: { id: string; name: string }[];
  /** A machine instruction that names no machine on this studio's floor. */
  namesOffFloor: boolean;
}

const nameOf = (m: FloorMachineLike) => (m.fullName || m.name || "").trim();

/**
 * Her flags' instructions, grouped. `floorMachines` is the studio's floor
 * (the profile's machine list): the only machines a chip is offered for.
 */
export function watchOutGroups(
  flagIds: readonly string[] | null | undefined,
  floorMachines: readonly FloorMachineLike[],
  matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX,
): WatchOutGroup[] {
  const flags = new Map(selectedFlags(flagIds, matrix).map((f) => [f.id, f]));
  const general: WatchOutGroup[] = [];
  for (const w of generalWatchOuts(flagIds, matrix)) {
    const flag = flags.get(w.flagId);
    if (!flag) continue;
    general.push({
      key: `general:${w.flagId}:${w.instruction}`,
      flag,
      instruction: w.instruction,
      setup: w.setup,
      general: true,
      machines: [],
      namesOffFloor: false,
    });
  }

  // Which floor machines each (flag, instruction) names — through the one
  // machine matcher the Programming rows and the machine window use.
  const onFloor = new Map<string, { id: string; name: string }[]>();
  for (const m of floorMachines) {
    const id = (m.id ?? "").trim();
    const name = nameOf(m);
    if (!id || !name) continue;
    for (const w of machineWatchOuts(flagIds, m, matrix)) {
      const key = `${w.flagId}::${w.instruction}`;
      const list = onFloor.get(key) ?? [];
      if (!list.some((x) => x.id === id)) list.push({ id, name });
      onFloor.set(key, list);
    }
  }

  const machine: WatchOutGroup[] = [];
  for (const f of matrix) {
    const flag = flags.get(f.id);
    if (!flag) continue;
    for (const rule of f.protocolHandling || []) {
      const names = (rule.affectedMachineIds || []).map(machineKey).filter(Boolean);
      if (names.length === 0) continue;
      const found = (onFloor.get(`${f.id}::${rule.instruction}`) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      machine.push({
        key: `machine:${f.id}:${rule.instruction}`,
        flag,
        instruction: rule.instruction,
        setup: rule.setupModification?.trim() || null,
        general: false,
        machines: found,
        namesOffFloor: found.length === 0,
      });
    }
  }

  const byTone = (a: WatchOutGroup, b: WatchOutGroup) =>
    TONE_ORDER[a.flag.tone] - TONE_ORDER[b.flag.tone] || a.flag.name.localeCompare(b.flag.name);
  return [...general.sort(byTone), ...machine.sort(byTone)];
}

/** "Every set · High blood pressure — managed · Grade 2 or higher" — a general group's eyebrow, detail inline. */
export function groupEyebrow(group: Pick<WatchOutGroup, "flag" | "general">): string {
  const name = group.flag.detail ? `${group.flag.name} · ${group.flag.detail}` : group.flag.name;
  return group.general ? `Every set · ${name}` : name;
}

/**
 * A flag as a chip, the one way the codex draws it (Watch-outs and the
 * Overview's Body & Pulse slot): its name, with "Stop" or "High" when the
 * matrix says so, and its tone — crimson only for an absolute
 * contraindication, plum for a high risk, blue for one that changes the
 * set-up.
 */
export function flagChip(f: Pick<FlagOption, "name" | "tone">): { text: string; tone: "alert" | "warn" | "live" } {
  const badge = TONE_BADGE[f.tone];
  return {
    text: badge ? `${f.name} · ${badge.short}` : f.name,
    tone: f.tone === "alert" ? "alert" : f.tone === "caution" ? "warn" : "live",
  };
}
