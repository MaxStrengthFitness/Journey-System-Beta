/**
 * MACHINE FIT — the docked keypad.
 *
 * Thirty machines is about ninety cells. With the iPad's own keyboard every
 * cell costs: tap the cell, wait for the keyboard to slide up over half the
 * screen, find the number row, type, find the next cell underneath it. The
 * pad removes all of that. It sits at the bottom of the Setup screen, never
 * covers the row being typed into, and always offers exactly what the active
 * cell can take:
 *
 *   · a NUMBERED setting gets digits, a point and a backspace;
 *   · a setting with OPTIONS (Handles: In / Out) gets the options as keys —
 *     one tap sets the value AND moves on; a legacy field with no options
 *     gets the WORDS other clients use there ("In", "Out", "D") the same way;
 *   · every cell gets Back and Next, so a trainer reading down a FileMaker
 *     chart never has to aim at the next box.
 *
 * Like a spreadsheet cell, the FIRST key after arriving on a cell replaces
 * what was there; after that, keys add to it. Correcting "4" to "5" is one
 * tap, not backspace-then-five.
 *
 * Keys use pointerdown + preventDefault so the cell keeps focus (and its
 * caret): the pad is a second way to type, not a second place to type. A
 * hardware keyboard keeps working the whole time, and "abc" hands one cell
 * back to the system keyboard for the rare value that is a word.
 */

import { ArrowLeft, ArrowRight, Delete, Keyboard } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface PadCell {
  machineName: string;
  label: string;
  value: string;
  options?: string[];
  /**
   * Values other clients actually use here that are WORDS or LETTERS ("In",
   * "Out", "D") — the catalog has no options for most legacy fields, and
   * these would otherwise need the system keyboard. One tap each.
   */
  common?: string[];
  /** An offered value for this cell, when there is one. */
  offer?: string | null;
  /** The studio standard, shown for reference only. */
  ghost?: string | null;
}

export interface QuickPadProps {
  cell: PadCell;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onPick: (value: string) => void;
  onClear: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Hand this one cell to the system keyboard. */
  onSystemKeyboard: () => void;
  position: string;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

/** Keep focus where it is: the pad types INTO the active cell. */
const hold = (e: ReactPointerEvent) => e.preventDefault();

export function QuickPad({ cell, onKey, onBackspace, onPick, onClear, onPrev, onNext, onSystemKeyboard, position }: QuickPadProps) {
  const options = cell.options ?? [];
  return (
    <div className="fit-pad" role="group" aria-label={`Keypad for ${cell.machineName}, ${cell.label}`}>
      <div className="fit-pad__context">
        <span className="fit-pad__machine">{cell.machineName}</span>
        <span className="fit-pad__field">
          {cell.label}
          <b>{cell.value || "—"}</b>
        </span>
        <span className="fit-pad__where">
          {position}
          {cell.ghost ? ` · studio standard ${cell.ghost}` : ""}
        </span>
      </div>

      <div className="fit-pad__keys">
        {options.length > 0 ? (
          <div className="fit-pad__options">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                className="fit-pad__key fit-pad__key--option"
                data-on={o === cell.value || undefined}
                onPointerDown={hold}
                onClick={() => onPick(o)}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <div className="fit-pad__digits">
            {(cell.common ?? []).length > 0 ? (
              <div className="fit-pad__common">
                {(cell.common ?? []).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="fit-pad__key fit-pad__key--option"
                    data-on={v === cell.value || undefined}
                    onPointerDown={hold}
                    onClick={() => onPick(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : null}
            {DIGITS.map((d) => (
              <button key={d} type="button" className="fit-pad__key" onPointerDown={hold} onClick={() => onKey(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="fit-pad__key" onPointerDown={hold} onClick={onBackspace} aria-label="Backspace">
              <Delete size={20} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        )}

        <div className="fit-pad__side">
          {cell.offer ? (
            <button type="button" className="fit-pad__key fit-pad__key--offer" onPointerDown={hold} onClick={() => onPick(cell.offer as string)}>
              Use {cell.offer}
            </button>
          ) : null}
          <button type="button" className="fit-pad__key fit-pad__key--quiet" onPointerDown={hold} onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className="fit-pad__key fit-pad__key--quiet"
            onPointerDown={hold}
            onClick={onSystemKeyboard}
            aria-label="Type this one with the keyboard"
          >
            <Keyboard size={18} strokeWidth={2.4} aria-hidden /> abc
          </button>
        </div>

        <div className="fit-pad__nav">
          <button type="button" className="fit-pad__key fit-pad__key--quiet" onPointerDown={hold} onClick={onPrev} aria-label="Previous field">
            <ArrowLeft size={20} strokeWidth={2.6} aria-hidden /> Back
          </button>
          <button type="button" className="fit-pad__key fit-pad__key--next" onPointerDown={hold} onClick={onNext} aria-label="Next field">
            Next <ArrowRight size={20} strokeWidth={2.6} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
