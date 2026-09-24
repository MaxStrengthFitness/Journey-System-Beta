import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The sub-toggle's wrap variant stays in its own block.
 *
 * `ProfileSubnav` is one component on three tabs. The Notes & Profile codex
 * passes `wrap` so its seven labels can take a second line; Programming and
 * the Activity Archive do not, and must render exactly as they did. That holds
 * only while every wrap rule hangs off `.psub-shell[data-wrap]` — a rule moved
 * into the base styles "because it looks better" would re-lay-out two tabs
 * nobody was looking at. So this reads the actual stylesheet rather than
 * trusting the comment above the block.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "profile-nav.css"), "utf8");

/**
 * The block starts at the comment that names it and runs to the next section
 * comment (or the end of the file). BASE is everything else.
 */
const MARK = "The wrap variant";
const at = CSS.lastIndexOf("/*", CSS.indexOf(MARK));
const nextSection = CSS.indexOf("\n/* ---", at + 1);
const end = nextSection < 0 ? CSS.length : nextSection;
const BASE = CSS.slice(0, at) + CSS.slice(end);
const WRAP = CSS.slice(at, end);

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every selector in a slice of CSS, with at-rule preludes left out. */
function selectorsOf(css: string): string[] {
  const out: string[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@")) continue;
    for (const s of prelude.split(",")) out.push(s.trim());
  }
  return out;
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const src = stripComments(css);
  const i = src.indexOf(`\n${selector} {`);
  if (i < 0) throw new Error(`rule not found: ${selector}`);
  return src.slice(src.indexOf("{", i) + 1, src.indexOf("}", i));
}

describe("profile-nav.css: the wrap variant", () => {
  it("has its own block", () => {
    expect(at).toBeGreaterThan(0);
    expect(selectorsOf(WRAP).length).toBeGreaterThan(0);
  });

  it("scopes every rule in that block to [data-wrap]", () => {
    for (const s of selectorsOf(WRAP)) {
      expect(s, s).toMatch(/^\.psub-shell\[data-wrap\] /);
    }
  });

  it("keeps [data-wrap] out of the base rules, so the other two tabs never match it", () => {
    expect(stripComments(BASE)).not.toContain("data-wrap");
  });

  it("leaves the base label clipping on one line and the base meta at 9.5px uppercase", () => {
    // Programming's and the Activity Archive's look, pinned. Moving them to
    // the wrap variant is its own change, with its own look at an iPad.
    const label = ruleBody(BASE, ".psub__label");
    expect(label).toContain("white-space: nowrap");
    expect(label).toContain("overflow: hidden");
    const meta = ruleBody(BASE, ".psub__meta");
    expect(meta).toContain("font-size: 9.5px");
    expect(meta).toContain("text-transform: uppercase");
    expect(ruleBody(BASE, ".psub__btn")).toContain("height: var(--psub-h)");
  });

  it("stays on the codex's type scale and uses no raw colour", () => {
    const sizes = [...stripComments(WRAP).matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const px of sizes) expect([11, 12, 14, 17, 30]).toContain(px);
    expect(stripComments(WRAP)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("colours the plum dot from the shared token, not a hex", () => {
    expect(ruleBody(BASE, '.psub__dot[data-tone="warn"]')).toContain("var(--eq-warn)");
  });
});
