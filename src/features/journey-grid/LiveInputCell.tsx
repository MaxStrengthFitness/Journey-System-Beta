import { memo, useCallback } from "react";
import { Minus, Plus, Timer, Check, Star } from "lucide-react";
import type { LiveSet, RepQuality } from "./types";

interface LiveInputCellProps {
  machineId: string;
  machineName: string;
  /** Unilateral machine: Left and Right get their own reps + quality. */
  sides?: boolean;
  value: LiveSet;
  /** Pre-fill when the trainer hasn't touched the weight yet. */
  prescribedWeight?: number;
  step: number;
  isFocus: boolean;
  onChange: (machineId: string, patch: Partial<LiveSet>) => void;
  onFocus?: (machineId: string) => void;
}

/**
 * Today's input cell — the far-right column of the Active Session grid.
 *
 * Reading order mirrors the set itself: confirm the load, perform, record the
 * outcome (reps or TUT), then rate the quality. Every control is ≥ 34px tall
 * and the inputs are 16px+ so iOS never zooms the page on focus.
 */
function LiveInputCellImpl({
  machineId,
  machineName,
  sides = false,
  value,
  prescribedWeight,
  step,
  isFocus,
  onChange,
  onFocus,
}: LiveInputCellProps) {
  const weight = value.weight ?? prescribedWeight ?? null;

  const bump = useCallback(
    (dir: 1 | -1) => {
      const base = weight ?? 0;
      onChange(machineId, { weight: Math.max(0, base + dir * step) });
      onFocus?.(machineId);
    },
    [weight, step, machineId, onChange, onFocus],
  );

  const parseNum = (raw: string): number | null => {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return raw.trim() === "" || Number.isNaN(n) ? null : n;
  };

  const setQuality = (q: RepQuality, side: "L" | "R" = "L") => {
    if (side === "R") onChange(machineId, { qualityR: value.qualityR === q ? null : q });
    else onChange(machineId, { quality: value.quality === q ? null : q });
    onFocus?.(machineId);
  };

  const outcome = (side: "L" | "R") => {
    const reps = side === "R" ? value.repsR : value.reps;
    const secs = side === "R" ? value.secondsR : value.seconds;
    const q = side === "R" ? value.qualityR : value.quality;
    return (
      <>
        <div className="jg-reps">
          {sides && (
            <span className="jg-reps__side" aria-hidden="true">
              {side}
            </span>
          )}
          <input
            className="jg-reps__input"
            type="text"
            inputMode="numeric"
            aria-label={`${sides ? (side === "R" ? "Right side " : "Left side ") : ""}${value.isTSC ? "seconds under tension" : "reps to failure"}`}
            placeholder={value.isTSC ? "sec" : "reps"}
            value={value.isTSC ? (secs ?? "") : (reps ?? "")}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              if (side === "R") onChange(machineId, value.isTSC ? { secondsR: n } : { repsR: n });
              else onChange(machineId, value.isTSC ? { seconds: n } : { reps: n });
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          {side === "L" && (
            <button
              type="button"
              className={`jg-reps__mode ${value.isTSC ? "is-on" : ""}`}
              aria-pressed={value.isTSC}
              aria-label="Log as timed static contraction"
              onClick={() => onChange(machineId, { isTSC: !value.isTSC })}
            >
              <Timer size={13} strokeWidth={2.5} />
              TSC
            </button>
          )}
        </div>
        <div className="jg-quality" role="radiogroup" aria-label={`${sides ? (side === "R" ? "Right " : "Left ") : ""}rep quality`}>
          <button type="button" className={`jg-quality__btn ${q === 1 ? "is-on" : ""}`} data-q="1" role="radio" aria-checked={q === 1} onClick={() => setQuality(1, side)}>
            Poor
          </button>
          <button type="button" className={`jg-quality__btn ${q === 2 ? "is-on" : ""}`} data-q="2" role="radio" aria-checked={q === 2} onClick={() => setQuality(2, side)}>
            <Check size={12} strokeWidth={3} />
            Done
          </button>
          <button type="button" className={`jg-quality__btn ${q === 3 ? "is-on" : ""}`} data-q="3" role="radio" aria-checked={q === 3} onClick={() => setQuality(3, side)}>
            <Star size={12} strokeWidth={2.5} fill="currentColor" />
            Max
          </button>
        </div>
      </>
    );
  };

  return (
    <div
      className="jg-live"
      role="gridcell"
      aria-label={`${machineName}, today${isFocus ? " (current machine)" : ""}`}
      aria-current={isFocus ? "step" : undefined}
      onPointerDown={() => onFocus?.(machineId)}
    >
      {/* 1 · load */}
      <div className="jg-stepper">
        <button
          type="button"
          className="jg-stepper__btn"
          aria-label={`Decrease weight by ${step}`}
          onClick={() => bump(-1)}
        >
          <Minus size={16} strokeWidth={2.5} />
        </button>
        <input
          className="jg-stepper__val"
          type="text"
          inputMode="decimal"
          aria-label="Weight in pounds"
          value={weight ?? ""}
          placeholder="lb"
          onChange={(e) => onChange(machineId, { weight: parseNum(e.target.value) })}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="jg-stepper__btn"
          aria-label={`Increase weight by ${step}`}
          onClick={() => bump(1)}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* 2 · outcome + 3 · quality (once per side for unilateral machines) */}
      {outcome("L")}
      {sides && outcome("R")}
    </div>
  );
}

export const LiveInputCell = memo(LiveInputCellImpl);
