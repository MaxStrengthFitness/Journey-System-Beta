/**
 * Routine A's plan in the Active Session (the design round, Oct 8 2026,
 * §4.6): what the floor reads off it and the one way the session writes it.
 *
 * AJ, Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
 * change the plan. But the thing is, it's nice to be able to communicate
 * like, hey, I'm changing this plan because of this reason. So anyone can go
 * ahead and change a plan. Again, you shouldn't really be blocked. Like if I
 * start a session with a client and I already think that, oh, hey, I think
 * they would be a lot better on this machine instead. You should be able to
 * change that and make the call as a trainer because you're training them
 * that day."
 *
 * So the session may change the PLAN (a swap, a can't-do, a re-plan, the
 * Academy column), and nothing else about a routine: every write goes
 * through `store.ts`'s `savePlanChange` (the plan, its change, and Routine
 * A's machines when the change moves them, in one batch), issued and never
 * awaited, a refusal said in a toast. The tracker's routines are a live
 * listener, so the change is drawn the moment the iPad holds it. Today's
 * order is the session's own (`applySessionMachineIds`, the caller's), and
 * the Wrap-up decides what Routine A keeps.
 *
 * The Academy column picked with no plan to keep it on is kept for this
 * session only, and the Now Bar says "for today".
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { db } from "../../../firebase";
import { createJournalEntry, type JournalAuthor } from "../../../hooks/useClientJournal";
import type { Machine, Routine } from "../../../types";
import { DEFAULT_IMPORTANCE, storedNoteOf } from "../../client-notes/note-catalog";
import type { SessionLinkFields } from "../../client-notes/session-link";
import { bFollowOf, plannedBFollowOf } from "../b-routine";
import { signedChange, type PlanWrite, type Who } from "../lineup";
import { applyPlanChange, isStartingColumnChoice, type PlanProgress } from "../plan";
import { sessionPlanProgress, usablePlan } from "../session-plan";
import type { FloorMachine } from "../starting-plan";
import type { StartingColumn } from "../starting-weights";
import { savePlanChange } from "../store";
import type { RoutinePlan } from "../types";
import { floorMachinesOf, savedRoutineA, type HealthNoteCall } from "./host";

export interface SessionPlanInput {
  /** The client's routines, from the tracker's live listener. */
  routines: readonly Routine[];
  /** The session the floor is running; the Academy column picked without a plan lives as long as it does. */
  sessionId: string | null;
  /** The routine the session runs, or null for one started with nothing chosen. */
  sessionRoutineId: string | null | undefined;
  /** Today's machines, in today's order. */
  today: readonly string[];
  /** This studio's floor (the tracker's `floorMachines`). */
  floor: readonly Machine[];
  /** The studio's day, `YYYY-MM-DD`. */
  todayYmd: string;
  /** The signed-in person, by Auth uid (the rules pin it); null writes nothing. */
  who: Who | null;
  onError: (message: string) => void;
  /** Where a Health note a can't-do asked for is filed, and who signs it; null when nobody is signed in. */
  note: { clientId: string; studioId: string; author: JournalAuthor; link: SessionLinkFields } | null;
}

export interface SessionPlan {
  /** Routine A, saved, with a usable plan; null without one. */
  routineA: (Routine & { id: string; plan: RoutinePlan }) | null;
  plan: RoutinePlan | null;
  floorList: FloorMachine[];
  /**
   * The session runs Routine A (or no routine at all): today's order is the
   * plan's to add to and to swap in. A B session's order is B's.
   */
  runsA: boolean;
  /**
   * "The plan · 3 of 6": against today's session while it runs Routine A;
   * in a B session, against Routine A's own machines, so B's machines are
   * never counted as Routine A's.
   */
  progress: PlanProgress | null;
  /**
   * The plan's next machine for today, offered on the last machine and on an
   * empty Now Bar: only while the session runs Routine A, or no routine at
   * all (a B session's order is B's).
   */
  next: string | null;
  /** The Academy column: picked in this session, else Routine A's plan's; undefined when nobody has picked. */
  column: StartingColumn | "none" | undefined;
  /** The column is kept for this session only (no plan to keep it on). */
  columnForToday: boolean;
  pickColumn: (column: StartingColumn | "none") => void;
  /** A plan change, issued through `savePlanChange` and never awaited. */
  write: (write: PlanWrite) => void;
  /** The Health note a surgery or an injury offers, through the notes' one writer, never awaited. */
  healthNote: (call: HealthNoteCall) => void;
}

const REFUSED = "Couldn't save that change to the plan. Check the connection and try again.";

export function useSessionPlan(input: SessionPlanInput): SessionPlan {
  const ref = useRef(input);
  ref.current = input;

  const floorList = useMemo(() => floorMachinesOf(input.floor), [input.floor]);
  const routineA = useMemo(() => {
    const a = savedRoutineA(input.routines);
    return a && usablePlan(a.plan) ? (a as Routine & { id: string; plan: RoutinePlan }) : null;
  }, [input.routines]);
  const plan = routineA?.plan ?? null;

  const runsA = !input.sessionRoutineId || input.sessionRoutineId === routineA?.id;
  const base = runsA ? input.today : routineA?.machineIds;
  const progress = useMemo(
    () => (plan ? sessionPlanProgress({ plan, today: base ?? [], floor: floorList, todayYmd: input.todayYmd }) : null),
    [plan, base, floorList, input.todayYmd],
  );
  const next = runsA ? (progress?.next ?? null) : null;

  /* The column picked in THIS session: it wins over the plan's while the
     plan's echo is on its way, and is all there is without a plan. */
  const [picked, setPicked] = useState<{ sessionId: string | null; column: StartingColumn | "none" } | null>(null);
  const pickedNow = picked && picked.sessionId === input.sessionId ? picked.column : undefined;
  const onPlan = plan && isStartingColumnChoice(plan.startingColumn) ? plan.startingColumn : undefined;
  const column = pickedNow ?? onPlan;

  const refused = useCallback((err?: unknown) => {
    if (err) console.error("Routine plan write refused (session):", err);
    ref.current.onError(REFUSED);
  }, []);

  const write = useCallback(
    (w: PlanWrite) => {
      const a = savedRoutineA(ref.current.routines);
      if (!a?.id) return;
      // A change that moves Routine A's machines (a swap in the plan, a
      // can't-do, a re-plan) takes Routine B with it when B follows A, in
      // the same batch (b-routine.ts `bFollowOf`).
      // A B planned with the starting lineup follows A's road with its plan alone (`plannedBFollowOf`).
      const follow =
        (w.machineIds ? bFollowOf(ref.current.routines, a.id, w.machineIds) : null) ??
        plannedBFollowOf(ref.current.routines, a.id, w.plan);
      let commit: Promise<void>;
      try {
        commit = savePlanChange(db, a.id, follow ? { ...w, follow } : w);
      } catch (err) {
        refused(err);
        return;
      }
      commit.catch(refused);
    },
    [refused],
  );

  const pickColumn = useCallback(
    (c: StartingColumn | "none") => {
      const { sessionId, who, routines } = ref.current;
      setPicked({ sessionId, column: c });
      const a = savedRoutineA(routines);
      if (!a?.id || !usablePlan(a.plan) || !who) return;
      const change = { kind: "column" as const, machineIds: [], value: c };
      write({ plan: applyPlanChange(a.plan, change), change: signedChange(change, who) });
    },
    [write],
  );

  const healthNote = useCallback((call: HealthNoteCall) => {
    const { note, onError } = ref.current;
    if (!note) return;
    const stored = storedNoteOf("health", call.flavour, null);
    createJournalEntry(note.clientId, note.studioId, note.author, {
      kind: stored.kind,
      category: stored.category,
      body: call.body,
      importance: DEFAULT_IMPORTANCE.health,
      machineId: call.machineId,
      focusId: null,
      ...note.link,
      origin: "in_session",
    }).catch(() => onError("Couldn't save the Health note. Add it from Notes, and check the connection."));
  }, []);

  return {
    routineA,
    plan,
    floorList,
    runsA,
    progress,
    next,
    column,
    columnForToday: !plan,
    pickColumn,
    write,
    healthNote,
  };
}
