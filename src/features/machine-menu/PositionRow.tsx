/**
 * THE MACHINE MENU — a big jump on one dial.
 *
 * Tapping a tile's number (or "Not set", or Change) opens one of these under
 * the tiles, for one dial at a time (machine menu design §C, "Settings:
 * changing Seat 4 → 5"):
 *
 *   - PositionRow: a row of 48×48 position buttons, 8px apart, wrapping and
 *     never scrolling sideways, when the dial's rule gives 12 or fewer of
 *     them (dial-control.ts) — or the field's own options (8 or fewer). The
 *     saved position has a ring and "now" under it; the picked one is filled
 *     blue. "Studio standard: 6" sits under the row.
 *   - ValueEditor: otherwise, a 52px field with the value selected and the
 *     keypad the dial asks for; a word dial adds chips of the values on this
 *     client's record and the studio standard. A chip fills the field only
 *     when it is tapped.
 *
 * Picking changes the DRAFT only: nothing is written until Save on the
 * change strip. Done closes the row.
 */
import { useEffect, useId, useRef } from "react";
import type { WordChip } from "./dial-control";
import "./machine-menu.css";

const clean = (v: string | null | undefined) => (v ?? "").trim();

export interface PositionRowProps {
  label: string;
  /** The positions (or the field's options), in order. */
  positions: readonly string[];
  /** What the tile shows now (the draft). */
  current: string | null | undefined;
  /** What is saved: ringed, with "now" under it. */
  saved: string | null | undefined;
  /** The studio standard, said under the row; null for none. */
  standard: string | null;
  /** "pick a position", or for the field's own options "pick one". */
  kind?: "positions" | "options";
  onPick: (value: string) => void;
  onDone: () => void;
}

export function PositionRow({ label, positions, current, saved, standard, kind = "positions", onPick, onDone }: PositionRowProps) {
  const titleId = useId();
  const now = clean(saved).toLowerCase();
  const picked = clean(current).toLowerCase();
  return (
    <div className="mm-pos" role="group" aria-labelledby={titleId} data-editor="positions">
      <div className="mm-pos__head">
        <span className="mm-pos__title" id={titleId}>
          {label}: {kind === "options" ? "pick one" : "pick a position"}
        </span>
        <button type="button" className="mm-btn" onClick={onDone}>
          Done
        </button>
      </div>
      <div className="mm-pos__btns">
        {positions.map((p) => {
          const isNow = clean(p).toLowerCase() === now && now !== "";
          const isPicked = clean(p).toLowerCase() === picked && picked !== "";
          return (
            <span className="mm-pos__item" key={p}>
              <button
                type="button"
                className={kind === "options" ? "mm-opt" : "mm-pos__btn"}
                data-now={isNow ? "true" : undefined}
                aria-pressed={isPicked}
                aria-label={`${label} ${p}${isNow ? ", saved now" : ""}`}
                onClick={() => onPick(p)}
              >
                {p}
              </button>
              <span className="mm-pos__now">{isNow ? "now" : ""}</span>
            </span>
          );
        })}
      </div>
      {standard ? <p className="mm-pos__std">Studio standard: {standard}</p> : null}
    </div>
  );
}

export interface ValueEditorProps {
  label: string;
  value: string;
  /** "decimal" brings up the number pad on an iPad. */
  keypad: "decimal" | "text";
  /** A word dial's chips: the values on the client's record, and the standard. */
  chips?: readonly WordChip[];
  onChange: (value: string) => void;
  onDone: () => void;
}

export function ValueEditor({ label, value, keypad, chips = [], onChange, onDone }: ValueEditorProps) {
  const inputId = useId();
  const ref = useRef<HTMLInputElement | null>(null);
  // Opened with the value selected, so typing replaces it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <div className="mm-pos" data-editor="field">
      <div className="mm-pos__head">
        <label className="mm-pos__title" htmlFor={inputId}>
          {label}
        </label>
        <button type="button" className="mm-btn" onClick={onDone}>
          Done
        </button>
      </div>
      {chips.length > 0 ? (
        <div className="mm-choices" role="group" aria-label={`${label}: values on the record`}>
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              className="mm-choice"
              aria-pressed={clean(c.value).toLowerCase() === clean(value).toLowerCase()}
              onClick={() => onChange(c.value)}
            >
              {c.value}
              {c.standard ? " · studio standard" : ""}
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className="mm-field__input"
        // inputMode over type=number: iPad Safari's spinner is a fingertip
        // hazard, and the number pad is what the trainer wants.
        inputMode={keypad}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
