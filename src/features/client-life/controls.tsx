/**
 * THE LIFE EDITORS' TWO CONTROLS — one choice, and a set of chips.
 *
 * Client codex, Sep 2026. Moved out of LifeBaseline.tsx (they were `Seg` and
 * `ChipSet`) and rebuilt on the codex kit's pick pills, so the Work, Recreation
 * and Experience editors look and behave like every other editor on Notes &
 * Profile: 40px pills (48px with a hint line), 14px words, the brand-blue
 * pressed state.
 *
 * The behaviour is the old controls', kept:
 *  - `PickGroup`: one choice. Tapping the chosen pill again clears it —
 *    nothing is assessed until someone says so.
 *  - `ChipPicks`: any number. With `allowCustom`, a trainer may add their own
 *    ("tai chi"), up to 40 characters, and the list holds at most 24. A
 *    custom one is a pill like the rest; tapping it takes it off. The list
 *    keeps the order it was saved in — a new pick goes on the end — so a
 *    chip tapped on and off again leaves the field exactly as it was (the
 *    Save bar compares arrays in order) and the recreation line still reads
 *    as it was entered.
 *
 * Both write only through their `onChange` — the record's one form — and the
 * Save bar saves.
 */
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Btn, MultiPicks, Picks, type FieldOption } from "../client-codex/kit";

/** A custom chip's longest wording. */
export const CUSTOM_CHIP_MAX = 40;
/** The most chips a list holds. */
export const CHIP_LIST_MAX = 24;

export function PickGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string; hint?: string }[];
  value: T | "" | null | undefined;
  /** The new choice, or "" when the chosen pill was tapped again. */
  onChange: (next: T | "") => void;
  disabled?: boolean;
}) {
  return (
    <Picks
      label={label}
      options={options as readonly FieldOption[]}
      value={value ?? ""}
      allowClear
      disabled={disabled}
      onChange={(next) => onChange(next as T | "")}
    />
  );
}

export function ChipPicks({
  label,
  choices,
  value,
  onChange,
  allowCustom = false,
  disabled,
}: {
  label: string;
  choices: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const clean = draft.trim().replace(/\s+/g, " ");
  const add = () => {
    if (clean && !value.includes(clean)) onChange([...value, clean].slice(0, CHIP_LIST_MAX));
    setDraft("");
  };
  // The kit hands back its pills' order; keep the saved order instead: drop
  // what was taken off, and put what was tapped on at the end.
  const pick = (picked: string[]) => {
    const now = new Set(picked);
    onChange([...value.filter((v) => now.has(v)), ...picked.filter((v) => !value.includes(v))]);
  };
  return (
    <div className="clf-chips">
      <MultiPicks
        label={label}
        options={choices.map((c) => ({ value: c, label: c }))}
        value={value}
        disabled={disabled}
        onChange={pick}
      />
      {allowCustom ? (
        <div className="clf-add">
          <label className="clf-add__label" htmlFor={inputId}>
            Something else
          </label>
          <div className="clf-add__row">
            <input
              id={inputId}
              className="cx-input clf-add__input"
              value={draft}
              maxLength={CUSTOM_CHIP_MAX}
              placeholder="e.g. Tai chi"
              autoComplete="off"
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Btn icon={Plus} onClick={add} disabled={disabled || !clean} aria-label={`Add to ${label}`}>
              Add
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
