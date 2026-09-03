import { memo, useCallback } from "react";
import { Minus, Plus, Timer, Star } from "lucide-react";
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
 * outcome (reps or TUT). Quality is exception-only — recording an effort
 * completes the set, and the two buttons are for the sets that were not
 * ordinary. Every control is ≥ 44px tall
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
    const logged = (value.isTSC ? secs : reps) !== null && (value.isTSC ? secs : reps) !== undefined;
    return (
      <div className="jg-outcome-group">
        <div className={`jg-outcome ${logged ? "is-logged" : ""}`}>
          {sides && (
            <span className="jg-reps__side" aria-hidden="true">
              {side}
            </span>
          )}
          <input
            className="jg-outcome__input"
            type="text"
            inputMode="numeric"
            aria-label={`${sides ? (side === "R" ? "Right side " : "Left side ") : ""}${value.isTSC ? "seconds under tension" : "reps to failure"}`}
            placeholder="0"
            value={value.isTSC ? (secs ?? "") : (reps ?? "")}
            onChange={(e) => {
              const n = parseNum(e.target.value);
              if (side === "R") onChange(machineId, value.isTSC ? { secondsR: n } : { repsR: n });
              else onChange(machineId, value.isTSC ? { seconds: n } : { reps: n });
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          {side === "L" ? (
            <button
              type="button"
              className="jg-outcome__unit"
              aria-pressed={value.isTSC}
              aria-label={
                value.isTSC
                  ? "Logging seconds under tension. Switch to reps."
                  : "Logging reps to failure. Switch to seconds under tension."
              }
              onClick={() => onChange(machineId, { isTSC: !value.isTSC })}
            >
              <Timer size={12} strokeWidth={2.5} aria-hidden="true" />
              {value.isTSC ? "SEC" : "REPS"}
            </button>
          ) : (
            <span className="jg-outcome__unit is-static" aria-hidden="true">
              {value.isTSC ? "SEC" : "REPS"}
            </span>
          )}
        </div>
        <div className="jg-quality" role="group" aria-label={`${sides ? (side === "R" ? "Right " : "Left ") : ""}rep quality`}>
          <button type="button" className={`jg-quality__btn ${q === 1 ? "is-on" : ""}`} data-q="1" aria-pressed={q === 1} onClick={() => setQuality(1, side)}>
            <span className="jg-quality__ico" aria-hidden="true">◐</span>
            <span className="jg-sr">Poor quality</span>
          </button>
          <button type="button" className={`jg-quality__btn ${q === 3 ? "is-on" : ""}`} data-q="3" aria-pressed={q === 3} onClick={() => setQuality(3, side)}>
            <Star size={16} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
            <span className="jg-sr">Max strength</span>
          </button>
        </div>
      </div>
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
