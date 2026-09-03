import type { ReactNode } from "react";
import type { Density } from "./types";

interface GridToolbarProps {
  /** Section caption, e.g. "Recent journey". */
  title?: string;
  density?: Density;
  onDensity?: (d: Density) => void;
  /** Extra controls rendered after the density switch. */
  children?: ReactNode;
}

/**
 * The slim row between the client header and the grid: a section caption
 * on the left, the density switch and any extra controls on the right.
 * Deliberately quiet — the grid is the content.
 */
export function GridToolbar({ title, density, onDensity, children }: GridToolbarProps) {
  return (
    <div className="jg-toolbar">
      {title && (
        <span className="jg-toolbar__title">
          <span className="jg-toolbar__bar" aria-hidden="true" />
          {title}
        </span>
      )}
      <span className="jg-toolbar__spacer" />
      {density && onDensity && (
        <div className="jg-seg" role="radiogroup" aria-label="Density">
          {(["compact", "comfortable", "full"] as Density[]).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={density === d}
              className={`jg-seg__btn ${density === d ? "is-on" : ""}`}
              onClick={() => onDensity(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}
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
