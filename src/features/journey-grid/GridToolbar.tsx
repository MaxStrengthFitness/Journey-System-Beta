import type { ReactNode } from "react";

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

/** Quality legend. Colour is never the only cue — each swatch carries its edge + texture. */
export function QualityLegend() {
  return (
    <div className="jg-legend" aria-label="Rep quality legend">
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q2" aria-hidden="true" />
        Completed
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q3" aria-hidden="true" />
        Max strength ★
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--q1" aria-hidden="true" />
        Poor quality ◐
      </span>
      <span className="jg-legend__item">
        <span className="jg-legend__swatch jg-legend__swatch--latest" aria-hidden="true" />
        Latest session
      </span>
      <span className="jg-legend__item" style={{ opacity: 0.8 }}>
        ▲▼ load vs last · ↑↓ reps vs last
      </span>
    </div>
  );
}
