import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE MACHINE MENU'S LOOK, HELD (phase 4, Oct 2026) — a scan of
 * machine-menu.css and the components that draw with it, as
 * my-studio/look.test.ts is for My Studio. The rules are CLAUDE.md's and the
 * design's (harness/machine-menu/design/spec.md, section B):
 *
 *   1. No raw hex colour: the --eq-* and --jg-* tokens only, from the two
 *      token files the stylesheet imports (so dark mode follows them).
 *   2. Words are never in the faint ink (3.2:1): `--eq-ink-faint` is for
 *      chevrons and separators, never for anything a person reads.
 *   3. Nothing under 14px: the card is read in the hand (ergonomics.md's
 *      in-hand floor), and the chart with it.
 *   4. Every control is at least 40px tall, and 44px by default.
 *   5. The readout is a fixed 128px slot on an iPad, so the plot never moves
 *      under a finger; the plot scrolls the card on a vertical drag and has
 *      no callout or selection; only the overview's box takes the finger.
 *   6. A component imports the stylesheet it draws with (KNOWN-TRAPS →
 *      Layout and CSS): the session chunk and the profile chunk both mount
 *      the card.
 *   7. The wrench is Relay's flag; a set-up change is the sliders.
 *
 * If one of these fails, the fix is the stylesheet or the component, not the
 * test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(HERE, name), "utf8");
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const CSS_FILE = "machine-menu.css";
const CSS = uncommented(read(CSS_FILE));
/** The rules outside any media query (the phone's tightening is the file's last block). */
const BASE = CSS.split("@media")[0];

type Rule = { selectors: string[]; body: string };

function rulesOf(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)/.test(prelude)) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

const RULES = rulesOf(CSS);
const BASE_RULES = rulesOf(BASE);

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());
const px = (v: string) => (/^\d+(?:\.\d+)?px$/.test(v.trim()) ? parseFloat(v) : null);
/** Rules whose subject (the last compound) is `cls` itself, not a pseudo-element. */
const rulesFor = (rules: Rule[], cls: string) =>
  rules.filter((r) =>
    r.selectors.some((s) => {
      const subject = s.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
      return new RegExp(`\\.${cls}(?![\\w-])`).test(subject) && !subject.includes("::");
    }),
  );

/** The components in this folder (tests left out). */
const COMPONENTS = readdirSync(HERE).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));

describe("the machine menu's colours", () => {
  it("are tokens, never a raw hex, white or black", () => {
    const found: string[] = [];
    for (const rule of RULES) {
      for (const decl of rule.body.split(";")) {
        const [prop, ...rest] = decl.split(":");
        if (!prop || rest.length === 0 || prop.trim().startsWith("--")) continue;
        const value = rest.join(":");
        if (/#[0-9a-f]{3,8}\b/i.test(value) || /(?:^|\s)(?:white|black)(?:\s|$)/i.test(value)) {
          found.push(`${rule.selectors.join(", ")} { ${decl.trim()} }`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("come from the app's two token files, imported by the stylesheet, and define no palette of its own", () => {
    expect(CSS).toMatch(/@import\s+"\.\.\/equipment\/equipment\.tokens\.css";/);
    expect(CSS).toMatch(/@import\s+"\.\.\/journey-grid\/journey-grid\.tokens\.css";/);
    expect(CSS).not.toMatch(/--mm-[\w-]+\s*:/);
  });

  it("put no words in the faint ink", () => {
    for (const rule of RULES) {
      for (const prop of ["color", "fill"]) {
        for (const v of declared(rule.body, prop)) expect(v, `${rule.selectors.join(", ")} { ${prop} }`).not.toMatch(/ink-faint/);
      }
    }
    for (const file of COMPONENTS) expect(read(file), file).not.toMatch(/ink-faint/);
  });

  it("write no hex colour in a component either", () => {
    for (const file of COMPONENTS) expect(read(file), file).not.toMatch(/["'`]#[0-9a-f]{3,8}["'`]/i);
  });
});

describe("the machine menu's type", () => {
  it("is never under 14px, and always in px", () => {
    const sizes = [...CSS.matchAll(/(?:^|[;{\s])font-size\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(10);
    for (const v of sizes) {
      const n = px(v);
      expect(n, `font-size ${v}`).not.toBeNull();
      expect(n!, `font-size ${v}`).toBeGreaterThanOrEqual(14);
    }
  });
});

/** Every control the chart block draws. */
const CONTROLS = ["mm-ro__btn", "mm-pg-btn", "mm-list-btn", "mm-more-btn", "mm-retry", "mm-ov"] as const;

describe("the machine menu's controls", () => {
  it("are at least 40px tall wherever their size is set", () => {
    for (const cls of CONTROLS) {
      const heights = rulesFor(RULES, cls).flatMap((r) => [...declared(r.body, "min-height"), ...declared(r.body, "height")]);
      const sizes = heights.map(px).filter((n): n is number => n !== null);
      expect(sizes.length, `${cls} sets no height`).toBeGreaterThan(0);
      for (const n of sizes) expect(n, `${cls} is ${n}px somewhere`).toBeGreaterThanOrEqual(40);
    }
  });

  it("are 44px by default", () => {
    for (const cls of CONTROLS) {
      const own = BASE_RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === `.${cls}`);
      expect(own.length, `.${cls} is defined`).toBeGreaterThan(0);
      const sizes = own.flatMap((r) => [...declared(r.body, "min-height"), ...declared(r.body, "height")]).map(px);
      expect(Math.max(...sizes.filter((n): n is number => n !== null)), cls).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("the chart's touch and its fixed readout", () => {
  it("keeps the readout a fixed 128px on an iPad, growing only on a phone", () => {
    const [slot] = BASE_RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === ".mm-readout");
    expect(declared(slot.body, "height")).toEqual(["128px"]);
    expect(declared(slot.body, "min-height")).toEqual([]);
    const media = CSS.slice(BASE.length);
    expect(media).toMatch(/^@media \(max-width: 599px\)/);
    expect(rulesOf(media).some((r) => r.selectors.includes(".mm-readout"))).toBe(true);
  });

  it("lets a vertical drag scroll the card, with no callout and no text selection on the plot", () => {
    const [plot] = BASE_RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === ".mm-plot");
    expect(declared(plot.body, "touch-action")).toEqual(["pan-y"]);
    expect(declared(plot.body, "-webkit-touch-callout")).toEqual(["none"]);
    expect(declared(plot.body, "user-select")).toEqual(["none"]);
  });

  it("gives the finger to the overview's box alone", () => {
    const touch = RULES.filter((r) => declared(r.body, "touch-action").length > 0);
    const none = touch.filter((r) => declared(r.body, "touch-action").includes("none")).flatMap((r) => r.selectors);
    expect(none).toEqual([".mm-ov__box"]);
    const [strip] = BASE_RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === ".mm-ov");
    expect(declared(strip.body, "touch-action")).toEqual(["pan-y"]);
  });

  it("never animates the chart", () => {
    const CHART =
      /^\.mm-(?:chart|readout|ro__|key|plot|ov|t\b|t--|wl|cn|dl|today|chip|hatch|line|dot|ring|hair|bar|wash|sel|pill|shade|band|cell|rule|fold|zig|wall|badge|hit|g--|star|kaizen|gain)/;
    const chartRules = RULES.filter((r) => r.selectors.some((s) => CHART.test(s)));
    expect(chartRules.length).toBeGreaterThan(40);
    for (const r of chartRules) {
      expect(declared(r.body, "animation"), r.selectors.join(", ")).toEqual([]);
      expect(declared(r.body, "transition"), r.selectors.join(", ")).toEqual([]);
    }
  });
});

describe("the machine menu's components", () => {
  it("each import machine-menu.css when they draw with its classes", () => {
    for (const file of COMPONENTS) {
      const src = read(file);
      if (!/["'`\s]mm-[a-z]/.test(src)) continue;
      expect(src, file).toMatch(/import "\.\/machine-menu\.css";/);
    }
  });

  it("draw a set-up change as the sliders, never the wrench (Relay's flag)", () => {
    for (const file of COMPONENTS) expect(read(file), file).not.toMatch(/\bWrench\b/);
    expect(read("MachineTimeline.tsx")).toMatch(/\bSlidersHorizontal\b/);
  });

  it("are not loaded lazily: the session's warm-up covers them", () => {
    for (const file of COMPONENTS) expect(read(file), file).not.toMatch(/React\.lazy|\blazy\(/);
  });
});
