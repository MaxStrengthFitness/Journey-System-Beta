/**
 * Small touch-first controls shared by the Pulse form and the dashboard.
 * Nothing here knows about Firestore or the report; everything is
 * value + onChange.
 *
 * Reporting round (Sep 2026): every rating here is the Dial from
 * features/rating. A statement is answered on the document's five frequency
 * words (stored at the 0–10 anchors scoring already uses); pain and stress
 * intensity on Worst → None. Nothing a trainer rates is shown as a number.
 */
import React from "react";
import type { Rag } from "./types";
import { SCALE_ANCHORS } from "./questions";
import { ragForDaysPerWeek } from "./scoring";
import { Dial, FREQUENCY_SCALE, INTENSITY_SCALE, absoluteToTen, dialWord, tenToAbsolute } from "../rating";

/* ---------- Status ---------------------------------------------------- */

export const RAG_LABEL: Record<Rag, string> = {
  green: "Green",
  yellow: "Yellow",
  red: "Red",
};

export function RagPill({
  status,
  label,
  size,
}: {
  status: Rag | "watch" | null;
  label?: string;
  size?: "lg";
}) {
  const cls = status ?? "none";
  const text = label ?? (status && status !== "watch" ? RAG_LABEL[status] : status === "watch" ? "Watch" : "Not scored");
  return (
    <span className={`sr-pill sr-pill--${cls}${size === "lg" ? " sr-pill--lg" : ""}`}>
      {text}
    </span>
  );
}

/**
 * "+12", "−8", "±0" — change since last time, coloured. `invert` flips the
 * colours for numbers where up is bad (pain severity).
 */
export function Delta({
  value,
  suffix = "",
  invert = false,
}: {
  value: number | null;
  suffix?: string;
  invert?: boolean;
}) {
  if (value === null) return <span className="sr-delta sr-delta--flat">—</span>;
  const good = invert ? value < 0 : value > 0;
  const dir = value === 0 ? "flat" : good ? "up" : "down";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return (
    <span className={`sr-delta sr-delta--${dir}`}>
      {sign}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

/* ---------- A statement on the Dial ---------------------------------- */

/** Nearest frequency word for a stored 0–10 value: 7 → "Often". */
export function scaleWord(value: number | null): string {
  if (value === null) return "";
  return SCALE_ANCHORS.reduce((best, a) =>
    Math.abs(a.value - value) < Math.abs(best.value - value) ? a : best,
  ).label;
}

/** Nearest intensity word for a stored 0–10 severity (10 = worst): 7 → "Severe". */
export function intensityWord(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return dialWord(INTENSITY_SCALE, tenToAbsolute(value, INTENSITY_SCALE));
}

/**
 * One statement of the Pulse: the statement is the question, the five
 * frequency words are the answer. `value` is the stored 0–10 (null = not
 * asked); a tap stores the word's anchor, a second tap on the same word
 * clears it. The old 0…10 grid (eleven buttons per statement, 264 on one
 * screen) is gone; scoring never moved because the anchors are the same.
 */
export function ScaleInput({
  value,
  onChange,
  ariaLabel,
  sub,
  compact,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  /** The statement text — it is the question the Dial asks. */
  ariaLabel: string;
  /** A quieter second line under the statement (optional). */
  sub?: string;
  compact?: boolean;
}) {
  return (
    <Dial
      scale={FREQUENCY_SCALE}
      ask={ariaLabel}
      sub={sub}
      value={tenToAbsolute(value)}
      onChange={(v) => onChange(v === null ? null : absoluteToTen(v))}
      compact={compact}
      legend="all"
    />
  );
}

/* ---------- Days per week -------------------------------------------- */

export function DaysPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="sr-days" role="radiogroup" aria-label={ariaLabel}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => {
          const on = value === d;
          const rag = ragForDaysPerWeek(d);
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : d)}
              className={`sr-days__btn${on ? ` sr-days__btn--on sr-days__btn--${rag}` : ""}`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="sr-days__legend" aria-hidden="true">
        <span><i style={{ background: "var(--sr-red)" }} />0–1 Red</span>
        <span><i style={{ background: "var(--sr-yellow)" }} />2–4 Yellow</span>
        <span><i style={{ background: "var(--sr-green)" }} />5–7 Green</span>
      </div>
    </div>
  );
}

/* ---------- Number stepper ------------------------------------------- */

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  ariaLabel,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  ariaLabel: string;
  placeholder?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const bump = (dir: 1 | -1) => onChange(clamp((value ?? min) + dir * step));
  return (
    <div className="sr-stepper">
      <button type="button" aria-label={`${ariaLabel}: less`} onClick={() => bump(-1)}>
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : clamp(parseFloat(raw)));
        }}
      />
      <button type="button" aria-label={`${ariaLabel}: more`} onClick={() => bump(1)}>
        +
      </button>
      {unit && <span className="sr-stepper__unit">{unit}</span>}
    </div>
  );
}

/* ---------- Intensity (pain severity, stress) on the Dial ------------ */

/**
 * Pain severity and stress intensity, stored 0–10 with 10 the worst. On
 * screen it is the Dial's Worst · Severe · Moderate · Mild · None (worst on
 * the left, like every Dial); `absoluteToTen` reverses the stored number.
 * A cleared Dial hands back null — the caller decides whether its field can
 * hold that (overall stress can; a pain point's severity cannot).
 */
export function Range10({
  value,
  onChange,
  ariaLabel,
  sub,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  ariaLabel: string;
  sub?: string;
}) {
  return (
    <Dial
      scale={INTENSITY_SCALE}
      ask={ariaLabel}
      sub={sub}
      value={tenToAbsolute(value, INTENSITY_SCALE)}
      onChange={(v) => onChange(v === null ? null : absoluteToTen(v, INTENSITY_SCALE))}
      legend="all"
    />
  );
}

/* ---------- Chips / segmented / switch ------------------------------- */

export function Chip({
  on,
  onClick,
  children,
  hero,
  small,
}: {
  /** Declared explicitly: no @types/react in this repo, so JSX does not
   *  supply `key` through IntrinsicAttributes (house convention). */
  key?: string | number;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  hero?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={[
        "sr-chip",
        on ? "sr-chip--on" : "",
        hero ? "sr-chip--hero" : "",
        small ? "sr-chip--sm" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="sr-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "sr-seg--on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`sr-switch${on ? " sr-switch--on" : ""}`}
      onClick={() => onChange(!on)}
    />
  );
}

/* ---------- Card chrome ---------------------------------------------- */

export function Card({
  title,
  prompt,
  help,
  status,
  right,
  wide,
  children,
}: {
  title: string;
  prompt?: string;
  /** Plain-language "what to fill in and why" for the trainer. */
  help?: string;
  status?: Rag | null;
  right?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "sr-card",
        status ? `sr-card--${status}` : "",
        wide ? "sr-card--wide" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="sr-card__head">
        <div>
          <h3 className="sr-card__title">{title}</h3>
          {prompt && <p className="sr-card__prompt">“{prompt}”</p>}
        </div>
        {right}
      </div>
      {help && <p className="sr-card__help sr-no-print">{help}</p>}
      {children}
    </section>
  );
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
