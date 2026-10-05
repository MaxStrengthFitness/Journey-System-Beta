import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE FRAME CASTS, AND A ROOM'S BAR IS A SHELF (type and depth, phase 5,
 * Oct 4 2026; AJ: "borders and headers just needs a little bit of weight and
 * depth"; his answers 1a 2a 3b).
 *
 * The navy header and bottom bar end in the frame's own cast (--frame-down,
 * --frame-up) instead of a white hairline and an invisible black shadow. Each
 * room's bar over scrolling content (the Hub's top and its names row, My
 * Studio's header and Relay's sub-bar, Learning's masthead and bar,
 * Operations' tabs) ends in its family's --X-shelf instead of a hairline, so
 * the content scrolls UNDER it rather than being cut by a rule.
 *
 * A shadow only shows on what is stacked under it, so the order is part of
 * the look: the frame (20 and 30) over every shelf, a room's bar (9 to 11)
 * over the Hub's names row (8), a masthead over its own sub-row. The Active
 * Session's grid keeps its own documented order (journey-grid.css's
 * "Layers"), untouched by this round; the last block holds it.
 *
 * The bottom bar's labels are Geist in ordinary capitalisation at 11/12 and
 * 600 (700 for the tab you're on), and wrap rather than truncate; your
 * initials are the display face upright at 800 (the slant is the studio's
 * name and Go's alone).
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet or the element, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const css = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "");
const tsx = (rel: string) =>
  read(rel)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

type Rule = { selectors: string[]; body: string };

/** Every innermost rule of a stylesheet (a rule inside @media included). */
function rulesOf(rel: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css(rel).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The text before a rule may end an @import; the selector is what follows it.
    const prelude = m[1].split(";").pop()!.trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)/.test(prelude)) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")), body: m[2] });
  }
  return out;
}

/** Every value of `prop` in every rule that names `selector` exactly. */
function valuesOf(rel: string, selector: string, prop: string): string[] {
  const out: string[] = [];
  for (const r of rulesOf(rel).filter((x) => x.selectors.includes(selector))) {
    for (const m of r.body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))) out.push(m[1].trim());
  }
  return out;
}

const classes = (s: string) => s.split(/\s+/).filter(Boolean);
const zOf = (classList: string) => {
  const m = classList.match(/(?:^|\s)z-(?:\[)?(\d+)\]?(?:\s|$)/);
  return m ? Number(m[1]) : NaN;
};

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

const header = tsx("components/AppHeader.tsx").match(/<header className="([^"]+)"/)?.[1] ?? "";
const navs = [...tsx("components/AppBottomBar.tsx").matchAll(/<nav\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1]);

describe("the frame casts onto the page", () => {
  it("the header: --frame-down, with no border of its own, stacked over the rooms", () => {
    expect(header).not.toBe("");
    const c = classes(header);
    expect(c).toContain("shadow-(--frame-down)");
    expect(c).toContain("relative");
    expect(c).not.toContain("border-b");
    expect(c).not.toContain("border-chrome-line");
    expect(zOf(header)).toBeGreaterThanOrEqual(12);
  });

  it("every bottom bar: --frame-up, never black, stacked over the rooms", () => {
    expect(navs).toHaveLength(3);
    for (const n of navs) {
      const c = classes(n);
      expect(c, n).toContain("shadow-(--frame-up)");
      expect(c, n).toContain("relative");
      expect(n, n).not.toMatch(/rgba\(0,\s*0,\s*0/);
      expect(zOf(n), n).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("the bottom bar's labels (AJ's answer 1A)", () => {
  const nav = tsx("components/NavButton.tsx");
  const label = nav.match(/<span className=\{`(w-full text-center[^`]*)`\}>\s*\{label\}/)?.[1] ?? "";

  it("are Geist 12/600 in ordinary capitalisation, 700 for the tab you're on, 11 on a phone", () => {
    expect(label).not.toBe("");
    expect(label).toMatch(/(?:^|\s)text-\[11px\](?:\s|$)/);
    expect(label).toMatch(/(?:^|\s)sm:text-\[12px\](?:\s|$)/);
    expect(label).toMatch(/\? "font-bold" : "font-semibold"/);
    for (const gone of ["uppercase", "font-black", "tracking-tighter", "truncate"]) {
      expect(classes(label.replace(/\$\{[^}]*\}/g, "")), gone).not.toContain(gone);
    }
    // Nothing under 11px: the phone's labels were 9.
    expect(label).not.toMatch(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/);
  });

  it("wrap rather than truncate", () => {
    expect(label).toMatch(/\[overflow-wrap:anywhere\]/);
  });

  it("the button transitions its colour and its scale only, never `all`", () => {
    const button = nav.match(/<button[\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? "";
    expect(button).toMatch(/transition-\[color,transform\]/);
    expect(button).not.toMatch(/transition-all|transition-shadow/);
  });
});

describe("your initials on the frame are the display face upright (AJ's answer 1A)", () => {
  const avatars = [
    {
      where: "AppHeader's own button",
      list: tsx("components/AppHeader.tsx").match(/className="([^"]*bg-chrome-here text-chrome[^"]*)"/)?.[1] ?? "",
    },
    {
      where: "AppContent's menu trigger, the one drawn",
      list: tsx("AppContent.tsx").match(/<DropdownMenuTrigger aria-label="Your menu" className="([^"]+)"/)?.[1] ?? "",
    },
  ];

  it.each(avatars)("$where: font-display at 800, not slanted, at least 40px", ({ list }) => {
    const c = classes(list);
    expect(c).toContain("font-display");
    expect(c).toContain("font-extrabold");
    expect(c).not.toContain("italic");
    expect(c).toContain("w-10");
    expect(c).toContain("h-10");
    expect(list).not.toMatch(/transition-all|transition-shadow/);
  });

  it("the studio's name keeps its slant: it is the brand moment", () => {
    const name = tsx("components/AppHeader.tsx").match(/"(font-display italic[^"]*)"/)?.[1] ?? "";
    expect(classes(name)).toEqual(expect.arrayContaining(["font-display", "italic", "font-extrabold", "uppercase"]));
  });
});

/* ------------------------------------------------------------------ */
/* The shelves                                                         */
/* ------------------------------------------------------------------ */

/**
 * Each room's bar over scrolling content: its stylesheet, its selector, the
 * family whose --X-shelf it casts, its z-index, and its bottom border (null:
 * it sets none of its own here).
 */
const SHELVES: { file: string; selector: string; family: string; z: number; border: string | null }[] = [
  // The Hub's top as a whole: the command bar and the day-in-words line.
  { file: "features/hub-schedule/day-header.css", selector: ".hd-top", family: "eq", z: 10, border: null },
  // The Hub's names row: the soft edge kept under it, the hard 3:1 line gone.
  { file: "features/hub-schedule/hub-grid.css", selector: ".hs-head", family: "eq", z: 8, border: "1px solid var(--eq-edge)" },
  { file: "features/my-studio/my-studio.css", selector: ".msh", family: "st", z: 10, border: "1px solid transparent" },
  // Relay's sub-bar, joined under the header, casts in its place.
  { file: "features/my-studio/my-studio.css", selector: ".ms > .msh-sub", family: "st", z: 9, border: null },
  { file: "features/wiki/wiki.css", selector: ".wk__mast", family: "wk", z: 11, border: "1px solid transparent" },
  { file: "features/wiki/wiki.css", selector: ".wk__bar", family: "wk", z: 10, border: "1px solid transparent" },
  { file: "features/admin/shell/ops.css", selector: ".ops-tabs", family: "adm", z: 10, border: "1px solid transparent" },
];

describe("a room's bar over scrolling content is a shelf", () => {
  it.each(SHELVES)("$selector casts --$family-shelf at z $z", ({ file, selector, family, z }) => {
    expect(valuesOf(file, selector, "box-shadow"), `${file} ${selector}`).toEqual([`var(--${family}-shelf)`]);
    expect(valuesOf(file, selector, "z-index"), `${file} ${selector}`).toEqual([String(z)]);
    expect(valuesOf(file, selector, "position").every((p) => p === "relative" || p === "sticky")).toBe(true);
    expect(valuesOf(file, selector, "position").length, `${selector} is positioned, so its z-index holds`).toBeGreaterThan(0);
  });

  it.each(SHELVES)("$selector ends in the shelf, not a hard rule", ({ file, selector, border }) => {
    const bottoms = valuesOf(file, selector, "border-bottom");
    if (border === null) expect(bottoms).toEqual([]);
    else expect(bottoms).toEqual([border]);
    for (const b of [...bottoms, ...valuesOf(file, selector, "border-bottom-color")]) {
      expect(b, selector).not.toMatch(/border-strong/);
    }
  });

  it.each(SHELVES)("$selector never animates its shadow", ({ file, selector }) => {
    for (const t of valuesOf(file, selector, "transition")) expect(t, selector).not.toMatch(/\ball\b|box-shadow/);
  });

  it("the Hub's top hands its last hairline to the shelf, and keeps the one inside it", () => {
    expect(valuesOf("features/hub-schedule/day-header.css", ".hd-top > :last-child", "border-bottom-color")).toEqual(["transparent"]);
    expect(valuesOf("features/hub-schedule/day-header.css", ".hd", "border-bottom")).toEqual(["1px solid var(--eq-border)"]);
  });

  it("My Studio's header and Relay's sub-bar are one band: no shadow between them", () => {
    const join = ".msh:has(+ .msh-sub:not(:empty))";
    expect(valuesOf("features/my-studio/my-studio.css", join, "box-shadow")).toEqual(["none"]);
    expect(valuesOf("features/my-studio/my-studio.css", join, "border-bottom-color")).toEqual(["var(--st-border)"]);
    expect(valuesOf("features/my-studio/my-studio.css", ".ms > .msh-sub", "border-bottom-color")).toEqual(["transparent"]);
  });
});

describe("the stacking order, so each cast falls on what is under it", () => {
  const z = (selector: string) => SHELVES.find((s) => s.selector === selector)!.z;
  const highestShelf = Math.max(...SHELVES.map((s) => s.z));

  it("the frame is over every shelf", () => {
    expect(zOf(header)).toBeGreaterThan(highestShelf);
    for (const n of navs) expect(zOf(n)).toBeGreaterThan(highestShelf);
  });

  it("the Hub's top is over its names row", () => {
    expect(z(".hd-top")).toBeGreaterThan(z(".hs-head"));
  });

  it("the Hub's names row is over every card, the now line and the axis inside the grid", () => {
    const inside = rulesOf("features/hub-schedule/hub-grid.css")
      .filter((r) => !r.selectors.includes(".hs-head"))
      .flatMap((r) => [...r.body.matchAll(/(?:^|;)\s*z-index\s*:\s*(\d+)/g)].map((m) => Number(m[1])));
    expect(inside.length).toBeGreaterThan(0);
    for (const n of inside) expect(n).toBeLessThan(z(".hs-head"));
  });

  it("a masthead is over its own sub-row, so the later row never paints over its cast", () => {
    expect(z(".wk__mast")).toBeGreaterThan(z(".wk__bar"));
    expect(z(".msh")).toBeGreaterThan(z(".ms > .msh-sub"));
  });
});

/* ------------------------------------------------------------------ */
/* The Active Session keeps its own order                              */
/* ------------------------------------------------------------------ */

describe("the Active Session's grid keeps its documented stacking order", () => {
  // journey-grid.css's "Layers": giving the head and the corner one number
  // would tie them, and the scrolling date heads would paint over the pinned
  // corner and the latest and live heads. Its sticky separators are held by
  // session-colour-rules.test.ts.
  const GRID = "features/journey-grid/journey-grid.css";
  it.each([
    [".jg-corner", "5"],
    [".jg-stat-head", "5"],
    [".jg-head--live", "5"],
    ['.jg[data-live="true"] .jg-head.is-latest', "4"],
    [".jg-head", "3"],
  ])("%s stays at z %s", (selector, value) => {
    expect(valuesOf(GRID, selector, "z-index")).toEqual([value]);
  });

  it("the pinned corner keeps its sideways cast first", () => {
    const [shadow] = valuesOf(GRID, ".jg-corner", "box-shadow");
    expect(shadow.startsWith("8px 0 12px -8px var(--jg-sticky-shadow)")).toBe(true);
  });
});
