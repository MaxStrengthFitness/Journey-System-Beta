/**
 * A set that was not a counted set, on the profile's rail (AJ, Oct 3 2026:
 * "a small bubble with the icon indicating which one it was"). Practice is a
 * P, Blood flow a drop, Skipped a slashed circle. The numbers or the reason
 * are a tap away: the bubble is a 40px button whose small caption opens
 * above it and closes on the next tap or when focus leaves.
 *
 * Drawn only on the profile's chart (`.jg-view--journey`); the Active
 * Session keeps its own cells, so the CSS hides this everywhere else.
 */
import { useState, type ReactNode } from "react";

export type RailBubbleKind = "practice" | "flow" | "skip";

const ICON: Record<RailBubbleKind, ReactNode> = {
  practice: (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <text x="8" y="12.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor" fontFamily="system-ui, sans-serif">
        P
      </text>
    </svg>
  ),
  flow: (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5C8 1.5 3 7 3 10a5 5 0 0 0 10 0C13 7 8 1.5 8 1.5z" fill="currentColor" />
    </svg>
  ),
  skip: (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
};

export function RailBubble({ kind, caption }: { kind: RailBubbleKind; caption: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="jg-bubble-wrap">
      <button
        type="button"
        className={`jg-bubble jg-bubble--${kind}`}
        aria-label={caption}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
      >
        <span className="jg-bubble__dot">{ICON[kind]}</span>
      </button>
      {open && (
        <span className="jg-bubble__tip" role="status">
          {caption}
        </span>
      )}
    </span>
  );
}
