/**
 * START FROM A ROUTINE…, from the session's corner (and the phone's foot):
 * the open session round, Oct 9 2026, AJ's "1b": "i think the open session
 * should honestly feel most like a filemaker session, its the barebones but
 * also i want to be able to take advantage of our routine builder so we can
 * use it if we wanted too".
 *
 * Each routine a trainer might start from, by its name and its first
 * machines, every name whole: the client's Routine A and B once the client
 * is known, the studio's starting routines (day one), the studio's
 * templates and head office's. One tap hands its machines up (`onLay`) and
 * closes; the tracker lays them on today's list through the one recorder,
 * `applySessionMachineIds`, keeping what is already done today. What this
 * floor lacks, what the client can't do and what is out of service are
 * named on the row, never dropped silently (`start-from.ts`).
 *
 * Nothing here writes, and nothing changes a routine: Routine A still comes
 * only through the Wrap-up's Next time (`routine-builder/session-scope.test.ts`).
 *
 * Mounted only while open, so the one read of the starting routines, the
 * studio's choice and the templates (the starting routines' own read,
 * `useStartingRoutines`, asked for the studio's trainer-saved templates too)
 * happens only when someone opens it.
 *
 * Nothing is said off a read that hasn't answered (the review, Oct 9 2026):
 * the floor still reading, or failed, is one line in place of every group;
 * the client's routines still reading hold their place; the starting
 * routines' read failed is said above them, as Start a plan says it.
 */
import { useMemo } from "react";
import type { Routine } from "../../../types";
import { GLOBAL_ROUTINE_PRESETS } from "../../../data/routine-presets";
import { drawerTemplates } from "../../../lib/routine-templates";
import { floorStatus, startFromGroups, startFromLines, type StartFromChoice } from "../start-from";
import type { FloorMachine } from "../starting-plan";
import { useStartingRoutines } from "../useStartingRoutines";
import { PlanSheet } from "./parts";

export interface StartFromRoutineSheetProps {
  onClose: () => void;
  /** The studio the session is at: its starting routines, its choice and its templates. */
  studioId: string | null;
  studioName?: string | null;
  /** This studio's floor. */
  floor: readonly FloorMachine[];
  /** Whether the floor's read answered: nothing is offered (or said missing) off one that hasn't. */
  floorState?: "known" | "reading" | "failed";
  nameOf: (id: string) => string;
  /** The studio's day, `YYYY-MM-DD`. */
  todayYmd: string;
  /** The client's routines once they are known; "reading" until they answer; null with no client (an open session). */
  clientRoutines: readonly Routine[] | "reading" | null;
  firstName?: string | null;
  /** Out of service on the studio's roster (this floor's ids): left out, and said. */
  outOfService?: readonly string[];
  /** The routine's machines, this floor's ids in its order: laid on today's list by the tracker. */
  onLay: (machineIds: string[], choice: StartFromChoice) => void;
}

export function StartFromRoutineSheet({
  onClose,
  studioId,
  studioName = null,
  floor,
  floorState = "known",
  nameOf,
  todayYmd,
  clientRoutines,
  firstName = null,
  outOfService,
  onLay,
}: StartFromRoutineSheetProps) {
  // The drawer's studio group holds its trainers' saved templates too: asked for here alone.
  const starting = useStartingRoutines(studioId, { trainerTemplates: true });
  const groups = useMemo(() => {
    const templates =
      starting.templates === null
        ? starting.status === "loading"
          ? null
          : ("failed" as const)
        : drawerTemplates(starting.templates, studioId, GLOBAL_ROUTINE_PRESETS);
    return startFromGroups({
      floor,
      todayYmd,
      clientRoutines,
      starting:
        starting.status === "loading"
          ? null
          : { routines: starting.routines, choice: starting.choice, failed: starting.status === "failed", fromCode: starting.fromCode },
      templates,
      outOfService,
      nameOf,
      firstName,
      studioName,
    });
  }, [starting.status, starting.routines, starting.choice, starting.fromCode, starting.templates, studioId, floor, todayYmd, clientRoutines, outOfService, nameOf, firstName, studioName]);
  const unreadFloor = floorStatus(floorState, studioName);

  return (
    <PlanSheet open title="Start from a routine" meta="For today only. What's done today stays." onClose={onClose}>
      {unreadFloor && (
        <p className="rpl-meta" data-testid="start-from-floor">
          {unreadFloor}
        </p>
      )}
      {!unreadFloor && groups.map((g) => (
        <section key={g.key} className="rpl-sheet__section" aria-label={g.label}>
          <p className="rpl-sheet__label">{g.label}</p>
          {g.notes?.map((line) => (
            <p key={line} className="rpl-meta">
              {line}
            </p>
          ))}
          {g.status ? (
            <p className="rpl-meta">{g.status}</p>
          ) : (
            <div className="rpl-starts">
              {g.choices.map((c) => {
                const lines = startFromLines(c, nameOf, { firstName, studioName });
                const empty = c.machineIds.length === 0;
                return (
                  <button
                    key={c.key}
                    type="button"
                    className="rpl-start"
                    data-testid={`start-from-${c.key}`}
                    disabled={empty}
                    onClick={() => {
                      if (empty) return;
                      onLay([...c.machineIds], c);
                      onClose();
                    }}
                  >
                    <span className="rpl-start__name">
                      {c.label}
                      {c.notes.length > 0 ? ` · ${c.notes.join(" · ")}` : ""}
                    </span>
                    <span className="rpl-start__meta">{lines.machines}</span>
                    {lines.leftOut.map((line) => (
                      <span key={line} className="rpl-start__meta">
                        {line}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </PlanSheet>
  );
}
