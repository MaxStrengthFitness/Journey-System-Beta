import { memo } from "react";
import type { RepQuality } from "./types";

interface QualityMarkProps {
  quality: RepQuality;
  /** Rendered height in px. The glyph is drawn on a 16 x 16 grid. */
  size?: number;
  className?: string;
}

/**
 * The inroad mark.
 *
 * Kaizen: the work is the circle you keep drawing, never the circle you
 * finish. So the two rated states are drawn in that language.
 *
 *   quality 3, max strength   an OPEN ENSO — one unbroken brush stroke,
 *                             laid down in a single breath, deliberately
 *                             left open at the top right. Tension held the
 *                             whole way and the inroad went all the way
 *                             down; the gap says there is another one
 *                             tomorrow. Drawn in bronze/gold.
 *   quality 1, poor quality   a CROSS. Not a circle at all, not a softer
 *                             version of one: the set did not happen the
 *                             way it needed to. Universal error semantics,
 *                             unmistakable at 12px, and impossible to read
 *                             as an achievement.
 *   quality 2, completed      no mark. A normal set is the baseline, and
 *                             the baseline should read calm.
 *
 * Both survive greyscale — a ring against a cross is a shape difference,
 * not a colour one — which is what keeps the grid honest in print and for
 * a colour-blind trainer.
 */
function QualityMarkImpl({ quality, size = 13, className }: QualityMarkProps) {
  if (quality === 2) return null;

  if (quality === 3) {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* One stroke, opening at the top right. The brush enters heavy and
            leaves light, which is why the two ends differ in width — a
            round cap on the tail and a butt cap where it lifts off. */}
        <path
          d="M11.2 3.05A6 6 0 1 0 13.4 9.6"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.4 4.4 11.6 11.6M11.6 4.4 4.4 11.6"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const QualityMark = memo(QualityMarkImpl);

/** Full-name label for the mark, used by the legend and by aria text. */
export const QUALITY_MARK_LABEL: Record<RepQuality, { name: string; gloss: string }> = {
  1: { name: "Poor quality", gloss: "tension broke" },
  2: { name: "Completed", gloss: "set on record" },
  3: { name: "Max strength", gloss: "full inroad" },
};
