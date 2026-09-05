/**
 * ROUTINES — view model.
 *
 * One row per machine in a routine, carrying the numbers a trainer scans
 * before a session: the prescription (current weight), the most recent
 * outcome (reps or hold time) and the setup chips. Pure, so the Routines tab
 * is a plain function of profile state and the harness can render it.
 */

import type { Client, ClientMachineSetting, ExerciseLog, Machine, Routine, RoutineAdjustment, Trainer, WorkoutSession } from "../../types";
import { orderMachineSettings, parseSessionDate } from "../../lib/utils";

export interface RoutineRow {
  order: number;
  machineId: string;
  name: string;
  /** "Hip", "Thigh / Quad" — the machine's anatomical region, when known. */
  region: string | null;
  /** Prescribed / most recent load in lb, or null. */
  weight: number | null;
  /** Reps or seconds of the most recent set, or null. */
  outcome: number | null;
  /** True when the outcome is seconds (timed static contraction). */
  isHold: boolean;
  /** Ordered setting chips — [shortKey, value]. */
  settings: [string, string][];
  /** Starting weight for the start → now readout, when different from `weight`. */
  startingWeight: number | null;
  /** Routine-specific coaching note for this machine, if the trainer left one. */
  note: string | null;
  missing: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export type RoutineName = "Routine A" | "Routine B";

/**
 * The profile always shows both routines, even before either exists in
 * Firestore. A missing one is represented by a `temp-a` / `temp-b` stand-in
 * that the mutation handlers know to create on first use.
 */
export function resolveRoutine(routines: Routine[], name: RoutineName, clientId: string, studioId: string): Routine {
  return (
    routines.find((r) => r.name === name) || {
      id: name === "Routine A" ? "temp-a" : "temp-b",
      name,
      clientId,
      machineIds: [],
      studioId,
    }
  );
}

/** How far a routine has drifted from the template it was applied from. */
export function templateDrift(routine: Routine): { added: number; removed: number } | null {
  if (!routine.templateId || !routine.templateMachineIds) return null;
  const tpl = new Set(routine.templateMachineIds);
  const cur = new Set(routine.machineIds);
  return {
    added: routine.machineIds.filter((id) => !tpl.has(id)).length,
    removed: routine.templateMachineIds.filter((id) => !cur.has(id)).length,
  };
}

export function buildRoutineRows(
  routine: Pick<Routine, "machineIds" | "machineNotes">,
  machines: Machine[],
  client: Client | null | undefined,
  clientSettings: Record<string, ClientMachineSetting>,
  allLogs: ExerciseLog[],
  sessions: WorkoutSession[],
): RoutineRow[] {
  const byId = new Map(machines.filter((m) => !!m.id).map((m) => [m.id as string, m]));
  // Newest session first, so the first log we meet for a machine is its latest.
  const sessionRank = new Map<string, number>();
  [...sessions]
    .sort((a, b) => parseSessionDate(b.date) - parseSessionDate(a.date))
    .forEach((s, i) => s.id && sessionRank.set(s.id, i));
  const latestLog = new Map<string, ExerciseLog>();
  for (const log of allLogs) {
    if (!log.machineId) continue;
    const cur = latestLog.get(log.machineId);
    const r = sessionRank.get(log.sessionId) ?? Number.MAX_SAFE_INTEGER;
    const cr = cur ? sessionRank.get(cur.sessionId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (!cur || r < cr) latestLog.set(log.machineId, log);
  }

  return routine.machineIds.map((machineId, i) => {
    const machine = byId.get(machineId);
    const metric = client?.currentMachineMetrics?.[machineId];
    const setting = clientSettings[machineId];
    const log = latestLog.get(machineId);
    const isHold = !!(metric?.isStaticHold ?? metric?.isTSC ?? log?.isStaticHold ?? log?.isTSC);
    const weight = num(metric?.weight) ?? num(log?.weight ?? log?.loadLb) ?? num(setting?.currentWeight) ?? num(setting?.startingWeight);
    const outcome = isHold ? num(metric?.seconds) ?? num(log?.seconds ?? log?.outcomeTut) : num(metric?.reps) ?? num(log?.reps ?? log?.outcomeReps);
    // orderMachineSettings always injects "Gap 0", which is a real default
    // once a machine is set up but pure noise before it is — so no chips at
    // all until the trainer has recorded at least one setting.
    const rawSettings = setting?.settings || metric?.settings || {};
    const chips = Object.values(rawSettings).some((v) => v !== undefined && v !== null && String(v).trim() !== "")
      ? orderMachineSettings(rawSettings)
          .slice(0, 5)
          .map(([k, v]) => [k.charAt(0).toUpperCase(), String(v)] as [string, string])
      : [];
    return {
      order: i + 1,
      machineId,
      name: machine?.fullName || machine?.name || "Unknown machine",
      region: machine?.anatomicalRegion || null,
      weight,
      outcome,
      isHold,
      settings: chips,
      startingWeight: num(setting?.startingWeight),
      note: routine.machineNotes?.[machineId]?.trim() || null,
      missing: !machine,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Adjustment journal
 * ------------------------------------------------------------------ */

export interface RoutineChange {
  id: string;
  routineId: string;
  routineLabel: "A" | "B" | "?";
  when: number | null;
  trainerInitials: string;
  trainerName: string;
  kind: "created" | "enabled" | "disabled" | "machines";
  added: string[];
  removed: string[];
  notes: string | null;
}

const toMs = (v: unknown): number | null => {
  if (!v) return null;
  const anyV = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.toDate === "function") return anyV.toDate().getTime();
  if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  if (typeof v === "number") return v;
  return null;
};

export function buildRoutineChanges(
  adjustments: RoutineAdjustment[],
  routines: Routine[],
  machines: Machine[],
  trainers: Trainer[],
): RoutineChange[] {
  const nameOf = (id: string) => machines.find((m) => m.id === id)?.name || "Unknown";
  const labelFor = (routineId: string): "A" | "B" | "?" => {
    const r = routines.find((x) => x.id === routineId);
    if (r?.name?.includes("B") || routineId === "temp-b") return "B";
    if (r?.name?.includes("A") || routineId === "temp-a") return "A";
    return "?";
  };
  return adjustments.map((adj) => {
    const trainer = trainers.find((t) => t.id === adj.trainerId);
    const kind: RoutineChange["kind"] =
      adj.changeType === "enabled" || adj.changeType === "disabled" || adj.changeType === "created" ? adj.changeType : "machines";
    const prev = adj.previousMachineIds || [];
    const next = adj.newMachineIds || [];
    return {
      id: adj.id || `${adj.routineId}-${toMs(adj.createdAt) ?? Math.random()}`,
      routineId: adj.routineId,
      routineLabel: labelFor(adj.routineId),
      when: toMs(adj.createdAt),
      trainerInitials: trainer?.initials || (adj.trainerId || "TR").slice(0, 2).toUpperCase(),
      trainerName: trainer?.fullName || adj.trainerId || "Unknown trainer",
      kind,
      added: kind === "machines" || kind === "created" ? next.filter((id) => !prev.includes(id)).map(nameOf) : [],
      removed: kind === "machines" ? prev.filter((id) => !next.includes(id)).map(nameOf) : [],
      notes: adj.notes?.trim() || null,
    };
  });
}

export function relativeTime(ms: number | null, now = Date.now()): string {
  if (!ms) return "never";
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/** Newest change for one routine — `changes` is newest-first as fetched. */
export function latestChangeFor(changes: RoutineChange[], routineId: string): RoutineChange | null {
  let best: RoutineChange | null = null;
  for (const c of changes) {
    if (c.routineId !== routineId) continue;
    if (!best || (c.when ?? 0) > (best.when ?? 0)) best = c;
  }
  return best;
}

export function changesThisMonth(changes: RoutineChange[], now = new Date()): number {
  const m = now.getMonth();
  const y = now.getFullYear();
  return changes.filter((c) => {
    if (!c.when) return false;
    const d = new Date(c.when);
    return d.getMonth() === m && d.getFullYear() === y;
  }).length;
}

/** "Sep 3, 2026" — the journal's absolute stamp beside the relative one. */
export function shortStamp(ms: number | null): string {
  if (!ms) return "Date unknown";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
