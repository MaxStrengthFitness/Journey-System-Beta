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
 * family on this floor and the Academy's substitutes, with their sources),
 * the first marked "Starts with"; what B is for (Variety · Recovery ·
 * Both); and the Academy's line about 5 to 7 runs of A beside it, never a
 * gate. "Start B" (blue) hands the plan up: the profile writes ONE batch
 * (Routine B as A with the first swap, its plan and its `start` change, and
 * the client's `isRoutineBActive`), never awaited.
 *
 * Nothing is written before Start B. A draft changed from the suggestion is
 * registered as unsaved, so closing the sheet over it asks first. The sheet
 * only asks; the caller writes.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "../../unsaved-changes";
import {
  B_PURPOSES,
  B_PURPOSE_LABEL,
  B_SWAPS_SOURCE,
  bSwapChoices,
  startBPlan,
  suggestBSwaps,
  usableSwaps,
  type BPurpose,
} from "../b-routine";
import { FAMILY_SOURCE, SUBSTITUTES_SOURCE, signedChange, type Who } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { PlanChange, PlanSwap, RoutinePlan } from "../types";
import { BAcademyLine } from "./BColumn";
import { Chip, Num, PlanSheet, SourceTag } from "./parts";
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
  onClose: () => void;
  /** Start B: Routine B's machines, its plan and its first change, signed. */
  onStart: (start: PlanBStart) => void;
}

const same = (a: readonly PlanSwap[], b: readonly PlanSwap[]) =>
  a.length === b.length && a.every((s, i) => s.replaces === b[i]!.replaces && s.with === b[i]!.with);

/** Which swap's choices are open: one already in the list, or a new one for an A machine B keeps. */
type Editing = { kind: "swap"; index: number } | { kind: "add"; aId: string } | null;

export function PlanBSheet({ open, aRoutine, aPlan, floor, nameOf, who, todayYmd, aRunsLine, onClose, onStart }: PlanBSheetProps) {
  const aIntended = aPlan?.intended;
  const suggested = useMemo(
    () => suggestBSwaps({ aRoutine, aIntended, floor, templateId: aPlan?.templateId ?? null, cantDo: aPlan?.cantDo, todayYmd }),
    // A's machines and road by their contents, the floor by its machines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aRoutine.join("|"), (aIntended ?? []).join("|"), floor.map((m) => m.id).join("|"), aPlan?.templateId, aPlan?.cantDo, todayYmd],
  );
  /* The trainer's own list, once they change one; until then the sheet
     follows the suggestion as A, A's can't-do and the floor arrive (the
     review of Round 2: taken once at opening, a floor still loading left
     "Nothing on this floor to swap in yet" for good, and the late
     suggestion then read as unsaved work nobody typed). */
  const [draft, setDraft] = useState<PlanSwap[] | null>(null);
  const swaps = draft ?? suggested;
  const setSwaps = (next: PlanSwap[]) => setDraft(next);
  const [purpose, setPurpose] = useState<BPurpose>("variety");
  const [editing, setEditing] = useState<Editing>(null);

  const changed = (draft !== null && !same(draft, suggested)) || purpose !== "variety";
  const unsaved = useUnsavedChanges(open && changed, "Plan B", {
    onDiscard: () => {
      setDraft(null);
      setPurpose("variety");
      setEditing(null);
    },
  });
  const close = () => unsaved.guard(onClose);

  const kept = usableSwaps({ swaps, aRoutine, aIntended, floor, cantDo: aPlan?.cantDo, todayYmd });
  const usable = (s: PlanSwap) => kept.some((k) => k.replaces === s.replaces && k.with === s.with);
  // What Start B starts with: the first swap it can keep, the one marked "Starts with".
  const first = kept[0] ?? null;
  const keeps = aRoutine.filter((id) => !swaps.some((s) => s.replaces === id));
  const canStart = !!who && aRoutine.length > 0 && kept.length > 0;

  const start = () => {
    if (!who) return;
    const started = startBPlan({ aRoutine, aPlan, floor, purpose, swaps, who, todayYmd });
    if (!started) return;
    unsaved.release();
    onStart({ machineIds: started.machineIds, plan: started.plan, change: signedChange(started.change, who) });
  };

  const choicesFor = (aId: string) => bSwapChoices({ aId, aRoutine, aIntended, bPlan: { swaps }, floor, cantDo: aPlan?.cantDo, todayYmd });
  const pickFor = (aId: string, to: string) => {
    const at = swaps.findIndex((s) => s.replaces === aId);
    setSwaps(at >= 0 ? swaps.map((s, k) => (k === at ? { ...s, with: to } : s)) : [...swaps, { replaces: aId, with: to }]);
    setEditing(null);
  };

  const strip = (aId: string, index: number | null) => {
    const choices = choicesFor(aId);
    const chip = (id: string) => (
      <Chip key={id} on={id === choices.current} onClick={() => id !== choices.current && pickFor(aId, id)}>
        {nameOf(id)}
      </Chip>
    );
    return (
      <li className="rpl-bstrip" role="group" aria-label={`In B, instead of ${nameOf(aId)}`}>
        <div className="rpl-bstrip__head">
          <p className="rpl-bstrip__title">In B, instead of {nameOf(aId)}</p>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditing(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
        {choices.same.length === 0 && choices.substitutes.length === 0 && (
          <p className="rpl-meta">Nothing else in this family on this floor.</p>
        )}
        {choices.same.length > 0 && (
          <>
            <p className="rpl-meta">
              {choices.family ? `${choices.family}, on this floor` : "Same family, on this floor"} · {FAMILY_SOURCE}
            </p>
            <div className="rpl-chips">{choices.same.map(chip)}</div>
          </>
        )}
        {choices.substitutes.length > 0 && (
          <>
            <p className="rpl-meta">The Academy's substitutes · {SUBSTITUTES_SOURCE}</p>
            <div className="rpl-chips">{choices.substitutes.map(chip)}</div>
          </>
        )}
        {index !== null && (
          <div className="rpl-actions">
            {index > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  const s = swaps[index]!;
                  setSwaps([s, ...swaps.filter((_, k) => k !== index)]);
                  setEditing(null);
                }}
              >
                Start with this one
              </Button>
            )}
            <Button
              variant="outline"
              className="h-auto min-h-10 max-w-full shrink whitespace-normal py-2 text-left"
              onClick={() => {
                setSwaps(swaps.filter((_, k) => k !== index));
                setEditing(null);
              }}
            >
              Keep {nameOf(aId)} in B
            </Button>
          </div>
        )}
      </li>
    );
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
          <p className="rpl-sheet__label">B's swaps, in the order they come in</p>
          <SourceTag>{B_SWAPS_SOURCE}</SourceTag>
          {swaps.length === 0 && <p className="rpl-meta">Nothing on this floor to swap in yet. Add one for a machine of A below.</p>}
          <ol className="rpl-list rpl-list--flush">
            {swaps.map((s, k) => (
              <SwapRow
                key={`${s.replaces}-${s.with}`}
                n={k + 1}
                swap={s}
                first={!!first && first.replaces === s.replaces && first.with === s.with}
                usable={usable(s)}
                nameOf={nameOf}
                open={editing?.kind === "swap" && editing.index === k}
                onTap={() => setEditing(editing?.kind === "swap" && editing.index === k ? null : { kind: "swap", index: k })}
                strip={editing?.kind === "swap" && editing.index === k ? strip(s.replaces, k) : null}
              />
            ))}
          </ol>
          {keeps.length > 0 && (
            <div className="rpl-sheet__section">
              <p className="rpl-meta">B keeps these as A has them. Tap one to plan a swap for it.</p>
              <div className="rpl-chips">
                {keeps.map((id) => (
                  <Chip
                    key={id}
                    on={editing?.kind === "add" && editing.aId === id}
                    onClick={() => setEditing(editing?.kind === "add" && editing.aId === id ? null : { kind: "add", aId: id })}
                  >
                    {nameOf(id)}
                  </Chip>
                ))}
              </div>
              {editing?.kind === "add" && <ol className="rpl-list rpl-list--flush">{strip(editing.aId, null)}</ol>}
            </div>
          )}
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

function SwapRow({
  n,
  swap,
  first,
  usable,
  nameOf,
  open,
  onTap,
  strip,
}: {
  n: number;
  swap: PlanSwap;
  /** The swap Start B starts with (the first one it can keep). */
  first: boolean;
  /** Start B can keep it: false when A or the floor changed under it, so it is left out. */
  usable: boolean;
  nameOf: (id: string) => string;
  open: boolean;
  onTap: () => void;
  strip: ReactNode;
}) {
  const sub = first ? "Starts with" : usable ? "Later" : "Left out: A or the floor changed";
  return (
    <>
      <li className="rpl-row">
        <span className="rpl-row__lead">
          <Num n={n} tone={first ? "next" : "deck"} />
        </span>
        <span className="rpl-row__body">
          <button
            type="button"
            className="rpl-bcell"
            data-kind={first ? "next" : "follows"}
            aria-pressed={open}
            aria-label={`${nameOf(swap.with)} for ${nameOf(swap.replaces)}${first ? ", starts with" : usable ? "" : ", left out"}`}
            onClick={onTap}
          >
            <ArrowLeftRight size={18} className="rpl-bcell__icon" aria-hidden="true" />
            <span className="rpl-bcell__text">
              <span className="rpl-bcell__name">
                {nameOf(swap.with)} for {nameOf(swap.replaces)}
              </span>
              <span className="rpl-bcell__sub">{sub}</span>
            </span>
          </button>
        </span>
      </li>
      {strip}
    </>
  );
}
