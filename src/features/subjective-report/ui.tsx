/**
 * Small touch-first controls shared by the check-in form and the dashboard.
 * Nothing here knows about Firestore or the report; everything is
 * value + onChange.
 */
import React from "react";
import type { Rag } from "./types";
import { SCALE_ANCHORS, SCALE_MAX } from "./questions";
import { ragForDaysPerWeek, ragForFraction } from "./scoring";

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

/** "+12", "−8", "±0" — change since last time, coloured. */
export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="sr-delta sr-delta--flat">—</span>;
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return (
    <span className={`sr-delta sr-delta--${dir}`}>
      {sign}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

/* ---------- The 0–10 scale ------------------------------------------- */

/** Nearest frequency word for a value: 7 → "Often". */
export function scaleWord(value: number | null): string {
  if (value === null) return "";
  return SCALE_ANCHORS.reduce((best, a) =>
    Math.abs(a.value - value) < Math.abs(best.value - value) ? a : best,
  ).label;
}

export function ScaleInput({
  value,
  onChange,
  anchorLow,
  anchorHigh,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  anchorLow: string;
  anchorHigh: string;
  ariaLabel: string;
}) {
  const rag = value === null ? null : ragForFraction(value / SCALE_MAX);
  return (
    <div>
      <div className="sr-scale" role="radiogroup" aria-label={ariaLabel}>
        {Array.from({ length: SCALE_MAX + 1 }, (_, i) => i).map((i) => {
          const on = value === i;
          const lit = value !== null && i < value;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${i}`}
              onClick={() => onChange(on ? null : i)}
              className={[
                "sr-scale__btn",
                lit ? "sr-scale__btn--lit" : "",
                on ? "sr-scale__btn--on" : "",
                on && rag ? `sr-scale__btn--${rag}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {i}
            </button>
          );
        })}
      </div>
      <div className="sr-scale__anchors">
        <span>0 · {anchorLow}</span>
        <span>{anchorHigh} · 10</span>
      </div>
    </div>
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

/* ---------- Range 0–10 ----------------------------------------------- */

export function Range10({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="sr-range">
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      />
      <span className="sr-range__val">{value}</span>
    </div>
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
