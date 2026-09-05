import type { CSSProperties } from "react";

/**
 * The logo, reduced to its bones: three squares — blue M, orange A, slate X.
 *
 * Used as a quiet section ornament (before a title, under a name) so the
 * client screens carry the mark without repeating the full lockup. The
 * colours are the logo's own (`max-strength-logo.svg`), never the semantic
 * data colours, so the tiles can never be mistaken for a quality reading.
 */
export const BRAND_TILE_COLORS = ["#0A548B", "#F36D21", "#5B6770"] as const;

interface BrandTilesProps {
  /** Tile edge in px. */
  size?: number;
  /** Gap between tiles in px. */
  gap?: number;
  className?: string;
  /** Vertical stack instead of a row (e.g. as a left rail). */
  vertical?: boolean;
  /** Round the corners — off for the crisp logo look, on when it sits beside rounded chrome. */
  rounded?: boolean;
}

export function BrandTiles({ size = 6, gap = 2, className = "", vertical = false, rounded = false }: BrandTilesProps) {
  const style: CSSProperties = {
    display: "inline-flex",
    flexDirection: vertical ? "column" : "row",
    gap,
    lineHeight: 0,
    flex: "none",
  };
  return (
    <span className={className} style={style} aria-hidden="true">
      {BRAND_TILE_COLORS.map((c) => (
        <span
          key={c}
          style={{ width: size, height: size, background: c, borderRadius: rounded ? Math.max(1, size / 4) : 0, display: "block" }}
        />
      ))}
    </span>
  );
}
