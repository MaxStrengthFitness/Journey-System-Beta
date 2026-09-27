import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * MY STUDIO'S LOOK, HELD (voice review follow-up, Sep 27 2026) — a scan of
 * the stylesheets My Studio draws with, as client-codex/kit/scale.test.ts is
 * for the codex. The rules are CLAUDE.md's and the app's look:
 *
 *   1. No raw hex colour outside a token definition. Colours are the --st-*
 *      tokens (studio-tokens.test.ts holds them to the app's).
 *   2. A name is never cut short: no ellipsis, no line clamp, no one-line
 *      cut-off (nowrap with hidden overflow) on the classes that carry a
 *      person's, a client's, a machine's or a task's name.
 *   3. The listed controls are at least 40px tall.
 *   4. Slanted capitals are the display face's alone (a page, a masthead or
 *      a dialog title); a card or section head is small upright capitals.
 *   5. Text sizes are counted against the 11 / 12 / 14 / 17 / 30 scale, and
 *      the count only goes down.
 *
 * If one of these fails, the fix is the stylesheet, not the test.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/**
 * My Studio's stylesheets: the six the shell loads (MyStudioView), then the
 * ones its sections and Relay's tabs bring. Four are also drawn elsewhere,
 * on purpose, with the same tokens: relay-strip.css and reminders.css on the
 * Calendar, note-body.css on the client profile's Goals & Focus, and
 * standing-week.css on My Profile.
 */
const FILES = [
  "features/studio-tasks/studio-tasks.css",
  "features/studio-tasks/studio-hub.css",
  "features/relay/kit.css",
  "features/relay/planner.css",
  "features/relay/board/relay.css",
  "features/my-studio/my-studio.css",
  "features/relay/team/team.css",
  "features/relay/jobs/jobs.css",
  "features/relay/notes/notes.css",
  "features/relay/notes/note-body.css",
  "features/relay/board/relay-strip.css",
  "features/relay/reminders/reminders.css",
  // The standing weeks on Team (and the same card on My Profile): drawn in
  // equipment.tokens.css's --eq-* colours, so the --st-* rule below has
  // nothing to say about it; the scale and the heading style do.
  "features/standing-week/standing-week.css",
  // Openings (Openings round, Sep 27 2026): the usual week's grid, the next
  // 7 days, the offers and who's usually in.
  "features/openings/openings.css",
] as const;

/**
 * notes.css is on the codex's list too (HOSTED_FILES in
 * client-codex/kit/scale.test.ts, because the codex mounts its jot rules),
 * so its sizes are counted there and not a second time here.
 */
const SIZES_COUNTED_ELSEWHERE = new Set<string>(["features/relay/notes/notes.css"]);

/**
 * Rules in these files that are not My Studio's: the machine upkeep card
 * (.stu) is drawn on a machine's Catalog page and has its own owner. Its
 * one #fff (the ticked box's mark) is theirs to move to --st-done-on.
 */
const NOT_MY_STUDIOS = /^\.stu(?:__|\b)/;

type Rule = { file: string; selectors: string[]; body: string };

function rulesOf(file: string): Rule[] {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)/.test(prelude)) continue;
    out.push({ file, selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

const RULES = FILES.flatMap(rulesOf);

/** The last compound of a selector: the element the rule styles. */
const subject = (selector: string) => selector.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
const names = (compound: string, cls: string) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound);
/** Rules whose subject is `cls` itself (not a pseudo-element drawn inside it). */
const rulesFor = (cls: string) =>
  RULES.filter((r) => r.selectors.some((s) => names(subject(s), cls) && !subject(s).includes("::")));

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/* ------------------------------------------------------------------ */

describe("My Studio's colours", () => {
  it("write no hex value outside a token definition", () => {
    const found: string[] = [];
    for (const rule of RULES) {
      if (rule.selectors.every((s) => NOT_MY_STUDIOS.test(s))) continue;
      for (const decl of rule.body.split(";")) {
        const [prop, ...rest] = decl.split(":");
        if (!prop || rest.length === 0 || prop.trim().startsWith("--")) continue;
        const value = rest.join(":");
        if (/#[0-9a-f]{3,8}\b/i.test(value) || /(?:^|\s)(?:white|black)(?:\s|$)/i.test(value)) {
          found.push(`${rule.file}: ${rule.selectors.join(", ")} { ${decl.trim()} }`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("define colour tokens in one place (studio-tasks.css), never a second --st-* set", () => {
    for (const file of FILES) {
      if (file === "features/studio-tasks/studio-tasks.css") continue;
      expect(read(file).replace(/\/\*[\s\S]*?\*\//g, ""), file).not.toMatch(/--st-[\w-]+\s*:/);
    }
  });
});

/* ------------------------------------------------------------------ */

/** Classes that carry a name. Each must exist, and none may be cut short. */
const NAME_CLASSES = [
  "sh__client-name", // a client, on Relay → Floor's client tasks
  "sh__client-what", // what the client needs, beside the name
  "ini__name", // a trainer, in the initiative roll-up
  "pt__line", // the Now Bar's teammate line: a teammate's name and what they did
  "pt__who",
  "ds__name", // a client on the opened day strip's list
  "stq__reacted", // who replied to an ask
  "tm-card__name", // a person's card on Team
  "tj-card__title", // a team job
  "tj-person__name",
  "tj-part__label",
  "nu__title", // a Next up card
  "sh__group-title", // a machine group or a duty
  "sh__row-name", // a machine in the group
  "sh__entry-title", // a playbook entry
  "stq__item-title", // an ask
  "stm__grid-title", // a standing duty on Team's seven-day grid
  "stm__item-title",
  "tw-item__title", // a standing task in the wizard's list
  "pl__task-title", // a task on Mine
  "fm__name", // a machine on the Floor Map
  "pn__card-title", // a note
  "tc__loop-title", // an open loop
  "vault__title",
  "rk-title", // a dialog's title (a job's own name, in the job sheet)
  "op__line", // Openings: whose week isn't agreed yet, by name
  "op-sheet__line", // a time's sheet: who is usually in, by name
] as const;

describe("names in My Studio", () => {
  it("are all real classes", () => {
    for (const cls of NAME_CLASSES) expect(rulesFor(cls).length, cls).toBeGreaterThan(0);
  });

  it("are never cut short", () => {
    for (const cls of NAME_CLASSES) {
      const bodies = rulesFor(cls).map((r) => r.body).join(";");
      expect(declared(bodies, "text-overflow").filter((v) => /ellipsis/.test(v)), `${cls}: ellipsis`).toEqual([]);
      expect(declared(bodies, "-webkit-line-clamp"), `${cls}: line clamp`).toEqual([]);
      const nowrap = declared(bodies, "white-space").some((v) => /nowrap/.test(v));
      const hidden = declared(bodies, "overflow(?:-x)?").some((v) => /hidden|clip/.test(v));
      expect(nowrap && hidden, `${cls}: one line, clipped`).toBe(false);
    }
  });
});

/**
 * Machines' floor list (admin/machines/StudioInventoryManager, drawn on My
 * Studio → Machines, Operations → Floor and the Admins dashboard) and every
 * Operations list row (.adm-row__name in the admin kit). Until Sep 27 2026
 * the floor list cut a machine's name and its movement line with
 * `truncate`, and every Operations row cut its name with an ellipsis.
 */
describe("names on Machines and the Operations lists", () => {
  it("are never cut short on the floor list", () => {
    const src = read("features/admin/machines/StudioInventoryManager.tsx");
    expect(src).not.toMatch(/\btruncate\b/);
    expect(src).not.toMatch(/line-clamp/);
  });

  it("wrap in an Operations row", () => {
    const css = read("features/admin/admin.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === ".adm-row__name");
    expect(rule).toBeDefined();
    const body = rule![2];
    expect(body).not.toMatch(/ellipsis/);
    expect(body).not.toMatch(/nowrap/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

/* ------------------------------------------------------------------ */

/** Controls held at the 40px floor. The first sixteen were 26 to 36px until Sep 27 2026. */
const TAP_CLASSES = [
  "sh__claim",
  "sh__assign",
  "sh__markall",
  "sh__confirm",
  "sh__mine",
  "sh__row-flag",
  "sh__search-clear",
  "stq__new",
  "stq__kind",
  "stq__act",
  "stq__react",
  "stm__preset",
  "nu__more",
  "pt__kudos",
  "ne__suggest-use",
  "rls__chip",
  "sh__chip",
  "stq__post",
  "st__btn",
  "st__row-action",
  "pl__btn",
  "pl__tab",
  "pl__check",
  "rk-chip",
  "rk-toggle",
  "tj-open",
  "tj-done__toggle",
  "nu__do",
  "cp__close",
  "cf",
  "rs__item",
  "nb-tool",
  "nb__check",
  "pn__text-btn",
  "ms__waiting-go",
  "op-cell", // a time of Openings' usual week
  "op-chip", // Openings' day picker and whose times
] as const;

const px =(v: string) => (/^\d+(?:\.\d+)?px$/.test(v.trim()) ? parseFloat(v) : null);

describe("the Now Bar", () => {
  it("never hides the teammates line, which holds the only kudos button (it was hidden in portrait until Sep 27 2026)", () => {
    for (const r of rulesFor("rnb__pulse")) {
      expect(declared(r.body, "display"), r.selectors.join(", ")).not.toContain("none");
      expect(declared(r.body, "visibility"), r.selectors.join(", ")).not.toContain("hidden");
    }
    for (const r of rulesFor("pt__kudos")) {
      expect(declared(r.body, "display"), r.selectors.join(", ")).not.toContain("none");
    }
  });
});

describe("controls in My Studio", () => {
  it("on Machines' floor list are the Operations kit's 40px buttons, not the 28-32px stock ones", () => {
    const src = read("features/admin/machines/StudioInventoryManager.tsx");
    expect(src).not.toMatch(/from "@\/components\/ui\/button"/);
    expect(src).toMatch(/<AdminButton/);
    // The search box is 40px too (the stock input is 32px).
    expect(src).toMatch(/<Input\s+className="h-10/);
  });

  it("are at least 40px tall, everywhere their size is set", () => {
    for (const cls of TAP_CLASSES) {
      const heights = rulesFor(cls).flatMap((r) => [...declared(r.body, "min-height"), ...declared(r.body, "height")]);
      const sizes = heights.map(px).filter((n): n is number => n !== null);
      expect(sizes.length, `${cls} sets no height`).toBeGreaterThan(0);
      for (const n of sizes) expect(n, `${cls} is ${n}px somewhere`).toBeGreaterThanOrEqual(40);
    }
  });
});

/**
 * The button voice (Sep 27 2026): a button says what it does in 14px bold
 * sentence case, as the codex's .cx-btn does; a chip (a filter, a kind) in
 * 12px bold sentence case, as .cx-chip-btn and the note's kind chips do.
 * These were 11px spaced capitals until then, which made every button on
 * My Studio read as a label.
 */
const BUTTON_CLASSES = [
  "st__btn",
  "stq__new",
  "stq__post",
  "stq__act",
  "stm__preset",
  "sh__claim",
  "sh__assign",
  "sh__markall",
  "sh__confirm",
  "sh__mine",
  "pl__btn",
  "cf",
  "nu__do",
  "tj-open",
  "tj-done__toggle",
  "wl__btn",
] as const;
const CHIP_CLASSES = ["stq__kind", "sh__chip", "rls__chip", "ne__kind", "op-chip"] as const;

/** Every plain `.cls { ... }` rule, media queries included, as one body. */
const definition = (cls: string) => {
  const found = RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === `.${cls}`);
  expect(found.length, `.${cls} is defined`).toBeGreaterThan(0);
  return found.map((r) => r.body).join(";");
};

describe("My Studio's buttons", () => {
  it("speak in the button voice: 14px, bold, sentence case", () => {
    for (const cls of BUTTON_CLASSES) {
      const body = definition(cls);
      expect(declared(body, "font-size"), cls).toEqual(["14px"]);
      expect(declared(body, "font-weight"), cls).toEqual(["700"]);
      expect(declared(body, "text-transform"), cls).toEqual([]);
      expect(declared(body, "letter-spacing"), cls).toEqual([]);
    }
  });

  it("and chips in the chip voice: 12px, bold, sentence case", () => {
    for (const cls of CHIP_CLASSES) {
      const body = definition(cls);
      expect(declared(body, "font-size"), cls).toEqual(["12px"]);
      expect(declared(body, "font-weight"), cls).toEqual(["700"]);
      expect(declared(body, "text-transform"), cls).toEqual([]);
    }
  });

  it("are never restyled back into capitals by a variant or a media query", () => {
    for (const cls of [...BUTTON_CLASSES, ...CHIP_CLASSES]) {
      for (const r of rulesFor(cls)) {
        expect(declared(r.body, "text-transform").filter((v) => v === "uppercase"), r.selectors.join(", ")).toEqual([]);
      }
    }
  });

  it("save in solid blue writing in --st-live-on, and keep the fill under a finger", () => {
    // Green is for marking a task done; a save is blue (THE LOOK, Sep 27 2026).
    const primary = RULES.filter((r) => r.selectors.includes(".st__btn--primary"));
    expect(primary.length).toBe(1);
    expect(primary[0].selectors).toContain(".st__btn--primary:hover");
    expect(declared(primary[0].body, "background")).toEqual(["var(--st-live)"]);
    expect(declared(primary[0].body, "color")).toEqual(["var(--st-live-on)"]);
    const done = RULES.find((r) => r.selectors.includes(".st__btn--done"));
    expect(done?.selectors).toContain(".st__btn--done:hover");
  });
});

describe("what is selected in My Studio", () => {
  it("is blue, never ink (Sep 27 2026: a note's kind and the Calendar's All were ink)", () => {
    const selected = [
      '.ne__kind[aria-pressed="true"]',
      '.rls__chip[aria-pressed="true"]',
      '.stq__kind[aria-pressed="true"]',
      ".sh__chip--on",
      '.sh__mine[aria-pressed="true"]',
      '.op-chip[aria-pressed="true"]',
    ];
    for (const sel of selected) {
      const rule = RULES.find((r) => r.selectors.includes(sel));
      expect(rule, sel).toBeDefined();
      const paint = [...declared(rule!.body, "background"), ...declared(rule!.body, "border-color")];
      expect(paint.some((v) => v.startsWith("var(--st-live")), sel).toBe(true);
      expect(paint.some((v) => /--st-ink/.test(v)), sel).toBe(false);
    }
  });
});

/**
 * Operations → Floor mounts Machines without My Studio's shell, where
 * nothing bounds the frame's height, so the machine's door opened at the top
 * or the foot of a long list, off-screen (voice review follow-up review,
 * Sep 27 2026). There it rides the page's scroller, sticky. Checked on a
 * portrait and a landscape iPad-sized page in headless Chrome when it was
 * made; this holds the rules and the switch that turns them on.
 */
describe("the machine's door on Operations → Floor", () => {
  it("is sticky to the page's scroller, in portrait and in landscape", () => {
    const door = RULES.filter((r) => r.selectors.includes(".ms__frame--hosted > .cp"));
    expect(door.length).toBe(2);
    for (const r of door) {
      expect(declared(r.body, "position")).toEqual(["sticky"]);
      expect(declared(r.body, "max-height")).toEqual(["calc(100dvh - var(--ms-hosted-chrome))"]);
    }
    expect(door.some((r) => declared(r.body, "bottom").includes("0"))).toBe(true);
    expect(door.some((r) => declared(r.body, "top").length === 1)).toBe(true);
  });

  it("is switched on only where there is no Relay shell around Machines", () => {
    const src = read("features/my-studio/MachinesSection.tsx");
    expect(src).toMatch(/className=\{relay \? "pl__frame" : "pl__frame ms__frame--hosted"\}/);
  });
});

/* ------------------------------------------------------------------ */

describe("My Studio's type", () => {
  it("slants capitals only in the display face", () => {
    for (const rule of RULES) {
      const italic = declared(rule.body, "font-style").some((v) => v === "italic");
      const capitals = declared(rule.body, "text-transform").some((v) => v === "uppercase");
      if (!italic || !capitals) continue;
      expect(declared(rule.body, "font-family"), `${rule.file}: ${rule.selectors.join(", ")}`).toContain("var(--font-display)");
    }
  });

  it("titles the masthead in the page-title voice", () => {
    const [title] = rulesFor("pl__title").filter((r) => r.selectors.includes(".pl__title"));
    expect(declared(title.body, "font-family")).toEqual(["var(--font-display)"]);
    expect(declared(title.body, "font-weight")).toEqual(["800"]);
    expect(declared(title.body, "font-style")).toEqual(["italic"]);
    expect(declared(title.body, "text-transform")).toEqual(["uppercase"]);
  });

  it("heads a panel in small upright capitals", () => {
    const [head] = rulesFor("pl__h2");
    expect(declared(head.body, "font-style")).toEqual([]);
    expect(declared(head.body, "text-transform")).toEqual(["uppercase"]);
    expect(px(declared(head.body, "font-size")[0])).toBeLessThanOrEqual(12);
  });

  it("has one heading style for every card and section head (Sep 27 2026)", () => {
    // My Profile's card head (.tp-card__title): 12px, 800, 0.12em, upright capitals.
    for (const cls of ["pl__h2", "pl__list-head", "rl-h__title", "stm__title", "ms__door-h", "stw-team__head", "stw-away__head", "op__h"]) {
      const [head] = rulesFor(cls).filter((r) => r.selectors.includes(`.${cls}`));
      expect(head, cls).toBeDefined();
      expect(declared(head.body, "font-size"), cls).toEqual(["12px"]);
      expect(declared(head.body, "font-weight"), cls).toEqual(["800"]);
      expect(declared(head.body, "letter-spacing"), cls).toEqual(["0.12em"]);
      expect(declared(head.body, "text-transform"), cls).toEqual(["uppercase"]);
      expect(declared(head.body, "font-style"), cls).toEqual([]);
    }
  });

  it("draws Team's cards as header-strip cards: one border, 14px corners, a tinted head (Sep 27 2026)", () => {
    const cards: [card: string, head: string][] = [
      [".tm-card", ".tm-card__head"], // a person's week
      [".tc", ".tc > .rl-h"], // open loops, the vault
      [".stm__panel", ".stm__head"], // the standing duties and their seven days
    ];
    for (const [card, head] of cards) {
      const c = RULES.find((r) => r.selectors.includes(card));
      const h = RULES.find((r) => r.selectors.includes(head));
      expect(c && declared(c.body, "border"), card).toEqual(["1px solid var(--st-border)"]);
      expect(c && declared(c.body, "border-radius"), card).toEqual(["var(--st-radius)"]);
      expect(c && declared(c.body, "overflow"), card).toEqual(["hidden"]);
      expect(h && declared(h.body, "background"), head).toEqual(["var(--st-surface-2)"]);
      expect(h && declared(h.body, "border-bottom"), head).toEqual(["1px solid var(--st-border)"]);
    }
  });

  it("draws Machines' floor list as the Operations kit's rows and badges, not a stock card per machine", () => {
    const src = read("features/admin/machines/StudioInventoryManager.tsx");
    expect(src).not.toMatch(/from "@\/components\/ui\/card"/);
    expect(src).not.toMatch(/from "@\/components\/ui\/badge"/);
    expect(src).toMatch(/className="adm-rows /);
    expect(src).toMatch(/<AdminBadge/);
  });

  it("draws Relay's own tabs as a second, lighter level under My Studio's", () => {
    const row = RULES.find((r) => r.selectors.includes(".pl__subbar .pl__tabs"));
    const tab = RULES.find((r) => r.selectors.includes(".pl__subbar .pl__tab"));
    expect(row && declared(row.body, "background")).toEqual(["transparent"]);
    expect(row && declared(row.body, "border")).toEqual(["0"]);
    expect(tab && declared(tab.body, "text-transform")).toEqual(["none"]);
  });

  it("keeps text on the 11 / 12 / 14 / 17 / 30 scale, within a budget that only goes down", () => {
    const SCALE = new Set([11, 12, 14, 17, 30]);
    const off: string[] = [];
    for (const file of FILES) {
      if (SIZES_COUNTED_ELSEWHERE.has(file)) continue;
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/(?:^|[;{\s])font-size\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim();
        if (v === "inherit" || /^var\(/.test(v)) continue;
        const n = px(v);
        if (n === null || !SCALE.has(n)) off.push(`${file}: font-size ${v}`);
      }
    }
    // Measured Sep 27 2026 when My Studio's type moved onto the scale: 3,
    // all in the Catalog's upkeep card (.stu, not My Studio's). Lower it;
    // never raise it.
    const BUDGET = 3;
    expect(off.length, off.join("\n")).toBeLessThanOrEqual(BUDGET);
  });
});
