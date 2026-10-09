/**
 * The briefing's plan card, worked out for the briefing (the design round,
 * Oct 8 2026, §4.5). The briefing holds this hook for every client, so Start
 * can read what it hands up; it reads only for a client starting out with
 * no plan yet ("starting"), one read of head office's starting routines and
 * one of the studio's choice (`useStartingRoutines`), and nothing for anyone
 * else. Nothing here writes, and nothing here holds Start.
 *
 * - "starting": the starting routine that fits (`suggestFromStartingRoutines`,
 *   the same rule as Start a plan on Programming: the intake's words, the
 *   studio's default, head office's, else the trainer picks), its plan on
 *   this floor (`startingPlanFromRoutine`), today being its day one, and
 *   what Start hands up (`startPlan`). While the starting routines are read
 *   nothing is suggested, and Start opens an empty session with no plan; a
 *   read that failed claims no default and no match, the trainer picks.
 * - "kept": Routine A's plan, today being its day one (`todayFor`, while
 *   Routine A is still empty). Start hands up no plan: it is kept already.
 *
 * Change today moves today (`setToday`). On a kept plan it never touches the
 * plan's day one: what a visit ran is its session's record. On a starting
 * plan, which is still a draft until Start, the plan Start keeps takes
 * today as its day one (`planWithTodayAsDayOne`, AJ's "3a": the plan keeps
 * "the first visit's machines"), so a machine taken out at the consult
 * doesn't come back at the next visit.
 *
 * At a studio that starts new clients on A and B together (its setting
 * `newClientsStart`, read by the briefing into `aAndBTogether`; item 8), a
 * starting plan plans Routine B beside it (`usePlannedB`: B's swaps against
 * the plan's road, editable or left for later), and Start hands it up with
 * the plan (`startPlan.b`): the tracker writes Routine B with its plan and
 * no machines in the Start batch, and the Wrap-up that starts Routine A
 * starts B.
 *
 * Once the trainer changes today, the suggestion holds: the intake it was
 * matched on is kept, so the open Health notes landing a moment later (the
 * journal is still being read) never swap the starting routine, and the
 * trainer's changes with it, without a word.
 */
import { useMemo, useState } from "react";
import type { Machine } from "../../../types";
import type { BriefingPlanView, StartPlanAtStart } from "../briefing-plan";
import { planWithTodayAsDayOne, todayChanged } from "../briefing-plan";
import type { Who } from "../lineup";
import { todayFor } from "../plan";
import { startingSourceWords } from "../start-part";
import { notOnFloorLine } from "../starting-choice";
import type { StartingAlternative, StartingSuggestion } from "../starting-plan";
import { startedFromWords, startingPlanFromRoutine, suggestFromStartingRoutines, type StartingRoutine } from "../starting-routines";
import { cantDoDayWords } from "../cant-do";
import type { RoutinePlan } from "../types";
import { useStartingRoutines } from "../useStartingRoutines";
import { floorMachinesOf, type NewClientsStartRead } from "./host";
import { plannedBReadOf, usePlannedB, type PlannedBState } from "./PlannedBPart";

export interface BriefingPlanInput {
  view: BriefingPlanView;
  studioId: string | null;
  studioName: string | null;
  /** This studio's floor, as the briefing has it. */
  floor: readonly Machine[];
  /** The intake's words a starting routine is matched on (`planIntakeText`). */
  intakeText: string | null;
  /** The signed-in person by Auth uid; null when it isn't known (Start then hands up no plan). */
  who: Who | null;
  /** The studio's day, `YYYY-MM-DD`. */
  todayYmd: string;
  /** Routine A's plan, for "kept". */
  kept: RoutinePlan | null;
  /**
   * The studio starts new clients on A and B together (its setting
   * `newClientsStart`, read by the briefing; item 8): a starting plan plans
   * Routine B beside it, and Start keeps both. Absent or false, A alone.
   * "loading": the card says it is reading the setting, and Start (never
   * held) keeps no B; "failed": B is offered, left for later until the
   * trainer plans it.
   */
  aAndBTogether?: NewClientsStartRead;
  /**
   * A planned B can be written (`plannedBTarget` over the client's
   * routines): false when the client has a Routine B of their own already.
   */
  bPlannable?: boolean;
}

export interface BriefingPlanState {
  /** "starting" is waiting for the starting routines: nothing suggested yet. */
  reading: boolean;
  /** The starting routines' read failed: nothing claimed, the trainer picks. */
  unread: boolean;
  /** The plan the card draws: the kept one, or the starting routine's; null while reading or picking. */
  plan: RoutinePlan | null;
  /** Today's machines, in today's order. */
  today: string[];
  /** The trainer changed today on the card. */
  changed: boolean;
  setToday: (ids: string[]) => void;
  /** "starting" only. */
  suggestion: StartingSuggestion | null;
  /** The Source tag's words: the starting routine and where it came from. */
  sourceWords: string | null;
  /** The tag's (i): why this start, or who kept the plan. */
  why: string | null;
  /** Another start, each with its road on this floor ("starting" only). */
  starts: StartingAlternative[];
  pickedId: string | null;
  pick: (id: string) => void;
  /** The Academy's eleven from Journey's own copy, not the app's. */
  fromCode: boolean;
  /**
   * "Not on Westlake's floor: Leg Curl" ("starting" only): the starting
   * routine's machines this floor lacks, said under the Road, never dropped
   * silently (§4.2), as Start a plan says it. Null when it has them all.
   */
  notOnFloor: string | null;
  /** What Start hands up ("starting" with a plan and a signer only). */
  startPlan: StartPlanAtStart | null;
  /**
   * B planned beside a starting plan, at a studio that starts new clients
   * on A and B together (`PlannedBPart`): on only then, and only for
   * "starting".
   */
  b: PlannedBState;
  /** The trainer changed B's part: the briefing counts it as unsaved, as it counts today changed. */
  bChanged: boolean;
  /** Back to what the card opened with: today, the pick and the held suggestion (the leave gate's discard). */
  reset: () => void;
}

const NO_STARTS: StartingAlternative[] = [];

export function useBriefingPlan(input: BriefingPlanInput): BriefingPlanState {
  const { view, todayYmd, who } = input;
  const startingView = view === "starting";
  const starting = useStartingRoutines(input.studioId, { enabled: startingView });
  const floor = useMemo(() => floorMachinesOf(input.floor), [input.floor]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** Today as the trainer changed it, for the plan it was changed on. */
  const [override, setOverride] = useState<{ key: string; ids: string[] } | null>(null);
  /** The intake the suggestion was matched on when the trainer first changed today: held from then on. */
  const [heldIntake, setHeldIntake] = useState<{ text: string | null } | null>(null);
  const intakeText = heldIntake ? heldIntake.text : input.intakeText;

  const reading = startingView && starting.status === "loading";
  const unread = startingView && starting.status === "failed";

  /* The suggestion, exactly as Start a plan makes it (StartPlanPanel): a
     read that failed claims no default, no studio choice and no match. */
  const suggestion = useMemo<StartingSuggestion | null>(() => {
    if (!startingView || reading) return null;
    const inputs = {
      routines: unread ? starting.routines.map((r) => (r.isDefault ? { ...r, isDefault: false } : r)) : starting.routines,
      choice: unread ? null : starting.choice,
      intakeText: unread ? null : intakeText,
      floor,
      studioName: input.studioName,
      pickedId,
    };
    const s = suggestFromStartingRoutines(inputs);
    return unread && !pickedId
      ? { ...s, why: `Couldn't read ${input.studioName ?? "this studio"}'s starting routines just now. Pick the one that fits.` }
      : s;
  }, [startingView, reading, unread, starting.routines, starting.choice, intakeText, floor, input.studioName, pickedId]);

  const routineOf = (id: string | null): StartingRoutine | null =>
    id ? (starting.routines.find((r) => r.id === id) ?? null) : null;
  const chosen = routineOf(suggestion?.templateId ?? null);

  const derived = useMemo(
    () => (chosen ? startingPlanFromRoutine(chosen, who ?? { uid: "" }, floor, todayYmd) : null),
    [chosen, who?.uid, who?.name, floor, todayYmd], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const plan: RoutinePlan | null = view === "kept" ? input.kept : startingView ? (derived?.plan ?? null) : null;
  const opened = useMemo<string[]>(
    () => (view === "kept" ? todayFor({ routine: [], plan: input.kept }) : (derived?.startWith ?? [])),
    [view, input.kept, derived],
  );
  const key = `${view}|${plan?.templateId ?? ""}|${opened.join(",")}`;
  const today = override && override.key === key ? override.ids : opened;
  const changed = todayChanged(today, opened);

  let sourceWords: string | null = null;
  let why: string | null = null;
  if (startingView && suggestion) {
    sourceWords = suggestion.label
      ? [suggestion.label, startingSourceWords(suggestion.source) ?? (starting.fromCode ? "From the Academy" : null)].filter(Boolean).join(" · ")
      : null;
    why = suggestion.why;
  } else if (view === "kept" && input.kept) {
    // The Lineup's own words for where a kept plan started (PlanLineup), by name.
    sourceWords = startedFromWords(input.kept);
    // Who and when, never where: a plan is kept on Programming or by Start
    // on the briefing, and the plan doesn't record which.
    const by = input.kept.madeByName?.trim();
    const day = input.kept.madeAt ? cantDoDayWords(input.kept.madeAt, todayYmd) : null;
    why = `${by || day ? `Kept${by ? ` by ${by}` : ""}${day ? `, ${day}` : ""}. ` : ""}Routine A starts at the Wrap-up.`;
  }

  const starts = useMemo<StartingAlternative[]>(() => {
    if (!suggestion) return NO_STARTS;
    return suggestion.templateId
      ? [{ templateId: suggestion.templateId, label: suggestion.label ?? "", machineIds: derived?.plan.intended ?? [] }, ...suggestion.alternatives]
      : suggestion.alternatives;
  }, [suggestion, derived]);

  /* B planned beside the starting plan, at a studio that starts new clients
     on A and B together (item 8): against the plan's road, which Change
     today never moves. Never where the client has a Routine B already. */
  const b = usePlannedB({
    read: startingView ? plannedBReadOf(input.aAndBTogether, input.bPlannable !== false) : "off",
    aPlan: startingView ? (derived?.plan ?? null) : null,
    floor,
    todayYmd,
    who,
    // A change to B holds the suggestion, as a change to today does: the intake it was matched on is kept.
    onEdit: () => {
      if (startingView && !heldIntake) setHeldIntake({ text: input.intakeText });
    },
  });

  const startPlan: StartPlanAtStart | null =
    startingView && plan && who?.uid
      ? {
          // Day one is what the consult runs: the starting routine's, or
          // today as the trainer changed it.
          plan: changed ? planWithTodayAsDayOne(plan, today, todayYmd) : plan,
          name: "Routine A",
          machineIds: [...today],
          startingRoutineId: plan.templateId ?? null,
          startingRoutineName: chosen?.name ?? null,
          ...(b.planned ? { b: b.planned } : null),
        }
      : null;

  return {
    reading,
    unread,
    plan,
    today,
    changed,
    setToday: (ids) => {
      if (startingView && !heldIntake) setHeldIntake({ text: input.intakeText });
      setOverride({ key, ids: [...ids] });
    },
    suggestion,
    sourceWords,
    why,
    starts,
    pickedId,
    pick: (id) => {
      setPickedId(id);
      setOverride(null);
    },
    fromCode: starting.fromCode,
    notOnFloor: startingView && suggestion && plan ? notOnFloorLine(suggestion.steps.flatMap((s) => s.missing), input.studioName) : null,
    startPlan,
    b,
    bChanged: b.changed,
    reset: () => {
      setOverride(null);
      setPickedId(null);
      setHeldIntake(null);
      b.reset();
    },
  };
}
