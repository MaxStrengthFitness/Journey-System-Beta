/**
 * The routines view model, computed ONCE.
 *
 * Extracted from RoutinesTab in the four-tab round. Programming — the tab
 * that now holds both prescriptions and the machine roster — needs the same
 * numbers twice over: once for the sentence above the sub-toggle ("21
 * prescribed · 3 not set up"), and once for whichever routine panel is
 * showing. Computing them in two components meant walking every log twice on
 * every render of a screen a trainer opens forty times a day.
 *
 * So the shell calls this, and hands the result down. RoutinesTab still calls
 * it itself when no model is passed, which is what keeps it a component you
 * can mount on its own.
 */
import { useMemo } from "react";
import type {
  Client,
  ClientMachineSetting,
  ExerciseLog,
  Machine,
  Routine,
  RoutineAdjustment,
  Trainer,
  WorkoutSession,
} from "../../types";
import {
  buildRoutineChanges,
  buildRoutineRows,
  changesThisMonth,
  latestChangeFor,
  resolveRoutine,
  type RoutineChange,
  type RoutineName,
  type RoutineRow,
} from "./routine-rows";
import type { HistoryCoverage } from "../../lib/prior-history";

export interface RoutinesModelInput {
  client: Client | null | undefined;
  clientId: string;
  routines: Routine[];
  machines: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  allLogs: ExerciseLog[];
  sessions: WorkoutSession[];
  adjustments: RoutineAdjustment[];
  trainers: Trainer[];
  selectedRoutineTodayId: string | null;
  isBActive: boolean;
  /** How much of this client's story Journey holds. See lib/prior-history.ts. */
  coverage?: HistoryCoverage;
}

export interface RoutinesModel {
  a: Routine;
  b: Routine;
  rowsA: RoutineRow[];
  rowsB: RoutineRow[];
  changes: RoutineChange[];
  latestA: RoutineChange | null;
  latestB: RoutineChange | null;
  monthCount: number;
  newest: RoutineChange | null;
  /** Which prescription the client is training today, if one was chosen. */
  todayName: RoutineName | null;
  /** Machines with a recorded load, over machines prescribed. B counts only when B is on. */
  setUp: number;
  total: number;
}

export function useRoutinesModel(input: RoutinesModelInput): RoutinesModel {
  const {
    client,
    clientId,
    routines,
    machines,
    clientSettings,
    allLogs,
    sessions,
    adjustments,
    trainers,
    selectedRoutineTodayId,
    isBActive,
    coverage = "unknown",
  } = input;

  const studioId = client?.homeStudioId || "";
  const a = useMemo(
    () => resolveRoutine(routines, "Routine A", clientId, studioId),
    [routines, clientId, studioId],
  );
  const b = useMemo(
    () => resolveRoutine(routines, "Routine B", clientId, studioId),
    [routines, clientId, studioId],
  );
  const rowsA = useMemo(
    () => buildRoutineRows(a, machines, client, clientSettings, allLogs, sessions, coverage),
    [a, machines, client, clientSettings, allLogs, sessions, coverage],
  );
  const rowsB = useMemo(
    () => buildRoutineRows(b, machines, client, clientSettings, allLogs, sessions, coverage),
    [b, machines, client, clientSettings, allLogs, sessions, coverage],
  );
  const changes = useMemo(
    () => buildRoutineChanges(adjustments, routines, machines, trainers),
    [adjustments, routines, machines, trainers],
  );
  const latestA = useMemo(() => latestChangeFor(changes, a.id || ""), [changes, a.id]);
  const latestB = useMemo(() => latestChangeFor(changes, b.id || ""), [changes, b.id]);
  const monthCount = useMemo(() => changesThisMonth(changes), [changes]);

  const todayName: RoutineName | null =
    selectedRoutineTodayId === a.id
      ? "Routine A"
      : selectedRoutineTodayId === b.id
        ? "Routine B"
        : null;

  const setUp =
    rowsA.filter((r) => r.weight !== null).length +
    (isBActive ? rowsB.filter((r) => r.weight !== null).length : 0);
  const total = rowsA.length + (isBActive ? rowsB.length : 0);

  return {
    a,
    b,
    rowsA,
    rowsB,
    changes,
    latestA,
    latestB,
    monthCount,
    newest: changes[0] ?? null,
    todayName,
    setUp,
    total,
  };
}
