/**
 * THE MATTERING PICKER — "When does this matter?" on a note.
 *
 * Operations overhaul, Sep 2026. Three chips for the three shapes in
 * `mattering.ts`, then only the dates that shape needs:
 *
 *   Always          Starts mattering on [today ▾]   — blank until = matters
 *                   until someone says it no longer does (a critical note's
 *                   default). Reviewed after 60 days.
 *   From – until    Starts [date]  Stops [date]
 *   Only on a day   On [date]   [ ] Every year      — birthdays, anniversaries.
 *
 * One component wherever a note is written (the composer; the closing note
 * on the post-session screen keeps its single "until" for now), so the
 * vocabulary is the same everywhere. Nothing here is required: a note with
 * nothing picked is an ALWAYS note that started today.
 */
import type { MatteringChoice, MatteringShape } from "./mattering";

export interface MatteringPickerProps {
  value: MatteringChoice;
  onChange: (next: MatteringChoice) => void;
  /** Tight spacing inside the in-session sheet. */
  compact?: boolean;
  disabled?: boolean;
}

const SHAPES: Array<{ id: MatteringShape; label: string }> = [
  { id: "always", label: "Always" },
  { id: "range", label: "From – until" },
  { id: "day", label: "Only on a day" },
];

export const EMPTY_MATTERING: MatteringChoice = { shape: "always", from: "", until: "", repeat: false };

export function MatteringPicker({ value, onChange, compact = false, disabled = false }: MatteringPickerProps) {
  const set = (patch: Partial<MatteringChoice>) => onChange({ ...value, ...patch });
  return (
    <div className="nc-matters" data-compact={compact ? "true" : undefined}>
      <span className="nc-kicker">When does this matter?</span>
      <div className="nc-chips" role="group" aria-label="When does this matter">
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="nc-chip nc-chip--small"
            aria-pressed={value.shape === s.id}
            disabled={disabled}
            onClick={() => set({ shape: s.id, repeat: s.id === "day" ? value.repeat : false })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {value.shape === "always" && (
        <div className="nc-matters__row">
          <label className="nc-matters__field">
            <span className="nc-kicker">Starts mattering on</span>
            <input type="date" className="nc-input" value={value.from} aria-label="Starts mattering on" disabled={disabled} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <span className="nc-muted text-[11px]">Blank means today. It keeps mattering until someone marks it as no longer mattering — and comes up for review after 60 days.</span>
        </div>
      )}

      {value.shape === "range" && (
        <div className="nc-matters__row nc-matters__row--two">
          <label className="nc-matters__field">
            <span className="nc-kicker">Starts mattering on</span>
            <input type="date" className="nc-input" value={value.from} aria-label="Starts mattering on" disabled={disabled} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="nc-matters__field">
            <span className="nc-kicker">Stops mattering on</span>
            <input type="date" className="nc-input" value={value.until} aria-label="Stops mattering on" disabled={disabled} onChange={(e) => set({ until: e.target.value })} />
          </label>
          <span className="nc-muted text-[11px]">Blank start means today. After the last day it stops showing on the briefing.</span>
        </div>
      )}

      {value.shape === "day" && (
        <div className="nc-matters__row nc-matters__row--two">
          <label className="nc-matters__field">
            <span className="nc-kicker">Only matters on</span>
            <input type="date" className="nc-input" value={value.from} aria-label="Only matters on" disabled={disabled} onChange={(e) => set({ from: e.target.value, until: e.target.value })} />
          </label>
          <label className="nc-matters__field nc-matters__check">
            <input type="checkbox" checked={value.repeat} disabled={disabled} onChange={(e) => set({ repeat: e.target.checked })} />
            <span>Every year</span>
          </label>
          <span className="nc-muted text-[11px]">A birthday, an anniversary, a date that needs remembering. It shows on that day only.</span>
        </div>
      )}
    </div>
  );
}
