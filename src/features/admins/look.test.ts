import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE ADMINS DASHBOARD'S LOOK, HELD (the Admins room, Sep 28 2026). A scan of
 * admins.css against CLAUDE.md's rules for every screen:
 *
 *   1. No raw colour. Colours are the admin palette (admin.tokens.css), which
 *      admin-tokens.test.ts holds to the app's.
 *   2. No name is ever cut short: no ellipsis, no line clamp.
 *   3. Every control here is at least 40px tall.
 *   4. Every class starts with hq-, so no other stylesheet can own one.
 *
 * If one of these fails, the fix is the stylesheet, not the test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "admins.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^@import[^;]*;/gm, "");

function bodyOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : "";
}

describe("admins.css", () => {
  it("names no raw colour", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css.match(/\brgba?\(/g) ?? []).toEqual([]);
  });

  it("never cuts a name short", () => {
    expect(css).not.toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(css).not.toMatch(/line-clamp/);
  });

  it("keeps every control at 40px or taller", () => {
    for (const control of [".hq-nav__item", ".hq-place", ".hq-chip", ".hq-find", ".hq-result", ".hq-row__open", ".hq-search__input", ".hq-tab"]) {
      const body = bodyOf(control);
      const px = Number(body.match(/min-height:\s*(\d+)px/)?.[1] ?? 0);
      expect(px, control).toBeGreaterThanOrEqual(40);
    }
  });

  it("defines only hq- classes", () => {
    const defined = [...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    const foreign = defined.filter((c) => !c.startsWith("hq") && c !== "dark");
    expect(foreign).toEqual([]);
  });
});
