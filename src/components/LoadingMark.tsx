import "./loading-mark.css";

/**
 * THE LOADING MARK (tracker round, Sep 2026).
 *
 * "While things load, here's a blue, orange and grey box doing a wave" — the
 * audit's one wish for the Hub. Three squares in the brand's own colours
 * with M, ∧ and X, bobbing in turn. One component for every wait, so a
 * spinner never has to be hand-rolled again (there were ~20).
 *
 * Colours come from the theme tokens (--brand, --cta, and the neutral ink),
 * so it is right in light and dark without a second version.
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
