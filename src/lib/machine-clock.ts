/**
 * TIME ON MACHINE (tracker round, Sep 2026).
 *
 * What the old estimate did: stamp a start time the first time a machine
 * was focused or touched, and when its set was logged, charge it with
 * everything since — walking over, the talk, the set-up, a detour to fix
 * an earlier set, and (for a machine that was never focused) everything
 * since the previous machine finished. Reordering could move those minutes
 * between machines. The audit's verdict: "feels inherently unreliable".
 *
 * What this does: one stopwatch per machine that runs ONLY while that
 * machine is the current one in the Now bar. Leave it, it pauses; come
 * back, it resumes. Pause the session, every clock pauses. Reorder all you
 * like — the clocks follow the machine, not its slot. A machine that was
 * never the current one has no time, not "since the last one".
 *
 * That is why it is called time ON machine and not time UNDER tension: the
 * trainer's stopwatch seconds (the SEC field) are the only real TUT, and
 * they still win when present. This number is the honest context the
 * leaders' Not-reached clues read, nothing more.
 *
 * Pure: the tracker holds a `MachineClocks` in a ref and calls these.
 */

export interface MachineClock {
  /** Milliseconds accumulated while this machine was current and the session not paused. */
  accumulatedMs: number;
  /** When the current run began, or null while not running. */
  runningSince: number | null;
}

export interface MachineClocks {
  clocks: Record<string, MachineClock>;
  /** The machine whose clock is (or would be) running. */
  currentId: string | null;
  /** True while the session is paused: no clock runs. */
  paused: boolean;
}

export function createMachineClocks(): MachineClocks {
  return { clocks: {}, currentId: null, paused: false };
}

function clockOf(state: MachineClocks, id: string): MachineClock {
  return (state.clocks[id] ??= { accumulatedMs: 0, runningSince: null });
}

function stop(clock: MachineClock, now: number): void {
  if (clock.runningSince !== null) {
    clock.accumulatedMs += Math.max(0, now - clock.runningSince);
    clock.runningSince = null;
  }
}

function start(clock: MachineClock, now: number): void {
  if (clock.runningSince === null) clock.runningSince = now;
}

/** The Now bar moved to `id` (or to nothing). Stops the previous clock, starts this one. */
export function focusMachine(state: MachineClocks, id: string | null, now = Date.now()): void {
  if (state.currentId === id) return;
  if (state.currentId) stop(clockOf(state, state.currentId), now);
  state.currentId = id;
  if (id && !state.paused) start(clockOf(state, id), now);
}

/** Session pause / resume: freezes or resumes the current clock only. */
export function setPaused(state: MachineClocks, paused: boolean, now = Date.now()): void {
  if (state.paused === paused) return;
  state.paused = paused;
  if (!state.currentId) return;
  const clock = clockOf(state, state.currentId);
  if (paused) stop(clock, now);
  else start(clock, now);
}

/** Whole seconds this machine has been the current one, pauses excluded. 0 if never. */
export function secondsOn(state: MachineClocks, id: string, now = Date.now()): number {
  const clock = state.clocks[id];
  if (!clock) return 0;
  const running = clock.runningSince !== null ? Math.max(0, now - clock.runningSince) : 0;
  return Math.floor((clock.accumulatedMs + running) / 1000);
}

/** After a machine's time is written, its clock restarts from zero if it is revisited. */
export function resetMachine(state: MachineClocks, id: string, now = Date.now()): void {
  const clock = state.clocks[id];
  if (!clock) return;
  const wasRunning = clock.runningSince !== null;
  clock.accumulatedMs = 0;
  clock.runningSince = wasRunning ? now : null;
}

/** The fields written onto a log when its set is complete. */
export interface MachineTimeFields {
  /** Whole seconds the trainer spent on this machine (time on machine). */
  timeSpent: string;
  /** Seconds under load: the trainer's stopwatch if they used it, else time on machine. */
  totalTimeUnderLoad: number;
  machineDurationSeconds: number;
  machineEndedAt: number;
  averageTimePerRep?: number;
}

export function machineTimeFields(params: {
  onMachineSeconds: number;
  manualSeconds: number;
  reps: number;
  isStatic: boolean;
  now?: number;
}): MachineTimeFields {
  const { onMachineSeconds, manualSeconds, reps, isStatic, now = Date.now() } = params;
  const under = manualSeconds > 0 ? manualSeconds : onMachineSeconds;
  const fields: MachineTimeFields = {
    timeSpent: String(onMachineSeconds),
    totalTimeUnderLoad: under,
    machineDurationSeconds: under,
    machineEndedAt: now,
  };
  if (!isStatic && reps > 0 && under > 0) fields.averageTimePerRep = parseFloat((under / reps).toFixed(1));
  return fields;
}
