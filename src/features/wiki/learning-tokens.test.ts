import { readFileSync } from "node:fs";
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
 * If one of these fails, the fix is the token file, not the test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), "utf8");
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
function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
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
      expect(block[`--${prefix}-warn-strong`]).toBe(block[`--${prefix}-warn`]);
    }
    expect(p.light[`--${prefix}-warn`]).toBe(eq.light["--eq-warn"]);
  });

  it("keeps a warning readable on its card, in both themes", () => {
    expect(ratio(p.light[`--${prefix}-warn`], p.light[`--${prefix}-surface`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.light[`--${prefix}-warn`], p.light[`--${prefix}-warn-fill`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.dark[`--${prefix}-warn`], p.dark[`--${prefix}-surface`])).toBeGreaterThanOrEqual(4.5);
  });

  it("puts readable text on the orange button, in both themes", () => {
    // Both Learning buttons fill with --*-hero-text and write in --*-hero-on.
    expect(ratio(p.light[`--${prefix}-hero-on`], p.light[`--${prefix}-hero-text`])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(p.dark[`--${prefix}-hero-on`], p.dark[`--${prefix}-hero-text`])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the critical colour", () => {
  it("is the app's crimson in the Catalog and the Academy", () => {
    expect(palettes.wk.light["--wk-alert"]).toBe(eq.light["--eq-alert"]);
    expect(palettes.wk.dark["--wk-alert"]).toBe(eq.dark["--eq-alert"]);
  });
});
