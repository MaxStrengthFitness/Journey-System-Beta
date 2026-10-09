/**
 * PLAN B — starting Routine B (Round 2 of the design round, item 6).
 *
 * AJ, Oct 7 2026: "you pretty much need to be able to build the B routine on
 * what you want it to be, but transition the B routine in by swapping out
 * one A routine each time. So it's essentially the B routine has started,
 * but the B routine starts out as the A routine with just one machine
 * different." And why: "B routines is definitely for variety ... it also can
 * be to allow us to still hit areas of the body while allowing a recovery
 * on certain muscle groups."
 *
 * So the sheet offers B planned whole, as swaps against A, in the order they
 * come in (`suggestBSwaps`: same regions, different machines, from the
 * starting routine's eventual B, the Academy's model B and its pairs, on
 * THIS floor, never a machine the client can't do), each editable (the same
 * family on this floor and the Academy's substitutes, with their sources;
 * `BSwapsEditor`), the first marked "Starts with"; what B is for (Variety ·
 * Recovery · Both); and the Academy's line about 5 to 7 runs of A beside
 * it, never a gate. "Start B" (blue) hands the plan up: the profile writes
 * ONE batch (Routine B as A with the first swap, its plan and its `start`
 * change, and the client's `isRoutineBActive`), never awaited.
 *
 * A Routine B planned with the starting lineup (the studio's "A and B
 * together", item 8) and not started yet (`planned`): the sheet starts from
 * ITS swaps and what it is for, not a fresh suggestion, so what the trainer
 * planned at the start is what Start B starts. A swap planned for a machine
 * still on A's deck says so ("Left out: Chest Press isn't in Routine A
 * yet") and is left out of this start.
 *
 * Nothing is written before Start B. A draft changed from the suggestion is
 * registered as unsaved, so closing the sheet over it asks first. The sheet
 * only asks; the caller writes.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "../../unsaved-changes";
import {
  B_PURPOSES,
  B_PURPOSE_LABEL,
  B_SWAPS_SOURCE,
  bPurposeOf,
  startBPlan,
  suggestBSwaps,
  swapsOf,
  usableSwaps,
  type BPurpose,
} from "../b-routine";
import { signedChange, type Who } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { PlanChange, PlanSwap, RoutinePlan } from "../types";
import { BAcademyLine } from "./BColumn";
import { BSwapsEditor } from "./BSwapsEditor";
import { Chip, PlanSheet, SourceTag } from "./parts";
import "./routine-plan.css";

export interface PlanBStart {
  machineIds: string[];
  plan: RoutinePlan;
  change: PlanChange;
}

export interface PlanBSheetProps {
  open: boolean;
  /** Routine A's machines, in A's order. */
  aRoutine: readonly string[];
  /** Routine A's plan: its can't-do marks keep machines out of B, and its starting routine's eventual B leads the suggestion. */
  aPlan: RoutinePlan | null;
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  who: Who | null;
  todayYmd: string;
  /** "Routine A has run 7 times in Journey.", or null when it isn't known. */
  aRunsLine: string | null;
  /**
   * B's plan when Routine B was planned with the starting lineup and hasn't
   * started (`isPlannedB`): the sheet starts from its swaps and purpose.
   */
  planned?: RoutinePlan | null;
  onClose: () => void;
  /** Start B: Routine B's machines, its plan and its first change, signed. */
  onStart: (start: PlanBStart) => void;
}

const same = (a: readonly PlanSwap[], b: readonly PlanSwap[]) =>
  a.length === b.length && a.every((s, i) => s.replaces === b[i]!.replaces && s.with === b[i]!.with);

export function PlanBSheet({ open, aRoutine, aPlan, floor, nameOf, who, todayYmd, aRunsLine, planned = null, onClose, onStart }: PlanBSheetProps) {
  const aIntended = aPlan?.intended;
  const plannedSwaps = useMemo(() => (planned ? swapsOf(planned) : null), [planned]);
  const suggested = useMemo(
    () =>
      plannedSwaps ??
      suggestBSwaps({ aRoutine, aIntended, floor, templateId: aPlan?.templateId ?? null, cantDo: aPlan?.cantDo, todayYmd }),
    // A's machines and road by their contents, the floor by its machines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plannedSwaps, aRoutine.join("|"), (aIntended ?? []).join("|"), floor.map((m) => m.id).join("|"), aPlan?.templateId, aPlan?.cantDo, todayYmd],
  );
  const firstPurpose: BPurpose = (planned ? bPurposeOf(planned) : null) ?? "variety";
  /* The trainer's own list, once they change one; until then the sheet
     follows the suggestion as A, A's can't-do and the floor arrive (the
     review of Round 2: taken once at opening, a floor still loading left
     "Nothing on this floor to swap in yet" for good, and the late
     suggestion then read as unsaved work nobody typed). */
  const [draft, setDraft] = useState<PlanSwap[] | null>(null);
  const swaps = draft ?? suggested;
  const [purpose, setPurpose] = useState<BPurpose>(firstPurpose);

  const changed = (draft !== null && !same(draft, suggested)) || purpose !== firstPurpose;
  const unsaved = useUnsavedChanges(open && changed, "Plan B", {
    onDiscard: () => {
      setDraft(null);
      setPurpose(firstPurpose);
    },
  });
  const close = () => unsaved.guard(onClose);

  const kept = usableSwaps({ swaps, aRoutine, aIntended, floor, cantDo: aPlan?.cantDo, todayYmd });
  const canStart = !!who && aRoutine.length > 0 && kept.length > 0;
  // A swap planned with the starting lineup for a machine still on A's deck is left out of this start, said as such.
  const leftOut = (s: PlanSwap) =>
    !aRoutine.includes(s.replaces) && (aIntended ?? []).includes(s.replaces)
      ? `Left out: ${nameOf(s.replaces)} isn't in Routine A yet`
      : "Left out: A or the floor changed";

  const start = () => {
    if (!who) return;
    const started = startBPlan({ aRoutine, aPlan, floor, purpose, swaps, who, todayYmd });
    if (!started) return;
    unsaved.release();
    onStart({ machineIds: started.machineIds, plan: started.plan, change: signedChange(started.change, who) });
  };

  return (
    <PlanSheet
      open={open}
      title="Plan B"
      meta="B starts as a copy of A with one machine different, then A and B alternate."
      onClose={close}
      footer={
        <Button className="hover:bg-primary" disabled={!canStart} onClick={start}>
          Start B
        </Button>
      }
    >
      <BAcademyLine aRunsLine={aRunsLine} />
      {aRoutine.length === 0 ? (
        <p className="rpl-line">Routine A has no machines yet. B starts as a copy of A, so it starts once A has some.</p>
      ) : (
        <section className="rpl-sheet__section" aria-label="B's swaps, in order">
          <p className="rpl-sheet__label">{planned ? "B's swaps, as planned at the start" : "B's swaps, in the order they come in"}</p>
          <SourceTag>{B_SWAPS_SOURCE}</SourceTag>
          {swaps.length === 0 && <p className="rpl-meta">Nothing on this floor to swap in yet. Add one for a machine of A below.</p>}
          <BSwapsEditor
            aRoutine={aRoutine}
            aIntended={aIntended}
            cantDo={aPlan?.cantDo}
            floor={floor}
            todayYmd={todayYmd}
            nameOf={nameOf}
            swaps={swaps}
            onSwaps={setDraft}
            kept={kept}
            leftOut={leftOut}
          />
        </section>
      )}
      <div className="rpl-actions" role="group" aria-label="B is for">
        <span className="rpl-bhead__label">B is for</span>
        {B_PURPOSES.map((p) => (
          <Chip key={p} on={purpose === p} onClick={() => setPurpose(p)}>
            {B_PURPOSE_LABEL[p]}
          </Chip>
        ))}
      </div>
      {!who && <p className="rpl-meta">Sign in again to start B.</p>}
    </PlanSheet>
  );
}
