import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * MY STUDIO'S PALETTE IS THE APP'S PALETTE (voice review follow-up, Sep 27
 * 2026).
 *
 * --st-* (Relay, Team, the Calendar's Relay and reminder strips, a note's
 * body on Goals & Focus, the Catalog's upkeep card) was a hand-copied set of
 * hex values. It matched equipment.tokens.css in light everywhere but the
 * flag, which said caution in amber where the whole app says it in plum, and
 * its dark values had drifted (white text on a light blue, green and orange).
 * learning-tokens.test.ts holds --wk-* to --eq-* by swapping the prefix; the
 * names here are My Studio's own, so the map is written out.
 *
 * If one of these fails, the fix is the token file, not the test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT = readFileSync(join(here, "..", "equipment", "equipment.tokens.css"), "utf8");
const STUDIO = readFileSync(join(here, "studio-tasks.css"), "utf8");

function readBlock(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`token block not found: ${selector}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("\n}", open);
  const out: Record<string, string> = {};
  const body = css.slice(open, close).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const eq = { light: readBlock(EQUIPMENT, ":root {"), dark: readBlock(EQUIPMENT, ".dark,") };
const st = { light: readBlock(STUDIO, ":root {"), dark: readBlock(STUDIO, ".dark, [data-theme") };

/** Every --st-* token with an original in equipment.tokens.css, by that original's name. */
const FROM_THE_APP: Readonly<Record<string, string>> = {
  "--st-bg": "--eq-bg",
  "--st-surface": "--eq-surface",
  "--st-surface-2": "--eq-surface-2",
  "--st-surface-3": "--eq-surface-3",
  "--st-border": "--eq-border",
  "--st-border-strong": "--eq-border-strong",
  "--st-ink": "--eq-ink",
  "--st-ink-2": "--eq-ink-2",
  "--st-ink-muted": "--eq-ink-muted",
  "--st-ink-faint": "--eq-ink-faint",
  "--st-done": "--eq-ok",
  "--st-done-fill": "--eq-ok-fill",
  "--st-live": "--eq-live",
  "--st-live-text": "--eq-live-text",
  "--st-live-fill": "--eq-live-fill",
  "--st-live-on": "--eq-live-on",
  "--st-flag": "--eq-warn",
  "--st-flag-fill": "--eq-warn-fill",
  "--st-hero": "--eq-hero",
  "--st-hero-text": "--eq-hero-text",
  "--st-hero-fill": "--eq-hero-fill",
  "--st-hero-on": "--eq-hero-on",
  "--st-alert": "--eq-alert",
  "--st-alert-fill": "--eq-alert-fill",
  "--st-radius": "--eq-radius",
  "--st-shadow": "--eq-shadow",
  // Depth (type and depth, phase 3, Oct 4 2026): the fills and lines a raised
  // or sunk box is drawn with, and the app's shadows by name, light and dark.
  "--st-raised": "--eq-raised",
  "--st-tray": "--eq-tray",
  "--st-edge": "--eq-edge",
  "--st-edge-control": "--eq-edge-control",
  "--st-divider": "--eq-divider",
  "--st-highlight": "--eq-highlight",
  "--st-elev-0": "--eq-elev-0",
  "--st-elev-1": "--eq-elev-1",
  "--st-elev-2": "--eq-elev-2",
  "--st-elev-3": "--eq-elev-3",
  "--st-elev-4": "--eq-elev-4",
  "--st-elev-5": "--eq-elev-5",
  "--st-elev-card": "--eq-elev-card",
  "--st-shelf": "--eq-shelf",
  "--st-press": "--eq-press",
  "--st-glow-live": "--eq-glow-live",
  "--st-glow-go": "--eq-glow-go",
  "--st-solid-light": "--eq-solid-light",
  "--st-go-light": "--eq-go-light",
  "--st-panel-highlight": "--eq-panel-highlight",
};

/** --st-* tokens the app has no original for, each with its reason. */
const MY_STUDIOS_OWN: Readonly<Record<string, string>> = {
  "--st-flag-border": "the edge of a flag's card; Learning's --wk-warn-border carries the same values",
  "--st-done-on": "text on a solid green button; the app has no --eq-ok-on, so its contrast is checked below",
};

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  expect(a, "a solid colour").toMatch(/^#[0-9a-f]{6}$/i);
  expect(b, "a solid colour").toMatch(/^#[0-9a-f]{6}$/i);
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("--st-* is the app's palette", () => {
  it("names every token it defines, either as the app's or with a reason", () => {
    for (const key of Object.keys(st.light)) {
      expect(key in FROM_THE_APP || key in MY_STUDIOS_OWN, `${key} is in neither list`).toBe(true);
    }
    for (const key of [...Object.keys(FROM_THE_APP), ...Object.keys(MY_STUDIOS_OWN)]) {
      expect(st.light[key], `${key} is listed but not defined`).toBeDefined();
    }
  });

  it("carries the app's value for each, in light", () => {
    for (const [mine, app] of Object.entries(FROM_THE_APP)) {
      expect(eq.light[app], `${app} exists`).toBeDefined();
      expect(st.light[mine], mine).toBe(eq.light[app]);
    }
  });

  it("and in dark, wherever the app's dark block sets it", () => {
    for (const [mine, app] of Object.entries(FROM_THE_APP)) {
      if (eq.dark[app] === undefined) continue;
      expect(st.dark[mine], `${mine} in .dark`).toBe(eq.dark[app]);
    }
  });

  it("sets every colour again in dark", () => {
    const geometry = new Set(["--st-radius"]);
    for (const key of Object.keys(st.light)) {
      if (geometry.has(key)) continue;
      expect(st.dark[key], `${key} has no dark value`).toBeDefined();
    }
  });

  it("says caution in the app's plum, and critical in its crimson", () => {
    expect(st.light["--st-flag"]).toBe(eq.light["--eq-warn"]);
    expect(st.dark["--st-flag"]).toBe(eq.dark["--eq-warn"]);
    expect(st.light["--st-alert"]).toBe(eq.light["--eq-alert"]);
    expect(st.dark["--st-alert"]).toBe(eq.dark["--eq-alert"]);
  });

  it("draws a flag's edge as Learning does", () => {
    const WIKI = readFileSync(join(here, "..", "wiki", "wiki.tokens.css"), "utf8");
    const wk = { light: readBlock(WIKI, ":root {"), dark: readBlock(WIKI, ".dark,") };
    expect(st.light["--st-flag-border"]).toBe(wk.light["--wk-warn-border"]);
    expect(st.dark["--st-flag-border"]).toBe(wk.dark["--wk-warn-border"]);
  });
});

describe("--st-* keeps what a person reads readable", () => {
  it("a flag on its card and on its own wash, in both themes", () => {
    expect(ratio(st.light["--st-flag"], st.light["--st-surface"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(st.light["--st-flag"], st.light["--st-flag-fill"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(st.dark["--st-flag"], st.dark["--st-surface"])).toBeGreaterThanOrEqual(4.5);
  });

  it("the words on a solid blue, orange and green button, in both themes", () => {
    for (const theme of [st.light, st.dark]) {
      expect(ratio(theme["--st-live-on"], theme["--st-live"]), "blue").toBeGreaterThanOrEqual(4.5);
      expect(ratio(theme["--st-hero-on"], theme["--st-hero-text"]), "orange").toBeGreaterThanOrEqual(4.5);
      expect(ratio(theme["--st-done-on"], theme["--st-done"]), "green").toBeGreaterThanOrEqual(4.5);
    }
  });

  it("blue words on the blue fill, in both themes", () => {
    for (const theme of [st.light, st.dark]) {
      expect(ratio(theme["--st-live-text"], theme["--st-live-fill"])).toBeGreaterThanOrEqual(4.5);
    }
    // Why --st-live-text exists: the dark --st-live is under 4.5 on its own fill
    // (the Navy Frame, Oct 4 2026), so it may draw edges and icons there, never words.
    expect(ratio(st.dark["--st-live"], st.dark["--st-live-fill"])).toBeLessThan(4.5);
  });

  it("no rule writes --st-live words on the --st-live fill", () => {
    const src = join(here, "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (p.endsWith(".css")) {
          const css = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
          for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (/background(-color)?:\s*var\(--st-live-fill\)/.test(m[2])
              && /(^|[;\s])color:\s*var\(--st-live\)/.test(m[2])) offenders.push(`${e.name}: ${m[1].trim()}`);
          }
        } else if (p.endsWith(".tsx")) {
          const tsx = readFileSync(p, "utf8");
          if (/bg-\[var\(--st-live-fill\)\][^"`]*text-\[var\(--st-live\)\]/.test(tsx)
            || /text-\[var\(--st-live\)\][^"`]*bg-\[var\(--st-live-fill\)\]/.test(tsx)) offenders.push(e.name);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });

  it("small orange words, in both themes", () => {
    expect(ratio(st.light["--st-hero-text"], st.light["--st-surface"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(st.dark["--st-hero-text"], st.dark["--st-surface"])).toBeGreaterThanOrEqual(4.5);
  });

  it("the muted ink, the smallest a person reads, in both themes", () => {
    expect(ratio(st.light["--st-ink-muted"], st.light["--st-surface"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(st.dark["--st-ink-muted"], st.dark["--st-surface"])).toBeGreaterThanOrEqual(4.5);
  });

  it("and white on the bright orange stays under 4.5 — which is why no label sits on it", () => {
    expect(ratio("#ffffff", st.light["--st-hero"])).toBeLessThan(4.5);
  });

  it("the app's one loud orange carries its navy words, in both themes", () => {
    // The Navy Frame (Oct 4 2026): Start session and every orange chip with
    // words are the logo orange (--eq-go) with navy words (--eq-go-on), never
    // white on an orange. The dark block may leave them to :root.
    for (const theme of [eq.light, { ...eq.light, ...eq.dark }]) {
      expect(ratio(theme["--eq-go-on"], theme["--eq-go"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
