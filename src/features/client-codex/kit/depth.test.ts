import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE CODEX KIT'S DEPTH AND HEADS (type and depth, phase 6, Oct 4 2026; AJ's
 * "1a 2a 3b" on the Refined Lift kit).
 *
 * One rule in kit.css reaches about fifty panels, seventy-seven buttons and
 * fifteen empty lines across Notes & Profile, so this holds the decisions
 * those rules made:
 *
 *   - a panel (card, slot, the Next card) has an edge seen from outside it
 *     and the short navy lift, and a host card (spacing only) has neither;
 *   - a panel's head is its title: 17/700 in ink, sentence case, its icon in
 *     a 32px tinted square; the small caps eyebrow is 12/700 in the second
 *     ink; the codex lede stays 17/600 in ink, never quieter than the title;
 *   - page titles, the Next card's page name and a big number are upright
 *     (the slanted capitals are the studio name's and Start session's), and
 *     a section title is Geist 22/800 in sentence case;
 *   - an empty line and a FORD pillar are wells: sunk, no border, no dashes;
 *   - a button and a choice are raised ON their 3:1 edge (AJ's 2A), press
 *     in with a transform, and lie flat when they can't be pressed;
 *   - a field keeps its 3:1 edge and sinks; a list inside a panel draws no
 *     box of its own and divides its rows with the soft divider;
 *   - nothing in either file animates a shadow.
 *
 * If one of these fails, the stylesheet moved away from the kit AJ chose.
 * Change the test only with the rule, on purpose, and say why.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string; index: number };

/** Every style rule, those inside an @media block included, in file order. */
function rulesOf(css: string): Rule[] {
  const out: Rule[] = [];
  let index = 0;
  for (const m of uncommented(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)$/.test(prelude)) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")), body: m[2], index: index++ });
  }
  return out;
}

const KIT = rulesOf(read(join(HERE, "kit.css")));
const SHELL = rulesOf(read(join(HERE, "..", "codex.css")));

const BY_FILE: Record<"kit.css" | "codex.css", Rule[]> = { "kit.css": KIT, "codex.css": SHELL };

const rulesFor = (rules: Rule[], selector: string) => rules.filter((r) => r.selectors.includes(selector));

/** The value the LAST rule naming exactly this selector gives the property, or null. */
function decl(rules: Rule[], selector: string, prop: string): string | null {
  let value: string | null = null;
  for (const r of rulesFor(rules, selector)) {
    for (const m of r.body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))) value = m[1].trim();
  }
  return value;
}

const PANEL_SHADOW = "var(--cx-elev-2), var(--cx-panel-highlight)";

describe("a panel lies on the page", () => {
  it.each([".cx-card", ".cx-slot", ".cx-next"])("%s: an edge seen from outside it, and the short navy lift", (sel) => {
    expect(decl(KIT, sel, "border")).toBe("1px solid var(--cx-edge)");
    expect(decl(KIT, sel, "background-clip")).toBe("padding-box");
    expect(decl(KIT, sel, "box-shadow")).toBe(PANEL_SHADOW);
  });

  it("a host card is spacing only: no border, no fill and no lift, so two never nest", () => {
    expect(decl(KIT, ".cx-card[data-host]", "border")).toBe("0");
    expect(decl(KIT, ".cx-card[data-host]", "background")).toBe("transparent");
    expect(decl(KIT, ".cx-card[data-host]", "box-shadow")).toBe("none");
  });
});

describe("a panel's head is its title", () => {
  const HEADS = [".cx-card-head > .cx-eyebrow", ".cx-slot__head > .cx-eyebrow"];

  it.each(HEADS)("%s: 17/700 in ink, sentence case", (sel) => {
    expect(decl(KIT, sel, "font-size")).toBe("var(--cx-fs-17)");
    expect(decl(KIT, sel, "font-weight")).toBe("700");
    expect(decl(KIT, sel, "color")).toBe("var(--cx-ink)");
    expect(decl(KIT, sel, "text-transform")).toBe("none");
  });

  it.each(HEADS.map((h) => `${h} > svg`))("%s: the icon in a 32px tinted square", (sel) => {
    expect(decl(KIT, sel, "box-sizing")).toBe("border-box");
    expect(decl(KIT, sel, "width")).toBe("32px");
    expect(decl(KIT, sel, "height")).toBe("32px");
    expect(decl(KIT, sel, "background")).toBe("var(--cx-surface-2)");
  });

  it("the eyebrow left over is the one small-capitals voice: 12/700/0.08em in the second ink", () => {
    expect(decl(KIT, ".cx-eyebrow", "font-size")).toBe("var(--cx-fs-12)");
    expect(decl(KIT, ".cx-eyebrow", "font-weight")).toBe("700");
    expect(decl(KIT, ".cx-eyebrow", "letter-spacing")).toBe("0.08em");
    expect(decl(KIT, ".cx-eyebrow", "text-transform")).toBe("uppercase");
    expect(decl(KIT, ".cx-eyebrow", "color")).toBe("var(--cx-ink-2)");
  });

  it("a list's head inside the FORD panel takes the label voice: 14/700, sentence case", () => {
    const sel = ".cx-ov-mini > .cx-eyebrow";
    expect(decl(SHELL, sel, "font-size")).toBe("var(--cx-fs-14)");
    expect(decl(SHELL, sel, "font-weight")).toBe("700");
    expect(decl(SHELL, sel, "color")).toBe("var(--cx-ink-2)");
    expect(decl(SHELL, sel, "text-transform")).toBe("none");
  });

  it("the codex lede stays 17/600 in ink: what the trainer reads is never quieter than its title", () => {
    expect(decl(KIT, ".cx-lede", "font-size")).toBe("var(--cx-fs-17)");
    expect(decl(KIT, ".cx-lede", "font-weight")).toBe("600");
    expect(decl(KIT, ".cx-lede", "color")).toBe("var(--cx-ink)");
  });
});

describe("titles are upright; the slanted capitals are the studio name's and Start session's", () => {
  it.each([".cx-page-title", ".cx-next__label", ".cx-big"])("%s: Saira, upright, never capitals", (sel) => {
    expect(decl(KIT, sel, "font-family")).toBe("var(--cx-font-display)");
    expect(decl(KIT, sel, "font-weight")).toBe("800");
    expect(decl(KIT, sel, "font-style")).toBe("normal");
    expect(decl(KIT, sel, "text-transform") ?? "none").toBe("none");
  });

  it("a page title is 30, and a big number's figures are all one width", () => {
    expect(decl(KIT, ".cx-page-title", "font-size")).toBe("var(--cx-fs-30)");
    expect(decl(KIT, ".cx-big", "font-variant-numeric")).toBe("tabular-nums");
  });

  it("a section title is Geist 22/800 in sentence case", () => {
    expect(decl(KIT, ".cx-section-head", "font-family")).toBe("var(--cx-font-body)");
    expect(decl(KIT, ".cx-section-head", "font-size")).toBe("var(--cx-fs-22)");
    expect(decl(KIT, ".cx-section-head", "font-weight")).toBe("800");
    expect(decl(KIT, ".cx-section-head", "font-style")).toBe("normal");
    expect(decl(KIT, ".cx-section-head", "text-transform")).toBe("none");
  });
});

describe("a box inside a panel is a well", () => {
  it.each([
    ["kit.css", ".cx-empty"],
    ["codex.css", ".cx-ov-pillar"],
  ] as const)("%s %s: sunk, with no border to see and no dashes", (file, sel) => {
    const rules = BY_FILE[file];
    expect(decl(rules, sel, "background")).toBe("var(--cx-surface-2)");
    expect(decl(rules, sel, "box-shadow")).toBe("var(--cx-elev-0)");
    expect(["0", "1px solid transparent"]).toContain(decl(rules, sel, "border"));
    for (const r of rulesFor(rules, sel)) expect(r.body).not.toMatch(/dashed/);
  });

  it("a pillar's letter is a small raised disc, ringed so a pale letter still reads in dark", () => {
    expect(decl(SHELL, ".cx-ov-pillar .cx-mark", "box-shadow")).toBe(
      "var(--cx-elev-1), inset 0 0 0 1px var(--cx-edge-control)",
    );
  });

  it("dashes are kept only where they mean something: a chip just added, not yet looked at", () => {
    const dashed = (rules: Rule[]) => rules.filter((r) => /dashed/.test(r.body)).flatMap((r) => r.selectors);
    expect(dashed(KIT)).toEqual(['.cx-chip[data-tone="new"]']);
    expect(dashed(SHELL)).toEqual([]);
  });

  it("a field keeps its 3:1 edge and sinks", () => {
    for (const sel of [".cx-input", ".cx-select", ".cx-textarea"]) {
      expect(decl(KIT, sel, "border"), sel).toBe("1px solid var(--cx-line-2)");
      expect(decl(KIT, sel, "background"), sel).toBe("var(--cx-surface-2)");
      expect(decl(KIT, sel, "box-shadow"), sel).toBe("var(--cx-elev-0)");
    }
  });

  it("a list inside a panel draws no box of its own, and its rows divide with the soft divider", () => {
    for (const sel of [".cx-card .cx-rows", ".cx-slot .cx-rows"]) {
      expect(decl(KIT, sel, "border"), sel).toBe("0");
      expect(decl(KIT, sel, "background"), sel).toBe("transparent");
    }
    expect(decl(KIT, ".cx-row", "border-top")).toBe("1px solid var(--cx-divider)");
  });
});

describe("a button is raised on its 3:1 edge (AJ's 2A), and presses in", () => {
  it.each([".cx-btn", ".cx-pick"])("%s: the 3:1 edge kept, the lighter fill, the lift and the top light", (sel) => {
    expect(decl(KIT, sel, "border")).toBe("1px solid var(--cx-line-2)");
    expect(decl(KIT, sel, "background")).toBe("var(--cx-raised)");
    expect(decl(KIT, sel, "box-shadow")).toBe("var(--cx-elev-1), inset 0 1px 0 var(--cx-highlight)");
  });

  it.each([".cx-btn:not(:disabled):active", ".cx-pick:not(:disabled):active"])("%s: a press is a transform", (sel) => {
    expect(decl(KIT, sel, "transform")).toBe("translateY(1px)");
    expect(decl(KIT, sel, "box-shadow")).toBe("var(--cx-press)");
  });

  it("the blue tint keeps its 45% live edge and lifts; solid blue glows; quiet has no box", () => {
    expect(decl(KIT, '.cx-btn[data-variant="live"]', "border-color")).toBe("var(--cx-live-line)");
    expect(decl(KIT, '.cx-btn[data-variant="live"]', "box-shadow")).toBe("var(--cx-elev-1)");
    expect(decl(KIT, '.cx-btn[data-variant="solid"]', "box-shadow")).toBe("var(--cx-glow-live), var(--cx-solid-light)");
    expect(decl(KIT, '.cx-btn[data-variant="quiet"]', "box-shadow")).toBe("none");
  });

  it("a button or choice that can't be pressed lies flat, after every variant so it wins", () => {
    const flat = KIT.filter((r) => r.selectors.includes(".cx-btn:disabled") && /box-shadow\s*:\s*none/.test(r.body));
    expect(flat).toHaveLength(1);
    expect(flat[0].selectors).toContain(".cx-pick:disabled");
    const lifts = KIT.filter(
      (r) =>
        /box-shadow/.test(r.body) &&
        r.selectors.some((s) => /^\.cx-(btn|pick)(\[[^\]]*\])?$/.test(s)),
    );
    for (const r of lifts) expect(r.index, r.selectors.join(", ")).toBeLessThan(flat[0].index);
  });
});

describe("nothing animates a shadow", () => {
  it.each(["kit.css", "codex.css"] as const)("%s: no transition names box-shadow or all", (file) => {
    for (const r of BY_FILE[file]) {
      for (const m of r.body.matchAll(/(?:^|[;\s])transition(?:-property)?\s*:\s*([^;]+)/g)) {
        expect(m[1], r.selectors.join(", ")).not.toMatch(/box-shadow|\ball\b/);
      }
    }
  });
});

describe("the parser itself", () => {
  it("reads a rule inside @media, and the last value a selector is given", () => {
    const rules = rulesOf(".a { color: red; }\n@media (hover: hover) {\n  .a:hover,\n  .b { color: blue; }\n}\n.a { color: green; }");
    expect(decl(rules, ".a", "color")).toBe("green");
    expect(decl(rules, ".b", "color")).toBe("blue");
    expect(decl(rules, ".a:hover", "color")).toBe("blue");
    expect(decl(rules, ".a", "border")).toBeNull();
  });
});
