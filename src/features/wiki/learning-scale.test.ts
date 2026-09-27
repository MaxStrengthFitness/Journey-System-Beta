import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * LEARNING'S TAPS AND NAMES, ENFORCED (voice review follow-up, Sep 27 2026).
 *
 * CLAUDE.md: nothing tappable under 40px, and names are never truncated. The
 * audit found thirteen controls in Learning under 40px (the breadcrumb, the
 * search button and its clear, "Show more", the related-machine chips, a
 * studio note's Edit, every control on the studio setup card) and a setting's
 * name cut with an ellipsis. This scans the stylesheets themselves, as the
 * codex's scale.test.ts does for the codex:
 *
 *   1. Every control Learning draws is 40px or more in the direction a
 *      finger lands on it (TAPS names each one, by its rule).
 *   2. No other rule that looks like a control sets a size under 40px.
 *   3. Nothing is clipped: no ellipsis, no line clamp, no one-line cut-off.
 *
 * Inline text links inside a sentence (a glossary term, the group note's
 * link) are exempt, as WCAG's target-size rule exempts them.
 *
 * If this fails on a size, the fix is the size, not the list.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, "..", ...p), "utf8");

const SHEETS: Record<string, string> = {
  "wiki/wiki.css": read("wiki", "wiki.css"),
  "learning/learning.css": read("learning", "learning.css"),
  "catalog/catalog.css": read("catalog", "catalog.css"),
  "comments/comments.css": read("comments", "comments.css"),
};

interface Rule {
  sheet: string;
  selectors: string[];
  body: string;
}

/** Every innermost `selector { body }`, comments removed (an @media's rules included). */
function rules(sheet: string, css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    sheet,
    selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean),
    body: m[2],
  }));
}

const ALL = Object.entries(SHEETS).flatMap(([sheet, css]) => rules(sheet, css));

/** A declared size in px: 40px, 2.5rem, var(--wk-tap). Null when it is not a length. */
function px(value: string): number | null {
  const v = value.trim();
  if (v === "var(--wk-tap)") return 44;
  const m = v.match(/^([\d.]+)(px|rem)$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

function declared(body: string, prop: string): number | null {
  const m = body.match(new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`));
  return m ? px(m[1]) : null;
}

/** The rule that DEFINES a control: its selector list names it exactly. */
function ruleFor(selector: string): Rule {
  const found = ALL.find((r) => r.selectors.includes(selector) && /(min-)?height|width/.test(r.body));
  if (!found) throw new Error(`no sized rule for ${selector}`);
  return found;
}

/**
 * Every control Learning draws, and what makes it 40px. `height` means the
 * rule's min-height or height; `square` means width as well (an icon button).
 */
const TAPS: Record<string, "height" | "square"> = {
  ".wk__up": "square",
  ".wk__crumb": "height",
  ".wk__searchbtn": "height",
  ".wk__mast-home": "height",
  ".wk__mast-search": "height",
  ".wk__cat": "height",
  ".wk__row": "height",
  ".wk__fold-summary": "height",
  ".wk__warnings-more": "height",
  ".wk__linkcard": "height",
  ".wk__chip": "height",
  ".wk__seg-btn": "height",
  ".wk__search-clear": "square",
  ".wk__hit": "height",
  ".wk__studio-edit": "height",
  ".wk__addnote": "height",
  ".wk__btn": "height",
  ".lh__search": "height",
  ".lh__more": "height",
  ".lh__status": "height",
  ".lh__tile-head": "height",
  ".lh__machine": "height",
  ".lh__start": "height",
  ".cat__btn": "height",
  ".ssc__value": "height",
  ".ssc__remove": "square",
  ".ssc__addbtn": "square",
  ".ssc__draft": "height",
  ".ssc__save": "height",
  ".cm__link": "height",
  ".cm__pick": "height",
  ".cm__btn": "height",
};

describe("Learning's controls are 40px or more", () => {
  it.each(Object.entries(TAPS))("%s", (selector, shape) => {
    const rule = ruleFor(selector);
    const height = declared(rule.body, "min-height") ?? declared(rule.body, "height");
    expect(height, `${rule.sheet} ${selector} height`).not.toBeNull();
    expect(height!, `${rule.sheet} ${selector} height`).toBeGreaterThanOrEqual(40);
    if (shape === "square") {
      const width = declared(rule.body, "min-width") ?? declared(rule.body, "width");
      expect(width!, `${rule.sheet} ${selector} width`).toBeGreaterThanOrEqual(40);
    }
  });

  it("and no other rule that looks like a control is sized under 40px", () => {
    const CONTROL = /(btn|chip|crumb|-edit\b|-more\b|-clear\b|remove|addbtn|save|tick|search\b|__link\b|pick\b)/;
    const small: string[] = [];
    for (const rule of ALL) {
      const controls = rule.selectors.filter((s) => CONTROL.test(s) && !s.includes("::") && !/svg|label|icon/.test(s));
      if (controls.length === 0) continue;
      for (const prop of ["min-height", "height", "width"]) {
        const v = declared(rule.body, prop);
        if (v !== null && v < 40) small.push(`${rule.sheet} ${controls.join(", ")} ${prop} ${v}px`);
      }
    }
    expect(small).toEqual([]);
  });
});

describe("nothing in Learning is cut off", () => {
  it("has no ellipsis, no line clamp and no one-line cut-off", () => {
    const clipped: string[] = [];
    for (const rule of ALL) {
      const where = `${rule.sheet} ${rule.selectors.join(", ")}`;
      if (/text-overflow\s*:\s*ellipsis/.test(rule.body)) clipped.push(`${where}: ellipsis`);
      if (/line-clamp\s*:/.test(rule.body)) clipped.push(`${where}: line-clamp`);
      if (/white-space\s*:\s*nowrap/.test(rule.body) && /overflow(-x)?\s*:\s*hidden/.test(rule.body)) {
        clipped.push(`${where}: nowrap and overflow hidden`);
      }
    }
    expect(clipped).toEqual([]);
  });

  it("lets a setting's name and an upkeep task's name wrap", () => {
    const setting = ALL.find((r) => r.selectors.includes(".ssc__name"));
    expect(setting?.body).toMatch(/overflow-wrap:\s*anywhere/);
    const tasks = readFileSync(join(here, "..", "studio-tasks", "studio-tasks.css"), "utf8");
    const name = tasks.match(/(?:^|\n)\.stu__task-name\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(name).toMatch(/overflow-wrap:\s*anywhere/);
    expect(name).not.toMatch(/ellipsis|nowrap/);
  });

  it("and Settings shows a whole report rather than two lines of it", () => {
    const settings = read("settings", "settings.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(settings).not.toMatch(/line-clamp|text-overflow/);
  });
});
