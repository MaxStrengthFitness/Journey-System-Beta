/**
 * PLAN B ON THE PROFILE (Round 2 of the first-session design round, item 6:
 * B molded in). The profile's one Plan B sheet, as ClientProfileView mounts
 * it: opened by the B switch, Routine B's segment, the A | B lineup and the
 * Edit routine drawer's B tab (`useBSwitch`), and kept by Start B through
 * the profile's plan actions (`actions.startB`: ONE batch, never awaited).
 *
 * AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
 * machine different".
 *
 * Mounted only while open, so a draft lives as long as the sheet does. The
 * floor and the names are worked out once per floor (the review of Round 2:
 * made fresh on every profile render, the suggestion ran again each time).
 * A Routine B that gained machines since the sheet opened (another iPad) is
 * never written over.
 */
import { useMemo } from "react";
import type { Machine, Routine, WorkoutSession } from "../../../types";
import type { HistoryCoverage } from "../../../lib/prior-history";
import { aRunsLine, aRunsSince } from "../b-routine";
import type { Who } from "../lineup";
import { floorMachinesOf, machineNamer, savedRoutineA, savedRoutineB, type PlanActions } from "./host";
import { PlanBSheet } from "./PlanBSheet";
import type { BSwitch } from "./useBSwitch";

export interface ProfilePlanBProps {
  bSwitch: Pick<BSwitch, "planBOpen" | "closePlanB">;
  routines: readonly Routine[];
  /** This studio's floor (the profile's `codexFloor`). */
  floor: readonly Machine[];
  /** The catalog, for names. */
  machines: readonly Machine[];
  /** The client's sessions the profile has read. */
  sessions: readonly WorkoutSession[];
  /** Every session read (no page left): the count is whole. */
  sessionsComplete: boolean;
  /** How much of the client's story Journey holds. */
  coverage: HistoryCoverage;
  who: Who | null;
  todayYmd: string;
  actions: Pick<PlanActions, "startB">;
  onError: (message: string) => void;
}

export function ProfilePlanB({
  bSwitch,
  routines,
  floor,
  machines,
  sessions,
  sessionsComplete,
  coverage,
  who,
  todayYmd,
  actions,
  onError,
}: ProfilePlanBProps) {
  const floorMachines = useMemo(() => floorMachinesOf(floor), [floor]);
  const nameOf = useMemo(() => machineNamer(floor, machines), [floor, machines]);
  const a = savedRoutineA(routines);
  const runs = useMemo(() => aRunsSince(sessions, a?.id ?? null), [sessions, a?.id]);
  if (!bSwitch.planBOpen) return null;
  return (
    <PlanBSheet
      open
      aRoutine={a?.machineIds ?? []}
      aPlan={a?.plan ?? null}
      floor={floorMachines}
      nameOf={nameOf}
      who={who}
      todayYmd={todayYmd}
      aRunsLine={aRunsLine(runs, !sessionsComplete, coverage)}
      onClose={bSwitch.closePlanB}
      onStart={(start) => {
        const b = savedRoutineB(routines);
        bSwitch.closePlanB();
        // Routine B was empty when the sheet opened; a list put in it since
        // (another iPad) is never written over.
        if ((b?.machineIds?.length ?? 0) > 0) {
          onError("Routine B has machines now. Open Routine B on Programming to see them.");
          return;
        }
        actions.startB?.({ routineId: b?.id ?? null, ...start });
      }}
    />
  );
}
