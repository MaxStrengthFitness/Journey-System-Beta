/**
 * MACHINE FIT — "Correct the starting weight", one machine's control on the
 * Setup screen (AJ, Oct 4 2026, Q3 (a); the rules and every word are in
 * starting-weight.ts).
 *
 * Shut, it is the number on file and one button. Open, it is − 2 lb, the
 * number (typed, if the change is a long way), + 2 lb, "was 84 lb" once it
 * differs, and Keep 84 lb to put it back. It stays open while it holds a
 * change, so a draft is never hidden. Nothing is written here: the screen's
 * one Save set-up writes it (setup-save.ts).
 */
import { Minus, Plus } from "lucide-react";
import {
  STARTING_WEIGHT_WORDS,
  canStepStart,
  invalidWords,
  keepWords,
  onFileWords,
  startCorrection,
  startLabels,
  stepStart,
} from "./starting-weight";

export interface StartingWeightProps {
  machineName: string;
  /** The starting weight on file. */
  saved: number;
  /** The draft (setup-draft.ts `start`), undefined when untouched. */
  draft: string | undefined;
  open: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
  /** Back to the number on file, and shut. */
  onKeep: () => void;
  /** The box took focus: the docked keypad steps aside (it types into the grid's cells only). */
  onFocus?: () => void;
}

export function StartingWeight({ machineName, saved, draft, open, onOpen, onChange, onKeep, onFocus }: StartingWeightProps) {
  const c = startCorrection(draft, saved);
  const labels = startLabels(machineName);

  if (!open && draft === undefined) {
    return (
      <div className="fit-start" data-open="false">
        <span className="fit-start__onfile">{onFileWords(saved)}</span>
        <button type="button" className="fit-btn fit-btn--quiet fit-start__open" onClick={onOpen} aria-label={labels.open}>
          {STARTING_WEIGHT_WORDS.open}
        </button>
      </div>
    );
  }

  const step = (dir: 1 | -1) => {
    const next = stepStart(c.shown, saved, dir);
    if (next !== null) onChange(next);
  };

  return (
    <div className="fit-start" data-open="true" data-state={c.state}>
      <div className="fit-start__row" role="group" aria-label={labels.group}>
        <span className="fit-start__label">{STARTING_WEIGHT_WORDS.label}</span>
        {/* − box lb + stay together on a narrow row. */}
        <span className="fit-start__stepper">
          <button
            type="button"
            className="fit-step"
            aria-label={labels.down}
            disabled={!canStepStart(c.shown, saved, -1)}
            onClick={() => step(-1)}
          >
            <Minus size={18} strokeWidth={2.6} aria-hidden />
          </button>
          <input
            className="fit-start__input"
            value={c.shown}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            aria-label={labels.input}
            aria-invalid={c.state === "invalid" || undefined}
            data-dirty={c.state !== "same" || undefined}
            onFocus={onFocus}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="fit-start__unit">{STARTING_WEIGHT_WORDS.unit}</span>
          <button
            type="button"
            className="fit-step"
            aria-label={labels.up}
            disabled={!canStepStart(c.shown, saved, 1)}
            onClick={() => step(1)}
          >
            <Plus size={18} strokeWidth={2.6} aria-hidden />
          </button>
        </span>
        {c.was ? <span className="fit-start__was">{c.was}</span> : null}
        <button type="button" className="fit-btn fit-btn--quiet fit-start__keep" onClick={onKeep}>
          {keepWords(saved)}
        </button>
      </div>
      <p className="fit-row__quiet fit-start__line" data-invalid={c.state === "invalid" || undefined}>
        {c.state === "invalid" ? invalidWords(saved) : STARTING_WEIGHT_WORDS.why}
      </p>
    </div>
  );
}
