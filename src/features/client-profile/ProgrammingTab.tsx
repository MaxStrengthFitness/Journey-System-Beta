/**
 * PROGRAMMING — what this client is supposed to do.
 *
 * Routines and Equipment were two tabs answering one question. A trainer
 * checking "what is Judy on today, and is the Leg Press set up for her" had
 * to visit both, and the two screens already spoke the same visual language —
 * the Routines round deliberately rebuilt the prescription rows in the
 * Equipment rail's vocabulary. Two tabs for one sentence.
 *
 * One tab now, three segments:
 *
 *   ROUTINE A      the prescription, full width, one at a time
 *   ROUTINE B      the same, and the switch that turns it on
 *   ALL MACHINES   the roster — every machine, its settings, its history
 *
 * Three decisions worth stating:
 *
 *   1. IT OPENS ON TODAY'S ROUTINE. `defaultProgrammingView` picks the
 *      prescription the client is actually training, which is the screen the
 *      trainer wanted before they knew they wanted it. The old tab opened on
 *      "both" and made them read which one was today.
 *
 *   2. ONE AT A TIME IS DENSER, NOT SPARSER. Side by side, each routine had
 *      half of a 1024px screen and eight machines ran past the fold. One at a
 *      time, the whole list fits, and the segment to see the other one is
 *      48px away in a fixed position. The density problem is solved by
 *      *removing* the second column, not by shrinking rows.
 *
 *   3. THE ROSTER STAYS MOUNTED. The Equipment pane holds a selected machine,
 *      a search and a drill-in position, and rebuilding it on every toggle
 *      would turn a free switch into a reload. It is hidden, not unmounted.
 *      The two routine panels are cheap and are unmounted normally.
 *
 * All the Firestore writes still belong to ClientProfileView. This shell owns
 * one piece of state — which segment is showing — and it does not even own
 * that: the profile's nav reducer does, so the choice survives a trip to the
 * Journey grid and back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { EquipmentTab } from "../equipment";
import { RoutinesTab } from "../routines";
import { relativeTime, type RoutineName } from "../routines/routine-rows";
import { useRoutinesModel } from "../routines/useRoutinesModel";
import { ProfileSubnav, type SubnavItem } from "./ProfileSubnav";
import type { ProgrammingView } from "./profile-nav";
import "./profile-nav.css";

export interface ProgrammingTabProps {
  client: Client | null | undefined;
  clientId: string;
  routines: Routine[];
  machines: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  clientBodyWeight?: number;
  allLogs: ExerciseLog[];
  sessions: WorkoutSession[];
  adjustments: RoutineAdjustment[];
  trainers: Trainer[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  selectedRoutineTodayId: string | null;
  isBActive: boolean;
  view: ProgrammingView;
  onViewChange: (view: ProgrammingView) => void;
  onEdit: (name: RoutineName) => void;
  onUseToday: (routine: Routine) => void;
  onToggleB: (checked: boolean) => void;
  onSelectMachine?: (machineId: string) => void;
  disabled?: boolean;
}

export function ProgrammingTab({
  client,
  clientId,
  routines,
  machines,
  clientSettings,
  clientBodyWeight,
  allLogs,
  sessions,
  adjustments,
  trainers,
  authTrainer,
  activeStudioId,
  selectedRoutineTodayId,
  isBActive,
  view,
  onViewChange,
  onEdit,
  onUseToday,
  onToggleB,
  onSelectMachine,
  disabled = false,
}: ProgrammingTabProps) {
  /*
   * The roster is mounted the first time it is opened and never unmounted
   * after that — "keep alive from first use". Mounting it up front would cost
   * a machine-catalog subscription on every profile open for a pane most
   * visits never reach; unmounting it on every toggle would throw away the
   * selected machine and the search, which are the trainer's place in it.
   * A new client resets both, the same way EquipmentTab already does.
   */
  const [rosterSeen, setRosterSeen] = useState(view === "machines");
  useEffect(() => {
    if (view === "machines") setRosterSeen(true);
  }, [view]);
  const lastClient = useRef(clientId);
  if (lastClient.current !== clientId) {
    lastClient.current = clientId;
    if (rosterSeen && view !== "machines") setRosterSeen(false);
  }

  // Computed here and handed down, so the context line and the routine panel
  // are the same numbers from the same walk of the logs.
  const model = useRoutinesModel({
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
  });

  const items = useMemo<SubnavItem<ProgrammingView>[]>(
    () => [
      {
        id: "routine-a",
        label: "Routine A",
        meta:
          model.rowsA.length === 0
            ? "not set up"
            : `${model.rowsA.length} machines${model.todayName === "Routine A" ? " · today" : ""}`,
        // The dot is "there is something here to deal with", and the only
        // thing on a prescription that qualifies is a machine with no load.
        flag: model.rowsA.some((r) => r.weight === null),
      },
      {
        id: "routine-b",
        // Never hidden when B is off. A segment that disappears is a feature
        // the studio forgets it has — and turning B on lives behind it.
        label: "Routine B",
        meta: !isBActive
          ? "off"
          : model.rowsB.length === 0
            ? "not set up"
            : `${model.rowsB.length} machines${model.todayName === "Routine B" ? " · today" : ""}`,
        flag: isBActive && model.rowsB.some((r) => r.weight === null),
      },
      {
        id: "machines",
        label: "All Machines",
        meta: `${machines.length} on roster`,
        flag: false,
      },
    ],
    [model, isBActive, machines.length],
  );

  const context = (
    <>
      <span>
        <b>{model.total}</b> {model.total === 1 ? "machine" : "machines"} prescribed
      </span>
      {model.total > 0 && model.setUp < model.total ? (
        <>
          <span className="psub-context__dot" aria-hidden="true" />
          <span>
            <b>{model.total - model.setUp}</b> with no load yet
          </span>
        </>
      ) : null}
      <span className="psub-context__dot" aria-hidden="true" />
      <span>
        {model.todayName ? (
          <>
            <b>{model.todayName}</b> today
          </>
        ) : (
          "No routine chosen for today"
        )}
      </span>
      {model.newest ? (
        <>
          <span className="psub-context__dot" aria-hidden="true" />
          <span>
            last change <b>{relativeTime(model.newest.when)}</b> by {model.newest.trainerInitials}
          </span>
        </>
      ) : null}
    </>
  );

  const routineProps = {
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
    onEdit,
    onUseToday,
    onToggleB,
    onSelectMachine,
    disabled,
    hideSummary: true,
    model,
  };

  return (
    <div className="ptab">
      <ProfileSubnav
        label="Programming views"
        items={items}
        value={view}
        onChange={onViewChange}
        context={context}
      />

      {view === "routine-a" && <RoutinesTab {...routineProps} view="Routine A" />}
      {view === "routine-b" && <RoutinesTab {...routineProps} view="Routine B" />}

      {/* Mounted from the first time the roster is opened, hidden after that.
          See decision 3 in the header: this pane owns a selection and a
          search, and both are the trainer's place in it. */}
      {rosterSeen && (
      <div className="ptab-pane" hidden={view !== "machines"}>
        <EquipmentTab
          client={client}
          clientId={clientId}
          machines={machines}
          clientSettings={clientSettings}
          clientBodyWeight={clientBodyWeight}
          allLogs={allLogs}
          sessions={sessions}
          activeStudioId={activeStudioId}
          authTrainer={authTrainer}
        />
      </div>
      )}
    </div>
  );
}
