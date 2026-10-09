/**
 * B's swaps, in the order they come in, each editable: the one list Plan B
 * (`PlanBSheet`) and B planned with a starting lineup (`PlannedBPart`, the
 * studio's "A and B together") draw. A tap on a swap opens its strip: the
 * same family on this floor and the Academy's one-machine substitutes, each
 * with its source, Start with this one, and Keep {A} in B. Under the list,
 * the places B keeps as A has them, each a chip that plans a swap for it.
 *
 * Controlled: the caller holds the swaps (`swaps`, `onSwaps`) and says which
 * it would keep (`kept`, `usableSwaps`): the first of them is marked "Starts
 * with", one it would not keep says why (`leftOut`). Nothing here writes.
 * Never a machine the client can't do, and never one of A's (now or still
 * to come): `bSwapChoices` holds both.
 */
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bSwapChoices } from "../b-routine";
import { FAMILY_SOURCE, SUBSTITUTES_SOURCE } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { CantDo, PlanSwap } from "../types";
import { Chip, Num } from "./parts";
import "./routine-plan.css";

/** Which swap's choices are open: one already in the list, or a new one for an A machine B keeps. */
type Editing = { kind: "swap"; index: number } | { kind: "add"; aId: string } | null;

export interface BSwapsEditorProps {
  /** A's places, in A's order: Routine A's machines (Plan B), or A's planned road (B planned ahead). */
  aRoutine: readonly string[];
  /** A's road still to come: never offered for B. */
  aIntended?: readonly string[] | null;
  cantDo?: readonly CantDo[] | null;
  floor: readonly FloorMachine[];
  todayYmd: string;
  nameOf: (id: string) => string;
  swaps: readonly PlanSwap[];
  onSwaps: (next: PlanSwap[]) => void;
  /** The swaps the caller would keep (`usableSwaps`): the first is "Starts with". */
  kept: readonly PlanSwap[];
  /** Why the caller would not keep a swap, in a few words ("Left out: A or the floor changed"). */
  leftOut: (swap: PlanSwap) => string;
  /** "B keeps these as A has them. Tap one to plan a swap for it." */
  keepsLine?: string;
}

export function BSwapsEditor({
  aRoutine,
  aIntended,
  cantDo,
  floor,
  todayYmd,
  nameOf,
  swaps,
  onSwaps,
  kept,
  leftOut,
  keepsLine = "B keeps these as A has them. Tap one to plan a swap for it.",
}: BSwapsEditorProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const usable = (s: PlanSwap) => kept.some((k) => k.replaces === s.replaces && k.with === s.with);
  const first = kept[0] ?? null;
  const keeps = aRoutine.filter((id) => !swaps.some((s) => s.replaces === id));

  const choicesFor = (aId: string) => bSwapChoices({ aId, aRoutine, aIntended, bPlan: { swaps: [...swaps] }, floor, cantDo, todayYmd });
  const pickFor = (aId: string, to: string) => {
    const at = swaps.findIndex((s) => s.replaces === aId);
    onSwaps(at >= 0 ? swaps.map((s, k) => (k === at ? { ...s, with: to } : s)) : [...swaps, { replaces: aId, with: to }]);
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
                  onSwaps([s, ...swaps.filter((_, k) => k !== index)]);
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
                onSwaps(swaps.filter((_, k) => k !== index));
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
    <>
      <ol className="rpl-list rpl-list--flush">
        {swaps.map((s, k) => (
          <SwapRow
            key={`${s.replaces}-${s.with}`}
            n={k + 1}
            swap={s}
            first={!!first && first.replaces === s.replaces && first.with === s.with}
            usable={usable(s)}
            leftOut={leftOut(s)}
            nameOf={nameOf}
            open={editing?.kind === "swap" && editing.index === k}
            onTap={() => setEditing(editing?.kind === "swap" && editing.index === k ? null : { kind: "swap", index: k })}
            strip={editing?.kind === "swap" && editing.index === k ? strip(s.replaces, k) : null}
          />
        ))}
      </ol>
      {keeps.length > 0 && (
        <div className="rpl-sheet__section">
          <p className="rpl-meta">{keepsLine}</p>
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
    </>
  );
}

function SwapRow({
  n,
  swap,
  first,
  usable,
  leftOut,
  nameOf,
  open,
  onTap,
  strip,
}: {
  n: number;
  swap: PlanSwap;
  /** The swap B starts with (the first one the caller can keep). */
  first: boolean;
  /** The caller can keep it: false when A or the floor changed under it, so it is left out. */
  usable: boolean;
  leftOut: string;
  nameOf: (id: string) => string;
  open: boolean;
  onTap: () => void;
  strip: ReactNode;
}) {
  const sub = first ? "Starts with" : usable ? "Later" : leftOut;
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
