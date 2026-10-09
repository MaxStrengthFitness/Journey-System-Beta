import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE ACTIVE SESSION'S COLOUR RULES (the Navy Frame, Oct 4 2026).
 *
 * contrast.test.ts measures the --jg-* pairs; this holds the rules in
 * journey-grid.css that draw them, and ties the session's palette to the
 * Hub's, so moving from the Hub into a session no longer switches palettes
 * on the screen trainers see most. What the rules promise:
 *
 *   - the one loud orange (Finish, the paused clock's button, the routine's
 *     number chips) is the logo orange with navy words, --jg-go / --jg-go-on,
 *     and Finish restates its fill on :hover (an iPad keeps hover after a
 *     tap); nothing reads a white "hero-on" word colour any more;
 *   - an elevated flag is an opaque amber, never an rgba amber wash (over
 *     the dark navy the wash turns grey-teal);
 *   - the session's neutrals, ink and accents are the Hub's, value for value
 *     (the dark header band and Today column are the session's own steps);
 *   - every control draws its edge in --jg-control-edge, the Hub's 3:1
 *     control edge, and the sticky separators keep the softer line (AJ,
 *     Oct 4 2026: "yes" to firmer outlines).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** A stylesheet with its line endings made \n, its comments and imports taken out. */
const stylesheet = (path: string) =>
  readFileSync(join(SRC, path), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]*;/g, "");

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

interface Rule {
  selectors: string[];
  body: Record<string, string>;
}

/** Every rule in a stylesheet, nested ones included, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
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

/** Every custom property declared in the token block that opens with `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = css.indexOf("{", at);
  const body = css.slice(open + 1, css.indexOf("}", open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Follow var() chains inside one theme's tokens to the value. */
function resolve(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  if (v === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (!ref) return v;
  if (depth > 4) throw new Error(`var() cycle at ${name}`);
  return resolve(vars, ref[1], depth + 1);
}

/** Every .css file under src. */
function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith(".css")) out.push(path);
  }
  return out;
}

const SESSION = stylesheet("features/journey-grid/journey-grid.css");
const GRID_TOKENS = stylesheet("features/journey-grid/journey-grid.tokens.css");
const EQ_TOKENS = stylesheet("features/equipment/equipment.tokens.css");

const LIGHT_BLOCK = "\n:root {";
const DARK_BLOCK = '\n.dark,\n[data-theme="dark"] {';
const FALLBACK_BLOCK = ':root:not(.light):not([data-theme="light"]):not(.dark):not([data-theme="dark"]) {';

const grid = {
  light: block(GRID_TOKENS, LIGHT_BLOCK),
  dark: { ...block(GRID_TOKENS, LIGHT_BLOCK), ...block(GRID_TOKENS, DARK_BLOCK) },
};
const hub = {
  light: block(EQ_TOKENS, LIGHT_BLOCK),
  dark: { ...block(EQ_TOKENS, LIGHT_BLOCK), ...block(EQ_TOKENS, DARK_BLOCK) },
};

const LOUD_ORANGE = [
  [".jg-sbar__finish", "Finish, the session bar's one loud button"],
  [".jg-btn--hero", "the grid's hero button"],
  [".jg-nb__ord", "the Now Bar's routine number"],
  [".jg-order__row.is-current .jg-order__ord", "the routine sheet's current number"],
  [".jg-clock.is-paused .jg-clock__btn", "the paused clock's button"],
] as const;

describe("the one loud orange", () => {
  it.each(LOUD_ORANGE)("%s (%s) is the logo orange with navy words", (selector) => {
    const body = declared(SESSION, selector);
    expect(body.background).toBe("var(--jg-go)");
    expect(body.color).toBe("var(--jg-go-on)");
  });

  it("the hero button's edge is the same orange", () => {
    expect(declared(SESSION, ".jg-btn--hero")["border-color"]).toBe("var(--jg-go)");
  });

  it("Finish restates its fill on :hover, with no filter", () => {
    const hover = declared(SESSION, ".jg-sbar__finish:hover");
    expect(hover.background).toBe("var(--jg-go)");
    expect(hover.filter).toBeUndefined();
  });

  it("is the same in both themes and in the fallback, and is the Hub's go pair", () => {
    const fallback = block(GRID_TOKENS, FALLBACK_BLOCK);
    for (const name of ["--jg-go", "--jg-go-on"] as const) {
      expect(grid.dark[name]).toBe(grid.light[name]);
      expect(fallback[name]).toBe(grid.light[name]);
    }
    expect(grid.light["--jg-go"]).toBe(hub.light["--eq-go"]);
    expect(grid.light["--jg-go-on"]).toBe(hub.light["--eq-go-on"]);
  });

  it("no stylesheet reads a white hero-on word colour, and no token block defines one", () => {
    for (const theme of ["light", "dark"] as const) expect(grid[theme]["--jg-hero-on"]).toBeUndefined();
    const readers = cssFiles(SRC).filter((path) => readFileSync(path, "utf8").includes("--jg-hero-on"));
    expect(readers).toEqual([]);
  });

  it("a rule that paints the hero orange as a fill carries no words", () => {
    // --jg-hero is the orange of marks: bars, edges, the meter. Words on an
    // orange are --jg-go's.
    const worded = rules(SESSION).filter((r) => r.body.background === "var(--jg-hero)" && r.body.color !== undefined);
    expect(worded.map((r) => r.selectors.join(", "))).toEqual([]);
  });
});

describe("words on an accent fill", () => {
  it("no rule in the session's stylesheet sets white words", () => {
    const white = rules(SESSION).filter((r) => ["#fff", "#ffffff", "white"].includes((r.body.color ?? "").toLowerCase()));
    expect(white.map((r) => r.selectors.join(", "))).toEqual([]);
  });

  it("the rail's edit button, when on, takes the live on-colour (navy on the dark blue)", () => {
    expect(declared(SESSION, ".jg-rail__edit.is-on").color).toBe("var(--jg-live-on)");
  });
});

describe("an elevated flag", () => {
  it.each([
    [".jg-nb__flag--elevated", "the Now Bar's flag"],
    [".jg-sbar__flag", "the session bar's flag"],
    [".jg-flagcard", "a flag card in the What to know sheet"],
  ])("%s (%s) fills with the opaque amber", (selector) => {
    expect(declared(SESSION, selector).background).toBe("var(--jg-elevated-fill)");
  });

  it("no rule fills with an rgba amber wash", () => {
    const washes = rules(SESSION).filter((r) => /rgba\(\s*245\s*,\s*158\s*,\s*11/.test(r.body.background ?? ""));
    expect(washes.map((r) => r.selectors.join(", "))).toEqual([]);
  });

  it.each(["light", "dark"] as const)("the %s fill is an opaque, warm amber (red > green > blue)", (theme) => {
    const fill = resolve(grid[theme], "--jg-elevated-fill");
    expect(fill).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("one palette with the Hub", () => {
  // The session's own steps stay its own: the dark header band and sticky
  // column (one step above the cells), the strong border, the Today column's
  // fills and every rep-quality colour. (The hero's small words and fill
  // joined the Hub's in the review, Oct 4 2026.)
  const SHARED = {
    light: ["bg", "surface", "surface-2", "surface-3", "border", "ink", "ink-2", "ink-muted", "ink-faint", "hero", "hero-text", "hero-fill", "live", "live-text", "live-on", "go", "go-on"],
    dark: ["bg", "surface", "surface-3", "border", "ink", "ink-2", "ink-muted", "ink-faint", "hero", "hero-text", "hero-fill", "live", "live-text", "live-on", "go", "go-on"],
  } as const;

  for (const theme of ["light", "dark"] as const) {
    it.each(SHARED[theme])(`the session's %s is the Hub's in ${theme} mode`, (key) => {
      expect(resolve(grid[theme], `--jg-${key}`)).toBe(resolve(hub[theme], `--eq-${key}`));
    });
  }
});

describe("small words on every machine read in the muted ink, never the faint", () => {
  // The faint ink is 3.2:1, decorative only (the review, Oct 4 2026): the
  // setting keys, the "+ more", the Now Bar's kicker and readout, and the
  // Dial's word and legend are words a trainer reads mid-session.
  it.each([".jg-setting__k", ".jg-setting--more", ".jg-nb__kicker", ".jg-nb__readout"])("%s", (selector) => {
    expect(declared(SESSION, selector).color).toBe("var(--jg-ink-muted)");
  });

  it("the Dial (rating.css) sets no word in the faint ink", () => {
    expect(stylesheet("features/rating/rating.css")).not.toMatch(/(^|[\s;{])color:\s*var\(--eq-ink-faint\)/);
  });
});

/**
 * A control's edge (AJ, Oct 4 2026: "yes" to firmer outlines on the Active
 * Session's buttons). The Navy Frame left every control on the separators'
 * soft line, 1.87:1 on the Now Bar in light and 2.05 in dark. contrast.test.ts
 * holds the control edge at 3:1 on the bar and on a control's fill; this
 * holds which rules draw with it.
 */
const CONTROLS = [
  [".jg-nb__chip", "solid", "the Now Bar's setting chips"],
  [".jg-nb__sbtn", "solid", "the Now Bar's steppers"],
  [".jg-nb__unit", "solid", "the Now Bar's REPS | SEC switch"],
  [".jg-nb__qbtn", "solid", "the Now Bar's quality buttons"],
  [".jg-nb__obtn", "dashed", "the Now Bar's No set? buttons"],
  [".jg-nb__reason", "solid", "a skip reason"],
  [".jg-nb__where", "solid", "where the pain is"],
  // The first-session design round (Oct 8 2026, §4.6): the quiet "Academy's
  // starting range" a first time on a machine offers, No set?'s dashes.
  [".jg-nb__rangeask", "dashed", "the Now Bar's Academy's starting range"],
  [".jg-sbar__btn", "solid", "the session bar's Notes and Pulse"],
  [".jg-today__add", "dashed", "the Today column's add"],
  [".jg-order__find", "solid", "the routine sheet's Find"],
  [".jg-order__add", "dashed", "the routine sheet's add from the floor"],
  [".jg-keypop", "solid", "the Key"],
  [".jg-keypop__close", "solid", "the Key's Close"],
  [".jg-btn", "solid", "the grid's button"],
  [".jg-seg2", "solid", "the rail's two-way switch"],
  [".jg-rail__edit", "solid", "the rail's Edit"],
  [".jg-rail__older", "solid", "the rail's Older"],
] as const;

describe("a control's edge", () => {
  it.each(CONTROLS)("%s draws a %s edge in the control edge (%s)", (selector, style) => {
    expect(declared(SESSION, selector).border).toBe(`1px ${style} var(--jg-control-edge)`);
  });

  it("only the controls read it, so the separators and the rail never harden", () => {
    const readers = rules(SESSION)
      .filter((r) => Object.values(r.body).some((v) => v.includes("--jg-control-edge")))
      .flatMap((r) => r.selectors);
    expect([...readers].sort()).toEqual(CONTROLS.map(([selector]) => selector).sort());
  });

  it.each([
    [".jg-head", "border-bottom"],
    [".jg-corner", "border-right"],
    [".jg-machine", "border-right"],
    [".jg-stat", "border-right"],
    [".jg-head--live", "border-left"],
  ])("the sticky separator %s keeps the soft %s", (selector, side) => {
    expect(declared(SESSION, selector)[side]).toBe("1px solid var(--jg-border-strong)");
  });

  it.each(["light", "dark"] as const)("is the Hub's control edge in %s mode", (theme) => {
    expect(resolve(grid[theme], "--jg-control-edge")).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolve(grid[theme], "--jg-control-edge")).toBe(resolve(hub[theme], "--eq-border-strong"));
  });

  it("the system-preference copy carries the dark value", () => {
    expect(block(GRID_TOKENS, FALLBACK_BLOCK)["--jg-control-edge"]).toBe(grid.dark["--jg-control-edge"]);
  });
});
