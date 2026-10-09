/**
 * ROUTINE B, MOLDED IN — Programming → Routine B (Round 2 of the design
 * round, item 6; AJ's "1d": "the Lineup on Programming", A and B side by
 * side).
 *
 * Routine B's own segment draws the same column Routine A's Lineup draws
 * beside its rows (`BColumn.tsx`): B's head ("B · 2 of 5 swaps · next:
 * Leg Extension for Leg Press", Swap in the next one and the quieter Two and
 * Three, "A and B alternate · next session is B", the Academy's line with
 * its source, B is for), then A | B, each row a place in A's order, A's
 * machine on the left and B's cell on the right: "Follows A", or B's own
 * machine "for" the A machine it replaces. A tap on B's cell changes that
 * place's planned swap. B's Changes are its plan's own list (a right column
 * on a landscape iPad, a sheet in portrait).
 *
 * Before B starts ("start"): one line, "B starts as a copy of A with one
 * machine different", the Academy's line, and Plan B (the profile's one
 * sheet, through `host.openPlanB`). Nothing here is ever a gate: the
 * Academy's 5 to 7 runs of A are said, never enforced.
 */
import { useMemo, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoutineAdjustment, Trainer } from "../../../types";
import { useMediaQuery, NOW_BAR_SIDE_QUERY } from "../../../hooks/useMediaQuery";
import { usePhone } from "../../phone/device";
import type { RoutinePlan } from "../types";
import { BAcademyLine, useBColumn, type BSide } from "./BColumn";
import { floorMachinesOf, type PlanHost } from "./host";
import { GroupHead, LineupRow, PlanSheet } from "./parts";
import { PlanChangesList } from "./PlanChangesList";
import "./routine-plan.css";

export interface BPlanViewProps {
  /** Routine B's head: its letter, name, the last change, the B switch and Edit. */
  head: ReactNode;
  host: PlanHost;
  /** Routine A's machines, in A's order: B's places. */
  aRoutine: readonly string[];
  /** Routine A's plan (its can't-do marks are B's too). */
  aPlan: RoutinePlan | null;
  b: BSide;
  nameOf: (id: string) => string;
  firstName: string;
  adjustments: readonly RoutineAdjustment[];
  trainers: readonly Trainer[];
  disabled?: boolean;
}

export function BPlanView({ head, host, aRoutine, aPlan, b, nameOf, firstName, adjustments, trainers, disabled = false }: BPlanViewProps) {
  const canWrite = !!host.who && host.status === "ready" && !disabled;
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const parts = useBColumn({ b, aRoutine, aPlan, host, floor, nameOf, canWrite });
  const phone = usePhone();
  const wide = useMediaQuery(NOW_BAR_SIDE_QUERY) && !phone;
  const [changesOpen, setChangesOpen] = useState(false);

  if (parts.mode === "start") {
    return (
      <section className="rt-routine rpl-routine" aria-label="Routine B">
        {head}
        <div className="rpl-bhead">
          <p className="rpl-progress__line">B starts as a copy of A with one machine different, then A and B alternate.</p>
          <BAcademyLine aRunsLine={b.aRunsLine} />
          {canWrite && host.openPlanB && (
            <div className="rpl-actions">
              <Button className="hover:bg-primary" onClick={host.openPlanB}>
                Plan B
              </Button>
            </div>
          )}
          {!host.who && <p className="rpl-meta">Sign in again to plan B.</p>}
        </div>
      </section>
    );
  }

  const bId = b.routine?.id ?? null;
  const items: ReactNode[] = [
    <GroupHead key="h-a" label="Routine A" count={aRoutine.length} className="rpl-aside" />,
    parts.colHead,
  ];
  aRoutine.forEach((id, i) => {
    items.push(...parts.notesFor(id));
    items.push(<LineupRow key={`a-${id}`} n={i + 1} name={nameOf(id)} className="rpl-aside" />);
    items.push(...parts.cellFor(id));
  });
  items.push(...parts.extras);

  const changes = bId ? (
    <PlanChangesList
      routineId={bId}
      adjustments={adjustments}
      trainers={trainers}
      nameOf={nameOf}
      firstName={firstName}
      todayYmd={host.todayYmd}
      read={host.actions.readChanges}
      routineName="Routine B"
    />
  ) : null;

  return (
    <div className={wide ? "rpl-grid" : "rpl"}>
      <section className="rt-routine rpl-routine" aria-label="Routine B's plan">
        {head}
        {parts.head}
        {!wide && changes && (
          <div className="rpl-saidwrap">
            <Button variant="outline" onClick={() => setChangesOpen(true)}>
              <History aria-hidden="true" />
              Changes to B
            </Button>
          </div>
        )}
        <ol className="rpl-list rpl-list--ab" aria-label="Routine A and Routine B">
          {items}
        </ol>
      </section>
      {wide && changes && (
        <aside className="rpl-panel" aria-label="Changes to B">
          <div className="rpl-panel__head">
            <h3 className="rpl-panel__title">Changes to B</h3>
          </div>
          {changes}
        </aside>
      )}
      {changesOpen && changes && (
        <PlanSheet open title="Changes to B" meta="Newest first" onClose={() => setChangesOpen(false)}>
          {changes}
        </PlanSheet>
      )}
      {parts.sheets}
    </div>
  );
}
