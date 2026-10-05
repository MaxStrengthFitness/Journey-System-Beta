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

  it("lets the base label wrap rather than clip, and draws the base meta at 12px in its own capitalisation", () => {
    // Programming's and the Activity Archive's look, pinned. Until Sep 29
    // 2026 the base label clipped on one line while its comment said "two
    // words wrap rather than clip"; the code now matches the comment (names
    // are never truncated, CLAUDE.md), and the button is still 48px.
    //
    // Moved on purpose (type and depth, phase 7, Oct 4 2026; AJ's answer
    // 1A): the base meta was 9.5px uppercase at 0.72 alpha. It is the meta
    // voice now, 12/500 in its own capitalisation in the muted ink, and no
    // label or meta in this file is drawn in capitals.
    const label = ruleBody(BASE, ".psub__label");
    expect(label).toContain("white-space: normal");
    expect(label).toContain("overflow-wrap: anywhere");
    expect(label).not.toContain("overflow: hidden");
    const meta = ruleBody(BASE, ".psub__meta");
    expect(meta).toContain("font-size: 12px");
    expect(meta).toContain("font-weight: 500");
    expect(meta).toContain("text-transform: none");
    expect(meta).toContain("color: var(--psub-ink-muted)");
    expect(meta).not.toMatch(/opacity/);
    expect(ruleBody(WRAP, ".psub-shell[data-wrap] .psub__meta")).toContain("text-transform: none");
    expect(ruleBody(BASE, ".psub__btn")).toContain("height: var(--psub-h)");
  });

  it("stays on the codex's type scale and uses no raw colour", () => {
    const sizes = [...stripComments(WRAP).matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    // 22 joined the codex scale on Oct 4 2026 (type and depth, phase 2).
    for (const px of sizes) expect([11, 12, 14, 17, 22, 30]).toContain(px);
    expect(stripComments(WRAP)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("colours the plum dot from the shared token, not a hex", () => {
    expect(ruleBody(BASE, '.psub__dot[data-tone="warn"]')).toContain("var(--eq-warn)");
  });
});

/**
 * The seven pages' bar, raised (type and depth, phase 7, Oct 4 2026; AJ's
 * answers 1A and 2A, plan.md phase 7, harness/depth/kit-recommended.css
 * `.subtabs`). The profile's four tabs right above it are a SUNK tray, so the
 * bar under them is RAISED to read apart: the card's fill inside a soft edge
 * seen from outside, the control's lift, and the picked page solid blue with
 * the blue glow. Its words are the sub-tab voice: the label 14/700 and the
 * meta 12/500, both in their own capitalisation.
 */
describe("profile-nav.css: the sub-toggle is a raised bar", () => {
  it("draws the bar on the card's fill, inside a soft edge seen from outside, with the control's lift", () => {
    const bar = ruleBody(BASE, ".psub");
    expect(bar).toContain("border: 1px solid var(--psub-edge)");
    expect(bar).toContain("background: var(--psub-surface)");
    // After the shorthand, or the shorthand would reset it.
    expect(bar.indexOf("background-clip: padding-box")).toBeGreaterThan(bar.indexOf("background: var(--psub-surface)"));
    expect(bar).toContain("box-shadow: var(--psub-elev-1), var(--psub-panel-highlight)");
    expect(bar).toContain("border-radius: var(--psub-radius)");
  });

  it("makes the picked page solid blue with the blue glow and a white top light", () => {
    const on = ruleBody(BASE, ".psub__btn[data-on]");
    expect(on).toContain("background: var(--psub-live)");
    expect(on).toContain("color: var(--psub-live-on)");
    expect(on).toContain("box-shadow: var(--psub-glow-live), var(--psub-solid-light)");
    // The meta takes the page's own ink there, at full strength.
    expect(ruleBody(BASE, ".psub__btn[data-on] .psub__meta")).toContain("color: inherit");
  });

  it("speaks in the sub-tab voice: the label 14/700 in ink-2, never capitals", () => {
    const label = ruleBody(BASE, ".psub__label");
    expect(label).toContain("font-size: 14px");
    expect(label).toContain("font-weight: 700");
    expect(label).toContain("text-transform: none");
    expect(label).toContain("letter-spacing: 0");
    expect(ruleBody(BASE, ".psub__btn")).toContain("color: var(--psub-ink-2)");
    // Every rule that sizes a sub-tab's words, the phone's included, stays on
    // the scale: nothing under 12.
    const code = stripComments(CSS);
    const sizes = [...code.matchAll(/\.psub__(?:label|meta)[^{]*\{([^}]*)\}/g)].flatMap((m) =>
      [...m[1].matchAll(/font-size:\s*([\d.]+)px/g)].map((s) => Number(s[1])),
    );
    expect(sizes.length).toBeGreaterThan(2);
    for (const px of sizes) expect([12, 14]).toContain(px);
  });

  it("never animates the glow, and keeps a hover that changes the fill inside (hover: hover)", () => {
    const btn = ruleBody(BASE, ".psub__btn");
    const transition = /transition:\s*([^;]+)/.exec(btn)?.[1] ?? "";
    expect(transition).not.toMatch(/box-shadow|\ball\b/);
    // The hover rule lives only inside @media (hover: hover), so an iPad,
    // which keeps hover after a tap, never leaves a segment shaded.
    const code = stripComments(BASE);
    const hover = code.indexOf(".psub__btn:hover");
    expect(hover).toBeGreaterThan(-1);
    const media = code.lastIndexOf("@media (hover: hover)", hover);
    expect(media).toBeGreaterThan(-1);
    expect(code.slice(media, hover)).not.toContain("}");
  });

  it("keeps the picked page's corners parallel to the bar's: the bar's radius less its padding", () => {
    expect(ruleBody(BASE, ".psub")).toContain("padding: 4px");
    expect(ruleBody(BASE, ".psub__btn")).toContain("border-radius: calc(var(--psub-radius) - 4px)");
  });
});
