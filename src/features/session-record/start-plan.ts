/**
 * What Start writes, worked out before anything is written (speed round,
 * Oct 5 2026; R9 in the round's blueprint).
 *
 * START NEVER WAITS ON THE NETWORK. Start used to await the database four
 * times in a row (a new routine, the session, the client, the arrival note)
 * before the prefilled weights were even sent. Online that was 150-600 ms of
 * nothing on screen; offline the session's own write never answered, so
 * nothing after it ran until the Wi-Fi came back, and a client with no
 * Routine A could not start at all.
 *
 * Now the ids are made on the iPad, and the session, its routine (when one
 * has to be made) and the prefilled sets go in ONE batch that is issued and
 * never awaited: the iPad's own copy of the database holds them at once, and
 * the database's answer only matters if it is a refusal. The client's own
 * fields (Routine B, the first session's day) are a SEPARATE write, because
 * the clients rules limit what a visiting or cross-train trainer may change,
 * and one refused client field must never take the session down with it. The
 * arrival note is its own write too, never waited on.
 *
 * "Known" (a routines or settings snapshot has arrived, from the iPad's cache
 * or the server): until the client's routines are known, Start never makes a
 * Routine A, because an empty list there means "not read yet", not "none" -
 * that was how a second, empty Routine A got made. Until the settings are
 * known, the prefilled weights wait. Neither ever holds Start itself: the
 * session starts, and the routine and the weights follow the moment they are
 * known (`resolveStartRoutine` again, then `seedLogs`).
 *
 * Everything here is pure. The tracker issues the writes.
 */
import type { Client, ClientMachineSetting, ExerciseLog, Routine } from "../../types";
import { logDocId } from "../../lib/exercise-log-id";
import { isPerSideMachine } from "../../lib/floor-machines";

export type StartRoutineType = "A" | "B" | "Free";

/** Which routine a session starts on. */
export type StartRoutine =
  /** A Free session: no routine. */
  | { kind: "free" }
  /** The client's own routine of that letter. */
  | { kind: "existing"; routine: Routine }
  /** The client has none (the routines are known): one is made, in the start batch. */
  | { kind: "create"; name: string; machineIds: string[] }
  /** The routines aren't known yet: decided the moment they are, never guessed. */
  | { kind: "unknown"; name: string };

export function resolveStartRoutine(a: {
  routineType: StartRoutineType;
  customMachines?: string[] | null;
  routines: Routine[];
  routinesKnown: boolean;
}): StartRoutine {
  if (a.routineType === "Free") return { kind: "free" };
  const name = `Routine ${a.routineType}`;
  // An unknown list may still hold the last client's routines: never read it.
  if (!a.routinesKnown) return { kind: "unknown", name };
  const found = a.routines.find((r) => r.name === name);
  if (found) return { kind: "existing", routine: found };
  return { kind: "create", name, machineIds: a.customMachines ? [...a.customMachines] : [] };
}

/**
 * The machines the session intends to run, in order. A list the briefing
 * adjusted wins; otherwise the routine's. Nothing yet while the routine is
 * unknown, unless the trainer adjusted it.
 */
export function plannedMachinesOf(routine: StartRoutine, customMachines?: string[] | null): string[] {
  const custom = customMachines && customMachines.length > 0 ? [...customMachines] : null;
  switch (routine.kind) {
    case "existing":
      return custom ?? [...(routine.routine.machineIds ?? [])];
    case "create":
      return [...routine.machineIds];
    case "free":
    case "unknown":
      return custom ?? [];
  }
}

/**
 * The client fields Start changes, as flags (the tracker writes the values).
 * Written apart from the session: see the header.
 */
export function startClientPatch(a: {
  routineType: StartRoutineType;
  client: Pick<Client, "isRoutineBActive" | "firstSessionDate"> | null | undefined;
  sessionNumber: number;
}): { isRoutineBActive?: true; firstSessionDate?: true } {
  const out: { isRoutineBActive?: true; firstSessionDate?: true } = {};
  if (a.routineType === "B" && !a.client?.isRoutineBActive) out.isRoutineBActive = true;
  if (a.sessionNumber === 1 && !a.client?.firstSessionDate) out.firstSessionDate = true;
  return out;
}

/** What a machine's set starts with: last time's load, or the prescription. */
export type Prefill = Pick<ExerciseLog, "weight" | "reps" | "seconds" | "isStaticHold" | "isTSC" | "machineId" | "repQuality">;

/**
 * The weight each machine starts with, unchanged from the Start it replaces:
 * the client's last performed metric, else the settings' current or starting
 * weight; and a trainer's prescribed weight (`currentWeight`) wins over the
 * last metric. Nothing progresses automatically.
 */
export function prefillOf(
  client: Pick<Client, "currentMachineMetrics"> | null | undefined,
  settings: Record<string, ClientMachineSetting>,
): Record<string, Partial<Prefill>> {
  const out: Record<string, Partial<Prefill>> = {};
  const metrics = (client?.currentMachineMetrics ?? {}) as Record<string, any>;
  for (const [mId, metric] of Object.entries(metrics)) {
    if (!metric) continue;
    out[mId] = {
      weight: metric.weight,
      reps: metric.reps,
      seconds: metric.seconds,
      isStaticHold: metric.isStaticHold,
      isTSC: metric.isTSC,
      machineId: mId,
      repQuality: 2,
    };
  }
  for (const [mId, s] of Object.entries(settings)) {
    const setting = s as any;
    if (out[mId] || !setting) continue;
    const w = setting.currentWeight ?? setting.startingWeight;
    if (w !== undefined && w !== null && String(w).trim() !== "") {
      out[mId] = { weight: String(w), machineId: mId, repQuality: 2 };
    }
  }
  for (const [mId, s] of Object.entries(settings)) {
    const prescribed = (s as any)?.currentWeight;
    if (prescribed === undefined || prescribed === null || String(prescribed).trim() === "") continue;
    if (out[mId]) out[mId] = { ...out[mId], weight: String(prescribed) };
  }
  return out;
}

/**
 * A payload Firestore will take: no `undefined` anywhere (Firestore refuses
 * it), a top-level undefined or null becomes null. Only PLAIN objects and
 * arrays are walked; anything else (a server timestamp, a Timestamp, a Date)
 * is passed through untouched, whatever its class is called after a build.
 */
export function cleanPayload(value: unknown): any {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (typeof value !== "object") return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) out[k] = cleanPayload(v);
  }
  return out;
}

export interface SeedArgs {
  sessionId: string;
  machineIds: string[];
  prefill: Record<string, Partial<Prefill>>;
  settings: Record<string, ClientMachineSetting>;
  /** A machine's name on this floor, for the novice estimate. */
  nameOf: (machineId: string) => string | undefined;
  client: Pick<Client, "gender" | "age"> | null | undefined;
  clientId: string;
  clientHomeStudioId: string;
  studioId: string;
  /** The value written as `createdAt` (the server's clock, from the caller). */
  createdAt: unknown;
  /**
   * Whether this iPad already holds a set under that key. A set the iPad
   * holds is never seeded over: the seed only ever fills a blank, so a weight
   * the trainer typed while the seed waited can never be overwritten by it.
   */
  hasLocal: (key: string) => boolean;
  /** The estimate for a machine with nothing on record (consultation-utils). */
  startingWeight: (machineName: string, gender: "Male" | "Female", age: number) => number;
}

export interface Seed {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * The placeholder sets a session starts with: one per machine (two for a
 * per-side machine), carrying the weight it starts at and never a count.
 */
export function seedLogs(a: SeedArgs): Seed[] {
  const out: Seed[] = [];
  const payloadOf = (prev: Partial<Prefill> | undefined, mId: string, side?: "Left" | "Right", defaultWeight?: number | null) => {
    const payload: Record<string, unknown> = {
      sessionId: a.sessionId,
      clientId: a.clientId,
      homeStudioId: a.clientHomeStudioId,
      clientHomeStudioId: a.clientHomeStudioId,
      studioId: a.studioId || a.clientHomeStudioId,
      machineId: mId,
      machineSettings: a.settings[mId]?.settings || (prev as any)?.machineSettings || {},
      createdAt: a.createdAt,
    };
    if (side) payload.side = side;
    if (prev) {
      if (prev.weight) payload.weight = String(prev.weight);
      // Never reps, seconds or a quality: today's count is the trainer's.
      if (prev.isStaticHold !== undefined) payload.isStaticHold = Boolean(prev.isStaticHold);
      if (prev.isTSC !== undefined) payload.isTSC = Boolean(prev.isTSC);
    } else if (defaultWeight) {
      payload.weight = String(defaultWeight);
    }
    return cleanPayload(payload) as Record<string, unknown>;
  };
  const push = (mId: string, side: "Left" | "Right" | undefined, prev: Partial<Prefill> | undefined, defaultWeight: number | null) => {
    const id = logDocId(a.sessionId, mId, side);
    if (a.hasLocal(id)) return;
    if (!prev && !defaultWeight) return;
    out.push({ id, payload: payloadOf(prev, mId, side, defaultWeight) });
  };
  for (const mId of a.machineIds) {
    const name = a.nameOf(mId);
    let defaultWeight: number | null = null;
    if (!a.prefill[mId] && a.client && name) {
      const gender = a.client.gender === "Female" ? "Female" : "Male";
      const w = a.startingWeight(name, gender, a.client.age || 45);
      defaultWeight = w > 0 ? w : null;
    }
    if (isPerSideMachine({ id: mId, name })) {
      push(mId, "Left", a.prefill[`${mId}_Left`] || a.prefill[mId], defaultWeight);
      push(mId, "Right", a.prefill[`${mId}_Right`] || a.prefill[mId], defaultWeight);
    } else {
      push(mId, undefined, a.prefill[mId], defaultWeight);
    }
  }
  return out;
}

/**
 * Discard: every set document the session may have, in one list for one
 * batch. The sets this iPad holds for it, and the ids its machines' sets are
 * written under (a seed still on its way has no local copy yet). Deleting a
 * set that was never written does nothing, so the list may overreach.
 */
export function discardLogIds(
  sessionId: string,
  logs: Record<string, Pick<ExerciseLog, "id" | "sessionId">>,
  machineIds: string[],
): string[] {
  const ids = new Set<string>();
  for (const [key, log] of Object.entries(logs)) {
    if (log?.sessionId !== sessionId) continue;
    const id = log.id && !String(log.id).startsWith("temp_") ? String(log.id) : key;
    ids.add(id);
  }
  for (const mId of machineIds) {
    if (isPerSideMachine({ id: mId })) {
      ids.add(logDocId(sessionId, mId, "Left"));
      ids.add(logDocId(sessionId, mId, "Right"));
    } else {
      ids.add(logDocId(sessionId, mId));
    }
  }
  return [...ids];
}
