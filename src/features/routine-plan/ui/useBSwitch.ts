/**
 * THE B SWITCH and Plan B's one sheet, the profile's half (Round 2 of the
 * first-session design round, item 6: B molded in).
 *
 * AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
 * machine different". Until Round 2, turning B on made an EMPTY Routine B
 * when the client had none, and with B on the alternation then ran the
 * client into a session of nothing (the critic's #22). Now every way of
 * turning B on (the profile's switch, Routine B's segment and the Edit
 * routine drawer's inactive B tab) asks this one hook, which asks
 * `bSwitchStep`:
 * - nothing in Routine B: Plan B opens (the drawer, which asked about its
 *   own typing before it handed over, closes first: `beforePlanB`); no
 *   Routine B is written until Start B;
 * - Routine B with machines, or B going off: the switch as it always was,
 *   its reason asked, never required (`onSwitch`, the profile's dialog);
 * - the client's routines not answered yet, or the read failed: it says it
 *   can't tell (`onCantTell`), never "no Routine B" off a list it hasn't
 *   read.
 *
 * Plan B is the profile's one sheet, so the switch, the drawer, the A | B
 * lineup and Routine B's segment open the same one (`openPlanB`).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Routine } from "../../../types";
import { B_SWITCH_CANT_TELL, bSwitchStep } from "../b-routine";
import { savedRoutineB } from "./host";

export interface BSwitchInput {
  /** The client's routines as the profile holds them. */
  routines: readonly Routine[];
  /** The routines have answered (the profile's `routinesStatus === "ready"`). */
  routinesKnown: boolean;
  /** The switch as it always was: the reason asked, never required. */
  onSwitch: (on: boolean) => void;
  /** Said when the routines haven't answered. */
  onCantTell: (message: string) => void;
  /** Called just before Plan B opens: what must close for it (the Edit routine drawer). */
  beforePlanB?: () => void;
}

export interface BSwitch {
  /** Plan B's sheet is open. */
  planBOpen: boolean;
  openPlanB: () => void;
  closePlanB: () => void;
  /** Turn B on or off: the profile's switch, Routine B's segment and the drawer's B tab. */
  request: (on: boolean) => void;
}

export function useBSwitch(input: BSwitchInput): BSwitch {
  // The latest input, so the functions stay the same across renders.
  const ref = useRef(input);
  ref.current = input;
  const [planBOpen, setPlanBOpen] = useState(false);

  const openPlanB = useCallback(() => {
    ref.current.beforePlanB?.();
    setPlanBOpen(true);
  }, []);
  const closePlanB = useCallback(() => setPlanBOpen(false), []);

  const request = useCallback(
    (on: boolean) => {
      const { routines, routinesKnown, onSwitch, onCantTell } = ref.current;
      switch (bSwitchStep(on, savedRoutineB(routines), routinesKnown)) {
        case "plan-b":
          openPlanB();
          return;
        case "cant-tell":
          onCantTell(B_SWITCH_CANT_TELL);
          return;
        default:
          onSwitch(on);
      }
    },
    [openPlanB],
  );

  return useMemo(() => ({ planBOpen, openPlanB, closePlanB, request }), [planBOpen, openPlanB, closePlanB, request]);
}
