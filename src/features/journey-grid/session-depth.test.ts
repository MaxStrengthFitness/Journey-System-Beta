import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE ACTIVE SESSION, WITH WEIGHT AND DEPTH, IN THE APP'S VOICE (type and
 * depth, phase 13, Oct 4 2026; AJ's answers "1a 2a 3b").
 *
 * AJ's 3B: "the Active Session gets the FULL type voice this round: no label
 * under 11px ... AND its capital-letter labels move to ordinary
 * capitalisation where they fit". Its depth comes too, without touching its
 * stacking order, its pinned control edges or its separators.
 *
 *   1. Nothing in the session's stylesheet is set under 11px and nothing in
 *      capitals. The 55 declarations under 11px (7.5 to 10.5px: 53 font
 *      sizes and the reps token twice) rose to 11 or 12, and
 *      the 30 capital-letter rules went to their own capitalisation, each
 *      measured against the grid's fixed rows first (the numbers are in the
 *      rules' comments); every one fitted. A <small> in the session bar's
 *      count is 12px, never preflight's 80%.
 *   2. The labels that were the display face's capitals are Geist now; the
 *      names, the days and the column heads stand upright in the display
 *      face (type-voice.test.ts holds those). The clock is Geist with
 *      tabular figures: the display face has none, so a running clock in it
 *      changed width every second.
 *   3. The controls are RAISED on the 3:1 edge AJ said yes to: --jg-raised,
 *      the lift and a top light, and a press (down a pixel into --jg-press),
 *      on the steppers, the quality buttons, the REPS | SEC switch and the
 *      session bar's Notes and Pulse. No set? stays dashed and unfilled and
 *      only presses. session-colour-rules.test.ts still names every edge.
 *   4. Finish takes Go's depth (its glow, a top light, the press), never
 *      Go's slanted capitals, and keeps its restated hover fill. Next and
 *      Done drop the solid blue's tinted shadow.
 *   5. The grid lifts as one panel; the Now Bar docks, upward as a bar and
 *      leftward as the landscape column, positioned with no z-index of its
 *      own. The grid's layers and separators are frame-and-shelves.test.ts's
 *      and session-colour-rules.test.ts's, and unchanged.
 *   6. No raw black shadow, no animated shadow, and no hover that changes a
 *      fill outside @media (hover: hover) (Finish restates its own).
 *   7. 40px: the clock's pause and the Today column's add reach it through
 *      an ::after; the order sheet's Do next and the menu's note are 40.
 *   8. Words read at 4.5:1 on the raised fill and on every ground the moved
 *      words sit on, in both modes; the edge at 3:1 on the raised fill.
 *   9. The session's dialogs and sheets speak the same voice: no capitals,
 *      nothing under 12px and no heavier-than-800 type in their class
 *      lists, the buttons' own 14/700, and no decorative edge on an outline
 *      button or the note field.
 *
 * Read from source, comments removed. If one of these fails, the fix is the
 * stylesheet or the class list, not the test.
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

const GRID = "features/journey-grid/journey-grid.css";
const PHONE = "features/phone/phone.css";
const RULES = parse(css(GRID));

/** A rule body's declarations, the later winning. */
function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

/** The rules (outside any at-rule) that name `selector` exactly, merged in source order. */
function merged(selector: string, rules: Rule[] = RULES): Record<string, string> {
  const found = rules.filter((r) => r.at.length === 0 && r.selectors.includes(selector));
  expect(found.length, `no rule for ${selector}`).toBeGreaterThan(0);
  return Object.assign({}, ...found.sort((a, b) => a.pos - b.pos).map((r) => decls(r.body)));
}

/* ---------------------------------------------------------------------------
   The palette, both modes, for the contrast checks
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

const TOKENS = read("features/journey-grid/journey-grid.tokens.css");
const LIGHT = block(TOKENS, "\n:root {");
const JG = { light: LIGHT, dark: { ...LIGHT, ...block(TOKENS, '\n.dark,\n[data-theme="dark"] {') } };
const FALLBACK = block(TOKENS, ':root:not(.light):not([data-theme="light"]):not(.dark):not([data-theme="dark"]) {');
type Theme = keyof typeof JG;
const BOTH: Theme[] = ["light", "dark"];

function colour(theme: Theme, token: string): string {
  let value = JG[theme][token];
  for (let i = 0; i < 5 && value; i++) {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (!alias) break;
    value = JG[theme][alias[1]];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} is not a flat colour in ${theme}: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ------------------------------------------------------------------ */
/* 1. Nothing under 11px, nothing in capitals                          */
/* ------------------------------------------------------------------ */

describe("the session's type: nothing under 11px and nothing in capitals (AJ's 3B)", () => {
  it("reads every rule (the parser is reading something)", () => {
    expect(RULES.length).toBeGreaterThan(400);
    expect(RULES.filter((r) => /font-size/.test(r.body)).length).toBeGreaterThan(100);
  });

  it("sets no font-size under 11px, in any rule, at any width or density", () => {
    const small: string[] = [];
    for (const r of RULES) {
      for (const m of r.body.matchAll(/(?:^|[;\s{])font-size\s*:\s*([\d.]+)px/g)) {
        if (Number(m[1]) < 11) small.push(`${r.selectors.join(", ")}: ${m[1]}px`);
      }
    }
    expect(small).toEqual([]);
  });

  it("sets the reps line (--jg-r-size) at 11px or more, dense rows included", () => {
    const sizes = RULES.flatMap((r) => [...r.body.matchAll(/--jg-r-size\s*:\s*([\d.]+)px/g)].map((m) => Number(m[1])));
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(11);
  });

  it("sets nothing in capitals", () => {
    const caps = RULES.filter((r) => /text-transform\s*:\s*uppercase/.test(r.body)).map((r) => r.selectors.join(", "));
    expect(caps).toEqual([]);
  });

  it("gives a skip's one-word reason its first capital, and nothing else a transform but none", () => {
    for (const sel of [".jg-cell__skip-why", ".jg-today__skip-why"]) {
      expect(merged(sel)["text-transform"], sel).toBe("capitalize");
    }
    const others = RULES.filter((r) => {
      const t = decls(r.body)["text-transform"];
      return t !== undefined && t !== "none" && !r.selectors.some((s) => /skip-why$/.test(s));
    });
    expect(others.map((r) => r.selectors.join(", "))).toEqual([]);
  });

  it("draws the progress's <small> at 12px, never preflight's 80% of its line", () => {
    expect(merged(".jg-sbar__progress-text small")["font-size"]).toBe("12px");
    expect(merged(".jg-sbar__progress-text")["font-size"]).toBe("12px");
  });

  it("a session label on a phone is as written too", () => {
    const label = merged(".ph-count__label", parse(css(PHONE)));
    expect(label["text-transform"]).toBeUndefined();
    expect(parseFloat(label["font-size"])).toBeGreaterThanOrEqual(11);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Labels are Geist; a clock has tabular figures                    */
/* ------------------------------------------------------------------ */

describe("the labels that left the display face's capitals", () => {
  it.each([
    [".jg-head__tag", "11px", "700", "Today / Latest over a day"],
    [".jg-head--older .jg-head__btn", "12px", "700", "Older, down the rail"],
    [".jg-older__label", "12px", "600", "the rail's status"],
    [".jg-group__label", "14px", "700", "Today's routine, over the list"],
  ])("%s is Geist at %s/%s (%s)", (sel, size, weight) => {
    const body = merged(sel);
    expect(body["font-family"]).toBe("var(--jg-font)");
    expect(body["font-size"]).toBe(size);
    expect(body["font-weight"]).toBe(weight);
    expect(body["letter-spacing"]).toBe("0");
  });

  it.each([
    [".jg-nb__kicker", "12px", "Load · Set · Form · No set?"],
    [".jg-nb__chip b", "11px", "a setting's name over its value"],
    [".jg-nb__ubtn", "12px", "Reps over Sec"],
    [".jg-clock__label", "12px", "Elapsed / Paused"],
    [".jg-order__status", "12px", "Done / Now / Skipped"],
    [".jg-order__kicker", "14px", "Add from the floor"],
  ])("%s speaks at %s with no tracking (%s)", (sel, size) => {
    const body = merged(sel);
    expect(body["font-size"]).toBe(size);
    expect(body["letter-spacing"]).toBe("0");
    expect(body["font-family"], "inherits Geist").toBeUndefined();
  });

  it("the clock counts in Geist's tabular figures, never the display face", () => {
    const time = merged(".jg-clock__time");
    expect(time["font-family"]).toBe("var(--jg-font)");
    expect(time["font-variant-numeric"]).toBe("tabular-nums");
  });

  it("the session bar's buttons speak the button voice, 14/700, and Finish says it as written", () => {
    const shared = merged(".jg-sbar__btn");
    expect(shared["font-size"]).toBe("14px");
    expect(shared["font-weight"]).toBe("700");
    expect(shared["letter-spacing"]).toBe("0");
    expect(merged(".jg-sbar__finish")["text-transform"]).toBeUndefined();
  });

  it("asks the display face for 700 or 800 only (the name on the bar was 900)", () => {
    expect(merged(".jg-sbar__name")["font-weight"]).toBe("800");
    for (const r of RULES) {
      const w = decls(r.body)["font-weight"];
      if (w) expect(["900", "950", "1000"], r.selectors.join(", ")).not.toContain(w);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. Raised on the 3:1 edge, and a press                              */
/* ------------------------------------------------------------------ */

const RAISED = [
  [".jg-nb__sbtn", "the Now Bar's - and +"],
  [".jg-nb__qbtn", "the quality buttons"],
  [".jg-nb__unit", "the REPS | SEC switch"],
  [".jg-sbar__btn", "the session bar's Notes and Pulse"],
] as const;

describe("the session's controls are raised on the edge AJ said yes to (2A)", () => {
  it.each(RAISED)("%s (%s): a lighter fill, the lift and a top light, on its 3:1 edge", (sel) => {
    const body = merged(sel);
    expect(body.background).toBe("var(--jg-raised)");
    expect(body["box-shadow"]).toBe("var(--jg-elev-1), inset 0 1px 0 var(--jg-highlight)");
    expect(body.border).toBe("1px solid var(--jg-control-edge)");
  });

  it.each(RAISED)("%s (%s): presses down a pixel into --jg-press", (sel) => {
    const active = merged(`${sel}:active`);
    expect(active.transform).toBe("translateY(1px)");
    expect(active["box-shadow"]).toBe("var(--jg-press)");
  });

  it("keeps today's :active fills where there were any", () => {
    expect(merged(".jg-nb__sbtn:active").background).toBe("var(--jg-surface-3)");
    expect(merged(".jg-nb__obtn:active").background).toBe("var(--jg-surface-3)");
  });

  it("No set? stays dashed and unfilled, never lifts, and only presses", () => {
    const body = merged(".jg-nb__obtn");
    expect(body.border).toBe("1px dashed var(--jg-control-edge)");
    expect(body.background).toBe("transparent");
    expect(body["box-shadow"]).toBeUndefined();
    const active = merged(".jg-nb__obtn:active");
    expect(active.transform).toBe("translateY(1px)");
    expect(active["box-shadow"]).toBe("var(--jg-press)");
  });

  it("the setting tiles are not buttons, so they never lift", () => {
    expect(merged(".jg-nb__chip")["box-shadow"]).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 4. Finish, Next and Done                                            */
/* ------------------------------------------------------------------ */

describe("the loud buttons", () => {
  it("Finish takes Go's depth and press, and keeps restating its fill on :hover", () => {
    expect(merged(".jg-sbar__finish")["box-shadow"]).toBe("var(--jg-glow-go), var(--jg-go-light)");
    const active = merged(".jg-sbar__finish:active");
    expect(active.transform).toBe("translateY(1px)");
    expect(active["box-shadow"]).toBe("var(--jg-press)");
    expect(merged(".jg-sbar__finish:hover").background).toBe("var(--jg-go)");
  });

  it("Next lifts as a tint on its own edge, and as the solid blue in portrait and in the landscape column", () => {
    expect(merged(".jg-nb__next")["box-shadow"]).toBe("var(--jg-elev-1)");
    const portrait = RULES.filter((r) => r.selectors.includes(".jg-nb--bar .jg-nb__next") && r.at.some((a) => /max-width: 899px/.test(a)));
    expect(portrait.some((r) => decls(r.body)["box-shadow"] === "var(--jg-glow-live), var(--jg-solid-light)")).toBe(true);
    expect(merged(".jg-nb--side .jg-nb__next")["box-shadow"]).toBe("var(--jg-glow-live), var(--jg-solid-light)");
  });

  it("Next's quiet offer lies flat, it presses after every rule that lifts it, and lies flat when disabled", () => {
    expect(merged(".jg-nb--bar .jg-nb__next.jg-nb__next--add")["box-shadow"]).toBe("none");
    const active = RULES.find((r) => r.selectors.includes(".jg-nb .jg-nb__next:active"))!;
    expect(decls(active.body)["box-shadow"]).toBe("var(--jg-press)");
    const lifts = RULES.filter((r) => r.selectors.some((s) => /\.jg-nb__next(?![\w-])/.test(s)) && /box-shadow/.test(r.body) && r !== active);
    for (const r of lifts.filter((r) => !/:disabled/.test(r.selectors.join()))) expect(r.pos, r.selectors.join(", ")).toBeLessThan(active.pos);
    expect(merged(".jg-nb .jg-nb__next:disabled")["box-shadow"]).toBe("none");
  });

  it("the order sheet's Done is the solid blue, with its press", () => {
    expect(merged(".jg-order__done")["box-shadow"]).toBe("var(--jg-glow-live), var(--jg-solid-light)");
    expect(merged(".jg-order__done:active").transform).toBe("translateY(1px)");
  });
});

/* ------------------------------------------------------------------ */
/* 5. The grid lifts; the Now Bar docks                                */
/* ------------------------------------------------------------------ */

describe("the grid lifts as one panel and the Now Bar docks", () => {
  it("the grid carries the panel's lift, with its border and clip as they were", () => {
    const grid = merged(".jg");
    expect(grid["box-shadow"]).toBe("var(--jg-elev-2)");
    expect(grid.border).toBe("1px solid var(--jg-border)");
    expect(grid.overflow).toBe("hidden");
  });

  it("the Now Bar is positioned so its cast falls on the grid, with no z-index of its own", () => {
    const bar = merged(".jg-nb");
    expect(bar.position).toBe("relative");
    expect(bar["box-shadow"]).toBe("var(--jg-dock)");
    expect(bar["z-index"]).toBeUndefined();
    expect(bar["border-top"], "the orange line, straight, no radius").toBe("2px solid var(--jg-hero)");
    expect(bar["border-radius"]).toBeUndefined();
  });

  it("as the landscape column it casts left, onto the grid", () => {
    expect(merged(".jg-stage--side .jg-nb--side")["box-shadow"]).toBe("var(--jg-dock-side)");
  });

  it.each(BOTH)("the leftward dock is the upward one turned, in the same navy (%s)", (theme) => {
    const up = JG[theme]["--jg-dock"];
    const side = JG[theme]["--jg-dock-side"];
    expect(side).toBe(up.replace(/^0 -6px/, "-6px 0"));
  });

  it("the system-preference copy carries the dark values of the new keys", () => {
    for (const key of ["--jg-dock-side", "--jg-glow-live", "--jg-solid-light"]) {
      expect(FALLBACK[key], key).toBe(JG.dark[key]);
    }
  });

  it("no new z-index: the rules that set one are the ones the grid documents", () => {
    const withZ = RULES.filter((r) => decls(r.body)["z-index"] !== undefined).flatMap((r) => r.selectors).sort();
    expect(withZ).toEqual(
      [
        ".jg-view__loading",
        ".jg-corner",
        ".jg-stat-head",
        ".jg-head--older",
        ".jg-cell.jg-cell--older",
        ".jg-group",
        ".jg-machine",
        ".jg-stat",
        ".jg-head",
        ".jg-head--live",
        '.jg[data-live="true"] .jg-head.is-latest',
        '.jg[data-live="true"] .jg-cell.is-latest',
        ".jg-today",
        ".jg-keypop",
        ".jg-order__row.is-dragging",
        ".jg-look .jg-cell:not(.jg-cell--none):not(.jg-cell--nr):not(.jg-cell--skipped)::before",
        ".jg-look .jg-cell__w",
        ".jg-look .jg-cell__r",
        ".jg-look .jg-cell__mark",
        ".jg-look .jg-cell--none::before",
        ".jg-look .jg-cell--nr .jg-cell__empty",
        ".jg-look .jg-cell__skip",
        ".jg-look .jg-bubble-wrap",
        ".jg-look .jg-today::before",
        ".jg-look .jg-today__w",
        ".jg-look .jg-today__r",
        ".jg-look .jg-today__q",
        ".jg-look .jg-today .jg-today__bubble",
        ".jg-older-loading",
        ".jg-keypop--corner",
        ".jg-look .jg-cell--nr::before",
      ].sort(),
    );
  });
});

/* ------------------------------------------------------------------ */
/* 6. Navy, still, and a pointer's hover                               */
/* ------------------------------------------------------------------ */

describe("no black, no animated shadow, no kept hover", () => {
  // The grid's machine menu (the 22px ⋯ popover) went with the machine menu round (Oct 2026):
  // a machine's name opens features/machine-menu, held by its own look.test.ts.
  it("no shadow in raw black: the loading mark and the order sheet are popovers in the navy", () => {
    const black = RULES.filter((r) => /box-shadow\s*:[^;]*(rgba?\(\s*0\s*,\s*0\s*,\s*0|rgb\(0 0 0)/.test(r.body));
    expect(black.map((r) => r.selectors.join(", "))).toEqual([]);
    for (const sel of [".jg-view__loading .lm", ".jg-keypop"]) expect(merged(sel)["box-shadow"], sel).toBe("var(--jg-elev-4)");
    const order = RULES.filter((r) => r.selectors.includes(".jg-order") && /box-shadow/.test(r.body));
    expect(order.map((r) => decls(r.body)["box-shadow"])).toEqual(["var(--jg-elev-4)"]);
  });

  it("no transition names box-shadow or all; a cell fades its opacity only", () => {
    for (const r of RULES) {
      const t = decls(r.body).transition;
      if (t) expect(t, r.selectors.join(", ")).not.toMatch(/box-shadow|\ball\b/);
    }
    expect(merged(".jg-cell").transition).toBe("opacity 140ms ease");
  });

  it("a hover that changes a fill is a pointer's only, apart from Finish restating its own", () => {
    const loose = RULES.filter(
      (r) => r.selectors.some((s) => s.includes(":hover")) && /background/.test(r.body) && !r.at.some((a) => /hover:\s*hover/.test(a)),
    ).flatMap((r) => r.selectors);
    expect(loose).toEqual([".jg-sbar__finish:hover"]);
  });
});

/* ------------------------------------------------------------------ */
/* 7. 40px                                                             */
/* ------------------------------------------------------------------ */

describe("nothing tappable under 40px", () => {
  it("the Today column's add is drawn at 28px and reaches 40 to its sides, but never past its own row (a tap there added a machine mid-session)", () => {
    const body = merged(".jg-today__add");
    expect(body.position).toBe("relative");
    expect(body.height).toBe("28px");
    const after = merged(".jg-today__add::after");
    expect(after.position).toBe("absolute");
    expect(after.inset, "never a bare negative inset").toBeUndefined();
    expect(after.left).toBe("-6px");
    expect(after.right).toBe("-6px");
    for (const side of ["top", "bottom"]) {
      expect(after[side], side).toBe("max(-6px, calc((28px - var(--jg-row-h)) / 2))");
    }
    // The area, row by row: 40px in a 44px row, the row itself when shorter.
    const tall = (row: number) => 28 - 2 * Math.max(-6, (28 - row) / 2);
    expect(tall(44)).toBe(40);
    expect(tall(34)).toBe(34);
    expect(tall(26)).toBeLessThanOrEqual(26 + 2);
  });

  it.each([
    [".jg-clock__btn", 32, "-4px", "the clock's pause, inside its 40px pill"],
  ])("%s is drawn at %ipx and reaches 40 through an ::after (%s)", (sel, drawn, inset) => {
    const body = merged(sel);
    expect(body.position).toBe("relative");
    expect(body.height).toBe(`${drawn}px`);
    const after = merged(`${sel}::after`);
    expect(after.inset).toBe(inset);
    expect(after.position).toBe("absolute");
    expect(drawn - 2 * parseFloat(inset)).toBe(40);
  });

  it.each([".jg-order__next", ".jg-seg__btn"])("%s is 40px tall", (sel) => {
    expect(parseFloat(merged(sel).height)).toBeGreaterThanOrEqual(40);
  });

  it("no button rule is set under 40px tall, but for the clock's pause, whose ::after reaches 40", () => {
    const short: string[] = [];
    for (const r of RULES) {
      if (!r.selectors.some((s) => /btn\b/.test(s) && !/::?(after|before)/.test(s))) continue;
      for (const prop of ["height", "min-height"]) {
        const v = decls(r.body)[prop];
        if (v && /^\d+(\.\d+)?px$/.test(v) && parseFloat(v) < 40) short.push(`${r.selectors.join(", ")} ${prop} ${v}`);
      }
    }
    expect(short).toEqual([".jg-clock__btn height 32px"]);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Contrast                                                         */
/* ------------------------------------------------------------------ */

describe.each(BOTH)("the words and the edge on what they sit on, %s", (theme) => {
  it.each([
    ["--jg-ink", "--jg-raised", "a raised control's words"],
    ["--jg-ink-2", "--jg-raised", "a stepper's - and +"],
    ["--jg-ink-muted", "--jg-raised", "Reps / Sec, unpicked"],
    ["--jg-ink-muted", "--jg-surface-2", "the Now Bar's kickers, the Last line, a setting's key"],
    ["--jg-ink-2", "--jg-surface-2", "the number on the Now Bar's Last line"],
    ["--jg-ink-2", "--jg-bg", "Today's routine, and Add from the floor"],
    ["--jg-ink-muted", "--jg-bg", "a section's count"],
    ["--jg-ink-muted", "--jg-surface", "a skip's reason, the Key's words"],
    ["--jg-ink-muted", "--jg-live-fill", "a skip's reason in the Latest column"],
    ["--jg-live-on", "--jg-live", "Next, solid"],
    ["--jg-live-text", "--jg-live-fill-strong", "Next, as a tint"],
  ])("%s on %s (%s) reads at 4.5:1", (fg, bg) => {
    expect(contrast(colour(theme, fg), colour(theme, bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("the controls' edge on the raised fill clears 3:1", () => {
    expect(contrast(colour(theme, "--jg-control-edge"), colour(theme, "--jg-raised"))).toBeGreaterThanOrEqual(3);
  });

  it("the raised fill is lighter than the bar it sits on, and never white", () => {
    expect(luminance(colour(theme, "--jg-raised"))).toBeGreaterThan(luminance(colour(theme, "--jg-surface-2")));
    expect(colour(theme, "--jg-raised").toLowerCase()).not.toBe("#ffffff");
  });

  it.each([".jg-nb__qbtn", ".jg-nb__expect", ".jg-stat__older", ".jg-group__count", ".jg-corner__count", ".jg-legend__gloss", ".jg-cell__skip-why", ".jg-today__skip-why"])(
    "%s reads in the muted ink, never the faint (3.2:1)",
    (sel) => {
      expect(merged(sel).color).toBe("var(--jg-ink-muted)");
    },
  );
});

/* ------------------------------------------------------------------ */
/* 9. The session's dialogs and sheets                                 */
/* ------------------------------------------------------------------ */

const SHEETS = [
  "components/WorkoutTrackerView.tsx",
  "features/journey-grid/SessionFlagsSheet.tsx",
  "components/journal/SessionJournalSidebar.tsx",
] as const;

/** Every string literal in a file that reads as a class list (two tokens or more). */
function classLists(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
    const s = (m[1] ?? m[2] ?? "").trim();
    if (s.split(/\s+/).length >= 2) out.push(s);
  }
  return out;
}
const tokensOf = (list: string) => list.split(/\s+/).filter(Boolean);

describe("the session's dialogs and sheets speak the same voice", () => {
  it.each(SHEETS)("%s: no capitals, no text under 12px, nothing heavier than 800, no widest tracking", (file) => {
    const found: string[] = [];
    for (const list of classLists(file)) {
      for (const t of tokensOf(list)) {
        if (/(?:^|:)uppercase$/.test(t) || /(?:^|:)font-black$/.test(t) || /(?:^|:)tracking-widest$/.test(t) || /(?:^|:)text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]$/.test(t)) {
          found.push(`${t} in "${list}"`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("the closing dialogs' outline buttons and the note field keep their own 3:1 edge", () => {
    const tracker = read("components/WorkoutTrackerView.tsx");
    const start = tracker.indexOf("<Dialog open={showEndConfirmation}");
    const end = tracker.indexOf("Zones 2 + 3", start);
    expect(start).toBeGreaterThan(0);
    const dialogs = tracker.slice(start, end);
    const outlines = [...dialogs.matchAll(/<Button\s+variant="outline"[^>]*?className="([^"]*)"/g)].map((m) => m[1]);
    expect(outlines.length).toBe(3);
    for (const list of outlines) expect(list).not.toMatch(/border-slate-|border-2\b|hover:bg-slate-/);
    const note = /<Textarea\s+id="next-trainer-note"[\s\S]*?className="([^"]*)"/.exec(dialogs)?.[1];
    expect(note).toBeDefined();
    expect(note).not.toMatch(/border-slate-|border-2\b|bg-card|text-slate-/);
    const contents = [...dialogs.matchAll(/<DialogContent className="([^"]*)"/g)].map((m) => m[1]);
    expect(contents.length).toBe(2);
    for (const list of contents) expect(list, "the shared dialog's lift, in both modes").not.toMatch(/shadow-/);
  });

  it("the closing dialogs say their words as written, and the orange Finish takes Go's depth", () => {
    const tracker = read("components/WorkoutTrackerView.tsx");
    for (const words of ["End session?", "Keep training", "Finish session", "Resume session", "Scrap session", "Abort session (no record)"]) {
      expect(tracker, words).toContain(words);
    }
    expect(tracker).toContain('className="h-14 rounded-2xl shadow-(--go-lift) bg-cta text-cta-foreground hover:bg-cta"');
    expect(tracker).not.toContain("NEW CLIENT INTRODUCTORY SESSION");
  });

  it("a sheet's head is the panel title, 17/700, and its line the meta voice", () => {
    for (const file of SHEETS) {
      const heads = classLists(file).filter((l) => /^flex items-center gap-2 text-\[17px\]/.test(l));
      expect(heads.length, file).toBeGreaterThan(0);
      for (const h of heads) expect(tokensOf(h), file).toContain("font-bold");
    }
  });
});
