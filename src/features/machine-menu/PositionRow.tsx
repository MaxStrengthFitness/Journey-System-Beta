/**
 * THE MACHINE MENU — a dial being changed, inside its own tile.
 *
 * Tapping a tile's number (or "Not set", or Change) turns THAT tile into its
 * editor (the settings card, Oct 10 2026; AJ: "i need to be able to just
 * click on the setting and input the new settings and save and exit", and
 * his "1a 2a 3a"). It opened under all the tiles until then, as a second box
 * with the dial's name and a Done of its own, so the value showed twice and
 * Done was a tap that saved nothing. The tile's label stays above it; there
 * is no Done and no Next.
 *
 *   - ValueEditor: a field the size of the tile's value, with the value
 *     selected so typing replaces it, on the keypad the dial asks for (the
 *     number pad for a number). Every number dial is typed (AJ's "2a"; ± on
 *     the tile still nudge it one step). A word dial adds chips of the values
 *     on this client's record and the studio standard; a chip fills the
 *     field only when it is tapped. Enter goes on to the next empty dial, or
 *     puts the keyboard away on the last.
 *   - PositionRow: a word dial's own options (rule 1), 48×48 buttons 8px
 *     apart, wrapping and never scrolling sideways. The saved one has a ring
 *     and "now" under it; the picked one is filled blue; a pick closes it.
 *     "Studio standard: 6" sits under the row.
 *
 * Typing or picking changes the DRAFT only: nothing is written until Save on
 * the change strip.
 */
import { useEffect, useRef } from "react";
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
}

export function PositionRow({ label, positions, current, saved, standard, kind = "positions", onPick }: PositionRowProps) {
  const now = clean(saved).toLowerCase();
  const picked = clean(current).toLowerCase();
  return (
    <div className="mm-tile__edit" role="group" aria-label={`${label}: ${kind === "options" ? "pick one" : "pick a position"}`} data-editor="positions">
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
  /** Enter: on to the next empty dial, or the keyboard away on the last. */
  onEnter: () => void;
  /** Another dial is still empty, so Enter goes on to it (the iPad's key says Next). */
  hasNext?: boolean;
}

export function ValueEditor({ label, value, keypad, chips = [], onChange, onEnter, hasNext = false }: ValueEditorProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Opened with the value selected, so typing replaces it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <div className="mm-tile__edit" data-editor="field">
      <input
        ref={ref}
        className="mm-field__input mm-tile__input"
        aria-label={label}
        // inputMode over type=number: iPad Safari's spinner is a fingertip
        // hazard, and the number pad is what the trainer wants.
        inputMode={keypad}
        enterKeyHint={hasNext ? "next" : "done"}
        autoComplete="off"
        data-keypad={keypad}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onEnter();
        }}
      />
      {/* Under the field, so a chip appearing or going never moves it under the finger. */}
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
    </div>
  );
}
