/**
 * The codex's inputs — text, long text, a select, and pick pills.
 *
 * Client codex, Sep 2026. They replace the record's old DossierPrimitives
 * inputs (which carried a raw colour for their focus ring) with the kit's
 * tokens: 14px words, a 12px label above, 40px or taller, the brand-blue focus
 * ring. They are controlled and report the new value only — every one of them
 * writes through the shell's record form (`form.updateField`), and the Save
 * bar saves.
 *
 * These are for sentences (a job title, a goal, a medical note), so none of
 * them takes the name-search props some of the app's inputs carry.
 *
 * The <label> holds the label's words and nothing else, so it is the control's
 * short name; the hint sits beside it as the control's description
 * (aria-describedby). A hint inside the label would be read twice by
 * VoiceOver — once in the name, once as the description.
 */
import { useId, type ReactNode } from "react";
import { cls } from "./primitives";

interface FieldBase {
  label: string;
  /** A quiet line under the field: what goes here, or where it shows. */
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function asText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** One line of text. */
export function TextInput({
  label,
  hint,
  placeholder,
  disabled,
  className,
  value,
  onChange,
  type = "text",
  inputMode,
  list,
  maxLength,
  autoComplete = "off",
  onBlur,
}: FieldBase & {
  value: string | number | null | undefined;
  onChange: (next: string) => void;
  /** When the field loses focus, with what it holds (a caller may tidy it, e.g. trim). */
  onBlur?: (value: string) => void;
  type?: "text" | "email" | "tel" | "number" | "date" | "url";
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url";
  /** The id of a <datalist> of suggestions. */
  list?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cls("cx-field", className)}>
      <label className="cx-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="cx-input"
        type={type}
        inputMode={inputMode}
        value={asText(value)}
        placeholder={placeholder}
        disabled={disabled}
        list={list}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      />
      {hint ? (
        <span className="cx-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Several lines of text. */
export function TextArea({
  label,
  hint,
  placeholder,
  disabled,
  className,
  value,
  onChange,
  rows = 3,
  maxLength,
}: FieldBase & {
  value: string | null | undefined;
  onChange: (next: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cls("cx-field", className)}>
      <label className="cx-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="cx-textarea"
        rows={rows}
        value={asText(value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <span className="cx-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export interface FieldOption {
  value: string;
  label: string;
  /** A second, quieter line on a pick pill (it makes the pill 48px tall). */
  hint?: string;
}

/** A native select — for a long list. A short one reads better as Picks. */
export function SelectInput({
  label,
  hint,
  placeholder,
  disabled,
  className,
  value,
  onChange,
  options,
}: FieldBase & {
  value: string | null | undefined;
  onChange: (next: string) => void;
  options: readonly FieldOption[];
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const current = asText(value);
  // A stored value the list no longer offers is still shown, not silently
  // replaced by the first option.
  const known = current === "" || options.some((o) => o.value === current);
  return (
    <div className={cls("cx-field", className)}>
      <label className="cx-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="cx-select"
        value={current}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? "Not set"}</option>
        {!known ? <option value={current}>{current}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span className="cx-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One pick pill: a toggle button (aria-pressed), 40px, or 48px with a hint
 * line. For a custom row of picks; `Picks` builds the usual one.
 */
export function Pick({
  pressed,
  onClick,
  hint,
  disabled,
  className,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cls("cx-pick", className)}
      aria-pressed={pressed}
      data-tall={hint ? "" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{children}</span>
      {hint ? <span className="cx-pick__hint">{hint}</span> : null}
    </button>
  );
}

interface PickGroupBase {
  label: string;
  options: readonly FieldOption[];
  disabled?: boolean;
  className?: string;
}

/**
 * The pills a group shows: the options, then any stored value the options no
 * longer offer, as a pill of its own. A list being reworded must never quietly
 * delete what a trainer saved against the old wording.
 */
function shownOptions(options: readonly FieldOption[], chosen: ReadonlySet<string>): FieldOption[] {
  const offered = new Set(options.map((o) => o.value));
  const kept = [...chosen].filter((v) => !offered.has(v));
  return [...options, ...kept.map((v) => ({ value: v, label: v }))];
}

function PickGroup({
  label,
  shown,
  chosen,
  disabled,
  className,
  onTap,
}: {
  label: string;
  shown: readonly FieldOption[];
  chosen: ReadonlySet<string>;
  disabled?: boolean;
  className?: string;
  onTap: (value: string) => void;
}) {
  const labelId = useId();
  return (
    <div className={cls("cx-picks", className)} role="group" aria-labelledby={labelId}>
      <span className="cx-picks__label" id={labelId}>
        {label}
      </span>
      <div className="cx-picks__list">
        {shown.map((o) => (
          <Pick key={o.value} pressed={chosen.has(o.value)} hint={o.hint} disabled={disabled} onClick={() => onTap(o.value)}>
            {o.label}
          </Pick>
        ))}
      </div>
    </div>
  );
}

/** A labelled group of pick pills: one choice. */
export function Picks({
  label,
  options,
  disabled,
  className,
  value,
  onChange,
  allowClear = false,
}: PickGroupBase & {
  value: string | null | undefined;
  onChange: (next: string) => void;
  /** Tapping the chosen pill again clears it (onChange("")). */
  allowClear?: boolean;
}) {
  const chosen = new Set<string>(value ? [value] : []);
  const tap = (next: string) => {
    if (chosen.has(next)) {
      if (allowClear) onChange("");
      return;
    }
    onChange(next);
  };
  return (
    <PickGroup
      label={label}
      shown={shownOptions(options, chosen)}
      chosen={chosen}
      disabled={disabled}
      className={className}
      onTap={tap}
    />
  );
}

/**
 * A labelled group of pick pills: any number of choices. They come back in
 * the pills' order, whatever order they were tapped in.
 */
export function MultiPicks({
  label,
  options,
  disabled,
  className,
  value,
  onChange,
}: PickGroupBase & {
  value: readonly string[] | null | undefined;
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set<string>(value ?? []);
  const shown = shownOptions(options, chosen);
  const tap = (tapped: string) => {
    const next = new Set(chosen);
    if (next.has(tapped)) next.delete(tapped);
    else next.add(tapped);
    onChange(shown.map((o) => o.value).filter((v) => next.has(v)));
  };
  return (
    <PickGroup label={label} shown={shown} chosen={chosen} disabled={disabled} className={className} onTap={tap} />
  );
}
