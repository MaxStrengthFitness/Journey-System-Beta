import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE DIM VEIL REACHES EVERY OLDER CELL (review of the iPad round, Oct 6
 * 2026).
 *
 * In a live session an older column dims with a veil, the cell's own
 * `::after` (journey-grid.css), in place of `opacity: 0.68`. A cell kind
 * whose `::after` some other rule hides (the lanes hide a practice cell's
 * dashed frame) would show at full strength among dimmed neighbours, as an
 * older practice cell did before the review. Every kind whose `::after` is
 * hidden must be shown again for the veil.
 */

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "journey-grid.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selectors: string[];
  body: string;
}

function rules(text: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean), body: m[2] });
  }
  return out;
}

const all = rules(css);
const VEIL = ':not(.is-latest):not(.is-spot):not(.jg-cell--older)::after';

describe("the older columns' dim veil", () => {
  it("is never hidden itself", () => {
    for (const r of all) {
      if (r.selectors.some((s) => s.endsWith(VEIL))) {
        expect(r.body).not.toMatch(/display\s*:\s*none/);
      }
    }
  });

  it("is shown again on every cell kind whose ::after is hidden", () => {
    const hiddenKinds = new Set<string>();
    for (const r of all) {
      if (!/display\s*:\s*none/.test(r.body)) continue;
      for (const s of r.selectors) {
        const m = /\.jg-cell--([a-z0-9]+)::after$/.exec(s);
        if (m) hiddenKinds.add(m[1]);
      }
    }
    expect(hiddenKinds.size).toBeGreaterThan(0);
    for (const kind of hiddenKinds) {
      const shown = all.some(
        (r) =>
          /display\s*:\s*block/.test(r.body) &&
          r.selectors.some((s) => s === `.jg-look .jg[data-live="true"] .jg-cell--${kind}${VEIL}`),
      );
      expect(shown, `.jg-cell--${kind} hides the veil`).toBe(true);
    }
  });
});
