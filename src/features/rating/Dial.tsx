/**
 * THE DIAL — one control for every rating in the app.
 *
 * Reporting round, Sep 2026. See scales.ts for the anchor and the three rules.
 * This file is only the drawing:
 *
 *   ┌ ask ───────────────────────────────── word ┐
 *   │ [  -2  ][  -1  ][  0 ¯ ][  +1  ][  +2  ]   │   ← five equal segments, 48px
 *   │  worse            as usual          better │   ← legend (ends + centre, faint)
 *   └────────────────────────────────────────────┘
 *
 * The bar is a radiogroup. Tapping the chosen segment again clears it back
 * to "not asked" — a correction costs one tap, and no dial can be left
 * saying something the trainer didn't mean. The parent owns the value and
 * decides what a null means (usually: leave the field out of the write).
 *
 * Rendering is pure: no effects, no measurement, nothing that could throw in
 * a layout effect. `Dial.render.test.tsx` mounts it.
 */
import type { DialScale, DialValue } from "./scales";
import { DIAL_VALUES, dialTone, dialWord } from "./scales";
import "./rating.css";

export interface DialProps {
  scale: DialScale;
  value: DialValue | null | undefined;
  onChange: (next: DialValue | null) => void;
  /** Replaces the scale's own question above the bar. */
  ask?: string;
  /** A second, quieter line under the question (e.g. the machine, the region). */
  sub?: string;
  disabled?: boolean;
  /**
   * Which words to show under the bar. Relative scales default to the two
   * ends and the centre; absolute scales show all five.
   */
  legend?: "ends" | "all" | "none";
  compact?: boolean;
  /** Hides the chosen word at the top right (when the parent shows it). */
  hideWord?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function Dial({
  scale,
  value,
  onChange,
  ask,
  sub,
  disabled = false,
  legend,
  compact = false,
  hideWord = false,
  className,
  "data-testid": testId,
}: DialProps) {
  const chosen = value === null || value === undefined ? null : value;
  const legendMode = legend ?? (scale.mode === "absolute" ? "all" : "ends");
  const question = ask ?? scale.ask;

  return (
    <div
      className={["rt", "rt--dial", compact ? "rt--compact" : "", className ?? ""].filter(Boolean).join(" ")}
      data-scale={scale.id}
      data-mode={scale.mode}
      data-testid={testId}
    >
      <div className="rt__head">
        <span className="rt__ask">
          {question}
          {sub ? <small>{sub}</small> : null}
        </span>
        {!hideWord && (
          <span className="rt__word" data-tone={chosen === null ? undefined : dialTone(chosen)} aria-live="polite">
            {dialWord(scale, chosen)}
          </span>
        )}
      </div>

      <div className="rt__bar" role="radiogroup" aria-label={question}>
        {DIAL_VALUES.map((v) => {
          const on = chosen === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${scale.words[v + 2]}${on ? " — tap again to clear" : ""}`}
              className={["rt__seg", v === 0 ? "rt__seg--centre" : ""].filter(Boolean).join(" ")}
              data-pos={v}
              data-tone={dialTone(v)}
              disabled={disabled}
              onClick={() => onChange(on ? null : v)}
            />
          );
        })}
      </div>

      {legendMode !== "none" && (
        <div className="rt__legend" data-all={legendMode === "all"} aria-hidden>
          {DIAL_VALUES.map((v) => {
            const show = legendMode === "all" || v === -2 || v === 0 || v === 2;
            return (
              <span key={v} data-on={chosen === v}>
                {show ? scale.words[v + 2] : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
