import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * DEPTH, CHECKED (type and depth, Oct 4 2026; AJ's answers "1a 2a 3b").
 *
 * AJ, Oct 4 2026: "a lot of buttons and backgrounds in the app currently
 * have a sharp cutoff look, especially in light mode ... borders and headers
 * just needs a little bit of weight and depth ... add some dropshadows". The
 * look he picked (harness/depth/kit-recommended.css, "Refined Lift") is drawn
 * from one set of tokens in index.css, which every feature palette carries
 * under its own prefix. Phase 3 lands the tokens and this half of the guard;
 * the plan's phase 14 adds the rules half (every panel lifts, no shadow is
 * animated, no coloured top rule tapers into a crescent, the 40px scan).
 *
 *   1. index.css declares every depth token, in :root and in .dark.
 *   2. Every shadow is navy, never black: the logo navy (25,45,65) and the
 *      frame's navy in light, the deepest navy (2,10,20) in dark. White is
 *      only ever a top light and a pale navy only a rim. Dark mode's depth
 *      comes from lighter surfaces and soft rims, never black smudges.
 *   3. Resting shadows are short: the blur of a well, a control, a panel, a
 *      Hub booking, a shelf and a press is 18px at most, and a panel's
 *      ambient layer spreads inward, so a scroll parent never cuts it off.
 *   4. Lighter is higher, in both modes: a raised fill sits above the card
 *      (and is never white), a well below the card, the tray below the page.
 *      In light the tray stands 1.1:1 off the page and the open tab 1.25:1
 *      off the tray, the floors page-grounds.test.ts holds for the tray.
 *   5. A raised control keeps its 3:1 edge (AJ's answer 2A): --input, the
 *      Hub's --eq-border-strong and the session's --jg-control-edge, each on
 *      its own raised fill, in both modes.
 *   6. The Hub's copy and the session's are index.css's, value for value.
 *   7. Every depth token a later phase of the plan reads is declared in its
 *      family's file now, so no box goes flat for a missing name
 *      (css-vars-declared.test.ts checks the rules that read them).
 *
 * If one of these fails, the fix is the token, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties of the block that opens with `selector`, comments stripped. */
function block(css: string, selector: string): Record<string, string> {
  const code = stripComments(css);
  const at = code.indexOf(selector);
  if (at < 0) throw new Error(`block not found: ${selector.trim()}`);
  const open = code.indexOf("{", at);
  const body = code.slice(open + 1, code.indexOf("}", open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

type Theme = "light" | "dark";
const BOTH: Theme[] = ["light", "dark"];

const INDEX = read("index.css");
const CORE_LIGHT = block(INDEX, "\n:root {");
const CORE = { light: CORE_LIGHT, dark: { ...CORE_LIGHT, ...block(INDEX, "\n.dark {") } };
const CORE_DARK_OWN = block(INDEX, "\n.dark {");

const EQ_CSS = read("features/equipment/equipment.tokens.css");
const EQ_LIGHT = block(EQ_CSS, "\n:root {");
const EQ = { light: EQ_LIGHT, dark: { ...EQ_LIGHT, ...block(EQ_CSS, "\n.dark,") } };

const JG_CSS = read("features/journey-grid/journey-grid.tokens.css");
const JG_LIGHT = block(JG_CSS, "\n:root {");
const JG = { light: JG_LIGHT, dark: { ...JG_LIGHT, ...block(JG_CSS, "\n.dark,") } };

/* ---------------------------------------------------------------------------
   Colour and shadow maths
   --------------------------------------------------------------------------- */

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  expect(hex, "a solid #rrggbb").toMatch(/^#[0-9a-f]{6}$/i);
  const [r, g, b] = rgb(hex).map((c) => channel(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A shadow's layers, split on the commas that are not inside a function. */
function layers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

/** One layer's blur, spread and colour. */
function layer(text: string): { inset: boolean; blur: number; spread: number; colour: string } {
  const at = text.search(/rgba?\(|color-mix\(|transparent|#/);
  if (at < 0) throw new Error(`no colour in shadow layer: ${text}`);
  const head = text.slice(0, at).trim();
  const inset = /^inset\b/.test(head);
  const lengths = head.replace(/^inset\s*/, "").split(/\s+/).filter(Boolean).map((v) => parseFloat(v));
  return { inset, blur: lengths[2] ?? 0, spread: lengths[3] ?? 0, colour: text.slice(at).trim() };
}

/** [r, g, b, a] of an rgba(), or null for anything else. */
function rgba(colour: string): [number, number, number, number] | null {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(colour.replace(/\s+/g, ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

const same = (a: string, b: string) => a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

/* ---------------------------------------------------------------------------
   1. The tokens
   --------------------------------------------------------------------------- */

const SHADOWS = [
  "--elev-0", "--elev-1", "--elev-2", "--elev-3", "--elev-4", "--elev-4-up", "--elev-5", "--elev-card",
  "--shelf", "--frame-down", "--frame-up", "--press", "--glow-live", "--glow-go", "--solid-light", "--go-light",
  "--panel-highlight",
];
const COLOURS = ["--raised", "--well", "--tray", "--edge", "--edge-control", "--divider", "--highlight", "--scrim"];

describe("index.css declares the depth tokens", () => {
  it.each([...SHADOWS, ...COLOURS])("%s, in :root and in .dark", (token) => {
    expect(CORE_LIGHT[token], `${token} in :root`).toBeDefined();
    expect(CORE_DARK_OWN[token], `${token} in .dark`).toBeDefined();
  });

  it("keeps Tailwind's shadow-sm to shadow-2xl on the elevation scale", () => {
    for (const [size, n] of [["sm", 1], ["md", 2], ["lg", 3], ["xl", 4], ["2xl", 5]] as const) {
      expect(INDEX, `shadow-${size}`).toMatch(new RegExp(`--shadow-${size}:\\s*var\\(--elev-${n}\\);`));
    }
  });
});

/* ---------------------------------------------------------------------------
   2. Navy, never black
   --------------------------------------------------------------------------- */

/** The inks a shadow may be drawn in, by theme: [r, g, b] and what it is for. */
const INKS: Record<Theme, [number, number, number][]> = {
  // The logo navy, the frame's two navies, and white for a top light.
  light: [[25, 45, 65], [0, 18, 36], [0, 35, 65], [255, 255, 255]],
  // The deepest navy, white for a top light, and the pale navy of a rim.
  dark: [[2, 10, 20], [255, 255, 255], [150, 180, 210]],
};

describe("every shadow is navy, never black", () => {
  for (const theme of BOTH) {
    it.each(SHADOWS)(`${theme}: %s`, (token) => {
      for (const l of layers(CORE[theme][token]).map(layer)) {
        if (l.colour === "transparent") continue;
        const mix = /^color-mix\(in srgb, var\((--primary|--cta)\) \d+%, transparent\)$/.exec(l.colour);
        if (mix) continue; // a solid fill's own colour, faded: the blue or the orange
        const c = rgba(l.colour);
        expect(c, `${token}: ${l.colour} is an rgba()`).not.toBeNull();
        const ink = c!.slice(0, 3);
        expect(INKS[theme].some((k) => k.every((v, i) => v === ink[i])), `${token}: ${l.colour}`).toBe(true);
        // White is a top light (inset), or the 1px hairline the frame draws
        // on its edge in dark; never a glow.
        if (ink.every((v) => v === 255)) expect(l.inset || l.blur === 0, `${token}: white is only a light or a hairline`).toBe(true);
      }
    });
  }

  it("draws dark edges and dividers as pale rims, light ones in the logo navy", () => {
    for (const token of ["--edge", "--edge-control", "--divider"]) {
      expect(rgba(CORE.light[token])!.slice(0, 3), `${token} in light`).toEqual([25, 45, 65]);
      expect(rgba(CORE.dark[token])!.slice(0, 3), `${token} in dark`).toEqual([150, 180, 210]);
    }
    expect(rgba(CORE.light["--scrim"])!.slice(0, 3), "the scrim is navy, not black").not.toEqual([0, 0, 0]);
    expect(rgba(CORE.dark["--scrim"])!.slice(0, 3), "the scrim is navy, not black").not.toEqual([0, 0, 0]);
  });

  it("has no panel highlight in light, where it would not show on the off-white card", () => {
    expect(layers(CORE.light["--panel-highlight"]).map(layer).every((l) => l.colour === "transparent")).toBe(true);
    expect(layer(CORE.dark["--panel-highlight"]).inset).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
   3. Short resting shadows
   --------------------------------------------------------------------------- */

describe("a resting shadow is short", () => {
  const RESTING = ["--elev-0", "--elev-1", "--elev-2", "--elev-card", "--shelf", "--press"];
  for (const theme of BOTH) {
    it.each(RESTING)(`${theme}: %s blurs 18px at most`, (token) => {
      const blur = Math.max(...layers(CORE[theme][token]).map((l) => layer(l).blur));
      expect(blur).toBeLessThanOrEqual(18);
    });

    it(`${theme}: a panel's ambient layer spreads inward`, () => {
      const ambient = layers(CORE[theme]["--elev-2"]).map(layer).sort((a, b) => b.blur - a.blur)[0];
      expect(ambient.spread).toBeLessThan(0);
    });
  }

  it("casts --elev-4-up as --elev-4 turned upward", () => {
    for (const theme of BOTH) {
      const down = layers(CORE[theme]["--elev-4"]);
      const up = layers(CORE[theme]["--elev-4-up"]);
      expect(up.length).toBe(down.length);
      down.forEach((d, i) => expect(same(up[i], d.replace(/^0 (\d)/, "0 -$1")), `${theme} layer ${i}`).toBe(true));
    }
  });
});

/* ---------------------------------------------------------------------------
   4. Lighter is higher
   --------------------------------------------------------------------------- */

describe("lighter is higher, in both modes", () => {
  for (const theme of BOTH) {
    it(`${theme}: a raised fill above the card, a well below it, the tray below the page`, () => {
      const t = CORE[theme];
      expect(luminance(t["--raised"]), "raised over the card").toBeGreaterThan(luminance(t["--card"]));
      expect(luminance(t["--well"]), "a well under the card").toBeLessThan(luminance(t["--card"]));
      expect(luminance(t["--tray"]), "the tray under the page").toBeLessThan(luminance(t["--background"]));
      expect(luminance(t["--raised"]), "a raised tab out of the tray").toBeGreaterThan(luminance(t["--tray"]));
    });
  }

  it("light: the raised fill is never white", () => {
    expect(CORE.light["--raised"].toUpperCase()).not.toBe("#FFFFFF");
  });

  it("light: the tray stands 1.1:1 off the page, and the open tab 1.25:1 off the tray", () => {
    expect(ratio(CORE.light["--tray"], CORE.light["--background"])).toBeGreaterThanOrEqual(1.1);
    expect(ratio(CORE.light["--raised"], CORE.light["--tray"])).toBeGreaterThanOrEqual(1.25);
  });

  it("dark: bg-muted and --bg-dark-3 sit above the card, which is why neither is a well", () => {
    expect(luminance(CORE.dark["--muted"])).toBeGreaterThan(luminance(CORE.dark["--card"]));
    expect(luminance(CORE.dark["--bg-dark-3"])).toBeGreaterThan(luminance(CORE.dark["--card"]));
  });
});

/* ---------------------------------------------------------------------------
   5. A raised control keeps its 3:1 edge
   --------------------------------------------------------------------------- */

describe("a raised control keeps its 3:1 edge (AJ's answer 2A)", () => {
  for (const theme of BOTH) {
    it(`${theme}: --input on --raised (shadcn's outline button, the fields)`, () => {
      expect(ratio(CORE[theme]["--input"], CORE[theme]["--raised"])).toBeGreaterThanOrEqual(3);
    });
    it(`${theme}: --eq-border-strong on --eq-raised (every family's button)`, () => {
      expect(ratio(EQ[theme]["--eq-border-strong"], EQ[theme]["--eq-raised"])).toBeGreaterThanOrEqual(3);
    });
    it(`${theme}: --jg-control-edge on --jg-raised (the Active Session's controls)`, () => {
      expect(ratio(JG[theme]["--jg-control-edge"], JG[theme]["--jg-raised"])).toBeGreaterThanOrEqual(3);
    });
  }
});

/* ---------------------------------------------------------------------------
   6. The copies are index.css's
   --------------------------------------------------------------------------- */

describe("the Hub's and the session's depth tokens are index.css's", () => {
  const PAIRS: [string, string][] = [
    ["--eq-raised", "--raised"],
    ["--eq-tray", "--tray"],
    ["--eq-edge", "--edge"],
    ["--eq-edge-control", "--edge-control"],
    ["--eq-divider", "--divider"],
    ["--eq-highlight", "--highlight"],
  ];
  for (const theme of BOTH) {
    it(`${theme}: the Hub's literals equal index.css's values`, () => {
      for (const [mine, core] of PAIRS) expect(same(EQ[theme][mine], CORE[theme][core]), `${mine} vs ${core}`).toBe(true);
    });
    it(`${theme}: the session's raised fill and top light are the Hub's`, () => {
      expect(JG[theme]["--jg-raised"]).toBe(EQ[theme]["--eq-raised"]);
      expect(JG[theme]["--jg-highlight"]).toBe(EQ[theme]["--eq-highlight"]);
    });
  }
  it("the session's shadows are the app's by name", () => {
    for (const name of ["elev-0", "elev-1", "elev-2", "elev-3", "elev-4", "shelf", "press", "glow-go", "go-light"]) {
      expect(JG.light[`--jg-${name}`], `--jg-${name}`).toBe(`var(--${name})`);
      expect(JG.dark[`--jg-${name}`], `--jg-${name} in dark`).toBe(`var(--${name})`);
    }
  });
});

/* ---------------------------------------------------------------------------
   7. Every token a later phase reads is declared now
   --------------------------------------------------------------------------- */

/**
 * The depth tokens the plan's phases 4 to 13 read, by the file that declares
 * them. Each later phase's rules read these by name; a name missing here
 * would draw a flat box with no error. The Catalog's --cat-* keys are not
 * here on purpose: learning-tokens.test.ts refuses a --cat-* token with no
 * reader, so each lands with the rule that first reads it.
 */
const LATER: [string, string[]][] = [
  ["index.css", [
    "--raised", "--well", "--tray", "--scrim", "--edge", "--edge-control", "--divider", "--highlight",
    "--elev-0", "--elev-1", "--elev-2", "--elev-3", "--elev-4", "--elev-4-up", "--elev-5",
    "--press", "--glow-live", "--glow-go", "--solid-light", "--go-light", "--frame-down", "--frame-up", "--panel-highlight",
  ]],
  ["features/equipment/equipment.tokens.css", [
    "--eq-shelf", "--eq-edge", "--eq-edge-control", "--eq-divider", "--eq-raised", "--eq-highlight",
    "--eq-elev-0", "--eq-elev-1", "--eq-elev-2", "--eq-elev-3", "--eq-elev-4", "--eq-elev-card", "--eq-panel-highlight",
    "--eq-press", "--eq-glow-live", "--eq-solid-light", "--eq-glow-go", "--eq-go-light",
  ]],
  ["features/admin/admin.tokens.css", [
    "--adm-shelf", "--adm-raised", "--adm-elev-0", "--adm-elev-1", "--adm-elev-2", "--adm-highlight", "--adm-press",
    "--adm-glow-go", "--adm-go-light", "--adm-divider", "--adm-edge", "--adm-edge-control",
  ]],
  ["features/studio-tasks/studio-tasks.css", [
    "--st-shelf", "--st-raised", "--st-elev-0", "--st-elev-1", "--st-elev-2", "--st-highlight", "--st-press",
    "--st-edge", "--st-edge-control", "--st-divider",
  ]],
  ["features/wiki/wiki.tokens.css", [
    "--wk-shelf", "--wk-raised", "--wk-elev-0", "--wk-elev-1", "--wk-elev-2", "--wk-elev-3", "--wk-highlight",
    "--wk-press", "--wk-edge", "--wk-edge-control", "--wk-divider",
  ]],
  ["features/briefing/briefing.tokens.css", [
    "--br-raised", "--br-elev-0", "--br-elev-1", "--br-elev-2", "--br-highlight", "--br-press", "--br-glow-go",
    "--br-go-light", "--br-edge",
  ]],
  ["features/subjective-report/subjective-report.css", [
    "--sr-raised", "--sr-elev-0", "--sr-elev-1", "--sr-highlight", "--sr-press", "--sr-edge",
  ]],
  ["features/ford/ford.tokens.css", ["--ford-raised", "--ford-elev-1", "--ford-highlight", "--ford-press"]],
  ["features/calendar/calendar.tokens.css", [
    "--cal-raised", "--cal-elev-0", "--cal-elev-1", "--cal-elev-2", "--cal-highlight", "--cal-press", "--cal-edge",
  ]],
  ["features/trainer-profile/trainer-profile.tokens.css", [
    "--tp-raised", "--tp-elev-1", "--tp-elev-2", "--tp-highlight", "--tp-press", "--tp-edge",
  ]],
  ["features/routine-builder/routine-builder.tokens.css", ["--rb-raised", "--rb-elev-1", "--rb-highlight", "--rb-press"]],
  ["features/client-profile/profile-nav.css", ["--psub-edge", "--psub-elev-1", "--psub-glow-live", "--psub-solid-light"]],
  ["features/journey-grid/journey-grid.tokens.css", [
    "--jg-raised", "--jg-highlight", "--jg-elev-1", "--jg-elev-2", "--jg-elev-4", "--jg-shelf", "--jg-press",
    "--jg-glow-go", "--jg-go-light", "--jg-dock",
  ]],
  ["features/client-codex/codex.tokens.css", [
    "--cx-edge", "--cx-edge-control", "--cx-divider", "--cx-raised", "--cx-highlight", "--cx-elev-0", "--cx-elev-1",
    "--cx-elev-2", "--cx-panel-highlight", "--cx-press", "--cx-glow-live", "--cx-solid-light",
  ]],
  ["features/progress-report/progress-report.tokens.css", ["--pr-raised", "--pr-elev-1", "--pr-highlight", "--pr-press"]],
  ["features/clinical-review/clinical-review.css", ["--cr-elev-4"]],
];

describe("every depth token a later phase reads is declared now", () => {
  it.each(LATER)("%s", (file, tokens) => {
    const code = stripComments(read(file));
    const missing = tokens.filter((t) => !new RegExp(`(^|[^\\w-])${t}\\s*:`).test(code));
    expect(missing).toEqual([]);
  });

  it("the session's Now Bar docks in the frame's navy, cast upward, in both modes", () => {
    for (const theme of BOTH) {
      const l = layer(JG[theme]["--jg-dock"]);
      expect(parseFloat(JG[theme]["--jg-dock"].split(" ")[1]), `${theme}: upward`).toBeLessThan(0);
      expect(INKS[theme].some((k) => k.every((v, i) => v === rgba(l.colour)![i])), `${theme}: ${l.colour}`).toBe(true);
    }
  });
});

describe("the parser itself", () => {
  it("splits a shadow on its top-level commas and reads a layer's blur and spread", () => {
    const parts = layers("0 1px 2px rgba(1,2,3,0.1), inset 0 6px 14px -6px color-mix(in srgb, var(--x) 6%, transparent)");
    expect(parts).toHaveLength(2);
    expect(layer(parts[0])).toEqual({ inset: false, blur: 2, spread: 0, colour: "rgba(1,2,3,0.1)" });
    expect(layer(parts[1])).toMatchObject({ inset: true, blur: 14, spread: -6 });
    expect(ratio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});
