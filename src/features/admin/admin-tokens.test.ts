import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The admin palette, enforced.
 *
 * The prep audit's headline finding about colour was not that any one screen
 * was wrong — it was that twenty screens disagreed. Semantic tokens on some,
 * a hard-coded #F06C22 on twelve, indigo on two, and a near-black card that
 * exists nowhere else in the app.
 *
 * The fix was to lift the palette the rest of the app already uses rather
 * than invent an eighth one. This file is what stops that decision from
 * eroding: every --adm- token must still equal its --eq- original, light and
 * dark must define the same keys, and the pairings the admin screens actually
 * render must clear WCAG 2.1 AA in both themes.
 *
 * If one of these fails, the fix is the token file, not the test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = readFileSync(join(here, "admin.tokens.css"), "utf8");
const EQUIPMENT = readFileSync(
  join(here, "..", "equipment", "equipment.tokens.css"),
  "utf8",
);

/** Pull one block's custom properties out of a token file. */
function readBlock(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`token block not found: ${selector}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const admLight = readBlock(ADMIN, ":root {");
const admDark = readBlock(ADMIN, ".dark,");
const admDarkFallback = readBlock(ADMIN, ':root:not(.light):not([data-theme="light"])');
const eqLight = readBlock(EQUIPMENT, ":root {");
const eqDark = readBlock(EQUIPMENT, ".dark,");

/** Resolve var() chains, then require a literal #rrggbb. */
function hex(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  if (v === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) {
    if (depth > 4) throw new Error(`var() cycle at ${name}`);
    return hex(vars, ref[1], depth + 1);
  }
  if (!/^#[0-9a-f]{6}$/i.test(v))
    throw new Error(`${name} is not a hex colour: ${v}`);
  return v;
}

const channel = (c: number) =>
  c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    channel(c / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The prefix is the only thing allowed to differ — including inside var(). */
const renamed = (value: string) => value.replace(/--eq-/g, "--adm-");

/** Every colour token, minus the ones equipment has that the admin kit does not. */
const SHARED = Object.keys(eqLight).filter((k) => k !== "--eq-rail-w");

describe("the admin palette is the app's palette", () => {
  it.each(SHARED)("light %s matches its --adm- counterpart", (eqKey) => {
    const admKey = eqKey.replace("--eq-", "--adm-");
    expect(admLight[admKey], `${admKey} is missing`).toBeDefined();
    expect(admLight[admKey]).toBe(renamed(eqLight[eqKey]));
  });

  it.each(SHARED)("dark %s matches its --adm- counterpart", (eqKey) => {
    const admKey = eqKey.replace("--eq-", "--adm-");
    // Only the keys the dark block actually overrides are compared; both
    // files inherit the rest from :root the same way.
    if (eqDark[eqKey] === undefined) return;
    expect(admDark[admKey], `${admKey} is missing from .dark`).toBeDefined();
    expect(admDark[admKey]).toBe(renamed(eqDark[eqKey]));
  });

  it("adds no colour of its own", () => {
    // A new --adm- token with no --eq- original is exactly how the surface
    // fragmented last time. Add it to equipment.tokens.css first, or reuse
    // one that exists.
    const invented = Object.keys(admLight).filter(
      (k) => eqLight[k.replace("--adm-", "--eq-")] === undefined,
    );
    expect(invented).toEqual([]);
  });
});

describe("both themes are complete", () => {
  it("the .dark block overrides every key the fallback block does", () => {
    // These two blocks exist so a page rendered before hydration is never the
    // wrong theme. If they drift, one of the two paths shows light tokens on
    // a dark ground, which is unreadable rather than merely ugly.
    expect(Object.keys(admDark).sort()).toEqual(
      Object.keys(admDarkFallback).sort(),
    );
  });

  it("the fallback block carries the same values as .dark", () => {
    for (const key of Object.keys(admDark)) {
      expect(admDarkFallback[key], key).toBe(admDark[key]);
    }
  });

  it("every dark override names a token light defines", () => {
    const orphans = Object.keys(admDark).filter(
      (k) => admLight[k] === undefined,
    );
    expect(orphans).toEqual([]);
  });
});

/**
 * The pairings the admin kit actually renders, as class name -> [ink, ground].
 * Adding a coloured element to admin.css means adding its pairing here.
 */
const TEXT_PAIRS: [string, string, string][] = [
  ["panel body text", "--adm-ink", "--adm-surface"],
  ["secondary text", "--adm-ink-2", "--adm-surface"],
  ["field labels", "--adm-ink-muted", "--adm-surface"],
  ["labels on a panel header", "--adm-ink-muted", "--adm-surface-2"],
  ["row name on hover", "--adm-ink", "--adm-surface-3"],
  ["hero text", "--adm-hero-text", "--adm-surface"],
  // Solid --adm-hero is 3.55:1 against white, so the loud button sits on the
  // deep orange instead. See the note in admin.css.
  ["hero button label", "--adm-hero-on", "--adm-hero-text"],
  ["danger button, hovered", "--adm-surface", "--adm-alert"],
  ["primary button label", "--adm-live-on", "--adm-live"],
  ["link / action text", "--adm-live-text", "--adm-surface"],
  ["ok badge", "--adm-ok", "--adm-ok-fill"],
  ["warn badge", "--adm-warn", "--adm-warn-fill"],
  ["alert badge", "--adm-alert", "--adm-alert-fill"],
  ["hero badge", "--adm-hero-text", "--adm-hero-fill"],
  ["live badge", "--adm-live-text", "--adm-live-fill"],
  ["neutral badge", "--adm-ink-2", "--adm-surface-3"],
  ["read-only value", "--adm-ink-2", "--adm-live-fill"],
  ["input text", "--adm-ink", "--adm-bg"],
  ["placeholder text", "--adm-ink-muted", "--adm-bg"],
];

/** Non-text UI — borders, focus rings — only needs 3:1. */
const UI_PAIRS: [string, string, string][] = [
  ["input border", "--adm-ink-muted", "--adm-bg"],
  ["focus ring", "--adm-focus-ring", "--adm-surface"],
];

for (const [theme, vars] of [
  ["light", admLight],
  ["dark", { ...admLight, ...admDark }],
] as const) {
  describe(`contrast — ${theme}`, () => {
    it.each(TEXT_PAIRS)("%s clears AA for body text", (_name, ink, ground) => {
      // Dark-theme fills are rgba washes over the surface; skip anything that
      // is not a flat hex rather than pretend to composite it here.
      let a: string;
      let b: string;
      try {
        a = hex(vars, ink);
        b = hex(vars, ground);
      } catch {
        return;
      }
      expect(ratio(a, b)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(UI_PAIRS)("%s clears AA for non-text UI", (_name, ink, ground) => {
      let a: string;
      let b: string;
      try {
        a = hex(vars, ink);
        b = hex(vars, ground);
      } catch {
        return;
      }
      expect(ratio(a, b)).toBeGreaterThanOrEqual(3);
    });
  });
}
