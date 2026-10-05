import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The colour budget, enforced.
 *
 * v6 put rep quality on GREEN and RED — the one pair a protanope or
 * deuteranope cannot separate. That is a cost taken knowingly, and it is
 * paid for by two non-colour channels (the ★/◯ shape and the poor cell's
 * hatch) plus contrast that never drops below AA anywhere.
 *
 * The README used to carry those ratios as a table someone typed by hand.
 * A hand-typed table is a claim; this is a check. Every pairing below is
 * computed from the ACTUAL token file, in both themes, and again with the
 * row-banding overlay on top — because half the rows in the grid are
 * banded, and a pairing that only clears AA on unbanded rows clears it
 * half the time.
 *
 * If you retune a token and this fails, the fix is the token, not the test.
 */

const TOKENS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "journey-grid.tokens.css"),
  "utf8",
);

/** Pull one `:root`-style block's custom properties out of the token file. */
function readBlock(selector: string): Record<string, string> {
  const i = TOKENS.indexOf(selector);
  if (i < 0) throw new Error(`token block not found: ${selector}`);
  const open = TOKENS.indexOf("{", i);
  const close = TOKENS.indexOf("\n}", open);
  const body = TOKENS.slice(open, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** Resolve `var(--x)` chains, then require a literal #rrggbb. */
function hex(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  if (v === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) {
    if (depth > 4) throw new Error(`var() cycle at ${name}`);
    return hex(vars, ref[1], depth + 1);
  }
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a hex colour: ${v}`);
  return v;
}

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

/** The banding overlay, composited the way the browser will composite it. */
function band(over: string, base: string, alpha: number): string {
  const [o, b] = [parseInt(over.slice(1), 16), parseInt(base.slice(1), 16)];
  const mix = (s: number) =>
    Math.round((((o >> s) & 255) * alpha + ((b >> s) & 255) * (1 - alpha)));
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2.1: 4.5:1 for text under 18pt, 3:1 for non-text UI. */
const TEXT = 4.5;
const UI = 3;

const PAIRINGS: Array<[string, string, string, number]> = [
  // fg token, bg token, what it is, floor
  ["--jg-ink", "--jg-q-max-fill", "weight on a max-strength cell", TEXT],
  ["--jg-ink", "--jg-q-poor-fill", "weight on a needs-work cell", TEXT],
  ["--jg-ink", "--jg-q-done-fill", "weight on a completed cell", TEXT],
  ["--jg-ink-2", "--jg-q-max-fill", "reps on a max-strength cell", TEXT],
  ["--jg-ink-2", "--jg-q-poor-fill", "reps on a needs-work cell", TEXT],
  ["--jg-ink-2", "--jg-q-done-fill", "reps on a completed cell", TEXT],
  ["--jg-delta-up", "--jg-q-max-fill", "blue load delta on a max cell", TEXT],
  ["--jg-delta-up", "--jg-q-poor-fill", "blue load delta on a needs-work cell", TEXT],
  ["--jg-delta-up", "--jg-q-done-fill", "blue load delta on a completed cell", TEXT],
  ["--jg-delta-up", "--jg-surface", "blue load delta on an unrated cell", TEXT],
  ["--jg-q-max-text", "--jg-q-max-fill", "max-strength accent text", TEXT],
  ["--jg-q-poor-text", "--jg-q-poor-fill", "needs-work accent text", TEXT],
  // Non-text: the two marks that carry quality when colour cannot.
  ["--jg-q-star", "--jg-q-max-fill", "the gold star", UI],
  ["--jg-q-poor", "--jg-q-poor-fill", "the red kaizen ring", UI],
  ["--jg-q-max-edge", "--jg-surface", "the max-strength cell edge", UI],
  ["--jg-hero", "--jg-surface", "the focus row trace", UI],
  // The chrome around the data: the header band and the sticky rails share
  // one surface, and the profile's light retune moved it.
  ["--jg-ink", "--jg-surface-2", "machine names on the sticky rail", TEXT],
  ["--jg-ink-muted", "--jg-surface-2", "session numbers on the header band", TEXT],
  ["--jg-live-text", "--jg-surface-2", "blue dates in the Analytics rail", TEXT],
  ["--jg-ink-muted", "--jg-bg", "the section divider's label", TEXT],
  // The Today column (and the LATEST column and a selected row) is the live
  // fill, the write-in column of every set: the words drawn on it. The muted
  // pair is the one the Navy Frame's first dark fill failed (4.41, 3.96 on a
  // banded row), so it is held here.
  ["--jg-live-text", "--jg-live-fill", "the blue weight in the Today column", TEXT],
  ["--jg-ink-2", "--jg-live-fill", "reps in the Today column", TEXT],
  ["--jg-ink-muted", "--jg-live-fill", "muted words on the Today and LATEST columns", TEXT],
  ["--jg-live-on", "--jg-live", "the machine being performed, in the Today column", TEXT],
  // The one loud orange (Finish, the paused clock, the routine's number
  // chips) carries navy words, never white (Oct 4 2026).
  ["--jg-go-on", "--jg-go", "words on the one loud orange", TEXT],
  ["--jg-ink", "--jg-elevated-fill", "words on an elevated flag", TEXT],
  // The Journey look (.jg-look: the profile's chart and the Active Session),
  // AJ's Oct 2-3 colours retuned by lightness only (Oct 4 2026: "yes"). The
  // words on a set's tile and on the newest day's orange tile, and today's
  // waiting prescription on a cell.
  ["--jg-pf-tile-ink", "--jg-pf-tile", "a set's weight on its tile", TEXT],
  ["--jg-pf-reps", "--jg-pf-tile", "a set's reps on its tile", TEXT],
  ["--jg-pf-now-ink", "--jg-pf-now-tile", "the newest day's weight on its orange tile", TEXT],
  ["--jg-pf-now-sub", "--jg-pf-now-tile", "today's reps on the orange tile, in the session", TEXT],
  ["--jg-pf-now-sub", "--jg-surface", "today's waiting prescription, in the session", TEXT],
];

/**
 * The Journey look's dates. They sit on the header row, which never carries
 * the banding overlay, so they are measured as drawn: on the header band,
 * and the newest one also on a spotlit header (tap a date: the blue live
 * fill, with the newest day's orange words kept). The Navy Frame's band left
 * the light session numbers at 3.6:1, the newest date at 4.3 and its number
 * at 3.0, and the dark session numbers at 3.5; AJ's answer (Oct 4 2026,
 * "yes") was to retune them by lightness only, keeping each hue.
 */
const HEADER_WORDS: Array<[string, string, string]> = [
  ["--jg-pf-date", "--jg-surface-2", "a date on the header band"],
  ["--jg-pf-date-sub", "--jg-surface-2", "the session number under a date"],
  ["--jg-pf-now", "--jg-surface-2", "the newest date, and today's in the session"],
  ["--jg-pf-now-sub", "--jg-surface-2", "the session number under the newest date"],
  ["--jg-pf-now", "--jg-live-fill", "the newest date on a spotlit header"],
  ["--jg-pf-now-sub", "--jg-live-fill", "its session number on a spotlit header"],
];

/**
 * The profile's Journey tab maps its own neutrals (`--jg-pf-*`) onto the
 * grid's names inside `.jg-view--journey`. Test that palette as the profile
 * actually draws it.
 */
const PROFILE_MAP: Record<string, string> = {
  "--jg-bg": "--jg-pf-bg",
  "--jg-surface-2": "--jg-pf-surface-2",
  "--jg-surface-3": "--jg-pf-surface-3",
  "--jg-border": "--jg-pf-border",
  "--jg-border-strong": "--jg-pf-border-strong",
};

function asProfile(vars: Record<string, string>): Record<string, string> {
  const out = { ...vars };
  for (const [name, pf] of Object.entries(PROFILE_MAP)) out[name] = hex(vars, pf);
  return out;
}

describe.each([
  ["light", ":root {", "--jg-ink", 0.035, false],
  ["dark", ".dark,", "--jg-ink", 0.045, false],
  ["light · profile", ":root {", "--jg-ink", 0.035, true],
  ["dark · profile", ".dark,", "--jg-ink", 0.045, true],
])("%s theme", (_theme, selector, bandInk, bandAlpha, profile) => {
  const light = readBlock(":root {");
  // The dark block only overrides; anything it does not restate is inherited.
  const base = selector === ":root {" ? light : { ...light, ...readBlock(selector) };
  const vars = profile ? asProfile(base) : base;

  it.each(PAIRINGS)("%s on %s — %s clears %s:1", (fg, bg, _what, floor) => {
    expect(ratio(hex(vars, fg), hex(vars, bg))).toBeGreaterThanOrEqual(floor);
  });

  // Half the rows in the grid carry the banding overlay. A pairing that only
  // clears AA on unbanded rows clears it every other row.
  it.each(PAIRINGS)("%s on %s — %s clears %s:1 on a BANDED row", (fg, bg, _what, floor) => {
    const banded = band(hex(vars, bandInk), hex(vars, bg), bandAlpha);
    expect(ratio(hex(vars, fg), banded)).toBeGreaterThanOrEqual(floor);
  });

  it.each(HEADER_WORDS)("%s on %s — %s clears 4.5:1", (fg, bg) => {
    expect(ratio(hex(vars, fg), hex(vars, bg))).toBeGreaterThanOrEqual(TEXT);
  });

  it("keeps the three quality fills separable with no colour at all", () => {
    // The one this caught for real: the first cut of the v6 palette put the
    // green max fill 0.002 luminance from the grey completed fill. In
    // greyscale, at distance, or for a trainer with achromatopsia, "max
    // strength" and "ordinary set" were the same cell -- while the whole
    // point of v6 is that the fill is what you read at a glance.
    //
    // A ratio, not an absolute difference: dark-mode fills all sit within
    // 0.05 luminance of black, so an absolute threshold means something
    // completely different in the two themes.
    const fills = ["--jg-q-max-fill", "--jg-q-poor-fill", "--jg-q-done-fill"];
    for (let i = 0; i < fills.length; i++) {
      for (let j = i + 1; j < fills.length; j++) {
        expect(ratio(hex(vars, fills[i]), hex(vars, fills[j]))).toBeGreaterThanOrEqual(1.15);
      }
    }
  });

  if (profile && selector === ":root {") {
    it("keeps the header band visible against the cells", () => {
      // Calmer, not gone: the band is what says "these are dates". (Dark is
      // not retuned, so this is a check on the light palette only.)
      expect(ratio(hex(vars, "--jg-surface-2"), hex(vars, "--jg-surface"))).toBeGreaterThanOrEqual(1.08);
    });
  }
});

describe.each([
  ["light", ":root {"],
  ["dark", ".dark,"],
])("the Today column, %s theme", (_theme, selector) => {
  const light = readBlock(":root {");
  const vars = selector === ":root {" ? light : { ...light, ...readBlock(selector) };

  it("stands off the cells (>= 1.15:1)", () => {
    // The write-in column of every set has to read as its own column from a
    // glance. On the Navy Frame's off-white cells the old #e6eef3 was 1.08:1
    // and melted into the history; 1.16 in light and 1.27 in dark now.
    expect(ratio(hex(vars, "--jg-live-fill"), hex(vars, "--jg-surface"))).toBeGreaterThanOrEqual(1.15);
  });

  it("keeps blue words readable on the strong fill (the Now Bar's picked buttons)", () => {
    // Not a row cell, so no banding: the Now Bar's unit and Next buttons.
    expect(ratio(hex(vars, "--jg-live-text"), hex(vars, "--jg-live-fill-strong"))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe.each([
  ["light", ":root {"],
  ["dark", ".dark,"],
])("a control's edge, %s theme", (_theme, selector) => {
  // AJ, Oct 4 2026: "yes" to firmer outlines on the Active Session's
  // buttons. The edge is what tells a control from the bar under it, so it
  // clears WCAG's 3:1 for a boundary against both the bar and the control's
  // own fill. The Now Bar is the header band's grey and its controls fill
  // with the cells' colour; the session bar is the cells' colour and its
  // Notes and Pulse fill with the band's grey.
  const light = readBlock(":root {");
  const vars = selector === ":root {" ? light : { ...light, ...readBlock(selector) };
  const edge = () => hex(vars, "--jg-control-edge");

  it.each([
    ["--jg-surface-2", "the Now Bar; the session bar's buttons' fill"],
    ["--jg-surface", "a control's own fill; the session bar"],
  ])("clears 3:1 on %s (%s)", (ground) => {
    expect(ratio(edge(), hex(vars, ground))).toBeGreaterThanOrEqual(UI);
  });

  it("is firmer than the sticky separators' line, which stays the softer one", () => {
    for (const ground of ["--jg-surface", "--jg-surface-2"]) {
      expect(ratio(edge(), hex(vars, ground))).toBeGreaterThan(ratio(hex(vars, "--jg-border-strong"), hex(vars, ground)));
    }
  });
});

describe("the system-preference fallback", () => {
  it("is the dark block, key for key", () => {
    const dark = readBlock(".dark,");
    const fallback = readBlock(':root:not(.light):not([data-theme="light"]):not(.dark):not([data-theme="dark"]) {');
    expect(fallback).toEqual(dark);
  });
});

describe("the profile retune", () => {
  const light = readBlock(":root {");
  const dark = { ...light, ...readBlock(".dark,") };

  it("changes nothing in dark mode", () => {
    for (const [name, pf] of Object.entries(PROFILE_MAP)) {
      expect(hex(dark, pf)).toBe(hex(dark, name));
    }
  });

  it("softens the light hairlines and sticky edges rather than hardening them", () => {
    const white = hex(light, "--jg-surface");
    expect(ratio(hex(light, "--jg-pf-border"), white)).toBeLessThan(ratio(hex(light, "--jg-border"), white));
    expect(ratio(hex(light, "--jg-pf-border-strong"), white)).toBeLessThan(
      ratio(hex(light, "--jg-border-strong"), white),
    );
  });
});
