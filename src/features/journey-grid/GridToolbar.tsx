import type { ReactNode } from "react";
import { QualityMark, QUALITY_MARK_LABEL } from "./QualityMark";

interface GridToolbarProps {
  /** Section caption, e.g. "Recent journey". */
  title?: string;
  /** Controls rendered at the right end of the rail. */
  children?: ReactNode;
}

/**
 * The slim row between the client header and the grid: a section caption on
 * the left, controls on the right. The density switch used to live here; the
 * grid now ships one tuned density, so there is nothing to choose.
 */
export function GridToolbar({ title, children }: GridToolbarProps) {
  return (
    <div className="jg-toolbar">
      {title && (
        <span className="jg-toolbar__title">
          <span className="jg-toolbar__bar" aria-hidden="true" />
          {title}
        </span>
      )}
      <span className="jg-toolbar__spacer" />
      {children}
    </div>
  );
}

/**
 * The key. Colour is never the only cue: a full inroad carries a solid edge,
 * a set where tension broke carries a snapped edge and a hatch, and an
 * ordinary set carries neither. All three survive greyscale.
 */
export function QualityLegend({ compact = false }: { compact?: boolean } = {}) {
  return (
    <div className={`jg-legend ${compact ? "jg-legend--compact" : ""}`} aria-label="Rep quality key">
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q2" aria-hidden="true" />
        Completed
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q3" aria-hidden="true" />
        <span className="jg-legend__mark jg-legend__mark--q3" aria-hidden="true">
          <QualityMark quality={3} size={12} />
        </span>
        Max strength
        <i className="jg-legend__gloss">{QUALITY_MARK_LABEL[3].gloss}</i>
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q1" aria-hidden="true" />
        <span className="jg-legend__mark jg-legend__mark--q1" aria-hidden="true">
          <QualityMark quality={1} size={12} />
        </span>
        Poor quality
        <i className="jg-legend__gloss">{QUALITY_MARK_LABEL[1].gloss}</i>
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--latest" aria-hidden="true" />
        Latest session
      </span>
      <span className="jg-legend__item jg-legend__item--quiet">
        &#9650;&#9660; load vs last &middot; &#8593;&#8595; reps vs last
      </span>
    </div>
  );
}
