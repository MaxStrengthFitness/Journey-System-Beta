import "./loading-mark.css";

/**
 * THE LOADING MARK (tracker round, Sep 2026).
 *
 * "While things load, here's a blue, orange and grey box doing a wave" — the
 * audit's one wish for the Hub. Three squares in the brand's own colours
 * with M, ∧ and X, bobbing in turn. One component for every wait, so a
 * spinner never has to be hand-rolled again (there were ~20).
 *
 * Colours are the logo's own, fixed (--brand-tile-m, -a, -x and the white
 * --brand-tile-ink in index.css :root; the colour round, Oct 4 2026), so the
 * mark looks like the logo in light and dark alike. They used to follow the
 * theme's --brand and --cta, which turned the M square sky in dark mode.
 */
export function LoadingMark({
  label = "Loading…",
  size = "md",
  className = "",
}: {
  /** Read by screen readers and shown under the mark; pass "" to hide the text. */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={`lm lm--${size} ${className}`} role="status" aria-live="polite" aria-label={label || "Loading"}>
      <div className="lm__row" aria-hidden="true">
        <span className="lm__sq lm__sq--m">M</span>
        <span className="lm__sq lm__sq--a">∧</span>
        <span className="lm__sq lm__sq--x">X</span>
      </div>
      {label && <span className="lm__label">{label}</span>}
    </div>
  );
}

/** A whole-area wait: centred mark with breathing room. */
export function LoadingArea({ label }: { label?: string }) {
  return (
    <div className="lm-area">
      <LoadingMark label={label} size="lg" />
    </div>
  );
}
