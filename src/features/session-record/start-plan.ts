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
 * START NEVER SAVES TODAY'S LIST AS A ROUTINE (the first-session design
 * round, Oct 8 2026, §4.8). Start used to save a list the briefing built
 * under a "Today only" label as the client's Routine A or B. Now a client
 * with no routine starts with no routine and today's machines exactly as
 * chosen, none when none were (never the whole floor): the session's list is
 * the session's. The one routine Start makes is Routine A from a starting
 * plan, for a client starting out at the studio, written by the plan's own
 * writer in the Start batch: EMPTY, with the plan carrying day one, because
 * the consult is not Routine A (AJ, Oct 8 2026: "this also counts with the
 * consult visit, sometimes the consult machines will not be the same as
 * their a routine").
 *
 * Everything here is pure. The tracker issues the writes.
 */
import type { Client, ClientMachineSetting, ExerciseLog, Routine } from "../../types";
import { logDocId } from "../../lib/exercise-log-id";
import { isPerSideMachine } from "../../lib/floor-machines";
import { findRoutineByLetter } from "../../lib/routine-utils";
import { todayFor } from "../routine-plan/plan";
import { runnableToday } from "../routine-plan/cant-do";
import type { StartPlanAtStart } from "../routine-plan/briefing-plan";

export type StartRoutineType = "A" | "B" | "Free";

/** Which routine a session starts on. */
export type StartRoutine =
  /** A Free session: no routine. */
  | { kind: "free" }
  /**
   * The client's own routine of that letter. `aPlan` and `todayYmd` (when
   * Start knows the day) leave out of today what the client can't do
   * (`runnableToday`: Routine A's plan's marks, read by A and B).
   */
  | { kind: "existing"; routine: Routine; aPlan?: Routine["plan"] | null; todayYmd?: string }
  /**
   * The client has no Routine A (the routines are known) and the briefing
   * handed up a starting plan: Routine A is made EMPTY in the start batch
   * with the plan on it, or the plan goes on the empty, plan-less Routine A
   * the client has (`routineId`), never a second one.
   */
  | { kind: "plan"; name: "Routine A"; routineId: string | null; startPlan: StartPlanAtStart }
  /** The client has no routine of that letter (the routines are known): none is made, and the session runs today's list as chosen. */
  | { kind: "none"; name: string }
  /** The routines aren't known yet: decided the moment they are, never guessed. */
  | { kind: "unknown"; name: string; startPlan?: StartPlanAtStart };

export function resolveStartRoutine(a: {
  routineType: StartRoutineType;
  customMachines?: string[] | null;
  routines: Routine[];
  routinesKnown: boolean;
  /** A client starting out: the plan the briefing hands up, kept by Start (Routine A only). */
  startPlan?: StartPlanAtStart | null;
  /** The studio's day: with it, today leaves out what the client can't do. */
  todayYmd?: string;
}): StartRoutine {
  if (a.routineType === "Free") return { kind: "free" };
  const name = `Routine ${a.routineType}`;
  const startPlan = a.routineType === "A" && a.startPlan ? a.startPlan : null;
  // An unknown list may still hold the last client's routines: never read it.
  if (!a.routinesKnown) return startPlan ? { kind: "unknown", name, startPlan } : { kind: "unknown", name };
  // Either spelling ("Routine A", or an older seeder's "A"), as the briefing
  // finds the routine it shows: a routine on screen is the one Start runs.
  const found = findRoutineByLetter(a.routines, a.routineType);
  if (startPlan) {
    // An empty Routine A with no plan (made before plans existed) takes the
    // plan, as Keep this lineup puts it there; one with machines or a plan
    // already is the client's, and the session runs it.
    if (!found) return { kind: "plan", name: "Routine A", routineId: null, startPlan };
    if (found.id && !found.plan && (found.machineIds?.length ?? 0) === 0) {
      return { kind: "plan", name: "Routine A", routineId: found.id, startPlan };
    }
  }
  if (found) {
    const aPlan = findRoutineByLetter(a.routines, "A")?.plan ?? null;
    return { kind: "existing", routine: found, ...(a.todayYmd ? { aPlan, todayYmd: a.todayYmd } : null) };
  }
  return { kind: "none", name };
}

/**
 * The machines the session intends to run, in order. A list the briefing
 * adjusted wins, exactly as it was handed up, an empty one included (the
 * briefing said "0 machines" and Start runs that); otherwise what the routine
 * runs today (`todayFor`: its machines, else its plan's day one while it is
 * empty), less any machine the client can't do (`runnableToday`). With no
 * routine, the list as chosen, none when none was: never the whole floor.
 */
export function plannedMachinesOf(routine: StartRoutine, customMachines?: string[] | null): string[] {
  const custom = customMachines ? [...customMachines] : null;
  switch (routine.kind) {
    case "existing": {
      if (custom) return custom;
      const today = todayFor({ routine: routine.routine.machineIds ?? [], plan: routine.routine.plan });
      // Never a machine the client can't do (a Routine B's own swap, or a B from before Round 2).
      return routine.todayYmd ? runnableToday(today, routine.aPlan, routine.todayYmd) : today;
    }
    case "plan":
      return [...routine.startPlan.machineIds];
    case "unknown":
      return custom ?? (routine.startPlan ? [...routine.startPlan.machineIds] : []);
    case "free":
    case "none":
      return custom ?? [];
  }
}

/**
 * Today's list once a session started before the client's routines were
 * known learns its routine (the tracker's follow-up, R9). The trainer can
 * add machines from the first moment (the empty Now Bar's Add a machine,
 * the last machine's Add another), so neither list simply wins (the
 * whole-branch review, Oct 9 2026: the list used to be either the trainer's,
 * dropping the routine's machines, or, while the routines loaded, nothing
 * could be added at all):
 * - the trainer changed nothing: what the routine runs today (`planned`);
 * - the routine adds nothing to what Start began with: the trainer's list;
 * - otherwise the routine's machines first, in its order, less any the
 *   trainer took out of what Start began with, then every other machine of
 *   the trainer's, in the trainer's order.
 * Each machine once.
 */
export function followUpList(a: {
  /** What Start began with (`plannedMachinesOf` while the routine was unknown). */
  started: readonly string[];
  /** Today's list on screen now. */
  current: readonly string[];
  /** What the routine runs today, now that it is known. */
  planned: readonly string[];
}): string[] {
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((id, i) => id === y[i]);
  const once = (ids: readonly string[]) => ids.filter((id, i) => ids.indexOf(id) === i);
  if (same(a.current, a.started)) return once(a.planned);
  if (same(a.planned, a.started)) return once(a.current);
  const takenOut = a.started.filter((id) => !a.current.includes(id));
  const out = once(a.planned).filter((id) => !takenOut.includes(id));
  for (const id of a.current) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The client fields Start changes, as flags (the tracker writes the values).
 * Written apart from the session: see the header.
 *
 * Routine B is marked on only when the session runs the client's own
 * Routine B (`runsSavedRoutine`): a B session with no Routine B is today's
 * list and makes no routine (§4.8), so it never switches on an alternation
 * into a B that isn't there.
 */
export function startClientPatch(a: {
  routineType: StartRoutineType;
  client: Pick<Client, "isRoutineBActive" | "firstSessionDate"> | null | undefined;
  sessionNumber: number;
  /** The session runs a routine the client has (`resolveStartRoutine` said "existing"). */
  runsSavedRoutine: boolean;
}): { isRoutineBActive?: true; firstSessionDate?: true } {
  const out: { isRoutineBActive?: true; firstSessionDate?: true } = {};
  if (a.routineType === "B" && a.runsSavedRoutine && !a.client?.isRoutineBActive) out.isRoutineBActive = true;
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
  /** A machine's name on this floor, to know a per-side machine. */
  nameOf: (machineId: string) => string | undefined;
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
}

export interface Seed {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * The placeholder sets a session starts with: one per machine (two for a
 * per-side machine), carrying the weight it starts at and never a count.
 *
 * Only a machine with something on record (`prefillOf`: the last performed
 * set, the settings' prescription or starting weight) is seeded. A machine
 * with nothing gets no set and no weight: the trainer types the first. The
 * starting-weight estimate that used to fill it went with the old first-time
 * setup (the first-session design round, Oct 8 2026, §4.8): it defaulted a
 * client with no gender on file to "Male" and an unknown age to 45, an
 * invented profile written as a load. The Academy's starting range is shown
 * beside the weight as a reference instead, never typed into it
 * (routine-plan/starting-weights.ts).
 */
export function seedLogs(a: SeedArgs): Seed[] {
  const out: Seed[] = [];
  const payloadOf = (prev: Partial<Prefill>, mId: string, side?: "Left" | "Right") => {
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
    if (prev.weight) payload.weight = String(prev.weight);
    // Never reps, seconds or a quality: today's count is the trainer's.
    if (prev.isStaticHold !== undefined) payload.isStaticHold = Boolean(prev.isStaticHold);
    if (prev.isTSC !== undefined) payload.isTSC = Boolean(prev.isTSC);
    return cleanPayload(payload) as Record<string, unknown>;
  };
  const push = (mId: string, side: "Left" | "Right" | undefined, prev: Partial<Prefill> | undefined) => {
    const id = logDocId(a.sessionId, mId, side);
    if (a.hasLocal(id)) return;
    if (!prev) return;
    out.push({ id, payload: payloadOf(prev, mId, side) });
  };
  for (const mId of a.machineIds) {
    const name = a.nameOf(mId);
    if (isPerSideMachine({ id: mId, name })) {
      push(mId, "Left", a.prefill[`${mId}_Left`] || a.prefill[mId]);
      push(mId, "Right", a.prefill[`${mId}_Right`] || a.prefill[mId]);
    } else {
      push(mId, undefined, a.prefill[mId]);
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

/** The fields a trainer fills in on a set (never a prefill's weight): any of them, and the set is theirs. */
function touchedByTrainer(log: Partial<ExerciseLog> | undefined): boolean {
  if (!log) return false;
  const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
  const l = log as Record<string, unknown>;
  return [
    "reps", "repsLeft", "repsRight", "seconds", "timeSpent", "outcomeReps", "outcomeTut",
    "repQuality", "outcome", "skipReason", "skipNote", "notes",
  ].some((f) => filled(l[f]));
}

/**
 * A start the database refused LATE (on reconnect, after a whole offline
 * session): which of its sets to take back (the speed round's final review,
 * Oct 6 2026). Only the untouched prefills. A set the trainer typed into, or
 * one this iPad wrote or is about to write (`written`), stays: it is the only
 * record of what the client lifted, and an administrator can still recover it.
 */
export function refusedStartSweep(
  sessionId: string,
  logs: Record<string, Partial<ExerciseLog> & Pick<ExerciseLog, "sessionId">>,
  machineIds: string[],
  written: (id: string) => boolean,
): { remove: string[]; kept: string[] } {
  const touched = new Set<string>();
  for (const [key, log] of Object.entries(logs)) {
    if (log?.sessionId !== sessionId) continue;
    const id = log.id && !String(log.id).startsWith("temp_") ? String(log.id) : key;
    if (touchedByTrainer(log)) touched.add(id);
  }
  const remove: string[] = [];
  const kept: string[] = [];
  for (const id of discardLogIds(sessionId, logs as Record<string, Pick<ExerciseLog, "id" | "sessionId">>, machineIds)) {
    if (touched.has(id) || written(id)) kept.push(id);
    else remove.push(id);
  }
  return { remove, kept };
}
