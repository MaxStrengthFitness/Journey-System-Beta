/**
 * Watching a session another trainer is running (session record, Sep 26
 * 2026): what the watching iPad says, and what it draws. Whose session it is
 * is decided in lib/live-session.ts (`isAnotherTrainersSession`); this file
 * only speaks and reads.
 *
 * Nothing on a watching iPad writes. It sees each set as the trainer's iPad
 * saves it, through the listeners the Active Session already runs, so a
 * leader following along costs one read per saved set.
 */
import type { LiveSet } from "../journey-grid";

export interface WatchWords {
  /** The sentence under the session bar. */
  line: string;
  /** Added while this iPad is offline: what is on screen may be behind. */
  offline: string | null;
}

/**
 * "JC is running this session on another iPad…", or, on the iPad the session
 * was taken from, "AJ took over this session…". `runner` is the initials the
 * session carries; with none, "Another trainer".
 */
export function watchWords({
  runner,
  takenFromHere,
  online,
}: {
  runner: string | null | undefined;
  takenFromHere: boolean;
  online: boolean;
}): WatchWords {
  const who = (runner || "").trim() || "Another trainer";
  const line = takenFromHere
    ? `${who} took over this session on another iPad. You're watching it now: it updates as each set is saved.`
    : `${who} is running this session on another iPad. You're watching: it updates as each set is saved, and nothing here changes it.`;
  return {
    line,
    offline: online ? null : "Offline: what you see may be behind what has been saved.",
  };
}

export interface TakeOverWords {
  title: string;
  question: string;
  leaveLabel: string;
  stayLabel: string;
}

/** The question before a take-over. The safe answer, "Keep watching", is the default. */
export function takeOverWords({
  runner,
  clientFirstName,
}: {
  runner: string | null | undefined;
  clientFirstName: string | null | undefined;
}): TakeOverWords {
  const who = (runner || "").trim() || "Another trainer";
  const whose = (clientFirstName || "").trim() ? `${clientFirstName!.trim()}'s session` : "this session";
  const theirs = (runner || "").trim() ? `${who}'s iPad` : "Their iPad";
  return {
    title: "Take over this session?",
    question:
      `${who} is running ${whose} on another iPad. If you take it over, you record the rest and finish it, ` +
      `and the session is yours. ${theirs} switches to watching. The session still shows who started it.`,
    leaveLabel: "Take over",
    stayLabel: "Keep watching",
  };
}

/**
 * The machines the watched session is running, in its order. The session's
 * own list first, which the trainer's iPad rewrites whenever a machine is
 * added or moved, so the watching iPad follows along; then its routine; a
 * Free session runs the floor. The same order the Active Session reads.
 */
export function sessionMachineList(
  session: { sessionMachineIds?: string[] | null; routineId?: string | null },
  routines: readonly { id?: string; machineIds?: string[] }[],
  floorIds: readonly string[],
): string[] {
  const recorded = session.sessionMachineIds;
  if (recorded && recorded.length > 0) return recorded;
  const routine = session.routineId ? routines.find((r) => r.id === session.routineId) : undefined;
  if (routine) return routine.machineIds ?? [];
  return session.routineId ? [] : [...floorIds];
}

/** Settled for the day: practice or skipped. */
const settled = (v: LiveSet | undefined) => v?.outcome === "practice" || v?.outcome === "skipped";

/**
 * Where the trainer probably is: the first machine not finished (a count and
 * a quality, or practice or skipped), else the first. The Active Session
 * seeds its own focus by the same rule when a session opens.
 */
export function firstOpenMachine(ids: readonly string[], values: Record<string, LiveSet>): string | null {
  for (const id of ids) {
    const v = values[id];
    const done = settled(v) || (!!v && !!(v.isTSC ? v.seconds : v.reps) && !!v.quality);
    if (!done) return id;
  }
  return ids[0] ?? null;
}

/** Machines logged so far, counted as the session bar counts them. */
export function machinesDone(ids: readonly string[], values: Record<string, LiveSet>): number {
  return ids.filter((id) => {
    const v = values[id];
    if (settled(v)) return true;
    return !!v && (v.isTSC ? v.seconds != null : v.reps != null);
  }).length;
}

/**
 * Who started a session and who has it now, as initials. They differ only
 * after a take-over: Start writes `startedByTrainerId`, and a take-over (and
 * Finish) move `trainerId` and its initials to whoever records the rest. The
 * starter is named only when the roster can name them; never guessed.
 */
export function whoStartedIt(
  session: { trainerId?: string | null; trainerInitials?: string | null; startedByTrainerId?: string | null },
  trainers: readonly { id?: string; initials?: string | null }[],
): { starter: string | null; runner: string | null; changedHands: boolean } {
  const runner = (session.trainerInitials || "").trim() || null;
  const starterId = (session.startedByTrainerId || "").trim();
  if (!starterId || starterId === (session.trainerId || "").trim()) {
    return { starter: runner, runner, changedHands: false };
  }
  const found = trainers.find((t) => t.id === starterId);
  return { starter: (found?.initials || "").trim() || null, runner, changedHands: true };
}
