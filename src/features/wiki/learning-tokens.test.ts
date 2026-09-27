import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * LEARNING'S PALETTE IS THE APP'S PALETTE (voice-review round, Sep 27 2026).
 *
 * --wk-* (the Catalog and the Academy) and --cat-* (the catalog's own
 * screens) were hand-copied hex values. They matched equipment.tokens.css
 * everywhere but the warnings, which were amber where the rest of the app
 * says caution in plum and critical in crimson — so one machine's warnings
 * were two colours on two screens — and dark mode, which had drifted.
 * admin-tokens.test.ts holds --adm-* to --eq-*; this does the same here.
 *
 * The voice review follow-up (Sep 27 2026) added one meaning per colour: no
 * raw hex in Learning's stylesheets, a flagged machine in the caution plum
 * (it was crimson for a day), every Save solid blue with the app's on-colour,
 * and the Upkeep card on Learning's palette rather than the Hub's.
 *
 * If one of these fails, the fix is the token file, not the test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), "utf8");
/** A file in another feature folder: src("catalog", "catalog.css"). */
const src = (...p: string[]) => read("..", ...p);
/** The source with its comments taken out, so a comment can name a colour. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const EQUIPMENT = read("..", "equipment", "equipment.tokens.css");
const WIKI = read("wiki.tokens.css");
const CATALOG = read("..", "catalog", "catalog.tokens.css");

function readBlock(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`token block not found: ${selector}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("\n}", open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const eq = { light: readBlock(EQUIPMENT, ":root {"), dark: readBlock(EQUIPMENT, ".dark,") };
const palettes = {
  wk: { light: readBlock(WIKI, ":root {"), dark: readBlock(WIKI, ".dark,") },
  cat: { light: readBlock(CATALOG, ":root {"), dark: readBlock(CATALOG, ".dark,") },
};

/** The colours a Learning palette shares with the app, by their --eq- name. */
const SHARED = Object.keys(eq.light).filter((k) => !["--eq-rail-w", "--eq-radius", "--eq-focus-ring"].includes(k));

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function rgb(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** A colour as painted over `ground`: an rgba() wash is composited first. */
function painted(c: string, ground: string): number[] {
  const m = c.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return rgb(c);
  const a = Number(m[4]);
  const g = rgb(ground);
  return [0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * a + g[i] * (1 - a)));
}
function luminance(c: string | number[]): number {
  const [r, g, b] = (typeof c === "string" ? rgb(c) : c).map((v) => channel(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string | number[], b: string | number[]): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe.each(Object.entries(palettes))("--%s-* is the app's palette", (prefix, p) => {
  const mine = (eqKey: string) => eqKey.replace("--eq-", `--${prefix}-`);

  it("carries every shared colour it defines at the app's value, in light", () => {
    for (const key of SHARED) {
      if (p.light[mine(key)] === undefined) continue;
      expect(p.light[mine(key)], mine(key)).toBe(eq.light[key]);
    }
  });

  it("and in dark, wherever the app's dark block sets it", () => {
    for (const key of SHARED) {
      if (p.light[mine(key)] === undefined || eq.dark[key] === undefined) continue;
      expect(p.dark[mine(key)], `${mine(key)} in .dark`).toBe(eq.dark[key]);
    }
  });

  it("says caution in the app's plum, never amber", () => {
    for (const block of [p.light, p.dark]) {
      // --cat-warn-strong had no reader and went on Sep 27 2026; where a
      // palette still has one, it is the same plum.
      const strong = block[`--${prefix}-warn-strong`];
      if (strong !== undefined) expect(strong).toBe(block[`--${prefix}-warn`]);
    }
    expect(p.light[`--${prefix}-warn`]).toBe(eq.light["--eq-warn"]);
  });

  it("keeps a warning readable on its card, in both themes", () => {
    expect(ratio(p.light[`--${prefix}-warn`], p.light[`--${prefix}-surface`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.light[`--${prefix}-warn`], p.light[`--${prefix}-warn-fill`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.dark[`--${prefix}-warn`], p.dark[`--${prefix}-surface`])).toBeGreaterThanOrEqual(4.5);
  });

  it("puts readable words on a blue Save, in both themes", () => {
    // Every Save fills with --*-live and writes in --*-live-on, the app's
    // --eq-live-on (voice review follow-up: white was 2.9:1 in dark mode).
    expect(p.light[`--${prefix}-live-on`]).toBe(eq.light["--eq-live-on"]);
    expect(p.dark[`--${prefix}-live-on`]).toBe(eq.dark["--eq-live-on"]);
    expect(ratio(p.light[`--${prefix}-live-on`], p.light[`--${prefix}-live`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.dark[`--${prefix}-live-on`], p.dark[`--${prefix}-live`])).toBeGreaterThanOrEqual(4.5);
  });
});

/** Every source file under src/features, for "does anything read this token". */
function featureSources(): string {
  const root = join(here, "..");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(readFileSync(path, "utf8"));
    }
  };
  walk(root);
  return out.join("\n");
}

describe("--cat-* has no token without a reader", () => {
  it("defines only what the studio cards and How it's used read", () => {
    // The old Catalog's twenty (rail widths, the picker's accents, the
    // figure's colours, orange) sat here unread for ten days after it went.
    const sources = featureSources().split(CATALOG).join("");
    const unread = Object.keys(palettes.cat.light).filter((token) => !sources.includes(`var(${token}`));
    expect(unread).toEqual([]);
  });
});

describe("the critical colour", () => {
  it("is the app's crimson in the Catalog and the Academy", () => {
    expect(palettes.wk.light["--wk-alert"]).toBe(eq.light["--eq-alert"]);
    expect(palettes.wk.dark["--wk-alert"]).toBe(eq.dark["--eq-alert"]);
  });
});

/* ------------------------------------------------------------------ *
 * Readable categories and a readable figure (voice review follow-up)
 * ------------------------------------------------------------------ */

const ACCENTS = ["push", "pull", "legs", "posterior", "trunk", "hips", "other"] as const;

describe.each([
  ["light", palettes.wk.light],
  ["dark", palettes.wk.dark],
] as const)("Learning's category colours as words, in %s", (_theme, wk) => {
  it.each(ACCENTS)("%s reads at 4.5:1 on its fill, the card and the page", (accent) => {
    const text = wk[`--wk-cat-${accent}-text`];
    expect(text, `--wk-cat-${accent}-text`).toMatch(/^#[0-9a-f]{6}$/i);
    const surface = wk["--wk-surface"];
    const fill = painted(wk[`--wk-cat-${accent}-fill`], surface);
    expect(ratio(text, fill), "on its fill").toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, surface), "on the card").toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, wk["--wk-bg"]), "on the page").toBeGreaterThanOrEqual(4.5);
  });

  it("draws the worked muscles at 3:1 or more against the rest of the body", () => {
    expect(ratio(wk["--wk-muscle-primary"], wk["--wk-muscle-base"])).toBeGreaterThanOrEqual(3);
    // The assisting muscles never read as the same blue as the worked ones.
    expect(ratio(wk["--wk-muscle-primary"], wk["--wk-muscle-secondary"])).toBeGreaterThanOrEqual(2);
    expect(ratio(wk["--wk-muscle-secondary"], wk["--wk-muscle-base"])).toBeGreaterThanOrEqual(1.5);
  });
});

describe("where an accent colours words or a glyph", () => {
  it("uses the readable shade, and keeps the bright accent for stripes and rules", () => {
    const css = code(src("wiki", "wiki.css")) + code(src("learning", "learning.css"));
    // Any `color:` that reads the accent reads --wk-accent-text.
    expect(css.match(/(?<![-\w])color:\s*var\(--wk-accent[,)]/g) ?? []).toEqual([]);
    expect(src("wiki", "categories.ts")).toMatch(/"--wk-accent-text": accentTextVar\(accent\)/);
  });

  it("the Catalog's figure is painted with those tokens, never the model's built-in hex", () => {
    const figure = code(src("catalog", "MachineFigure.tsx"));
    expect(figure).toMatch(/colors=\{MUSCLE_COLOURS\}/);
    expect(figure).toMatch(/baseFill=\{BODY_COLOUR\}/);
    expect(figure).toContain('"var(--wk-muscle-primary)", "var(--wk-muscle-secondary)"');
    expect(figure).toContain('"var(--wk-muscle-base)"');
  });
});

describe("readable words are never in the faint ink", () => {
  it("keeps --*-ink-faint for chevrons, separators, icons and bullets", () => {
    // Every rule that reads the faint ink, by selector: each is decorative.
    const DECORATIVE = /(chev|-sep|-go|-icon|svg|::before|bullet)/;
    for (const [name, css] of Object.entries({
      "wiki/wiki.css": src("wiki", "wiki.css"),
      "learning/learning.css": src("learning", "learning.css"),
      "catalog/catalog.css": src("catalog", "catalog.css"),
      "comments/comments.css": src("comments", "comments.css"),
      "machine-trends/machine-trends.css": src("machine-trends", "machine-trends.css"),
    })) {
      for (const m of code(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/color:\s*var\(--(wk|cat)-ink-faint\)/.test(m[2])) continue;
        const selector = m[1].trim().split("\n").pop()!.trim();
        expect(selector, `${name}: ${selector}`).toMatch(DECORATIVE);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * One meaning per colour (voice review follow-up, Sep 27 2026)
 * ------------------------------------------------------------------ */

/** Learning's own stylesheets: the Catalog, the Academy, the front page and what they mount. */
const STYLESHEETS: Record<string, string> = {
  "wiki/wiki.css": src("wiki", "wiki.css"),
  "learning/learning.css": src("learning", "learning.css"),
  "catalog/catalog.css": src("catalog", "catalog.css"),
  "comments/comments.css": src("comments", "comments.css"),
  "machine-trends/machine-trends.css": src("machine-trends", "machine-trends.css"),
  "machine-db/machine-db.css": src("machine-db", "machine-db.css"),
};

/** The Upkeep card's block of studio-tasks.css: its only host is a Catalog machine page. */
function upkeepBlock(): string {
  const css = src("studio-tasks", "studio-tasks.css");
  const start = css.indexOf(".stu {");
  const end = css.indexOf("REQUESTS LANE", start);
  if (start < 0 || end < 0) throw new Error("the .stu block moved");
  return css.slice(start, end);
}

describe("one meaning per colour in Learning", () => {
  it("writes no raw hex in a stylesheet: every colour is a token", () => {
    for (const [name, css] of Object.entries({ ...STYLESHEETS, "studio-tasks.css .stu": upkeepBlock() })) {
      expect(code(css).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], name).toEqual([]);
    }
  });

  it("shows a flagged machine in the caution plum, never the critical crimson", () => {
    for (const file of [
      src("catalog", "MachineArticle.tsx"),
      src("catalog", "CatalogWikiView.tsx"),
      src("learning", "LearningHome.tsx"),
    ]) {
      expect(code(file)).not.toMatch(/tone[=:]\s*\{?\s*["']alert["']/);
      expect(code(file)).not.toMatch(/\?\s*["']alert["']/);
    }
  });

  it("draws the Upkeep card on Learning's palette, its flag in the same plum as the page's badge", () => {
    const block = code(upkeepBlock());
    expect(block).not.toMatch(/var\(--st-/);
    expect(block).toMatch(/\.stu__flag\s*\{[^}]*color:\s*var\(--wk-warn\)/);
  });

  it("makes every Save solid blue with its on-colour, never orange", () => {
    const rule = (css: string, selector: string) => {
      const at = code(css).indexOf(`${selector} {`);
      if (at < 0) throw new Error(`${selector} not found`);
      return code(css).slice(at, code(css).indexOf("}", at));
    };
    const saves = [
      rule(STYLESHEETS["wiki/wiki.css"], ".wk__btn--primary"),
      rule(STYLESHEETS["catalog/catalog.css"], ".cat__btn--primary"),
      rule(STYLESHEETS["catalog/catalog.css"], ".ssc__save"),
    ];
    for (const r of saves) {
      expect(r).toMatch(/background:\s*var\(--(wk|cat)-live\)/);
      expect(r).toMatch(/color:\s*var\(--(wk|cat)-live-on\)/);
      expect(r).not.toMatch(/hero/);
    }
  });

  it("keeps crimson off a quiet button's hover, and gives Retire its own danger style", () => {
    const wiki = code(STYLESHEETS["wiki/wiki.css"]);
    expect(wiki).not.toMatch(/\.wk__btn--quiet:hover\s*\{[^}]*--wk-alert/);
    expect(wiki).toMatch(/\.wk__btn--danger\s*\{[^}]*--wk-alert/);
    expect(src("wiki", "WikiEditor.tsx")).toMatch(/wk__btn--danger[\s\S]{0,80}onClick=\{onRetire\}/);
  });
});
