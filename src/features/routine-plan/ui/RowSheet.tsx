/**
 * A ROW'S SHEET — what one machine in the lineup can do (the design round,
 * §4.3): Move up, Move down, Swap for (the same Academy family on THIS
 * floor, and the Academy's documented substitutes, each with its source),
 * Not for {First}, Take out. Before the plan is kept it changes the draft;
 * after, each is a plan change, its reason asked and never required.
 *
 * The sheet only asks: the caller closes it and makes the change.
 */
import { ArrowDown, ArrowUp, Ban, CalendarPlus, CalendarX, Plus, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FAMILY_SOURCE, SUBSTITUTES_SOURCE, type SwapChoices } from "../lineup";
import { Chip, PlanSheet } from "./parts";

export interface RowSheetProps {
  open: boolean;
  /** The machine's name, never cut short. */
  name: string;
  firstName: string;
  swap: SwapChoices;
  nameOf: (id: string) => string;
  onClose: () => void;
  onMove?: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
  /** Before the plan is kept: on or off day one. */
  dayOne?: { on: boolean; toggle: () => void } | null;
  /** The Next machine, when Routine A takes one now. */
  addNow?: (() => void) | null;
  /** Take out: of Routine A only, and/or out of the plan. */
  takeOut: ReadonlyArray<{ key: string; label: string; run: () => void }>;
  onSwap: (to: string[]) => void;
  onCantDo: () => void;
  /** The machine's card (its settings), when the screen has one. */
  onOpenMachine?: (() => void) | null;
}

export function RowSheet({
  open,
  name,
  firstName,
  swap,
  nameOf,
  onClose,
  onMove,
  canUp,
  canDown,
  dayOne,
  addNow,
  takeOut,
  onSwap,
  onCantDo,
  onOpenMachine,
}: RowSheetProps) {
  const nothingToSwap = swap.same.length === 0 && swap.substitutes.length === 0;
  return (
    <PlanSheet open={open} title={name} meta={swap.family ?? undefined} onClose={onClose}>
      <div className="rpl-actions">
        {onMove && canUp && (
          <Button variant="outline" onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" />
            Move up
          </Button>
        )}
        {onMove && canDown && (
          <Button variant="outline" onClick={() => onMove(1)}>
            <ArrowDown aria-hidden="true" />
            Move down
          </Button>
        )}
        {dayOne && (
          <Button variant="outline" onClick={dayOne.toggle}>
            {dayOne.on ? <CalendarX aria-hidden="true" /> : <CalendarPlus aria-hidden="true" />}
            {dayOne.on ? "Not on day one" : "Do it on day one"}
          </Button>
        )}
        {addNow && (
          <Button variant="outline" onClick={addNow}>
            <Plus aria-hidden="true" />
            Add to A now
          </Button>
        )}
        {/* The client's first name, whole: the words wrap, never run off the sheet. */}
        <Button variant="outline" className="h-auto min-h-10 max-w-full shrink whitespace-normal py-2 text-left" onClick={onCantDo}>
          <Ban aria-hidden="true" />
          Not for {firstName}
        </Button>
        {takeOut.map((t) => (
          <Button key={t.key} variant="outline" onClick={t.run}>
            {t.label}
          </Button>
        ))}
        {onOpenMachine && (
          <Button variant="ghost" className="text-primary" onClick={onOpenMachine}>
            <SquareArrowOutUpRight aria-hidden="true" />
            The machine's card
          </Button>
        )}
      </div>
      <section className="rpl-sheet__section" aria-label="Swap for">
        <p className="rpl-sheet__label">Swap for</p>
        {nothingToSwap && <p className="rpl-meta">Nothing else in this family on this floor.</p>}
        {swap.same.length > 0 && (
          <div className="rpl-sheet__section">
            <p className="rpl-meta">Same family, on this floor · {FAMILY_SOURCE}</p>
            <div className="rpl-chips">
              {swap.same.map((id) => (
                <Chip key={id} onClick={() => onSwap([id])}>
                  {nameOf(id)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {swap.substitutes.length > 0 && (
          <div className="rpl-sheet__section">
            <p className="rpl-meta">The Academy's substitutes · {SUBSTITUTES_SOURCE}</p>
            <div className="rpl-chips">
              {swap.substitutes.map((set) => (
                <Chip key={set.join("+")} onClick={() => onSwap(set)}>
                  {set.map(nameOf).join(" + ")}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>
    </PlanSheet>
  );
}
