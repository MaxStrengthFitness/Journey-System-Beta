import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * EVERY COMPONENT THAT DRAWS WITH ford.css IMPORTS IT — a scan of the files.
 *
 * Client codex, phase 19 (Sep 2026). The app is split into chunks, and a
 * stylesheet arrives with the chunk that imports it. ford.css used to come in
 * with the profile through the FORD hub; the codex deleted the hub (phase 10)
 * and moved its detail dialog onto the FORD page, and after that only the
 * session and Operations chunks imported the file. The dialog drew with the
 * capture sheet's classes and opened UNSTYLED on the profile of an iPad that
 * had not started a session yet — no test could see it, because tests load
 * no stylesheets at all.
 *
 * So this reads the source: every component that names one of ford.css's
 * classes must import ford.css itself, not rely on a sibling that happens to
 * sit in the same chunk today.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const FORD_CSS = join(HERE, "ford.css");

/** Every class ford.css defines. */
function fordClasses(): Set<string> {
  const css = readFileSync(FORD_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...css.matchAll(/\.(ford-[\w-]+)/g)].map((m) => m[1]));
}

/** Every component under src/, tests left out. */
function components(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...components(full));
    else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

/** The ford.css classes a component names, as a class-list word ("ford-btn", `ford-mark ford-mark--${p}`). */
function fordClassesUsed(text: string, classes: ReadonlySet<string>): string[] {
  const used = new Set<string>();
  for (const m of text.matchAll(/(?:^|["'`\s{])(ford-[\w-]+)(?=["'`\s$}]|$)/g)) {
    if (classes.has(m[1])) used.add(m[1]);
  }
  return [...used].sort();
}

/** Whether a component imports ford.css (from any relative path). */
function importsFordCss(text: string): boolean {
  return /^\s*import\s+["'][^"']*\/ford\.css["'];?\s*$/m.test(text);
}

describe("ford.css", () => {
  const classes = fordClasses();

  it("the scan reads what it should", () => {
    expect(classes.has("ford-capture")).toBe(true);
    expect(classes.has("ford-letter")).toBe(true);
    expect(fordClassesUsed('<div className="ford-capture p-4">', classes)).toEqual(["ford-capture"]);
    expect(fordClassesUsed("className={`ford-letter ford-letter--${p}`}", classes)).toEqual(["ford-letter"]);
    // An anchor id or a page's own prefix is not one of ford.css's classes.
    expect(fordClassesUsed('<Card id="ford-family" className="fordpg-notice" />', classes)).toEqual([]);
    expect(importsFordCss('import "./ford.css";')).toBe(true);
    expect(importsFordCss('import "../ford/ford.css";')).toBe(true);
    expect(importsFordCss('import "./ford.tokens.css";')).toBe(false);
    expect(importsFordCss("// ford.css is imported elsewhere")).toBe(false);
  });

  it("is imported by every component that draws with it", () => {
    const users: string[] = [];
    for (const full of components(SRC)) {
      const text = readFileSync(full, "utf8");
      const used = fordClassesUsed(text, classes);
      if (used.length === 0) continue;
      const rel = relative(SRC, full).split(sep).join("/");
      users.push(rel);
      expect(importsFordCss(text), `${rel} draws with ${used.join(", ")} but does not import ford.css`).toBe(true);
    }
    // The scan finds the components it exists for, the detail dialog first.
    expect(users).toContain("features/ford/FordDetailDialog.tsx");
    expect(users).toContain("features/ford/FordQuickCapture.tsx");
  });
});
