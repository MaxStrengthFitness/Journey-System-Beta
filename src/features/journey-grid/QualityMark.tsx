import { memo } from "react";
import type { RepQuality } from "./types";

interface QualityMarkProps {
  quality: RepQuality;
  /** Rendered height in px. The glyph is drawn on a 12 x 16 grid. */
  size?: number;
  className?: string;
}

/**
 * The inroad mark.
 *
 * A star and a half-moon said nothing about how Max Strength trains. They
 * were borrowed icons: a star means "favourite" everywhere else in software,
 * and a half-moon means "half" of something unspecified.
 *
 * The methodology has one shape in it. A set drives the muscle's momentary
 * strength down under continuous tension until it fails -- the inroad. How
 * deep it went, and whether tension held the whole way, is the only thing a
 * quality rating records. So the mark is that: a wedge driven downward.
 *
 *   quality 3, max strength  an unbroken wedge, driven to a point.
 *                            Tension held, the inroad went all the way.
 *   quality 1, poor quality  the same wedge, snapped across the middle.
 *                            The line broke; so did the set.
 *   quality 2, completed     no mark. A normal set is the baseline, and
 *                            the baseline should read calm.
 *
 * One shape, two states, and the difference between them is continuity --
 * which is exactly what the two ratings are about. It also survives being
 * printed in grey, which a colour pair never does.
 */
function QualityMarkImpl({ quality, size = 13, className }: QualityMarkProps) {
  if (quality === 2) return null;
  const w = (size * 12) / 16;
  return (
    <svg
      className={className}
      width={w}
      height={size}
      viewBox="0 0 12 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {quality === 3 ? (
        <path d="M1.6 1h8.8L6 15Z" />
      ) : (
        <>
          <path d="M1.6 1h8.8L9.1 6.1H2.9Z" />
          <path d="M3.5 9.4h5L6 15Z" />
        </>
      )}
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
