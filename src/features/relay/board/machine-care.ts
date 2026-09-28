/**
 * MACHINE CARE — the Floor Map's wear signals, and the care events behind them.
 *
 * Round: Relay, Sep 2026. AJ's document describes two kinds of upkeep the
 * old "0 of 20 done" could not express: HIGH-TRAFFIC WEAR (handles, seats
 * and pads pick up grime with every client, so a busy machine wants a wipe
 * more often than a quiet one) and LOW-TRAFFIC DUST (an untouched machine
 * still needs a clean every so often). So every tile carries two signals:
 *
 *   touches since the last wipe   sessions logged on the machine since
 *                                 lastWipedAt — from the sessions the app
 *                                 already loads for today (sessionMachineIds),
 *                                 warming the tile as it climbs
 *   days since the last deep clean a thin bar that fills over the studio's
 *                                 interval (deepCleanIntervalDays, default 14)
 *
 * THE STUDIO'S OWN CLEANING LOG (the second wave, Sep 28 2026; AJ: "allow
 * studios to customize how the cleaning log works, it can be used for daily
 * deep cleans, for weekly maintenance, or for cleaning it after X amount of
 * uses"). Three studio settings, read through features/studio-settings by
 * the Floor Map (the studio's own, else Max Strength's default, else the
 * app's): deepCleanDays (1 is a daily deep clean; the studio document's
 * deepCleanIntervalDays still answers until the settings hold one),
 * wipeAfterSessions (a machine WANTS A WIPE once that many sessions used it
 * since its last wipe), and weeklyMaintenanceDay (a line on the map on that
 * day, or none).
 *
 * One document per machine at studios/{s}/machineCare/{machineId}, written
 * from the care sheet. A wipe or deep clean is ALSO appended to the studio's
 * upkeepLog, which the Operations equipment panel already reads, so the two
 * screens never disagree. A flag lives here alone; it is a note to the floor
 * and the Team tab's Open loops, never a roster status change.
 *
 * Pure functions here; Firestore in machine-care-store.ts.
 */
import type { WorkoutSession } from "../../../types";
import { MACHINE_ANATOMY, MOVEMENT_PATTERN_ORDER } from "../../../data/machine-anatomy-map";
import { SETTING_BY_KEY, WEEKDAY_NAMES } from "../../studio-settings/registry";

export interface CareActor {
  id: string;
  name: string;
}

export interface MachineFlag {
  note: string;
  by: CareActor;
  /** ms since epoch. */
  at: number;
}

/** studios/{studioId}/machineCare/{machineId} */
export interface MachineCare {
  machineId: string;
  /** ms since epoch, or null when never recorded here. */
  lastWipedAt: number | null;
  lastWipedBy: CareActor | null;
  lastDeepCleanAt: number | null;
  lastDeepCleanBy: CareActor | null;
  flag: MachineFlag | null;
  updatedAt?: unknown;
}

/** The app's defaults, from the studio settings' registry (the studio's own or head office's win). */
export const DEFAULT_DEEP_CLEAN_DAYS = SETTING_BY_KEY.deepCleanDays.appDefault ?? 14;
export const DEFAULT_WIPE_AFTER_SESSIONS = SETTING_BY_KEY.wipeAfterSessions.appDefault ?? 4;
export const FLAG_NOTE_MAX = 500;

export type Heat = 0 | 1 | 2 | 3;

export interface MachineWear {
  machineId: string;
  /** Sessions on the machine since the last wipe (today's sessions only). */
  touches: number;
  heat: Heat;
  /** Minutes since the last wipe, or null when never recorded. */
  sinceWipeMin: number | null;
  daysSinceDeep: number | null;
  /** 0..1 of the deep-clean interval used up; 1 means due. */
  deepFraction: number;
  deepDue: boolean;
  /** Used by the studio's number of sessions (wipeAfterSessions) or more since its last wipe. */
  wantsWipe: boolean;
  flag: MachineFlag | null;
}

function millisOf(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const anyV = v as { toMillis?: () => number; seconds?: number };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** When a session began, best effort: startTime, else createdAt. */
export function sessionStartMillis(s: Pick<WorkoutSession, "startTime" | "createdAt">): number | null {
  return millisOf(s.startTime) ?? millisOf(s.createdAt);
}

/** 0–1 touches cool, 2–3 warm, 4–5 hot, 6+ very hot. */
export function heatOf(touches: number): Heat {
  if (touches >= 6) return 3;
  if (touches >= 4) return 2;
  if (touches >= 2) return 1;
  return 0;
}

export const HEAT_WORD: Record<Heat, string> = {
  0: "Cool",
  1: "Warm",
  2: "Hot",
  3: "Very hot",
};

export function wearOf(
  machineId: string,
  input: {
    sessions: Pick<WorkoutSession, "sessionMachineIds" | "startTime" | "createdAt" | "status">[];
    care: MachineCare | null | undefined;
    now: number;
    deepCleanDays?: number;
    /** The studio's wipe-after number (studio settings); the app's default when absent. */
    wipeAfterSessions?: number;
  },
): MachineWear {
  const care = input.care ?? null;
  const wipedAt = care?.lastWipedAt ?? null;
  let touches = 0;
  for (const s of input.sessions) {
    if (!s.sessionMachineIds?.includes(machineId)) continue;
    const at = sessionStartMillis(s);
    if (at === null) continue;
    if (wipedAt !== null && at <= wipedAt) continue;
    touches += 1;
  }
  const deepAt = care?.lastDeepCleanAt ?? null;
  const days = input.deepCleanDays ?? DEFAULT_DEEP_CLEAN_DAYS;
  const daysSinceDeep = deepAt === null ? null : Math.floor((input.now - deepAt) / 86_400_000);
  const deepFraction = daysSinceDeep === null ? 1 : Math.max(0, Math.min(1, daysSinceDeep / days));
  return {
    machineId,
    touches,
    heat: heatOf(touches),
    sinceWipeMin: wipedAt === null ? null : Math.max(0, Math.floor((input.now - wipedAt) / 60_000)),
    daysSinceDeep,
    deepFraction,
    deepDue: deepFraction >= 1,
    wantsWipe: touches >= Math.max(1, input.wipeAfterSessions ?? DEFAULT_WIPE_AFTER_SESSIONS),
    flag: care?.flag ?? null,
  };
}

/** "Wiped 40 min ago by Marina" · "Not wiped today". */
export function wipeSentence(w: MachineWear, care: MachineCare | null | undefined): string {
  if (w.sinceWipeMin === null) return "No wipe on record";
  const who = care?.lastWipedBy ? ` by ${care.lastWipedBy.name.split(" ")[0]}` : "";
  if (w.sinceWipeMin < 60) return `Wiped ${w.sinceWipeMin} min ago${who}`;
  if (w.sinceWipeMin < 24 * 60) return `Wiped ${Math.floor(w.sinceWipeMin / 60)} h ago${who}`;
  return `Wiped ${Math.floor(w.sinceWipeMin / 1440)} d ago${who}`;
}

export function deepSentence(w: MachineWear, days = DEFAULT_DEEP_CLEAN_DAYS): string {
  if (w.daysSinceDeep === null) return "No deep clean on record";
  if (w.daysSinceDeep === 0) return "Deep cleaned today";
  if (w.deepDue) return `Deep clean due · ${w.daysSinceDeep} days`;
  return `Deep clean in ${days - w.daysSinceDeep} days`;
}

/** "Wants a wipe: 5 sessions since the last one (this studio wipes after 4).", or null. */
export function wantsWipeSentence(w: Pick<MachineWear, "wantsWipe" | "touches">, wipeAfterSessions: number = DEFAULT_WIPE_AFTER_SESSIONS): string | null {
  if (!w.wantsWipe) return null;
  return `Wants a wipe: ${w.touches} ${w.touches === 1 ? "session" : "sessions"} since the last one (this studio wipes after ${wipeAfterSessions}).`;
}

/** The weekly maintenance line on the studio's day for it (0 = Sunday … 6 = Saturday), or null (none set, or not today). */
export function weeklyMaintenanceLine(weekday: number | null | undefined, todayKey: string): string | null {
  if (weekday === null || weekday === undefined || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  const [y, m, d] = todayKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (today !== weekday) return null;
  return `Weekly maintenance today: ${WEEKDAY_NAMES[weekday]} is this studio's day for it.`;
}

/* ------------------------------------------------------------------ *
 * Grouping the tiles like the Catalog
 * ------------------------------------------------------------------ */

export interface FloorTileMachine {
  id: string;
  name: string;
  movementPattern: string | null;
}

export interface FloorGroup {
  key: string;
  label: string;
  machines: FloorTileMachine[];
}

/**
 * Movement-pattern groups in the Catalog's order (MOVEMENT_PATTERN_ORDER),
 * anything unknown last under "Other equipment". A machine with no pattern
 * on it borrows the anatomy map's, which is how the Catalog reads the
 * app-wide list too.
 */
export function groupFloor(machines: FloorTileMachine[]): FloorGroup[] {
  const byPattern = new Map<string, FloorTileMachine[]>();
  for (const m of machines) {
    const pattern = m.movementPattern ?? MACHINE_ANATOMY[m.id]?.movementPattern ?? "Other equipment";
    const list = byPattern.get(pattern) ?? [];
    list.push(m);
    byPattern.set(pattern, list);
  }
  const order: string[] = [...MOVEMENT_PATTERN_ORDER];
  const keys = [...byPattern.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    label: key.replace(/^(Upper Body|Lower Body|Core): /, ""),
    machines: byPattern.get(key)!,
  }));
}
