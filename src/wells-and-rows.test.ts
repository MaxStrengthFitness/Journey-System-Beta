import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WELLS AND ROWS ACROSS THE ROOMS (type and depth, phase 9, Oct 4 2026;
 * AJ's answers "1a 2a 3b", Refined Lift).
 *
 * AJ, Oct 4 2026: "there are sharp white boxs all over the place". Many of
 * them were a box inside a box: a dashed empty box inside a panel, a
 * bordered tile or figure inside a panel, a list whose every line was its
 * own bordered box. This phase gives each one of two shapes.
 *
 *   1. A WELL holds information: the family's well tone (--X-surface-2,
 *      darker than the card in both modes, never bg-muted or --bg-dark-3,
 *      which go LIGHTER in dark), the well's inner shadow (--X-elev-0), no
 *      edge, radius 12. Empty places, the tiles and figures inside a panel,
 *      the Archive's figures, Programming's counts, Openings' times, the run
 *      sheet's slots and the Archive's clinical strip.
 *   2. A control keeps the 3:1 edge it has (AJ's 2A): "Write a note…" opens
 *      into a field, so it sinks like one, inside its firm edge, the way the
 *      Hub's command bar does. A well never takes an edge away from a control.
 *   3. Dashes stay only where they mean something: "nothing here" on an
 *      Openings time nobody is in, and the codex's dashed edge for a record
 *      that is not the client's own ("Clients built like them").
 *   4. A coloured rule on a rounded well is a straight band painted as a
 *      background layer, never a border wider than 1px (which tapers into a
 *      crescent at the corners): the briefing's carried regions.
 *   5. The words on a well read at 4.5:1 or more, light and dark, measured
 *      on the well's own fill; the labels this phase touched are 12px or
 *      more, in their own capitalisation.
 *   6. A ROW instead of a box: Settings' reports and doors, and the notes to
 *      review on Operations → Today, are lines inside their panel divided by
 *      the soft hairline (--X-divider), with no box of their own.
 *   7. A hover that changes a fill or an edge is a pointer's only
 *      (@media (hover: hover)), so an iPad's kept hover never sticks.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet, not the test.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
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

const cache = new Map<string, Rule[]>();
const rulesOf = (file: string) => {
  if (!cache.has(file)) cache.set(file, parse(css(file)));
  return cache.get(file)!;
};

/** Every value `prop` takes in `body`, in order. */
function declared(body: string, prop: string): string[] {
  return [...body.matchAll(new RegExp(`(?:^|;|\\{)\\s*${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim().replace(/\s+/g, " "));
}

/** The rules (outside any @media) that name one of `selectors` exactly, in source order, merged: the later wins. */
function merged(file: string, ...selectors: string[]): Record<string, string> {
  const found = rulesOf(file).filter((r) => r.at.length === 0 && r.selectors.some((s) => selectors.includes(s)));
  expect(found.length, `${file}: no rule for ${selectors.join(" / ")}`).toBeGreaterThan(0);
  const out: Record<string, string> = {};
  for (const r of found.sort((a, b) => a.pos - b.pos)) {
    for (const m of r.body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The palettes, light and dark, to measure the words on each well     */
/* ------------------------------------------------------------------ */

/** The block of custom properties that opens at `at`, comments stripped. */
function tokenBlock(text: string, at: string): Record<string, string> {
  const i = text.indexOf(at);
  if (i < 0) throw new Error(`token block not found: ${at.trim()}`);
  const open = text.indexOf("{", i);
  let depth = 0;
  let j = open;
  for (; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of text.slice(open + 1, j).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** [file, its light block, its dark block (null: an alias set that follows another family's mode)]. */
const PALETTES: [string, string, string | null][] = [
  ["index.css", "\n:root {", "\n.dark {"],
  ["features/equipment/equipment.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/admin/admin.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/studio-tasks/studio-tasks.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/wiki/wiki.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/calendar/calendar.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/subjective-report/subjective-report.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/briefing/briefing.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/journey-grid/journey-grid.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/client-profile/profile-nav.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/client-codex/codex.tokens.css", ".cx-kit {", null],
  ["features/clinical-review/clinical-review.css", "\n.cr {", null],
];
const LIGHT: Record<string, string> = {};
const DARK_OWN: Record<string, string> = {};
for (const [file, l, d] of PALETTES) {
  const text = css(file);
  Object.assign(LIGHT, tokenBlock(text, l));
  if (d) Object.assign(DARK_OWN, tokenBlock(text, d));
}
const MODES = { light: LIGHT, dark: { ...LIGHT, ...DARK_OWN } } as const;

/** A var() chain followed to its colour (or its fallback). */
function resolve(map: Record<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  const m = value.trim().match(/^var\((--[\w-]+)(?:,\s*([\s\S]+))?\)$/);
  if (!m) return value.trim();
  if (map[m[1]] !== undefined) return resolve(map, map[m[1]], depth + 1);
  if (m[2]) return resolve(map, m[2], depth + 1);
  throw new Error(`${m[1]} is not declared`);
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  expect(hex, "a solid #rrggbb").toMatch(/^#[0-9a-f]{6}$/i);
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ------------------------------------------------------------------ */
/* 1. The wells                                                        */
/* ------------------------------------------------------------------ */

type Well = {
  file: string;
  sel: string;
  /** The palette prefix: --{p}-surface-2, --{p}-elev-0. */
  p: string;
  /** The well's fill, when the family names its well tone otherwise. */
  fill?: string;
  /** The card it sinks into, when that is not --{p}-surface. */
  card?: string;
  /** The edge is kept transparent (a state may colour it), not removed. */
  transparentEdge?: boolean;
  /** The words drawn on the well: [selector, the rules it builds on]. */
  words: string[][];
};

const WELLS: Well[] = [
  // Empty places (map #3: "Dashed empty boxes inside panels").
  { file: "features/client-notes/notes-page.css", sel: ".nx-empty", p: "eq", words: [[".nx-empty"], [".nx-empty", ".nx-empty__text"]] },
  { file: "features/relay/kit.css", sel: ".rk-empty", p: "st", words: [[".rk-empty"]] },
  { file: "features/relay/planner.css", sel: ".pl__empty", p: "st", words: [[".pl__empty-body"]] },
  { file: "features/briefing/briefing.css", sel: ".br__empty", p: "br", words: [[".br__empty-text"]] },
  { file: "features/wiki/wiki.css", sel: ".wk__empty", p: "wk", words: [[".wk__empty"]] },
  { file: "features/wiki/wiki.css", sel: ".wk__placeholder", p: "wk", words: [[".wk__placeholder-title"], [".wk__placeholder-body"]] },
  { file: "features/admin/admin.css", sel: ".adm-empty", p: "adm", words: [[".adm-empty"]] },
  { file: "features/subjective-report/subjective-report.css", sel: ".sr-empty", p: "sr", words: [[".sr-empty"]] },
  { file: "features/admin/shell/ops.css", sel: ".ops-toonew", p: "adm", words: [[".ops-toonew__h"]] },
  { file: "features/admin/shell/ops.css", sel: ".ops-trend-wait", p: "adm", words: [[".ops-trend-wait__h"]] },
  // The Deep Dive draws its well in the app's well tone: the grid's surface-2 is a
  // header band that goes LIGHTER than the card in dark.
  { file: "features/clinical-review/clinical-review.css", sel: ".cr-empty", p: "cr", fill: "var(--cr-well)", card: "var(--cr-surface)", words: [[".cr-empty"]] },
  // Inner tiles and figures (map #8, #21).
  { file: "features/client-codex/body/body.css", sel: ".bp-tile", p: "cx", transparentEdge: true, words: [[".bp-tile__name"], [".bp-tile__text"]] },
  { file: "features/briefing/briefing.css", sel: ".br__routine", p: "br", transparentEdge: true, words: [[".br__routine"], [".br__routine", ".br__routine-sub"]] },
  {
    file: "features/client-history/client-history.css",
    sel: ".hist-stat",
    p: "cal",
    words: [[".hist-stat__label"], [".hist-stat__value b"], [".hist-stat__value span"], [".hist-stat__sub"]],
  },
  {
    file: "features/routines/routines.css",
    sel: ".rt-summary",
    p: "eq",
    words: [[".rt-summary__facts"], [".rt-summary__warn"], [".rt-summary__none"], [".rt-summary__count b"]],
  },
  { file: "features/openings/openings.css", sel: ".op-cell", p: "st", transparentEdge: true, words: [[".op-cell"], [".op-cell", ".op-cell--none"], [".op-cell__mark"]] },
  {
    file: "features/hub-opportunities/run-sheet.css",
    sel: ".ho-slot",
    p: "eq",
    words: [[".ho-slot-title"], [".ho-slot-list"], [".ho-slot-empty"], [".ho-slot-note"]],
  },
  {
    file: "features/client-profile/profile-nav.css",
    sel: ".ptab-strip",
    p: "psub",
    fill: "var(--psub-bg)",
    card: "var(--psub-surface)",
    words: [[".ptab-strip__title"], [".ptab-strip__none"]],
  },
];

const fillOf = (w: Well) => w.fill ?? `var(--${w.p}-surface-2)`;
const cardOf = (w: Well) => w.card ?? `var(--${w.p}-surface)`;

describe("a box inside a panel is a well: the well tone, its inner shadow, no edge, radius 12", () => {
  it.each(WELLS.map((w) => [w.sel, w] as const))("%s", (_sel, w) => {
    const own = merged(w.file, w.sel);
    expect(own.background, "the well tone").toBe(fillOf(w));
    expect(own["box-shadow"], "the well's inner shadow").toBe(`var(--${w.p}-elev-0)`);
    expect(own["border-radius"]).toBe("12px");
    expect(own.border, "no edge").toBe(w.transparentEdge ? "1px solid transparent" : "0");
    for (const r of rulesOf(w.file).filter((r) => r.selectors.includes(w.sel))) {
      expect(r.body, `${w.sel} is not dashed`).not.toMatch(/dashed/);
    }
  });

  it("never draws a well in bg-muted or --bg-dark-3, which go lighter in dark", () => {
    for (const w of WELLS) {
      const bodies = rulesOf(w.file).filter((r) => r.selectors.includes(w.sel)).map((r) => r.body).join(";");
      expect(bodies, w.sel).not.toMatch(/--muted\b|--bg-dark-3|bg-muted/);
    }
  });

  const pairs = [...new Map(WELLS.map((w) => [fillOf(w), cardOf(w)] as const)).entries()];
  it.each(pairs)("%s is darker than %s, light and dark (sunk)", (fill, card) => {
    for (const [mode, map] of Object.entries(MODES)) {
      expect(luminance(resolve(map, fill)), `${fill} ${mode}`).toBeLessThan(luminance(resolve(map, card)));
    }
  });

  it("the inner shadow each well reads is declared", () => {
    for (const w of WELLS) {
      const name = `--${w.p}-elev-0`;
      expect(Object.keys(LIGHT).concat(Object.keys(DARK_OWN)), name).toContain(name);
    }
  });
});

describe("the words on a well read at 4.5:1, light and dark", () => {
  const cases = WELLS.flatMap((w) => w.words.map((chain) => [`${w.sel}: ${chain.at(-1)}`, w, chain] as const));
  it.each(cases)("%s", (_name, w, chain) => {
    const words = merged(w.file, ...chain).color;
    expect(words, `${chain.at(-1)} says its colour`).toBeDefined();
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, words), resolve(map, fillOf(w))), mode).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. A control keeps its 3:1 edge                                     */
/* ------------------------------------------------------------------ */

describe("a control that sinks keeps its 3:1 edge", () => {
  it("'Write a note…' opens into a field, so it sinks like one inside its solid 3:1 edge", () => {
    const bar = merged("features/client-notes/notes-page.css", ".nx-compose-bar");
    expect(bar.border).toBe("1px solid var(--eq-border-strong)");
    expect(bar.background).toBe("var(--eq-surface-2)");
    expect(bar["box-shadow"]).toBe("var(--eq-elev-0)");
    expect(bar["border-radius"]).toBe("12px");
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, "var(--eq-border-strong)"), resolve(map, "var(--eq-surface-2)")), `${mode}: the edge`).toBeGreaterThanOrEqual(3);
      expect(ratio(resolve(map, bar.color), resolve(map, "var(--eq-surface-2)")), `${mode}: the words`).toBeGreaterThanOrEqual(4.5);
      const meta = merged("features/client-notes/notes-page.css", ".nx-compose-bar__meta").color;
      expect(ratio(resolve(map, meta), resolve(map, "var(--eq-surface-2)")), `${mode}: the meta`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the clinical strip's Edit is raised on the 3:1 edge, with a press, in the button voice", () => {
    const file = "features/client-profile/profile-nav.css";
    const edit = merged(file, ".ptab-strip__edit");
    expect(edit.border).toBe("1px solid var(--psub-border-strong)");
    expect(edit.background).toBe("var(--psub-raised)");
    expect(edit["box-shadow"]).toBe("var(--psub-elev-1), inset 0 1px 0 var(--psub-highlight)");
    expect(edit["border-radius"]).toBe("12px");
    expect(edit["font-size"]).toBe("14px");
    expect(edit["font-weight"]).toBe("700");
    expect(edit["text-transform"]).toBe("none");
    expect(parseFloat(edit["min-height"])).toBeGreaterThanOrEqual(40);
    const press = merged(file, ".ptab-strip__edit:active");
    expect(press.transform).toBe("translateY(1px)");
    expect(press["box-shadow"]).toBe("var(--psub-press)");
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, edit["border-color"] ?? "var(--psub-border-strong)"), resolve(map, edit.background)), `${mode}: the edge`).toBeGreaterThanOrEqual(3);
      expect(ratio(resolve(map, edit.color), resolve(map, edit.background)), `${mode}: the words`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a chip in the clinical strip stands on the card's fill, out of the well, in the chip voice", () => {
    const chip = merged("features/client-profile/profile-nav.css", ".ptab-strip__chip");
    expect(chip.background).toBe("var(--psub-surface)");
    expect(chip["font-size"]).toBe("12px");
    expect(chip["font-weight"]).toBe("700");
  });

  it("the line opened inside Trends' well stands on the card's fill, not the well tone it would vanish into", () => {
    expect(merged("features/admin/shell/ops.css", ".ops-trend-wait__open").background).toBe("var(--adm-surface)");
  });
});

/* ------------------------------------------------------------------ */
/* 3. Dashes stay only where they mean something                       */
/* ------------------------------------------------------------------ */

describe("dashes stay only where they mean something", () => {
  it("an Openings time nobody is in: a dashed hairline, no fill, not sunk (an empty place, still a button)", () => {
    const blank = merged("features/openings/openings.css", ".op-cell--blank");
    expect(blank["border-style"]).toBe("dashed");
    expect(blank["border-color"]).toBe("var(--st-border)");
    expect(blank.background).toBe("transparent");
    expect(blank["box-shadow"]).toBe("none");
  });

  it("'Clients built like them' keeps the codex's dashed edge for a record that is not the client's own, and does not sink", () => {
    const wide = merged("features/client-codex/body/body.css", ".bp-tile[data-wide]");
    expect(wide["border-style"]).toBe("dashed");
    expect(wide["border-color"]).toBe("var(--cx-line)");
    expect(wide.background).toBe("var(--cx-surface)");
    expect(wide["box-shadow"]).toBe("none");
  });

  it("the open Openings time keeps its blue ring, on top of the well's inner shadow", () => {
    expect(merged("features/openings/openings.css", '.op-cell[aria-current="true"]')["box-shadow"]).toBe("0 0 0 2px var(--st-live), var(--st-elev-0)");
    expect(merged("features/openings/openings.css", ".op-cell:focus-visible").outline).toBe("2px solid var(--st-live)");
  });
});

/* ------------------------------------------------------------------ */
/* 4. A coloured rule on a rounded well is a straight band              */
/* ------------------------------------------------------------------ */

describe("the briefing's carried regions: a well with a straight band, never a crescent", () => {
  const file = "features/briefing/briefing.css";
  it("draws its urgency as the first background layer, 4px wide, with no border", () => {
    const row = merged(file, ".br__carried-row");
    expect(row.border).toBe("0");
    expect(row["border-left"]).toBeUndefined();
    expect(row["border-left-width"]).toBeUndefined();
    expect(row["border-radius"]).toBe("12px");
    expect(row.background).toBe(
      "linear-gradient(var(--br-carried-band), var(--br-carried-band)) left / 4px 100% no-repeat, var(--br-carried-fill)",
    );
    expect(row["box-shadow"]).toBe("var(--br-elev-0)");
    expect(row["--br-carried-fill"]).toBe("var(--br-surface-2)");
    for (const r of rulesOf(file).filter((r) => r.selectors.some((s) => s.startsWith(".br__carried-row")))) {
      expect(r.body, r.selectors.join(", ")).not.toMatch(/border-left/);
    }
  });

  it.each([
    ["warn", "var(--br-warn)", "var(--br-warn-fill)"],
    ["alert", "var(--br-critical)", "var(--br-critical-fill)"],
    ["ok", "var(--br-ok)", null],
    ["live", "var(--br-live)", null],
  ])("the %s region's band and fill, with its words at 4.5:1", (tone, band, fill) => {
    const t = merged(file, ".br__carried-row", `.br__carried-row[data-tone="${tone}"]`);
    expect(t["--br-carried-band"]).toBe(band);
    if (fill) expect(t["--br-carried-fill"]).toBe(fill);
    const ground = t["--br-carried-fill"];
    for (const [mode, map] of Object.entries(MODES)) {
      for (const words of [t.color, merged(file, ".br__carried-from").color, merged(file, `.br__carried-row[data-tone="${tone}"] strong`, ".br__carried-row strong").color]) {
        expect(ratio(resolve(map, words), resolve(map, ground)), `${tone} ${mode}: ${words}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. The labels this phase touched                                    */
/* ------------------------------------------------------------------ */

describe("the words inside the new wells leave the small capitals", () => {
  it.each([
    ["features/client-history/client-history.css", ".hist-stat__label", 12],
    ["features/client-history/client-history.css", ".hist-stat__value span", 12],
    ["features/client-history/client-history.css", ".hist-stat__sub", 12],
    ["features/client-profile/profile-nav.css", ".ptab-strip__title", 14],
    ["features/client-profile/profile-nav.css", ".ptab-strip__none", 14],
    ["features/client-profile/profile-nav.css", ".ptab-strip__chip", 12],
    ["features/briefing/briefing.css", ".br__routine-sub", 12],
    ["features/briefing/briefing.css", ".br__carried-row", 14],
    ["features/briefing/briefing.css", ".br__carried-from", 12],
    ["features/relay/kit.css", ".rk-empty", 14],
    ["features/subjective-report/subjective-report.css", ".sr-empty", 14],
    ["features/clinical-review/clinical-review.css", ".cr-empty", 14],
    ["features/settings/settings.css", ".stg-label", 14],
  ] as const)("%s %s is %ipx, in its own capitalisation", (file, sel, size) => {
    const own = merged(file, sel);
    expect(own["font-size"]).toBe(`${size}px`);
    expect(own["text-transform"] ?? "none").toBe("none");
  });

  it("the Archive's figure is a headline figure: the display face, upright, 22/800, even-width digits", () => {
    const b = merged("features/client-history/client-history.css", ".hist-stat__value b");
    expect(b["font-family"]).toBe("var(--font-display)");
    expect(b["font-size"]).toBe("22px");
    expect(b["font-weight"]).toBe("800");
    expect(b["font-style"]).toBeUndefined();
    expect(b["font-variant-numeric"]).toBe("tabular-nums");
  });

  it("the line under an Archive figure wraps; it is never cut off", () => {
    const sub = merged("features/client-history/client-history.css", ".hist-stat__sub");
    expect(sub["text-overflow"]).toBeUndefined();
    expect(sub["white-space"]).toBeUndefined();
  });

  it("Settings' list label speaks in the label voice: 14/700 in ink-2", () => {
    const label = merged("features/settings/settings.css", ".stg-label");
    expect(label["font-weight"]).toBe("700");
    expect(label.color).toBe("var(--eq-ink-2)");
  });
});

/* ------------------------------------------------------------------ */
/* 6. Rows instead of boxes                                            */
/* ------------------------------------------------------------------ */

describe("a line in a list is a row inside its panel, not a box", () => {
  const settings = "features/settings/settings.css";
  it.each([".stg-report", ".stg-link"])("Settings' %s has no box of its own", (sel) => {
    const row = merged(settings, sel);
    expect(row.border).toBe("0");
    expect(row["border-radius"]).toBe("0");
    expect(row.background).toBe("transparent");
    expect(row["box-shadow"]).toBeUndefined();
  });

  it("Settings' rows are divided by the soft hairline, and their lists lose their gaps", () => {
    expect(merged(settings, ".stg-report + .stg-report")["border-top"]).toBe("1px solid var(--eq-divider)");
    expect(merged(settings, ".stg-link + .stg-link")["border-top"]).toBe("1px solid var(--eq-divider)");
    expect(merged(settings, ".stg-text + .stg-link")["border-top"]).toBe("1px solid var(--eq-divider)");
    expect(merged(settings, ".stg-reports").gap).toBe("0");
    expect(merged(settings, ".stg-links").gap).toBe("0");
  });

  it("a door keeps its 52px", () => {
    expect(merged(settings, ".stg-link")["min-height"]).toBe("52px");
  });

  it("the notes to review sit in their panel, divided by --adm-divider, with no outer box", () => {
    const file = "features/admin/overview/overview.css";
    for (const r of rulesOf(file).filter((r) => r.selectors.includes(".adm-ov__rows--bordered"))) {
      expect(declared(r.body, "border"), "no outer border").toEqual([]);
    }
    expect(merged(file, ".adm-ov__row + .adm-ov__row")["border-top"]).toBe("1px solid var(--adm-divider)");
  });
});

/* ------------------------------------------------------------------ */
/* 7. Hover is a pointer's only                                        */
/* ------------------------------------------------------------------ */

describe("a hover that changes a fill or an edge is a pointer's only", () => {
  it.each([
    ["features/settings/settings.css", ".stg-link"],
    ["features/admin/overview/overview.css", ".adm-ov__row-btn"],
    ["features/briefing/briefing.css", ".br__routine"],
    ["features/client-profile/profile-nav.css", ".ptab-strip__edit"],
    ["features/client-notes/notes-page.css", ".nx-compose-bar"],
  ])("%s %s", (file, sel) => {
    const hovers = rulesOf(file).filter((r) => r.selectors.some((s) => s.startsWith(sel) && s.includes(":hover")));
    expect(hovers.length, `${sel} has a hover`).toBeGreaterThan(0);
    for (const r of hovers) expect(r.at.some((a) => /hover:\s*hover/.test(a)), r.selectors.join(", ")).toBe(true);
  });
});

describe("nothing here animates a shadow", () => {
  const FILES = [...new Set([...WELLS.map((w) => w.file), "features/settings/settings.css", "features/admin/overview/overview.css"])];
  it.each(FILES)("%s lists no box-shadow or all in a transition", (file) => {
    const animated = rulesOf(file)
      .filter((r) => declared(r.body, "transition").some((t) => /box-shadow|(^|[\s,])all\b/.test(t)))
      .map((r) => r.selectors.join(", "));
    expect(animated).toEqual([]);
  });
});

describe("the parser itself", () => {
  it("reads a rule inside @media with its context, and merges in source order", () => {
    const rules = parse(".a { color: red; } @media (hover: hover) { .a:hover { background: blue; } } .a { color: green; }");
    expect(rules).toHaveLength(3);
    expect(rules[1]).toMatchObject({ selectors: [".a:hover"], at: ["@media (hover: hover)"] });
    expect(declared(rules[0].body, "color")).toEqual(["red"]);
  });
});
