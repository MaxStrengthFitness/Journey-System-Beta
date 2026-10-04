import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRAND_TILE_COLORS } from "../features/client-profile/BrandTiles";

/**
 * THE LOADING MARK IS THE LOGO, IN BOTH MODES (the colour round, Oct 4 2026).
 *
 * It used to paint its three squares from the theme's --brand, --cta and
 * --muted-foreground, so in dark mode the M square was sky and its letter
 * near-black, and any palette change recoloured the logo. It now reads three
 * fixed tokens set once in index.css :root, never in .dark, with the logo's
 * own colours (BRAND_TILE_COLORS, max-strength-logo.svg) and its white
 * strokes.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const INDEX_CSS = readFileSync(join(SRC, "index.css"), "utf8");
const MARK_CSS = readFileSync(join(HERE, "loading-mark.css"), "utf8");

/** The text of the first rule block that opens with `selector {` at the start of a line. */
function block(selector: string): string {
  const start = INDEX_CSS.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m"));
  expect(start, `no "${selector} {" block in index.css`).toBeGreaterThanOrEqual(0);
  return INDEX_CSS.slice(start, INDEX_CSS.indexOf("\n}", start));
}

function tokenIn(selector: string, token: string): string | null {
  const m = block(selector).match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`));
  return m ? m[1].toUpperCase() : null;
}

const TILES = [
  ["--brand-tile-m", BRAND_TILE_COLORS[0]],
  ["--brand-tile-a", BRAND_TILE_COLORS[1]],
  ["--brand-tile-x", BRAND_TILE_COLORS[2]],
] as const;

describe("the loading mark's colours", () => {
  it("are the logo's own three squares, set once in :root", () => {
    for (const [token, colour] of TILES) {
      expect(tokenIn(":root", token), token).toBe(colour.toUpperCase());
    }
    expect(tokenIn(":root", "--brand-tile-ink")).toBe("#FFFFFF");
  });

  it("are never redefined for dark mode, so the mark looks the same in both", () => {
    const tileTokens = INDEX_CSS.match(/--brand-tile-[a-z]+\s*:/g) ?? [];
    // Four definitions in the whole file, all of them in :root.
    expect(tileTokens).toHaveLength(4);
    expect(block(".dark")).not.toMatch(/--brand-tile-/);
  });

  it("paints each square and its letter from those tokens, not from the theme", () => {
    expect(MARK_CSS).toMatch(/\.lm__sq--m\s*\{[^}]*background:\s*var\(--brand-tile-m\b/);
    expect(MARK_CSS).toMatch(/\.lm__sq--a\s*\{[^}]*background:\s*var\(--brand-tile-a\b/);
    expect(MARK_CSS).toMatch(/\.lm__sq--x\s*\{[^}]*background:\s*var\(--brand-tile-x\b/);
    expect(MARK_CSS).toMatch(/\.lm__sq\s*\{[^}]*color:\s*var\(--brand-tile-ink\b/);
    // The theme tokens that turned the dark M square sky are not read for the squares.
    expect(MARK_CSS).not.toMatch(/background:\s*var\(--(brand|cta|muted-foreground)(?![-\w])/);
  });
});
