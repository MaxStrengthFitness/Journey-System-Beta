/**
 * Adapters from the app's Firestore-shaped records to the grid's view models.
 *
 * Structural types below mirror the fields the grid needs from
 * `WorkoutSession`, `ExerciseLog`, `Machine` and `ClientMachineSetting` in
 * src/types.ts — import those instead once this folder lives in the app:
 *
 *   import type { WorkoutSession, ExerciseLog, Machine, ClientMachineSetting } from "../../types";
 */
import type { JourneyMachine, JourneyRow, JourneySession, JourneySet, MovementGroup, RepQuality } from "./types";

export interface SessionLike {
  id?: string;
  sessionNumber: number;
  date: string;
  trainerInitials: string;
}

export interface LogLike {
  sessionId: string;
  machineId: string;
  weight?: string | number;
  reps?: string | number;
  seconds?: string | number;
  isTSC?: boolean;
  isStaticHold?: boolean;
  repQuality?: RepQuality;
  side?: "Left" | "Right";
}

export interface MachineLike {
  id?: string;
  name: string;
  fullName?: string;
}

export interface ClientSettingLike {
  settings?: Record<string, string>;
  startingWeight?: number;
  startingWeightDate?: unknown;
  currentWeight?: number;
}

const num = (v: string | number | undefined): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * "2026-09-02", "2026-09-02 10:30", "9/2/2026" → "2026-09-02".
 * Never goes through `new Date(string)` for date-only values, so a session
 * logged on Sep 2 is never shown as Sep 1 in a different timezone.
 */
export function toIsoDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim().replace(" ", "T").split("T")[0];
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? raw : t.toISOString().slice(0, 10);
}

/** Sessions oldest → newest — the reading order of the grid. */
export function toJourneySessions(sessions: SessionLike[]): JourneySession[] {
  return sessions
    .filter((s) => !!s.id)
    .map((s) => ({
      id: s.id as string,
      sessionNumber: s.sessionNumber ?? 0,
      date: toIsoDate(s.date),
      trainerInitials: (s.trainerInitials || "—").toUpperCase(),
    }))
    .sort((a, b) => a.sessionNumber - b.sessionNumber || a.date.localeCompare(b.date));
}

/** Same rule set as lib/machine-colors.ts, minus the colours. */
export function movementGroupFor(name: string): MovementGroup {
  const n = name.toLowerCase();
  if (n.includes("neck")) return "Neck";
  if (n.includes("leg") || n.includes("hip") || n.includes("calf") || n.includes("thigh")) return "Lower Body";
  if (n.includes("pull") || n.includes("row") || n.includes("bicep")) return "Pull";
  if (n.includes("press") || n.includes("raise") || n.includes("fly") || n.includes("tricep") || n.includes("dip")) return "Push";
  if (n.includes("ab") || n.includes("lumbar") || n.includes("torso") || n.includes("core")) return "Core";
  return "Neck";
}

export function toJourneySet(log: LogLike): JourneySet | null {
  const weight = num(log.weight);
  if (weight === undefined) return null;
  const isTSC = !!(log.isTSC || log.isStaticHold);
  return {
    sessionId: log.sessionId,
    weight,
    reps: isTSC ? undefined : num(log.reps),
    seconds: isTSC ? num(log.seconds) : undefined,
    isTSC,
    quality: log.repQuality ?? 2,
    side: log.side === "Left" ? "L" : log.side === "Right" ? "R" : undefined,
  };
}

/**
 * Build rows. When a machine has a Left and a Right log for the same session,
 * the Left one wins for the cell (the grid shows one set per cell); wire a
 * per-side row if you want them split.
 */
export function toJourneyRows(
  machines: MachineLike[],
  logs: LogLike[],
  clientSettings: Record<string, ClientSettingLike | undefined>,
  starredMachineIds: Set<string> = new Set(),
): JourneyRow[] {
  const byMachine = new Map<string, LogLike[]>();
  for (const log of logs) {
    const list = byMachine.get(log.machineId) ?? [];
    list.push(log);
    byMachine.set(log.machineId, list);
  }

  return machines
    .filter((m) => !!m.id)
    .map((m) => {
      const id = m.id as string;
      const setting = clientSettings[id];
      const sets: Record<string, JourneySet> = {};
      for (const log of byMachine.get(id) ?? []) {
        const set = toJourneySet(log);
        if (!set) continue;
        if (!sets[log.sessionId] || log.side !== "Right") sets[log.sessionId] = set;
      }
      const machine: JourneyMachine = {
        id,
        name: m.name,
        group: movementGroupFor(m.name),
        settings: setting?.settings && Object.keys(setting.settings).length ? setting.settings : undefined,
        starred: starredMachineIds.has(id),
      };
      return {
        machine,
        sets,
        startingWeight: setting?.startingWeight,
        prescribedWeight: setting?.currentWeight,
      };
    });
}

export const GROUP_ORDER: MovementGroup[] = ["Neck", "Lower Body", "Push", "Pull", "Core"];
