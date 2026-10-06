import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * BUTTONS LIFT, PRESS IN AND KEEP THEIR EDGE; GO HAS ONE VOICE (type and
 * depth, phase 8, Oct 4 2026; AJ's answers "1a 2a 3b").
 *
 * AJ, Oct 4 2026: "a lot of buttons and backgrounds in the app currently
 * have a sharp cutoff look ... add some dropshadows". His 2A: buttons keep
 * the firm outline he said yes to that morning and gain a lighter face, a
 * small lift and a press. His 1A: the slanted capitals belong to the studio
 * name and to Go alone.
 *
 *   1. RAISED, in every room: a fill a hair lighter than the card
 *      (--X-raised), the contact lift and a white top light
 *      (--X-elev-1, inset 0 1px 0 --X-highlight), radius 12, ON the control's
 *      3:1 edge, which stays, and a press on :active (down a pixel into
 *      --X-press). Under the gym floor's glare the edge is what keeps a
 *      button a button.
 *   2. That edge really is 3:1 on the raised fill, and the words on it read
 *      at 4.5:1, in both modes, in every palette a raised button draws from.
 *   3. Raised means you can press it: a disabled button lies flat, and a
 *      quiet or ghost button (words with no box) never lifts.
 *   4. Solid blue drops a blue-tinted shadow with a top light
 *      (--X-glow-live, --X-solid-light): no gradient, no dark foot.
 *   5. Go is Start session (and the Deep Dive's Generate): the display face's
 *      slanted capitals at 800 and 17, 0.04em, a short orange glow and a top
 *      light (--X-glow-go, --X-go-light), and the press. Every other orange
 *      button takes Go's depth in the 14/700 button voice, never its words.
 *   6. Nothing tappable under 40px: the buttons this phase found at 32 to 38.
 *   7. A hover that changes a raised button's fill is a pointer's only
 *      (@media (hover: hover)), so an iPad's kept hover never flattens it,
 *      and a filled button restates its fill under the pointer.
 *   8. Nothing animates a shadow: no transition lists box-shadow or all.
 *   9. What stays quiet stays quiet: a dashed "add" button keeps its dashes
 *      and no box; a filter chip keeps its pill and takes the depth only; a
 *      segmented switch sinks inside its 3:1 edge with the picked segment
 *      raised; an Admins row is a row, not a button box.
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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The rules that press `selector` in: `selector:active` or `selector:not(:disabled):active`. */
function pressRules(file: string, selector: string): Rule[] {
  const re = new RegExp(`^${esc(selector)}(?::not\\(:disabled\\))?:active$`);
  return rulesOf(file).filter((r) => r.selectors.some((s) => re.test(s)));
}

/* ------------------------------------------------------------------ */
/* 1. Raised, on the 3:1 edge, with a press                            */
/* ------------------------------------------------------------------ */

type Raised = {
  file: string;
  sel: string;
  /** The palette prefix: --{p}-raised, --{p}-elev-1, --{p}-highlight, --{p}-press. */
  p: string;
  /** The rule the variant builds on (its radius and press may live there). */
  base?: string;
  /** The 3:1 edge the border is drawn in, when it is not --{p}-border-strong. */
  edge?: string;
  /** A filter chip keeps its pill. */
  pill?: boolean;
  /** A family with its own control radius, and why. */
  radius?: string;
};

const RAISED: Raised[] = [
  { file: "features/relay/planner.css", sel: ".pl__btn", p: "st" },
  { file: "features/admin/admin.css", sel: ".adm-btn--quiet", p: "adm", base: ".adm-btn" },
  { file: "features/hub-schedule/peek.css", sel: ".hp-btn", p: "eq" },
  { file: "features/settings/settings.css", sel: ".stg-kind", p: "eq" },
  { file: "features/settings/settings.css", sel: ".stg-signout", p: "eq" },
  { file: "features/learning/learning.css", sel: ".lh__more", p: "wk" },
  { file: "features/catalog/catalog.css", sel: ".cat__btn", p: "cat" },
  { file: "features/catalog/catalog.css", sel: ".mcat-lens__btn", p: "wk" },
  { file: "features/relay/board/board.css", sel: ".rbd-btn", p: "st" },
  { file: "features/client-notes/notes-page.css", sel: ".nt-btn", p: "eq" },
  { file: "features/client-notes/notes-page.css", sel: ".nx-pick", p: "eq" },
  { file: "features/client-notes/notes-page.css", sel: ".nx-ask__q", p: "eq" },
  { file: "features/client-notes/critical-line.css", sel: ".nx-critline__btn", p: "eq" },
  // The machine menu (Oct 2026) replaced the machine sheet, its buttons
  // (.eq-btn) and its weight steppers (.eq-step__btn): its ± and its everyday
  // buttons, raised out of the card and the tiles' wells (type and depth,
  // brought onto the menu), with the readout's arrows, Try again, Show more,
  // Resolved and a word dial's options. elevation.test.ts's section 13 scan
  // skips .mm-retry and .mm-opt (no "btn" in their names), so this list is
  // their only guard.
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-step", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-quiet", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-close", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-pg-btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-list-btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-drawer", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-pos__btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-ro__btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-retry", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-more-btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-grp-btn", p: "eq" },
  { file: "features/machine-menu/machine-menu.css", sel: ".mm-opt", p: "eq" },
  { file: "features/routines/routines.css", sel: ".rt-btn", p: "eq" },
  { file: "features/client-history/client-history.css", sel: ".hist-btn", p: "cal" },
  { file: "features/openings/openings.css", sel: ".op-btn", p: "st" },
  { file: "features/hub-opportunities/run-sheet.css", sel: ".ho-trainer-btn", p: "eq" },
  { file: "features/hub-opportunities/run-sheet.css", sel: ".ho-filter", p: "eq", pill: true },
  { file: "features/hub-opportunities/run-sheet.css", sel: ".ho-action", p: "eq", edge: "var(--eq-live)" },
  { file: "features/relay/notes/journal-today.css", sel: ".jtd-btn", p: "st" },
  { file: "features/comments/comments.css", sel: ".cm__btn", p: "wk" },
  { file: "features/ford/ford.css", sel: ".ford-btn", p: "ford" },
  { file: "features/machine-db/machine-db.css", sel: ".mdb-btn", p: "wk" },
  { file: "features/standing-week/standing-week.css", sel: ".stw-btn--quiet", p: "eq", base: ".stw-btn" },
  { file: "features/studio-tasks/studio-tasks.css", sel: ".st__btn", p: "st" },
  { file: "features/subjective-report/subjective-report.css", sel: ".sr-btn", p: "sr" },
  { file: "features/trainer-profile/trainer-profile.css", sel: ".tp-btn", p: "tp" },
  { file: "features/wiki/wiki.css", sel: ".wk__btn", p: "wk" },
  // The report's own --pr-border-strong is a card's hairline (1.4:1), so its
  // outline button takes the app's 3:1 control edge. The report's buttons
  // keep their own 16px corners, one family on the navy band and in its cards.
  { file: "features/progress-report/progress-report.css", sel: ".pr-btn--outline", p: "pr", base: ".pr-btn", edge: "var(--eq-border-strong)", radius: "var(--pr-radius-sm)" },
  { file: "features/machine-fit/ui/machine-fit.css", sel: ".fit-btn--quiet", p: "eq", base: ".fit-btn", edge: "var(--eq-border-strong)" },
  { file: "features/routine-builder/routine-builder.css", sel: ".rb-bar__btn", p: "rb" },
  { file: "features/hub-schedule/day-header.css", sel: ".hd-btn", p: "eq" },
  { file: "features/hub-schedule/hub-grid.css", sel: ".hs-notice-btn", p: "eq" },
  // The sweep (Oct 5 2026): flat boxes on the hairline that the phases had
  // not reached, now raised on the 3:1 edge with a press.
  { file: "features/client-history/client-history.css", sel: ".hsd-toggle", p: "cal" },
  { file: "features/relay/notes/notes.css", sel: ".jn-icon-btn", p: "st" },
  { file: "features/briefing/briefing.css", sel: ".br__close", p: "br", pill: true },
  { file: "features/subjective-report/subjective-report.css", sel: ".pq__back", p: "sr" },
  { file: "features/subjective-report/subjective-report.css", sel: ".pcm__nav", p: "sr" },
  { file: "features/studio-tasks/studio-tasks.css", sel: ".stq__new", p: "st" },
  { file: "features/studio-tasks/studio-tasks.css", sel: ".stq__act", p: "st" },
];

describe("a secondary button is raised on its 3:1 edge, and presses in", () => {
  it.each(RAISED.map((r) => [r.sel, r] as const))("%s", (_sel, r) => {
    const own = merged(r.file, r.sel);
    const all = r.base ? merged(r.file, r.base, r.sel) : own;
    expect(own.background, "the raised fill, never white").toBe(`var(--${r.p}-raised)`);
    expect(own["box-shadow"], "the contact lift and the top light").toBe(`var(--${r.p}-elev-1), inset 0 1px 0 var(--${r.p}-highlight)`);
    const edge = r.edge ?? `var(--${r.p}-border-strong)`;
    expect(`${all.border ?? ""} ${all["border-color"] ?? ""}`, "the 3:1 edge stays").toContain(edge);
    expect(all.border ?? "", "a solid edge").not.toMatch(/dashed|dotted/);
    expect(all["border-radius"], "the control radius").toBe(r.radius ?? (r.pill ? "999px" : "12px"));
    const press = [...pressRules(r.file, r.sel), ...(r.base ? pressRules(r.file, r.base) : [])];
    expect(press.length, `${r.sel} presses in on :active`).toBeGreaterThan(0);
    for (const p of press) {
      expect(declared(p.body, "transform")).toEqual(["translateY(1px)"]);
      expect(declared(p.body, "box-shadow")).toEqual([`var(--${r.p}-press)`]);
    }
    // Nothing on a raised button animates its shadow.
    for (const t of declared(Object.entries(all).map(([k, v]) => `${k}: ${v}`).join(";"), "transition")) {
      expect(t).not.toMatch(/box-shadow|\ball\b/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. The edge is really 3:1, the words 4.5:1, in both modes           */
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

const PALETTES: [string, string, string][] = [
  ["index.css", "\n:root {", "\n.dark {"],
  ["features/equipment/equipment.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/admin/admin.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/studio-tasks/studio-tasks.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/wiki/wiki.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/catalog/catalog.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/calendar/calendar.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/trainer-profile/trainer-profile.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/routine-builder/routine-builder.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/ford/ford.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/subjective-report/subjective-report.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/progress-report/progress-report.tokens.css", "\n:root {", '[data-theme="dark"] {'],
  ["features/briefing/briefing.tokens.css", "\n:root {", '[data-theme="dark"] {'],
];
const LIGHT: Record<string, string> = {};
const DARK_OWN: Record<string, string> = {};
for (const [file, l, d] of PALETTES) {
  const text = css(file);
  Object.assign(LIGHT, tokenBlock(text, l));
  Object.assign(DARK_OWN, tokenBlock(text, d));
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

describe("the raised button's edge and words, measured in both modes", () => {
  const pairs = new Map<string, Raised>();
  for (const r of RAISED) pairs.set(`${r.p} ${r.edge ?? ""}`, r);
  it.each([...pairs.values()].map((r) => [`--${r.p}-raised under ${r.edge ?? `var(--${r.p}-border-strong)`}`, r] as const))(
    "%s",
    (_name, r) => {
      for (const [mode, map] of Object.entries(MODES)) {
        const fill = resolve(map, `var(--${r.p}-raised)`);
        const edge = resolve(map, r.edge ?? `var(--${r.p}-border-strong)`);
        expect(ratio(edge, fill), `${mode}: the edge on the raised fill`).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(RAISED.map((r) => [r.sel, r] as const))("%s: its words read at 4.5:1 on the raised fill", (_sel, r) => {
    const own = merged(r.file, ...(r.base ? [r.base, r.sel] : [r.sel]));
    const words = own.color;
    expect(words, "the button says its colour").toBeDefined();
    for (const [mode, map] of Object.entries(MODES)) {
      expect(ratio(resolve(map, words), resolve(map, `var(--${r.p}-raised)`)), mode).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is lighter than the card it sits on, in both modes (lighter is higher)", () => {
    for (const p of ["eq", "adm", "st", "wk", "cat", "cal", "tp", "rb", "ford", "sr"]) {
      for (const [mode, map] of Object.entries(MODES)) {
        const raised = resolve(map, `var(--${p}-raised)`);
        expect(raised.toLowerCase(), `${p} ${mode}: never white`).not.toBe("#ffffff");
        expect(luminance(raised), `${p} ${mode}`).toBeGreaterThan(luminance(resolve(map, `var(--${p}-surface)`)));
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. Raised means you can press it                                    */
/* ------------------------------------------------------------------ */

const FLAT_WHEN_DISABLED: [string, string][] = [
  ["features/relay/planner.css", ".pl__btn"],
  ["features/admin/admin.css", ".adm-btn"],
  ["features/catalog/catalog.css", ".cat__btn"],
  ["features/relay/board/board.css", ".rbd-btn"],
  ["features/client-notes/notes-page.css", ".nt-btn"],
  ["features/machine-menu/machine-menu.css", ".mm-step"],
  ["features/machine-menu/machine-menu.css", ".mm-btn"],
  ["features/machine-menu/machine-menu.css", ".mm-pg-btn"],
  ["features/machine-menu/machine-menu.css", ".mm-ro__btn"],
  ["features/machine-menu/machine-menu.css", ".mm-quiet"],
  ["features/machine-menu/machine-menu.css", ".mm-save"],
  ["features/machine-menu/machine-menu.css", ".mm-add"],
  ["features/routines/routines.css", ".rt-btn"],
  ["features/client-history/client-history.css", ".hist-btn"],
  ["features/openings/openings.css", ".op-btn"],
  ["features/relay/notes/journal-today.css", ".jtd-btn"],
  ["features/relay/notes/notes.css", ".pn__view"],
  ["features/comments/comments.css", ".cm__btn"],
  ["features/ford/ford.css", ".ford-btn"],
  ["features/machine-db/machine-db.css", ".mdb-btn"],
  ["features/standing-week/standing-week.css", ".stw-btn"],
  ["features/studio-tasks/studio-tasks.css", ".st__btn"],
  ["features/subjective-report/subjective-report.css", ".sr-btn"],
  ["features/trainer-profile/trainer-profile.css", ".tp-btn"],
  ["features/wiki/wiki.css", ".wk__btn"],
  ["features/progress-report/progress-report.css", ".pr-btn--outline"],
  ["features/machine-fit/ui/machine-fit.css", ".fit-btn"],
  ["features/routine-builder/routine-builder.css", ".rb-bar__btn"],
  ["features/clinical-review/clinical-review.css", ".cr-generate"],
];

const QUIET: [string, string][] = [
  ["features/client-notes/notes-page.css", ".nt-btn--quiet"],
  ["features/studio-tasks/studio-tasks.css", ".st__btn--ghost"],
  ["features/subjective-report/subjective-report.css", ".sr-btn--ghost"],
  ["features/trainer-profile/trainer-profile.css", ".tp-btn--ghost"],
  ["features/wiki/wiki.css", ".wk__btn--quiet"],
  ["features/ford/ford.css", ".ford-btn--ghost"],
];

describe("raised means you can press it", () => {
  it.each(FLAT_WHEN_DISABLED)("%s %s lies flat when disabled", (file, sel) => {
    const flat = rulesOf(file).filter((r) => r.selectors.includes(`${sel}:disabled`));
    expect(flat.length).toBeGreaterThan(0);
    // :disabled (two classes' weight) outranks every one-class variant's lift.
    expect(flat.flatMap((r) => declared(r.body, "box-shadow"))).toContain("none");
  });

  it.each(QUIET)("%s %s is words with no box, so it never lifts", (file, sel) => {
    expect(merged(file, sel)["box-shadow"]).toBe("none");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Solid blue                                                       */
/* ------------------------------------------------------------------ */

const SOLID: [string, string, string][] = [
  ["features/relay/planner.css", ".pl__btn--primary", "st"],
  ["features/admin/admin.css", ".adm-btn--primary", "adm"],
  ["features/catalog/catalog.css", ".cat__btn--primary", "cat"],
  ["features/relay/board/board.css", ".rbd-btn--primary", "st"],
  ["features/client-notes/notes-page.css", ".nt-btn--solid", "eq"],
  ["features/relay/notes/journal-today.css", ".jtd-btn--go", "st"],
  ["features/comments/comments.css", ".cm__btn--primary", "wk"],
  ["features/ford/ford.css", ".ford-btn--primary", "ford"],
  ["features/machine-db/machine-db.css", ".mdb-btn--primary", "wk"],
  ["features/standing-week/standing-week.css", ".stw-btn--save", "eq"],
  ["features/studio-tasks/studio-tasks.css", ".st__btn--primary", "st"],
  ["features/trainer-profile/trainer-profile.css", ".tp-btn--primary", "tp"],
  ["features/wiki/wiki.css", ".wk__btn--primary", "wk"],
  ["features/routine-builder/routine-builder.css", ".rb-bar__btn--primary", "rb"],
  ["features/hub-schedule/day-header.css", '.hd-btn[data-primary="true"]', "eq"],
  ["features/machine-menu/machine-menu.css", ".mm-btn--live", "eq"],
  ["features/machine-menu/machine-menu.css", '.mm-add[data-quiet="true"]', "eq"],
];

describe("a solid blue button drops a blue-tinted shadow and keeps a top light", () => {
  it.each(SOLID)("%s %s", (file, sel, p) => {
    const own = merged(file, sel);
    expect(own["box-shadow"]).toBe(`var(--${p}-glow-live), var(--${p}-solid-light)`);
    expect(own.background ?? own["background-color"], "a solid fill: no gradient").not.toMatch(/gradient/);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Go                                                               */
/* ------------------------------------------------------------------ */

/**
 * Start session, wherever it is drawn in CSS. The peek's primary carries
 * Go's depth in every state but Go's words only when it says Start session
 * (data-go): [stylesheet, selector, palette, the rule that holds the words
 * when it is another one]. The Deep Dive's Build the Deep Dive left this
 * list for the next one with AJ's 2A (Oct 5 2026): Go's depth, the button
 * voice.
 */
const GO: [string, string, string, string?][] = [
  ["features/hub-schedule/peek.css", '.hp-btn[data-primary="true"]', "eq", '.hp-btn[data-go="true"]'],
  ["features/hub-opportunities/run-sheet.css", '.ho-action[data-primary="true"]', "eq"],
  ["features/client-directory/client-directory.css", ".cd-start", "eq"],
  ["features/briefing/briefing.css", ".br__cta", "br"],
];

/** Every other orange button: Go's depth in the button voice. */
const GO_DEPTH: [string, string, string, string][] = [
  ["features/admin/admin.css", ".adm-btn--hero", ".adm-btn", "adm"],
  // The machine menu's Save and Add note (the sheet's .eq-btn--hero went with it).
  ["features/machine-menu/machine-menu.css", ".mm-save", ".mm-save", "eq"],
  ["features/machine-menu/machine-menu.css", ".mm-add", ".mm-add", "eq"],
  ["features/machine-fit/ui/machine-fit.css", ".fit-btn--hero", ".fit-btn", "eq"],
  ["features/routines/routines.css", ".rt-btn--hero", ".rt-btn", "eq"],
  // AJ's 2A (Oct 5 2026): upright, 14/700, with Go's glow, top light and press.
  ["features/clinical-review/clinical-review.css", ".cr-generate", ".cr-generate", "cr"],
];

describe("Go is Start session: one voice and one depth", () => {
  it.each(GO)("%s %s: slanted capitals at 800 and 17, 0.04em, the orange glow and top light, a press", (file, sel, p, words) => {
    const own = merged(file, sel, ...(words ? [words] : []));
    expect(own["font-family"]).toMatch(/^var\(--(?:cr-)?font-display\b/);
    expect(own["font-weight"]).toBe("800");
    expect(own["font-style"]).toBe("italic");
    expect(own["text-transform"]).toBe("uppercase");
    expect(own["letter-spacing"]).toBe("0.04em");
    expect(own["font-size"]).toBe("17px");
    expect(own["box-shadow"]).toBe(`var(--${p}-glow-go), var(--${p}-go-light)`);
    // The press: a transform, never an animated shadow.
    const press = pressRules(file, sel.replace(/\[data-primary="true"\]$/, "")).concat(pressRules(file, sel));
    expect(press.length, `${sel} presses in`).toBeGreaterThan(0);
    for (const r of press) expect(declared(r.body, "transform")).toEqual(["translateY(1px)"]);
    for (const t of declared(Object.entries(own).map(([k, v]) => `${k}: ${v}`).join(";"), "transition")) {
      expect(t).not.toMatch(/box-shadow|\ball\b/);
    }
  });

  it.each(GO_DEPTH)("%s %s: Go's depth in the 14/700 button voice, never Go's words", (file, sel, base, p) => {
    expect(merged(file, sel)["box-shadow"]).toBe(`var(--${p}-glow-go), var(--${p}-go-light)`);
    const all = merged(file, base, sel);
    expect(all["font-size"]).toBe("14px");
    expect(all["font-weight"]).toBe("700");
    expect(all["text-transform"] ?? "none").toBe("none");
    expect(all["font-style"] ?? "normal").toBe("normal");
    expect(all["font-family"] ?? "inherit").not.toMatch(/display/);
    expect(pressRules(file, base).length + pressRules(file, sel).length, `${sel} presses in`).toBeGreaterThan(0);
  });

  it("speaks the same words in the profile header's In progress, Go's other state", () => {
    const header = read("features/client-profile/ProfileHeader.tsx");
    const trigger = header.match(/<DropdownMenuTrigger className="([^"]+)"/)?.[1] ?? "";
    const c = trigger.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining(["font-display", "italic", "uppercase", "font-extrabold", "shadow-(--go-lift)", "active:translate-y-px", "active:shadow-(--press)"]));
    expect(c.some((k) => /^shadow-\[/.test(k) || /rgba\(/.test(k)), "no raw amber blur").toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Nothing tappable under 40px                                      */
/* ------------------------------------------------------------------ */

const LIFTED_TO_40: [string, string][] = [
  ["features/calendar/calendar.css", ".cal-seg__btn"],
  ["features/client-history/client-history.css", ".hist .cal-seg__btn"],
  ["features/calendar/calendar.css", ".cal-refresh__btn"],
  ["features/client-history/client-history.css", ".hsd-qbtn"],
  ["features/clinical-review/clinical-review.css", ".cr-bar .cr-seg__btn"],
  ["features/clinical-review/clinical-review.css", ".cr-iconbtn"],
  ["features/subjective-report/subjective-report.css", ".sr-btn--sm"],
  ["features/routines/routines.css", ".rt-btn"],
  // Found by the scan below, beyond the plan's list: the routine builder's
  // row tools (36) and its switch (about 30).
  ["features/routine-builder/routine-builder.css", ".rb-row__btn"],
  ["features/routine-builder/routine-builder.css", ".rb-seg__btn"],
];

/** Every stylesheet this phase touched. */
const FILES = [...new Set([...RAISED, ...GO.map(([file]) => ({ file })), ...LIFTED_TO_40.map(([file]) => ({ file }))].map((r) => r.file))].concat([
  "features/relay/notes/notes.css",
  "features/admins/admins.css",
  // The machine sheet's .eq-btn went with the machine menu; the stylesheet
  // still holds the set-up guide, the watch-outs and the All Machines rail.
  "features/equipment/equipment.css",
]);

/** A length in px (a rem is 16px), or null for anything else (a var(), a percentage). */
function px(v: string): number | null {
  const m = /^([\d.]+)(px|rem)$/.exec(v.trim());
  return m ? parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
}

/** Pieces whose selector says btn but which are not a tap target of their own. */
const NOT_A_TARGET = new Set([
  ".cal-refresh__btn .lm", // the loading mark inside Refresh
]);

describe("nothing tappable under 40px", () => {
  it.each(LIFTED_TO_40)("%s %s is 40px or more", (file, sel) => {
    const sizes = rulesOf(file)
      .filter((r) => r.selectors.includes(sel))
      .flatMap((r) => [...declared(r.body, "height"), ...declared(r.body, "min-height")]);
    expect(sizes.length, `${sel} sets its height`).toBeGreaterThan(0);
    for (const v of sizes) expect(px(v), `${sel}: ${v}`).toBeGreaterThanOrEqual(40);
  });

  it("no button in this phase's stylesheets is set under 40px tall", () => {
    const short: string[] = [];
    for (const file of FILES) {
      for (const r of rulesOf(file)) {
        const sel = r.selectors.find((s) => /btn\b/.test(s) && !NOT_A_TARGET.has(s));
        if (!sel) continue;
        for (const v of [...declared(r.body, "height"), ...declared(r.body, "min-height")]) {
          const n = px(v);
          if (n !== null && n < 40) short.push(`${file} ${sel}: ${v}`);
        }
      }
    }
    expect(short).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Hover: a pointer's only; a filled button keeps its fill          */
/* ------------------------------------------------------------------ */

describe("a hover that changes a fill is a pointer's only", () => {
  const BUTTONS = new Set([...RAISED.map((r) => r.sel), ...RAISED.flatMap((r) => (r.base ? [r.base] : []))]);
  it.each(FILES)("%s", (file) => {
    const sticky: string[] = [];
    for (const r of rulesOf(file)) {
      if (r.at.some((a) => /hover:\s*hover/.test(a))) continue;
      // A rule that names the button AND its hover restates a fill; it is meant to apply on a tap.
      const plain = new Set(r.selectors.filter((s) => !s.includes(":hover")));
      for (const s of r.selectors) {
        const m = /^(.*?)(?::not\(:disabled\))?:hover(?::not\(:disabled\))?$/.exec(s);
        if (!m || !BUTTONS.has(m[1]) || plain.has(m[1])) continue;
        if (declared(r.body, "background").length || declared(r.body, "background-color").length) sticky.push(s);
      }
    }
    expect(sticky).toEqual([]);
  });

  it("the Admins rows' hovers are a pointer's only too", () => {
    for (const sel of [".hq-row__open:hover", ".hq-home__asidebtn:hover"]) {
      const found = rulesOf("features/admins/admins.css").filter((r) => r.selectors.includes(sel));
      expect(found.length, sel).toBeGreaterThan(0);
      for (const r of found) expect(r.at.some((a) => /hover:\s*hover/.test(a)), sel).toBe(true);
    }
  });

  it.each([
    ["features/client-notes/notes-page.css", ".nt-btn--solid", "var(--eq-live)"],
    ["features/machine-menu/machine-menu.css", ".mm-save", "var(--eq-go)"],
    ["features/machine-menu/machine-menu.css", ".mm-add", "var(--eq-go)"],
    ["features/routines/routines.css", ".rt-btn--hero", "var(--eq-go)"],
    ["features/studio-tasks/studio-tasks.css", ".st__btn--primary", "var(--st-live)"],
    ["features/studio-tasks/studio-tasks.css", ".st__btn--done", "var(--st-done)"],
    ["features/trainer-profile/trainer-profile.css", ".tp-btn--primary", "var(--tp-live)"],
    ["features/ford/ford.css", ".ford-btn--primary", "var(--ford-soon)"],
  ])("%s %s keeps its fill under the pointer", (file, sel, fill) => {
    const re = new RegExp(`^${esc(sel)}(?::not\\(:disabled\\))?:hover$`);
    const hover = rulesOf(file).filter((r) => r.selectors.some((s) => re.test(s)));
    expect(hover.length).toBeGreaterThan(0);
    expect(hover.flatMap((r) => declared(r.body, "background"))).toContain(fill);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Nothing animates a shadow                                        */
/* ------------------------------------------------------------------ */

describe("nothing animates a shadow", () => {
  it.each(FILES)("%s lists no box-shadow or all in a transition", (file) => {
    const animated = rulesOf(file)
      .filter((r) => declared(r.body, "transition").some((t) => /box-shadow|(^|[\s,])all\b/.test(t)))
      .map((r) => r.selectors.join(", "));
    expect(animated).toEqual([]);
  });

  it("Learning's category tiles and link cards move and recolour, never animate their lift", () => {
    for (const sel of [".wk__cat", ".wk__linkcard"]) {
      const t = merged("features/wiki/wiki.css", sel).transition;
      expect(t, sel).toMatch(/transform/);
      expect(t, sel).not.toMatch(/box-shadow|\ball\b/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 9. What stays quiet stays quiet                                     */
/* ------------------------------------------------------------------ */

describe("what stays quiet stays quiet", () => {
  it("an empty place to add something keeps its dashes and no box, and only presses", () => {
    const link = merged("features/relay/notes/notes.css", ".ne__link-btn");
    expect(link.border).toMatch(/dashed var\(--st-border-strong\)/);
    expect(link.background).toBe("transparent");
    expect(link["box-shadow"]).toBeUndefined();
    const press = pressRules("features/relay/notes/notes.css", ".ne__link-btn");
    expect(press.flatMap((r) => declared(r.body, "transform"))).toEqual(["translateY(1px)"]);
    expect(merged("features/relay/notes/notes.css", ".pn__view--add")["box-shadow"]).toBe("none");
    // The Notes page's door out is dashed on the card's fill: flat, and it presses.
    const door = merged("features/client-notes/notes-page.css", ".nx-door");
    expect(door["border-style"]).toBe("dashed");
    expect(door["box-shadow"]).toBe("none");
    const doorPress = pressRules("features/client-notes/notes-page.css", ".nx-door");
    expect(doorPress.flatMap((r) => declared(r.body, "transform"))).toEqual(["translateY(1px)"]);
    expect(doorPress.flatMap((r) => declared(r.body, "box-shadow"))).toEqual([]);
  });

  it("a Journal view is a filter chip: its pill, the firm edge (AJ's 3A) and its fill, with the depth", () => {
    const view = merged("features/relay/notes/notes.css", ".pn__view");
    expect(view["border-radius"]).toBe("999px");
    expect(view.border).toBe("1px solid var(--st-border-strong)");
    expect(view.background).toBe("var(--st-surface)");
    expect(view["box-shadow"]).toBe("var(--st-elev-1), inset 0 1px 0 var(--st-highlight)");
    expect(merged("features/relay/notes/notes.css", '.pn__view[aria-pressed="true"]')["box-shadow"]).toBe("var(--st-elev-1)");
  });

  it("the run sheet's switch sinks inside its 3:1 edge, the picked segment raised out of it", () => {
    const file = "features/hub-opportunities/run-sheet.css";
    const seg = merged(file, ".ho-seg");
    expect(seg.border).toBe("1px solid var(--eq-border-strong)");
    expect(seg.background).toBe("var(--eq-surface-2)");
    expect(seg["box-shadow"]).toBe("var(--eq-elev-0)");
    expect(seg.overflow, "a clipped well would cut the picked segment's lift").toBeUndefined();
    const btn = merged(file, ".ho-seg-btn");
    expect(parseFloat(btn["min-height"])).toBeGreaterThanOrEqual(40);
    expect(btn["font-size"]).toBe("14px");
    expect(btn["font-weight"]).toBe("600");
    const on = merged(file, '.ho-seg-btn[aria-pressed="true"]');
    expect(on.background).toBe("var(--eq-raised)");
    expect(on["box-shadow"]).toMatch(/^var\(--eq-elev-1\), inset 0 0 0 1px var\(--eq-edge-control\), inset 0 1px 0 var\(--eq-highlight\)$/);
    expect(on["font-weight"]).toBe("700");
  });

  it("a filter on the run sheet is a chip, so it keeps its pill; the picked one tinted and still lifted", () => {
    expect(merged("features/hub-opportunities/run-sheet.css", '.ho-filter[aria-pressed="true"]')["box-shadow"]).toBe("var(--eq-elev-1)");
  });

  it("in the Hub's command bar a tool has no box of its own to lift or press into", () => {
    const bar = merged("features/hub-schedule/day-header.css", ".hd-bar .hd-btn", ".hd-bar .hd-btn:active");
    expect(bar["box-shadow"]).toBe("none");
    expect(bar.background).toBe("transparent");
  });

  it("an Admins row is a row in its panel, not a button box", () => {
    for (const sel of [".hq-row__open", ".hq-home__asidebtn"]) {
      const row = merged("features/admins/admins.css", sel);
      expect(row.border, sel).toBe("0");
      expect(row.background, sel).toBe("transparent");
      expect(row["box-shadow"], sel).toBeUndefined();
    }
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

/* ---------------------------------------------------------------------------
   The dialogs the review deferred (the follow-up, Oct 5 2026)
   --------------------------------------------------------------------------- */

/**
 * The review's fix left these dialogs' buttons on the old flat outline (a
 * decorative slate or hairline edge round the card's own fill) or a
 * ghost in place of a secondary button. The follow-up raised them through
 * class lists, so this reads the class lists: every list that raises a
 * control (bg-(--raised)) draws it on the 3:1 edge with the lift, and each
 * file presses its raised controls in. A secondary button may also be the
 * shared Button's outline variant, which is the same recipe.
 */
const RAISED_IN_DIALOGS: [file: string, atLeast: number][] = [
  ["features/feedback/FeedbackDrawer.tsx", 1],
  ["components/EditRoutineDrawer.tsx", 2],
  ["features/inbody/InBodyScanDialog.tsx", 1],
  ["features/trainer-profile/KaizenToggle.tsx", 3],
  ["features/renewals/LogConversationDialog.tsx", 3],
  ["features/renewals/RenewalCardDialog.tsx", 1],
];
const OUTLINE_IN_DIALOGS: [file: string, atLeast: number][] = [
  ["components/EditRoutineDrawer.tsx", 1],
  ["features/client-history/SessionDetailDialog.tsx", 1],
  ["features/trainer-profile/EditTrainerModal.tsx", 3],
];

/** Every string literal in a source file with two tokens or more. */
const listsOf = (file: string) =>
  [...read(file).matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter((s) => s.split(/\s+/).length >= 2);
const tokens = (list: string) => list.split(/\s+/);

describe("the dialogs the review deferred: a secondary button is raised on its 3:1 edge", () => {
  it.each(RAISED_IN_DIALOGS)("%s raises its controls on the 3:1 edge with the lift, and presses them in", (file, atLeast) => {
    const raised = listsOf(file).filter((l) => tokens(l).includes("bg-(--raised)"));
    expect(raised.length, "the scan reads them").toBeGreaterThanOrEqual(atLeast);
    for (const l of raised) {
      expect(tokens(l), l).toContain("border-input");
      expect(tokens(l), l).toContain("shadow-(--raised-lift)");
    }
    expect(read(file), "a press").toMatch(/(?:^|[\s"`])(?:[\w-]+:)*active:shadow-\(--press\)|has-\[button:active\]:shadow-\(--press\)/m);
  });

  it.each(OUTLINE_IN_DIALOGS)("%s uses the outline variant for its secondary buttons", (file, atLeast) => {
    expect(read(file).match(/variant="outline"/g)?.length ?? 0).toBeGreaterThanOrEqual(atLeast);
  });

  it("no button among them is the old flat outline: a slate or hairline edge round the card's own fill", () => {
    const found: string[] = [];
    for (const [file] of [...RAISED_IN_DIALOGS, ...OUTLINE_IN_DIALOGS]) {
      for (const l of listsOf(file)) {
        const t = tokens(l);
        if (t.includes("border-slate-300") && t.some((x) => /^min-h-1[01]$/.test(x))) found.push(`${file}: ${l}`);
        if (t.includes("border-div-d") && t.some((x) => /^(?:h|min-h)-(?:9|10|11)$/.test(x))) found.push(`${file}: ${l}`);
      }
    }
    expect(found).toEqual([]);
  });
});
