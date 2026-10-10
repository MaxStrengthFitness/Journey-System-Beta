import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE HUB'S COLOUR RULES (the Navy Frame, Oct 4 2026).
 *
 * equipment-tokens.test.ts measures the palette's pairs; this holds the RULES
 * that draw them, so a later edit can't quietly put a pair back that no
 * longer passes. AJ asked for the logo's blue and orange as the accents, and
 * answered "your pick" to the three questions (2A: a coming-up card gets a
 * quiet blue edge). What the rules promise:
 *
 *   - orange is now and go: today's ring and numeral, and ONE orange at the
 *     now marker (the line, the rail's dot and the pill, with navy words);
 *   - blue is yours and picked: the picked day, your column, its head and
 *     the blue rule under your name; colleagues' circles are quiet;
 *   - every morning today IS the picked day, so its orange underline is drawn
 *     OUTSIDE the blue chip, where it measures 3:1 (inside, hue alone);
 *   - a coming-up client card has the quiet blue edge, by attributes HubCard
 *     always sets (a rule keyed on a missing attribute matches nothing);
 *   - Start session and every orange chip with words are the logo orange with
 *     navy words, the fill restated on :hover (an iPad keeps hover after a
 *     tap), and nothing on these screens reads a white "hero-on" word colour;
 *   - words are never in the faint ink, and a card that is over still reads.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** A stylesheet with its line endings made \n and its comments taken out. */
const stylesheet = (path: string) =>
  readFileSync(join(SRC, path), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const normalise = (selector: string) => selector.trim().replace(/\s+/g, " ");

interface Rule {
  selectors: string[];
  body: Record<string, string>;
  at: number;
}

/** Every rule in a stylesheet, nested ones included, in source order. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith("@")) continue;
    const body: Record<string, string> = {};
    for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) body[d[1]] = d[2].trim();
    out.push({ selectors: head.split(",").map(normalise), body, at: m.index ?? 0 });
  }
  return out;
}

/** The declarations every rule naming `selector` adds up to (a later one wins). */
function declared(css: string, selector: string): Record<string, string> {
  const want = normalise(selector);
  const found = rules(css).filter((r) => r.selectors.includes(want));
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return Object.assign({}, ...found.map((r) => r.body));
}

/** Where the first rule naming `selector` starts. */
function position(css: string, selector: string): number {
  const want = normalise(selector);
  const rule = rules(css).find((r) => r.selectors.includes(want));
  if (!rule) throw new Error(`no rule for ${selector}`);
  return rule.at;
}

const GRID = stylesheet("features/hub-schedule/hub-grid.css");
const TOP = stylesheet("features/hub-schedule/day-header.css");
const CARD = stylesheet("features/hub-schedule/hub-card.css");

describe("the now marker", () => {
  it("is one orange: the line, the rail's dot and the pill", () => {
    expect(declared(GRID, ".hs-now")["border-top"]).toContain("var(--eq-hero)");
    expect(declared(GRID, ".hs-rail-now").background).toBe("var(--eq-hero)");
    expect(declared(GRID, ".hs-now-pill").background).toBe("var(--eq-hero)");
  });

  it("carries navy words on its pill, never white", () => {
    expect(declared(GRID, ".hs-now-pill").color).toBe("var(--eq-go-on)");
  });
});

describe("the week", () => {
  it("rings today in orange, with its numeral in the deep orange", () => {
    expect(declared(TOP, '.hd-day[data-today="true"]')["border-color"]).toBe("var(--eq-hero)");
    expect(declared(TOP, '.hd-day[data-today="true"] .hd-day-name strong').color).toBe("var(--eq-hero-text)");
  });

  it("fills the picked day in blue", () => {
    const picked = declared(TOP, '.hd-day[aria-selected="true"]');
    expect(picked.background).toBe("var(--eq-live)");
    expect(picked.color).toBe("var(--eq-live-on)");
  });

  it("underlines today in orange OUTSIDE the blue chip when today is the picked day", () => {
    const both = declared(TOP, '.hd-day[data-today="true"][aria-selected="true"]');
    expect(both["border-color"]).toBe("var(--eq-live)");
    expect(both["box-shadow"]).toMatch(/^0 3px 0 var\(--eq-hero\)$/);
    expect(both["box-shadow"]).not.toMatch(/inset/);
    expect(declared(TOP, '.hd-day[data-today="true"][aria-selected="true"] .hd-day-name strong').color).toBe("var(--eq-live-on)");
  });

  it("raises the layer you're on as a chip on the bar, not a tint alone", () => {
    // Moved on purpose (type and depth, phase 11): the chip is RAISED out of
    // the bar's well now, the raised fill a hair lighter than the card and
    // the control's lift (it was the card's fill and a 1px shadow).
    const on = declared(TOP, '.hd-bar .hl-btn[aria-pressed="true"]');
    expect(on.background).toBe("var(--eq-raised)");
    expect(on["box-shadow"]).toContain("var(--eq-elev-1)");
  });
});

describe("your column", () => {
  it("has a blue cast, opaque because it is sticky", () => {
    expect(declared(GRID, '.hs-col[data-me="true"]').background).toBe("var(--eq-mine)");
  });

  it("has a blue head with a 3px blue rule under your name", () => {
    const head = declared(GRID, '.hs-colhead[data-me="true"]');
    expect(head.background).toBe("var(--eq-mine-head)");
    expect(head["box-shadow"]).toBe("inset 0 -3px 0 var(--eq-live)");
  });

  it("keeps the only solid blue disc; colleagues' circles are quiet", () => {
    expect(declared(GRID, '.hs-colhead[data-me="true"] .hs-avatar').background).toBe("var(--eq-live)");
    const theirs = declared(GRID, ".hs-avatar");
    expect(theirs.background).toBe("var(--eq-surface-3)");
    expect(theirs.color).toBe("var(--eq-ink)");
  });

  it("sets the YOU tag on a card-coloured chip so it stands off the head", () => {
    expect(declared(GRID, '.hs-colhead[data-me="true"] .hs-you').background).toBe("var(--eq-surface)");
  });
});

describe("a coming-up client card (AJ's answer 2A)", () => {
  const COMING_UP = '.hs-card[data-kind="client"][data-state="live"]';

  it("has the quiet blue edge", () => {
    expect(declared(CARD, COMING_UP)["border-left-color"]).toBe("var(--eq-rail-booked)");
  });

  it("is keyed on attributes HubCard always sets, never on a missing one", () => {
    const card = readFileSync(join(HERE, "HubCard.tsx"), "utf8");
    expect(card).toContain("data-kind={kind}");
    expect(card).toContain("data-state={cardState}");
    expect(CARD).not.toMatch(/\.hs-card[^{,]*:not\(\[data-(state|kind|recede)\]\)/);
  });

  it("comes before in session, which keeps the full blue edge and its fill", () => {
    expect(position(CARD, COMING_UP)).toBeLessThan(position(CARD, '.hs-card[data-state="in-session"]'));
    const live = declared(CARD, '.hs-card[data-state="in-session"]');
    expect(live["border-left-color"]).toBe("var(--eq-live)");
    expect(live.background).toBe("var(--eq-live-fill)");
  });

  it("stays blue all round while its peek is open", () => {
    expect(declared(CARD, `${COMING_UP}[data-open="true"]`)["border-color"]).toBe("var(--eq-live)");
  });

  it("is drawn the same way in the Key", () => {
    expect(declared(TOP, '.hd-swatch[data-state="live"]')["border-left"]).toContain("var(--eq-rail-booked)");
  });

  it("is drawn the same way on the Next 30 minutes strip, and an open or unlinked item there still wins", () => {
    const STRIP = stylesheet("features/hub-schedule/next-strip.css");
    const SOON = '.hn-item[data-when="soon"]';
    expect(declared(STRIP, SOON)["border-left-color"]).toBe("var(--eq-rail-booked)");
    // Same specificity, so the later rule wins: unlinked keeps the grid's
    // unlinked edge and an open item is blue all round.
    expect(declared(STRIP, '.hn-item[data-kind="unlinked"]')["border-left-color"]).toBe("var(--eq-ink-faint)");
    expect(position(STRIP, SOON)).toBeLessThan(position(STRIP, '.hn-item[data-kind="unlinked"]'));
    expect(position(STRIP, SOON)).toBeLessThan(position(STRIP, '.hn-item[data-open="true"]'));
  });
});

/** Start session and the orange chips with words: [stylesheet, selector, its :hover (buttons only), the palette]. */
const GO: Array<[string, string, string | null, string]> = [
  ["features/hub-schedule/peek.css", '.hp-btn[data-primary="true"]', '.hp-btn[data-primary="true"]:hover', "eq"],
  ["features/hub-opportunities/run-sheet.css", '.ho-action[data-primary="true"]', '.ho-action[data-primary="true"]:hover', "eq"],
  ["features/client-directory/client-directory.css", ".cd-start", ".cd-start:hover", "eq"],
  ["features/admin/admin.css", ".adm-btn--hero", ".adm-btn--hero:not(:disabled):hover", "adm"],
  ["features/machine-fit/ui/machine-fit.css", ".fit-btn--hero", ".fit-btn--hero:hover", "eq"],
  // The machine card's Save and Add note are the solid blue since Oct 10 2026 (buttons-depth.test.ts, SOLID).
  ["features/routines/routines.css", ".rt-btn--hero", ".rt-btn--hero:hover", "eq"],
  ["features/routines/routines.css", ".rt-routine--today .rt-badge", null, "eq"],
  ["features/routines/routines.css", ".rt-today", null, "eq"],
];

describe("the one loud action and every orange chip with words", () => {
  for (const [file, selector, hover, palette] of GO) {
    it(`${selector} is the logo orange with navy words`, () => {
      const css = stylesheet(file);
      const rule = declared(css, selector);
      expect(rule.background).toBe(`var(--${palette}-go)`);
      expect(rule.color).toBe(`var(--${palette}-go-on)`);
      if (hover) {
        const kept = declared(css, hover);
        expect(kept.background).toBe(`var(--${palette}-go)`);
        expect(kept.color).toBe(`var(--${palette}-go-on)`);
        expect(kept.filter).toBeUndefined();
      }
    });
  }

  it("leaves no white hero word colour on the Hub, the peek, the run sheet and the other Start buttons", () => {
    const files = [...new Set(GO.map(([file]) => file))].concat([
      "features/hub-schedule/hub-grid.css",
      "features/hub-schedule/day-header.css",
      "features/hub-schedule/hub-card.css",
    ]);
    for (const file of files) expect({ file, reads: /-hero-on\)/.test(stylesheet(file)) }).toEqual({ file, reads: false });
  });
});

/* ---------------------------------------------------------------------------
   Words that must still read: the faint ink is for edges and marks, and a
   card that is over keeps its name at 4.5:1 over the grid and your lane.
   --------------------------------------------------------------------------- */

const TOKENS = stylesheet("features/equipment/equipment.tokens.css");

function block(selector: string): Record<string, string> {
  const at = TOKENS.indexOf(selector);
  if (at < 0) throw new Error(`token block not found: ${selector.trim()}`);
  const open = TOKENS.indexOf("{", at);
  const out: Record<string, string> = {};
  for (const m of TOKENS.slice(open + 1, TOKENS.indexOf("}", open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const LIGHT = block("\n:root {");
const THEMES = { light: LIGHT, dark: { ...LIGHT, ...block('\n.dark,\n[data-theme="dark"] {') } };

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a flat hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * How much of a finished card still shows (0.70): the card is veiled in its
 * own ground at the rest (hub-card.css, the iPad round, Oct 6 2026), which
 * draws the pixels opacity 0.70 drew without a layer per card.
 */
function recedeStrength(): number {
  const veil = declared(CARD, '.hs-card[data-recede="true"]::after').background;
  const m = /^color-mix\(in srgb, var\(--hs-ground, var\(--eq-bg\)\) (\d+)%, transparent\)$/.exec(veil);
  expect(m, veil).not.toBeNull();
  return 1 - Number(m![1]) / 100;
}

/** A colour drawn at opacity `o` over `under`. */
const faded = (c: [number, number, number], o: number, under: [number, number, number]) =>
  c.map((v, i) => v * o + under[i] * (1 - o)) as [number, number, number];

describe("words that must still read", () => {
  it("never sets the Hub's words in the faint ink", () => {
    for (const css of [GRID, TOP, CARD, stylesheet("features/hub-schedule/peek.css")]) {
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--eq-ink-faint\)/);
    }
    expect(declared(GRID, ".hs-rest-head").color).toBe("var(--eq-ink-muted)");
  });

  it("recedes a finished card without opacity: a veil of its own ground, set per column (the iPad round, Oct 6 2026)", () => {
    expect(declared(CARD, '.hs-card[data-recede="true"]').opacity, "no translucent layer per card").toBeUndefined();
    expect(declared(GRID, ".hs-col")["--hs-ground"]).toBe("var(--eq-bg)");
    expect(declared(GRID, '.hs-col[data-me="true"]')["--hs-ground"]).toBe("var(--eq-mine)");
    expect(declared(GRID, '.hs-col[data-me="true"]').background).toBe("var(--eq-mine)");
    expect(recedeStrength()).toBeCloseTo(0.7, 5);
  });

  it("keeps an open finished card's left rail grey, and a dimmed finished card as faint as any dimmed card (the review, Oct 6 2026)", () => {
    // Open while over: blue round three sides only. A border-color shorthand
    // here would outrank the receded rail and turn it blue.
    const openOver = declared(CARD, '.hs-card[data-recede="true"][data-open="true"]');
    expect(openOver["border-color"]).toBeUndefined();
    expect(openOver["border-left-color"]).toBeUndefined();
    for (const side of ["top", "right", "bottom"]) expect(openOver[`border-${side}-color`], side).toContain("var(--eq-live) 70%");
    expect(declared(CARD, '.hs-card[data-recede="true"]')["border-left-color"]).toContain("var(--eq-border-strong) 70%");
    // Dimmed: the veil goes, so the dim's 0.22 is the whole fade, as before.
    expect(declared(CARD, '.hs-card[data-dim="true"]').opacity).toBe("0.22");
    expect(declared(CARD, '.hs-card[data-dim="true"]::after').content).toBe("none");
    expect(position(CARD, '.hs-card[data-recede="true"]::after')).toBeLessThan(position(CARD, '.hs-card[data-dim="true"]::after'));
  });

  it("lifts the column holding focus over its neighbours, under your column and the axis", () => {
    expect(declared(GRID, ".hs-col:focus-within")["z-index"]).toBe("2");
    expect(declared(GRID, '.hs-col[data-me="true"]')["z-index"]).toBe("3");
    expect(position(GRID, ".hs-col:focus-within")).toBeLessThan(position(GRID, '.hs-col[data-me="true"]'));
  });

  it("keeps a finished card's name at 4.5:1 over the grid and over your lane, in both modes", () => {
    const opacity = recedeStrength();
    expect(opacity).toBeGreaterThan(0);
    for (const [mode, t] of Object.entries(THEMES)) {
      for (const ground of ["--eq-bg", "--eq-mine"]) {
        const under = rgb(t[ground]);
        const card = faded(rgb(t["--eq-surface-2"]), opacity, under);
        const name = faded(rgb(t["--eq-ink"]), opacity, under);
        const ratio = contrast(name, card);
        expect({ mode, ground, pass: ratio >= 4.5 }).toEqual({ mode, ground, pass: true });
      }
    }
  });

  it("lifts a finished card's quiet words (the time, Not logged, the rest, the number, a staff name) to the ink", () => {
    for (const words of [".hs-card-when", ".hs-card-when strong", ".hs-card-rest", ".hs-card-rest strong", ".hs-card-num", ".hs-card-staff"]) {
      expect(declared(CARD, `.hs-card[data-recede="true"] ${words}`).color, words).toBe("var(--eq-ink)");
    }
    for (const kind of ["staff", "unlinked"]) {
      expect(declared(CARD, `.hs-card[data-recede="true"][data-kind="${kind}"] .hs-card-name`).color, kind).toBe("var(--eq-ink)");
    }
  });

  it("recedes the Key's swatches as far as the cards", () => {
    const opacity = String(recedeStrength());
    expect(declared(TOP, '.hd-swatch[data-state="done"]').opacity).toBe(opacity);
    expect(declared(TOP, '.hd-swatch[data-state="left-open"]').opacity).toBe(opacity);
  });
});

/* ---------------------------------------------------------------------------
   A selection is blue (AJ, Oct 4 2026: "yes"). The Equipment tab's picked
   machine was the hero orange, which is for now and go; the review of the
   follow-ups found it. Its fill is kept on :hover (an iPad keeps hover after
   the tap that picked it) and on a machine not in use.
   --------------------------------------------------------------------------- */

describe("the Equipment tab's picked machine is the blue", () => {
  const EQ = stylesheet("features/equipment/equipment.css");

  it("fills with the live fill and a blue edge, kept on :hover and on a machine not in use", () => {
    for (const selector of [".eq-item--selected", ".eq-item--selected:hover", ".eq-item--selected.eq-item--idle"]) {
      const rule = declared(EQ, selector);
      expect(rule.background, selector).toBe("var(--eq-live-fill)");
      expect(rule["border-left-color"], selector).toBe("var(--eq-live)");
    }
    // Equal weight, so the picked rule must come after the plain hover and the idle ground.
    expect(position(EQ, ".eq-item--selected:hover")).toBeGreaterThan(position(EQ, ".eq-item:hover"));
    expect(position(EQ, ".eq-item--selected.eq-item--idle")).toBeGreaterThan(position(EQ, ".eq-item--idle"));
    expect(EQ).not.toMatch(/\.eq-item--selected[^{]*\{[^}]*--eq-hero/);
  });

  it("keeps every word on it at 4.5:1 and its edge at 3:1, in both modes", () => {
    for (const [mode, t] of Object.entries(THEMES)) {
      const fill = rgb(t["--eq-live-fill"]);
      for (const ink of ["--eq-ink", "--eq-ink-2", "--eq-ink-muted", "--eq-hero-text"]) {
        expect({ mode, ink, pass: contrast(rgb(t[ink]), fill) >= 4.5 }).toEqual({ mode, ink, pass: true });
      }
      expect({ mode, edge: contrast(rgb(t["--eq-live"]), rgb(t["--eq-surface"])) >= 3 }).toEqual({ mode, edge: true });
    }
    // "No load yet" and the session count are words: the muted ink, never the faint.
    expect(declared(EQ, ".eq-item__empty").color).toBe("var(--eq-ink-muted)");
    expect(declared(EQ, ".eq-item__count").color).toBe("var(--eq-ink-muted)");
  });
});
