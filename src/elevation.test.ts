import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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
 * under its own prefix. Phase 3 landed the tokens half (1 to 7); phase 14
 * added the rules half (8 to 14), which reads EVERY stylesheet and component
 * in src, not a list, so a new screen is held to it too:
 *
 *   8. The most-seen panels lift: each reads its family's --X-elev-2 (the
 *      Hub's bookings --eq-elev-card, Learning's hero --wk-elev-3).
 *   9. No shadow anywhere is raw black, in a rule or in a shadow token.
 *  10. Nothing animates a shadow: no stylesheet's transition lists
 *      box-shadow or all, and no class list pairs transition-all or
 *      transition-shadow with a shadow (nor a plain transition with a shadow
 *      that changes on hover, press or focus). A press is a transform.
 *  11. No coloured rule tapers into a crescent: no side border wider than
 *      the rest on a rounded corner. The Hub's state rails stay on purpose.
 *  12. Nothing tappable under 40px: no button rule sets a height under 40.
 *  13. A raised control keeps a 3:1 edge (AJ's 2A): a button, segment or
 *      filter that reads an elev-1 lift draws its border in a 3:1 control
 *      token; a solid fill may use its own fill; a tint draws its own ink,
 *      measured here at 3:1 on its card in both modes.
 *  14. No well is drawn in bg-muted or --bg-dark-3 (both go LIGHTER than the
 *      card in dark, so a "well" in them would rise).
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
    for (const name of ["elev-0", "elev-1", "elev-2", "elev-3", "elev-4", "shelf", "press", "glow-go", "go-light", "glow-live", "solid-light"]) {
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
    "--jg-glow-go", "--jg-go-light", "--jg-dock", "--jg-dock-side", "--jg-glow-live", "--jg-solid-light",
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

/* ===========================================================================
   THE RULES HALF (phase 14): every stylesheet and component in src
   =========================================================================== */

function filesUnder(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, ext, out);
    else if (ext.test(name)) out.push(p);
  }
  return out;
}
const relOf = (p: string) => relative(SRC, p).replace(/\\/g, "/");
const CSS_FILES = filesUnder(SRC, /\.css$/).map(relOf);
const TSX_FILES = filesUnder(SRC, /\.tsx$/).map(relOf).filter((f) => !/\.test\.tsx$/.test(f));

type Rule = { file: string; selectors: string[]; body: string; at: string[]; pos: number };

/** Every innermost rule of a stylesheet, with the at-rules it sits inside. */
function parse(file: string, text: string): Rule[] {
  const out: Rule[] = [];
  const stack: { prelude: string; start: number; nested: boolean }[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(last, i).split(";").pop()!.trim();
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude, start: i + 1, nested: false });
      last = i + 1;
    } else if (ch === "}") {
      const top = stack.pop();
      if (top && !top.nested && !top.prelude.startsWith("@") && !/^(?:from|to|[\d.]+%)$/.test(top.prelude)) {
        out.push({
          file,
          selectors: top.prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
          body: text.slice(top.start, i),
          at: stack.map((s) => s.prelude.replace(/\s+/g, " ")),
          pos: top.start,
        });
      }
      last = i + 1;
    }
  }
  return out;
}

const RULES = new Map(CSS_FILES.map((f) => [f, parse(f, stripComments(read(f)))]));
const ALL_RULES = [...RULES.values()].flat();

/** Every value `prop` takes in `body`, in order. */
function declared(body: string, prop: string): string[] {
  return [...body.matchAll(new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim().replace(/\s+/g, " "));
}

/** The rules of `file` (outside any @media) that name `selector` exactly, in source order. */
const rulesNaming = (file: string, selector: string) =>
  (RULES.get(file) ?? []).filter((r) => r.at.length === 0 && r.selectors.includes(selector)).sort((a, b) => a.pos - b.pos);

/** The declarations of `selectors` in `file`, merged in source order: the later wins. */
function merged(file: string, ...selectors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const found = (RULES.get(file) ?? [])
    .filter((r) => r.at.length === 0 && r.selectors.some((s) => selectors.includes(s)))
    .sort((a, b) => a.pos - b.pos);
  expect(found.length, `${file}: no rule for ${selectors.join(" / ")}`).toBeGreaterThan(0);
  for (const r of found) for (const m of r.body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

/** A selector's base: what is left when its trailing --modifier, :state and [attr] are taken off. */
const baseOf = (s: string) => s.replace(/(--[\w-]+|:{1,2}[\w-]+(?:\([^)]*\))?|\[[^\]]*\])+$/, "");

/** px for a plain length (px or rem); null for anything else (calc, var, %). */
function px(v: string): number | null {
  const m = /^(-?[\d.]+)(px|rem)?$/.exec(v.trim());
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

/* ---------------------------------------------------------------------------
   8. The most-seen panels lift
   --------------------------------------------------------------------------- */

/**
 * The plan's section 4, the sharp boxes AJ sees most, by the family whose
 * lift each reads: [file, selector, the lift it must read]. The full recipe
 * of each panel (edge, clip, highlight) is panels-and-heads.test.ts's and
 * the codex's kit/depth.test.ts's; this is the cross-room roll call.
 */
const PANEL_LIFTS: [string, string, string][] = [
  ["features/client-codex/kit/kit.css", ".cx-card", "--cx-elev-2"],
  ["features/client-codex/kit/kit.css", ".cx-slot", "--cx-elev-2"],
  ["features/client-codex/kit/kit.css", ".cx-next", "--cx-elev-2"],
  ["features/settings/settings.css", ".stg-card", "--eq-elev-2"],
  ["features/trainer-profile/trainer-profile.css", ".tp-card", "--tp-elev-2"],
  ["features/admin/admin.css", ".adm-panel", "--adm-elev-2"],
  ["features/equipment/equipment.css", ".eq-card", "--eq-elev-2"],
  ["features/calendar/calendar.css", ".cal-card", "--cal-elev-2"],
  ["features/briefing/briefing.css", ".br-card", "--br-elev-2"],
  ["features/client-notes/notes-page.css", ".nt-card", "--eq-elev-2"],
  ["features/relay/board/board.css", ".rbc", "--st-elev-2"],
  ["features/relay/team/team.css", ".tm-card", "--st-elev-2"],
  ["features/client-directory/client-directory.css", ".cd-scroll", "--eq-elev-2"],
  ["features/routines/routines.css", ".rt-routine", "--eq-elev-2"],
  ["features/client-history/client-history.css", ".hist-month", "--cal-elev-2"],
  ["features/learning/learning.css", ".lh__tile", "--wk-elev-2"],
  ["features/learning/learning.css", ".lh__hero", "--wk-elev-3"],
  ["features/hub-schedule/hub-card.css", '.hs-card[data-kind="client"][data-recede="false"]', "--eq-elev-card"],
];

describe("8. the most-seen panels lift", () => {
  it.each(PANEL_LIFTS)("%s %s reads %s", (file, sel, lift) => {
    const shadow = merged(file, sel)["box-shadow"] ?? "";
    expect(shadow, `${sel}'s box-shadow`).toContain(`var(${lift})`);
  });

  it("the profile header and the Wrap-up's cards lift in their class lists (--panel-lift: --elev-2 and the dark top light)", () => {
    expect(read("features/client-profile/ProfileHeader.tsx")).toMatch(/"cp-head [^"]*\bshadow-\(--panel-lift\)/);
    expect(read("components/WrapUpScreen.tsx")).toMatch(/border-\(--edge\) bg-clip-padding [^`"]*shadow-\(--panel-lift\)/);
    expect(CORE.light["--panel-lift"]).toBe("var(--elev-2), var(--panel-highlight)");
    expect(CORE_DARK_OWN["--panel-lift"]).toBe("var(--elev-2), var(--panel-highlight)");
  });
});

/* ---------------------------------------------------------------------------
   9. No shadow is raw black
   --------------------------------------------------------------------------- */

const BLACK = /rgba?\(\s*0\s*,\s*0\s*,\s*0\b|rgba?\(\s*0\s+0\s+0\b|#000(?:000)?\b|\bblack\b/i;

describe("9. no shadow anywhere is raw black", () => {
  it("reads every stylesheet in src", () => {
    expect(CSS_FILES.length).toBeGreaterThan(80);
  });

  it("no box-shadow, text-shadow or drop-shadow, and no shadow token, is drawn in black", () => {
    const found: string[] = [];
    for (const r of ALL_RULES) {
      for (const prop of ["box-shadow", "text-shadow", "filter"]) {
        for (const v of declared(r.body, prop)) if (BLACK.test(v)) found.push(`${r.file} ${r.selectors.join(", ")} { ${prop}: ${v} }`);
      }
      for (const m of r.body.matchAll(/(--[\w-]*(?:shadow|elev|shelf|glow|press|dock|lift)[\w-]*)\s*:\s*([^;]+)/g)) {
        if (BLACK.test(m[2])) found.push(`${r.file} ${r.selectors.join(", ")} { ${m[1]}: ${m[2].trim()} }`);
      }
    }
    expect(found).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   10. Nothing animates a shadow
   --------------------------------------------------------------------------- */

/** Each class list in a component: a className="...", or every string literal inside a className={...}, cn(), cva() or clsx() call. */
function classLists(src: string): { line: number; classes: string[] }[] {
  const out: { line: number; classes: string[] }[] = [];
  const lineAt = (i: number) => src.slice(0, i).split("\n").length;
  for (const m of src.matchAll(/className="([^"]*)"/g)) out.push({ line: lineAt(m.index!), classes: m[1].split(/\s+/).filter(Boolean) });
  for (const m of src.matchAll(/className=\{|\bcn\(|\bcva\(|\bclsx\(/g)) {
    const open = m.index! + m[0].length - 1;
    const [opener, closer] = src[open] === "{" ? ["{", "}"] : ["(", ")"];
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === opener) depth++;
      else if (src[i] === closer && --depth === 0) break;
    }
    const literals = [...src.slice(open + 1, i).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((x) => x[1] ?? x[2] ?? x[3]);
    out.push({ line: lineAt(m.index!), classes: literals.join(" ").split(/\s+/).filter(Boolean) });
  }
  return out;
}

const SHADOW_CLASS = /^(?:[\w-]+:|\[[^\]]+\]:)*!?shadow(?:-|$)/;
const NO_SHADOW = /^(?:[\w-]+:)*!?shadow-none$/;
/** transition-all, transition-shadow, or a list naming shadow or all. */
const ANIMATES_SHADOW = /(^|:)transition-(all|shadow)$|(^|:)transition-\[[^\]]*(shadow|all)[^\]]*\]$/;
/** Tailwind's plain `transition` lists box-shadow too; it animates one only when the shadow changes on a state. */
const PLAIN_TRANSITION = /(^|:)transition$/;
const STATE_VARIANT = /^(?:hover|active|focus|focus-visible|focus-within|group-hover|peer-hover|aria-[\w-]+|data-\[state[^\]]*\]|data-active|data-pressed):/;

/** Every shadow transition in one class list, or [] when it has none. */
function shadowTransitions(classes: string[]): string[] {
  const shadows = classes.filter((c) => SHADOW_CLASS.test(c) && !NO_SHADOW.test(c));
  if (!shadows.length) return [];
  const bad = classes.filter((c) => ANIMATES_SHADOW.test(c));
  if (shadows.some((c) => STATE_VARIANT.test(c))) bad.push(...classes.filter((c) => PLAIN_TRANSITION.test(c)));
  return bad.length ? [`${bad.join(" ")} with ${shadows.join(" ")}`] : [];
}

describe("10. nothing animates a shadow: a press is a transform", () => {
  it("no stylesheet's transition lists box-shadow or all (or names no property, which is all)", () => {
    const found: string[] = [];
    for (const r of ALL_RULES) {
      for (const t of [...declared(r.body, "transition"), ...declared(r.body, "transition-property")]) {
        if (/box-shadow|(^|[\s,])all\b|^[\d.]+m?s\b/.test(t)) found.push(`${r.file} ${r.selectors.join(", ")} { transition: ${t} }`);
      }
    }
    expect(found).toEqual([]);
  });

  it("no class list pairs a shadow with a transition that animates it", () => {
    const found = TSX_FILES.flatMap((file) =>
      classLists(read(file)).flatMap(({ line, classes }) => shadowTransitions(classes).map((s) => `${file}:${line} ${s}`)),
    );
    expect([...new Set(found)]).toEqual([]);
  });

  it("the class-list reader catches each spelling, and passes what does not animate a shadow", () => {
    expect(shadowTransitions(["transition-all", "shadow-sm"])).toHaveLength(1);
    expect(shadowTransitions(["hover:transition-shadow", "shadow-md"])).toHaveLength(1);
    expect(shadowTransitions(["transition-[opacity,box-shadow]", "shadow-(--go-lift)"])).toHaveLength(1);
    expect(shadowTransitions(["transition", "hover:shadow-md"])).toHaveLength(1);
    expect(shadowTransitions(["transition", "shadow-xl"])).toEqual([]); // a static shadow never changes
    expect(shadowTransitions(["transition-all", "shadow-none"])).toEqual([]);
    expect(shadowTransitions(["transition-[background-color,transform]", "shadow-(--go-lift)", "active:shadow-(--press)"])).toEqual([]);
    const lists = classLists('<b className={cn("a transition-all", on ? "shadow-sm" : "")} />');
    expect(lists.flatMap((l) => shadowTransitions(l.classes)).length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------
   11. No coloured rule tapers into a crescent
   --------------------------------------------------------------------------- */

type Side = "top" | "right" | "bottom" | "left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];
/** The two corners each side meets: [top-left, top-right, bottom-right, bottom-left] indexes. */
const CORNERS: Record<Side, [number, number]> = { top: [0, 1], right: [1, 2], bottom: [2, 3], left: [3, 0] };

/** The four corners a border-radius shorthand rounds (true = rounded), top-left first. A var() counts as rounded. */
function roundedCorners(value: string): boolean[] {
  // The horizontal radii: the words before a "/" that is not inside a function.
  const words = value.trim().split(/\s+(?![^(]*\))/);
  const slash = words.indexOf("/");
  const p = slash < 0 ? words : words.slice(0, slash);
  const four = [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
  return four.map((c) => !/^0(?:px|rem|%)?$/.test(c));
}
const CORNER_LONGHANDS = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];

/** A border shorthand's or a border-width's width in px, for one side. */
function widthOf(value: string, side?: Side): number {
  const lengths = value.split(/\s+(?![^(]*\))/).map(px).filter((n): n is number => n !== null);
  if (!side || lengths.length <= 1) return lengths[0] ?? 0;
  const [t, r = t, b = t, l = r] = lengths;
  return { top: t, right: r, bottom: b, left: l }[side];
}

/**
 * The wide side borders on rounded corners that stay, each with its reason.
 * The list is exact both ways: an entry that no longer tapers fails too.
 */
const KEPT_RAILS: Record<string, string> = {
  "features/hub-schedule/hub-card.css .hs-card": "the Hub booking's 4px state rail; the plan's section 6 keeps the Hub's state rails",
  "features/hub-schedule/next-strip.css .hn-item": "Next 30 minutes draws the Hub booking's rail, so the two read as one",
  "features/phone/phone.css .ph-card": "the phone's machine card keeps the rail it shares with the Hub booking (phase 10)",
  'features/hub-schedule/day-header.css .hd-swatch[data-state="live"]': "the Key's picture of a booking draws the card's rail as it is",
  'features/hub-schedule/day-header.css .hd-swatch[data-state="in-session"]': "the Key's picture of a booking in session, with its rail",
  'features/hub-schedule/day-header.css .hd-swatch[data-state="left-open"]': "the Key's picture of a booking left open, with its rail",
  "features/calendar/calendar.css .cal-block": "a booking on the calendar keeps the Hub booking's device, a type rail on a small card",
};

function crescents(): string[] {
  const found: string[] = [];
  for (const [file, rules] of RULES) {
    const bySelector = new Map<string, Rule[]>();
    for (const r of rules) for (const s of r.selectors) bySelector.set(s, [...(bySelector.get(s) ?? []), r]);
    for (const r of rules) {
      for (const sel of r.selectors) {
        const family = [...new Set([...(bySelector.get(baseOf(sel)) ?? []), ...(bySelector.get(sel) ?? []), r])].sort((a, b) => a.pos - b.pos);
        let corners = [false, false, false, false];
        let base = 0;
        for (const f of family) {
          for (const v of declared(f.body, "border-radius")) corners = roundedCorners(v);
          CORNER_LONGHANDS.forEach((prop, i) => {
            for (const v of declared(f.body, prop)) corners[i] = !/^0(?:px|rem|%)?$/.test(v);
          });
          for (const v of declared(f.body, "border")) base = widthOf(v);
          for (const v of declared(f.body, "border-width")) base = widthOf(v);
        }
        for (const side of SIDES) {
          const widths = [...declared(r.body, `border-${side}`), ...declared(r.body, `border-${side}-width`)].map((v) => widthOf(v));
          const wide = widths.find((w) => w > Math.max(1, base));
          if (wide === undefined) continue;
          if (CORNERS[side].some((i) => corners[i])) found.push(`${file} ${sel}`);
        }
      }
    }
  }
  return [...new Set(found)];
}

describe("11. no coloured rule tapers into a crescent (the plan's rule 3)", () => {
  const found = crescents();

  it("a wide side border on a rounded corner is a straight band painted as a background layer instead", () => {
    expect(found.filter((f) => !(f in KEPT_RAILS))).toEqual([]);
  });

  it("the rails that stay still taper, so the list says only what is true", () => {
    expect(Object.keys(KEPT_RAILS).filter((k) => !found.includes(k))).toEqual([]);
  });

  it("the corner reader rounds what is rounded and squares what is square", () => {
    expect(roundedCorners("12px")).toEqual([true, true, true, true]);
    expect(roundedCorners("0 10px 10px 0")).toEqual([false, true, true, false]);
    expect(roundedCorners("12px 0 0 12px")).toEqual([true, false, false, true]);
    expect(roundedCorners("var(--x-radius)")).toEqual([true, true, true, true]);
    expect(roundedCorners("0 8px / 4px")).toEqual([false, true, false, true]);
    expect(roundedCorners("10px 0 4px")).toEqual([true, false, true, false]);
    expect(widthOf("3px solid var(--x)")).toBe(3);
    expect(widthOf("1px 1px 1px 4px", "left")).toBe(4);
  });
});

/**
 * The callouts phase 14 found tapering (phase 10 had listed most of them),
 * each now a straight band painted as the first background layer:
 * [file, selector, the band's width]. The width the border took went into
 * the padding, so the words stay where they were.
 */
const PHASE_14_BANDS: [string, string, number][] = [
  ["features/admin/admin.css", ".adm-limbo", 3],
  ["features/briefing/briefing.css", ".br__critical", 4],
  ["features/briefing/briefing.css", ".br__headsup", 4],
  ["features/client-notes/notes.css", ".nc-sweep", 3],
  ["features/clinical-flags/clinical-flags.css", ".cfl-toggle", 3],
  ["features/clinical-review/clinical-review.css", ".cr-caveat", 4],
  ["features/clinical-review/clinical-review.css", ".cr-rhythm", 4],
  ["features/ford/ford.css", ".ford-tray", 3],
  ["features/machine-db/machine-db.css", ".mdb-net__card", 3],
  ["features/machine-fit/ui/machine-fit.css", ".fit-row", 4],
  ["features/routine-builder/routine-builder.css", ".rb-row--avoid", 4],
  ["features/routine-builder/routine-builder.css", ".rb-row--caution", 4],
  ["features/subjective-report/subjective-report.css", ".sr-pain", 5],
  ["features/subjective-report/subjective-report.css", ".sr-stress", 5],
  ["features/subjective-report/subjective-report.css", ".sra-justnow", 3],
  ["features/wiki/wiki.css", ".wk__warnings", 3],
  ["features/wiki/wiki.css", ".wk__termcard", 3],
];

describe("11b. the callouts that tapered are straight bands now", () => {
  it.each(PHASE_14_BANDS)("%s %s: a %ipx band, no wide border", (file, sel, width) => {
    const own = merged(file, sel);
    expect(own.background, `${sel}'s band`).toMatch(new RegExp(`^linear-gradient\\([^]*?\\) left / ${width}px 100% no-repeat`));
    for (const side of SIDES) expect(own[`border-${side}`], `${sel} border-${side}`).toBeUndefined();
  });

  it.each([
    ["features/clinical-flags/clinical-flags.css", '.cfl-toggle[data-tone="alert"]', "--cfl-band", "var(--eq-alert)"],
    ["features/clinical-flags/clinical-flags.css", ".cfl-toggle--on", "--cfl-band", "var(--eq-live)"],
    ["features/machine-fit/ui/machine-fit.css", '.fit-row[data-state="flag"]', "--fit-band", "var(--eq-warn)"],
    ["features/machine-fit/ui/machine-fit.css", ".fit-row[data-dirty]", "--fit-band", "var(--eq-live)"],
    ["features/subjective-report/subjective-report.css", ".sr-pain--resolved", "--sr-anchor-band", "var(--sr-green)"],
    ["features/subjective-report/subjective-report.css", ".sr-stress--high", "--sr-anchor-band", "var(--sr-red)"],
    ["features/clinical-review/clinical-review.css", ".cr-rhythm--below", "--cr-rhythm-band", "var(--cr-warn)"],
  ])("a state names its band's colour: %s %s", (file, sel, prop, value) => {
    expect(merged(file, sel)[prop]).toBe(value);
  });

  it("a state that changes the fill says background-color, so the band stays", () => {
    for (const [file, sel] of [
      ["features/clinical-flags/clinical-flags.css", ".cfl-toggle--on"],
      ["features/machine-fit/ui/machine-fit.css", ".fit-row--compact"],
    ]) {
      const own = merged(file, sel);
      expect(own.background, sel).toBeUndefined();
      expect(own["background-color"], sel).toBeDefined();
    }
  });
});

/* ---------------------------------------------------------------------------
   12. Nothing tappable under 40px
   --------------------------------------------------------------------------- */

/** A selector that names a btn but is not the tap target, or whose tap area an ::after takes to 40px. */
const UNDER_40_ON_PURPOSE: Record<string, string> = {
  "features/calendar/calendar.css .cal-refresh__btn .lm": "the loading mark drawn inside the 40px Refresh button",
  "features/front-door/front-door.css .fd-btn svg": "the icon inside a front-door button",
  "features/journey-grid/journey-grid.css .jg-clock__btn": "32px drawn inside the clock's 40px pill; its ::after reaches 40 to tap",
  "features/admin/shell/ops.css .ops-tab--on::after": "the open tab's 3px underline, drawn inside the tab",
  "features/admins/admins.css .hq-tab svg": "the icon inside an Admins tab",
};

/** A pointer target drawn under 40px, whatever its name: each with why. */
const SMALL_TAP_ON_PURPOSE: Record<string, string> = {
  "features/calendar/calendar.css .cal-block": "a booking on the Calendar's day is as tall as its time (a 15-minute one is 30px); its lane opens it too",
  "features/equipment/equipment.css .eq-summary__clear": "drawn 24px inside the search field; its ::after reaches 40 (the sweep)",
  "features/journey-grid/journey-grid.css .jg-machine__note": "AJ's call (the review): the note mark in a machine's cell, 20px",
  "features/journey-grid/journey-grid.css .jg-today__add": "its ::after takes the tap 6px to each side and to its own row's height (the review)",
  "features/journey-grid/journey-grid.css .jg-clock__btn": "32px drawn inside the clock's 40px pill; its ::after reaches 40",
  "features/journey-grid/journey-grid.css .jg-rail__edit": "no screen draws it today; session-colour-rules pins its edge",
  "features/studio-tasks/studio-hub.css .sh__row-tick": "no screen draws it today",
  "features/subjective-report/subjective-report.css .sr-switch": "a switch, 46 by 28, like the shared Switch (a trade-off the round names)",
};

describe("12. nothing tappable under 40px", () => {
  it("no rule that names a button, a tab or a back button sets a height under 40px", () => {
    // Widened on Oct 5 2026 (the review): the scan named "btn" only, and so
    // missed the session pop-up's tabs (.hsd-tab, 32px) and the machine
    // sheet's back button (.eq-back, 36px).
    const found: string[] = [];
    for (const r of ALL_RULES) {
      const sel = r.selectors.find((s) => /btn\b|(?:__|-)(?:tab|back)\b/.test(s));
      if (!sel) continue;
      for (const v of [...declared(r.body, "height"), ...declared(r.body, "min-height")]) {
        const n = px(v);
        if (n !== null && n < 40) found.push(`${r.file} ${sel}`);
      }
    }
    expect([...new Set(found)].filter((f) => !(f in UNDER_40_ON_PURPOSE))).toEqual([]);
    expect(Object.keys(UNDER_40_ON_PURPOSE).filter((k) => !found.includes(k)), "an exception that is no longer under 40").toEqual([]);
  });

  it("a rule that sets cursor: pointer sets no height under 40px, whatever its name, but on the list", () => {
    // Widened again in the sweep (Oct 5 2026): the name scan above missed a
    // session's TSC toggle (.hsd-toggle, 28px), the clinical flag chip's
    // remove (32px) and Pulse's chips and segments (30-38px), none of them
    // named btn, tab or back.
    const found: string[] = [];
    for (const r of ALL_RULES) {
      if (!declared(r.body, "cursor").includes("pointer")) continue;
      const heights = [...declared(r.body, "height"), ...declared(r.body, "min-height")].map(px);
      if (heights.some((n) => n !== null && n >= 40)) continue;
      // min-height: 0 is a flex child let shrink, not a size.
      if (heights.some((n) => n !== null && n > 0 && n < 40)) found.push(`${r.file} ${r.selectors.join(", ")}`);
    }
    const unique = [...new Set(found)];
    expect(unique.filter((f) => !(f in SMALL_TAP_ON_PURPOSE))).toEqual([]);
    expect(Object.keys(SMALL_TAP_ON_PURPOSE).filter((k) => !unique.includes(k)), "an exception that is no longer under 40").toEqual([]);
  });

  it("the session clock's pause reaches 40px through its ::after", () => {
    const after = merged("features/journey-grid/journey-grid.css", ".jg-clock__btn::after");
    expect(after.inset).toBe("-4px");
    expect(merged("features/journey-grid/journey-grid.css", ".jg-clock__btn").height).toBe("32px");
  });
});

/* ---------------------------------------------------------------------------
   13. A raised control keeps a 3:1 edge
   --------------------------------------------------------------------------- */

/** The palettes a tinted button's own ink is measured in: light, then dark over it. */
const TINT_PALETTES: [string, string, string | null][] = [
  ["index.css", "\n:root {", "\n.dark {"],
  ["features/equipment/equipment.tokens.css", "\n:root {", "\n.dark,"],
  ["features/admin/admin.tokens.css", "\n:root {", "\n.dark,"],
  ["features/studio-tasks/studio-tasks.css", "\n:root {", "\n.dark,"],
  ["features/wiki/wiki.tokens.css", "\n:root {", "\n.dark,"],
  ["features/catalog/catalog.tokens.css", "\n:root {", "\n.dark,"],
  ["features/routine-builder/routine-builder.tokens.css", "\n:root {", "\n:root.dark,"],
  ["features/subjective-report/subjective-report.css", "\n:root {", "\n.dark,"],
  // The codex's palette is aliases of the Hub's, the same in both modes.
  ["features/client-codex/codex.tokens.css", "\n.cx,", null],
];
const TINT_LIGHT: Record<string, string> = {};
const TINT_DARK_OWN: Record<string, string> = {};
for (const [file, light, dark] of TINT_PALETTES) {
  const text = read(file);
  Object.assign(TINT_LIGHT, block(text, light));
  if (dark) Object.assign(TINT_DARK_OWN, block(text, dark));
}
const TINT_MODES: Record<Theme, Record<string, string>> = { light: TINT_LIGHT, dark: { ...TINT_LIGHT, ...TINT_DARK_OWN } };

/** A var() chain followed to its value (or its fallback). */
function resolve(map: Record<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = value.trim().match(/^var\((--[\w-]+)(?:,\s*([\s\S]+))?\)$/);
  if (!m) return value.trim();
  if (map[m[1]] !== undefined) return resolve(map, map[m[1]], depth + 1);
  if (m[2]) return resolve(map, m[2], depth + 1);
  throw new Error(`${m[1]} is not declared`);
}

/** The 3:1 control edges (elevation section 5 measures them on the raised fill). */
const CONTROL_EDGE = /^var\(--(?:[\w]+-(?:border-strong|line-2|control-edge)|input)\)$/;
/** A raised control's lift: an elev-1 token. */
const LIFTS = /var\(--(?:[\w]+-)?elev-1\)/;
/** A solid fill's depth: its own coloured glow or a top light on its own colour. */
const SOLID = /var\(--(?:[\w]+-)?(?:solid-light|glow-live|glow-go|go-light)\)/;
const RAISED_CONTROL = /(__|-)btn\b|-seg\b|__filter\b/;

/** A picked segment raised out of a well: the group's 3:1 edge is the well's, not the segment's. */
const SEGMENTS_IN_A_WELL: Record<string, string> = {
  'features/hub-opportunities/run-sheet.css .ho-seg-btn[aria-pressed="true"]': "the run sheet's switch: the well inside its 3:1 edge holds the segments (buttons-depth.test.ts)",
  'features/hub-schedule/day-header.css .hd-bar .hl-btn[aria-pressed="true"]': "the Hub's command bar: the well inside its 3:1 edge holds the layers (hub-depth.test.ts)",
  'features/admin/admin.css .adm-seg[aria-selected="true"]': "Operations' segmented control: the well inside its 3:1 edge (.adm-segmented) holds the segments, the picked one raised with the soft ring",
  'features/wiki/wiki.css .wk__seg-btn[aria-pressed="true"]': "Learning's Overview / Catalog / Academy switch and the Catalog figure's Front / Back: the well inside its 3:1 edge (.wk__seg) holds the segments, the picked one raised with the soft ring (the follow-up, Oct 5 2026)",
};

type Edge = { where: string; edge: string; shadow: string };

function raisedControls(): Edge[] {
  const out: Edge[] = [];
  for (const [file, rules] of RULES) {
    if (!file.startsWith("features/")) continue;
    const bySelector = new Map<string, Rule[]>();
    for (const r of rules) for (const s of r.selectors) bySelector.set(s, [...(bySelector.get(s) ?? []), r]);
    for (const r of rules) {
      const shadow = declared(r.body, "box-shadow").find((v) => LIFTS.test(v));
      if (!shadow) continue;
      for (const sel of r.selectors.filter((s) => RAISED_CONTROL.test(s))) {
        const family = [...new Set([...(bySelector.get(baseOf(sel)) ?? []), ...(bySelector.get(sel) ?? []), r])].sort((a, b) => a.pos - b.pos);
        let edge = "none";
        for (const f of family) {
          for (const v of declared(f.body, "border")) edge = v.split(/\s+(?![^(]*\))/).find((p) => /^(var\(|#|rgba?\(|transparent)/.test(p)) ?? (/^(0|none)$/.test(v) ? "none" : edge);
          for (const v of declared(f.body, "border-color")) edge = v;
        }
        out.push({ where: `${file} ${sel}`, edge, shadow });
      }
    }
  }
  return out;
}

describe("13. a raised control keeps a 3:1 edge (AJ's answer 2A)", () => {
  const controls = raisedControls();

  it("finds the raised controls (the scan is reading something)", () => {
    expect(controls.length).toBeGreaterThan(40);
  });

  it("each draws a 3:1 control edge, or is a solid fill, or a tint on its own 3:1 ink, or a segment in a well", () => {
    const wrong: string[] = [];
    for (const c of controls) {
      if (CONTROL_EDGE.test(c.edge) || SOLID.test(c.shadow) || c.where in SEGMENTS_IN_A_WELL) continue;
      // A tint: its own ink, on the card it sits on, at 3:1 in both modes.
      const family = /^var\(--([a-z]+)-/.exec(c.edge)?.[1];
      if (!family) {
        wrong.push(`${c.where}: border ${c.edge}`);
        continue;
      }
      for (const theme of BOTH) {
        const ink = resolve(TINT_MODES[theme], c.edge);
        const card = resolve(TINT_MODES[theme], `var(--${family}-surface)`);
        if (!/^#[0-9a-f]{6}$/i.test(ink) || ratio(ink, card) < 3) wrong.push(`${c.where} (${theme}): border ${c.edge} = ${ink} on ${card}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the segments in a well are still raised segments, so the list says only what is true", () => {
    const wheres = controls.map((c) => c.where);
    expect(Object.keys(SEGMENTS_IN_A_WELL).filter((k) => !wheres.includes(k))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
   14. No well in bg-muted or --bg-dark-3
   --------------------------------------------------------------------------- */

describe("14. a well sinks: never bg-muted or --bg-dark-3, which go lighter than the card in dark", () => {
  it("no stylesheet rule that sinks (an elev-0 inner shadow) fills with them", () => {
    const found: string[] = [];
    for (const r of ALL_RULES) {
      if (!declared(r.body, "box-shadow").some((v) => /elev-0\)/.test(v))) continue;
      for (const v of [...declared(r.body, "background"), ...declared(r.body, "background-color")]) {
        if (/var\(--(?:muted|bg-dark-3)\)/.test(v)) found.push(`${r.file} ${r.selectors.join(", ")}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("no class list that sinks fills with them", () => {
    const found = TSX_FILES.flatMap((file) =>
      classLists(read(file))
        .filter(({ classes }) => classes.some((c) => /^(?:[\w-]+:)*shadow-\(--(?:[\w]+-)?elev-0\)$/.test(c)))
        .filter(({ classes }) => classes.some((c) => /^(?:[\w-]+:)*bg-(?:muted|bg-dark-3|\(--(?:muted|bg-dark-3)\))$/.test(c)))
        .map(({ line }) => `${file}:${line}`),
    );
    expect(found).toEqual([]);
  });
});

describe("the parser itself", () => {
  it("reads a rule inside @media with its context, and a selector's base", () => {
    const rules = parse("x.css", ".a { color: red; } @media (hover: hover) { .a:hover { color: blue; } }");
    expect(rules.map((r) => [r.selectors[0], r.at.length])).toEqual([[".a", 0], [".a:hover", 1]]);
    expect(baseOf(".x-btn--live:hover")).toBe(".x-btn");
    expect(baseOf('.x-seg-btn[aria-pressed="true"]')).toBe(".x-seg-btn");
  });

  it("splits a shadow on its top-level commas and reads a layer's blur and spread", () => {
    const parts = layers("0 1px 2px rgba(1,2,3,0.1), inset 0 6px 14px -6px color-mix(in srgb, var(--x) 6%, transparent)");
    expect(parts).toHaveLength(2);
    expect(layer(parts[0])).toEqual({ inset: false, blur: 2, spread: 0, colour: "rgba(1,2,3,0.1)" });
    expect(layer(parts[1])).toMatchObject({ inset: true, blur: 14, spread: -6 });
    expect(ratio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});
