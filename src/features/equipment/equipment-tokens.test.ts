import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HUB'S COLOURS, CHECKED AGAINST THE FILE (the Navy Frame, Oct 4 2026).
 *
 * equipment.tokens.css is the palette the Hub, the peek, the run sheet and
 * the Equipment tab are drawn in, and four other palettes (--adm-*, --st-*,
 * --wk-*, --cat-*) are held to it value for value. Until this file nothing
 * measured its own pairs, so a retune could put a card's name, a chip or the
 * now line under AA and every test would stay green. AJ asked for light mode
 * to be less bright and dark mode to be less grey, with the logo's blue and
 * orange as the accents; this holds what that palette promised:
 *
 *   - words clear 4.5:1 and marks and edges 3:1 on what they sit on, in both
 *     modes. A fill is composited over the surface under it: a chip is
 *     measured on a plain card, on an in-session card and on the run sheet's
 *     open row, because that is where the Hub draws it;
 *   - the now line (one orange: line, dot and pill) clears 3:1 on the grid,
 *     over your lane, across a card and across an in-session card, and its
 *     pill carries navy words; Start session and every orange chip with words
 *     are the logo orange with navy words, and nothing is white on an orange;
 *   - dark fills are opaque and keep their accent's hue: a low-alpha orange
 *     wash over the navy cancels to grey, and the crimson and plum washes
 *     both turn violet, which made Critical and caution look the same;
 *   - the hero orange stays apart from the Critical crimson for colour-blind
 *     trainers, and the green apart from the crimson;
 *   - the crimson is the Journey grid's rep-quality crimson, one red;
 *   - the depth tokens (type and depth, Oct 4 2026): each shadow is the
 *     app's own shadow token by name, each depth colour a literal, a raised
 *     fill sits lighter than the card and still carries the 3:1 control
 *     edge, and dark edges are pale rims, never a black line.
 *
 * Read with the comments stripped, from the file's three blocks: :root
 * (light), .dark with [data-theme="dark"], and the prefers-color-scheme copy
 * of the dark block. If one of these fails, the fix is usually the token,
 * not the test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** A stylesheet with its comments taken out and its line endings made \n. */
const stylesheet = (...path: string[]) =>
  readFileSync(join(HERE, ...path), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const EQUIPMENT = stylesheet("equipment.tokens.css");
const GRID = stylesheet("..", "journey-grid", "journey-grid.tokens.css");

const LIGHT_BLOCK = "\n:root {";
const DARK_BLOCK = '\n.dark,\n[data-theme="dark"] {';
const FALLBACK_BLOCK = ':root:not(.light):not([data-theme="light"]) {';

/** Every custom property declared in the block that opens with `selector`. */
function declarations(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = css.indexOf("{", at);
  const body = css.slice(open + 1, css.indexOf("}", open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = declarations(EQUIPMENT, LIGHT_BLOCK);
const DARK_OWN = declarations(EQUIPMENT, DARK_BLOCK);
const FALLBACK = declarations(EQUIPMENT, FALLBACK_BLOCK);

/** .dark sits on <html> with :root, so a token it leaves alone is :root's. */
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...DARK_OWN } } as const;
type Theme = keyof typeof THEMES;
const BOTH: Theme[] = ["light", "dark"];

/* ---------------------------------------------------------------------------
   Colour maths: WCAG 2.x contrast, source-over compositing, CIELAB (D65),
   CIEDE2000, OKLCH, and two colour-blindness models (Brettel 1997 / Vienot
   1999 as libDaltonLens tabulates them, and Machado 2009 at severity 1).
   The same maths as harness/colour/verify-numbers/lib.mjs.
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

/** A token's value in a theme, with var() chains followed; a literal passes through. */
function valueOf(theme: Theme, token: string, depth = 0): string {
  if (!token.startsWith("--")) return token;
  const value = THEMES[theme][token];
  if (value === undefined) throw new Error(`${token} is not set for ${theme}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (!ref) return value;
  if (depth > 8) throw new Error(`var() loop at ${token}`);
  return valueOf(theme, ref[1], depth + 1);
}

/** `fg` painted over an opaque `bg`. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

/** What a stack of layers paints, bottom first (the bottom one over white if it is see-through). */
function paint(theme: Theme, layers: string[]): Rgba {
  let out: Rgba = [255, 255, 255, 1];
  for (const layer of layers) out = over(parse(valueOf(theme, layer)), out);
  return out;
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

/** The contrast of `fg` drawn on the stack `ground` (bottom first), as the screen paints it. */
function ratioOn(theme: Theme, fg: string, ground: string[]): number {
  const bg = paint(theme, ground);
  return contrast(over(parse(valueOf(theme, fg)), bg), bg);
}

type Lab = [number, number, number];

function labFromLinear([r, g, b]: number[]): Lab {
  const X = 0.4123908 * r + 0.3575843 * g + 0.1804808 * b;
  const Y = 0.212639 * r + 0.7151687 * g + 0.0721923 * b;
  const Z = 0.0193308 * r + 0.1191948 * g + 0.9505322 * b;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const f = (t: number) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y / 1), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const lab = (c: Rgba) => labFromLinear(linear(c));
const dE76 = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

function dE00([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = (Math.atan2(b, a) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** OKLCH: [lightness, chroma, hue in degrees]. */
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

type Deficiency = "deutan" | "tritan";
type Matrix = [number, number, number, number, number, number, number, number, number];
const times = (m: Matrix, v: number[]) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const clamp01 = (v: number[]) => v.map((x) => Math.min(1, Math.max(0, x)));

const BRETTEL: Record<Deficiency, { n: number[]; m1: Matrix; m2: Matrix }> = {
  deutan: {
    n: [-0.00281, -0.00611, 0.00892],
    m1: [0.36477, 0.86381, -0.22858, 0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278],
    m2: [0.37298, 0.88166, -0.25464, 0.25954, 0.63506, 0.1054, -0.0198, 0.02784, 0.99196],
  },
  tritan: {
    n: [0.03901, -0.02788, -0.01113],
    m1: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.805, 0.11911],
    m2: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796],
  },
};
const MACHADO: Record<Deficiency, Matrix> = {
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

function brettel(c: Rgba, kind: Deficiency): number[] {
  const v = linear(c);
  const t = BRETTEL[kind];
  const side = t.n[0] * v[0] + t.n[1] * v[1] + t.n[2] * v[2];
  return clamp01(times(side >= 0 ? t.m1 : t.m2, v));
}
const machado = (c: Rgba, kind: Deficiency) => clamp01(times(MACHADO[kind], linear(c)));

/** The smaller difference the two models leave between a and b, as `metric` measures it. */
function underCvd(a: Rgba, b: Rgba, kind: Deficiency, metric: (p: Lab, q: Lab) => number): number {
  const viaBrettel = metric(labFromLinear(brettel(a, kind)), labFromLinear(brettel(b, kind)));
  const viaMachado = metric(labFromLinear(machado(a, kind)), labFromLinear(machado(b, kind)));
  return Math.min(viaBrettel, viaMachado);
}

const colour = (theme: Theme, token: string) => paint(theme, [token]);

/* ---------------------------------------------------------------------------
   The file itself
   --------------------------------------------------------------------------- */

/**
 * The depth tokens that are shadows (type and depth, phase 3, Oct 4 2026).
 * Each is the app's own shadow token of the same name, by alias, so its dark
 * value is index.css's and every copy of this palette carries the same string.
 * Only these names may alias a token outside --eq-*; the depth COLOURS
 * (--eq-raised, --eq-tray, --eq-edge, --eq-edge-control, --eq-divider,
 * --eq-highlight) are literals like every other colour here.
 */
const SHADOW_ALIAS = /^--eq-(elev-[0-5]|elev-card|shelf|press|glow-(?:live|go)|solid-light|go-light|panel-highlight)$/;
const DEPTH_COLOURS = ["--eq-raised", "--eq-tray", "--eq-edge", "--eq-edge-control", "--eq-divider", "--eq-highlight"];
const DEPTH_SHADOWS = [
  "--eq-elev-0", "--eq-elev-1", "--eq-elev-2", "--eq-elev-3", "--eq-elev-4", "--eq-elev-5", "--eq-elev-card",
  "--eq-shelf", "--eq-press", "--eq-glow-live", "--eq-glow-go", "--eq-solid-light", "--eq-go-light", "--eq-panel-highlight",
];

describe("equipment.tokens.css, as a file", () => {
  it("writes every colour as a lowercase #rrggbb, an rgba() or a var(): the copies compare strings", () => {
    for (const [name, block] of Object.entries({ light: LIGHT, dark: DARK_OWN, fallback: FALLBACK })) {
      for (const [token, value] of Object.entries(block)) {
        if (/^--eq-(radius|rail-w)$/.test(token)) continue;
        const shadow = SHADOW_ALIAS.exec(token);
        if (shadow) {
          // A shadow is the app's token of the same name, never a literal and
          // never another --eq-* token (a copy would need its own spelling).
          expect(value, `${name} ${token}`).toBe(`var(--${shadow[1]})`);
          continue;
        }
        expect(value, `${name} ${token}`).toMatch(/^(#[0-9a-f]{6}|rgba\([\d\s.,]+\)|var\(--eq-[\w-]+\))$/);
      }
    }
  });

  it("defines the depth tokens in every block, each colour a literal (type and depth, phase 3)", () => {
    for (const [name, block] of Object.entries({ light: LIGHT, dark: DARK_OWN, fallback: FALLBACK })) {
      for (const token of [...DEPTH_COLOURS, ...DEPTH_SHADOWS]) expect(block[token], `${token} in ${name}`).toBeDefined();
      for (const token of DEPTH_COLOURS) expect(block[token], `${name} ${token}`).not.toMatch(/^var\(/);
    }
    // Every name the alias pattern allows is one the file defines, so the
    // pattern cannot quietly let a stray --eq-elev-9 through.
    expect(Object.keys(LIGHT).filter((t) => SHADOW_ALIAS.test(t)).sort()).toEqual([...DEPTH_SHADOWS].sort());
  });

  it("raises a fill a step LIGHTER than the card and sinks the tray below the page, in both modes", () => {
    // Lighter means higher (AJ, Oct 4 2026: depth in dark comes from lighter
    // surfaces, never black smudges); a well is --eq-surface-2, below the card.
    for (const theme of BOTH) {
      const lum = (token: string) => luminance(colour(theme, token));
      expect(lum("--eq-raised"), `${theme}: raised over the card`).toBeGreaterThan(lum("--eq-surface"));
      expect(lum("--eq-surface-2"), `${theme}: a well under the card`).toBeLessThan(lum("--eq-surface"));
      expect(lum("--eq-tray"), `${theme}: the tray under the page`).toBeLessThan(lum("--eq-bg"));
    }
    expect(valueOf("light", "--eq-raised")).not.toBe("#ffffff");
  });

  it("draws dark edges as pale rims and every depth colour in the navy family, never black", () => {
    for (const token of ["--eq-edge", "--eq-edge-control", "--eq-divider"]) {
      const [r, g, b, a] = parse(valueOf("dark", token));
      expect(b, `${token} in dark is a pale navy`).toBeGreaterThan(r);
      expect(r + g + b, `${token} in dark is a light rim, not a dark line`).toBeGreaterThan(3 * 128);
      expect(a, token).toBeLessThanOrEqual(0.2);
      const [lr, lg, lb] = parse(valueOf("light", token));
      expect([lr, lg, lb], `${token} in light is the logo navy`).toEqual([25, 45, 65]);
    }
  });


  it("keeps the prefers-color-scheme block identical to .dark, key for key", () => {
    // These two blocks exist so a page rendered before hydration is never the
    // wrong theme. If they drift, one path shows the old palette.
    expect(Object.keys(FALLBACK).sort()).toEqual(Object.keys(DARK_OWN).sort());
    for (const [token, value] of Object.entries(DARK_OWN)) expect(FALLBACK[token], token).toBe(value);
  });

  it("only overrides in dark what light defines", () => {
    expect(Object.keys(DARK_OWN).filter((token) => LIGHT[token] === undefined)).toEqual([]);
  });

  it("defines the Navy Frame's new tokens in both modes", () => {
    for (const token of ["--eq-go", "--eq-go-on", "--eq-mine", "--eq-mine-head", "--eq-rail-booked"]) {
      expect(LIGHT[token], `${token} in :root`).toBeDefined();
      expect(DARK_OWN[token], `${token} in .dark`).toBeDefined();
    }
  });
});

/* ---------------------------------------------------------------------------
   Words and marks on what they sit on
   --------------------------------------------------------------------------- */

const CARD = ["--eq-surface"];
const IN_SESSION = ["--eq-surface", "--eq-live-fill"];
/** The run sheet's open row: the live wash over the page. */
const OPEN_ROW = ["--eq-bg", "--eq-live-fill"];

/** Words: 4.5:1. [what, ink, ground (bottom first)]. */
const WORDS: [string, string, string[]][] = [
  ["a card's name", "--eq-ink", CARD],
  ["a card's time", "--eq-ink-2", CARD],
  ["a card's #number and labels", "--eq-ink-muted", CARD],
  ["names on a column head or the axis", "--eq-ink", ["--eq-surface-2"]],
  ["quiet words on a column head or the axis", "--eq-ink-muted", ["--eq-surface-2"]],
  ["quiet words on the grid", "--eq-ink-muted", ["--eq-bg"]],
  ["a name on hover, pressed, or on a colleague's avatar", "--eq-ink", ["--eq-surface-3"]],
  ["an in-session card's name", "--eq-ink", IN_SESSION],
  ["an in-session card's time", "--eq-ink-2", IN_SESSION],
  ["an in-session card's #number", "--eq-ink-muted", IN_SESSION],
  ["an in-session card's blue words", "--eq-live-text", IN_SESSION],
  ["your name on your column's head", "--eq-ink", ["--eq-mine-head"]],
  ["quiet words on your column's head", "--eq-ink-muted", ["--eq-mine-head"]],
  ["blue words on a card (the YOU tag on its card-coloured chip)", "--eq-live-text", CARD],
  ["the picked day and your avatar (words on the blue)", "--eq-live-on", ["--eq-live"]],
  ["today's numeral (small orange words)", "--eq-hero-text", CARD],
  ["Start session and every orange chip with words (navy on the logo orange)", "--eq-go-on", ["--eq-go"]],
  ["the now pill (navy words on the hero orange)", "--eq-go-on", ["--eq-hero"]],
  ["a labelled chip on the deep orange", "--eq-hero-on", ["--eq-hero-text"]],
  ["the peek's Critical box", "--eq-ink", ["--eq-surface", "--eq-alert-fill"]],
  // The machine menu (Oct 4 2026): its change strip and a changed tile are
  // the in-session pairs above; these are the two it adds.
  ["the machine menu's fit line (words on the plum fill)", "--eq-ink", ["--eq-surface", "--eq-warn-fill"]],
  ["the machine menu's quiet switch side and fold buttons", "--eq-ink-2", ["--eq-surface-2"]],
  // The safety strip (phase 6): a Critical note's words and its author and day on the alert fill.
  ["the machine menu's Critical line", "--eq-ink", ["--eq-surface", "--eq-alert-fill"]],
  ["the author and day on a Critical line", "--eq-ink-muted", ["--eq-surface", "--eq-alert-fill"]],
  // Depth (type and depth, phase 3): what a raised control and the tray carry.
  ["words on a raised control", "--eq-ink", ["--eq-raised"]],
  ["a quiet button's words on its raised fill", "--eq-ink-2", ["--eq-raised"]],
  ["the picked layer's blue words on its raised chip", "--eq-live-text", ["--eq-raised"]],
  ["a tab's words on the tray", "--eq-ink-2", ["--eq-tray"]],
];

/** A chip's words on its own fill, wherever the Hub draws the chip. */
const CHIPS: [string, string, string][] = [
  ["Critical", "--eq-alert", "--eq-alert-fill"],
  ["caution", "--eq-warn", "--eq-warn-fill"],
  ["orange", "--eq-hero-text", "--eq-hero-fill"],
  ["ok", "--eq-ok", "--eq-ok-fill"],
  ["blue", "--eq-live-text", "--eq-live-fill"],
];
for (const [what, ink, fill] of CHIPS) {
  WORDS.push(
    [`a ${what} chip on a plain card`, ink, [...CARD, fill]],
    [`a ${what} chip on an in-session card`, ink, [...IN_SESSION, fill]],
    [`a ${what} chip on the run sheet's open row`, ink, [...OPEN_ROW, fill]],
  );
}

/** Marks, edges and rings: 3:1 (WCAG 1.4.11). */
const MARKS: [string, string, string[]][] = [
  ["the now line on the grid", "--eq-hero", ["--eq-bg"]],
  ["the now line over your lane", "--eq-hero", ["--eq-mine"]],
  ["the now line across a card", "--eq-hero", CARD],
  ["the now dot on the axis", "--eq-hero", ["--eq-surface-2"]],
  ["the now line across an in-session card", "--eq-hero", IN_SESSION],
  ["today's ring, and today-and-picked's underline outside the chip, on the day header", "--eq-hero", CARD],
  ["a coming-up client card's edge (AJ's answer 2A)", "--eq-rail-booked", CARD],
  ["a card's default edge", "--eq-ink-faint", CARD],
  ["an in-session or selected edge", "--eq-live", CARD],
  ["the blue rule under your name", "--eq-live", ["--eq-mine-head"]],
  ["a left-open edge (caution)", "--eq-warn", CARD],
  ["the Critical triangle on a card", "--eq-alert", CARD],
  ["the Critical triangle on an in-session card", "--eq-alert", IN_SESSION],
  ["a control's boundary", "--eq-border-strong", CARD],
  // A raised control keeps its 3:1 edge (AJ's answer 2A, Oct 4 2026).
  ["a raised control's own edge", "--eq-border-strong", ["--eq-raised"]],
  ["the focus ring on a card", "--eq-focus-ring", CARD],
  ["the focus ring on the grid", "--eq-focus-ring", ["--eq-bg"]],
];

for (const theme of BOTH) {
  describe(`the Hub's pairs, ${theme} mode`, () => {
    for (const [what, ink, ground] of WORDS) {
      it(`${what} (${ink} on ${ground.join(" + ")}) is at least 4.5:1`, () => {
        expect(ratioOn(theme, ink, ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [what, mark, ground] of MARKS) {
      it(`${what} (${mark} on ${ground.join(" + ")}) is at least 3:1`, () => {
        expect(ratioOn(theme, mark, ground)).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

/* ---------------------------------------------------------------------------
   Orange is now and go
   --------------------------------------------------------------------------- */

describe("the oranges", () => {
  it("the go orange and its navy words are the same in both modes: the logo orange", () => {
    for (const token of ["--eq-go", "--eq-go-on"]) expect(valueOf("dark", token), token).toBe(valueOf("light", token));
    expect(valueOf("light", "--eq-go")).toBe("#f36d21");
  });

  it("puts no white words on an orange: the go and hero words are never white", () => {
    // White is 3.0:1 on the logo orange and 4.0:1 on the light hero. The one
    // white on an orange the palette allows is --eq-hero-on on the deep
    // --eq-hero-text, which the pairs above measure.
    for (const theme of BOTH) expect(valueOf(theme, "--eq-go-on"), theme).not.toBe("#ffffff");
    expect(valueOf("dark", "--eq-hero-on")).not.toBe("#ffffff");
  });
});

/* ---------------------------------------------------------------------------
   Dark fills keep their hue
   --------------------------------------------------------------------------- */

const FILLS: [string, string][] = [
  ["--eq-hero-fill", "--eq-hero"],
  ["--eq-alert-fill", "--eq-alert"],
  ["--eq-warn-fill", "--eq-warn"],
  ["--eq-ok-fill", "--eq-ok"],
  ["--eq-live-fill", "--eq-live"],
];

describe("dark fills are opaque and keep their accent's hue", () => {
  for (const [fill, accent] of FILLS) {
    it(`${fill} is an opaque hex at ${accent}'s hue, not a wash that greys out or turns violet`, () => {
      expect(valueOf("dark", fill)).toMatch(/^#[0-9a-f]{6}$/);
      const [, chroma, hue] = oklch(paint("dark", ["--eq-surface", fill]));
      const accentHue = oklch(colour("dark", accent))[2];
      expect(chroma, "OKLCH chroma").toBeGreaterThanOrEqual(0.04);
      expect(hueGap(hue, accentHue), `hue ${hue.toFixed(0)} vs the accent's ${accentHue.toFixed(0)}`).toBeLessThanOrEqual(25);
    });
  }

  it("keeps the Critical fill and the caution fill apart (CIEDE2000 at least 10; 2.2 as rgba washes)", () => {
    const critical = lab(paint("dark", ["--eq-surface", "--eq-alert-fill"]));
    const caution = lab(paint("dark", ["--eq-surface", "--eq-warn-fill"]));
    expect(dE00(critical, caution)).toBeGreaterThanOrEqual(10);
  });
});

/* ---------------------------------------------------------------------------
   The meanings stay apart, for every trainer
   --------------------------------------------------------------------------- */

describe("colour-blind separation", () => {
  // CIEDE2000 under deuteranope and tritanope simulation, the smaller of the
  // two models. The light hero is the logo orange's own hue rather than the
  // deeper #bf4f04 that was tried, which sat close to the crimson for a
  // colour-blind trainer (deutan 9.5, tritan 4.6). The dark pair is today's
  // (#f36d21 and #f2718c) and may not get worse; the Critical mark is a
  // triangle, so its shape carries the meaning too.
  const FLOOR: Record<Theme, { deutan: number; tritan: number }> = {
    light: { deutan: 12, tritan: 8 },
    dark: { deutan: 12, tritan: 3 },
  };
  for (const theme of BOTH) {
    it(`the hero orange and the Critical crimson stay apart in ${theme} mode`, () => {
      const [hero, crimson] = [colour(theme, "--eq-hero"), colour(theme, "--eq-alert")];
      expect(underCvd(hero, crimson, "deutan", dE00), "deutan").toBeGreaterThanOrEqual(FLOOR[theme].deutan);
      expect(underCvd(hero, crimson, "tritan", dE00), "tritan").toBeGreaterThanOrEqual(FLOOR[theme].tritan);
    });

    it(`ok and Critical stay apart for a deuteranope in ${theme} mode (CIE76 at least 15; dark was 2.1)`, () => {
      const [ok, crimson] = [colour(theme, "--eq-ok"), colour(theme, "--eq-alert")];
      expect(underCvd(ok, crimson, "deutan", dE76)).toBeGreaterThanOrEqual(15);
    });
  }
});

describe("one crimson", () => {
  const grid = {
    light: declarations(GRID, LIGHT_BLOCK),
    dark: declarations(GRID, DARK_BLOCK),
  };

  for (const theme of BOTH) {
    it(`the Critical crimson is the Journey grid's rep-quality crimson in ${theme} mode`, () => {
      expect(valueOf(theme, "--eq-alert")).toBe(grid[theme]["--jg-q-poor"]);
    });

    it(`the grid's poor-set fill is a crimson, never violet, in ${theme} mode`, () => {
      const hue = oklch(parse(grid[theme]["--jg-q-poor-fill"]))[2];
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(30);
    });
  }
});

/* ---------------------------------------------------------------------------
   Easier on the eyes
   --------------------------------------------------------------------------- */

describe("easier on the eyes", () => {
  const SURFACES = ["--eq-bg", "--eq-surface", "--eq-surface-2", "--eq-surface-3"];

  it("light mode has no pure-white surface (AJ: 'the light mode is just so bright')", () => {
    for (const token of SURFACES) expect(valueOf("light", token), token).not.toBe("#ffffff");
  });

  it("dark mode's surfaces are navy, not grey (AJ: 'in our dark mode, it just so gray')", () => {
    for (const token of SURFACES) {
      const [, chroma, hue] = oklch(colour("dark", token));
      expect(chroma, `${token} chroma`).toBeGreaterThanOrEqual(0.03);
      expect(hueGap(hue, 248), `${token} hue ${hue.toFixed(0)}`).toBeLessThanOrEqual(15);
    }
  });

  it("dark mode's ink is soft, never pure white", () => {
    expect(valueOf("dark", "--eq-ink")).not.toBe("#ffffff");
  });
});

/* ---------------------------------------------------------------------------
   The maths, against known values
   --------------------------------------------------------------------------- */

describe("the maths itself", () => {
  it("measures contrast, compositing and CIEDE2000 as the references do", () => {
    expect(contrast(parse("#ffffff"), parse("#000000"))).toBeCloseTo(21, 5);
    expect(over(parse("rgba(255, 0, 0, 0.5)"), [255, 255, 255, 1]).map(Math.round)).toEqual([255, 128, 128, 1]);
    // Sharma, Wu and Dalal (2005), test pair 1.
    expect(dE00([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    // Pure red in OKLCH: L 0.628, C 0.258, h 29.2.
    const [L, C, h] = oklch(parse("#ff0000"));
    expect(L).toBeCloseTo(0.628, 2);
    expect(C).toBeCloseTo(0.258, 2);
    expect(h).toBeCloseTo(29.2, 0);
  });

  it("reads tokens from the blocks and not from what a comment mentions", () => {
    expect(LIGHT["--eq-surface"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(DARK_OWN["--eq-surface"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(DARK_OWN["--eq-surface"]).not.toBe(LIGHT["--eq-surface"]);
  });
});
