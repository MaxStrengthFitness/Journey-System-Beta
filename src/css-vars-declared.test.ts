import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * EVERY var(--x) A STYLESHEET READS IS DECLARED SOMEWHERE (type and depth,
 * phase 3, Oct 4 2026; the plan's rule 7).
 *
 * A custom property that nothing declares is not an error anywhere. The
 * declaration that reads it becomes invalid when the page is drawn, so a
 * `box-shadow: var(--x-elev-2), var(--x-panel-highlight)` with one name
 * undefined draws NO shadow at all, and the box goes flat with no warning in
 * the console, the typecheck or the build. The review of the type-and-depth
 * plan found three such names a later phase would have read (--psub-elev-1,
 * --jg-elev-2, --wk-elev-3); each would have failed this.
 *
 * For every stylesheet the round touches (FILES, grown in each phase's
 * commit), every var(--x) WITHOUT a fallback must have a declaration of --x
 * somewhere in src: `--x:` in any .css file, or the name set from a .ts or
 * .tsx file (a style object's "--x" key, setProperty("--x"), or a Tailwind
 * [--x:value] class). A var(--x, fallback) is skipped: the fallback is its
 * answer when --x is missing. The fallback's own var() is checked.
 *
 * If this fails, declare the token (in its family's tokens file, light and
 * dark) or fix the name; never add a fallback just to quiet it.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The stylesheets the type-and-depth round has touched so far. */
const FILES = [
  // Phase 1 and 2: the faces and the body weight.
  "index.css",
  // Phase 3: the depth tokens and every palette copy that carries them.
  "features/equipment/equipment.tokens.css",
  "features/admin/admin.tokens.css",
  "features/studio-tasks/studio-tasks.css",
  "features/wiki/wiki.tokens.css",
  "features/briefing/briefing.tokens.css",
  "features/subjective-report/subjective-report.css",
  "features/ford/ford.tokens.css",
  "features/calendar/calendar.tokens.css",
  "features/trainer-profile/trainer-profile.tokens.css",
  "features/routine-builder/routine-builder.tokens.css",
  "features/client-profile/profile-nav.css",
  "features/journey-grid/journey-grid.tokens.css",
  "features/client-codex/codex.tokens.css",
  "features/progress-report/progress-report.tokens.css",
  "features/clinical-review/clinical-review.css",
  // Phase 5: the rooms' shelves.
  "features/hub-schedule/day-header.css",
  "features/hub-schedule/hub-grid.css",
  "features/my-studio/my-studio.css",
  "features/wiki/wiki.css",
  "features/admin/shell/ops.css",
  // Phase 6: the codex kit's panels, heads, wells and buttons.
  "features/client-codex/kit/kit.css",
  "features/client-codex/codex.css",
];

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

/** Every `--x:` a stylesheet declares (not `.block--modifier:hover`, which follows a word character). */
function declaredInCss(css: string): string[] {
  return [...stripCssComments(css).matchAll(/(^|[^\w-])(--[\w-]+)\s*:/g)].map((m) => m[2]);
}

/** Every custom property a script sets: a quoted "--x", or a Tailwind [--x:value] class. */
function declaredInScript(source: string): string[] {
  const quoted = [...source.matchAll(/["'`](--[\w-]+)["'`]/g)].map((m) => m[1]);
  const arbitrary = [...source.matchAll(/\[(--[\w-]+):/g)].map((m) => m[1]);
  return [...quoted, ...arbitrary];
}

/** Every var(--x) with no fallback (the fallback's own var() included). */
function readWithoutFallback(css: string): string[] {
  return [...stripCssComments(css).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]);
}

/**
 * Tailwind's own theme, which index.css imports (`@import "tailwindcss"`):
 * it declares --spacing and the rest, which index.css's safe-area utilities
 * read. Read from the package, so a name Tailwind does not declare still fails.
 */
const TAILWIND_THEME = join(SRC, "..", "node_modules", "tailwindcss", "theme.css");

const DECLARED = new Set<string>([
  ...filesUnder(SRC, /\.css$/).flatMap((p) => declaredInCss(read(p))),
  ...filesUnder(SRC, /\.tsx?$/)
    .filter((p) => !/\.test\.tsx?$/.test(p))
    .flatMap((p) => declaredInScript(read(p))),
  ...declaredInCss(read(TAILWIND_THEME)),
]);

describe("every var() a touched stylesheet reads without a fallback is declared", () => {
  it("lists only files that exist", () => {
    const all = new Set(filesUnder(SRC, /\.css$/).map((p) => relative(SRC, p).replace(/\\/g, "/")));
    for (const file of FILES) expect(all.has(file), file).toBe(true);
    // Tailwind's theme counts as declared only because index.css imports it.
    expect(read(join(SRC, "index.css"))).toContain('@import "tailwindcss";');
  });

  it.each(FILES)("%s", (file) => {
    const missing = [...new Set(readWithoutFallback(read(join(SRC, file))))].filter((name) => !DECLARED.has(name));
    expect(missing, `${file} reads tokens nothing declares`).toEqual([]);
  });
});

describe("the scanner itself", () => {
  it("finds a declaration and ignores a BEM modifier before a pseudo-class", () => {
    const css = ":root { --a: 1px; }\n.cx-btn--quiet:hover { color: red; }\n.x{--b :2px}";
    expect(declaredInCss(css)).toEqual(["--a", "--b"]);
  });

  it("reads var() with no fallback, skips one with a fallback, and checks the fallback's own var()", () => {
    const css = ".x { a: var(--one); b: var(--two, 4px); c: var(--three, var(--four)); /* var(--gone) */ }";
    expect(readWithoutFallback(css)).toEqual(["--one", "--four"]);
  });

  it("counts a token a script sets", () => {
    expect(declaredInScript(`style={{ "--hs-lane": 3 }} el.style.setProperty('--x-y', v) className="[--psub-h:52px]"`)).toEqual([
      "--hs-lane",
      "--x-y",
      "--psub-h",
    ]);
  });

  it("now declares the three names the review found undeclared", () => {
    // Before phase 3 declared them, these were read by the plan's later
    // phases and declared nowhere.
    for (const name of ["--psub-elev-1", "--jg-elev-2", "--wk-elev-3"]) expect(DECLARED.has(name), name).toBe(true);
    expect(DECLARED.has("--psub-elev-9")).toBe(false);
  });
});
