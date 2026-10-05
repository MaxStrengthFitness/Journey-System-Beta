import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HUB, WITH WEIGHT AND DEPTH (type and depth, phase 11, Oct 4 2026; AJ's
 * answers "1a 2a 3b").
 *
 * AJ, Oct 4 2026: "a lot of buttons and backgrounds in the app currently
 * have a sharp cutoff look ... borders and headers just needs a little bit
 * of weight and depth". On the Hub, the screen trainers see most:
 *
 *   1. A booking is told from the grid by an edge seen from OUTSIDE it (the
 *      soft --eq-edge, the fill clipped to the padding box) and a small
 *      two-layer lift, ONLY while it is a client's and not over: a card that
 *      is over, unlinked, pending, unknown or a staff block lies flat, as it
 *      did. Its 4px state rail is untouched. An open one keeps its blue ring
 *      and lifts higher. Nothing animates a shadow.
 *   2. The command bar keeps its 3:1 edge (a group of controls, like a
 *      field) and sinks inside it; the layer you're on is raised out of it,
 *      and the bar never clips that lift.
 *   3. The week's numerals and the grid's hours and lane heads are the
 *      display face, upright (AJ's 1A); the picked day lifts as a solid blue
 *      does, and today-and-picked keeps exactly its orange underline
 *      (hub-colour-rules.test.ts holds that one).
 *   4. The peek is a popover: the deepest lift on the page, a step lighter
 *      than the card in dark, with a white rim and top light; its name is
 *      the display face at 22 and its labels are words, not capitals.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet, not the test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const css = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string; at: string[]; pos: number };

/** Every innermost rule of a stylesheet, with the at-rules it sits inside. */
function parse(text: string): Rule[] {
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
      if (top && !top.nested && !top.prelude.startsWith("@") && !/^(?:from|to|\d+%)$/.test(top.prelude)) {
        out.push({
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

const CARD = "features/hub-schedule/hub-card.css";
const TOP = "features/hub-schedule/day-header.css";
const GRID = "features/hub-schedule/hub-grid.css";
const PEEK = "features/hub-schedule/peek.css";
const STRIP = "features/hub-schedule/next-strip.css";

const cache = new Map<string, Rule[]>();
const rulesOf = (file: string) => {
  if (!cache.has(file)) cache.set(file, parse(css(file)));
  return cache.get(file)!;
};

/** A rule body's declarations, the later winning. */
function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

/** The rules (outside any at-rule) that name one of `selectors` exactly, merged in source order. */
function merged(file: string, ...selectors: string[]): Record<string, string> {
  const found = rulesOf(file).filter((r) => r.at.length === 0 && r.selectors.some((s) => selectors.includes(s)));
  expect(found.length, `${file}: no rule for ${selectors.join(" / ")}`).toBeGreaterThan(0);
  return Object.assign({}, ...found.sort((a, b) => a.pos - b.pos).map((r) => decls(r.body)));
}

/** How many attribute selectors a selector carries (each weighs as a class). */
const attributes = (selector: string) => (selector.match(/\[/g) ?? []).length;

/* ---------------------------------------------------------------------------
   Tokens, both modes, and contrast
   --------------------------------------------------------------------------- */

function block(text: string, selector: string): Record<string, string> {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = code.indexOf(selector);
  if (at < 0) throw new Error(`block not found: ${selector.trim()}`);
  const open = code.indexOf("{", at);
  const out: Record<string, string> = {};
  for (const m of code.slice(open + 1, code.indexOf("}", open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const EQ_TEXT = read("features/equipment/equipment.tokens.css");
const EQ_LIGHT = block(EQ_TEXT, "\n:root {");
const EQ = { light: EQ_LIGHT, dark: { ...EQ_LIGHT, ...block(EQ_TEXT, '\n.dark,\n[data-theme="dark"] {') } };
const INDEX = read("index.css");
const CORE_LIGHT = block(INDEX, "\n:root {");
const CORE = { light: CORE_LIGHT, dark: { ...CORE_LIGHT, ...block(INDEX, "\n.dark {") } };
type Theme = keyof typeof EQ;
const BOTH: Theme[] = ["light", "dark"];

/** A token's value with its --eq-* aliases followed. */
function resolve(theme: Theme, token: string): string {
  let value = EQ[theme][token];
  for (let i = 0; i < 5 && value; i++) {
    const alias = /^var\((--eq-[\w-]+)\)$/.exec(value);
    if (!alias) break;
    value = EQ[theme][alias[1]];
  }
  if (!value) throw new Error(`${token} is not declared in ${theme}`);
  return value;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a flat hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const rgba = (value: string) => /^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/.exec(value)?.slice(1).map(Number);

/* ------------------------------------------------------------------ */
/* 1. A booking                                                         */
/* ------------------------------------------------------------------ */

const LIFTED = '.hs-card[data-kind="client"][data-recede="false"]';
const OPEN_LIFTED = '.hs-card[data-kind="client"][data-recede="false"][data-open="true"]';

describe("a booking on the Hub", () => {
  it("is told from the grid by an edge seen from outside it, its 4px state rail untouched, at radius 12", () => {
    const card = merged(CARD, ".hs-card");
    expect(card.border).toBe("1px solid var(--eq-edge)");
    expect(card["border-left"]).toBe("4px solid var(--eq-ink-faint)");
    expect(card["border-radius"]).toBe("12px");
    expect(card["background-clip"]).toBe("padding-box");
  });

  it("lifts only while it is a client's and not over, with two small blurs", () => {
    expect(merged(CARD, ".hs-card")["box-shadow"], "the base carries no lift").toBeUndefined();
    expect(merged(CARD, LIFTED)["box-shadow"]).toBe("var(--eq-elev-card), var(--eq-panel-highlight)");
    // --elev-card: at most two layers, each blur 8px or less (30-60 on screen).
    for (const theme of BOTH) {
      const layers = CORE[theme]["--elev-card"].split(/,(?![^(]*\))/);
      expect(layers.length, theme).toBeLessThanOrEqual(2);
      for (const l of layers) expect(Number(/^\s*-?\d+(?:px)? -?\d+(?:px)? (\d+)px/.exec(l)?.[1] ?? NaN), `${theme}: ${l}`).toBeLessThanOrEqual(8);
    }
  });

  it("is lifted by a rule keyed on values HubCard always sets, which a staff block never carries", () => {
    const card = read("features/hub-schedule/HubCard.tsx");
    expect(card).toContain("data-kind={kind}");
    expect(card).toContain('data-recede={recedes ? "true" : "false"}');
    // A staff block is its own element, data-kind="staff" and no data-recede.
    expect(card).toMatch(/className="hs-card" data-kind="staff"(?![^>]*data-recede)/);
  });

  it.each([
    ['.hs-card[data-recede="true"]'],
    ['.hs-card[data-kind="unlinked"]'],
    ['.hs-card[data-kind="pending"]'],
    ['.hs-card[data-kind="unknown"]'],
    ['.hs-card[data-kind="staff"]'],
  ])("lies flat when it is past or not a client: %s", (sel) => {
    expect(merged(CARD, sel)["box-shadow"]).toBe("none");
  });

  it("draws no other shadow: the lift, the open ring, or none", () => {
    const allowed = new Set(["none", "var(--eq-elev-card), var(--eq-panel-highlight)", "0 0 0 2px var(--eq-live), var(--eq-elev-3)"]);
    for (const r of rulesOf(CARD)) {
      const shadow = decls(r.body)["box-shadow"];
      if (shadow && r.selectors.every((s) => s.startsWith(".hs-card") && !/\s/.test(s))) expect(allowed.has(shadow), `${r.selectors.join(", ")}: ${shadow}`).toBe(true);
    }
  });

  it("keeps its blue ring when open and lifts higher, the ring outranking the lift and leaving the rail's colour alone", () => {
    const open = merged(CARD, OPEN_LIFTED);
    expect(open["box-shadow"]).toBe("0 0 0 2px var(--eq-live), var(--eq-elev-3)");
    expect(open["border-color"], "a rail keeps its colour").toBeUndefined();
    expect(attributes(OPEN_LIFTED)).toBeGreaterThan(attributes(LIFTED));
    expect(merged(CARD, '.hs-card[data-open="true"]')["box-shadow"]).toBe("0 0 0 2px var(--eq-live), var(--eq-elev-3)");
  });

  it("keeps its fill inside the edge in every state: a rule that repaints the fill restates the clip", () => {
    for (const [file, cls] of [[CARD, ".hs-card"], [STRIP, ".hn-item"]] as const) {
      const painted = rulesOf(file).filter(
        (r) => r.at.length === 0 && r.selectors.every((s) => s.startsWith(cls) && !/\s/.test(s)) && decls(r.body).background !== undefined,
      );
      expect(painted.length, file).toBeGreaterThan(1);
      for (const r of painted) expect(decls(r.body)["background-clip"], `${file}: ${r.selectors.join(", ")}`).toBe("padding-box");
    }
  });

  it("keeps an unlinked booking's dashes on today's hairline, never the faded soft edge or the 3:1 one", () => {
    const unlinked = merged(CARD, '.hs-card[data-kind="unlinked"]');
    expect(unlinked["border-style"]).toBe("dashed");
    for (const side of ["top", "right", "bottom"]) expect(unlinked[`border-${side}-color`], side).toBe("var(--eq-border)");
    expect(unlinked["border-left-color"], "its left keeps the edge its state gives it").toBeUndefined();
  });

  it("never animates a shadow: the card transitions its opacity alone", () => {
    expect(merged(CARD, ".hs-card").transition).toBe("opacity 150ms ease");
    for (const r of rulesOf(CARD)) {
      const t = decls(r.body).transition;
      if (t) expect(t, r.selectors.join(", ")).not.toMatch(/box-shadow|(^|[\s,])all\b/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The command bar                                                   */
/* ------------------------------------------------------------------ */

describe("the Hub's command bar", () => {
  it("keeps its 3:1 edge and sinks inside it, at a control's radius, without growing the top", () => {
    const bar = merged(TOP, ".hd-bar");
    expect(bar.border).toBe("1px solid var(--eq-border-strong)");
    expect(bar.background).toBe("var(--eq-surface-2)");
    expect(bar["box-shadow"]).toBe("var(--eq-elev-0)");
    expect(bar["border-radius"]).toBe("12px");
    expect(bar.padding).toBe("3px");
    for (const theme of BOTH) {
      const edge = resolve(theme, "--eq-border-strong");
      expect(contrast(edge, resolve(theme, "--eq-surface-2")), `${theme}: on the well`).toBeGreaterThanOrEqual(3);
      expect(contrast(edge, resolve(theme, "--eq-surface")), `${theme}: on the top`).toBeGreaterThanOrEqual(3);
    }
  });

  it("never clips the layer it raises (the switch's own stylesheet clips its corners)", () => {
    expect(merged("features/hub-opportunities/layer-switch.css", ".hl-switch").overflow).toBe("hidden");
    expect(merged(TOP, ".hd-bar .hl-switch").overflow).toBe("visible");
  });

  it("raises the layer you're on: the raised fill, the lift, a soft ring and the top light, its words blue at 700; the others 600", () => {
    const on = merged(TOP, '.hd-bar .hl-btn[aria-pressed="true"]');
    expect(on.background).toBe("var(--eq-raised)");
    expect(on["box-shadow"]).toBe("var(--eq-elev-1), inset 0 0 0 1px var(--eq-edge-control), inset 0 1px 0 var(--eq-highlight)");
    expect(on.color).toBe("var(--eq-live-text)");
    expect(on["font-weight"]).toBe("700");
    expect(merged(TOP, ".hd-bar .hl-btn")["font-weight"]).toBe("600");
    for (const theme of BOTH) {
      expect(contrast(resolve(theme, "--eq-live-text"), resolve(theme, "--eq-raised")), theme).toBeGreaterThanOrEqual(4.5);
    }
    expect(rulesOf(TOP).some((r) => r.selectors.includes(".hd-bar .hl-btn:active") && /translateY\(1px\)/.test(r.body))).toBe(true);
  });

  it("changes a tool's fill on hover for a pointer only (an iPad keeps :hover after a tap)", () => {
    const hovers = rulesOf(TOP).filter((r) => r.selectors.some((s) => s.includes(":hover")));
    expect(hovers.length).toBeGreaterThan(0);
    for (const r of hovers) {
      if (decls(r.body).background === undefined) continue;
      expect(r.at.some((a) => /hover:\s*hover/.test(a)), r.selectors.join(", ")).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. The week, the lane heads and the hours                            */
/* ------------------------------------------------------------------ */

/** The display face, upright, at `size` and 800. */
function display(rule: Record<string, string>, size: string) {
  expect(rule["font-family"]).toBe("var(--font-display)");
  expect(rule["font-size"]).toBe(size);
  expect(rule["font-style"] ?? "normal").toBe("normal");
  expect(rule["text-transform"] ?? "none").toBe("none");
}

describe("the week, the lane heads and the hours", () => {
  it("sets the day's numeral as a headline figure: Saira 17 at 800, upright, tabular", () => {
    const numeral = merged(TOP, ".hd-day-name strong");
    display(numeral, "17px");
    expect(numeral["font-weight"]).toBe("800");
    expect(numeral["font-variant-numeric"]).toBe("tabular-nums");
    expect(merged(TOP, ".hd-day")["min-height"]).toBe("44px");
  });

  it("lifts the picked day as a solid blue, and today-and-picked outranks it with its underline", () => {
    expect(merged(TOP, '.hd-day[aria-selected="true"]')["box-shadow"]).toBe("var(--eq-glow-live), var(--eq-solid-light)");
    expect(attributes('.hd-day[data-today="true"][aria-selected="true"]')).toBeGreaterThan(attributes('.hd-day[aria-selected="true"]'));
  });

  it("names a lane in the display face, as a client's name is; the You tag stays the text face at 12/700 in its own capitalisation", () => {
    const name = merged(GRID, ".hs-colname strong");
    display(name, "17px");
    expect(name["font-weight"]).toBe("800");
    expect(name["overflow-wrap"]).toBe("anywhere");
    const you = merged(GRID, ".hs-you");
    expect(you["font-family"]).toBe("var(--font-sans)");
    expect(you["font-size"]).toBe("12px");
    expect(you["font-weight"]).toBe("700");
    expect(you["text-transform"]).toBeUndefined();
    expect(read("features/hub-schedule/HubGrid.tsx")).toContain('<span className="hs-you">You</span>');
  });

  it("sets the hours in the display face at 17, 4px off the rail; the half hours stay the text face at 12", () => {
    const hour = merged(GRID, '.hs-tick[data-hour="true"]');
    display(hour, "17px");
    expect(hour["padding-right"]).toBe("4px");
    const half = merged(GRID, '.hs-tick[data-hour="false"]');
    expect(half["font-family"]).toBeUndefined();
    expect(half["font-size"]).toBe("12px");
    expect(half.color).toBe("var(--eq-ink-muted)");
    // The room an hour label has: the axis less the rail's 26px and the 4px.
    // "10 AM" in Saira 800 at 17 is about 37px (measured from the font file).
    const axis = parseFloat(merged(GRID, ".hs-scroll")["--hs-axis"]);
    const right = parseFloat(merged(GRID, ".hs-tick").right);
    expect(axis - right - 4).toBeGreaterThanOrEqual(44);
  });
});

/* ------------------------------------------------------------------ */
/* 4. The peek                                                          */
/* ------------------------------------------------------------------ */

describe("the peek", () => {
  it("is a popover: the deepest lift on the page, radius 18, the popover fill inside its rim, with the top light", () => {
    const peek = merged(PEEK, ".hp");
    expect(peek["box-shadow"]).toBe("var(--eq-elev-4), inset 0 1px 0 var(--eq-popover-light)");
    expect(peek["border-radius"]).toBe("18px");
    expect(peek.border).toBe("1px solid var(--eq-popover-rim)");
    expect(peek.background).toBe("var(--eq-popover)");
    expect(peek["background-clip"]).toBe("padding-box");
  });

  it("is the card's fill on the soft edge in light, and index.css's popover with a white rim and top light in dark", () => {
    expect(EQ.light["--eq-popover"]).toBe("var(--eq-surface)");
    expect(resolve("light", "--eq-popover").toLowerCase()).toBe(CORE.light["--popover"].toLowerCase());
    expect(EQ.light["--eq-popover-rim"]).toBe("var(--eq-edge)");
    expect(rgba(EQ.light["--eq-popover-light"])?.[3], "no top light in light").toBe(0);
    expect(resolve("dark", "--eq-popover").toLowerCase()).toBe(CORE.dark["--popover"].toLowerCase());
    expect(rgba(EQ.dark["--eq-popover-rim"])).toEqual([255, 255, 255, 0.055]);
    expect(rgba(EQ.dark["--eq-popover-light"])).toEqual([255, 255, 255, 0.07]);
    // Higher is lighter: in dark the peek sits a step above the card.
    expect(luminance(rgb(resolve("dark", "--eq-popover")))).toBeGreaterThan(luminance(rgb(resolve("dark", "--eq-surface"))));
  });

  it("keeps its words at 4.5:1 and its buttons' edge at 3:1 on its fill, in both modes", () => {
    for (const theme of BOTH) {
      const fill = resolve(theme, "--eq-popover");
      for (const ink of ["--eq-ink", "--eq-ink-2", "--eq-ink-muted", "--eq-live-text"]) {
        expect({ theme, ink, pass: contrast(resolve(theme, ink), fill) >= 4.5 }).toEqual({ theme, ink, pass: true });
      }
      expect({ theme, edge: contrast(resolve(theme, "--eq-border-strong"), fill) >= 3 }).toEqual({ theme, edge: true });
    }
  });

  it("raises its buttons above the popover in dark too, their 3:1 edge moving with them (review fix, Oct 5 2026)", () => {
    const peek = merged(PEEK, ".hp");
    expect(peek["--eq-raised"]).toBe("var(--eq-popover-raised)");
    expect(peek["--eq-border-strong"]).toBe("var(--eq-popover-edge)");
    for (const theme of BOTH) {
      const fill = resolve(theme, "--eq-popover");
      const raised = resolve(theme, "--eq-popover-raised");
      const edge = resolve(theme, "--eq-popover-edge");
      // Lighter means higher: a raised button is never darker than the peek.
      expect({ theme, higher: luminance(rgb(raised)) >= luminance(rgb(fill)) }).toEqual({ theme, higher: true });
      expect({ theme, onFill: contrast(edge, raised) >= 3, onPeek: contrast(edge, fill) >= 3 }).toEqual({ theme, onFill: true, onPeek: true });
      for (const ink of ["--eq-ink", "--eq-ink-2", "--eq-ink-muted"]) {
        expect({ theme, ink, pass: contrast(resolve(theme, ink), raised) >= 4.5 }).toEqual({ theme, ink, pass: true });
      }
    }
    // index.css's own pair, which dialogs, sheets and menus read.
    expect(CORE.light["--popover-raised"]).toBe("var(--raised)");
    expect(CORE.light["--popover-input"]).toBe("var(--input)");
    expect(luminance(rgb(CORE.dark["--popover-raised"]))).toBeGreaterThan(luminance(rgb(CORE.dark["--popover"])));
    expect(contrast(CORE.dark["--popover-input"], CORE.dark["--popover-raised"])).toBeGreaterThanOrEqual(3);
    expect(contrast(CORE.dark["--popover-input"], CORE.dark["--popover"])).toBeGreaterThanOrEqual(3);
    expect(INDEX).toMatch(/\[data-slot="dialog-content"\][^{]*\{\s*--raised: var\(--popover-raised\);\s*--input: var\(--popover-input\);/);
  });

  it("titles the client in the display face at 22, upright, whole and wrapping", () => {
    const name = merged(PEEK, ".hp-name");
    display(name, "22px");
    expect(name["font-weight"]).toBe("800");
    expect(name["overflow-wrap"]).toBe("anywhere");
  });

  it("says \"Last in\" and \"Package\" as words (14/600, no capitals), divided from the lines above by the soft hairline", () => {
    const label = merged(PEEK, ".hp-fact-label");
    expect(label["font-size"]).toBe("14px");
    expect(label["font-weight"]).toBe("600");
    expect(label["text-transform"]).toBeUndefined();
    expect(label["letter-spacing"]).toBe("0");
    const model = read("features/hub-schedule/peek-model.ts");
    expect(model).toContain('label: "Last in"');
    expect(model).toContain('label: "Package"');
    expect(merged(PEEK, ".hp-facts")["border-top"]).toBe("1px solid var(--eq-divider)");
  });
});
