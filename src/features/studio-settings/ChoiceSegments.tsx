/**
 * A "choice" setting's control (registry.ts `kind: "choice"`): its choices
 * side by side, each a 40px button on the firm edge, the picked one blue
 * (Saves and selections are blue; orange is only Start and Finish). Both
 * editors draw it, the studio's own (My Studio → Studio → This studio's
 * settings) and head office's (Admins → Standard → Studio defaults), each
 * with a first segment for "no value of our own" ("Follow the default",
 * "Not set").
 *
 * Controlled, and it holds text like the editors' other boxes: "" for that
 * first segment, a choice's number as text ("1", "2") otherwise, so the
 * dirty-tracked form and `parseSetting` read it as they read every box.
 * Each choice's words wrap, never cut short.
 */
import "./choice-segments.css";

export interface ChoiceSegment {
  /** "" for the first segment (no value of its own), else the choice's number as text. */
  value: string;
  label: string;
  sub?: string;
}

export interface ChoiceSegmentsProps {
  id: string;
  /** What the group is, read aloud: the setting's label. */
  label: string;
  value: string;
  options: readonly ChoiceSegment[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ChoiceSegments({ id, label, value, options, onChange, disabled = false }: ChoiceSegmentsProps) {
  return (
    <div id={id} className="sts-seg" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || "default"}
            type="button"
            className="sts-seg__opt"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              if (!on) onChange(o.value);
            }}
          >
            <span className="sts-seg__label">{o.label}</span>
            {o.sub ? <span className="sts-seg__sub">{o.sub}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
