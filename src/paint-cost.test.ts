import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WHAT SAFARI PAYS TO DRAW (the iPad round, Oct 6 2026; AJ: "we really need
 * our app to run fast on devices like ipads even 10th generation ipads and
 * ipad minis").
 *
 * The performance lab (harness/perf-lab) slows Chrome's CPU to an iPad's, but
 * it cannot model WebKit's painting: the audit's W3, W7, W10 and W12 are the
 * drawing costs a real iPad pays that the lab can't see. This file holds the
 * fixes, reading every stylesheet and component in src, so a new screen is
 * held to them too. AJ's Oct 4 look ("Refined Lift", elevation.test.ts) is
 * kept: what changes is HOW it is drawn.
 *
 *   1. Nothing is drawn through a backdrop blur (W3). A blurred veil makes
 *      WebKit re-sample and blur the whole screen behind it on every frame of
 *      its fade and whenever anything under it repaints; a blurred sticky bar
 *      does the same on every scroll frame. Veils are the navy --scrim alone
 *      (a touch stronger to make up for the blur), bars and toasts opaque.
 *   2. A card among many takes ONE contact shadow, --X-elev-list (W7). Held
 *      with the rest of the depth rules, in elevation.test.ts section 15.
 *
 * If one of these fails, the fix is the stylesheet or the class list, not
 * the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}
const relOf = (p: string) => relative(SRC, p).replace(/\\/g, "/");
const CSS_FILES = filesUnder(SRC, /\.css$/).map(relOf);
/** Components and modules that may carry class lists or inline styles; tests left out. */
const CODE_FILES = filesUnder(SRC, /\.tsx?$/).map(relOf).filter((f) => !/\.test\.tsx?$/.test(f));

/** Every `prop: value` in a stylesheet (comments removed), with its line. */
function declarations(file: string, prop: RegExp): { line: number; prop: string; value: string }[] {
  const text = stripComments(read(file));
  const out: { line: number; prop: string; value: string }[] = [];
  for (const m of text.matchAll(new RegExp(`(?:^|[;{\\s])(${prop.source})\\s*:\\s*([^;}]+)`, "g"))) {
    out.push({ line: text.slice(0, m.index).split("\n").length, prop: m[1], value: m[2].trim() });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   1. No backdrop blur (W3)
   --------------------------------------------------------------------------- */

describe("1. nothing is drawn through a backdrop blur (W3)", () => {
  it("reads every stylesheet and component in src", () => {
    expect(CSS_FILES.length).toBeGreaterThan(80);
    expect(CODE_FILES.length).toBeGreaterThan(500);
  });

  it("no stylesheet sets a backdrop-filter, or blurs with filter", () => {
    const found: string[] = [];
    for (const f of CSS_FILES) {
      for (const d of declarations(f, /-webkit-backdrop-filter|backdrop-filter/)) {
        if (d.value !== "none") found.push(`${f}:${d.line} ${d.prop}: ${d.value}`);
      }
      for (const d of declarations(f, /filter/)) if (/blur\(/.test(d.value)) found.push(`${f}:${d.line} filter: ${d.value}`);
    }
    expect(found).toEqual([]);
  });

  it("no class list or inline style blurs what is behind it (backdrop-blur, backdrop-filter, a blur filter)", () => {
    const found: string[] = [];
    for (const f of CODE_FILES) {
      const src = read(f);
      for (const m of src.matchAll(/(?:^|[\s"'`:])((?:[\w-]+:)*backdrop-(?:blur|filter)[\w\-[\]()./]*)|backdropFilter\s*:|WebkitBackdropFilter\s*:|(?:^|[\s"'`:])((?:[\w-]+:)*blur-(?:none|xs|sm|md|lg|xl|2xl|3xl|\[[^\]]*\]))(?=[\s"'`]|$)/gm)) {
        found.push(`${f}:${src.slice(0, m.index).split("\n").length} ${m[0].trim()}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the scrim makes up for the blur: a touch stronger in both modes, and still navy", () => {
    const index = stripComments(read("index.css"));
    const scrims = [...index.matchAll(/--scrim:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)].map((m) => m.slice(1).map(Number));
    expect(scrims).toHaveLength(2);
    const [light, dark] = scrims;
    expect(light[3], "light: was .30 over a 4px blur").toBeGreaterThanOrEqual(0.34);
    expect(dark[3], "dark: was .55 over a 4px blur").toBeGreaterThanOrEqual(0.58);
    for (const s of scrims) expect(s.slice(0, 3), "navy, not black").not.toEqual([0, 0, 0]);
  });

  it("a sticky bar over scrolling content and a toast are opaque", () => {
    const bar = /\.cr-bar \{([^}]*)\}/.exec(stripComments(read("features/clinical-review/clinical-review.css")))![1];
    expect(bar).toMatch(/position: sticky/);
    expect(bar).toMatch(/background: var\(--cr-surface\);/);
    const fills = read("contexts/ToastContext.tsx").match(/bgColor =\s*"bg-[\w/-]+/g) ?? [];
    expect(fills.length, "the four toasts").toBe(4);
    expect(fills.filter((s) => /\/\d+$/.test(s)), "a toast's fill is solid").toEqual([]);
  });
});
