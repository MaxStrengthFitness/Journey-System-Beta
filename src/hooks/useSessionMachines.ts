import { useStudioMachines } from "./useStudioMachines";
import { useActiveStudio } from "../ActiveStudioContext";
import { ResolvedMachine } from "../types/machines";

/**
 * The machines available for a session IN PROGRESS.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * This exists to make one rule impossible to get wrong: a session's machine
 * list is bound to the studio where the training is PHYSICALLY HAPPENING —
 * `activeStudioId` — never to the client's home studio.
 *
 * The edge case that motivates it: a Solon member training at Mentor while
 * travelling. Keying off the client's record would offer the trainer Solon's
 * equipment in a room that does not contain it, and would write logs against
 * machine ids the Mentor roster has never heard of. Keying off the active
 * studio gives the trainer exactly the machines in front of them.
 *
 * Call this instead of useStudioMachines anywhere inside a session, and never
 * pass a studio id from a client document into the machine list.
 *
 * Machines under maintenance are returned but flagged, so the tracker can
 * grey them out rather than silently hiding equipment a trainer can see.
 */
export interface UseSessionMachinesResult {
  /** Active + maintenance, ordered. Never includes equipment this studio lacks. */
  machines: ResolvedMachine[];
  /** Usable right now — excludes anything under maintenance. */
  availableMachines: ResolvedMachine[];
  byId: Record<string, ResolvedMachine>;
  /** The studio the list is bound to; surface this in the UI when cross-training. */
  sessionStudioId: string | null;
  sessionStudioName: string | null;
  loading: boolean;
}

export function useSessionMachines(): UseSessionMachinesResult {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const { machines, byId, loading } = useStudioMachines(activeStudioId);

  return {
    machines,
    availableMachines: machines.filter((m) => m.rosterStatus === "active"),
    byId,
    sessionStudioId: activeStudioId,
    sessionStudioName: activeStudio?.name ?? null,
    loading,
  };
}
