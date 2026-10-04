import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE PALETTE COPIES THAT NO TEST USED TO PIN (the Navy Frame, Oct 4 2026).
 *
 * Six feature palettes are hand copies of the Hub's (equipment.tokens.css):
 * the briefing (--br-*), the Pulse (--sr-*), FORD (--ford-*), the calendar
 * and Activity Archive (--cal-*), My Profile and the Kaizen mark (--tp-*)
 * and the routine builder (--rb-*). The profile's tab shell (--psub-*) is
 * now an alias of it. Nothing held them to it, so when the Hub moved they
 * would have kept pure white cards and near-black grounds beside it, the
 * Sep 12 "some screens don't match" report again. This holds:
 *
 *   - every copied value equals the Hub's, value for value, in light and in
 *     dark, and each fallback block equals its dark block;
 *   - every dark fill is an OPAQUE colour at its accent's own hue (an rgba
 *     orange over the navy greys out; crimson and plum washes turn violet);
 *   - the words each copy draws read at 4.5:1 and its marks at 3:1, in both
 *     modes, the copies' own pigments included (FORD's pillars, the Pulse's
 *     traffic lights, the builder's avoid and caution, the heat map);
 *   - the rules that put words on a solid colour use an on-colour token, and
 *     the one loud orange (Start Session, Generate, the Pulse's orange
 *     selections) is the logo orange with navy words, its fill restated on
 *     :hover; nothing puts white words on an orange.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** A stylesheet with its line endings made \n and its comments taken out. */
const stylesheet = (path: string) =>
  readFileSync(join(HERE, path), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/** Every custom property declared in the block that opens with `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = css.indexOf("{", at);
  const body = css.slice(open + 1, css.indexOf("}", open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

/** Every rule in a stylesheet, nested ones included, in source order. */
function rules(css: string): { selectors: string[]; body: Record<string, string> }[] {
  const out: { selectors: string[]; body: Record<string, string> }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith("@")) continue;
    const body: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) body[d[1]] = d[2].trim();
    out.push({ selectors: head.split(",").map(normalise), body });
  }
  return out;
}

/** The declarations every rule naming `selector` adds up to (a later one wins). */
function declared(css: string, selector: string): Record<string, string> {
  const want = normalise(selector);
  const found = rules(css).filter((r) => r.selectors.includes(want));
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return Object.assign({}, ...found.map((r) => r.body));
}

/* ---------------------------------------------------------------------------
   Colour maths: WCAG 2.x contrast, source-over compositing and OKLCH, as in
   equipment-tokens.test.ts.
   --------------------------------------------------------------------------- */

type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(v);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  throw new Error(`not a colour: ${value}`);
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linear = (c: Rgba) => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];

function luminance(c: Rgba): number {
  const [r, g, b] = linear(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function oklch(c: Rgba): [number, number, number] {
  const [r, g, b] = linear(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const H = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), H < 0 ? H + 360 : H];
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/* ---------------------------------------------------------------------------
   The Hub's palette and the copies
   --------------------------------------------------------------------------- */

const LIGHT = "\n:root {";
const DARK = '\n.dark,\n[data-theme="dark"] {';
const FALLBACK = ':root:not(.light):not([data-theme="light"]) {';

type Theme = "light" | "dark";
const BOTH: Theme[] = ["light", "dark"];

const EQ_CSS = stylesheet("features/equipment/equipment.tokens.css");
const EQ_LIGHT = block(EQ_CSS, LIGHT);
const EQ = { light: EQ_LIGHT, dark: { ...EQ_LIGHT, ...block(EQ_CSS, DARK) } };

interface Copy {
  name: string;
  file: string;
  dark: string;
  fallback: string | null;
  /** [the copy's token, the --eq-* token it mirrors], in both themes. */
  mirrors: [string, string][];
  /** Mirrors that hold in dark only (a copy's own light pigment). */
  darkMirrors?: [string, string][];
}

const NEUTRALS = ["bg", "surface", "surface-2", "surface-3", "border", "border-strong", "ink", "ink-2", "ink-muted", "ink-faint"];
const same = (prefix: string, names: string[]): [string, string][] => names.map((n) => [`--${prefix}-${n}`, `--eq-${n}`]);

const COPIES: Copy[] = [
  {
    name: "the briefing (--br-*)",
    file: "features/briefing/briefing.tokens.css",
    dark: DARK,
    fallback: FALLBACK,
    mirrors: [
      ...same("br", [...NEUTRALS, "hero", "hero-text", "hero-fill", "go", "go-on", "live", "live-text", "live-fill", "live-on", "ok", "ok-fill", "shadow"]),
      ["--br-critical", "--eq-alert"],
      ["--br-critical-fill", "--eq-alert-fill"],
    ],
  },
  {
    name: "the Pulse (--sr-*)",
    file: "features/subjective-report/subjective-report.css",
    dark: DARK,
    fallback: null,
    mirrors: same("sr", [...NEUTRALS, "hero", "hero-text", "hero-fill"]),
  },
  {
    name: "FORD (--ford-*)",
    file: "features/ford/ford.tokens.css",
    dark: DARK,
    fallback: FALLBACK,
    mirrors: [
      ...same("ford", [...NEUTRALS, "shadow"]),
      ["--ford-now", "--eq-hero-text"],
      ["--ford-now-fill", "--eq-hero-fill"],
      ["--ford-soon", "--eq-live-text"],
      ["--ford-soon-fill", "--eq-live-fill"],
      ["--ford-later", "--eq-ink-muted"],
      ["--ford-later-fill", "--eq-surface-2"],
    ],
  },
  {
    name: "the calendar (--cal-*)",
    file: "features/calendar/calendar.tokens.css",
    dark: DARK,
    fallback: FALLBACK,
    mirrors: same("cal", [...NEUTRALS, "hero", "hero-text", "hero-fill", "live", "live-text", "live-fill", "live-on", "shadow"]),
    darkMirrors: [
      ["--cal-heat-0", "--eq-surface-2"],
      ["--cal-heat-5", "--eq-live"],
    ],
  },
  {
    name: "My Profile (--tp-*)",
    file: "features/trainer-profile/trainer-profile.tokens.css",
    dark: DARK,
    fallback: FALLBACK,
    mirrors: same("tp", [
      ...NEUTRALS,
      "hero", "hero-text", "hero-fill", "hero-on",
      "live", "live-text", "live-fill", "live-on",
      "ok", "ok-fill", "warn", "warn-fill", "alert", "alert-fill", "shadow",
    ]),
    darkMirrors: [
      ["--tp-kaizen", "--eq-live"],
      ["--tp-kaizen-text", "--eq-live-text"],
      ["--tp-kaizen-fill", "--eq-live-fill"],
      ["--tp-kaizen-quiet", "--eq-ink-muted"],
    ],
  },
  {
    name: "the routine builder (--rb-*)",
    file: "features/routine-builder/routine-builder.tokens.css",
    dark: '\n:root.dark,\n:root[data-theme="dark"] {',
    fallback: ":root:not(.dark):not(.light):not([data-theme]) {",
    mirrors: same("rb", [...NEUTRALS, "hero", "hero-text", "hero-fill", "hero-on", "live", "live-text", "live-fill", "live-on", "ok", "ok-fill", "shadow"]),
  },
];

/** A copy's tokens per theme (.dark sits on <html> with :root, so it inherits :root's). */
function themes(copy: Copy) {
  const css = stylesheet(copy.file);
  const light = block(css, LIGHT);
  return { css, light, dark: { ...light, ...block(css, copy.dark) }, darkOwn: block(css, copy.dark) };
}

describe("every copy is the Hub's palette, value for value", () => {
  for (const copy of COPIES) {
    describe(copy.name, () => {
      it.each(BOTH)("matches equipment.tokens.css in %s", (theme) => {
        const t = themes(copy);
        for (const [mine, hub] of copy.mirrors) {
          expect(t[theme][mine], `${mine} (${theme}) should equal ${hub}`).toBe(EQ[theme][hub]);
        }
        if (theme === "dark") {
          for (const [mine, hub] of copy.darkMirrors ?? []) {
            expect(t.dark[mine], `${mine} (dark) should equal ${hub}`).toBe(EQ.dark[hub]);
          }
        }
      });

      it("keeps no pure white surface in light and no near-black ground in dark", () => {
        const t = themes(copy);
        const prefix = copy.mirrors[0][0].replace(/-bg$/, "");
        expect(t.light[`${prefix}-surface`]).not.toBe("#ffffff");
        expect(luminance(parse(t.dark[`${prefix}-bg`]))).toBeGreaterThan(luminance(parse("#070b0f")));
      });

      if (copy.fallback) {
        it("has a system-preference fallback identical to its dark block", () => {
          const t = themes(copy);
          expect(block(t.css, copy.fallback!)).toEqual(t.darkOwn);
        });
      }
    });
  }
});

/* ---------------------------------------------------------------------------
   Dark fills: opaque, at their accent's own hue
   --------------------------------------------------------------------------- */

const DARK_FILLS: [string, string, string][] = [
  ["features/briefing/briefing.tokens.css", "--br-hero-fill", "--br-hero"],
  ["features/briefing/briefing.tokens.css", "--br-live-fill", "--br-live"],
  ["features/briefing/briefing.tokens.css", "--br-ok-fill", "--br-ok"],
  ["features/briefing/briefing.tokens.css", "--br-critical-fill", "--br-critical"],
  ["features/briefing/briefing.tokens.css", "--br-warn-fill", "--br-warn"],
  ["features/subjective-report/subjective-report.css", "--sr-hero-fill", "--sr-hero"],
  ["features/subjective-report/subjective-report.css", "--sr-navy-fill", "--sr-navy"],
  ["features/ford/ford.tokens.css", "--ford-now-fill", "--ford-now"],
  ["features/ford/ford.tokens.css", "--ford-soon-fill", "--ford-soon"],
  ["features/calendar/calendar.tokens.css", "--cal-hero-fill", "--cal-hero"],
  ["features/calendar/calendar.tokens.css", "--cal-live-fill", "--cal-live"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-hero-fill", "--tp-hero"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-live-fill", "--tp-live"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-ok-fill", "--tp-ok"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-warn-fill", "--tp-warn"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-alert-fill", "--tp-alert"],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-kaizen-fill", "--tp-kaizen"],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-hero-fill", "--rb-hero"],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-live-fill", "--rb-live"],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-ok-fill", "--rb-ok"],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-avoid-fill", "--rb-avoid"],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-caution-fill", "--rb-caution"],
  ["features/client-history/client-history.css", "--hist-away-fill", "--hist-away-ink"],
];

/** A file's dark tokens: the routine builder's block is `:root.dark`. */
function darkOf(file: string): Record<string, string> {
  const css = stylesheet(file);
  const dark = file.includes("routine-builder") ? '\n:root.dark,\n:root[data-theme="dark"] {' : DARK;
  return { ...block(css, LIGHT), ...block(css, dark) };
}

describe("dark fills are opaque and keep their accent's hue", () => {
  it.each(DARK_FILLS)("%s %s is an opaque hex at %s's hue", (file, fill, accent) => {
    const dark = darkOf(file);
    expect(dark[fill], `${fill} must be a solid colour, not a wash over the navy`).toMatch(/^#[0-9a-f]{6}$/);
    const [, chroma, hue] = oklch(parse(dark[fill]));
    const accentHue = oklch(parse(dark[accent]))[2];
    expect(chroma, "OKLCH chroma").toBeGreaterThanOrEqual(0.04);
    expect(hueGap(hue, accentHue), `hue ${hue.toFixed(0)} vs the accent's ${accentHue.toFixed(0)}`).toBeLessThanOrEqual(25);
  });

  it("leaves no rgba wash among the copies' dark fills (the trainer tones are identity colours, not copies)", () => {
    const files = [...COPIES.map((c) => c.file), "features/client-history/client-history.css"];
    for (const file of files) {
      for (const [name, value] of Object.entries(darkOf(file))) {
        if (!name.endsWith("-fill") || /^--t\d/.test(name)) continue;
        expect(value, `${file} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
   The words and marks each copy draws, in both modes
   --------------------------------------------------------------------------- */

/** [file, words, ground, floor]: words over an opaque ground. */
const PAIRS: [string, string, string, number][] = [
  // The briefing: the safety box, the Heads up, the carried-over rows.
  ["features/briefing/briefing.tokens.css", "--br-ink-muted", "--br-surface-2", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-warn", "--br-surface", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-warn", "--br-surface-2", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-warn", "--br-warn-fill", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-critical", "--br-critical-fill", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-ink", "--br-critical-fill", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-live-text", "--br-live-fill", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-go-on", "--br-go", 4.5],
  ["features/briefing/briefing.tokens.css", "--br-hero", "--br-bg", 3],
  // The Pulse: the navy, the traffic lights and the words on them.
  ["features/subjective-report/subjective-report.css", "--sr-ink-muted", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-navy", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-navy", "--sr-navy-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-on", "--sr-navy", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-on", "--sr-green", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-on", "--sr-yellow", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-on", "--sr-red", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-on", "--sr-watch", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-green", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-green", "--sr-green-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-yellow", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-yellow", "--sr-yellow-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-red", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-red", "--sr-red-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-watch", "--sr-surface", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-watch", "--sr-watch-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-hero-text", "--sr-hero-fill", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-go-on", "--sr-go", 4.5],
  ["features/subjective-report/subjective-report.css", "--sr-hero", "--sr-surface", 3],
  ["features/subjective-report/subjective-report.css", "--sr-border-strong", "--sr-surface", 3],
  // FORD: the urgency chips, the pillar marks and the unfiled tray.
  ["features/ford/ford.tokens.css", "--ford-now", "--ford-now-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-soon", "--ford-soon-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-later", "--ford-later-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-family-ink", "--ford-surface", 4.5],
  ["features/ford/ford.tokens.css", "--ford-family-ink", "--ford-family-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-occupation-ink", "--ford-surface", 4.5],
  ["features/ford/ford.tokens.css", "--ford-occupation-ink", "--ford-occupation-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-recreation-ink", "--ford-surface", 4.5],
  ["features/ford/ford.tokens.css", "--ford-recreation-ink", "--ford-recreation-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-dreams-ink", "--ford-surface", 4.5],
  ["features/ford/ford.tokens.css", "--ford-dreams-ink", "--ford-dreams-fill", 4.5],
  ["features/ford/ford.tokens.css", "--ford-unfiled", "--ford-surface", 4.5],
  ["features/ford/ford.tokens.css", "--ford-unfiled", "--ford-unfiled-fill", 4.5],
  // The calendar: the heat map's words change ink at step 4.
  ["features/calendar/calendar.tokens.css", "--cal-heat-ink-lo", "--cal-heat-1", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-heat-ink-lo", "--cal-heat-2", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-heat-ink-lo", "--cal-heat-3", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-heat-ink-hi", "--cal-heat-4", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-heat-ink-hi", "--cal-heat-5", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-live-on", "--cal-live", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-hero-text", "--cal-surface", 4.5],
  ["features/calendar/calendar.tokens.css", "--cal-live-text", "--cal-live-fill", 4.5],
  // My Profile and the Kaizen mark.
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-kaizen-text", "--tp-kaizen-fill", 4.5],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-kaizen", "--tp-surface", 3],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-kaizen-quiet", "--tp-surface", 3],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-hero-text", "--tp-hero-fill", 4.5],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-live-text", "--tp-live-fill", 4.5],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-ok", "--tp-ok-fill", 4.5],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-warn", "--tp-warn-fill", 4.5],
  ["features/trainer-profile/trainer-profile.tokens.css", "--tp-live-on", "--tp-live", 4.5],
  // The routine builder: avoid, caution and complete.
  ["features/routine-builder/routine-builder.tokens.css", "--rb-avoid", "--rb-surface", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-avoid", "--rb-avoid-fill", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-caution", "--rb-surface", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-caution", "--rb-caution-fill", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-ok", "--rb-ok-fill", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-hero-text", "--rb-hero-fill", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-live-on", "--rb-live", 4.5],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-avoid-edge", "--rb-surface", 3],
  ["features/routine-builder/routine-builder.tokens.css", "--rb-avoid-edge", "--rb-surface-2", 3],
];

function tokensOf(file: string, theme: Theme): Record<string, string> {
  const css = stylesheet(file);
  return theme === "light" ? block(css, LIGHT) : darkOf(file);
}

/** A token's value, var() chains followed inside its own file. */
function valueIn(vars: Record<string, string>, token: string, depth = 0): string {
  const v = vars[token];
  if (v === undefined) throw new Error(`missing ${token}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (!ref) return v;
  if (depth > 6) throw new Error(`var() loop at ${token}`);
  return valueIn(vars, ref[1], depth + 1);
}

describe("words read at 4.5:1 and marks at 3:1, in both modes", () => {
  for (const theme of BOTH) {
    it.each(PAIRS)(`${theme}: %s %s on %s`, (file, words, ground, floor) => {
      const vars = tokensOf(file, theme);
      const ratio = contrast(parse(valueIn(vars, words)), parse(valueIn(vars, ground)));
      expect(ratio, `${words} on ${ground}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(floor);
    });
  }

  it.each(BOTH)("the away day in the Activity Archive reads on its fill (%s)", (theme) => {
    const vars = tokensOf("features/client-history/client-history.css", theme);
    expect(contrast(parse(vars["--hist-away-ink"]), parse(vars["--hist-away-fill"]))).toBeGreaterThanOrEqual(4.5);
  });

  it("the heat map's first step stands off the dark card (1.15:1), and each step climbs", () => {
    const cal = { light: tokensOf("features/calendar/calendar.tokens.css", "light"), dark: tokensOf("features/calendar/calendar.tokens.css", "dark") };
    const card = parse(cal.dark["--cal-surface"]);
    expect(contrast(parse(cal.dark["--cal-heat-1"]), card)).toBeGreaterThanOrEqual(1.15);
    for (let i = 1; i <= 5; i++) {
      const [lPrev, lStep] = [cal.light[`--cal-heat-${i - 1}`], cal.light[`--cal-heat-${i}`]].map((v) => luminance(parse(v)));
      const [dPrev, dStep] = [cal.dark[`--cal-heat-${i - 1}`], cal.dark[`--cal-heat-${i}`]].map((v) => luminance(parse(v)));
      expect(lStep, `light step ${i} darker than ${i - 1}`).toBeLessThan(lPrev);
      expect(dStep, `dark step ${i} lighter than ${i - 1}`).toBeGreaterThan(dPrev);
    }
  });
});

/* ---------------------------------------------------------------------------
   The rules that draw them
   --------------------------------------------------------------------------- */

describe("the one loud orange is the logo orange with navy words", () => {
  const briefing = stylesheet("features/briefing/briefing.css");
  const pulse = stylesheet("features/subjective-report/subjective-report.css");
  const review = stylesheet("features/clinical-review/clinical-review.css");

  it("Start Session on the briefing, with its fill restated on :hover and no filter", () => {
    const cta = declared(briefing, ".br__cta");
    expect(cta.background).toBe("var(--br-go)");
    expect(cta.color).toBe("var(--br-go-on)");
    const hover = declared(briefing, ".br__cta:hover");
    expect(hover.background).toBe("var(--br-go)");
    expect(hover.filter).toBeUndefined();
  });

  it("the briefing no longer defines or reads the white hero words or the gradient's second orange", () => {
    const tokens = stylesheet("features/briefing/briefing.tokens.css");
    for (const css of [briefing, tokens]) {
      expect(css).not.toContain("--br-hero-on");
      expect(css).not.toContain("--br-hero-strong");
    }
  });

  it("the Pulse's two orange selections (a linked note, a machine that brings it on)", () => {
    for (const selector of [".sr-btn--primary", ".sr-chip--hero.sr-chip--on"]) {
      const body = declared(pulse, selector);
      expect(body.background, selector).toBe("var(--sr-go)");
      expect(body.color, selector).toBe("var(--sr-go-on)");
    }
  });

  it("the Pulse's go pair is the Hub's", () => {
    const sr = block(pulse, LIGHT);
    expect(sr["--sr-go"]).toBe(EQ.light["--eq-go"]);
    expect(sr["--sr-go-on"]).toBe(EQ.light["--eq-go-on"]);
  });

  it("the Deep Dive's Generate, with its fill restated on :hover and no filter or raw hex", () => {
    const body = declared(review, ".cr-generate");
    expect(body.background).toBe("var(--jg-go)");
    expect(body.color).toBe("var(--jg-go-on)");
    expect(Object.values(body).join(" ")).not.toMatch(/#[0-9a-f]{3,6}\b|rgba\(/i);
    const hover = declared(review, ".cr-generate:hover");
    expect(hover.background).toBe("var(--jg-go)");
    expect(hover.filter).toBeUndefined();
  });
});

describe("words on a solid colour take an on-colour token", () => {
  const pulse = stylesheet("features/subjective-report/subjective-report.css");

  it.each([
    ".sr-chip--on",
    ".sr-days__btn--on",
    ".sr-body__side--on",
    ".sr-btn--navy",
    ".sr-seg button.sr-seg--on",
    ".sr-flag__icon",
    ".pq__done",
    ".sra-btn--primary",
    ".pcm__nav--primary",
  ])("the Pulse's %s reads --sr-on", (selector) => {
    expect(declared(pulse, selector).color).toBe("var(--sr-on)");
  });

  it("the Pulse sets no white or hand-typed navy word colour, and its dark block covers [data-theme]", () => {
    for (const r of rules(pulse)) {
      if (r.body.color) expect(r.body.color, r.selectors.join(", ")).not.toMatch(/^#(fff|ffffff|071a2b)$/i);
    }
    expect(pulse).toContain(DARK);
    expect(block(pulse, LIGHT)["--sr-on"]).toBe("#ffffff");
    expect(block(pulse, DARK)["--sr-on"]).toBe(EQ.dark["--eq-live-on"]);
  });

  it("the Dial's two solid segments read the on-colour, at 4.5:1 in both modes", () => {
    const rating = stylesheet("features/rating/rating.css");
    for (const tone of ["ok-strong", "alert"]) {
      expect(declared(rating, `.rt__seg[aria-checked="true"][data-tone="${tone}"]`).color).toBe("var(--eq-live-on)");
    }
    expect(rating).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const theme of BOTH) {
      for (const fill of ["--eq-ok", "--eq-alert"]) {
        expect(contrast(parse(EQ[theme]["--eq-live-on"]), parse(EQ[theme][fill])), `${theme} ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the Deep Dive's picked range and its darkest heat cells", () => {
    const review = stylesheet("features/clinical-review/clinical-review.css");
    expect(declared(review, ".cr-seg__btn.is-on").color).toBe("var(--jg-live-on)");
    expect(declared(review, ".cr-heat__cell.is-ink").color).toBe("var(--cr-on-dark)");
  });

  it("the heat map's step 3 keeps the low ink; steps 4 and 5 take the high one", () => {
    const calendar = stylesheet("features/calendar/calendar.css");
    expect(declared(calendar, '.cal-heat__cell[data-step="3"]').color).toBeUndefined();
    for (const step of [4, 5]) {
      expect(declared(calendar, `.cal-heat__cell[data-step="${step}"]`).color).toBe("var(--cal-heat-ink-hi)");
    }
  });
});

describe("one crimson, one blue", () => {
  it("the Deep Dive's poor-quality fallbacks are the grid's crimson, not the old plum", () => {
    const review = stylesheet("features/clinical-review/clinical-review.css");
    const grid = block(stylesheet("features/journey-grid/journey-grid.tokens.css"), LIGHT);
    const cr = (name: string) => /var\(--[\w-]+,\s*(#[0-9a-f]{6})\)/i.exec(block(review, ".cr {")[name])?.[1];
    expect(cr("--cr-poor")).toBe(grid["--jg-q-poor"]);
    expect(cr("--cr-poor-text")).toBe(grid["--jg-q-poor-text"]);
    expect(cr("--cr-poor-fill")).toBe(grid["--jg-q-poor-fill"]);
  });

  it("the profile's tab shell is the Hub's palette by alias, in every block", () => {
    const nav = stylesheet("features/client-profile/profile-nav.css");
    const want: Record<string, string> = {
      "--psub-bg": "var(--eq-surface-2)",
      "--psub-surface": "var(--eq-surface)",
      "--psub-border": "var(--eq-border)",
      "--psub-ink": "var(--eq-ink)",
      "--psub-ink-muted": "var(--eq-ink-muted)",
      "--psub-ink-faint": "var(--eq-ink-muted)",
      "--psub-live": "var(--eq-live)",
      "--psub-live-soft": "var(--eq-live-text)",
      "--psub-live-on": "var(--eq-live-on)",
      "--psub-flag": "var(--eq-alert)",
    };
    for (const selector of [LIGHT, DARK, FALLBACK]) {
      const tokens = block(nav, selector);
      for (const [name, alias] of Object.entries(want)) expect(tokens[name], `${name} in ${selector.trim()}`).toBe(alias);
    }
    expect(declared(nav, '.ptab-strip__chip[data-tone="alert"]').background).toBe("var(--eq-alert-fill)");
  });

  it.each(BOTH)("the shell's words read in %s: the tray, the page, and the meta line on the picked segment", (theme) => {
    const eq = (name: string) => parse(EQ[theme][name]);
    expect(contrast(eq("--eq-ink-muted"), eq("--eq-surface-2"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(eq("--eq-ink-muted"), eq("--eq-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(eq("--eq-live-text"), eq("--eq-surface"))).toBeGreaterThanOrEqual(4.5);
    // .psub__btn[data-on] .psub__meta: the on-colour at 0.86 over the blue.
    const meta = over([...eq("--eq-live-on").slice(0, 3), 0.86] as Rgba, eq("--eq-live"));
    expect(contrast(meta, eq("--eq-live"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the fallback selectors", () => {
  it("the routine builder follows the system theme only when the app has stamped none (.light included)", () => {
    const rb = readFileSync(join(HERE, "features/routine-builder/routine-builder.tokens.css"), "utf8").replace(/\r\n/g, "\n");
    expect(rb).toContain(":root:not(.dark):not(.light):not([data-theme]) {");
    expect(rb).not.toContain(':root:not(.dark):not([data-theme="light"]):not([data-theme="dark"])');
  });
});
