import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ONE STYLESHEET OWNS A CLASS (voice-review round, Sep 27 2026).
 *
 * Every stylesheet in this app is global. The app is split into chunks, and a
 * chunk's CSS stays in the page once it has loaded, so two files that both
 * define `.pk-title` style each other's screens as soon as both have been
 * opened on the same iPad — in whichever order they happened to load.
 *
 * That is how three screens borrowed Relay's look without anyone asking:
 *
 *   - the Packages sheet a client is shown (`.pk-sheet`, `.pk-title`,
 *     `.pk-body`, `.pk-foot`, `.pk-lede`, `.pk-step`, `.pk-steps`) took
 *     Relay's italic capitals and a scroll area capped at 64% of the screen
 *     once My Studio had been opened;
 *   - a shared plan's text on Goals & Focus (`.nb`, the note body) took the
 *     Now Bar's grid and border (noted as open in the client codex round);
 *   - the Pulse report (`.sr`) and Relay's shift rings shared a root, so one
 *     could turn the other's row into a column.
 *
 * Relay's side of each was renamed (`rk-`, `rnb`, `shr`). This test keeps it
 * that way: a class that two stylesheets both define as a plain `.name` rule
 * fails here. Scoped rules (`.pk-sheet .x`, `.dark .x`, `button.x`) are not
 * definitions and are not counted — extending another file's class on
 * purpose is fine; owning the same name twice is not.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * Deliberately shared roots, each with its reason. The last test fails if a
 * name here stops being shared, so the list cannot rot.
 */
const SHARED: Record<string, string> = {
  dark: "the theme switch: every token file scopes its dark values under .dark",
  cx: "the client codex's tokens, kit and page styles are one family on one root",
  "cx-kit": "the codex tokens and the codex kit share the kit's root on purpose",
  pl: "the Planner shell: its tokens (relay/board/relay.css) and its layout (relay/planner.css)",
};

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith(".css")) out.push(path);
  }
  return out;
}

/** Classes a stylesheet defines as a plain `.name` rule (pseudo-classes allowed). */
function plainClassRules(css: string): Set<string> {
  const found = new Set<string>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorBeforeBrace = /([^{}]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = selectorBeforeBrace.exec(text))) {
    const selectors = m[1].trim();
    if (!selectors || selectors.startsWith("@")) continue;
    for (const part of selectors.split(",")) {
      const plain = part.trim().match(/^\.([A-Za-z_][\w-]*)(?::{1,2}[a-z-]+(?:\([^)]*\))?)*$/);
      if (plain) found.add(plain[1]);
    }
  }
  return found;
}

function owners(): Map<string, string[]> {
  const byClass = new Map<string, string[]>();
  for (const file of cssFiles(SRC)) {
    for (const cls of plainClassRules(readFileSync(file, "utf8"))) {
      const list = byClass.get(cls) ?? [];
      list.push(relative(SRC, file));
      byClass.set(cls, list);
    }
  }
  return byClass;
}

describe("plainClassRules", () => {
  it("counts a plain rule and its pseudo-classes, not a scoped or compound one", () => {
    const css = `
      /* .ignored { } */
      .a { color: red; }
      .b:hover, .c::before { color: red; }
      .scope .d { color: red; }
      button.e { color: red; }
      .f.g { color: red; }
      @media (max-width: 600px) { .h { color: red; } }
      @keyframes spin { from { opacity: 0; } to { opacity: 1; } }
    `;
    expect([...plainClassRules(css)].sort()).toEqual(["a", "b", "c", "h"]);
  });
});

// Each test reads every stylesheet in the app: a second alone, but over the
// 5-second default on a busy PC (Sep 28 2026, five builds testing at once).
describe("one stylesheet owns each class", { timeout: 30_000 }, () => {
  it("no two stylesheets define the same class as a plain rule", () => {
    const clashes = [...owners()]
      .filter(([cls, files]) => files.length > 1 && !(cls in SHARED))
      .map(([cls, files]) => `.${cls} — ${files.join(", ")}`);
    expect(clashes).toEqual([]);
  });

  it("the Packages sheet's classes belong to the Packages sheet alone", () => {
    const packages = plainClassRules(readFileSync(join(SRC, "features/packages/packages.css"), "utf8"));
    const elsewhere = [...owners()]
      .filter(([cls, files]) => packages.has(cls) && files.some((f) => !f.startsWith(join("features", "packages"))))
      .map(([cls]) => `.${cls}`);
    expect(elsewhere).toEqual([]);
  });

  it("every deliberately shared name is still shared", () => {
    const all = owners();
    const stale = Object.keys(SHARED).filter((cls) => (all.get(cls)?.length ?? 0) < 2);
    expect(stale).toEqual([]);
  });
});
