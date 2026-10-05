import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE FONTS, SELF-HOSTED (type and depth, phase 1, Oct 4 2026).
 *
 * Saira Condensed, the display face, used to load from Google Fonts through
 * a render-blocking @import on the first line of index.css, with Inter in
 * the same request although nothing used it. Three hops to a third party,
 * `display=swap` so headings reflowed on slow studio Wi-Fi, and with Google
 * out of reach every display heading fell back to a slanted Geist for the
 * whole visit. The face is now four files in src/assets/fonts, vendored
 * from @fontsource/saira-condensed 5.3.0 at 700 and 800 (latin and
 * latin-ext), and Vite bundles them same-origin like Geist. This file holds:
 *
 *   1. No stylesheet loads a font from Google, and index.css names no Inter.
 *   2. Every @font-face for the display face is upright (`normal`) at 700
 *      or 800, its file exists and is a WOFF2, and each weight has a latin
 *      and a latin-ext face. No italic face: Saira Condensed has no italic
 *      file, and the slant on the brand moments is the browser's own.
 *   3. The session's and the routine builder's font tokens are the app's two
 *      faces (`var(--font-sans)`, `var(--font-display)`), never a literal
 *      copy of a face's name.
 *   4. No rule asks the display face for 600 or 900. Neither is loaded: 600
 *      renders 700 and 900 renders 800, so a rule asking for either says a
 *      weight the screen never shows. The four briefing rules that asked for
 *      900 moved to 800 in this phase, so this lands green.
 *   5. `font-black` is 800, and the studio's name on the frame (the brand
 *      moment that asked for no weight and so rendered 600) asks for 800.
 *
 * If one of these fails, the fix is the stylesheet, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
/** A file with its line endings made \n: a Windows checkout (core.autocrlf) has \r\n. */
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const CSS_FILES = filesUnder(SRC, /\.css$/).map((p) => relative(SRC, p).replace(/\\/g, "/"));
const TSX_FILES = filesUnder(SRC, /\.tsx$/)
  .filter((p) => !/\.test\.tsx$/.test(p))
  .map((p) => relative(SRC, p).replace(/\\/g, "/"));

const INDEX_CSS = read("index.css");
const INDEX_RULES = stripComments(INDEX_CSS);

type Rule = { file: string; prelude: string; body: string };

/** Every innermost block of a stylesheet: its prelude (the selector, or an at-rule) and its body. */
function rulesOf(file: string): Rule[] {
  const css = stripComments(read(file));
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // A nested rule's prelude can carry its parent's declarations before it.
    const prelude = m[1].split(";").pop()!.trim();
    out.push({ file, prelude, body: m[2] });
  }
  return out;
}

const ALL_RULES = CSS_FILES.flatMap(rulesOf);

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/** The value of every custom property declared anywhere in src's stylesheets, by name. */
const CUSTOM_PROPS = new Map<string, string[]>();
for (const rule of ALL_RULES) {
  for (const m of rule.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
    const values = CUSTOM_PROPS.get(m[1]) ?? [];
    values.push(m[2].trim());
    CUSTOM_PROPS.set(m[1], values);
  }
}

/** The display face's family name, read from the @theme's --font-display. */
const DISPLAY_FAMILY = (() => {
  const m = INDEX_RULES.match(/--font-display\s*:\s*(['"])([^'"]+)\1/);
  if (!m) throw new Error("index.css: --font-display is not declared with a quoted family first");
  return m[2];
})();

/**
 * The custom properties that resolve to the display face: --font-display,
 * and every token whose value starts with the face's name or with another
 * display token (--jg-font-display, --cx-font-display, --cr-font-display,
 * ...). A token that is never declared (--eq-font-display) falls back to
 * what follows it, so it is not one.
 */
const DISPLAY_TOKENS = (() => {
  const tokens = new Set<string>(["--font-display"]);
  const startsWithFace = (v: string) =>
    v.startsWith(`"${DISPLAY_FAMILY}"`) || v.startsWith(`'${DISPLAY_FAMILY}'`);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, values] of CUSTOM_PROPS) {
      if (tokens.has(name)) continue;
      const isDisplay = values.some((v) => {
        if (startsWithFace(v)) return true;
        const first = v.match(/^var\(\s*(--[\w-]+)/);
        return !!first && tokens.has(first[1]);
      });
      if (isDisplay) {
        tokens.add(name);
        grew = true;
      }
    }
  }
  return tokens;
})();

/** Does a font-family (or font shorthand) value draw in the display face? */
function namesDisplayFace(value: string): boolean {
  if (value.includes(`"${DISPLAY_FAMILY}"`) || value.includes(`'${DISPLAY_FAMILY}'`)) {
    // A face named only as some token's fallback is not the face asked for.
    const first = value.match(/^var\(\s*(--[\w-]+)/);
    if (!first) return true;
    if (CUSTOM_PROPS.has(first[1]) || first[1] === "--font-display") return DISPLAY_TOKENS.has(first[1]);
    return true;
  }
  const first = value.match(/var\(\s*(--[\w-]+)/);
  return !!first && DISPLAY_TOKENS.has(first[1]);
}

/** The numeric weights a font-weight value can be, through any custom property it reads. */
function weightsOf(value: string, seen = new Set<string>()): string[] {
  const v = value.replace(/\s*!important$/, "").trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (ref) {
    if (seen.has(ref[1])) return [];
    seen.add(ref[1]);
    const values = CUSTOM_PROPS.get(ref[1]);
    if (values) return values.flatMap((x) => weightsOf(x, seen));
    return ref[2] ? weightsOf(ref[2], seen) : [];
  }
  if (v === "bold") return ["700"];
  if (v === "normal") return ["400"];
  return /^\d+$/.test(v) ? [v] : [];
}

type Face = { family: string; style: string; weight: string; src: string; range: string };

const SAIRA_FACES: Face[] = [...INDEX_RULES.matchAll(/@font-face\s*\{([^{}]*)\}/g)]
  .map((m) => {
    const one = (prop: string) => declared(m[1], prop)[0] ?? "";
    return {
      family: one("font-family").replace(/^['"]|['"]$/g, ""),
      style: one("font-style"),
      weight: one("font-weight"),
      src: one("src"),
      range: one("unicode-range"),
    };
  })
  .filter((f) => f.family === DISPLAY_FAMILY);

/* ------------------------------------------------------------------ */

describe("no font comes from a third party", () => {
  it("index.css imports nothing from Google and names no Inter", () => {
    expect(INDEX_RULES).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(INDEX_RULES).not.toMatch(/\bInter\b/);
  });

  it("no stylesheet in src, and not index.html, loads a font from Google", () => {
    const found = CSS_FILES.filter((f) => /fonts\.(?:googleapis|gstatic)\.com/.test(stripComments(read(f))));
    const html = readFileSync(resolve(SRC, "..", "index.html"), "utf8");
    if (/fonts\.(?:googleapis|gstatic)\.com/.test(html)) found.push("index.html");
    expect(found).toEqual([]);
  });
});

describe("the display face is self-hosted", () => {
  it("is the family --font-display names first", () => {
    expect(DISPLAY_FAMILY).toBe("Saira Condensed");
  });

  it("is declared upright, at 700 and 800 only, with a latin and a latin-ext face for each weight", () => {
    expect(SAIRA_FACES.length).toBeGreaterThan(0);
    for (const face of SAIRA_FACES) {
      expect(face.style, face.src).toBe("normal");
      expect(["700", "800"], face.src).toContain(face.weight);
      expect(face.range, `${face.src} has no unicode-range`).not.toBe("");
    }
    for (const weight of ["700", "800"]) {
      const files = SAIRA_FACES.filter((f) => f.weight === weight).map((f) => f.src);
      expect(files.some((s) => /-latin-\d+-normal\.woff2/.test(s)), `latin ${weight}`).toBe(true);
      expect(files.some((s) => /-latin-ext-\d+-normal\.woff2/.test(s)), `latin-ext ${weight}`).toBe(true);
    }
  });

  it("the latin face covers the basic Latin range, so latin-ext is fetched only when a character needs it", () => {
    for (const face of SAIRA_FACES.filter((f) => /-latin-\d+-normal/.test(f.src))) {
      expect(face.range).toMatch(/U\+0000-00FF/);
    }
    for (const face of SAIRA_FACES.filter((f) => /-latin-ext-/.test(f.src))) {
      expect(face.range).not.toMatch(/U\+0000-00FF/);
    }
  });

  it("declares no italic or oblique face (Saira Condensed has no italic file)", () => {
    const styles = [...INDEX_RULES.matchAll(/@font-face\s*\{([^{}]*)\}/g)].flatMap((m) => declared(m[1], "font-style"));
    expect(styles.filter((s) => s !== "normal")).toEqual([]);
  });

  it("points every face at a WOFF2 file that is really there, beside the licence", () => {
    for (const face of SAIRA_FACES) {
      const urls = [...face.src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
      expect(urls.length, face.src).toBeGreaterThan(0);
      expect(face.src).toMatch(/format\(\s*['"]woff2['"]\s*\)/);
      for (const url of urls) {
        expect(url, "a font is bundled, never fetched from elsewhere").not.toMatch(/^(?:https?:)?\/\//);
        const file = resolve(SRC, url);
        expect(existsSync(file), `${url} is missing`).toBe(true);
        // A WOFF2 file starts with its signature, "wOF2".
        expect(readFileSync(file).subarray(0, 4).toString("latin1"), url).toBe("wOF2");
        expect(existsSync(join(dirname(file), "LICENSE")), `the OFL licence beside ${url}`).toBe(true);
      }
    }
  });
});

describe("the font tokens name the app's two faces", () => {
  it("the Active Session's are --font-sans and --font-display", () => {
    const css = stripComments(read("features/journey-grid/journey-grid.tokens.css"));
    expect(declared(css, "--jg-font")).toEqual(["var(--font-sans)"]);
    expect(declared(css, "--jg-font-display")).toEqual(["var(--font-display)"]);
  });

  it("the routine builder's are --font-sans and --font-display", () => {
    const css = stripComments(read("features/routine-builder/routine-builder.tokens.css"));
    expect(declared(css, "--rb-font")).toEqual(["var(--font-sans)"]);
    expect(declared(css, "--rb-font-display")).toEqual(["var(--font-display)"]);
  });

  it("no stylesheet outside index.css writes the display face's name as a token's value", () => {
    const found: string[] = [];
    for (const rule of ALL_RULES) {
      if (rule.file === "index.css") continue;
      for (const m of rule.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
        if (m[2].trim().startsWith(`"${DISPLAY_FAMILY}"`) || m[2].trim().startsWith(`'${DISPLAY_FAMILY}'`)) {
          found.push(`${rule.file}: ${m[1]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});

describe("no rule asks the display face for a weight it does not have", () => {
  it("finds the display face's rules (the scan is reading something)", () => {
    const rules = ALL_RULES.filter((r) =>
      [...declared(r.body, "font-family"), ...declared(r.body, "font")].some(namesDisplayFace),
    );
    // About sixty on Oct 4 2026; far fewer means the scan has stopped seeing them.
    expect(rules.length).toBeGreaterThan(40);
  });

  it("never 600 or 900 in the same rule as the display face", () => {
    const found: string[] = [];
    for (const rule of ALL_RULES) {
      const families = declared(rule.body, "font-family");
      const shorthands = declared(rule.body, "font");
      if (![...families, ...shorthands].some(namesDisplayFace)) continue;
      const weights = [
        ...declared(rule.body, "font-weight").flatMap((w) => weightsOf(w)),
        ...shorthands.filter(namesDisplayFace).flatMap((s) => s.match(/\b[1-9]00\b/g) ?? []),
      ];
      const bad = weights.filter((w) => w === "600" || w === "900");
      if (bad.length) found.push(`${rule.file}: ${rule.prelude} asks for ${bad.join(", ")}`);
    }
    expect(found).toEqual([]);
  });

  it("no class list pairs font-display with font-semibold or a bracketed 600 / 900", () => {
    const found: string[] = [];
    for (const file of TSX_FILES) {
      const text = read(file);
      for (const m of text.matchAll(/["'`]([^"'`]*\bfont-display\b[^"'`]*)["'`]/g)) {
        if (/(?:^|\s)(?:[\w-]+:)*font-(?:semibold|\[600\]|\[900\])(?=\s|$)/.test(m[1])) found.push(`${file}: ${m[1]}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe("the weight ladder's top", () => {
  it("font-black is 800", () => {
    expect(declared(INDEX_RULES, "--font-weight-black")).toEqual(["800"]);
  });

  it("the studio's name on the frame asks for 800", () => {
    const header = read("components/AppHeader.tsx");
    const name = header.match(/"(font-display italic[^"]*)"/);
    expect(name, "the studio name's class list").not.toBeNull();
    expect(name![1].split(/\s+/)).toContain("font-extrabold");
  });
});
