/**
 * LOUDNESS — how loud a note is, the same everywhere a note is written.
 *
 * Reporting round, Sep 2026. A note is not bipolar: it is filed, or it
 * shouts. The journal already stored exactly three importances
 * (standard / elevated / critical); the closing note on the post-session
 * screen (Low / Medium / High) and the 4 P's (red / black / green) had gone
 * their own way. This is one component and one set of words for all of it:
 *
 *   Note      — filed. In the record, found by category.
 *   Heads up  — rises to the top of the record and shows on the briefing
 *               while it still matters (three weeks, or its "until" date).
 *   Critical  — pinned, on the briefing, and marks the Hub card.
 *
 * Same bar as the Dial (three equal segments, 48px, words inside because
 * three words fit), same urgency colours as the Dial's left side, so "how
 * urgent" reads the same on every screen. Nothing is pre-selected by the
 * component; the parent decides the default (a closing note starts at Note).
 */
import { IMPORTANCE_META, type JournalImportance } from "../../types/journal";
import "./rating.css";

export const LOUDNESS_LEVELS: readonly JournalImportance[] = ["standard", "elevated", "critical"] as const;

/**
 * The one Loudness colour mapping: Note is quiet, Heads up is plum
 * (`--eq-warn`), Critical is crimson (`--eq-alert`). Exported so a chip that
 * SHOWS a note's loudness (the client codex's LoudChip) draws the same colour
 * as the control that set it, instead of a second mapping that drifts.
 */
export type LoudnessTone = "quiet" | "warn" | "alert";

export const LOUDNESS_TONE: Readonly<Record<JournalImportance, LoudnessTone>> = {
  standard: "quiet",
  elevated: "warn",
  critical: "alert",
};

export interface LoudnessProps {
  value: JournalImportance | null | undefined;
  onChange: (next: JournalImportance) => void;
  /** Defaults to "How loud?". */
  ask?: string;
  /** Show IMPORTANCE_META's hint for the chosen level under the bar. */
  hint?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function Loudness({ value, onChange, ask = "How loud?", hint = true, disabled = false, compact = false, className }: LoudnessProps) {
  return (
    <div className={["rt", "rt--loud", compact ? "rt--compact" : "", className ?? ""].filter(Boolean).join(" ")}>
      <div className="rt__head">
        <span className="rt__ask">{ask}</span>
      </div>
      <div className="rt__bar" role="radiogroup" aria-label={ask}>
        {LOUDNESS_LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            role="radio"
            aria-checked={value === lvl}
            className="rt__seg"
            data-tone={LOUDNESS_TONE[lvl]}
            disabled={disabled}
            onClick={() => onChange(lvl)}
          >
            {IMPORTANCE_META[lvl].short}
          </button>
        ))}
      </div>
      {hint && value ? <span className="rt__hint">{IMPORTANCE_META[value].hint}</span> : null}
    </div>
  );
}
